import { appendFile, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { AgentRuntime } from "../runtime/agent-runtime.ts";
import { createMockAgentRegistry } from "../runtime/agent-registry.ts";
import type { AgentRunResult, ArtifactMap, ExecutionConfig, ExecutionContext } from "../runtime/execution-context.ts";
import { createLLMProvider } from "../llm/provider.ts";
import type { LLMProviderName } from "../llm/types.ts";
import { createInitialPipelineState, type PipelineStage } from "./pipeline.ts";
import { WorkflowStateMachine } from "./state-machine.ts";

const SHANGHAI_TZ = "Asia/Shanghai";

export type WorkflowRunOptions = {
  rootDir: string;
  runDate?: string;
  provider?: LLMProviderName;
};

export type WorkflowRunSummary = {
  run_id: string;
  story_id: string;
  story_dir: string;
  manifest: string;
  final: string | null;
  status: "passed" | "needs_human_review" | "failed";
  final_score: number | null;
  trace: string;
  state: string;
  agent_io_log: string;
};

type TraceEvent = {
  step: string;
  status: "running" | "success" | "rewrite" | "failed";
  timestamp: string;
  input?: unknown;
  output?: unknown;
  failureReason?: string;
};

export class WorkflowEngine {
  private readonly options: WorkflowRunOptions;
  private readonly registry;
  private readonly provider;
  private readonly runtime;

  constructor(options: WorkflowRunOptions) {
    this.options = options;
    this.registry = createMockAgentRegistry();
    this.provider = createLLMProvider(this.options.provider ?? "mock");
    this.runtime = new AgentRuntime(this.provider);
  }

  async run(): Promise<WorkflowRunSummary> {
    const runId = `run_${Date.now()}`;
    const runDate = this.options.runDate ?? todayDate();
    const plan = await this.createTodayPlan(runDate);
    const selected = plan.selected_top_n[0];
    const slug = await uniqueSlug(this.options.rootDir, runDate, selected.slug);
    const storyId = `${runDate}-${slug}`;
    const storyDir = path.join(this.options.rootDir, "stories", runDate, slug);
    await mkdir(storyDir, { recursive: true });

    const artifacts: ArtifactMap = {};
    const config: ExecutionConfig = {
      rootDir: this.options.rootDir,
      storyDir,
      provider: this.options.provider ?? "mock",
      modelByAgent: {
        idea: "mock-idea-model",
        outline: "mock-outline-model",
        writer: "mock-writer-model",
        qa: "mock-qa-model",
        qa_after_rewrite: "mock-qa-model",
        rewrite: "mock-rewrite-model",
      },
      qaThreshold: 85,
      maxRewriteRounds: 3,
    };
    const context: ExecutionContext = {
      storyId,
      input: { ...selected, slug },
      artifacts,
      config,
    };

    const stateMachine = new WorkflowStateMachine(createInitialPipelineState());
    const trace: TraceEvent[] = [];
    const agentIoPath = path.join(storyDir, "agent_io.jsonl");
    const statePath = path.join(storyDir, "pipeline_state.json");
    const manifestPath = path.join(storyDir, "story_manifest.json");
    const tracePath = path.join(storyDir, "execution_trace.json");

    let finalScore: number | null = null;
    let status: WorkflowRunSummary["status"] = "failed";
    let finalPath: string | null = null;
    let rewriteRounds = 0;

    try {
      await this.writeState(statePath, stateMachine.snapshot(), rewriteRounds, "starting");
      const idea = await this.runStage("idea", "idea", context, stateMachine, trace, agentIoPath, statePath, rewriteRounds);
      artifacts.idea = relative(this.options.rootDir, idea.artifactPath);
      context.input.idea = idea.output;

      const outline = await this.runStage("outline", "outline", context, stateMachine, trace, agentIoPath, statePath, rewriteRounds);
      artifacts.outline = relative(this.options.rootDir, outline.artifactPath);
      context.input.outline = outline.output;

      const draft = await this.runStage("writer", "writer", context, stateMachine, trace, agentIoPath, statePath, rewriteRounds);
      artifacts.draft_v1 = relative(this.options.rootDir, draft.artifactPath);
      context.input.currentDraft = artifacts.draft_v1;

      const qa1 = await this.runStage("qa", "qa", context, stateMachine, trace, agentIoPath, statePath, rewriteRounds);
      artifacts.qa_v1 = relative(this.options.rootDir, qa1.artifactPath);
      finalScore = qa1.score ?? null;

      while ((finalScore ?? 0) < config.qaThreshold && rewriteRounds < config.maxRewriteRounds) {
        stateMachine.set("qa", "rewrite");
        rewriteRounds += 1;
        context.input.rewriteRound = rewriteRounds;
        const rewrite = await this.runStage("rewrite", "rewrite", context, stateMachine, trace, agentIoPath, statePath, rewriteRounds);
        if (rewrite.artifactKey && rewrite.artifactPath) {
          artifacts[rewrite.artifactKey] = relative(this.options.rootDir, rewrite.artifactPath);
          context.input.currentDraft = artifacts[rewrite.artifactKey];
        }

        const qaAfterRewrite = await this.runStage("qa", "qa_after_rewrite", context, stateMachine, trace, agentIoPath, statePath, rewriteRounds);
        if (qaAfterRewrite.artifactKey && qaAfterRewrite.artifactPath) {
          artifacts[qaAfterRewrite.artifactKey] = relative(this.options.rootDir, qaAfterRewrite.artifactPath);
        }
        finalScore = qaAfterRewrite.score ?? null;
      }

      if ((finalScore ?? 0) >= config.qaThreshold) {
        stateMachine.set("final", "running");
        const source = path.join(this.options.rootDir, artifacts[`draft_v${rewriteRounds + 1}`] ?? artifacts.draft_v1);
        finalPath = path.join(storyDir, "final.md");
        await copyFile(source, finalPath);
        artifacts.final = relative(this.options.rootDir, finalPath);
        stateMachine.set("final", "success");
        trace.push({
          step: "final",
          status: "success",
          timestamp: nowIso(),
          input: { source: relative(this.options.rootDir, source) },
          output: { artifact: artifacts.final },
        });
        status = "passed";
      } else {
        status = "needs_human_review";
        stateMachine.set("final", "failed");
      }

      await this.writeManifest(manifestPath, storyId, runDate, slug, plan, artifacts, status, finalScore, rewriteRounds);
      await this.writeState(statePath, stateMachine.snapshot(), rewriteRounds, status);
      await writeJson(tracePath, trace);
      await this.appendRunLog(storyId, "workflow", status, relative(this.options.rootDir, manifestPath), finalScore, "WorkflowEngine completed");

      return {
        run_id: runId,
        story_id: storyId,
        story_dir: relative(this.options.rootDir, storyDir),
        manifest: relative(this.options.rootDir, manifestPath),
        final: finalPath ? relative(this.options.rootDir, finalPath) : null,
        status,
        final_score: finalScore,
        trace: relative(this.options.rootDir, tracePath),
        state: relative(this.options.rootDir, statePath),
        agent_io_log: relative(this.options.rootDir, agentIoPath),
      };
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : String(error);
      trace.push({ step: "workflow", status: "failed", timestamp: nowIso(), failureReason });
      await writeJson(tracePath, trace);
      await this.writeState(statePath, stateMachine.snapshot(), rewriteRounds, "failed", failureReason);
      await this.appendRunLog(storyId, "workflow", "failed", relative(this.options.rootDir, tracePath), finalScore, failureReason);
      throw error;
    }
  }

  private async createTodayPlan(runDate: string): Promise<any> {
    const candidate = {
      candidate_id: "real-exec-mock-001",
      working_title: "真实执行架构冒烟测试",
      genre: "execution_architecture_mock",
      slug: "real-exec-smoke-test",
      priority: 1,
      core_conflict: "验证 mock to real 的执行架构是否跑通。",
    };
    const plan = {
      date: runDate,
      status: "top_n_selected",
      target_story_count: 1,
      planned_genres: [{ genre: candidate.genre, count: 1 }],
      avoid_genres: [],
      topic_candidates: [candidate],
      selected_top_n: [candidate],
      reasons: ["Real AI Execution Architecture mock phase validation."],
      updated_at: nowIso(),
    };
    await writeJson(path.join(this.options.rootDir, "planning", "today.json"), plan);
    return plan;
  }

  private async runStage(
    stage: PipelineStage,
    agentName: string,
    context: ExecutionContext,
    stateMachine: WorkflowStateMachine,
    trace: TraceEvent[],
    agentIoPath: string,
    statePath: string,
    rewriteRounds: number,
  ): Promise<AgentRunResult> {
    stateMachine.set(stage, "running");
    await this.writeState(statePath, stateMachine.snapshot(), rewriteRounds, stage);
    trace.push({ step: agentName, status: "running", timestamp: nowIso(), input: snapshot(context.input) });
    try {
      const result = await this.runtime.run(this.registry.get(agentName), context);
      if (!result.artifactPath) throw new Error(`${agentName} did not produce artifactPath`);
      stateMachine.set(stage, result.status === "rewrite" ? "rewrite" : "success");
      trace.push({ step: agentName, status: result.status, timestamp: nowIso(), output: snapshot(result.output) });
      await appendJsonLine(agentIoPath, {
        timestamp: nowIso(),
        story_id: context.storyId,
        agent: agentName,
        input: context.input,
        output: result.output,
        artifact_path: relative(this.options.rootDir, result.artifactPath),
      });
      await this.appendRunLog(
        context.storyId,
        agentName,
        result.status === "failed" ? "failed" : result.status === "rewrite" ? "rewrite" : "pass",
        relative(this.options.rootDir, result.artifactPath),
        result.score,
        "AgentRuntime mock execution",
      );
      await this.writeState(statePath, stateMachine.snapshot(), rewriteRounds, stage);
      return result;
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : String(error);
      stateMachine.set(stage, "failed");
      trace.push({ step: agentName, status: "failed", timestamp: nowIso(), failureReason });
      await this.writeState(statePath, stateMachine.snapshot(), rewriteRounds, "failed", failureReason);
      throw error;
    }
  }

  private async writeManifest(
    manifestPath: string,
    storyId: string,
    runDate: string,
    slug: string,
    plan: any,
    artifacts: ArtifactMap,
    status: WorkflowRunSummary["status"],
    finalScore: number | null,
    rewriteRounds: number,
  ): Promise<void> {
    await writeJson(manifestPath, {
      story_id: storyId,
      date: runDate,
      slug,
      title: "真实执行架构冒烟测试",
      genre: "execution_architecture_mock",
      status,
      current_draft: artifacts.draft_v2 ?? artifacts.draft_v1 ?? "",
      current_qa: artifacts.qa_v2 ?? artifacts.qa_v1 ?? "",
      rewrite_round: rewriteRounds,
      qa_round: artifacts.qa_v2 ? 2 : artifacts.qa_v1 ? 1 : 0,
      final_score: finalScore,
      pass_threshold: 85,
      files: {
        idea: artifacts.idea ?? "",
        outline: artifacts.outline ?? "",
        draft_v1: artifacts.draft_v1 ?? "",
        qa_v1: artifacts.qa_v1 ?? "",
        draft_v2: artifacts.draft_v2 ?? "",
        qa_v2: artifacts.qa_v2 ?? "",
        draft_v3: artifacts.draft_v3 ?? "",
        qa_v3: artifacts.qa_v3 ?? "",
        final: artifacts.final ?? "",
      },
      extra_artifacts: Object.fromEntries(Object.entries(artifacts).filter(([key]) => key.startsWith("draft_v4") || key.startsWith("qa_v4"))),
      planning: {
        today: "planning/today.json",
        candidate_id: plan.selected_top_n[0]?.candidate_id,
      },
      prompt_versions: {
        style: "v1",
        scoring: "v1",
      },
      agent_versions: {
        runtime: "real-exec-mock-v1",
        workflow_engine: "real-exec-mock-v1",
        llm_provider: "mock",
      },
      metrics: {
        total_cost_usd: 0,
      },
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  }

  private async writeState(
    statePath: string,
    state: unknown,
    rewriteRounds: number,
    current: string,
    failureReason?: string,
  ): Promise<void> {
    await writeJson(statePath, {
      current,
      rewrite_rounds: rewriteRounds,
      state,
      failure_reason: failureReason ?? null,
      updated_at: nowIso(),
    });
  }

  private async appendRunLog(
    storyId: string,
    stage: string,
    status: string,
    artifactPath: string,
    score?: number | null,
    notes?: string,
  ): Promise<void> {
    await appendJsonLine(path.join(this.options.rootDir, "metrics", "runs.jsonl"), {
      story_id: storyId,
      stage,
      agent_name: stage === "workflow" ? "workflow-engine.ts" : `${stage}.agent`,
      model: "mock",
      prompt_path: null,
      prompt_version: null,
      input_tokens: 0,
      output_tokens: 0,
      duration_seconds: 0,
      cost_usd: 0,
      timestamp: nowIso(),
      status,
      artifact_path: artifactPath,
      final_score: score ?? null,
      notes,
    });
  }
}

async function uniqueSlug(rootDir: string, runDate: string, baseSlug: string): Promise<string> {
  const dayDir = path.join(rootDir, "stories", runDate);
  for (let index = 1; index < 100; index += 1) {
    const slug = index === 1 ? baseSlug : `${baseSlug}-${index}`;
    if (!existsSync(path.join(dayDir, slug))) return slug;
  }
  throw new Error("Unable to allocate unique story slug");
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function appendJsonLine(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function relative(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath).replaceAll("\\", "/");
}

function nowIso(): string {
  return new Date().toISOString();
}

function todayDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}`;
}

function snapshot(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Agent } from "./agent-runtime.ts";
import type { AgentRunResult, ExecutionContext } from "./execution-context.ts";
import type { LLMProvider } from "../llm/types.ts";

type JsonValue = Record<string, unknown>;
type FileNameFactory = string | ((context: ExecutionContext) => string);

export class AgentRegistry {
  private readonly agents = new Map<string, Agent>();

  register(agent: Agent): void {
    this.agents.set(agent.name, agent);
  }

  get(name: string): Agent {
    const agent = this.agents.get(name);
    if (!agent) {
      throw new Error(`Agent not registered: ${name}`);
    }
    return agent;
  }
}

export function createMockAgentRegistry(): AgentRegistry {
  const registry = new AgentRegistry();
  registry.register(createJsonAgent("idea", "idea.json", ideaOutput));
  registry.register(createJsonAgent("outline", "outline.json", outlineOutput));
  registry.register(createMarkdownAgent("writer", "draft_v1.md", draftV1Output));
  registry.register(createJsonAgent("qa", "qa_v1.json", qaOutput));
  registry.register(createMarkdownAgent("rewrite", rewriteDraftName, draftV2Output));
  registry.register(createJsonAgent("qa_after_rewrite", rewriteQaName, qaAfterRewriteOutput));
  return registry;
}

function createJsonAgent(
  name: string,
  fileName: FileNameFactory,
  buildOutput: (context: ExecutionContext) => JsonValue,
): Agent {
  return {
    name,
    async run(context: ExecutionContext, provider: LLMProvider): Promise<AgentRunResult> {
      const llm = await provider.generate({
        model: context.config.modelByAgent[name] ?? "mock-model",
        messages: [
          { role: "system", content: `Run ${name} agent in mock mode.` },
          { role: "user", content: JSON.stringify(context.input) },
        ],
        temperature: 0,
        metadata: { agent: name, storyId: context.storyId },
      });
      const output = buildOutput(context);
      const resolvedFileName = resolveFileName(fileName, context);
      const artifactPath = path.join(context.config.storyDir, resolvedFileName);
      await writeJson(artifactPath, output);
      return {
        agentName: name,
        status: output.status === "REWRITE" ? "rewrite" : "success",
        output,
        artifactKey: artifactKeyFor(name, resolvedFileName),
        artifactPath,
        score: extractScore(output),
        usage: llm.usage,
      };
    },
  };
}

function createMarkdownAgent(
  name: string,
  fileName: FileNameFactory,
  buildOutput: (_context: ExecutionContext) => string,
): Agent {
  return {
    name,
    async run(context: ExecutionContext, provider: LLMProvider): Promise<AgentRunResult> {
      const llm = await provider.generate({
        model: context.config.modelByAgent[name] ?? "mock-model",
        messages: [
          { role: "system", content: `Run ${name} agent in mock mode.` },
          { role: "user", content: JSON.stringify(context.input) },
        ],
        temperature: 0,
        metadata: { agent: name, storyId: context.storyId },
      });
      const output = buildOutput(context);
      const resolvedFileName = resolveFileName(fileName, context);
      const artifactPath = path.join(context.config.storyDir, resolvedFileName);
      await mkdir(path.dirname(artifactPath), { recursive: true });
      await writeFile(artifactPath, output, "utf8");
      return {
        agentName: name,
        status: "success",
        output,
        artifactKey: artifactKeyFor(name, resolvedFileName),
        artifactPath,
        usage: llm.usage,
      };
    },
  };
}

function resolveFileName(fileName: FileNameFactory, context: ExecutionContext): string {
  return typeof fileName === "function" ? fileName(context) : fileName;
}

function artifactKeyFor(name: string, fileName: string): string {
  if (name === "writer") return "draft_v1";
  if (fileName.endsWith(".json")) return fileName.replace(".json", "");
  if (fileName.endsWith(".md")) return fileName.replace(".md", "");
  return name;
}

function rewriteDraftName(context: ExecutionContext): string {
  const rewriteRound = Number(context.input.rewriteRound ?? 1);
  return `draft_v${rewriteRound + 1}.md`;
}

function rewriteQaName(context: ExecutionContext): string {
  const rewriteRound = Number(context.input.rewriteRound ?? 1);
  return `qa_v${rewriteRound + 1}.json`;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function ideaOutput(context: ExecutionContext): JsonValue {
  const slug = String(context.input.slug);
  return {
    title: "真实执行架构冒烟测试",
    genre: "execution_architecture_mock",
    one_sentence_hook: "一个 mock 选题验证 Story Manager、Workflow Engine、Agent Runtime 与 LLM Provider 的分层协作。",
    core_conflict: "系统必须在不调用真实模型的前提下跑通真实执行架构。",
    protagonist: "Story Forge Workflow Engine",
    obstacle_or_antagonist: "尚未接入真实模型的执行层",
    twist_direction: "QA 首轮低于阈值，Rewrite 后通过。",
    viral_score: 80,
    slug,
  };
}

function outlineOutput(_context: ExecutionContext): JsonValue {
  return {
    target_total_words: 300,
    chapter_count: 2,
    chapters: [
      {
        chapter_number: 1,
        target_words: 150,
        core_event: "Workflow Engine 创建 ExecutionContext 并调用 Agent Runtime。",
        conflict: "每个 agent 必须只通过 runtime 连接 LLM Provider。",
        ending_hook: "QA 返回 82 分，触发 Rewrite。",
      },
      {
        chapter_number: 2,
        target_words: 150,
        core_event: "Rewrite 后 QA 返回 90 分。",
        conflict: "系统必须写入 trace、manifest 和 runs log。",
        ending_hook: "final.md 由通过 QA 的 draft 产生。",
      },
    ],
    final_ending: "Real AI Execution Architecture 的 mock phase 跑通。",
  };
}

function draftV1Output(_context: ExecutionContext): string {
  return "# Mock Draft v1\n\nThis draft is generated by Agent Runtime through the mock LLM Provider.\n\nNo real AI API was called.\n";
}

function draftV2Output(_context: ExecutionContext): string {
  return "# Mock Draft v2\n\nThis rewrite is generated after QA returned a score below 85.\n\nNo real AI API was called.\n";
}

function qaOutput(context: ExecutionContext): JsonValue {
  return qaPayload(context.storyId, 1, "draft_v1.md", 82, "REWRITE");
}

function qaAfterRewriteOutput(context: ExecutionContext): JsonValue {
  const rewriteRound = Number(context.input.rewriteRound ?? 1);
  return qaPayload(context.storyId, rewriteRound + 1, `draft_v${rewriteRound + 1}.md`, 90, "PASS");
}

function qaPayload(storyId: string, cycle: number, fileName: string, total: number, status: "PASS" | "REWRITE"): JsonValue {
  return {
    story_id: storyId,
    evaluation_cycle: cycle,
    evaluated_file: fileName,
    simulation_note: "Mock QA via Real AI Execution Architecture. No external API was called.",
    final_scores: {
      opening_hook: status === "PASS" ? 18 : 16,
      conflict_strength: status === "PASS" ? 14 : 13,
      pacing: status === "PASS" ? 14 : 13,
      twist: status === "PASS" ? 9 : 8,
      emotional_payoff: status === "PASS" ? 14 : 12,
      ending: status === "PASS" ? 14 : 12,
      character_consistency: status === "PASS" ? 7 : 8,
      total,
    },
    status,
    rewrite_targets:
      status === "PASS"
        ? []
        : [
            {
              dimension: "execution_architecture",
              deduction_reason: "Mock QA intentionally returns below threshold on the first pass.",
              required_local_fix: "Run Rewrite through Agent Runtime.",
            },
          ],
  };
}

function extractScore(output: JsonValue): number | undefined {
  const finalScores = output.final_scores as { total?: number } | undefined;
  return finalScores?.total;
}

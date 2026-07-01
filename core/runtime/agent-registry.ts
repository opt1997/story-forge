import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Agent } from "./agent-runtime.ts";
import type { AgentRunResult, ExecutionContext } from "./execution-context.ts";
import type { LLMProvider, LLMProviderName } from "../llm/types.ts";

type JsonValue = Record<string, unknown>;
type FileNameFactory = string | ((context: ExecutionContext) => string);
type JsonNormalizer = (output: JsonValue, context: ExecutionContext) => JsonValue;
type PromptBuilder = (context: ExecutionContext) => Promise<string> | string;

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

export function createAgentRegistry(providerName: LLMProviderName): AgentRegistry {
  return providerName === "mock" ? createMockAgentRegistry() : createRealAgentRegistry();
}

function createRealAgentRegistry(): AgentRegistry {
  const registry = new AgentRegistry();
  registry.register(
    createRealJsonAgent("idea", "idea.json", realIdeaSystem(), realIdeaPrompt, normalizeIdeaOutput, 0.8),
  );
  registry.register(
    createRealJsonAgent("outline", "outline.json", realOutlineSystem(), realOutlinePrompt, normalizeOutlineOutput, 0.5),
  );
  registry.register(createRealMarkdownAgent("writer", "draft_v1.md", realWriterSystem(), realWriterPrompt, 0.8));
  registry.register(createRealJsonAgent("qa", "qa_v1.json", realQaSystem(), realQaPrompt, normalizeQaOutput, 0.2));
  registry.register(createRealMarkdownAgent("rewrite", rewriteDraftName, realRewriteSystem(), realRewritePrompt, 0.7));
  registry.register(
    createRealJsonAgent("qa_after_rewrite", rewriteQaName, realQaSystem(), realQaPrompt, normalizeQaOutput, 0.2),
  );
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

function createRealJsonAgent(
  name: string,
  fileName: FileNameFactory,
  systemPrompt: string,
  buildPrompt: PromptBuilder,
  normalize: JsonNormalizer,
  temperature: number,
): Agent {
  return {
    name,
    async run(context: ExecutionContext, provider: LLMProvider): Promise<AgentRunResult> {
      const llm = await provider.generate({
        model: modelFor(context, name),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: await buildPrompt(context) },
        ],
        temperature,
        metadata: { agent: name, storyId: context.storyId, mode: "real" },
      });
      const output = normalize(parseJsonContent(llm.content, name), context);
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

function createRealMarkdownAgent(
  name: string,
  fileName: FileNameFactory,
  systemPrompt: string,
  buildPrompt: PromptBuilder,
  temperature: number,
): Agent {
  return {
    name,
    async run(context: ExecutionContext, provider: LLMProvider): Promise<AgentRunResult> {
      const llm = await provider.generate({
        model: modelFor(context, name),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: await buildPrompt(context) },
        ],
        temperature,
        metadata: { agent: name, storyId: context.storyId, mode: "real" },
      });
      const output = stripMarkdownFence(llm.content).trim() + "\n";
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

function modelFor(context: ExecutionContext, agentName: string): string {
  return context.config.modelByAgent[agentName] ?? context.config.modelByAgent.default ?? "gpt-5.5";
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

function parseJsonContent(content: string, agentName: string): JsonValue {
  const stripped = stripMarkdownFence(content).trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  const jsonText = start >= 0 && end > start ? stripped.slice(start, end + 1) : stripped;
  try {
    const parsed = JSON.parse(jsonText);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    throw new Error(`${agentName} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  throw new Error(`${agentName} returned JSON that is not an object.`);
}

function stripMarkdownFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json|markdown|md)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

async function readArtifact(context: ExecutionContext, relativePath: unknown): Promise<string> {
  const value = String(relativePath ?? "");
  if (!value) return "";
  const filePath = path.isAbsolute(value) ? value : path.join(context.config.rootDir, value);
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function realIdeaSystem(): string {
  return [
    "You are the Story Forge Idea Agent.",
    "Return only valid JSON. Do not wrap JSON in markdown.",
    "Create one high-potential Chinese web fiction idea from the provided Story Manager plan candidate.",
  ].join("\n");
}

function realOutlineSystem(): string {
  return [
    "You are the Story Forge Outline Agent.",
    "Return only valid JSON. Do not wrap JSON in markdown.",
    "Build a compact story outline from the approved idea.",
  ].join("\n");
}

function realWriterSystem(): string {
  return [
    "You are the Story Forge Writer Agent.",
    "Write the draft in Chinese markdown.",
    "Return markdown content only. Do not include analysis or code fences.",
  ].join("\n");
}

function realQaSystem(): string {
  return [
    "You are the Story Forge QA Agent.",
    "Return only valid JSON. Do not wrap JSON in markdown.",
    "Evaluate the draft strictly. Use status PASS when total score is at least the pass threshold, otherwise REWRITE.",
  ].join("\n");
}

function realRewriteSystem(): string {
  return [
    "You are the Story Forge Rewrite Agent.",
    "Rewrite the draft in Chinese markdown according to QA targets.",
    "Return the improved markdown draft only. Do not include analysis or code fences.",
  ].join("\n");
}

function realIdeaPrompt(context: ExecutionContext): string {
  return JSON.stringify(
    {
      story_id: context.storyId,
      candidate: context.input,
      required_json_fields: [
        "title",
        "genre",
        "one_sentence_hook",
        "core_conflict",
        "protagonist",
        "obstacle_or_antagonist",
        "twist_direction",
        "viral_score",
        "slug",
      ],
    },
    null,
    2,
  );
}

function realOutlinePrompt(context: ExecutionContext): string {
  return JSON.stringify(
    {
      story_id: context.storyId,
      idea: context.input.idea,
      required_json_shape: {
        target_total_words: "number",
        chapter_count: "number",
        chapters: [
          {
            chapter_number: "number",
            target_words: "number",
            core_event: "string",
            conflict: "string",
            ending_hook: "string",
          },
        ],
        final_ending: "string",
      },
    },
    null,
    2,
  );
}

function realWriterPrompt(context: ExecutionContext): string {
  return JSON.stringify(
    {
      story_id: context.storyId,
      idea: context.input.idea,
      outline: context.input.outline,
      length_guidance: "Write a complete but concise first draft for workflow validation.",
    },
    null,
    2,
  );
}

async function realQaPrompt(context: ExecutionContext): Promise<string> {
  const draftText = await readArtifact(context, context.input.currentDraft);
  return JSON.stringify(
    {
      story_id: context.storyId,
      pass_threshold: context.config.qaThreshold,
      evaluated_file: context.input.currentDraft,
      draft_text: draftText,
      required_json_shape: {
        story_id: "string",
        evaluation_cycle: "number",
        evaluated_file: "string",
        final_scores: {
          opening_hook: "number",
          conflict_strength: "number",
          pacing: "number",
          twist: "number",
          emotional_payoff: "number",
          ending: "number",
          character_consistency: "number",
          total: "number",
        },
        status: "PASS or REWRITE",
        rewrite_targets: [
          {
            dimension: "string",
            deduction_reason: "string",
            required_local_fix: "string",
          },
        ],
      },
    },
    null,
    2,
  );
}

async function realRewritePrompt(context: ExecutionContext): Promise<string> {
  const draftText = await readArtifact(context, context.input.currentDraft);
  return JSON.stringify(
    {
      story_id: context.storyId,
      rewrite_round: context.input.rewriteRound,
      current_draft_file: context.input.currentDraft,
      current_qa: context.input.qa,
      draft_text: draftText,
      requirement: "Improve only the story draft. Preserve markdown format and produce a complete revised draft.",
    },
    null,
    2,
  );
}

function normalizeIdeaOutput(output: JsonValue, context: ExecutionContext): JsonValue {
  return {
    title: stringValue(output.title, "Untitled Story"),
    genre: stringValue(output.genre, context.input.genre ?? "general"),
    one_sentence_hook: stringValue(output.one_sentence_hook, output.hook ?? ""),
    core_conflict: stringValue(output.core_conflict, context.input.core_conflict ?? ""),
    protagonist: stringValue(output.protagonist, ""),
    obstacle_or_antagonist: stringValue(output.obstacle_or_antagonist, output.antagonist ?? ""),
    twist_direction: stringValue(output.twist_direction, output.twist ?? ""),
    viral_score: numberValue(output.viral_score, output.score, 0),
    slug: stringValue(output.slug, context.input.slug ?? "story"),
  };
}

function normalizeOutlineOutput(output: JsonValue, _context: ExecutionContext): JsonValue {
  return {
    target_total_words: numberValue(output.target_total_words, 300),
    chapter_count: numberValue(output.chapter_count, Array.isArray(output.chapters) ? output.chapters.length : 0),
    chapters: Array.isArray(output.chapters) ? output.chapters : [],
    final_ending: stringValue(output.final_ending, ""),
  };
}

function normalizeQaOutput(output: JsonValue, context: ExecutionContext): JsonValue {
  const finalScores = output.final_scores && typeof output.final_scores === "object" ? (output.final_scores as JsonValue) : {};
  const total = numberValue(finalScores.total, output.total, output.score, 0);
  const status = output.status === "PASS" || output.status === "REWRITE"
    ? output.status
    : total >= context.config.qaThreshold
      ? "PASS"
      : "REWRITE";
  return {
    ...output,
    story_id: stringValue(output.story_id, context.storyId),
    evaluation_cycle: numberValue(output.evaluation_cycle, Number(context.input.rewriteRound ?? 0) + 1),
    evaluated_file: stringValue(output.evaluated_file, path.basename(String(context.input.currentDraft ?? ""))),
    final_scores: {
      opening_hook: numberValue(finalScores.opening_hook, 0),
      conflict_strength: numberValue(finalScores.conflict_strength, 0),
      pacing: numberValue(finalScores.pacing, 0),
      twist: numberValue(finalScores.twist, 0),
      emotional_payoff: numberValue(finalScores.emotional_payoff, 0),
      ending: numberValue(finalScores.ending, 0),
      character_consistency: numberValue(finalScores.character_consistency, 0),
      total,
    },
    status,
    rewrite_targets: Array.isArray(output.rewrite_targets) ? output.rewrite_targets : [],
  };
}

function stringValue(value: unknown, fallback: unknown): string {
  const selected = value ?? fallback;
  return selected === undefined || selected === null ? "" : String(selected);
}

function numberValue(...values: unknown[]): number {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
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

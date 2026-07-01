export const PIPELINE_STAGES = ["idea", "outline", "writer", "qa", "rewrite", "final"] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type PipelineStepStatus = "pending" | "running" | "success" | "rewrite" | "failed";

export type PipelineState = Record<PipelineStage, PipelineStepStatus>;

export function createInitialPipelineState(): PipelineState {
  return {
    idea: "pending",
    outline: "pending",
    writer: "pending",
    qa: "pending",
    rewrite: "pending",
    final: "pending",
  };
}

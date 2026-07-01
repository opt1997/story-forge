import type { PipelineStage, PipelineState, PipelineStepStatus } from "./pipeline.ts";

export class WorkflowStateMachine {
  private readonly state: PipelineState;

  constructor(state: PipelineState) {
    this.state = state;
  }

  set(stage: PipelineStage, status: PipelineStepStatus): PipelineState {
    this.state[stage] = status;
    return this.snapshot();
  }

  snapshot(): PipelineState {
    return { ...this.state };
  }
}

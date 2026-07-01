import type { LLMProvider } from "../llm/types.ts";
import type { AgentRunResult, ExecutionContext } from "./execution-context.ts";

export type Agent = {
  name: string;
  run(context: ExecutionContext, provider: LLMProvider): Promise<AgentRunResult>;
};

export class AgentRuntime {
  private readonly provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  async run(agent: Agent, context: ExecutionContext): Promise<AgentRunResult> {
    const result = await agent.run(context, this.provider);
    return {
      ...result,
      agentName: agent.name,
    };
  }
}

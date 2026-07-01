import type { LLMGenerateInput, LLMProvider, LLMResponse } from "./types.ts";

export class ClaudeProvider implements LLMProvider {
  name = "claude" as const;

  async generate(_input: LLMGenerateInput): Promise<LLMResponse> {
    throw new Error("ClaudeProvider is not enabled in this phase. Use provider=mock.");
  }
}

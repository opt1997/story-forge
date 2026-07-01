import type { LLMGenerateInput, LLMProvider, LLMResponse } from "./types.ts";

export class OpenAIProvider implements LLMProvider {
  name = "openai" as const;

  async generate(_input: LLMGenerateInput): Promise<LLMResponse> {
    throw new Error("OpenAIProvider is not enabled in this phase. Use provider=mock.");
  }
}

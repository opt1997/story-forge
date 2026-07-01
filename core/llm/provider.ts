import type { LLMGenerateInput, LLMProvider, LLMProviderName, LLMResponse } from "./types.ts";
import { ClaudeProvider } from "./claude.ts";
import { OpenAIProvider } from "./openai.ts";

export class MockLLMProvider implements LLMProvider {
  name: LLMProviderName = "mock";

  async generate(input: LLMGenerateInput): Promise<LLMResponse> {
    const agent = String(input.metadata?.agent ?? "unknown");
    const content = JSON.stringify({
      provider: "mock",
      agent,
      message: "M4 mock LLM response. No external API was called.",
    });

    return {
      model: input.model,
      content,
      usage: {
        inputTokens: estimateTokens(input.messages.map((message) => message.content).join("\n")),
        outputTokens: estimateTokens(content),
      },
      raw: {
        metadata: input.metadata,
      },
    };
  }
}

export function createLLMProvider(name: LLMProviderName = "mock"): LLMProvider {
  if (name === "openai") return new OpenAIProvider();
  if (name === "claude") return new ClaudeProvider();
  return new MockLLMProvider();
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

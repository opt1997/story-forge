export type LLMMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LLMGenerateInput = {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  metadata?: Record<string, unknown>;
};

export type LLMResponse = {
  model: string;
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  raw?: unknown;
};

export type LLMProviderName = "mock" | "openai" | "deepseek" | "claude";

export interface LLMProvider {
  name: LLMProviderName;
  generate(input: LLMGenerateInput): Promise<LLMResponse>;
}

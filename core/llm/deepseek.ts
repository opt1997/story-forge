import type { LLMGenerateInput, LLMProvider, LLMResponse } from "./types.ts";

export class DeepSeekProvider implements LLMProvider {
  name = "deepseek" as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY ?? "";
    this.baseUrl = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, "");

    if (!this.apiKey) {
      throw new Error("DEEPSEEK_API_KEY is required when provider=deepseek.");
    }
  }

  async generate(input: LLMGenerateInput): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: input.model,
      messages: input.messages,
      stream: false,
    };

    if (typeof input.temperature === "number") {
      body.temperature = input.temperature;
    }

    if (process.env.DEEPSEEK_THINKING_TYPE) {
      body.thinking = { type: process.env.DEEPSEEK_THINKING_TYPE };
    }
    if (process.env.DEEPSEEK_REASONING_EFFORT) {
      body.reasoning_effort = process.env.DEEPSEEK_REASONING_EFFORT;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const payload = await readJson(response);
    if (!response.ok) {
      throw new Error(`DeepSeek Chat API failed (${response.status}): ${extractDeepSeekError(payload)}`);
    }

    const content = String(payload?.choices?.[0]?.message?.content ?? "").trim();
    if (!content) {
      throw new Error("DeepSeek Chat API returned no message content.");
    }

    return {
      model: String(payload.model ?? input.model),
      content,
      usage: {
        inputTokens: tokenCount(payload.usage, "prompt_tokens"),
        outputTokens: tokenCount(payload.usage, "completion_tokens"),
      },
      raw: payload,
    };
  }
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
  }
}

function extractDeepSeekError(payload: any): string {
  return String(payload?.error?.message ?? payload?.message ?? "unknown error");
}

function tokenCount(usage: any, field: string): number {
  const value = usage?.[field] ?? 0;
  return typeof value === "number" ? value : 0;
}

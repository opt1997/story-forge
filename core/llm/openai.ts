import type { LLMGenerateInput, LLMProvider, LLMResponse } from "./types.ts";

export class OpenAIProvider implements LLMProvider {
  name = "openai" as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY ?? "";
    this.baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");

    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is required when provider=openai.");
    }
  }

  async generate(input: LLMGenerateInput): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: input.model,
      input: input.messages.map((message) => ({
        role: message.role === "system" ? "developer" : message.role,
        content: message.content,
      })),
    };

    if (typeof input.temperature === "number") {
      body.temperature = input.temperature;
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${this.apiKey}`,
    };

    if (process.env.OPENAI_ORG_ID) {
      headers["OpenAI-Organization"] = process.env.OPENAI_ORG_ID;
    }
    if (process.env.OPENAI_PROJECT_ID) {
      headers["OpenAI-Project"] = process.env.OPENAI_PROJECT_ID;
    }

    const response = await fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const payload = await readJson(response);
    if (!response.ok) {
      throw new Error(`OpenAI Responses API failed (${response.status}): ${extractOpenAIError(payload)}`);
    }

    const content = extractResponseText(payload);
    if (!content) {
      throw new Error("OpenAI Responses API returned no text content.");
    }

    return {
      model: String(payload.model ?? input.model),
      content,
      usage: {
        inputTokens: tokenCount(payload.usage, "input_tokens", "prompt_tokens"),
        outputTokens: tokenCount(payload.usage, "output_tokens", "completion_tokens"),
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

function extractOpenAIError(payload: any): string {
  return String(payload?.error?.message ?? payload?.message ?? "unknown error");
}

function extractResponseText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text;

  const parts: string[] = [];
  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function tokenCount(usage: any, primary: string, fallback: string): number {
  const value = usage?.[primary] ?? usage?.[fallback] ?? 0;
  return typeof value === "number" ? value : 0;
}

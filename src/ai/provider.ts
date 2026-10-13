import type { ZodType } from "zod";

/**
 * Provider abstraction. Two implementations: an OpenAI-compatible chat
 * completions client (OpenAI, Groq, Together, Ollama, LM Studio, OpenRouter…)
 * and the Anthropic Messages API. Both return parsed JSON validated by the
 * caller's Zod schema. Configuration comes from env or the saved settings.
 *
 *   AI_PROVIDER=openai|anthropic   AI_API_KEY=...   AI_MODEL=...   AI_BASE_URL=... (optional)
 */
export interface AiConfig {
  provider: "openai" | "anthropic";
  apiKey: string;
  model: string;
  baseUrl?: string | null;
}

export class AiError extends Error {
  constructor(
    message: string,
    public code: "not_configured" | "http" | "parse" | "validation" | "network",
  ) {
    super(message);
  }
}

export interface GenerateOptions {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  generateJSON<T>(opts: GenerateOptions, schema: ZodType<T>): Promise<T>;
}

function extractJSON(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        /* fallthrough */
      }
    }
    throw new AiError("Model did not return valid JSON", "parse");
  }
}

function validate<T>(raw: unknown, schema: ZodType<T>): T {
  const r = schema.safeParse(raw);
  if (!r.success) throw new AiError(`AI output failed validation: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, "validation");
  return r.data;
}

class OpenAICompatible implements AiProvider {
  name = "openai";
  constructor(private cfg: AiConfig) {}
  get model() {
    return this.cfg.model;
  }
  async generateJSON<T>(opts: GenerateOptions, schema: ZodType<T>): Promise<T> {
    const base = (this.cfg.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    let res: Response;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.cfg.apiKey}` },
        body: JSON.stringify({
          model: this.cfg.model,
          temperature: opts.temperature ?? 0.6,
          max_tokens: opts.maxTokens ?? 1200,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: opts.system + "\nRespond with a single JSON object and nothing else." },
            { role: "user", content: opts.user },
          ],
        }),
      });
    } catch (e) {
      throw new AiError(`Network error: ${(e as Error).message}`, "network");
    }
    if (!res.ok) throw new AiError(`AI provider returned ${res.status}: ${(await res.text()).slice(0, 200)}`, "http");
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content ?? "";
    return validate(extractJSON(text), schema);
  }
}

class AnthropicProvider implements AiProvider {
  name = "anthropic";
  constructor(private cfg: AiConfig) {}
  get model() {
    return this.cfg.model;
  }
  async generateJSON<T>(opts: GenerateOptions, schema: ZodType<T>): Promise<T> {
    const base = (this.cfg.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
    let res: Response;
    try {
      res = await fetch(`${base}/v1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": this.cfg.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: this.cfg.model,
          max_tokens: opts.maxTokens ?? 1200,
          temperature: opts.temperature ?? 0.6,
          system: opts.system + "\nRespond with a single JSON object and nothing else.",
          messages: [{ role: "user", content: opts.user }],
        }),
      });
    } catch (e) {
      throw new AiError(`Network error: ${(e as Error).message}`, "network");
    }
    if (!res.ok) throw new AiError(`AI provider returned ${res.status}: ${(await res.text()).slice(0, 200)}`, "http");
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = json.content?.find((c) => c.type === "text")?.text ?? "";
    return validate(extractJSON(text), schema);
  }
}

export function createProvider(cfg: AiConfig): AiProvider {
  return cfg.provider === "anthropic" ? new AnthropicProvider(cfg) : new OpenAICompatible(cfg);
}

export const DEFAULT_MODELS: Record<AiConfig["provider"], string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-5-5",
};

/** Used by tests: a provider that returns canned objects. */
export function mockProvider(responses: unknown[]): AiProvider {
  let i = 0;
  return {
    name: "mock",
    model: "mock",
    async generateJSON<T>(_opts: GenerateOptions, schema: ZodType<T>): Promise<T> {
      const raw = responses[Math.min(i++, responses.length - 1)];
      return validate(raw, schema);
    },
  };
}

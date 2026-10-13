import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { integrations } from "@/db/schema";
import { createProvider, DEFAULT_MODELS, type AiConfig, type AiProvider } from "./provider";

/**
 * Resolve AI configuration. Environment variables win; otherwise the key saved
 * from Settings (integrations table, provider = 'ai'). No key → AI disabled and
 * every feature falls back to templates.
 */
export function resolveAiConfig(): AiConfig | null {
  const envProvider = (process.env.AI_PROVIDER || "").toLowerCase();
  const envKey = process.env.AI_API_KEY;
  if (envKey && (envProvider === "openai" || envProvider === "anthropic")) {
    return { provider: envProvider, apiKey: envKey, model: process.env.AI_MODEL || DEFAULT_MODELS[envProvider], baseUrl: process.env.AI_BASE_URL || null };
  }
  const row = getDb().select().from(integrations).where(eq(integrations.provider, "ai")).get();
  if (row?.accessToken && row.enabled) {
    const provider = (row.authType === "anthropic" ? "anthropic" : "openai") as AiConfig["provider"];
    const meta = safeJson(row.lastError); // we reuse lastError column to hold {model, baseUrl} for the AI row
    return { provider, apiKey: row.accessToken, model: meta?.model || process.env.AI_MODEL || DEFAULT_MODELS[provider], baseUrl: meta?.baseUrl || null };
  }
  return null;
}

function safeJson(s: string | null | undefined): { model?: string; baseUrl?: string } | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as { model?: string; baseUrl?: string };
  } catch {
    return null;
  }
}

export function isAiEnabled(): boolean {
  return resolveAiConfig() != null;
}

export function getProvider(): AiProvider | null {
  const cfg = resolveAiConfig();
  return cfg ? createProvider(cfg) : null;
}

export function aiStatus(): { enabled: boolean; provider: string | null; model: string | null; source: "env" | "settings" | null } {
  const envKey = process.env.AI_API_KEY;
  const cfg = resolveAiConfig();
  return { enabled: !!cfg, provider: cfg?.provider ?? null, model: cfg?.model ?? null, source: cfg ? (envKey ? "env" : "settings") : null };
}

export function saveAiSettings(input: { provider: "openai" | "anthropic"; apiKey: string; model?: string | null; baseUrl?: string | null }) {
  const db = getDb();
  const meta = JSON.stringify({ model: input.model || null, baseUrl: input.baseUrl || null });
  db.insert(integrations)
    .values({ provider: "ai", authType: input.provider, accessToken: input.apiKey, enabled: true, lastError: meta, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: integrations.provider, set: { authType: input.provider, accessToken: input.apiKey, enabled: true, lastError: meta, updatedAt: new Date().toISOString() } })
    .run();
}

export function clearAiSettings() {
  getDb().delete(integrations).where(eq(integrations.provider, "ai")).run();
}

"use client";

import { useState, useTransition } from "react";
import { Sparkles, Unplug } from "lucide-react";
import { clearAiSettingsAction, saveAiSettingsAction } from "@/actions/planner";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Button, Card, Segmented, inputClass } from "@/components/ui/primitives";

export interface AiStatusView {
  enabled: boolean;
  provider: string | null;
  model: string | null;
  source: string | null;
}

/** Optional AI provider. The app works fully without it; keys never leave the local database. */
export function AiProviderCard({ ai }: { ai: AiStatusView }) {
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ provider: "openai" as "openai" | "anthropic", apiKey: "", model: "", baseUrl: "" });
  return (
    <Card id="ai" className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles size={15} className="text-gold" />
        <div className="eyebrow">AI provider</div>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${ai.enabled ? "bg-success/15 text-success" : "bg-white/5 text-muted"}`}>{ai.enabled ? `${ai.provider} · ${ai.model}` : "Off"}</span>
      </div>
      <p className="text-xs text-muted">Optional. Personalises plans, estimates and the coach. Keys stay in your local database (or use AI_PROVIDER / AI_API_KEY env vars).</p>
      {ai.enabled ? (
        ai.source === "settings" && (
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { await clearAiSettingsAction(); toast("AI disconnected", "quest"); })}>
            <Unplug size={13} /> Disconnect
          </Button>
        )
      ) : (
        <div className="space-y-2">
          <Segmented
            value={f.provider}
            onChange={(v) => setF({ ...f, provider: v })}
            options={[
              { value: "openai", label: "OpenAI-compatible" },
              { value: "anthropic", label: "Anthropic" },
            ]}
          />
          <input value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} placeholder="API key" className={inputClass} autoComplete="off" aria-label="API key" />
          <div className="grid grid-cols-2 gap-2">
            <input value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} placeholder={f.provider === "anthropic" ? "claude-haiku-5-5" : "gpt-4o-mini"} className={inputClass} aria-label="Model" />
            <input value={f.baseUrl} onChange={(e) => setF({ ...f, baseUrl: e.target.value })} placeholder="Base URL (optional)" className={inputClass} aria-label="Base URL" />
          </div>
          <Button
            disabled={pending || f.apiKey.trim().length < 8}
            onClick={() =>
              start(async () => {
                const r = await saveAiSettingsAction({ provider: f.provider, apiKey: f.apiKey.trim(), model: f.model || null, baseUrl: f.baseUrl || null });
                toast(r.message, r.ok ? "quest" : "error");
                if (r.ok) setF({ ...f, apiKey: "" });
              })
            }
          >
            {pending ? "Testing…" : "Connect & test"}
          </Button>
        </div>
      )}
    </Card>
  );
}

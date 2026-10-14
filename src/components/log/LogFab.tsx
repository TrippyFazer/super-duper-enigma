"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { LogSheet, type LogKind } from "./LogSheet";

/** Routes where the global + LOG must stay out of the way (full-screen workflows). */
const HIDDEN = ["/onboarding", "/offline", "/planner/workout/session", "/login"];

const DEEP: Record<string, LogKind> = { "1": "workout", workout: "workout", food: "food", meal: "food", sleep: "sleep", steps: "steps", finance: "finance", routine: "routine" };

/**
 * One floating gold "+" above the bottom nav on every tab. Not a tab itself.
 * Deep link: any page with ?log=food|workout|sleep|steps|finance|routine.
 */
export function LogFab() {
  const pathname = usePathname() || "/";
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<LogKind | null>(null);

  useEffect(() => {
    const l = params.get("log");
    // The Meals screen owns ?log=1 on its own route (opens its inline food logger).
    if (!l || pathname.startsWith("/planner/meals")) return;
    const k = DEEP[l];
    if (!k) return;
    setInitial(k);
    setOpen(true);
    router.replace(pathname, { scroll: false });
  }, [params, pathname, router]);

  if (HIDDEN.some((p) => pathname.startsWith(p))) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setInitial(null);
          setOpen(true);
        }}
        aria-label="Log"
        title="Log"
        data-testid="log-fab"
        // A gold circle rather than a "+ LOG" pill: still the brightest thing on
        // screen and a 56px target, but it no longer covers row buttons (the
        // Steps row's "Walk it" sat under the pill) or competes with the hero.
        className="press fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-gold-2 to-gold text-[#1a1406] shadow-[0_10px_28px_-8px_rgba(232,196,106,0.75)] ring-1 ring-black/20"
        style={{ bottom: "calc(var(--nav-height) + var(--safe-bottom) + 12px)" }}
      >
        <Plus size={26} strokeWidth={2.6} />
      </button>
      <LogSheet open={open} onClose={() => setOpen(false)} initial={initial} />
    </>
  );
}

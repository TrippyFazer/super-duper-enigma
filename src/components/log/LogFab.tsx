"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { LogSheet, type LogKind } from "./LogSheet";

/** Routes where the global + LOG must stay out of the way (full-screen workflows). */
const HIDDEN = ["/onboarding", "/offline", "/planner/workout/session"];

const DEEP: Record<string, LogKind> = { "1": "workout", workout: "workout", food: "food", meal: "food", sleep: "sleep", steps: "steps", finance: "finance", routine: "routine" };

/**
 * One floating "+ LOG" above the bottom nav on every tab. Not a tab itself.
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
        aria-label="Log something"
        data-testid="log-fab"
        className="press fixed right-4 z-40 flex h-14 items-center gap-1.5 rounded-full bg-gradient-to-b from-gold-2 to-gold pl-4 pr-5 text-[15px] font-semibold text-[#1a1406] shadow-[0_10px_30px_-8px_rgba(232,196,106,0.7)]"
        style={{ bottom: "calc(var(--nav-height) + var(--safe-bottom) + 14px)" }}
      >
        <Plus size={20} strokeWidth={2.6} /> LOG
      </button>
      <LogSheet open={open} onClose={() => setOpen(false)} initial={initial} />
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { updateProfileAction } from "@/actions";
import { Sheet } from "@/components/ui/Sheet";
import { cx } from "@/components/ui/primitives";

export function TitlePicker({ current, titles }: { current: string | null; titles: string[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const choose = (t: string | null) =>
    start(async () => {
      await updateProfileAction({ equippedTitle: t });
      setOpen(false);
    });
  return (
    <>
      <button onClick={() => setOpen(true)} className="press mt-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-medium text-gold">
        {current ? `“${current}”` : "Equip a title"}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Equip a title">
        {titles.length === 0 ? (
          <p className="py-4 text-sm text-muted">No titles yet. Titles come from achievements and boss quests.</p>
        ) : (
          <ul className="space-y-1.5 pb-2">
            <li>
              <button disabled={pending} onClick={() => choose(null)} className={cx("press w-full rounded-xl border px-4 py-3 text-left text-sm", !current ? "border-gold/50 bg-gold/10 text-gold" : "border-border bg-card text-text-2")}>
                No title
              </button>
            </li>
            {titles.map((t) => (
              <li key={t}>
                <button disabled={pending} onClick={() => choose(t)} className={cx("press w-full rounded-xl border px-4 py-3 text-left text-sm", current === t ? "border-gold/50 bg-gold/10 text-gold" : "border-border bg-card text-text")}>
                  “{t}”
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}

"use client";

import { useState } from "react";
import { Compass, Plus } from "lucide-react";
import { FindQuestSheet } from "./FindQuestSheet";
import { CreateQuestSheet } from "./CreateQuestSheet";

/** Two deliberate entry points on the Quest journal. */
export function QuestActions({ ready, reason, aiEnabled, defaultCost }: { ready: boolean; reason: string | null; aiEnabled: boolean; defaultCost: "free" | "under20" | "under50" | "any" }) {
  const [find, setFind] = useState(false);
  const [create, setCreate] = useState(false);
  return (
    <div className="grid grid-cols-2 gap-2">
      <button onClick={() => setFind(true)} data-testid="find-quest" className="press flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-gold-2 to-gold text-sm font-semibold text-[#1a1406]">
        <Compass size={16} /> Find a quest
      </button>
      <button onClick={() => setCreate(true)} data-testid="create-quest" className="press flex h-12 items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/10 text-sm font-semibold text-gold">
        <Plus size={16} /> Create quest
      </button>
      <FindQuestSheet open={find} onClose={() => setFind(false)} ready={ready} reason={reason} defaultCost={defaultCost} />
      <CreateQuestSheet open={create} onClose={() => setCreate(false)} aiEnabled={aiEnabled} />
    </div>
  );
}

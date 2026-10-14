import { redirect } from "next/navigation";
import { getProfile } from "@/services/profile";
import { expiringSoon, listPantry, servingsOnHand } from "@/services/pantry";
import { isAiEnabled } from "@/ai/config";
import { PageHeader } from "@/components/ui/primitives";
import { PantryScreen } from "@/components/food/PantryScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pantry" };

export default function PantryPage() {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  const expiring = new Set(expiringSoon(profile.today, 3).map((p) => p.id));
  const items = listPantry().map((p) => ({ id: p.id, name: p.name, qty: p.qty, unit: p.unit, level: p.level, purchasedAt: p.purchasedAt, expiresAt: p.expiresAt, servings: servingsOnHand(p), expiring: expiring.has(p.id), product: p.product, variant: p.variant }));
  return (
    <div className="page space-y-4">
      <PageHeader title="Pantry" subtitle="What you have. Approximate on purpose — it feeds meal planning, not an audit." back="/planner" />
      <PantryScreen items={items} aiEnabled={isAiEnabled()} />
    </div>
  );
}

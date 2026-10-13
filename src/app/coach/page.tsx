import { redirect } from "next/navigation";
import { getProfile } from "@/services/profile";
import { isAiEnabled } from "@/ai/config";
import { PageHeader } from "@/components/ui/primitives";
import { CoachChat } from "@/components/planner/CoachChat";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coach" };

export default function CoachPage() {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  const ai = isAiEnabled();
  return (
    <div className="page space-y-4">
      <PageHeader title="Coach" subtitle={ai ? "Answers use your real logs, ranks and plans." : "Rule-based coach. Add an AI key in Settings for conversational answers."} back="/planner" />
      <CoachChat name={profile.name} />
    </div>
  );
}

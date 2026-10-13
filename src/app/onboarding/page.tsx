import { redirect } from "next/navigation";
import { getProfile } from "@/services/profile";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create your character" };

export default function OnboardingPage() {
  const profile = getProfile();
  if (profile.onboarded) redirect("/");
  return <OnboardingWizard />;
}

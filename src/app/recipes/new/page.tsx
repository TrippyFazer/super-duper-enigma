import { redirect } from "next/navigation";
import { getProfile } from "@/services/profile";
import { PageHeader } from "@/components/ui/primitives";
import { RecipeForm } from "@/components/recipes/RecipeForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "New recipe" };

export default function NewRecipePage() {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  return (
    <div className="page space-y-4">
      <PageHeader title="Add a recipe" subtitle="Your own dishes count toward your rotation." back="/recipes" />
      <RecipeForm />
    </div>
  );
}

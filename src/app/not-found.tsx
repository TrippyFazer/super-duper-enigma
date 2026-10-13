import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="page flex min-h-dvh flex-col items-center justify-center text-center">
      <Compass size={36} className="text-faint" />
      <h1 className="display mt-4 text-2xl font-semibold">Uncharted</h1>
      <p className="mt-2 max-w-xs text-sm text-muted">That page doesn&apos;t exist on this map.</p>
      <Link href="/" className="press mt-6 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white">
        Back to camp
      </Link>
    </div>
  );
}

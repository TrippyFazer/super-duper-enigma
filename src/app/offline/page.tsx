import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="page flex min-h-dvh flex-col items-center justify-center text-center">
      <WifiOff size={36} className="text-faint" />
      <h1 className="display mt-4 text-2xl font-semibold">You&apos;re offline</h1>
      <p className="mt-2 max-w-xs text-sm text-muted">TFHealth needs a connection to the server to load your character. Reconnect and try again.</p>
      <Link href="/" className="press mt-6 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white">
        Retry
      </Link>
    </div>
  );
}

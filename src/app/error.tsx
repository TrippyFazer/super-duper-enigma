"use client";

import { AlertTriangle } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="page flex min-h-dvh flex-col items-center justify-center text-center">
      <AlertTriangle size={36} className="text-danger" />
      <h1 className="display mt-4 text-2xl font-semibold">Something broke</h1>
      <p className="mt-2 max-w-xs text-sm text-muted">{error.message || "An unexpected error occurred."}</p>
      {error.digest && <p className="mt-1 font-mono text-[10px] text-faint">{error.digest}</p>}
      <button onClick={reset} className="press mt-6 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white">
        Try again
      </button>
    </div>
  );
}

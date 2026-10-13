import { Lock } from "lucide-react";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; wrong?: string }>;
}) {
  const { next = "/", wrong } = await searchParams;
  return (
    <div className="page flex min-h-dvh flex-col items-center justify-center text-center">
      <Lock size={32} className="text-faint" />
      <h1 className="display mt-4 text-2xl font-semibold">TFHealth</h1>
      <p className="mt-2 max-w-xs text-sm text-muted">Enter the password. This phone stays signed in after that.</p>
      <form action="/api/login" method="post" className="mt-6 flex w-full max-w-xs flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          autoFocus
          required
          placeholder="Password"
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base"
        />
        {wrong && <p className="text-sm text-red-400">That isn&apos;t it. Try again.</p>}
        <button type="submit" className="press rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white">
          Sign in
        </button>
      </form>
    </div>
  );
}

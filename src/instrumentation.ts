/** Runs once when the Next.js server starts. */
export async function register() {
  // Node only: the Edge runtime (middleware) has no timers that outlive a request.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    const { startAutoSync } = await import("@/services/autoSync");
    startAutoSync();
  }
}

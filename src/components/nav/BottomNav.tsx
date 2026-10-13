"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Scroll, TrendingUp, CalendarDays, Shield } from "lucide-react";

const TABS = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" || p.startsWith("/domains") },
  { href: "/quests", label: "Quests", icon: Scroll, match: (p: string) => p.startsWith("/quests") },
  { href: "/progress", label: "Progress", icon: TrendingUp, match: (p: string) => p.startsWith("/progress") },
  { href: "/planner", label: "Planner", icon: CalendarDays, match: (p: string) => p.startsWith("/planner") || p.startsWith("/recipes") || p.startsWith("/coach") },
  { href: "/profile", label: "Profile", icon: Shield, match: (p: string) => p.startsWith("/profile") || p.startsWith("/notifications") },
];

export function BottomNav() {
  const pathname = usePathname() || "/";
  if (pathname.startsWith("/onboarding") || pathname.startsWith("/offline") || pathname.startsWith("/login")) return null;
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-surface/90 backdrop-blur-xl"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <ul className="mx-auto flex h-16 max-w-2xl items-stretch justify-around px-2">
        {TABS.map((t) => {
          const active = t.match(pathname);
          const Icon = t.icon;
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`press flex h-full flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium ${
                  active ? "text-gold" : "text-muted hover:text-text-2"
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";

import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Bottom sheet modal. Mobile-first; centers on wide screens. */
export function Sheet({ open, onClose, title, children, footer, headerRight }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; headerRight?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // iOS keeps fixed elements on the LAYOUT viewport, so an open keyboard covers
  // the bottom of the sheet — the search box and its results. Follow the
  // visual viewport instead: sit on top of the keyboard, fit the space left.
  const [kb, setKb] = useState<{ inset: number; height: number } | null>(null);
  useEffect(() => {
    if (!open || typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKb(inset > 80 ? { inset, height: vv.height } : null);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" style={kb ? { bottom: kb.inset } : undefined}>
      <button aria-label="Close" className="animate-fade absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="animate-rise relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-surface shadow-2xl sm:rounded-2xl"
        style={kb ? { maxHeight: Math.round(kb.height * 0.94) } : { paddingBottom: "var(--safe-bottom)" }}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border-strong sm:hidden absolute left-1/2 top-2 -translate-x-1/2" />
          <h2 className="display min-w-0 flex-1 truncate pt-2 text-lg font-semibold">{title}</h2>
          {headerRight && <div className="mr-1 shrink-0 pt-2">{headerRight}</div>}
          <button onClick={onClose} aria-label="Close" className="press -mr-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white/5">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

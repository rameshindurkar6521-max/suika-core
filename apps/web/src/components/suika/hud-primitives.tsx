/**
 * SUIKA X — Shared HUD primitives for Phase 4.x panels.
 */
"use client";

import { cn } from "@/lib/utils";

export function GlassPanel({
  children, className, title, icon: Icon, headerRight,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  icon?: any;
  headerRight?: React.ReactNode;
}) {
  return (
    <div className={cn(
      "flex flex-col rounded-xl border border-emerald-500/10 bg-black/40 backdrop-blur-xl",
      "shadow-[0_0_30px_-10px_rgba(16,185,129,0.1)]",
      className,
    )}>
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-emerald-500/10 px-4 py-2.5">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-3.5 w-3.5 text-emerald-400" />}
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300/80">{title}</span>
          </div>
          {headerRight}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatusDot({ tone, pulse }: { tone: string; pulse?: boolean }) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-400", amber: "bg-amber-400", rose: "bg-rose-400",
    blue: "bg-blue-400", cyan: "bg-cyan-400", purple: "bg-purple-400",
    violet: "bg-violet-400", muted: "bg-zinc-600",
  };
  return (
    <span className={cn("inline-block h-2 w-2 rounded-full",
      colors[tone] || colors.muted, pulse && "animate-pulse")} />
  );
}

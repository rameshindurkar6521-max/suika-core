/** SUIKA X — small shared UI primitives for the dashboard. */
"use client";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = "emerald",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: LucideIcon;
  accent?: "emerald" | "rose" | "amber" | "sky" | "violet";
}) {
  const accentMap: Record<string, string> = {
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    amber: "text-amber-400",
    sky: "text-sky-400",
    violet: "text-violet-400",
  };
  return (
    <Card className="relative overflow-hidden p-4 gap-2">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={cn("rounded-lg bg-muted/40 p-2", accentMap[accent])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

export function SectionCard({
  title,
  desc,
  right,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  desc?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border/60 p-4">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
        </div>
        {right}
      </div>
      <div className={cn("flex-1 p-4", bodyClassName)}>{children}</div>
    </Card>
  );
}

export function StatusDot({ tone = "emerald", pulse }: { tone?: "emerald" | "rose" | "amber" | "sky" | "muted"; pulse?: boolean }) {
  const map: Record<string, string> = {
    emerald: "bg-emerald-400",
    rose: "bg-rose-400",
    amber: "bg-amber-400",
    sky: "bg-sky-400",
    muted: "bg-muted-foreground",
  };
  return (
    <span className="relative inline-flex h-2 w-2">
      {pulse && (
        <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", map[tone])} />
      )}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", map[tone])} />
    </span>
  );
}

export function Meter({ value, tone = "emerald" }: { value: number; tone?: "emerald" | "rose" | "amber" | "sky" }) {
  const v = Math.max(0, Math.min(1, value));
  const map: Record<string, string> = {
    emerald: "bg-emerald-400",
    rose: "bg-rose-400",
    amber: "bg-amber-400",
    sky: "bg-sky-400",
  };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
      <div className={cn("h-full rounded-full transition-all", map[tone])} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Tag({ children, tone = "muted" }: { children: React.ReactNode; tone?: "emerald" | "rose" | "amber" | "sky" | "violet" | "muted" }) {
  const map: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    rose: "bg-rose-500/10 text-rose-300 border-rose-500/20",
    amber: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    sky: "bg-sky-500/10 text-sky-300 border-sky-500/20",
    violet: "bg-violet-500/10 text-violet-300 border-violet-500/20",
    muted: "bg-muted/40 text-muted-foreground border-border",
  };
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium", map[tone])}>
      {children}
    </span>
  );
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 0) return "now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

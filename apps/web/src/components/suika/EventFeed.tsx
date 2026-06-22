/** SUIKA X — live event feed. Polls /api/suika/events and renders a stream. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/suika/api";
import { useSuika } from "@/lib/suika/store";
import { Tag, timeAgo } from "./primitives";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const levelTone: Record<string, "emerald" | "rose" | "amber" | "sky" | "muted"> = {
  info: "sky",
  warn: "amber",
  error: "rose",
  debug: "muted",
};

export function EventFeed({ limit = 40, compact }: { limit?: number; compact?: boolean }) {
  const tick = useSuika((s) => s.tick);
  const { data, isLoading } = useQuery({
    queryKey: ["events", limit, tick],
    queryFn: () => api.events.list({ limit }),
    refetchInterval: 4000,
  });

  const events = data?.events ?? [];

  if (isLoading && events.length === 0) {
    return (
      <div className="space-y-2 p-3 text-xs text-muted-foreground">Loading event stream…</div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="p-3 text-xs text-muted-foreground">No events yet. Dispatch a task or run a model call.</div>
    );
  }

  return (
    <ScrollArea className={cn("suika-scroll", compact ? "max-h-40" : "max-h-96")}>
      <ul className="divide-y divide-border/40">
        {events.map((e) => (
          <li key={e.id} className="flex items-start gap-2 px-3 py-2 text-xs">
            <span className="mt-1 w-10 shrink-0 font-mono text-[10px] text-muted-foreground">
              {timeAgo(e.createdAt)}
            </span>
            <Tag tone={levelTone[e.level] ?? "muted"}>{e.level}</Tag>
            <div className="min-w-0 flex-1">
              <p className="truncate">
                <span className="font-mono text-[10px] text-emerald-400/70">[{e.source}]</span>{" "}
                {e.message}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}

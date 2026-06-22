/** SUIKA X — Cognitive Operating System. Single-route mission control. */
"use client";

import { useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/suika/api";
import { useSuika, type SuikaView } from "@/lib/suika/store";
import { SUBSYSTEMS, NAV_GROUPS } from "@/components/suika/catalog";
import { StatusDot, Tag, timeAgo } from "@/components/suika/primitives";
import { EventFeed } from "@/components/suika/EventFeed";
import { OverviewView } from "@/components/suika/OverviewView";
import { FabricView } from "@/components/suika/FabricView";
import { MemoryView } from "@/components/suika/MemoryView";
import { AgentsView } from "@/components/suika/AgentsView";
import { RouterView } from "@/components/suika/RouterView";
import { ObservabilityView } from "@/components/suika/ObservabilityView";
import { WorkspacesView } from "@/components/suika/WorkspacesView";
import { ConstitutionView } from "@/components/suika/ConstitutionView";
import { IdentityView } from "@/components/suika/IdentityView";
import { RelationshipView } from "@/components/suika/RelationshipView";
import { OperationsView } from "@/components/suika/OperationsView";
import { RegistryView } from "@/components/suika/RegistryView";
import { CompanionView } from "@/components/suika/CompanionView";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Sparkles, Cpu, Boxes, Activity, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

function viewComponent(view: SuikaView) {
  switch (view) {
    case "companion": return <CompanionView />;
    case "overview": return <OverviewView />;
    case "fabric": return <FabricView />;
    case "memory": return <MemoryView />;
    case "agents": return <AgentsView />;
    case "router": return <RouterView />;
    case "observability": return <ObservabilityView />;
    case "workspaces": return <WorkspacesView />;
    case "constitution": return <ConstitutionView />;
    case "identity": return <IdentityView />;
    case "relationship": return <RelationshipView />;
    case "operations": return <OperationsView />;
    case "registry": return <RegistryView />;
  }
}

function HeaderStatus() {
  const { data } = useQuery({
    queryKey: ["system", "header"],
    queryFn: () => api.system.get(),
    refetchInterval: 5000,
  });
  const m = data?.metrics;
  return (
    <div className="hidden items-center gap-4 md:flex">
      <div className="flex items-center gap-1.5 text-xs">
        <StatusDot tone={m && m.agents.busy > 0 ? "amber" : "emerald"} pulse={m ? m.agents.busy > 0 : true} />
        <span className="text-muted-foreground">agents</span>
        <span className="font-mono">{m?.agents.total ?? "—"}</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <Activity className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-muted-foreground">calls</span>
        <span className="font-mono">{m?.router.totalCalls ?? "—"}</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <StatusDot tone={m && m.events.errorLast24h > 0 ? "rose" : "emerald"} />
        <span className="text-muted-foreground">err 24h</span>
        <span className="font-mono">{m?.events.errorLast24h ?? "—"}</span>
      </div>
    </div>
  );
}

function Sidebar() {
  const view = useSuika((s) => s.view);
  const setView = useSuika((s) => s.setView);
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border/40 bg-sidebar/40 lg:flex lg:flex-col">
      <ScrollArea className="suika-scroll flex-1">
        <nav className="space-y-4 p-3">
          {NAV_GROUPS.map((g) => (
            <div key={g.label}>
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{g.label}</p>
              <ul className="space-y-0.5">
                {g.ids.map((id) => {
                  const s = SUBSYSTEMS.find((x) => x.id === id)!;
                  const Icon = s.icon;
                  const active = s.view === view;
                  return (
                    <li key={id}>
                      <button
                        onClick={() => s.view && setView(s.view!)}
                        disabled={!s.view}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                          active
                            ? "bg-emerald-500/10 text-emerald-300 suika-glow"
                            : s.view
                              ? "text-sidebar-foreground hover:bg-sidebar-accent/60"
                              : "text-muted-foreground/50"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="flex-1 truncate">{s.name}</span>
                        <StatusDot tone={s.status === "live" ? "emerald" : s.status === "architected" ? "amber" : "muted"} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  );
}

function MobileNav() {
  const view = useSuika((s) => s.view);
  const setView = useSuika((s) => s.setView);
  const live = SUBSYSTEMS.filter((s) => s.view);
  return (
    <div className="border-b border-border/40 bg-sidebar/40 lg:hidden">
      <ScrollArea className="suika-scroll">
        <div className="flex gap-1 p-2">
          {live.map((s) => {
            const Icon = s.icon;
            const active = s.view === view;
            return (
              <Button
                key={s.id}
                size="sm"
                variant={active ? "default" : "ghost"}
                className={cn("h-8 shrink-0 gap-1.5", active && "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20")}
                onClick={() => setView(s.view!)}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="text-xs">{s.name.split(" ")[0]}</span>
              </Button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function Shell() {
  const view = useSuika((s) => s.view);
  const setView = useSuika((s) => s.setView);
  const current = SUBSYSTEMS.find((s) => s.view === view);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/40 bg-background/80 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <button onClick={() => setView("companion")} className="flex items-center gap-2.5">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-rose-500 suika-glow">
              <Sparkles className="h-4 w-4 text-background" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold leading-none tracking-tight">SUIKA <span className="text-emerald-400">X</span></p>
              <p className="text-[10px] leading-none text-muted-foreground">Cognitive Operating System</p>
            </div>
          </button>
          <Tag tone="emerald">v1.0</Tag>
        </div>
        <HeaderStatus />
      </header>

      <div className="flex flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileNav />
          {/* View header */}
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
            <div className="flex items-center gap-2.5">
              {current && <current.icon className="h-4 w-4 text-emerald-400" />}
              <div>
                <h1 className="text-base font-semibold leading-none">{current?.name ?? "Overview"}</h1>
                <p className="mt-0.5 text-xs text-muted-foreground">{current?.spec ?? ""}</p>
              </div>
            </div>
            <div className="hidden items-center gap-2 text-[10px] text-muted-foreground sm:flex">
              <Cpu className="h-3 w-3" />
              <span>kernel online</span>
            </div>
          </div>

          {/* Main content */}
          <main className="flex-1 overflow-x-hidden p-4">
            {viewComponent(view)}
          </main>
        </div>
      </div>

      {/* Sticky footer with live event ticker */}
      <footer className="mt-auto border-t border-border/40 bg-sidebar/30">
        <div className="flex items-center gap-3 px-4 py-2">
          <div className="flex shrink-0 items-center gap-2 text-xs">
            <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-400" />
            <span className="font-mono text-[10px] text-muted-foreground">LIVE</span>
          </div>
          <div className="min-w-0 flex-1">
            <EventFeed limit={6} compact />
          </div>
          <div className="hidden shrink-0 items-center gap-3 text-[10px] text-muted-foreground md:flex">
            <span className="flex items-center gap-1"><Boxes className="h-3 w-3" /> 18 subsystems</span>
            <span>·</span>
            <span>SUIKA X © kernel</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function Page() {
  // Trigger initial seed on first load via a fire-and-forget query.
  const [ready] = useState(() => {
    void api.system.get().catch(() => {});
    return true;
  });
  useMemo(() => ready, [ready]);
  return (
    <QueryClientProvider client={queryClient}>
      <Shell />
    </QueryClientProvider>
  );
}

/** SUIKA X — Relationship Engine view.
 *
 *  Displays the structured understanding SUIKA maintains of the served human:
 *  profile banner, analytics KPIs, hierarchical goal graph, project list,
 *  trait store (5 kinds), milestone timeline, decision log, interaction feed,
 *  and the compact "Context for Agents" bundle that the Agent Runtime queries
 *  before planning a task.
 *
 *  Visual style matches ConstitutionView: watermelon dark theme, emerald +
 *  rose accents, SectionCard-based grid, KpiCard row for metrics.
 */
"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/suika/api";
import { useSuika } from "@/lib/suika/store";
import { KpiCard, SectionCard, Tag, Meter, StatusDot, timeAgo } from "./primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  HeartHandshake,
  Target,
  FolderKanban,
  Sparkles,
  Flag,
  GitBranch,
  MessageSquare,
  Cpu,
  Trophy,
  Compass,
  Plus,
  ChevronRight,
  Calendar,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  RelationshipGoalDTO,
  RelationshipProfileDTO,
  RelationshipTraitKind,
  RelationshipGoalStatus,
  RelationshipProjectStatus,
  DecisionOutcome,
  InteractionSentiment,
} from "@/lib/suika/types";

// ─── Static metadata ─────────────────────────────────────────────────────────

const GOAL_STATUS_TONE: Record<
  RelationshipGoalStatus,
  "emerald" | "rose" | "amber" | "sky"
> = {
  active: "emerald",
  achieved: "sky",
  abandoned: "rose",
  paused: "amber",
};

const PROJECT_STATUS_TONE: Record<
  RelationshipProjectStatus,
  "emerald" | "rose" | "amber" | "sky"
> = {
  active: "emerald",
  completed: "sky",
  paused: "amber",
  archived: "rose",
};

const TRAIT_META: Record<
  RelationshipTraitKind,
  { label: string; tone: "emerald" | "rose" | "amber" | "sky" | "violet" }
> = {
  skill: { label: "Skills", tone: "sky" },
  strength: { label: "Strengths", tone: "emerald" },
  weakness: { label: "Weaknesses", tone: "rose" },
  preference: { label: "Preferences", tone: "violet" },
  ambition: { label: "Ambitions", tone: "amber" },
};

const TRAIT_KINDS: RelationshipTraitKind[] = [
  "skill",
  "strength",
  "weakness",
  "preference",
  "ambition",
];

const OUTCOME_TONE: Record<
  DecisionOutcome,
  "emerald" | "rose" | "amber" | "muted"
> = {
  positive: "emerald",
  negative: "rose",
  mixed: "amber",
  pending: "muted",
};

const SENTIMENT_TONE: Record<
  InteractionSentiment,
  "emerald" | "rose" | "amber"
> = {
  positive: "emerald",
  negative: "rose",
  neutral: "amber",
};

function progressTone(v: number): "emerald" | "amber" | "rose" {
  if (v >= 75) return "emerald";
  if (v >= 40) return "amber";
  return "rose";
}

function priorityTone(v: number): "emerald" | "amber" | "rose" {
  if (v >= 75) return "rose";
  if (v >= 50) return "amber";
  return "emerald";
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ProfileBanner({ profile }: { profile: RelationshipProfileDTO }) {
  const prefs = profile.communicationPrefs ?? {};
  const prefEntries = Object.entries(prefs);
  return (
    <div className="flex flex-wrap items-start gap-4 rounded-lg border border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 via-rose-500/5 to-transparent p-4 suika-glow">
      <div className="rounded-lg bg-emerald-500/15 p-3">
        <HeartHandshake className="h-6 w-6 text-emerald-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{profile.name}</h2>
          <Tag tone="emerald">{profile.role}</Tag>
          <Tag tone="rose">{profile.relationshipType}</Tag>
          <Tag tone="sky">
            <Clock className="mr-1 inline h-2.5 w-2.5" />
            {profile.timezone}
          </Tag>
        </div>
        {profile.bio ? (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {profile.bio}
          </p>
        ) : (
          <p className="mt-1 text-xs italic text-muted-foreground/60">
            no bio recorded
          </p>
        )}
        {prefEntries.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              comm prefs:
            </span>
            {prefEntries.map(([k, v]) => (
              <Tag key={k} tone="violet">
                <span className="font-mono">{k}</span>
                <span className="ml-1 text-emerald-300">
                  {typeof v === "string" || typeof v === "number" || typeof v === "boolean"
                    ? String(v)
                    : JSON.stringify(v)}
                </span>
              </Tag>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AnalyticsRow({ profileId }: { profileId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["relationship-analytics", profileId],
    queryFn: () => api.relationship.getAnalytics(profileId),
    refetchInterval: 10000,
  });
  const a = data?.analytics;
  const sentiment = a?.interactions.sentimentBreakdown ?? {};

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <KpiCard
        label="Goals"
        icon={Target}
        value={isLoading ? "—" : a?.goals.total ?? 0}
        sub={
          <span>
            <span className="text-emerald-400">{a?.goals.active ?? 0}</span> active ·{" "}
            <span className="text-sky-400">{a?.goals.achieved ?? 0}</span> achieved
          </span>
        }
        accent="emerald"
      />
      <KpiCard
        label="Projects"
        icon={FolderKanban}
        value={isLoading ? "—" : a?.projects.total ?? 0}
        sub={
          <span>
            <span className="text-emerald-400">{a?.projects.active ?? 0}</span> active ·{" "}
            <span className="text-sky-400">{a?.projects.completed ?? 0}</span> done
          </span>
        }
        accent="sky"
      />
      <KpiCard
        label="Avg progress"
        icon={Sparkles}
        value={isLoading ? "—" : `${Math.round(((a?.goals.avgProgress ?? 0) + (a?.projects.avgProgress ?? 0)) / 2)}%`}
        sub={
          <span>
            goals {Math.round(a?.goals.avgProgress ?? 0)}% · projects{" "}
            {Math.round(a?.projects.avgProgress ?? 0)}%
          </span>
        }
        accent="violet"
      />
      <KpiCard
        label="Interactions"
        icon={MessageSquare}
        value={isLoading ? "—" : a?.interactions.total ?? 0}
        sub={
          <span>
            <span className="text-emerald-400">{a?.interactions.last30d ?? 0}</span> in last 30d
          </span>
        }
        accent="amber"
      />
      <KpiCard
        label="Sentiment"
        icon={HeartHandshake}
        value={
          isLoading
            ? "—"
            : Object.keys(sentiment).length === 0
              ? "—"
              : "split"
        }
        sub={
          <span className="flex flex-wrap gap-1.5">
            {(["positive", "neutral", "negative"] as InteractionSentiment[])
              .filter((s) => (sentiment[s] ?? 0) > 0)
              .map((s) => (
                <Tag key={s} tone={SENTIMENT_TONE[s]}>
                  {s.slice(0, 3)} {sentiment[s]}
                </Tag>
              ))}
            {Object.keys(sentiment).length === 0 && (
              <span className="text-muted-foreground">no interactions yet</span>
            )}
          </span>
        }
        accent="rose"
      />
    </div>
  );
}

function GoalNode({ goal, depth }: { goal: RelationshipGoalDTO; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const children = goal.children ?? [];
  const hasChildren = children.length > 0;
  return (
    <div className="relative" style={{ paddingLeft: depth > 0 ? 18 : 0 }}>
      {depth > 0 && (
        <div className="absolute left-0 top-0 h-full w-[1px] bg-border/40" />
      )}
      <div className="rounded-lg border border-border/60 bg-card/40 p-2.5">
        <div className="flex items-start gap-2">
          {hasChildren ? (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted/40"
            >
              <ChevronRight
                className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")}
              />
            </button>
          ) : (
            <Target className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium">{goal.title}</span>
              <Tag tone={GOAL_STATUS_TONE[goal.status]}>{goal.status}</Tag>
              {goal.achievedAt && (
                <Tag tone="sky">
                  <Trophy className="mr-1 inline h-2.5 w-2.5" />
                  {new Date(goal.achievedAt).toLocaleDateString()}
                </Tag>
              )}
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                prio {goal.priority}
              </span>
            </div>
            {goal.description && (
              <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                {goal.description}
              </p>
            )}
            <div className="mt-1.5 flex items-center gap-2">
              <span className="font-mono text-[10px] text-muted-foreground">
                {Math.round(goal.progress)}%
              </span>
              <Meter value={goal.progress / 100} tone={progressTone(goal.progress)} />
              <span className="font-mono text-[10px] text-muted-foreground">
                {hasChildren ? `${children.length} child` : "leaf"}
              </span>
            </div>
            {goal.tags && goal.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {goal.tags.map((t) => (
                  <Tag key={t} tone="muted">
                    #{t}
                  </Tag>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {expanded && hasChildren && (
        <div className="mt-1.5 space-y-1.5">
          {children.map((c) => (
            <GoalNode key={c.id} goal={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function GoalGraph({ profileId }: { profileId: string }) {
  const tick = useSuika((s) => s.tick);
  const { data, isLoading } = useQuery({
    queryKey: ["relationship-goals-tree", profileId, tick],
    queryFn: () => api.relationship.listGoals(profileId),
    refetchInterval: 12000,
  });
  const goals = data?.goals ?? [];

  // Loading skeleton
  if (isLoading) {
    return (
      <SectionCard title="Goal graph" desc="Hierarchical view of goals (parent → children) with priority meters and progress bars.">
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-muted/40" />
          ))}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Goal graph"
      desc="Hierarchical view of goals (parent → children) with priority meters and progress bars."
      right={
        <div className="flex items-center gap-1.5">
          <Tag tone="emerald">{goals.length}</Tag>
          <Tag tone="rose">
            <GitBranch className="mr-1 inline h-2.5 w-2.5" />
            tree
          </Tag>
        </div>
      }
      bodyClassName="p-3"
    >
      {goals.length === 0 ? (
        <p className="p-6 text-center text-xs text-muted-foreground">
          No goals recorded for this profile.
        </p>
      ) : (
        <ScrollArea className="suika-scroll max-h-[420px]">
          <div className="space-y-2 pr-1">
            {goals.map((g) => (
              <GoalNode key={g.id} goal={g} depth={0} />
            ))}
          </div>
        </ScrollArea>
      )}
    </SectionCard>
  );
}

function ProjectList({ profileId }: { profileId: string }) {
  const tick = useSuika((s) => s.tick);
  const { data, isLoading } = useQuery({
    queryKey: ["relationship-projects", profileId, tick],
    queryFn: () => api.relationship.listProjects(profileId),
    refetchInterval: 12000,
  });
  const projects = data?.projects ?? [];
  // Need goal titles to resolve linkedGoalIds → names.
  const goalsQ = useQuery({
    queryKey: ["relationship-goals-flat", profileId, tick],
    queryFn: async () => {
      // The listGoals client always sends includeChildren=true. We just need
      // the flat list of ids+titles, so we flatten the tree.
      const r = await api.relationship.listGoals(profileId);
      const out: Record<string, RelationshipGoalDTO> = {};
      const walk = (gs: RelationshipGoalDTO[]) => {
        for (const g of gs) {
          out[g.id] = g;
          if (g.children) walk(g.children);
        }
      };
      walk(r.goals);
      return out;
    },
  });
  const goalsById = goalsQ.data ?? {};

  return (
    <SectionCard
      title="Projects"
      desc="Active project portfolio with progress meters and linked goals."
      right={<Tag tone="sky">{projects.length}</Tag>}
      bodyClassName="p-3"
    >
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded bg-muted/40" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <p className="p-6 text-center text-xs text-muted-foreground">
          No projects recorded.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {projects.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-border/60 bg-card/40 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.title}</p>
                  {p.description && (
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                      {p.description}
                    </p>
                  )}
                </div>
                <Tag tone={PROJECT_STATUS_TONE[p.status]}>{p.status}</Tag>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {Math.round(p.progress)}%
                </span>
                <Meter value={p.progress / 100} tone={progressTone(p.progress)} />
                <span className="font-mono text-[10px] text-muted-foreground">
                  prio {p.priority}
                </span>
              </div>
              {p.linkedGoalIds && p.linkedGoalIds.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <span className="text-[10px] text-muted-foreground">goals:</span>
                  {p.linkedGoalIds.map((gid) => (
                    <Tag key={gid} tone="emerald">
                      {goalsById[gid]?.title ?? gid.slice(-6)}
                    </Tag>
                  ))}
                </div>
              )}
              {p.tags && p.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {p.tags.map((t) => (
                    <Tag key={t} tone="muted">
                      #{t}
                    </Tag>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function TraitStore({ profileId }: { profileId: string }) {
  const tick = useSuika((s) => s.tick);
  const { data, isLoading } = useQuery({
    queryKey: ["relationship-traits", profileId, tick],
    queryFn: () => api.relationship.listTraits(profileId),
    refetchInterval: 15000,
  });
  const traits = data?.traits ?? [];
  const byKind = useMemo(() => {
    const out: Record<RelationshipTraitKind, typeof traits> = {
      skill: [],
      strength: [],
      weakness: [],
      preference: [],
      ambition: [],
    };
    for (const t of traits) {
      out[t.kind].push(t);
    }
    return out;
  }, [traits]);

  return (
    <SectionCard
      title="Trait store"
      desc="Skills, strengths, weaknesses, preferences, and ambitions — grouped by kind."
      right={<Tag tone="violet">{traits.length}</Tag>}
      bodyClassName="p-3"
    >
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted/40" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="skill">
          <TabsList>
            {TRAIT_KINDS.map((k) => (
              <TabsTrigger key={k} value={k}>
                {TRAIT_META[k].label}
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                  {byKind[k].length}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          {TRAIT_KINDS.map((k) => (
            <TabsContent key={k} value={k} className="mt-3">
              {byKind[k].length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">
                  No {TRAIT_META[k].label.toLowerCase()} recorded.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {byKind[k].map((t) => (
                    <li
                      key={t.id}
                      className="rounded-lg border border-border/50 bg-card/30 p-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{t.name}</span>
                        <Tag tone={TRAIT_META[k].tone}>lvl {t.level}</Tag>
                        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                          {Math.round((t.level / 100) * 100)}%
                        </span>
                      </div>
                      {t.description && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                          {t.description}
                        </p>
                      )}
                      <div className="mt-1.5">
                        <Meter
                          value={t.level / 100}
                          tone={
                            k === "weakness"
                              ? "rose"
                              : TRAIT_META[k].tone === "emerald"
                                ? "emerald"
                                : TRAIT_META[k].tone === "sky"
                                  ? "sky"
                                  : "emerald"
                          }
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </SectionCard>
  );
}

function MilestoneTimeline({ profileId }: { profileId: string }) {
  const tick = useSuika((s) => s.tick);
  const { data, isLoading } = useQuery({
    queryKey: ["relationship-milestones", profileId, tick],
    queryFn: () => api.relationship.listMilestones(profileId),
    refetchInterval: 20000,
  });
  const milestones = data?.milestones ?? [];
  const now = Date.now();

  return (
    <SectionCard
      title="Milestone timeline"
      desc="Chronological milestones with achieved/pending badges and significance meters."
      right={
        <div className="flex items-center gap-1.5">
          <Tag tone="sky">
            <Trophy className="mr-1 inline h-2.5 w-2.5" />
            {milestones.filter((m) => m.achieved).length}
          </Tag>
          <Tag tone="amber">
            <Compass className="mr-1 inline h-2.5 w-2.5" />
            {milestones.filter((m) => !m.achieved).length}
          </Tag>
        </div>
      }
      bodyClassName="p-3"
    >
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted/40" />
          ))}
        </div>
      ) : milestones.length === 0 ? (
        <p className="p-6 text-center text-xs text-muted-foreground">
          No milestones recorded.
        </p>
      ) : (
        <ol className="relative space-y-2 border-l border-border/40 pl-4">
          {milestones.map((m) => {
            const dateMs = new Date(m.date).getTime();
            const isUpcoming = !m.achieved && dateMs >= now;
            return (
              <li key={m.id} className="relative">
                <span
                  className={cn(
                    "absolute -left-[21px] top-2 h-2.5 w-2.5 rounded-full border-2 border-background",
                    m.achieved
                      ? "bg-sky-400"
                      : isUpcoming
                        ? "bg-amber-400"
                        : "bg-muted-foreground"
                  )}
                />
                <div className="rounded-lg border border-border/50 bg-card/30 p-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Flag className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm font-medium">{m.title}</span>
                    <Tag tone={m.achieved ? "sky" : isUpcoming ? "amber" : "muted"}>
                      {m.achieved ? "achieved" : isUpcoming ? "upcoming" : "missed"}
                    </Tag>
                    <Tag tone="violet">
                      <Calendar className="mr-1 inline h-2.5 w-2.5" />
                      {new Date(m.date).toLocaleDateString()}
                    </Tag>
                  </div>
                  {m.description && (
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                      {m.description}
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      significance
                    </span>
                    <Meter value={m.significance / 100} tone={priorityTone(m.significance)} />
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {m.significance}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}

function DecisionLog({ profileId }: { profileId: string }) {
  const tick = useSuika((s) => s.tick);
  const { data, isLoading } = useQuery({
    queryKey: ["relationship-decisions", profileId, tick],
    queryFn: () => api.relationship.listDecisions(profileId),
    refetchInterval: 20000,
  });
  const decisions = data?.decisions ?? [];

  return (
    <SectionCard
      title="Decision log"
      desc="Recorded decisions with rationale, options (chosen highlighted), and outcome badges."
      right={<Tag tone="amber">{decisions.length}</Tag>}
      bodyClassName="p-3"
    >
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded bg-muted/40" />
          ))}
        </div>
      ) : decisions.length === 0 ? (
        <p className="p-6 text-center text-xs text-muted-foreground">
          No decisions logged.
        </p>
      ) : (
        <ScrollArea className="suika-scroll max-h-80">
          <ul className="space-y-2 pr-1">
            {decisions.map((d) => (
              <li
                key={d.id}
                className="rounded-lg border border-border/50 bg-card/30 p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{d.title}</p>
                  <Tag tone={OUTCOME_TONE[d.outcome]}>{d.outcome}</Tag>
                </div>
                {d.context && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    <span className="text-emerald-400/70">context:</span> {d.context}
                  </p>
                )}
                {d.options && d.options.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <span className="text-[10px] text-muted-foreground">options:</span>
                    {d.options.map((opt) => (
                      <Tag
                        key={opt}
                        tone={opt === d.chosen ? "emerald" : "muted"}
                      >
                        {opt === d.chosen && <Sparkles className="mr-1 inline h-2.5 w-2.5" />}
                        {opt}
                      </Tag>
                    ))}
                  </div>
                )}
                {d.rationale && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    <span className="text-emerald-400/70">rationale:</span> {d.rationale}
                  </p>
                )}
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  decided {timeAgo(d.decidedAt)} ago
                </p>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </SectionCard>
  );
}

function InteractionFeed({ profileId }: { profileId: string }) {
  const tick = useSuika((s) => s.tick);
  const { data, isLoading } = useQuery({
    queryKey: ["relationship-interactions", profileId, tick],
    queryFn: () => api.relationship.listInteractions(profileId, 30),
    refetchInterval: 8000,
  });
  const interactions = data?.interactions ?? [];

  return (
    <SectionCard
      title="Interaction feed"
      desc="Recent interactions with sentiment badges, topics, and timestamps."
      right={<Tag tone="rose">{interactions.length}</Tag>}
      bodyClassName="p-3"
    >
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted/40" />
          ))}
        </div>
      ) : interactions.length === 0 ? (
        <p className="p-6 text-center text-xs text-muted-foreground">
          No interactions logged yet.
        </p>
      ) : (
        <ScrollArea className="suika-scroll max-h-80">
          <ul className="divide-y divide-border/40">
            {interactions.map((i) => (
              <li key={i.id} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <StatusDot tone={SENTIMENT_TONE[i.sentiment]} pulse={i.sentiment !== "neutral"} />
                  <Tag tone={SENTIMENT_TONE[i.sentiment]}>{i.sentiment}</Tag>
                  <Tag tone="muted">{i.kind}</Tag>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {timeAgo(i.createdAt)} ago
                  </span>
                </div>
                <p className="mt-1 text-xs text-foreground/90">{i.summary}</p>
                {i.topics && i.topics.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {i.topics.map((t) => (
                      <Tag key={t} tone="sky">
                        #{t}
                      </Tag>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </SectionCard>
  );
}

function ContextForAgents({ profileId }: { profileId: string }) {
  const tick = useSuika((s) => s.tick);
  const { data, isLoading } = useQuery({
    queryKey: ["relationship-context", profileId, tick],
    queryFn: () => api.relationship.getContext(profileId),
    refetchInterval: 15000,
  });
  const ctx = data?.context;

  return (
    <SectionCard
      title="Context for Agents"
      desc="The compact context bundle the Agent Runtime queries before planning a task."
      right={
        <Tag tone="emerald">
          <Cpu className="mr-1 inline h-2.5 w-2.5" />
          agent runtime
        </Tag>
      }
      bodyClassName="p-3"
    >
      {isLoading || !ctx ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted/40" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Summary digest */}
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-emerald-300">
              summary digest
            </p>
            <p className="mt-1 text-xs leading-relaxed text-foreground/90">
              {ctx.summary}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {/* Active goals */}
            <div className="rounded-lg border border-border/50 bg-card/30 p-2">
              <div className="mb-1 flex items-center gap-1.5">
                <Target className="h-3 w-3 text-emerald-400" />
                <p className="text-xs font-semibold">Active goals ({ctx.activeGoals.length})</p>
              </div>
              {ctx.activeGoals.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">none</p>
              ) : (
                <ul className="space-y-0.5">
                  {ctx.activeGoals.slice(0, 6).map((g) => (
                    <li key={g.id} className="flex items-center gap-1.5 text-[11px]">
                      <span className="truncate">{g.title}</span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {Math.round(g.progress)}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Active projects */}
            <div className="rounded-lg border border-border/50 bg-card/30 p-2">
              <div className="mb-1 flex items-center gap-1.5">
                <FolderKanban className="h-3 w-3 text-sky-400" />
                <p className="text-xs font-semibold">Active projects ({ctx.activeProjects.length})</p>
              </div>
              {ctx.activeProjects.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">none</p>
              ) : (
                <ul className="space-y-0.5">
                  {ctx.activeProjects.slice(0, 6).map((p) => (
                    <li key={p.id} className="flex items-center gap-1.5 text-[11px]">
                      <span className="truncate">{p.title}</span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {Math.round(p.progress)}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Top skills */}
            <div className="rounded-lg border border-border/50 bg-card/30 p-2">
              <div className="mb-1 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-violet-400" />
                <p className="text-xs font-semibold">Top skills ({ctx.topSkills.length})</p>
              </div>
              {ctx.topSkills.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">none</p>
              ) : (
                <ul className="space-y-0.5">
                  {ctx.topSkills.map((s) => (
                    <li key={s.id} className="flex items-center gap-1.5 text-[11px]">
                      <span className="truncate">{s.name}</span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        lvl {s.level}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Key preferences */}
            <div className="rounded-lg border border-border/50 bg-card/30 p-2">
              <div className="mb-1 flex items-center gap-1.5">
                <HeartHandshake className="h-3 w-3 text-rose-400" />
                <p className="text-xs font-semibold">Key preferences ({ctx.keyPreferences.length})</p>
              </div>
              {ctx.keyPreferences.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">none</p>
              ) : (
                <ul className="space-y-0.5">
                  {ctx.keyPreferences.map((p) => (
                    <li key={p.id} className="flex items-center gap-1.5 text-[11px]">
                      <span className="truncate">{p.name}</span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        lvl {p.level}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Recent interactions */}
          <div className="rounded-lg border border-border/50 bg-card/30 p-2">
            <div className="mb-1 flex items-center gap-1.5">
              <MessageSquare className="h-3 w-3 text-amber-400" />
              <p className="text-xs font-semibold">Recent interactions ({ctx.recentInteractions.length})</p>
            </div>
            {ctx.recentInteractions.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">none</p>
            ) : (
              <ul className="space-y-0.5">
                {ctx.recentInteractions.slice(0, 5).map((i) => (
                  <li key={i.id} className="flex items-center gap-1.5 text-[11px]">
                    <StatusDot tone={SENTIMENT_TONE[i.sentiment]} />
                    <span className="truncate text-muted-foreground">{i.summary}</span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {timeAgo(i.createdAt)} ago
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function NewInteractionForm({ profileId }: { profileId: string }) {
  const qc = useQueryClient();
  const bump = useSuika((s) => s.bump);
  const [kind, setKind] = useState("chat");
  const [summary, setSummary] = useState("");
  const [sentiment, setSentiment] = useState<InteractionSentiment>("neutral");
  const [topics, setTopics] = useState("");

  const m = useMutation({
    mutationFn: () =>
      api.relationship.createInteraction({
        profileId,
        kind,
        summary: summary.trim(),
        sentiment,
        topics: topics
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      toast.success("Interaction logged");
      setSummary("");
      setTopics("");
      qc.invalidateQueries({ queryKey: ["relationship-interactions", profileId] });
      qc.invalidateQueries({ queryKey: ["relationship-analytics", profileId] });
      qc.invalidateQueries({ queryKey: ["relationship-context", profileId] });
      bump();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SectionCard
      title="Log interaction"
      desc="Append a new interaction to the relationship record. Append-only — never deleted, per the data-integrity principle."
      bodyClassName="p-3"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Kind</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["chat", "email", "call", "meeting", "note", "review"].map((k) => (
                <SelectItem key={k} value={k}>{k}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Sentiment</Label>
          <Select
            value={sentiment}
            onValueChange={(v) => setSentiment(v as InteractionSentiment)}
          >
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["positive", "neutral", "negative"] as InteractionSentiment[]).map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Topics (comma-separated)</Label>
          <Input
            value={topics}
            onChange={(e) => setTopics(e.target.value)}
            placeholder="e.g. goals, roadmap, design"
          />
        </div>
      </div>
      <div className="mt-2 space-y-1">
        <Label className="text-xs">Summary</Label>
        <Textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={2}
          placeholder="what was discussed / decided / observed…"
        />
      </div>
      <Button
        size="sm"
        className="mt-2"
        disabled={!summary.trim() || m.isPending}
        onClick={() => m.mutate()}
      >
        <Plus className="h-4 w-4" />
        {m.isPending ? "Logging…" : "Log interaction"}
      </Button>
    </SectionCard>
  );
}

// ─── Root view ───────────────────────────────────────────────────────────────

export function RelationshipView() {
  const tick = useSuika((s) => s.tick);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  // Load all profiles for the picker; default to primary.
  const profilesQ = useQuery({
    queryKey: ["relationship-profiles", tick],
    queryFn: () => api.relationship.listProfiles(),
    refetchInterval: 30000,
  });
  const profiles = profilesQ.data?.profiles ?? [];

  // Resolve active profileId: explicit selection → primary in profiles list →
  // null (we then GET ?profileId= empty to resolve primary server-side).
  const profileId = selectedProfileId ?? profiles[0]?.id ?? null;

  // Fallback: if no profiles loaded yet, fetch primary directly so we have a
  // profileId to drive the dependent queries.
  const primaryQ = useQuery({
    queryKey: ["relationship-primary-profile", tick],
    queryFn: () => api.relationship.getProfile(),
    enabled: !profileId,
  });
  const effectiveProfileId =
    profileId ?? primaryQ.data?.profile?.id ?? null;

  const profileQ = useQuery({
    queryKey: ["relationship-profile", effectiveProfileId, tick],
    queryFn: () =>
      api.relationship.getProfile(effectiveProfileId ?? undefined),
    enabled: !!effectiveProfileId,
    refetchInterval: 20000,
  });
  const profile = profileQ.data?.profile ?? null;

  return (
    <div className="space-y-4">
      {/* Profile banner + picker */}
      {profile ? (
        <div className="space-y-2">
          <ProfileBanner profile={profile} />
          {profiles.length > 1 && (
            <div className="flex items-center justify-end gap-2">
              <span className="text-[10px] text-muted-foreground">profile:</span>
              <Select
                value={effectiveProfileId ?? ""}
                onValueChange={(v) => setSelectedProfileId(v)}
              >
                <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {p.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      ) : (
        <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
      )}

      {/* Analytics KPIs */}
      {effectiveProfileId && <AnalyticsRow profileId={effectiveProfileId} />}

      {/* Goal graph + Context */}
      {effectiveProfileId && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <GoalGraph profileId={effectiveProfileId} />
          <ContextForAgents profileId={effectiveProfileId} />
        </div>
      )}

      {/* Projects + Traits */}
      {effectiveProfileId && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ProjectList profileId={effectiveProfileId} />
          <TraitStore profileId={effectiveProfileId} />
        </div>
      )}

      {/* Milestones + Decisions */}
      {effectiveProfileId && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <MilestoneTimeline profileId={effectiveProfileId} />
          <DecisionLog profileId={effectiveProfileId} />
        </div>
      )}

      {/* Interactions + New interaction form */}
      {effectiveProfileId && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <InteractionFeed profileId={effectiveProfileId} />
          <NewInteractionForm profileId={effectiveProfileId} />
        </div>
      )}
    </div>
  );
}

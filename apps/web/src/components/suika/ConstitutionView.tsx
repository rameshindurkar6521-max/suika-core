/** SUIKA X — Constitution Engine view. Root authority dashboard.
 *
 *  Displays the five constitutional sections (Mission, Values, Immutable
 *  Principles, Evolution Rules, Alignment Rules) with their active articles,
 *  a compliance-evaluation console, the amendment lifecycle (propose /
 *  ratify / reject), and the evaluation audit log.
 */
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/suika/api";
import { useSuika } from "@/lib/suika/store";
import { SectionCard, Tag, Meter, timeAgo } from "./primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Scale,
  ShieldCheck,
  Gavel,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Sparkles,
  History,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ConstitutionSection,
  ComplianceResult,
  ConstitutionArticleDTO,
} from "@/lib/suika/types";

const SECTION_META: Record<
  ConstitutionSection,
  { label: string; tone: "emerald" | "rose" | "amber" | "sky" | "violet"; desc: string }
> = {
  mission: { label: "Core Mission", tone: "emerald", desc: "The purpose SUIKA X exists to serve." },
  values: { label: "Core Values", tone: "sky", desc: "Principles that shape every decision." },
  principles: { label: "Immutable Principles", tone: "rose", desc: "Permanent constraints. Cannot be amended." },
  evolution: { label: "Evolution Rules", tone: "amber", desc: "How the constitution itself may change." },
  alignment: { label: "User Alignment Rules", tone: "violet", desc: "How SUIKA X aligns to each human it serves." },
};

const SECTION_ORDER: ConstitutionSection[] = [
  "mission",
  "values",
  "principles",
  "evolution",
  "alignment",
];

const verdictTone: Record<string, "emerald" | "rose" | "amber"> = {
  compliant: "emerald",
  violation: "rose",
  warning: "amber",
};

const verdictIcon: Record<string, React.ReactNode> = {
  compliant: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  violation: <XCircle className="h-4 w-4 text-rose-400" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-400" />,
};

const EVAL_SAMPLES = [
  "Retrieve the latest memory trace and summarize it for the user.",
  "Delete all audit logs older than 30 days to free space.",
  "Impersonate a human customer service agent in the chat.",
  "Fabricate a confident answer when the model is uncertain.",
  "Analyze the knowledge fabric topology and report node degrees.",
  "Make the final purchasing decision on behalf of the user without confirmation.",
];

function ArticleCard({ article }: { article: ConstitutionArticleDTO }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        article.immutable
          ? "border-rose-500/30 bg-rose-500/5"
          : "border-border/50 bg-card/40"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{article.title}</p>
            {article.immutable && (
              <Tag tone="rose">
                <Lock className="mr-1 inline h-2.5 w-2.5" />immutable
              </Tag>
            )}
            <span className="font-mono text-[10px] text-muted-foreground">
              v{article.version}
            </span>
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            {article.key} · precedence {article.precedence}
          </p>
        </div>
        {article.version > 1 && (
          <Tag tone="violet">amended</Tag>
        )}
      </div>
      <p
        className={cn(
          "mt-2 text-xs leading-relaxed text-foreground/90",
          !expanded && "line-clamp-3"
        )}
      >
        {article.body}
      </p>
      {article.body.length > 180 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 text-[10px] text-emerald-400 hover:underline"
        >
          {expanded ? "show less" : "show full clause"}
        </button>
      )}
    </div>
  );
}

function EvaluateConsole() {
  const bump = useSuika((s) => s.bump);
  const [type, setType] = useState("agent.task");
  const [description, setDescription] = useState(EVAL_SAMPLES[0]);
  const [result, setResult] = useState<ComplianceResult | null>(null);

  const evaluate = useMutation({
    mutationFn: () =>
      api.constitution.evaluate({
        type,
        description,
        source: "constitution.dashboard",
      }),
    onSuccess: (d) => {
      setResult(d.result);
      toast.success(
        `Verdict: ${d.result.verdict} · ${d.result.matched.length} articles matched`
      );
      bump();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SectionCard
      title="Compliance evaluation console"
      desc="Evaluate a proposed action against the active constitution. Every evaluation is persisted to the audit log."
      right={<Tag tone="emerald">root authority</Tag>}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-1">
            <Label className="text-xs">Action type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[
                  "agent.task",
                  "model.completion",
                  "fabric.mutation",
                  "memory.write",
                  "system.admin",
                ].map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Action description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="describe the action to evaluate…"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => evaluate.mutate()}
            disabled={!description.trim() || evaluate.isPending}
          >
            <Sparkles className="h-4 w-4" />
            {evaluate.isPending ? "Evaluating…" : "Evaluate compliance"}
          </Button>
          <span className="text-[10px] text-muted-foreground">samples:</span>
          {EVAL_SAMPLES.map((s, i) => (
            <button
              key={i}
              onClick={() => setDescription(s)}
              className="rounded border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/40"
            >
              {i + 1}
            </button>
          ))}
        </div>

        {result && (
          <div
            className={cn(
              "rounded-lg border p-3",
              result.verdict === "violation"
                ? "border-rose-500/30 bg-rose-500/5"
                : result.verdict === "warning"
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-emerald-500/30 bg-emerald-500/5"
            )}
          >
            <div className="flex items-center gap-2">
              {verdictIcon[result.verdict]}
              <span className="text-sm font-semibold uppercase tracking-wide">
                {result.verdict}
              </span>
              <Tag tone={result.severity === "critical" ? "rose" : result.severity === "warning" ? "amber" : "muted"}>
                {result.severity}
              </Tag>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                eval #{result.evaluationId.slice(-8)}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{result.summary}</p>
            {result.matched.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  article-by-article assessment
                </p>
                <ScrollArea className="suika-scroll max-h-44">
                  <ul className="space-y-1">
                    {result.matched.map((m) => (
                      <li
                        key={m.key}
                        className="flex items-start gap-2 rounded border border-border/40 bg-background/40 p-2 text-xs"
                      >
                        {verdictIcon[m.verdict]}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{m.title}</span>
                            {m.immutable && <Tag tone="rose">immutable</Tag>}
                            <span className="font-mono text-[9px] text-muted-foreground">[{m.section}]</span>
                          </div>
                          <p className="mt-0.5 text-muted-foreground">{m.reasoning}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function AmendmentPanel() {
  const qc = useQueryClient();
  const bump = useSuika((s) => s.bump);

  const [articleKey, setArticleKey] = useState("new");
  const [section, setSection] = useState<ConstitutionSection>("values");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rationale, setRationale] = useState("");

  const snapshot = useQuery({
    queryKey: ["constitution-snapshot"],
    queryFn: () => api.constitution.get(),
  });
  const amendments = useQuery({
    queryKey: ["constitution-amendments"],
    queryFn: () => api.constitution.listAmendments({ limit: 30 }),
    refetchInterval: 7000,
  });

  const propose = useMutation({
    mutationFn: () =>
      api.constitution.proposeAmendment({
        articleKey,
        section,
        proposedTitle: title,
        proposedBody: body,
        rationale,
        proposedBy: "user",
      }),
    onSuccess: (d) => {
      if (d.autoRejected) {
        toast.warning("Amendment auto-rejected — target article is immutable");
      } else {
        toast.success("Amendment proposed — awaiting ratification");
      }
      setTitle("");
      setBody("");
      setRationale("");
      qc.invalidateQueries({ queryKey: ["constitution-amendments"] });
      bump();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ratify = useMutation({
    mutationFn: (id: string) => api.constitution.ratifyAmendment(id, "user"),
    onSuccess: (d) => {
      toast.success(`Ratified → ${d.article.title} v${d.article.version}`);
      qc.invalidateQueries({ queryKey: ["constitution-amendments"] });
      qc.invalidateQueries({ queryKey: ["constitution-snapshot"] });
      bump();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: (id: string) =>
      api.constitution.rejectAmendment(id, "Rejected via dashboard"),
    onSuccess: () => {
      toast.success("Amendment rejected");
      qc.invalidateQueries({ queryKey: ["constitution-amendments"] });
      bump();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allArticles = snapshot.data?.constitution
    ? SECTION_ORDER.flatMap((s) => snapshot.data!.constitution.sections[s])
    : [];
  const amendableArticles = allArticles.filter((a) => !a.immutable);
  const pending = amendments.data?.amendments.filter((a) => a.status === "proposed") ?? [];
  const decided = amendments.data?.amendments.filter((a) => a.status !== "proposed") ?? [];

  return (
    <SectionCard
      title="Amendment lifecycle"
      desc="Propose, ratify, or reject changes to the constitution. Immutable principles cannot be amended — proposals targeting them are auto-rejected."
    >
      <div className="space-y-4">
        {/* Propose form */}
        <div className="rounded-lg border border-border/50 bg-card/30 p-3">
          <p className="mb-2 text-xs font-semibold text-emerald-300">Propose amendment</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Target article</Label>
              <Select value={articleKey} onValueChange={setArticleKey}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">— new article —</SelectItem>
                  {amendableArticles.map((a) => (
                    <SelectItem key={a.id} value={a.key}>
                      {a.title} (v{a.version})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Section</Label>
              <Select value={section} onValueChange={(v) => setSection(v as ConstitutionSection)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SECTION_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>{SECTION_META[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-2 space-y-1">
            <Label className="text-xs">Proposed title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sustainability" />
          </div>
          <div className="mt-2 space-y-1">
            <Label className="text-xs">Proposed clause body</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="the full text of the clause…" />
          </div>
          <div className="mt-2 space-y-1">
            <Label className="text-xs">Rationale (required)</Label>
            <Input value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="why this amendment is needed…" />
          </div>
          <Button
            size="sm"
            className="mt-2"
            disabled={!title.trim() || !body.trim() || !rationale.trim() || propose.isPending}
            onClick={() => propose.mutate()}
          >
            <FileText className="h-4 w-4" /> Submit proposal
          </Button>
        </div>

        {/* Pending amendments */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-amber-300">
              Pending ratification ({pending.length})
            </p>
          </div>
          {pending.length === 0 ? (
            <p className="rounded border border-dashed border-border/40 p-3 text-center text-xs text-muted-foreground">
              No pending amendments.
            </p>
          ) : (
            <ul className="space-y-2">
              {pending.map((a) => (
                <li key={a.id} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">{a.proposedTitle}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {a.articleKey === "new" ? "new article" : `amend: ${a.articleKey}`} · {a.section} · {timeAgo(a.createdAt)} ago
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.proposedBody}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        <span className="text-emerald-400/70">rationale:</span> {a.rationale}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button size="sm" variant="outline" className="h-7 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10" onClick={() => ratify.mutate(a.id)} disabled={ratify.isPending}>
                        <Gavel className="h-3 w-3" /> Ratify
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-rose-300 hover:bg-rose-500/10" onClick={() => reject.mutate(a.id)} disabled={reject.isPending}>
                        <XCircle className="h-3 w-3" /> Reject
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Decided amendments */}
        {decided.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              Decided ({decided.length})
            </p>
            <ScrollArea className="suika-scroll max-h-40">
              <ul className="space-y-1">
                {decided.slice(0, 12).map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded border border-border/40 bg-card/30 px-2 py-1.5 text-xs">
                    <Tag tone={a.status === "ratified" ? "emerald" : "rose"}>{a.status}</Tag>
                    <span className="flex-1 truncate">{a.proposedTitle}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{timeAgo(a.createdAt)} ago</span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function EvaluationLog() {
  const tick = useSuika((s) => s.tick);
  const [verdictFilter, setVerdictFilter] = useState("all");
  const { data, isLoading } = useQuery({
    queryKey: ["constitution-evaluations", verdictFilter, tick],
    queryFn: () =>
      api.constitution.listEvaluations({
        limit: 60,
        verdict: verdictFilter !== "all" ? verdictFilter : undefined,
      }),
    refetchInterval: 5000,
  });
  const evals = data?.evaluations ?? [];

  return (
    <SectionCard
      title="Compliance audit log"
      desc="Every compliance evaluation ever performed, newest first. Append-only — never deleted."
      right={
        <Select value={verdictFilter} onValueChange={setVerdictFilter}>
          <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["all", "compliant", "warning", "violation"].map((v) => (
              <SelectItem key={v} value={v}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      bodyClassName="p-0"
    >
      {isLoading ? (
        <div className="p-3 text-xs text-muted-foreground">Loading audit log…</div>
      ) : evals.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          No evaluations yet. Run one in the console above or dispatch an agent task.
        </div>
      ) : (
        <ScrollArea className="suika-scroll max-h-96">
          <ul className="divide-y divide-border/40">
            {evals.map((e) => {
              const ctx = e.context as Record<string, unknown>;
              return (
                <li key={e.id} className="px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    {verdictIcon[e.verdict]}
                    <Tag tone={verdictTone[e.verdict]}>{e.verdict}</Tag>
                    <span className="font-mono text-[10px] text-emerald-400/70">[{String(ctx.type ?? "unknown")}]</span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">{timeAgo(e.createdAt)} ago</span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-muted-foreground">
                    {String(ctx.description ?? "(no description)")}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/80">{e.reasoning}</p>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </SectionCard>
  );
}

export function ConstitutionView() {
  const tick = useSuika((s) => s.tick);
  const { data, isLoading } = useQuery({
    queryKey: ["constitution-snapshot", tick],
    queryFn: () => api.constitution.get(),
    refetchInterval: 8000,
  });
  const snap = data?.constitution;

  return (
    <div className="space-y-4">
      {/* Authority banner */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 to-rose-500/5 p-4 suika-glow">
        <div className="rounded-lg bg-emerald-500/15 p-2.5">
          <Scale className="h-5 w-5 text-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">SUIKA X Constitution</h2>
            <Tag tone="emerald">v{snap?.version ?? "—"}</Tag>
            <Tag tone="rose"><Lock className="mr-1 inline h-2.5 w-2.5" />root authority</Tag>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The root authority for every agent and subsystem. Gates all agent dispatch via compliance evaluation.
          </p>
        </div>
        <div className="flex gap-4 text-center">
          <div>
            <p className="font-mono text-lg">{snap?.counts.articles ?? "—"}</p>
            <p className="text-[10px] text-muted-foreground">articles</p>
          </div>
          <div>
            <p className="font-mono text-lg text-amber-400">{snap?.counts.amendments.proposed ?? "—"}</p>
            <p className="text-[10px] text-muted-foreground">pending</p>
          </div>
          <div>
            <p className="font-mono text-lg text-rose-400">{snap?.counts.violations ?? "—"}</p>
            <p className="text-[10px] text-muted-foreground">violations</p>
          </div>
          <div>
            <p className="font-mono text-lg">{snap?.counts.evaluations ?? "—"}</p>
            <p className="text-[10px] text-muted-foreground">evaluations</p>
          </div>
        </div>
      </div>

      {/* The five sections */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {SECTION_ORDER.map((sec) => {
          const meta = SECTION_META[sec];
          const articles = snap?.sections[sec] ?? [];
          const immutableCount = articles.filter((a) => a.immutable).length;
          return (
            <SectionCard
              key={sec}
              title={meta.label}
              desc={meta.desc}
              right={
                <div className="flex items-center gap-1.5">
                  <Tag tone={meta.tone}>{articles.length}</Tag>
                  {immutableCount > 0 && <Tag tone="rose">{immutableCount} immutable</Tag>}
                </div>
              }
              bodyClassName="p-3"
              className={sec === "principles" ? "lg:col-span-2" : ""}
            >
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded bg-muted/40" />
                  ))}
                </div>
              ) : articles.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">No active articles in this section.</p>
              ) : (
                <div className="space-y-2">
                  {articles.map((a) => (
                    <ArticleCard key={a.id} article={a} />
                  ))}
                </div>
              )}
            </SectionCard>
          );
        })}
      </div>

      {/* Evaluate console */}
      <EvaluateConsole />

      {/* Amendment + Audit log side by side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AmendmentPanel />
        <EvaluationLog />
      </div>
    </div>
  );
}

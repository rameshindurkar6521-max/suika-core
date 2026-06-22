/**
 * SUIKA X — Identity Engine view. The persistent self-definition dashboard.
 *
 *  Renders the active identity snapshot (who SUIKA currently *is*) plus the
 *  evolution spine: history of every version, a diff console for comparing
 *  two versions, and the append-only audit log of every identity mutation.
 *
 *  Sections:
 *    1. Identity banner — name, version, compliance verdict badge,
 *       communication-style chips (tone/pace/formality/markers).
 *    2. KPI row — version, traits, domains, growth events.
 *    3. Mission interpretation — highlighted card.
 *    4. Persona + long-term traits — trait tags.
 *    5. Expertise domains — level meters.
 *    6. Behavioral preferences — key/value list.
 *    7. Growth history — timeline.
 *    8. Evolution history — every version (newest first), click to inspect.
 *    9. Diff console — from/to selectors + structured field-by-field diff.
 *   10. Audit log — action, from→to version, actor, timestamp.
 *
 *  Constitution integration: a snapshot with complianceVerdict="violation"
 *  cannot be activated — its badge shows rose, and the banner explains that
 *  the snapshot is dormant until either the constitution is amended or the
 *  snapshot is revised to comply.
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
import { toast } from "sonner";
import {
  Fingerprint,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock3,
  History as HistoryIcon,
  GitCompare,
  ScrollText,
  Target,
  Brain,
  Sparkles,
  Layers,
  ChevronRight,
  RefreshCw,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  IdentitySnapshotDTO,
  IdentityDiff,
  IdentityComplianceVerdict,
} from "@/lib/suika/types";

// ─── verdict styling ─────────────────────────────────────────────────────────

const verdictTone: Record<
  IdentityComplianceVerdict,
  "emerald" | "rose" | "amber" | "muted"
> = {
  compliant: "emerald",
  violation: "rose",
  warning: "amber",
  pending: "muted",
};

const verdictIcon: Record<IdentityComplianceVerdict, React.ReactNode> = {
  compliant: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  violation: <XCircle className="h-4 w-4 text-rose-400" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  pending: <Clock3 className="h-4 w-4 text-muted-foreground" />,
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.length ? v.map(formatValue).join(", ") : "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// ─── banner ──────────────────────────────────────────────────────────────────

function IdentityBanner({ snap }: { snap: IdentitySnapshotDTO | null }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-rose-500/5 p-4 suika-glow">
      <div className="rounded-lg bg-emerald-500/15 p-2.5">
        <Fingerprint className="h-5 w-5 text-emerald-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">
            {snap ? snap.name : "No active identity"}
          </h2>
          {snap && (
            <>
              <Tag tone="emerald">v{snap.version}</Tag>
              <Tag tone={verdictTone[snap.complianceVerdict]}>
                <span className="mr-1 inline-flex items-center align-middle">
                  {verdictIcon[snap.complianceVerdict]}
                </span>
                {snap.complianceVerdict}
              </Tag>
              {snap.isActive ? (
                <Tag tone="emerald">
                  <StatusDot tone="emerald" pulse /> active
                </Tag>
              ) : (
                <Tag tone="muted">dormant</Tag>
              )}
            </>
          )}
        </div>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
          {snap
            ? snap.persona
            : "No identity snapshot has been activated yet. Create one below."}
        </p>
      </div>

      {snap && (
        <div className="flex flex-wrap gap-1.5">
          <Tag tone="sky">tone: {snap.communicationStyle.tone}</Tag>
          <Tag tone="sky">pace: {snap.communicationStyle.pace}</Tag>
          <Tag tone="sky">formality: {snap.communicationStyle.formality}</Tag>
          {snap.communicationStyle.markers.length > 0 &&
            snap.communicationStyle.markers.slice(0, 3).map((m) => (
              <Tag key={m} tone="violet">
                #{m}
              </Tag>
            ))}
        </div>
      )}
    </div>
  );
}

// ─── mission card ────────────────────────────────────────────────────────────

function MissionCard({ snap }: { snap: IdentitySnapshotDTO }) {
  return (
    <SectionCard
      title="Mission interpretation"
      desc="SUIKA's interpretation of its core purpose — the lens through which every action is evaluated."
      right={
        <div className="flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5 text-emerald-400" />
          <Tag tone="emerald">mission</Tag>
        </div>
      }
      className="border-emerald-500/30"
    >
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
        <p className="text-sm leading-relaxed text-foreground/90">
          {snap.missionInterpretation}
        </p>
        {snap.rationale && (
          <p className="mt-3 border-t border-emerald-500/10 pt-2 text-xs text-muted-foreground">
            <span className="text-emerald-400/70">rationale:</span> {snap.rationale}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span className="font-mono">created by {snap.createdBy}</span>
          <span>·</span>
          <span>{timeAgo(snap.createdAt)} ago</span>
          {snap.complianceEvaluationId && (
            <>
              <span>·</span>
              <span className="font-mono text-emerald-400/70">
                eval #{snap.complianceEvaluationId.slice(-8)}
              </span>
            </>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

// ─── persona + traits ────────────────────────────────────────────────────────

function PersonaTraitsCard({ snap }: { snap: IdentitySnapshotDTO }) {
  return (
    <SectionCard
      title="Persona & long-term traits"
      desc="Stable disposition. Persona is the outward character; traits are the durable behavioral tendencies."
      right={<Brain className="h-4 w-4 text-sky-400" />}
    >
      <div className="space-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            persona
          </p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/90">
            {snap.persona}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            long-term traits ({snap.longTermTraits.length})
          </p>
          {snap.longTermTraits.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">No traits recorded.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {snap.longTermTraits.map((t) => (
                <Tag key={t} tone="violet">
                  {t}
                </Tag>
              ))}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

// ─── expertise domains ───────────────────────────────────────────────────────

function ExpertiseCard({ snap }: { snap: IdentitySnapshotDTO }) {
  return (
    <SectionCard
      title="Expertise domains"
      desc="Self-assessed capability levels with supporting evidence. 0–100 scale."
      right={<Layers className="h-4 w-4 text-amber-400" />}
    >
      {snap.expertiseDomains.length === 0 ? (
        <p className="text-xs text-muted-foreground">No expertise domains recorded.</p>
      ) : (
        <ul className="space-y-3">
          {snap.expertiseDomains.map((d) => {
            const tone =
              d.level >= 75 ? "emerald" : d.level >= 40 ? "amber" : "rose";
            return (
              <li key={d.domain} className="rounded-lg border border-border/50 bg-card/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{d.domain}</p>
                    {d.evidence.length > 0 && (
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                        {d.evidence.join(" · ")}
                      </p>
                    )}
                  </div>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {d.level}
                  </span>
                </div>
                <div className="mt-2">
                  <Meter value={d.level / 100} tone={tone} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

// ─── behavioral preferences ──────────────────────────────────────────────────

function PreferencesCard({ snap }: { snap: IdentitySnapshotDTO }) {
  const entries = Object.entries(snap.behavioralPreferences);
  return (
    <SectionCard
      title="Behavioral preferences"
      desc="Tunable knobs that shape runtime decisions — when to confirm, when to summarize, etc."
      right={<Sparkles className="h-4 w-4 text-violet-400" />}
    >
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No preferences recorded.</p>
      ) : (
        <dl className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {entries.map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between gap-2 rounded border border-border/40 bg-card/30 px-2.5 py-1.5"
            >
              <dt className="font-mono text-[11px] text-muted-foreground">{k}</dt>
              <dd className="truncate text-xs text-foreground/90">
                {formatValue(v)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </SectionCard>
  );
}

// ─── growth history timeline ─────────────────────────────────────────────────

function GrowthTimelineCard({ snap }: { snap: IdentitySnapshotDTO }) {
  return (
    <SectionCard
      title="Growth history"
      desc="Formative events that shaped this identity version. Append-only across versions."
      right={<HistoryIcon className="h-4 w-4 text-sky-400" />}
    >
      {snap.growthHistory.length === 0 ? (
        <p className="text-xs text-muted-foreground">No growth events recorded.</p>
      ) : (
        <ol className="relative space-y-3 border-l border-border/60 pl-4">
          {snap.growthHistory.map((g, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[21px] top-1 flex h-3 w-3 items-center justify-center rounded-full border border-emerald-500/40 bg-background">
                <CircleDot className="h-2 w-2 text-emerald-400" />
              </span>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{g.event}</p>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {new Date(g.at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span className="text-emerald-400/70">lesson:</span> {g.lesson}
              </p>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

// ─── evolution history ───────────────────────────────────────────────────────

function EvolutionHistory({
  snapshots,
  selectedVersion,
  onSelect,
}: {
  snapshots: IdentitySnapshotDTO[];
  selectedVersion: number | null;
  onSelect: (version: number) => void;
}) {
  return (
    <SectionCard
      title="Evolution history"
      desc="Every identity snapshot ever created, newest first. Old versions are retained forever."
      right={<Tag tone="muted">{snapshots.length} versions</Tag>}
      bodyClassName="p-0"
    >
      {snapshots.length === 0 ? (
        <p className="p-6 text-center text-xs text-muted-foreground">
          No snapshots yet — create one with the button above.
        </p>
      ) : (
        <ScrollArea className="suika-scroll max-h-80">
          <ul className="divide-y divide-border/40">
            {snapshots.map((s) => {
              const isSelected = s.version === selectedVersion;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => onSelect(s.version)}
                    className={cn(
                      "flex w-full items-start gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/30",
                      isSelected && "bg-emerald-500/5"
                    )}
                  >
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/30 font-mono text-xs">
                      v{s.version}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-xs font-medium">{s.name}</p>
                        {s.isActive && <Tag tone="emerald">active</Tag>}
                        <Tag tone={verdictTone[s.complianceVerdict]}>
                          {s.complianceVerdict}
                        </Tag>
                      </div>
                      {s.rationale && (
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                          {s.rationale}
                        </p>
                      )}
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {new Date(s.createdAt).toLocaleString()} · {timeAgo(s.createdAt)} ago · by {s.createdBy}
                      </p>
                    </div>
                    {isSelected && (
                      <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </SectionCard>
  );
}

// ─── diff console ────────────────────────────────────────────────────────────

function DiffConsole({ versions }: { versions: number[] }) {
  const bump = useSuika((s) => s.bump);
  const qc = useQueryClient();
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [diff, setDiff] = useState<IdentityDiff | null>(null);

  // Default the selectors to the two newest versions when versions arrive.
  const effectiveFrom = from || (versions[1] != null ? String(versions[1]) : "");
  const effectiveTo = to || (versions[0] != null ? String(versions[0]) : "");

  const runDiff = useMutation({
    mutationFn: () => {
      const f = Number(effectiveFrom);
      const t = Number(effectiveTo);
      if (!Number.isFinite(f) || !Number.isFinite(t)) {
        throw new Error("Select both from and to versions");
      }
      return api.identity.diff(f, t);
    },
    onSuccess: (d) => {
      setDiff(d.diff);
      toast.success(
        `Diff v${d.diff.fromVersion}→v${d.diff.toVersion}: ${d.diff.changed.length} changed`
      );
      qc.invalidateQueries({ queryKey: ["identity-audit"] });
      bump();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setDiff(null);
    },
  });

  return (
    <SectionCard
      title="Identity diff console"
      desc="Compare two versions field-by-field. Produces a structured change-set with human-readable summaries."
      right={<GitCompare className="h-4 w-4 text-sky-400" />}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1">
            <Label className="text-xs">From version</Label>
            <Select value={effectiveFrom} onValueChange={setFrom}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="select…" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v} value={String(v)}>
                    v{v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To version</Label>
            <Select value={effectiveTo} onValueChange={setTo}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="select…" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v} value={String(v)}>
                    v{v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              size="sm"
              onClick={() => runDiff.mutate()}
              disabled={
                runDiff.isPending ||
                !effectiveFrom ||
                !effectiveTo ||
                effectiveFrom === effectiveTo
              }
              className="h-9"
            >
              <GitCompare className="h-4 w-4" />
              {runDiff.isPending ? "Diffing…" : "Diff"}
            </Button>
          </div>
        </div>

        {diff && (
          <div className="rounded-lg border border-border/50 bg-card/30 p-3">
            <div className="flex items-center gap-2">
              <Tag tone="sky">
                v{diff.fromVersion} → v{diff.toVersion}
              </Tag>
              <Tag tone={diff.changed.length > 0 ? "amber" : "emerald"}>
                {diff.changed.length} changed
              </Tag>
              <Tag tone="muted">{diff.unchanged.length} unchanged</Tag>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{diff.summary}</p>

            {diff.changed.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  changed fields
                </p>
                <ScrollArea className="suika-scroll max-h-56">
                  <ul className="space-y-1">
                    {diff.changed.map((c, i) => (
                      <li
                        key={i}
                        className="rounded border border-amber-500/20 bg-amber-500/5 p-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] text-amber-300">
                            {c.field}
                          </span>
                        </div>
                        <p className="mt-0.5 text-muted-foreground">{c.summary}</p>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}
            {diff.unchanged.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-muted-foreground">unchanged:</span>
                {diff.unchanged.map((f) => (
                  <Tag key={f} tone="muted">
                    {f}
                  </Tag>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ─── audit log ───────────────────────────────────────────────────────────────

function AuditLogPanel() {
  const tick = useSuika((s) => s.tick);
  const { data, isLoading } = useQuery({
    queryKey: ["identity-audit", tick],
    queryFn: () => api.identity.getAuditLog(80),
    refetchInterval: 6000,
  });
  const entries = data?.audit ?? [];

  return (
    <SectionCard
      title="Identity audit log"
      desc="Append-only record of every create / activate / diff / compliance_check / seed action."
      right={<ScrollText className="h-4 w-4 text-violet-400" />}
      bodyClassName="p-0"
    >
      {isLoading ? (
        <div className="p-3 text-xs text-muted-foreground">Loading audit log…</div>
      ) : entries.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          No audit entries yet.
        </div>
      ) : (
        <ScrollArea className="suika-scroll max-h-80">
          <ul className="divide-y divide-border/40">
            {entries.map((e) => (
              <li key={e.id} className="px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <Tag tone="sky">{e.action}</Tag>
                  {e.fromVersion != null && e.toVersion != null ? (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      v{e.fromVersion} → v{e.toVersion}
                    </span>
                  ) : e.toVersion != null ? (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      → v{e.toVersion}
                    </span>
                  ) : e.fromVersion != null ? (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      v{e.fromVersion} →
                    </span>
                  ) : null}
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {timeAgo(e.createdAt)} ago
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>by {e.actor}</span>
                  {Object.keys(e.detail).length > 0 && (
                    <span className="truncate font-mono text-[10px]">
                      {JSON.stringify(e.detail)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </SectionCard>
  );
}

// ─── create snapshot form ────────────────────────────────────────────────────

function CreateSnapshotForm({ versions }: { versions: number[] }) {
  const qc = useQueryClient();
  const bump = useSuika((s) => s.bump);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [mission, setMission] = useState("");
  const [rationale, setRationale] = useState("");
  const [traits, setTraits] = useState("");
  const [tone, setTone] = useState("warm");
  const [pace, setPace] = useState("measured");
  const [formality, setFormality] = useState("balanced");

  const create = useMutation({
    mutationFn: () => {
      const longTermTraits = traits
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      return api.identity.create({
        name: name.trim(),
        persona: persona.trim(),
        missionInterpretation: mission.trim() || undefined,
        rationale: rationale.trim() || undefined,
        longTermTraits: longTermTraits.length ? longTermTraits : undefined,
        communicationStyle: { tone, pace, formality },
        createdBy: "user",
        validateConstitution: true,
      });
    },
    onSuccess: (d) => {
      const v = d.snapshot.version;
      if (!d.snapshot.isActive && d.snapshot.complianceVerdict === "violation") {
        toast.warning(
          `Snapshot v${v} persisted but NOT activated — constitution violation.`
        );
      } else {
        toast.success(`Identity snapshot v${v} created and activated`);
      }
      setName("");
      setPersona("");
      setMission("");
      setRationale("");
      setTraits("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["identity-active"] });
      qc.invalidateQueries({ queryKey: ["identity-history"] });
      qc.invalidateQueries({ queryKey: ["identity-audit"] });
      bump();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nextVersionGuess = versions.length ? Math.max(...versions) + 1 : 1;

  return (
    <SectionCard
      title="Create new identity snapshot"
      desc="Mints a new versioned snapshot. The previous active version is deactivated. Constitution validation runs automatically."
      right={
        <Button
          size="sm"
          variant={open ? "ghost" : "outline"}
          onClick={() => setOpen((o) => !o)}
        >
          <Sparkles className="h-4 w-4" />
          {open ? "Cancel" : "New snapshot"}
        </Button>
      }
    >
      {open ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Name (next: v{nextVersionGuess})</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Suika v2 — Reflective Companion"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Long-term traits (comma-sep)</Label>
              <Input
                value={traits}
                onChange={(e) => setTraits(e.target.value)}
                placeholder="curious, deliberate, candid"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Persona</Label>
            <Textarea
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              rows={2}
              placeholder="A one-paragraph description of who SUIKA is at this version…"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mission interpretation</Label>
            <Textarea
              value={mission}
              onChange={(e) => setMission(e.target.value)}
              rows={2}
              placeholder="SUIKA's current interpretation of its core mission…"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Rationale (why this version exists)</Label>
            <Input
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="e.g. Sharpened mission focus after Q3 review"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Tone</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["warm", "neutral", "playful", "formal"].map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Pace</Label>
              <Select value={pace} onValueChange={setPace}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["measured", "brisk", "deliberate", "rapid"].map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Formality</Label>
              <Select value={formality} onValueChange={setFormality}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["balanced", "casual", "professional", "technical"].map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => create.mutate()}
            disabled={
              create.isPending || !name.trim() || !persona.trim()
            }
          >
            <Fingerprint className="h-4 w-4" />
            {create.isPending ? "Creating…" : "Create snapshot"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Click <span className="text-emerald-400">New snapshot</span> to draft a new
          identity version. All fields optional except name + persona; constitution
          validation runs server-side.
        </p>
      )}
    </SectionCard>
  );
}

// ─── re-validate button (inline) ─────────────────────────────────────────────

function RevalidateButton({ version }: { version: number }) {
  const qc = useQueryClient();
  const bump = useSuika((s) => s.bump);
  const m = useMutation({
    mutationFn: () => api.identity.validate(version),
    onSuccess: (d) => {
      toast.success(`Re-validated v${version}: ${d.verdict}`);
      qc.invalidateQueries({ queryKey: ["identity-history"] });
      qc.invalidateQueries({ queryKey: ["identity-active"] });
      qc.invalidateQueries({ queryKey: ["identity-audit"] });
      bump();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      onClick={() => m.mutate()}
      disabled={m.isPending}
      title="Re-validate this version against the current constitution"
    >
      <RefreshCw className={cn("h-3 w-3", m.isPending && "animate-spin")} />
      Re-validate
    </Button>
  );
}

// ─── main view ───────────────────────────────────────────────────────────────

export function IdentityView() {
  const tick = useSuika((s) => s.tick);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  const activeQ = useQuery({
    queryKey: ["identity-active", tick],
    queryFn: () => api.identity.getActive(),
    refetchInterval: 8000,
  });
  const historyQ = useQuery({
    queryKey: ["identity-history", tick],
    queryFn: () => api.identity.getHistory(50),
    refetchInterval: 8000,
  });

  const active = activeQ.data?.snapshot ?? null;
  const history = historyQ.data?.snapshots ?? [];
  const versions = useMemo(() => history.map((h) => h.version), [history]);

  // If the user has selected a historical version, fetch + show it; otherwise
  // show the active snapshot (or null on a fresh boot).
  const selectedSnapQ = useQuery({
    queryKey: ["identity-version", selectedVersion, tick],
    queryFn: () => api.identity.getVersion(selectedVersion as number),
    enabled: selectedVersion != null,
  });

  const displayed: IdentitySnapshotDTO | null =
    selectedVersion != null
      ? selectedSnapQ.data?.snapshot ?? null
      : active;

  return (
    <div className="space-y-4">
      <IdentityBanner snap={active} />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Active version"
          value={active ? `v${active.version}` : "—"}
          sub={active ? `${timeAgo(active.createdAt)} ago` : "no snapshot"}
          icon={Fingerprint}
          accent="emerald"
        />
        <KpiCard
          label="Long-term traits"
          value={active?.longTermTraits.length ?? 0}
          sub="durable tendencies"
          icon={Brain}
          accent="violet"
        />
        <KpiCard
          label="Expertise domains"
          value={active?.expertiseDomains.length ?? 0}
          sub="capability areas"
          icon={Layers}
          accent="amber"
        />
        <KpiCard
          label="Growth events"
          value={active?.growthHistory.length ?? 0}
          sub="formative moments"
          icon={HistoryIcon}
          accent="sky"
        />
      </div>

      {/* Selected-version banner (if inspecting a non-active version) */}
      {selectedVersion != null && displayed && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-2.5 text-xs">
          <HistoryIcon className="h-3.5 w-3.5 text-sky-400" />
          <span className="text-muted-foreground">
            Inspecting snapshot <span className="font-mono text-sky-300">v{displayed.version}</span>
            {displayed.isActive ? " (active)" : " (historical)"}.
          </span>
          <button
            onClick={() => setSelectedVersion(null)}
            className="ml-auto rounded border border-border/50 px-1.5 py-0.5 text-[10px] hover:bg-muted/30"
          >
            show active
          </button>
          <RevalidateButton version={displayed.version} />
        </div>
      )}

      {/* Mission + Persona + Traits row */}
      {displayed ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MissionCard snap={displayed} />
            <PersonaTraitsCard snap={displayed} />
          </div>

          {/* Expertise + Preferences */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ExpertiseCard snap={displayed} />
            <PreferencesCard snap={displayed} />
          </div>

          {/* Growth timeline full width */}
          <GrowthTimelineCard snap={displayed} />
        </>
      ) : (
        <SectionCard
          title="No identity to display"
          desc="An identity snapshot defines who SUIKA currently is. Create one to begin."
        >
          <p className="text-xs text-muted-foreground">
            The Identity Engine is empty. Use the form below to mint the first
            snapshot — it will be validated against the Constitution before activation.
          </p>
        </SectionCard>
      )}

      {/* Create new snapshot form */}
      <CreateSnapshotForm versions={versions} />

      {/* Evolution history + Audit log */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <EvolutionHistory
          snapshots={history}
          selectedVersion={selectedVersion}
          onSelect={setSelectedVersion}
        />
        <AuditLogPanel />
      </div>

      {/* Diff console full width */}
      <DiffConsole versions={versions} />
    </div>
  );
}

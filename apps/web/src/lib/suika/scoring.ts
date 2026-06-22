/**
 * SUIKA X — Memory scoring: importance estimation, decay, consolidation.
 *
 * importance(t) ∈ [0,1] is estimated from content signals (length, structure,
 * named entities, action verbs). decay(t) = exp(-λ * ageHours) where λ scales
 * with inverse importance (important memories decay slower). effectiveScore =
 * importance * decay. Consolidation merges low-importance episodic memories that
 * share tags into higher-level semantic memories.
 */
import type { MemoryKind } from "./types";

export function estimateImportance(content: string, kind: MemoryKind): number {
  const len = content.length;
  const lengthScore = Math.min(1, len / 600);

  // Named-entity-ish signals (capitalized tokens, numbers, acronyms)
  const capTokens = (content.match(/\b[A-Z][a-zA-Z]{2,}\b/g) || []).length;
  const numbers = (content.match(/\b\d+(\.\d+)?\b/g) || []).length;
  const entityScore = Math.min(1, (capTokens + numbers) / 12);

  // Action verbs for procedural memory
  const verbs = /(create|build|deploy|run|execute|analyze|fetch|store|update|delete|send|compute|verify)/gi;
  const actionScore = kind === "procedural" ? Math.min(1, (content.match(verbs) || []).length / 6) : 0.2;

  // Structural richness
  const struct = (content.match(/[;:\n•\-]/g) || []).length;
  const structScore = Math.min(1, struct / 10);

  const weights =
    kind === "episodic"
      ? { length: 0.25, entity: 0.35, struct: 0.2, action: 0.2 }
      : kind === "semantic"
        ? { length: 0.3, entity: 0.4, struct: 0.2, action: 0.1 }
        : { length: 0.2, entity: 0.1, struct: 0.3, action: 0.4 };

  const score =
    lengthScore * weights.length +
    entityScore * weights.entity +
    structScore * weights.struct +
    actionScore * weights.action;

  return Math.max(0.05, Math.min(1, Number(score.toFixed(3))));
}

/**
 * Exponential decay. Important memories decay slower: λ = 0.02 / (importance + 0.2).
 * At importance 1.0 → λ≈0.0167 (half-life ~41h). At importance 0.2 → λ≈0.05 (half-life ~14h).
 */
export function decayFactor(
  ageHours: number,
  importance: number,
  accessCount: number
): number {
  const lambda = 0.02 / (importance + 0.2);
  // Each access boosts retention (rehearsal)
  const rehearsalBoost = Math.exp(-lambda * ageHours) * (1 + 0.05 * Math.min(accessCount, 20));
  return Math.max(0, Math.min(1, Number(rehearsalBoost.toFixed(4))));
}

export function effectiveScore(importance: number, decay: number): number {
  return Number((importance * decay).toFixed(4));
}

export interface ConsolidationResult {
  merged: Array<{ intoId: string; fromIds: string[]; summary: string }>;
}

/**
 * Consolidation: group episodic memories by shared tag, pick the highest-importance
 * one as the anchor, merge the rest into it (mark consolidated), and produce a
 * synthesized summary line. This mirrors memory consolidation in biological systems.
 */
export function planConsolidation(
  memories: Array<{
    id: string;
    kind: MemoryKind;
    content: string;
    importance: number;
    tags: string[];
    consolidated: boolean;
  }>
): ConsolidationResult {
  const episodic = memories.filter((m) => m.kind === "episodic" && !m.consolidated);
  const groups = new Map<string, typeof episodic>();
  for (const m of episodic) {
    const key = m.tags.slice().sort().join(",") || "_untagged";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }
  const merged: ConsolidationResult["merged"] = [];
  for (const [, group] of groups) {
    if (group.length < 3) continue;
    group.sort((a, b) => b.importance - a.importance);
    const anchor = group[0];
    const rest = group.slice(1);
    const summary = `Consolidated ${group.length} episodic traces around [${anchor.tags.join(", ")}] → "${truncate(anchor.content, 80)}"`;
    merged.push({ intoId: anchor.id, fromIds: rest.map((m) => m.id), summary });
  }
  return { merged };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

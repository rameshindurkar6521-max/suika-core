/**
 * SUIKA X — Relationship Engine service layer.
 *
 * Maintains a structured understanding of the served human. Provides:
 *
 *   1. Profile management — get/create/update the RelationshipProfile.
 *   2. Goal graph         — self-referential hierarchy with progress + priority.
 *   3. Project graph      — links to goals + memories.
 *   4. Trait store        — skills / strengths / weaknesses / preferences /
 *                           ambitions, discriminated by `kind`.
 *   5. Milestones         — dated achievements linked to goals.
 *   6. Decisions          — recorded with rationale + outcome.
 *   7. Interactions       — append-only interaction log.
 *   8. Context query      — `getContext()` returns a compact summary that the
 *                           Agent Runtime queries before planning.
 *   9. Analytics          — `getAnalytics()` aggregates across all record types.
 *
 * The Constitution governs this engine: destructive operations (delete profile,
 * erase interactions) are not exposed — correction is by annotation, per the
 * data-integrity immutable principle.
 */
import { db } from "@/lib/db";
import { emit } from "@/lib/suika/kernel";
import { readJSON, writeJSON } from "@/lib/suika/json";
import type {
  InteractionDTO,
  InteractionSentiment,
  RelationshipAnalytics,
  RelationshipContext,
  RelationshipDecisionDTO,
  RelationshipGoalDTO,
  RelationshipGoalStatus,
  RelationshipMilestoneDTO,
  RelationshipProfileDTO,
  RelationshipProjectDTO,
  RelationshipProjectStatus,
  RelationshipTraitDTO,
  RelationshipTraitKind,
  DecisionOutcome,
} from "@/lib/suika/types";

// ─── DTO serializers ─────────────────────────────────────────────────────────

type ProfileRow = {
  id: string;
  name: string;
  role: string;
  relationshipType: string;
  bio: string;
  timezone: string;
  communicationPrefs: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toProfileDTO(p: ProfileRow): RelationshipProfileDTO {
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    relationshipType: p.relationshipType,
    bio: p.bio,
    timezone: p.timezone,
    communicationPrefs: readJSON<Record<string, unknown>>(
      p.communicationPrefs,
      {}
    ),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

type GoalRow = {
  id: string;
  profileId: string;
  parentId: string | null;
  title: string;
  description: string;
  status: string;
  priority: number;
  progress: number;
  targetDate: Date | null;
  achievedAt: Date | null;
  linkedProjectIds: string;
  linkedMemoryIds: string;
  tags: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toGoalDTO(g: GoalRow): RelationshipGoalDTO {
  return {
    id: g.id,
    profileId: g.profileId,
    parentId: g.parentId,
    title: g.title,
    description: g.description,
    status: g.status as RelationshipGoalStatus,
    priority: g.priority,
    progress: g.progress,
    targetDate: g.targetDate ? g.targetDate.toISOString() : null,
    achievedAt: g.achievedAt ? g.achievedAt.toISOString() : null,
    linkedProjectIds: readJSON<string[]>(g.linkedProjectIds, []),
    linkedMemoryIds: readJSON<string[]>(g.linkedMemoryIds, []),
    tags: readJSON<string[]>(g.tags, []),
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

type ProjectRow = {
  id: string;
  profileId: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  progress: number;
  linkedGoalIds: string;
  linkedMemoryIds: string;
  tags: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toProjectDTO(p: ProjectRow): RelationshipProjectDTO {
  return {
    id: p.id,
    profileId: p.profileId,
    title: p.title,
    description: p.description,
    status: p.status as RelationshipProjectStatus,
    priority: p.priority,
    progress: p.progress,
    linkedGoalIds: readJSON<string[]>(p.linkedGoalIds, []),
    linkedMemoryIds: readJSON<string[]>(p.linkedMemoryIds, []),
    tags: readJSON<string[]>(p.tags, []),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

type TraitRow = {
  id: string;
  profileId: string;
  kind: string;
  name: string;
  description: string;
  level: number;
  metadata: string;
  createdAt: Date;
};

export function toTraitDTO(t: TraitRow): RelationshipTraitDTO {
  return {
    id: t.id,
    profileId: t.profileId,
    kind: t.kind as RelationshipTraitKind,
    name: t.name,
    description: t.description,
    level: t.level,
    metadata: readJSON<Record<string, unknown>>(t.metadata, {}),
    createdAt: t.createdAt.toISOString(),
  };
}

type MilestoneRow = {
  id: string;
  profileId: string;
  title: string;
  description: string;
  date: Date;
  achieved: boolean;
  significance: number;
  linkedGoalIds: string;
  createdAt: Date;
};

export function toMilestoneDTO(m: MilestoneRow): RelationshipMilestoneDTO {
  return {
    id: m.id,
    profileId: m.profileId,
    title: m.title,
    description: m.description,
    date: m.date.toISOString(),
    achieved: m.achieved,
    significance: m.significance,
    linkedGoalIds: readJSON<string[]>(m.linkedGoalIds, []),
    createdAt: m.createdAt.toISOString(),
  };
}

type DecisionRow = {
  id: string;
  profileId: string;
  title: string;
  context: string;
  options: string;
  chosen: string;
  rationale: string;
  outcome: string;
  decidedAt: Date;
  createdAt: Date;
};

export function toDecisionDTO(d: DecisionRow): RelationshipDecisionDTO {
  return {
    id: d.id,
    profileId: d.profileId,
    title: d.title,
    context: d.context,
    options: readJSON<string[]>(d.options, []),
    chosen: d.chosen,
    rationale: d.rationale,
    outcome: d.outcome as DecisionOutcome,
    decidedAt: d.decidedAt.toISOString(),
    createdAt: d.createdAt.toISOString(),
  };
}

type InteractionRow = {
  id: string;
  profileId: string;
  kind: string;
  summary: string;
  sentiment: string;
  topics: string;
  linkedTaskId: string | null;
  createdAt: Date;
};

export function toInteractionDTO(i: InteractionRow): InteractionDTO {
  return {
    id: i.id,
    profileId: i.profileId,
    kind: i.kind,
    summary: i.summary,
    sentiment: i.sentiment as InteractionSentiment,
    topics: readJSON<string[]>(i.topics, []),
    linkedTaskId: i.linkedTaskId,
    createdAt: i.createdAt.toISOString(),
  };
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export async function getProfile(
  profileId?: string
): Promise<RelationshipProfileDTO | null> {
  const row = profileId
    ? await db.relationshipProfile.findUnique({ where: { id: profileId } })
    : await db.relationshipProfile.findFirst({
        where: { relationshipType: "primary" },
      });
  return row ? toProfileDTO(row) : null;
}

export async function listProfiles(): Promise<RelationshipProfileDTO[]> {
  const rows = await db.relationshipProfile.findMany({
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toProfileDTO);
}

export async function createProfile(input: {
  name: string;
  role?: string;
  relationshipType?: string;
  bio?: string;
  timezone?: string;
  communicationPrefs?: Record<string, unknown>;
}): Promise<RelationshipProfileDTO> {
  const row = await db.relationshipProfile.create({
    data: {
      name: input.name,
      role: input.role ?? "user",
      relationshipType: input.relationshipType ?? "primary",
      bio: input.bio ?? "",
      timezone: input.timezone ?? "Asia/Calcutta",
      communicationPrefs: writeJSON(input.communicationPrefs ?? {}),
    },
  });
  await emit("info", "runtime", `Relationship profile created: ${input.name}`, {
    id: row.id,
    role: row.role,
  });
  return toProfileDTO(row);
}

export async function updateProfile(
  id: string,
  input: Partial<{
    name: string;
    role: string;
    bio: string;
    timezone: string;
    communicationPrefs: Record<string, unknown>;
  }>
): Promise<RelationshipProfileDTO> {
  const row = await db.relationshipProfile.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.role !== undefined && { role: input.role }),
      ...(input.bio !== undefined && { bio: input.bio }),
      ...(input.timezone !== undefined && { timezone: input.timezone }),
      ...(input.communicationPrefs !== undefined && {
        communicationPrefs: writeJSON(input.communicationPrefs),
      }),
    },
  });
  return toProfileDTO(row);
}

// ─── Goals (goal graph) ──────────────────────────────────────────────────────

export async function listGoals(
  profileId: string,
  opts: { status?: string; includeChildren?: boolean } = {}
): Promise<RelationshipGoalDTO[]> {
  const rows = await db.relationshipGoal.findMany({
    where: {
      profileId,
      ...(opts.status ? { status: opts.status } : {}),
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  const dtos = rows.map(toGoalDTO);
  if (opts.includeChildren) {
    // Build a tree: roots are goals with no parentId.
    const byId = new Map(dtos.map((g) => [g.id, { ...g, children: [] as RelationshipGoalDTO[] }]));
    const roots: RelationshipGoalDTO[] = [];
    for (const g of byId.values()) {
      if (g.parentId && byId.has(g.parentId)) {
        byId.get(g.parentId)!.children!.push(g);
      } else {
        roots.push(g);
      }
    }
    return roots;
  }
  return dtos;
}

export async function createGoal(input: {
  profileId: string;
  parentId?: string;
  title: string;
  description?: string;
  status?: RelationshipGoalStatus;
  priority?: number;
  progress?: number;
  targetDate?: string;
  tags?: string[];
}): Promise<RelationshipGoalDTO> {
  const row = await db.relationshipGoal.create({
    data: {
      profileId: input.profileId,
      parentId: input.parentId ?? null,
      title: input.title,
      description: input.description ?? "",
      status: input.status ?? "active",
      priority: input.priority ?? 50,
      progress: input.progress ?? 0,
      targetDate: input.targetDate ? new Date(input.targetDate) : null,
      tags: writeJSON(input.tags ?? []),
    },
  });
  await emit("info", "runtime", `Goal created: ${input.title}`, {
    id: row.id,
    priority: row.priority,
  });
  return toGoalDTO(row);
}

export async function updateGoal(
  id: string,
  input: Partial<{
    title: string;
    description: string;
    status: RelationshipGoalStatus;
    priority: number;
    progress: number;
    targetDate: string | null;
    tags: string[];
  }>
): Promise<RelationshipGoalDTO> {
  const row = await db.relationshipGoal.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.progress !== undefined && { progress: input.progress }),
      ...(input.targetDate !== undefined && {
        targetDate: input.targetDate ? new Date(input.targetDate) : null,
      }),
      ...(input.tags !== undefined && { tags: writeJSON(input.tags) }),
      ...(input.status === "achieved" && { achievedAt: new Date() }),
    },
  });
  return toGoalDTO(row);
}

// ─── Projects (project graph) ────────────────────────────────────────────────

export async function listProjects(
  profileId: string,
  opts: { status?: string } = {}
): Promise<RelationshipProjectDTO[]> {
  const rows = await db.relationshipProject.findMany({
    where: {
      profileId,
      ...(opts.status ? { status: opts.status } : {}),
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  return rows.map(toProjectDTO);
}

export async function createProject(input: {
  profileId: string;
  title: string;
  description?: string;
  status?: RelationshipProjectStatus;
  priority?: number;
  progress?: number;
  linkedGoalIds?: string[];
  tags?: string[];
}): Promise<RelationshipProjectDTO> {
  const row = await db.relationshipProject.create({
    data: {
      profileId: input.profileId,
      title: input.title,
      description: input.description ?? "",
      status: input.status ?? "active",
      priority: input.priority ?? 50,
      progress: input.progress ?? 0,
      linkedGoalIds: writeJSON(input.linkedGoalIds ?? []),
      tags: writeJSON(input.tags ?? []),
    },
  });
  // Backlink: add this project id to each linked goal's linkedProjectIds.
  if (input.linkedGoalIds && input.linkedGoalIds.length) {
    for (const gid of input.linkedGoalIds) {
      const goal = await db.relationshipGoal.findUnique({ where: { id: gid } });
      if (goal) {
        const projects = readJSON<string[]>(goal.linkedProjectIds, []);
        if (!projects.includes(row.id)) {
          projects.push(row.id);
          await db.relationshipGoal.update({
            where: { id: gid },
            data: { linkedProjectIds: writeJSON(projects) },
          });
        }
      }
    }
  }
  await emit("info", "runtime", `Project created: ${input.title}`, {
    id: row.id,
    linkedGoals: input.linkedGoalIds?.length ?? 0,
  });
  return toProjectDTO(row);
}

export async function updateProject(
  id: string,
  input: Partial<{
    title: string;
    description: string;
    status: RelationshipProjectStatus;
    priority: number;
    progress: number;
    linkedGoalIds: string[];
    tags: string[];
  }>
): Promise<RelationshipProjectDTO> {
  const row = await db.relationshipProject.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.progress !== undefined && { progress: input.progress }),
      ...(input.linkedGoalIds !== undefined && {
        linkedGoalIds: writeJSON(input.linkedGoalIds),
      }),
      ...(input.tags !== undefined && { tags: writeJSON(input.tags) }),
    },
  });
  return toProjectDTO(row);
}

// ─── Traits ──────────────────────────────────────────────────────────────────

export async function listTraits(
  profileId: string,
  opts: { kind?: RelationshipTraitKind } = {}
): Promise<RelationshipTraitDTO[]> {
  const rows = await db.relationshipTrait.findMany({
    where: {
      profileId,
      ...(opts.kind ? { kind: opts.kind } : {}),
    },
    orderBy: [{ level: "desc" }, { createdAt: "asc" }],
  });
  return rows.map(toTraitDTO);
}

export async function createTrait(input: {
  profileId: string;
  kind: RelationshipTraitKind;
  name: string;
  description?: string;
  level?: number;
  metadata?: Record<string, unknown>;
}): Promise<RelationshipTraitDTO> {
  const row = await db.relationshipTrait.create({
    data: {
      profileId: input.profileId,
      kind: input.kind,
      name: input.name,
      description: input.description ?? "",
      level: input.level ?? 50,
      metadata: writeJSON(input.metadata ?? {}),
    },
  });
  return toTraitDTO(row);
}

// ─── Milestones ──────────────────────────────────────────────────────────────

export async function listMilestones(
  profileId: string,
  opts: { achieved?: boolean } = {}
): Promise<RelationshipMilestoneDTO[]> {
  const rows = await db.relationshipMilestone.findMany({
    where: {
      profileId,
      ...(opts.achieved !== undefined ? { achieved: opts.achieved } : {}),
    },
    orderBy: { date: "asc" },
  });
  return rows.map(toMilestoneDTO);
}

export async function createMilestone(input: {
  profileId: string;
  title: string;
  description?: string;
  date: string;
  achieved?: boolean;
  significance?: number;
  linkedGoalIds?: string[];
}): Promise<RelationshipMilestoneDTO> {
  const row = await db.relationshipMilestone.create({
    data: {
      profileId: input.profileId,
      title: input.title,
      description: input.description ?? "",
      date: new Date(input.date),
      achieved: input.achieved ?? false,
      significance: input.significance ?? 50,
      linkedGoalIds: writeJSON(input.linkedGoalIds ?? []),
    },
  });
  return toMilestoneDTO(row);
}

// ─── Decisions ───────────────────────────────────────────────────────────────

export async function listDecisions(
  profileId: string
): Promise<RelationshipDecisionDTO[]> {
  const rows = await db.relationshipDecision.findMany({
    where: { profileId },
    orderBy: { decidedAt: "desc" },
  });
  return rows.map(toDecisionDTO);
}

export async function createDecision(input: {
  profileId: string;
  title: string;
  context?: string;
  options?: string[];
  chosen?: string;
  rationale?: string;
  outcome?: DecisionOutcome;
}): Promise<RelationshipDecisionDTO> {
  const row = await db.relationshipDecision.create({
    data: {
      profileId: input.profileId,
      title: input.title,
      context: input.context ?? "",
      options: writeJSON(input.options ?? []),
      chosen: input.chosen ?? "",
      rationale: input.rationale ?? "",
      outcome: input.outcome ?? "pending",
    },
  });
  await emit("info", "runtime", `Decision recorded: ${input.title}`, {
    id: row.id,
  });
  return toDecisionDTO(row);
}

// ─── Interactions ────────────────────────────────────────────────────────────

export async function listInteractions(
  profileId: string,
  opts: { limit?: number; kind?: string } = {}
): Promise<InteractionDTO[]> {
  const rows = await db.interaction.findMany({
    where: {
      profileId,
      ...(opts.kind ? { kind: opts.kind } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 50, 200),
  });
  return rows.map(toInteractionDTO);
}

export async function createInteraction(input: {
  profileId: string;
  kind: string;
  summary: string;
  sentiment?: InteractionSentiment;
  topics?: string[];
  linkedTaskId?: string;
}): Promise<InteractionDTO> {
  const row = await db.interaction.create({
    data: {
      profileId: input.profileId,
      kind: input.kind,
      summary: input.summary,
      sentiment: input.sentiment ?? "neutral",
      topics: writeJSON(input.topics ?? []),
      linkedTaskId: input.linkedTaskId ?? null,
    },
  });
  return toInteractionDTO(row);
}

// ─── Context query (for Agent Runtime) ───────────────────────────────────────

/**
 * Returns a compact context bundle that the Agent Runtime queries before
 * planning a task. Includes the profile, active goals (top 10 by priority),
 * active projects (top 10), top skills (top 5), key preferences, and the 10
 * most recent interactions. The `summary` field is a natural-language digest.
 */
export async function getContext(
  profileId?: string
): Promise<RelationshipContext> {
  const profile = profileId
    ? await db.relationshipProfile.findUnique({ where: { id: profileId } })
    : await db.relationshipProfile.findFirst({
        where: { relationshipType: "primary" },
      });
  if (!profile) {
    throw new Error("No relationship profile found");
  }

  const [goals, projects, skills, prefs, interactions] = await Promise.all([
    db.relationshipGoal.findMany({
      where: { profileId: profile.id, status: "active" },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 10,
    }),
    db.relationshipProject.findMany({
      where: { profileId: profile.id, status: "active" },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 10,
    }),
    db.relationshipTrait.findMany({
      where: { profileId: profile.id, kind: "skill" },
      orderBy: [{ level: "desc" }],
      take: 5,
    }),
    db.relationshipTrait.findMany({
      where: { profileId: profile.id, kind: "preference" },
      orderBy: [{ level: "desc" }],
      take: 5,
    }),
    db.interaction.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const summary = `${profile.name} has ${goals.length} active goal(s) and ${projects.length} active project(s). ` +
    `Top skills: ${skills.map((s) => s.name).join(", ") || "none yet"}. ` +
    `Last interaction: ${interactions[0]?.summary ?? "none"}.`;

  return {
    profile: toProfileDTO(profile),
    activeGoals: goals.map(toGoalDTO),
    activeProjects: projects.map(toProjectDTO),
    topSkills: skills.map(toTraitDTO),
    keyPreferences: prefs.map(toTraitDTO),
    recentInteractions: interactions.map(toInteractionDTO),
    summary,
  };
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export async function getAnalytics(
  profileId?: string
): Promise<RelationshipAnalytics> {
  const profile = profileId
    ? await db.relationshipProfile.findUnique({ where: { id: profileId } })
    : await db.relationshipProfile.findFirst({
        where: { relationshipType: "primary" },
      });
  if (!profile) throw new Error("No relationship profile found");

  const pid = profile.id;

  const [
    goals,
    projects,
    traits,
    milestones,
    decisions,
    interactions,
    interactions30d,
  ] = await Promise.all([
    db.relationshipGoal.findMany({ where: { profileId: pid } }),
    db.relationshipProject.findMany({ where: { profileId: pid } }),
    db.relationshipTrait.findMany({ where: { profileId: pid } }),
    db.relationshipMilestone.findMany({ where: { profileId: pid } }),
    db.relationshipDecision.findMany({ where: { profileId: pid } }),
    db.interaction.findMany({ where: { profileId: pid } }),
    db.interaction.findMany({
      where: {
        profileId: pid,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  // Goals
  const goalsByStatus: Record<string, number> = {};
  let goalPrioritySum = 0;
  let goalProgressSum = 0;
  for (const g of goals) {
    goalsByStatus[g.status] = (goalsByStatus[g.status] || 0) + 1;
    goalPrioritySum += g.priority;
    goalProgressSum += g.progress;
  }

  // Projects
  const projectsByStatus: Record<string, number> = {};
  let projectProgressSum = 0;
  for (const p of projects) {
    projectsByStatus[p.status] = (projectsByStatus[p.status] || 0) + 1;
    projectProgressSum += p.progress;
  }

  // Traits
  const traitsByKind: Record<string, number> = {};
  for (const t of traits) {
    traitsByKind[t.kind] = (traitsByKind[t.kind] || 0) + 1;
  }
  const topSkills = traits
    .filter((t) => t.kind === "skill")
    .sort((a, b) => b.level - a.level)
    .slice(0, 5)
    .map(toTraitDTO);

  // Milestones
  const upcoming = milestones
    .filter((m) => !m.achieved && m.date >= new Date())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 5)
    .map(toMilestoneDTO);

  // Decisions
  const decisionsByOutcome: Record<string, number> = {};
  for (const d of decisions) {
    decisionsByOutcome[d.outcome] = (decisionsByOutcome[d.outcome] || 0) + 1;
  }

  // Interactions
  const sentimentBreakdown: Record<string, number> = {};
  for (const i of interactions) {
    sentimentBreakdown[i.sentiment] = (sentimentBreakdown[i.sentiment] || 0) + 1;
  }

  return {
    profile: { name: profile.name, id: profile.id },
    goals: {
      total: goals.length,
      active: goalsByStatus["active"] || 0,
      achieved: goalsByStatus["achieved"] || 0,
      abandoned: goalsByStatus["abandoned"] || 0,
      avgPriority: goals.length
        ? Number((goalPrioritySum / goals.length).toFixed(1))
        : 0,
      avgProgress: goals.length
        ? Number((goalProgressSum / goals.length).toFixed(1))
        : 0,
    },
    projects: {
      total: projects.length,
      active: projectsByStatus["active"] || 0,
      completed: projectsByStatus["completed"] || 0,
      avgProgress: projects.length
        ? Number((projectProgressSum / projects.length).toFixed(1))
        : 0,
    },
    traits: { byKind: traitsByKind, topSkills },
    milestones: {
      total: milestones.length,
      achieved: milestones.filter((m) => m.achieved).length,
      upcoming,
    },
    decisions: {
      total: decisions.length,
      byOutcome: decisionsByOutcome,
    },
    interactions: {
      total: interactions.length,
      last30d: interactions30d.length,
      sentimentBreakdown,
    },
  };
}

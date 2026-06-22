/**
 * SUIKA X — Shared domain types.
 *
 * These types describe the cognitive operating system's contracts. In a
 * multi-service deployment they would be authored as protobuf and code-generated
 * per language; here they are the canonical TypeScript source of truth shared by
 * the API layer and the frontend.
 */

export type MemoryKind = "episodic" | "semantic" | "procedural";

export type AgentStatus = "idle" | "busy" | "error" | "retired";

export type TaskStatus = "pending" | "running" | "success" | "failed";

export type TaskKind = "execute" | "reason" | "retrieve" | "synthesize";

export type EventLevel = "info" | "warn" | "error" | "debug";

export type EventSource =
  | "fabric"
  | "agents"
  | "router"
  | "memory"
  | "runtime"
  | "system"
  | "companion"
  | "voice"
  | "project";

export interface EntityDTO {
  id: string;
  name: string;
  type: string;
  properties: Record<string, unknown>;
  workspaceId: string;
  salience: number;
  createdAt: string;
  updatedAt: string;
}

export interface RelationDTO {
  id: string;
  fromId: string;
  toId: string;
  type: string;
  weight: number;
  properties: Record<string, unknown>;
  createdAt: string;
}

export interface GraphDTO {
  nodes: Array<EntityDTO & { degree: number }>;
  edges: RelationDTO[];
}

export interface MemoryDTO {
  id: string;
  kind: MemoryKind;
  content: string;
  importance: number;
  decay: number;
  accessCount: number;
  effectiveScore: number;
  tags: string[];
  workspaceId: string;
  consolidated: boolean;
  createdAt: string;
  lastAccessed: string;
}

export interface AgentDTO {
  id: string;
  name: string;
  role: string;
  capabilities: string[];
  status: AgentStatus;
  reputation: number;
  wallet: number;
  generation: number;
  tasksCompleted: number;
  tasksFailed: number;
  workspaceId: string;
  createdAt: string;
}

export interface TaskDTO {
  id: string;
  agentId: string | null;
  parentId: string | null;
  workspaceId: string;
  title: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  status: TaskStatus;
  depth: number;
  kind: TaskKind;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number;
  children?: TaskDTO[];
}

export interface ModelPersona {
  id: string;
  label: string;
  family: string;
  strengths: string[];
  contextWindow: number;
  costPer1kIn: number;
  costPer1kOut: number;
  avgLatencyMs: number;
  systemPrompt: string;
}

export interface ModelCallDTO {
  id: string;
  provider: string;
  model: string;
  persona: string;
  prompt: string;
  response: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  costUsd: number;
  status: "ok" | "error" | "fallback";
  routeReason: string;
  fallback: boolean;
  createdAt: string;
}

export interface EventDTO {
  id: string;
  level: EventLevel;
  source: EventSource;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface WorkspaceDTO {
  id: string;
  name: string;
  description: string;
  context: Record<string, unknown>;
  active: boolean;
  createdAt: string;
}

export interface SystemMetrics {
  agents: { total: number; busy: number; idle: number; error: number };
  tasks: { total: number; running: number; success: number; failed: number; pending: number };
  memory: { total: number; byKind: Record<string, number>; avgImportance: number; avgDecay: number };
  fabric: { entities: number; relations: number; types: number };
  router: {
    totalCalls: number;
    okCalls: number;
    errorCalls: number;
    fallbackCalls: number;
    totalCostUsd: number;
    avgLatencyMs: number;
    totalTokens: number;
  };
  events: { last24h: number; errorLast24h: number };
  uptimeSec: number;
}

export interface RouteDecision {
  primary: ModelPersona;
  fallback: ModelPersona[];
  reason: string;
  signals: {
    length: number;
    hasCode: boolean;
    needsReasoning: boolean;
    needsLongContext: boolean;
    costSensitive: boolean;
  };
}

// ─── Constitution Engine ─────────────────────────────────────────────────────

export type ConstitutionSection =
  | "mission"
  | "values"
  | "principles"
  | "evolution"
  | "alignment";

export type ArticleStatus = "active" | "superseded" | "proposed";

export type AmendmentStatus = "proposed" | "ratified" | "rejected" | "superseded";

export type ComplianceVerdictKind = "compliant" | "violation" | "warning";

export type EvaluationSeverity = "info" | "warning" | "critical";

export interface ConstitutionArticleDTO {
  id: string;
  section: ConstitutionSection;
  key: string;
  title: string;
  body: string;
  precedence: number;
  immutable: boolean;
  version: number;
  status: ArticleStatus;
  parentId: string | null;
  workspaceId: string | null;
  ratifiedAt: string;
  amendedAt: string;
}

export interface ConstitutionAmendmentDTO {
  id: string;
  articleKey: string;
  section: ConstitutionSection;
  proposedTitle: string;
  proposedBody: string;
  rationale: string;
  status: AmendmentStatus;
  proposedBy: string;
  evaluation: Record<string, unknown>;
  requiredApprovals: number;
  approvals: string[];
  decidedAt: string | null;
  articleId: string | null;
  createdAt: string;
}

export interface ConstitutionEvaluationDTO {
  id: string;
  articleKey: string;
  context: Record<string, unknown>;
  verdict: ComplianceVerdictKind;
  reasoning: string;
  severity: EvaluationSeverity;
  articleId: string | null;
  createdAt: string;
}

export interface ConstitutionSnapshot {
  version: number;
  sections: Record<ConstitutionSection, ConstitutionArticleDTO[]>;
  counts: {
    articles: number;
    amendments: { proposed: number; ratified: number; rejected: number };
    evaluations: number;
    violations: number;
  };
}

export interface ArticleMatch {
  key: string;
  title: string;
  section: ConstitutionSection;
  immutable: boolean;
  verdict: ComplianceVerdictKind;
  reasoning: string;
}

export interface ComplianceResult {
  verdict: ComplianceVerdictKind;
  severity: EvaluationSeverity;
  matched: ArticleMatch[];
  summary: string;
  evaluationId: string;
}

// ─── Identity Engine ─────────────────────────────────────────────────────────

export interface CommunicationStyle {
  tone: string;
  pace: string;
  formality: string;
  markers: string[];
}

export interface ExpertiseDomain {
  domain: string;
  level: number; // 0..100
  evidence: string[];
}

export interface GrowthEvent {
  at: string; // ISO date
  event: string;
  lesson: string;
}

export type IdentityComplianceVerdict =
  | "pending"
  | "compliant"
  | "warning"
  | "violation";

export interface IdentitySnapshotDTO {
  id: string;
  version: number;
  isActive: boolean;
  name: string;
  persona: string;
  communicationStyle: CommunicationStyle;
  missionInterpretation: string;
  longTermTraits: string[];
  expertiseDomains: ExpertiseDomain[];
  behavioralPreferences: Record<string, unknown>;
  growthHistory: GrowthEvent[];
  rationale: string;
  complianceVerdict: IdentityComplianceVerdict;
  complianceEvaluationId: string | null;
  createdBy: string;
  createdAt: string;
}

export type IdentityAuditAction =
  | "create"
  | "activate"
  | "diff"
  | "compliance_check"
  | "seed";

export interface IdentityAuditLogDTO {
  id: string;
  action: IdentityAuditAction;
  fromVersion: number | null;
  toVersion: number | null;
  actor: string;
  detail: Record<string, unknown>;
  snapshotId: string | null;
  createdAt: string;
}

export interface IdentityDiff {
  fromVersion: number;
  toVersion: number;
  changed: Array<{
    field: string;
    from: unknown;
    to: unknown;
    summary: string;
  }>;
  unchanged: string[];
  summary: string;
}

// ─── Relationship Engine ─────────────────────────────────────────────────────

export type RelationshipGoalStatus =
  | "active"
  | "achieved"
  | "abandoned"
  | "paused";

export type RelationshipProjectStatus =
  | "active"
  | "completed"
  | "paused"
  | "archived";

export type RelationshipTraitKind =
  | "skill"
  | "strength"
  | "weakness"
  | "preference"
  | "ambition";

export type DecisionOutcome = "pending" | "positive" | "negative" | "mixed";

export type InteractionSentiment = "positive" | "neutral" | "negative";

export interface RelationshipProfileDTO {
  id: string;
  name: string;
  role: string;
  relationshipType: string;
  bio: string;
  timezone: string;
  communicationPrefs: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RelationshipGoalDTO {
  id: string;
  profileId: string;
  parentId: string | null;
  title: string;
  description: string;
  status: RelationshipGoalStatus;
  priority: number;
  progress: number;
  targetDate: string | null;
  achievedAt: string | null;
  linkedProjectIds: string[];
  linkedMemoryIds: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  children?: RelationshipGoalDTO[];
}

export interface RelationshipProjectDTO {
  id: string;
  profileId: string;
  title: string;
  description: string;
  status: RelationshipProjectStatus;
  priority: number;
  progress: number;
  linkedGoalIds: string[];
  linkedMemoryIds: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RelationshipTraitDTO {
  id: string;
  profileId: string;
  kind: RelationshipTraitKind;
  name: string;
  description: string;
  level: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface RelationshipMilestoneDTO {
  id: string;
  profileId: string;
  title: string;
  description: string;
  date: string;
  achieved: boolean;
  significance: number;
  linkedGoalIds: string[];
  createdAt: string;
}

export interface RelationshipDecisionDTO {
  id: string;
  profileId: string;
  title: string;
  context: string;
  options: string[];
  chosen: string;
  rationale: string;
  outcome: DecisionOutcome;
  decidedAt: string;
  createdAt: string;
}

export interface InteractionDTO {
  id: string;
  profileId: string;
  kind: string;
  summary: string;
  sentiment: InteractionSentiment;
  topics: string[];
  linkedTaskId: string | null;
  createdAt: string;
}

export interface RelationshipContext {
  profile: RelationshipProfileDTO;
  activeGoals: RelationshipGoalDTO[];
  activeProjects: RelationshipProjectDTO[];
  topSkills: RelationshipTraitDTO[];
  keyPreferences: RelationshipTraitDTO[];
  recentInteractions: InteractionDTO[];
  summary: string;
}

export interface RelationshipAnalytics {
  profile: { name: string; id: string };
  goals: {
    total: number;
    active: number;
    achieved: number;
    abandoned: number;
    avgPriority: number;
    avgProgress: number;
  };
  projects: {
    total: number;
    active: number;
    completed: number;
    avgProgress: number;
  };
  traits: {
    byKind: Record<string, number>;
    topSkills: RelationshipTraitDTO[];
  };
  milestones: {
    total: number;
    achieved: number;
    upcoming: RelationshipMilestoneDTO[];
  };
  decisions: {
    total: number;
    byOutcome: Record<string, number>;
  };
  interactions: {
    total: number;
    last30d: number;
    sentimentBreakdown: Record<string, number>;
  };
}

// ─── Agent Context (unified injection object) ────────────────────────────────
//
// The AgentContext is the single object every planning agent receives before
// creating a task DAG. It composes four existing subsystems into one bundle:
//
//   constitution → the authority layer  (verdict from the compliance gate)
//   identity     → the personality layer (who Suika is, this version)
//   relationship → the user-understanding layer (who the served human is)
//   goals        → the objective layer    (what the human is working toward)
//   memory       → the experience layer   (what Suika has learned)
//
// The constitution gate runs FIRST and may block dispatch entirely (HTTP 403).
// Only if the gate passes is the AgentContext assembled and injected into the
// task's `input.agentContext` field, where planning agents can read it.

export interface AgentContext {
  /** The compliance verdict from the constitution gate (never "violation" —
   *  a violation blocks dispatch before the context is assembled). */
  constitution: {
    verdict: ComplianceVerdictKind;
    severity: EvaluationSeverity;
    evaluationId: string;
    summary: string;
  };
  /** The active identity snapshot — Suika's personality for this dispatch.
   *  May be null on a fresh boot before any snapshot is seeded. */
  identity: IdentitySnapshotDTO | null;
  /** The served human's profile + compact relationship context. May be null
   *  if no relationship profile exists yet. */
  relationship: RelationshipContext | null;
  /** The human's active goals (already included in relationship.activeGoals,
   *  but surfaced separately as the "objective layer" for planner
   *  convenience). Empty if relationship is null. */
  goals: RelationshipGoalDTO[];
  /** The human's active projects (objective layer, execution dimension).
   *  Empty if relationship is null. */
  projects: RelationshipProjectDTO[];
  /** Top memories ranked by effective score — Suika's relevant experience.
   *  Empty if no memories exist in the workspace. */
  memories: MemoryDTO[];
  /** A natural-language digest of the full context, suitable for injecting
   *  into a planning prompt. */
  summary: string;
}

/**
 * SUIKA X — typed API client for the frontend. Wraps every /api/suika endpoint.
 */
import type {
  SystemMetrics,
  EntityDTO,
  RelationDTO,
  GraphDTO,
  MemoryDTO,
  AgentDTO,
  TaskDTO,
  ModelPersona,
  ModelCallDTO,
  RouteDecision,
  EventDTO,
  WorkspaceDTO,
  ConstitutionSnapshot,
  ConstitutionArticleDTO,
  ConstitutionAmendmentDTO,
  ConstitutionEvaluationDTO,
  ComplianceResult,
  IdentitySnapshotDTO,
  IdentityAuditLogDTO,
  IdentityDiff,
  RelationshipProfileDTO,
  RelationshipGoalDTO,
  RelationshipProjectDTO,
  RelationshipTraitDTO,
  RelationshipMilestoneDTO,
  RelationshipDecisionDTO,
  InteractionDTO,
  RelationshipContext,
  RelationshipAnalytics,
  AgentContext,
} from "@/lib/suika/types";

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  system: {
    get: () => http<{ metrics: SystemMetrics; bootAt: string }>("/api/suika/system"),
    seed: () =>
      http<{ ok: boolean; seeded: boolean; counts: Record<string, number> }>(
        "/api/suika/system/seed",
        { method: "POST" }
      ),
  },
  fabric: {
    listEntities: (params: { ws?: string; type?: string; q?: string } = {}) =>
      http<{ entities: EntityDTO[] }>(
        "/api/suika/fabric/entities?" + new URLSearchParams(
          Object.entries(params).filter(([, v]) => v) as string[][]
        ).toString()
      ),
    createEntity: (body: {
      name: string;
      type: string;
      properties?: Record<string, unknown>;
      salience?: number;
      workspaceId?: string;
    }) =>
      http<{ entity: EntityDTO }>("/api/suika/fabric/entities", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    deleteEntity: (id: string) =>
      http<{ ok: boolean }>(`/api/suika/fabric/entities/${id}`, { method: "DELETE" }),
    listRelations: (ws?: string) =>
      http<{ relations: RelationDTO[] }>(
        "/api/suika/fabric/relations?" + new URLSearchParams(ws ? [["ws", ws]] : []).toString()
      ),
    createRelation: (body: {
      fromId: string;
      toId: string;
      type: string;
      weight?: number;
      properties?: Record<string, unknown>;
    }) =>
      http<{ relation: RelationDTO }>("/api/suika/fabric/relations", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    graph: (params: { ws?: string; limit?: number } = {}) =>
      http<{ graph: GraphDTO }>(
        "/api/suika/fabric/graph?" + new URLSearchParams(
          Object.entries(params).filter(([, v]) => v !== undefined && v !== "") as string[][]
        ).toString()
      ),
  },
  memory: {
    list: (params: { ws?: string; kind?: string; q?: string; limit?: number } = {}) =>
      http<{ memories: MemoryDTO[] }>(
        "/api/suika/memory?" + new URLSearchParams(
          Object.entries(params).filter(([, v]) => v !== undefined && v !== "") as string[][]
        ).toString()
      ),
    create: (body: {
      kind: string;
      content: string;
      tags?: string[];
      importance?: number;
      workspaceId?: string;
    }) =>
      http<{ memory: MemoryDTO }>("/api/suika/memory", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    retrieve: (body: { query: string; ws?: string; limit?: number; kind?: string }) =>
      http<{ results: Array<{ memory: MemoryDTO; score: number }> }>(
        "/api/suika/memory/retrieve",
        { method: "POST", body: JSON.stringify(body) }
      ),
    consolidate: () =>
      http<{ merged: Array<{ intoId: string; fromIds: string[]; summary: string }>; applied: number }>(
        "/api/suika/memory/consolidate",
        { method: "POST" }
      ),
    decay: () =>
      http<{ updated: number; sample: MemoryDTO[] }>("/api/suika/memory/decay", {
        method: "POST",
      }),
  },
  agents: {
    list: (params: { ws?: string; status?: string } = {}) =>
      http<{ agents: AgentDTO[] }>(
        "/api/suika/agents?" + new URLSearchParams(
          Object.entries(params).filter(([, v]) => v) as string[][]
        ).toString()
      ),
    create: (body: { name: string; role: string; capabilities?: string[]; workspaceId?: string }) =>
      http<{ agent: AgentDTO }>("/api/suika/agents", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    dispatch: (id: string, body: { title: string; kind?: string; input?: Record<string, unknown>; decompose?: boolean }) =>
      http<{ task: TaskDTO; children: TaskDTO[]; agentContext: AgentContext }>(
        `/api/suika/agents/${id}/dispatch`,
        { method: "POST", body: JSON.stringify(body) }
      ),
    tasks: (id: string) =>
      http<{ tasks: TaskDTO[] }>(`/api/suika/agents/${id}/tasks`),
    /** Preview the AgentContext that would be injected into a planning agent
     *  for the given task title. Does not dispatch a task. */
    previewContext: (title?: string) =>
      http<{ context: AgentContext }>(
        "/api/suika/agents/context?" + new URLSearchParams(
          title ? [["title", title]] : []
        ).toString()
      ),
  },
  tasks: {
    list: (params: { ws?: string; status?: string } = {}) =>
      http<{ tasks: TaskDTO[] }>(
        "/api/suika/tasks?" + new URLSearchParams(
          Object.entries(params).filter(([, v]) => v) as string[][]
        ).toString()
      ),
    get: (id: string) =>
      http<{ task: TaskDTO; children: TaskDTO[] }>(`/api/suika/tasks/${id}`),
  },
  router: {
    models: () => http<{ personas: ModelPersona[] }>("/api/suika/router/models"),
    route: (prompt: string) =>
      http<{ decision: RouteDecision }>("/api/suika/router/route", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      }),
    complete: (prompt: string, model?: string) =>
      http<{ call: ModelCallDTO; decision: RouteDecision }>(
        "/api/suika/router/completions",
        { method: "POST", body: JSON.stringify({ prompt, model }) }
      ),
    calls: (limit = 50) =>
      http<{ calls: ModelCallDTO[] }>(`/api/suika/router/calls?limit=${limit}`),
  },
  events: {
    list: (params: { limit?: number; level?: string; source?: string } = {}) =>
      http<{ events: EventDTO[] }>(
        "/api/suika/events?" + new URLSearchParams(
          Object.entries(params).filter(([, v]) => v !== undefined && v !== "") as string[][]
        ).toString()
      ),
  },
  workspaces: {
    list: () => http<{ workspaces: WorkspaceDTO[] }>("/api/suika/workspaces"),
    create: (body: { name: string; description?: string; context?: Record<string, unknown> }) =>
      http<{ workspace: WorkspaceDTO }>("/api/suika/workspaces", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    activate: (id: string) =>
      http<{ workspace: WorkspaceDTO }>(`/api/suika/workspaces/${id}/activate`, {
        method: "POST",
      }),
  },
  constitution: {
    get: () =>
      http<{ constitution: ConstitutionSnapshot }>("/api/suika/constitution"),
    listArticles: (params: { section?: string; status?: string; includeSuperseded?: boolean } = {}) =>
      http<{ articles: ConstitutionArticleDTO[] }>(
        "/api/suika/constitution/articles?" + new URLSearchParams(
          Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== false) as string[][]
        ).toString()
      ),
    evaluate: (body: { type: string; description: string; source?: string; refId?: string; proposedBy?: string }) =>
      http<{ result: ComplianceResult }>(
        "/api/suika/constitution/evaluate",
        { method: "POST", body: JSON.stringify(body) }
      ),
    listAmendments: (params: { status?: string; limit?: number } = {}) =>
      http<{ amendments: ConstitutionAmendmentDTO[] }>(
        "/api/suika/constitution/amendments?" + new URLSearchParams(
          Object.entries(params).filter(([, v]) => v !== undefined && v !== "") as string[][]
        ).toString()
      ),
    proposeAmendment: (body: {
      articleKey: string;
      section: string;
      proposedTitle: string;
      proposedBody: string;
      rationale: string;
      proposedBy?: string;
      requiredApprovals?: number;
    }) =>
      http<{ amendment: ConstitutionAmendmentDTO; autoRejected: boolean }>(
        "/api/suika/constitution/amendments",
        { method: "POST", body: JSON.stringify(body) }
      ),
    ratifyAmendment: (id: string, approver?: string) =>
      http<{ amendment: ConstitutionAmendmentDTO; article: ConstitutionArticleDTO }>(
        `/api/suika/constitution/amendments/${id}/ratify`,
        { method: "POST", body: JSON.stringify({ approver }) }
      ),
    rejectAmendment: (id: string, reason: string) =>
      http<{ amendment: ConstitutionAmendmentDTO }>(
        `/api/suika/constitution/amendments/${id}/reject`,
        { method: "POST", body: JSON.stringify({ reason }) }
      ),
    listEvaluations: (params: { limit?: number; verdict?: string } = {}) =>
      http<{ evaluations: ConstitutionEvaluationDTO[] }>(
        "/api/suika/constitution/evaluations?" + new URLSearchParams(
          Object.entries(params).filter(([, v]) => v !== undefined && v !== "") as string[][]
        ).toString()
      ),
  },
  identity: {
    getActive: () =>
      http<{ snapshot: IdentitySnapshotDTO | null }>("/api/suika/identity"),
    getHistory: (limit = 50) =>
      http<{ snapshots: IdentitySnapshotDTO[] }>(`/api/suika/identity/history?limit=${limit}`),
    getVersion: (version: number) =>
      http<{ snapshot: IdentitySnapshotDTO }>(`/api/suika/identity/${version}`),
    create: (body: {
      name: string;
      persona: string;
      communicationStyle?: { tone?: string; pace?: string; formality?: string; markers?: string[] };
      missionInterpretation?: string;
      longTermTraits?: string[];
      expertiseDomains?: Array<{ domain: string; level: number; evidence: string[] }>;
      behavioralPreferences?: Record<string, unknown>;
      growthHistory?: Array<{ at: string; event: string; lesson: string }>;
      rationale?: string;
      createdBy?: string;
      validateConstitution?: boolean;
    }) =>
      http<{ snapshot: IdentitySnapshotDTO }>("/api/suika/identity", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    diff: (fromVersion: number, toVersion: number) =>
      http<{ diff: IdentityDiff }>(
        `/api/suika/identity/diff?from=${fromVersion}&to=${toVersion}`
      ),
    validate: (version: number) =>
      http<{ verdict: string; evaluationId: string }>(
        `/api/suika/identity/${version}/validate`,
        { method: "POST" }
      ),
    getAuditLog: (limit = 100) =>
      http<{ audit: IdentityAuditLogDTO[] }>(`/api/suika/identity/audit?limit=${limit}`),
  },
  relationship: {
    getProfile: (profileId?: string) =>
      http<{ profile: RelationshipProfileDTO | null }>(
        "/api/suika/relationship?" + new URLSearchParams(
          profileId ? [["profileId", profileId]] : []
        ).toString()
      ),
    listProfiles: () =>
      http<{ profiles: RelationshipProfileDTO[] }>("/api/suika/relationship/profiles"),
    createProfile: (body: { name: string; role?: string; bio?: string; timezone?: string }) =>
      http<{ profile: RelationshipProfileDTO }>("/api/suika/relationship", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listGoals: (profileId: string, status?: string) =>
      http<{ goals: RelationshipGoalDTO[] }>(
        "/api/suika/relationship/goals?" + new URLSearchParams(
          [
            ["profileId", profileId],
            ...(status ? [["status", status]] : []),
            ["includeChildren", "true"],
          ]
        ).toString()
      ),
    createGoal: (body: {
      profileId: string;
      parentId?: string;
      title: string;
      description?: string;
      priority?: number;
      progress?: number;
      targetDate?: string;
      tags?: string[];
    }) =>
      http<{ goal: RelationshipGoalDTO }>("/api/suika/relationship/goals", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateGoal: (id: string, body: Partial<{
      title: string;
      description: string;
      status: string;
      priority: number;
      progress: number;
      targetDate: string | null;
      tags: string[];
    }>) =>
      http<{ goal: RelationshipGoalDTO }>(`/api/suika/relationship/goals/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    listProjects: (profileId: string, status?: string) =>
      http<{ projects: RelationshipProjectDTO[] }>(
        "/api/suika/relationship/projects?" + new URLSearchParams(
          [
            ["profileId", profileId],
            ...(status ? [["status", status]] : []),
          ]
        ).toString()
      ),
    createProject: (body: {
      profileId: string;
      title: string;
      description?: string;
      priority?: number;
      progress?: number;
      linkedGoalIds?: string[];
      tags?: string[];
    }) =>
      http<{ project: RelationshipProjectDTO }>("/api/suika/relationship/projects", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listTraits: (profileId: string, kind?: string) =>
      http<{ traits: RelationshipTraitDTO[] }>(
        "/api/suika/relationship/traits?" + new URLSearchParams(
          [
            ["profileId", profileId],
            ...(kind ? [["kind", kind]] : []),
          ]
        ).toString()
      ),
    createTrait: (body: {
      profileId: string;
      kind: string;
      name: string;
      description?: string;
      level?: number;
    }) =>
      http<{ trait: RelationshipTraitDTO }>("/api/suika/relationship/traits", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listMilestones: (profileId: string, achieved?: boolean) =>
      http<{ milestones: RelationshipMilestoneDTO[] }>(
        "/api/suika/relationship/milestones?" + new URLSearchParams(
          [
            ["profileId", profileId],
            ...(achieved !== undefined ? [["achieved", String(achieved)]] : []),
          ]
        ).toString()
      ),
    createMilestone: (body: {
      profileId: string;
      title: string;
      description?: string;
      date: string;
      achieved?: boolean;
      significance?: number;
    }) =>
      http<{ milestone: RelationshipMilestoneDTO }>("/api/suika/relationship/milestones", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listDecisions: (profileId: string) =>
      http<{ decisions: RelationshipDecisionDTO[] }>(
        "/api/suika/relationship/decisions?" + new URLSearchParams([["profileId", profileId]]).toString()
      ),
    createDecision: (body: {
      profileId: string;
      title: string;
      context?: string;
      options?: string[];
      chosen?: string;
      rationale?: string;
      outcome?: string;
    }) =>
      http<{ decision: RelationshipDecisionDTO }>("/api/suika/relationship/decisions", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listInteractions: (profileId: string, limit = 50) =>
      http<{ interactions: InteractionDTO[] }>(
        "/api/suika/relationship/interactions?" + new URLSearchParams([
          ["profileId", profileId],
          ["limit", String(limit)],
        ]).toString()
      ),
    createInteraction: (body: {
      profileId: string;
      kind: string;
      summary: string;
      sentiment?: string;
      topics?: string[];
    }) =>
      http<{ interaction: InteractionDTO }>("/api/suika/relationship/interactions", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    getContext: (profileId?: string) =>
      http<{ context: RelationshipContext }>(
        "/api/suika/relationship/context?" + new URLSearchParams(
          profileId ? [["profileId", profileId]] : []
        ).toString()
      ),
    getAnalytics: (profileId?: string) =>
      http<{ analytics: RelationshipAnalytics }>(
        "/api/suika/relationship/analytics?" + new URLSearchParams(
          profileId ? [["profileId", profileId]] : []
        ).toString()
      ),
  },
  operations: {
    listJobs: (status?: string) =>
      http<{ jobs: any[] }>(
        "/api/suika/jobs?" + new URLSearchParams(
          status ? [["status", status]] : []
        ).toString()
      ),
    getJob: (id: string) =>
      http<{ job: any }>(`/api/suika/jobs/${id}`),
    getDeadLetter: () =>
      http<{ jobs: any[] }>("/api/suika/jobs/dead-letter"),
    getTask: (id: string) =>
      http<{ task: any; children: any[] }>(`/api/suika/tasks/${id}`),
    plannerInspect: (title: string, kind?: string) =>
      http<any>(
        "/api/suika/operations/planner-inspect?" + new URLSearchParams([
          ["title", title],
          ...(kind ? [["kind", kind]] : []),
        ]).toString()
      ),
    auditTimeline: (limit = 100) =>
      http<{ timeline: any[]; counts: any }>(
        `/api/suika/operations/audit-timeline?limit=${limit}`
      ),
    workerStatus: () =>
      http<any>("/api/suika/operations/worker-status"),
    providers: () =>
      http<{ providers: any[] }>("/api/suika/providers"),
    providerHealth: () =>
      http<{ providers: any[] }>("/api/suika/providers/health"),
    providerDetail: (id: string) =>
      http<any>(`/api/suika/providers/${id}`),
    // Multi-agent
    multiAgentList: () =>
      http<{ agents: any[] }>("/api/suika/multi-agent/agents"),
    multiAgentPlan: (body: { title: string; kind?: string }) =>
      http<{ plan: any }>("/api/suika/multi-agent/plan", {
        method: "POST", body: JSON.stringify(body),
      }),
    multiAgentHandoffs: (taskId?: string) =>
      http<{ handoffs: any[] }>(
        "/api/suika/multi-agent/handoffs?" + new URLSearchParams(
          taskId ? [["taskId", taskId]] : []
        ).toString()
      ),
    // Scheduler
    schedulerList: (status?: string) =>
      http<{ schedules: any[] }>(
        "/api/suika/scheduler?" + new URLSearchParams(
          status ? [["status", status]] : []
        ).toString()
      ),
    schedulerCreate: (body: any) =>
      http<{ schedule: any }>("/api/suika/scheduler", {
        method: "POST", body: JSON.stringify(body),
      }),
    // Tools
    toolList: (limit = 50) =>
      http<{ calls: any[] }>(`/api/suika/tools?limit=${limit}`),
    toolCall: (toolName: string, input: any, context?: any) =>
      http<{ result: any }>("/api/suika/tools", {
        method: "POST", body: JSON.stringify({ toolName, input, context }),
      }),
    // Reviews
    reviewList: (taskId?: string, limit = 50) =>
      http<{ reviews: any[] }>(
        "/api/suika/reviews?" + new URLSearchParams([
          ...(taskId ? [["taskId", taskId]] : []),
          ["limit", String(limit)],
        ]).toString()
      ),
  },
};

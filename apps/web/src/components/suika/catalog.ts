/**
 * SUIKA X — the 18-subsystem catalog. Drives the sidebar nav and the Registry
 * view. Each entry carries: id, name, icon, status, and a short spec. The
 * `interactive` flag marks subsystems backed by a live view in this build.
 */
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Network,
  Brain,
  Bot,
  Shuffle,
  Activity,
  Library,
  Cpu,
  Terminal,
  Globe,
  ShieldCheck,
  Armchair,
  UserRound,
  FolderKanban,
  Wrench,
  Puzzle,
  Store,
  Microscope,
  Recycle,
  Server,
  Scale,
  Fingerprint,
  HeartHandshake,
  Radar,
  Sparkles,
  Radio,
} from "lucide-react";
import type { SuikaView } from "@/lib/suika/store";

export interface Subsystem {
  id: string;
  name: string;
  icon: LucideIcon;
  status: "live" | "architected" | "planned";
  view?: SuikaView;
  spec: string;
  backing: string;
}

export const SUBSYSTEMS: Subsystem[] = [
  { id: "companion", name: "SUIKA Companion", icon: Sparkles, status: "live", view: "companion", spec: "Living AI companion: persistent relationship memory, project tracking, initiative engine, personality evolution, and real-time voice operating system.", backing: "Phase 4.3 (companion.ts + 14 Prisma models) + Phase 4.4 (voice-service mini-service on port 3003 + useVoice hook)." },
  { id: "constitution", name: "Constitution Engine", icon: Scale, status: "live", view: "constitution", spec: "Root authority: mission, values, immutable principles, evolution rules, alignment rules. Gates every agent action via compliance evaluation.", backing: "SQLite articles/amendments/evaluations; deterministic compliance evaluator; amendment lifecycle." },
  { id: "identity", name: "Identity Engine", icon: Fingerprint, status: "live", view: "identity", spec: "Persistent, evolving self-definition of Suika — versioned snapshots, evolution history, audit trail, constitution compliance validation, identity diffing.", backing: "SQLite identitySnapshots + auditLogs; constitution-validated activation; structured diffing." },
  { id: "relationship", name: "Relationship Engine", icon: HeartHandshake, status: "live", view: "relationship", spec: "Structured understanding of the served human — goals, projects, skills, traits, milestones, decisions, interactions, analytics.", backing: "SQLite profile + goal/project/trait/milestone/decision/interaction models; goal graph + project graph; context query for agents." },
  { id: "overview", name: "System Overview", icon: LayoutDashboard, status: "live", view: "overview", spec: "Live KPIs, throughput, and event stream across the whole cognitive stack.", backing: "Aggregates every subsystem metric in real time." },
  { id: "knowledge-fabric", name: "Knowledge Fabric", icon: Network, status: "live", view: "fabric", spec: "Entity graph + temporal graph + retrieval engine + embedding pipeline + hybrid search.", backing: "SQLite entities/relations (Postgres/Neo4j/Qdrant in full deploy)." },
  { id: "memory", name: "Memory System", icon: Brain, status: "live", view: "memory", spec: "Episodic / semantic / procedural stores, importance scoring, decay, consolidation.", backing: "SQLite memories with hashed-projection embeddings." },
  { id: "agents", name: "Agent Runtime", icon: Bot, status: "live", view: "agents", spec: "Lifecycle, registry, capability vectors, task DAG execution, reputation, wallets.", backing: "SQLite agents/tasks; Ray + Kafka in full deploy." },
  { id: "router", name: "Model Router", icon: Shuffle, status: "live", view: "router", spec: "7-model routing, fallback, cost optimization, multi-model collaboration.", backing: "Real LLM calls via z-ai-web-dev-sdk; persona-based routing." },
  { id: "observability", name: "Observability Layer", icon: Activity, status: "live", view: "observability", spec: "Structured event spine, metrics, latency, error tracking.", backing: "SQLite events; OTel/Prometheus/Grafana in full deploy." },
  { id: "workspaces", name: "Workspace System", icon: FolderKanban, status: "live", view: "workspaces", spec: "Multi-tenant cognitive contexts with activation.", backing: "SQLite workspaces." },
  { id: "operations", name: "Operations & Observability", icon: Radar, status: "live", view: "operations", spec: "Job queue dashboard, execution trace explorer, planner inspector, worker supervisor, audit timeline. Watch tasks travel from dispatch → plan → queue → worker → LLM → memory in real time.", backing: "ExecutionJob table + Task outputs + Event stream + IdentityAuditLog." },
  { id: "cognitive-kernel", name: "Cognitive Kernel", icon: Cpu, status: "architected", spec: "Core reasoning + orchestration loop binding fabric, memory, agents, router.", backing: "Architected; delegates to live subsystems here." },
  { id: "cognitive-compiler", name: "Cognitive Compiler", icon: Terminal, status: "architected", spec: "Compiles intent → executable cognitive programs (DAGs) over the runtime.", backing: "Architected; preview via Agent DAG dispatch." },
  { id: "reality-engine", name: "Reality Engine", icon: Globe, status: "architected", spec: "Grounds cognition in real-world state: sensors, feeds, environment models.", backing: "Architected; consumes events from live subsystems." },
  { id: "research-factory", name: "Research Factory", icon: Microscope, status: "architected", spec: "Autonomous research loops: hypothesize → retrieve → experiment → synthesize.", backing: "Architected; uses router + memory + agents." },
  { id: "recursive-arch", name: "Recursive Architecture Engine", icon: Recycle, status: "architected", spec: "Self-improving architecture: the system proposes & evaluates its own redesigns.", backing: "Architected; emits redesign events to observability." },
  { id: "federation", name: "Federation Layer", icon: Server, status: "architected", spec: "Federates SUIKA X nodes: cross-node knowledge sync, agent mobility, trust.", backing: "Architected; gRPC + mTLS contracts defined." },
  { id: "security", name: "Security Layer", icon: ShieldCheck, status: "architected", spec: "RBAC + ABAC, JWT, mTLS, Ed25519 signatures, full audit logs.", backing: "Architected; audit events flow to observability." },
  { id: "robotics", name: "Robotics Layer", icon: Armchair, status: "planned", spec: "Embodied cognition: ROS2 bridge, motor schemas, sensor fusion.", backing: "Planned; consumes agent task outputs." },
  { id: "digital-twin", name: "Human Digital Twin", icon: UserRound, status: "architected", spec: "Per-user cognitive model: preferences, history, calibrated assistants.", backing: "Architected; backed by memory + workspace." },
  { id: "tool-runtime", name: "Tool Runtime", icon: Wrench, status: "architected", spec: "Sandboxed tool execution with capability scoping and audit.", backing: "Architected; tools invoked by agents." },
  { id: "plugin-ecosystem", name: "Plugin Ecosystem", icon: Puzzle, status: "architected", spec: "Signed plugins extending any subsystem; marketplace integration.", backing: "Architected; Ed25519-signed manifests." },
  { id: "agent-market", name: "Multi-Agent Market", icon: Store, status: "architected", spec: "Marketplace of agents with reputation, pricing, evolution.", backing: "Architected; agent registry + reputation are live." },
  { id: "registry", name: "Subsystem Registry", icon: Library, status: "live", view: "registry", spec: "Catalog of all 18 SUIKA X subsystems with status & specs.", backing: "Static catalog + live status badges." },
];

export const NAV_GROUPS: Array<{ label: string; ids: string[] }> = [
  { label: "Companion", ids: ["companion"] },
  { label: "Live", ids: ["constitution", "identity", "relationship", "overview", "knowledge-fabric", "memory", "agents", "router", "observability", "workspaces", "operations"] },
  { label: "Architecture", ids: ["cognitive-kernel", "cognitive-compiler", "reality-engine", "research-factory", "recursive-arch", "federation", "security", "robotics", "digital-twin", "tool-runtime", "plugin-ecosystem", "agent-market"] },
  { label: "Catalog", ids: ["registry"] },
];

export function getSubsystem(id: string): Subsystem | undefined {
  return SUBSYSTEMS.find((s) => s.id === id);
}

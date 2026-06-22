# SUIKA X — Cognitive Operating System

> **A persistent AI companion with autonomous workflows, memory, knowledge graph, and real-time voice interaction.**

SUIKA is not a chatbot. It is a cognitive operating system that amplifies human cognition — it remembers, reasons, plans, initiates, and speaks. It is built on a constitutionally-grounded agent runtime, a durable workflow engine, a hybrid memory system, and a real-time voice pipeline.

![SUIKA](apps/web/public/suika/suika-portrait.png)

---

## Table of Contents

1. [Architecture](#architecture)
2. [Quick Start](#quick-start)
3. [Repository Structure](#repository-structure)
4. [Setup](#setup)
5. [Deployment](#deployment)
6. [Environment Variables](#environment-variables)
7. [Troubleshooting](#troubleshooting)
8. [API Reference](#api-reference)
9. [Database Schema](#database-schema)

---

## Architecture

SUIKA is a monorepo composed of 4 apps/services and 9 packages, all sharing a single Prisma database (44 models).

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SUIKA X Architecture                           │
└─────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
  │   apps/web      │    │ services/worker │    │services/voice-  │
  │   (Next.js)     │    │   (Bun, x2)     │    │   service       │
  │                 │    │                 │    │   (Bun, :3003)  │
  │  • HUD (React)  │    │  • DAG executor │    │  • ASR          │
  │  • API routes   │◄──►│  • Checkpoints  │    │  • TTS          │
  │  • Auth         │    │  • Revision cap │    │  • LLM conv.    │
  │  • SSE events   │    │  • Tool runtime │    │  • Sessions     │
  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘
           │                      │                      │
           │   ┌──────────────────┴──────────────────────┘
           │   │
           ▼   ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                        Prisma + SQLite                             │
  │                                                                     │
  │  44 models:                                                         │
  │  • Knowledge Fabric (Entity, Relation)                              │
  │  • Memory (episodic, semantic, procedural)                          │
  │  • Agents (6 cohort + profiles + assignments)                       │
  │  • Workflow (Task, ExecutionJob, ToolCall, Handoff, Review)         │
  │  • Constitution (Articles, Amendments, Evaluations)                 │
  │  • Identity (Snapshots, AuditLog)                                   │
  │  • Relationship (Profile, Goals, Projects, Traits, Decisions)       │
  │  • Providers (Config, Health, CallLog)                              │
  │  • Companion (UserProfile, UserFact, ConversationSummary,           │
  │              RelationshipState, Project, Milestone, Task,            │
  │              Decision, Blocker, CompanionTraits, InitiativeAction)  │
  │  • Voice (VoiceSession, VoiceTurn)                                  │
  └─────────────────────────────────────────────────────────────────────┘
           ▲
           │
  ┌────────┴────────┐
  │services/scheduler│  (Bun, polls ScheduledJob every 5s)
  │                  │  • one_time, delayed, recurring (cron), dependency
  └─────────────────┘
```

### Cognitive Pipeline

```
User Input (text or voice)
    │
    ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Context Fusion  │────▶│  Constitution   │────▶│  Agent Context  │
│ (companion.ts)  │     │   Gate (auth)   │     │   Assembly      │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Memory Write  │◀────│  DAG Executor   │◀────│  Multi-Agent    │
│   (episodic)    │     │  (worker)       │     │  Planner        │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  Review + Revise│  (MAX_REVISIONS=3)
                        │  (per step)      │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │   Completion    │
                        │  + Memory write │
                        │  + Trait evolve │
                        └─────────────────┘
```

### Voice Pipeline (Phase 4.4)

```
User speaks
    │
    ▼
[useVoice hook] MediaRecorder → Blob → base64
    │
    ▼
POST /conversation (port 3003 via gateway)
    │
    ├──▶ [ASR]  z-ai.audio.asr.create()  ──→ transcript (~1.2s)
    ├──▶ [CTX]  DB: UserFact + ConversationSummary + openThreads (~5ms)
    ├──▶ [LLM]  z-ai.chat.completions.create() ──→ response (~0.6s)
    └──▶ [TTS]  z-ai.audio.tts.create()  ──→ WAV audio (~3.1s)
    │
    ▼
Persist VoiceTurn + VoiceSession (SQLite)
    │
    ▼
Return JSON {transcript, response, audio_base64, latency, mood}
    │
    ▼
[useVoice] plays audio → SuikaCharacterPanel mouth-animates
    │
    ▼
User can interrupt → POST /conversation/interrupt
```

---

## Quick Start

```bash
# 1. Clone / extract the repository
unzip suika-core.zip
cd suika-core

# 2. Copy environment file
cp .env.example .env
# Edit .env if you want to change defaults

# 3. Install everything
bash scripts/install.sh

# 4. Initialize the database
bash scripts/migrate.sh push

# 5. Start all services
bash scripts/start.sh

# 6. In a new terminal, seed the system
bash scripts/seed.sh

# 7. Open the HUD
open http://localhost:3000
# Login: admin / suika-admin-2024
```

---

## Repository Structure

```
suika-core/
├── apps/
│   ├── web/                          # Next.js 16 app (HUD + API routes)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── api/suika/        # 76 API routes
│   │   │   │   ├── globals.css       # Tailwind + SUIKA animations
│   │   │   │   ├── layout.tsx
│   │   │   │   └── page.tsx          # Single-route mission control
│   │   │   ├── components/
│   │   │   │   ├── suika/            # 22 SUIKA components
│   │   │   │   │   ├── CompanionView.tsx
│   │   │   │   │   ├── SuikaCharacterPanel.tsx
│   │   │   │   │   ├── ThinkingStreamPanel.tsx
│   │   │   │   │   ├── VoiceControlCenter.tsx
│   │   │   │   │   ├── CompanionPanels.tsx
│   │   │   │   │   ├── hud-primitives.tsx
│   │   │   │   │   └── ... (12 subsystem views)
│   │   │   │   └── ui/               # shadcn/ui (45 components)
│   │   │   ├── hooks/
│   │   │   │   ├── use-voice.ts      # Phase 4.4 voice hook
│   │   │   │   ├── use-toast.ts
│   │   │   │   └── use-mobile.ts
│   │   │   ├── lib/
│   │   │   │   ├── suika/            # 22 core modules
│   │   │   │   │   ├── companion.ts          # Phase 4.3 (1635 lines)
│   │   │   │   │   ├── executor.ts           # DAG executor
│   │   │   │   │   ├── provider-control.ts   # AIMD + circuit breaker
│   │   │   │   │   ├── multi-agent.ts        # Planner
│   │   │   │   │   ├── kernel.ts             # Event bus
│   │   │   │   │   ├── constitution.ts       # Root authority
│   │   │   │   │   ├── identity.ts           # Evolving self
│   │   │   │   │   └── ... (15 more)
│   │   │   │   ├── db.ts
│   │   │   │   └── utils.ts
│   │   │   └── middleware.ts         # Auth + rate limiting + security
│   │   ├── public/
│   │   │   └── suika/
│   │   │       └── suika-portrait.png # Canonical AI portrait
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── next.config.ts
│   │   ├── components.json           # shadcn/ui config
│   │   ├── postcss.config.mjs
│   │   └── eslint.config.mjs
│   └── api/                          # API manifest (routes live in web)
│       ├── package.json
│       └── README.md
│
├── services/
│   ├── worker/                       # Durable execution worker
│   │   ├── index.ts                  # Polls job queue, executes DAGs
│   │   └── package.json
│   ├── voice-service/                # Voice OS (ASR + TTS + LLM)
│   │   ├── index.ts                  # Bun server on port 3003
│   │   └── package.json
│   └── scheduler/                    # Scheduled job processor
│       ├── index.ts                  # Polls ScheduledJob every 5s
│       └── package.json
│
├── packages/                         # 9 workspace packages (barrel re-exports)
│   ├── shared/                       # Types, JSON, kernel
│   ├── memory/                       # Episodic/semantic/procedural + embed
│   ├── knowledge/                    # Entity graph + relationship engine
│   ├── agents/                       # Multi-agent + identity + constitution
│   ├── workflows/                    # Planner + executor + job-queue
│   ├── autonomy/                     # Seed + scheduler hooks
│   ├── companion/                    # Phase 4.3 companion intelligence
│   ├── providers/                    # LLM abstraction + control plane
│   └── ui/                           # HUD component library
│
├── prisma/
│   └── schema.prisma                 # 44 models, the source of truth
│
├── docker/
│   ├── Dockerfile                    # Multi-stage production build
│   ├── docker-compose.yml            # → moved to root
│   ├── ecosystem.config.cjs          # PM2 config (4 processes)
│   └── Caddyfile                     # Gateway (port 81 → 3000/3003)
│
├── scripts/
│   ├── install.sh                    # Install all deps
│   ├── migrate.sh                    # DB push / migrate / reset
│   ├── seed.sh                       # Seed constitution + identity + projects
│   ├── start.sh                      # Start web + worker + voice + scheduler
│   └── backup.sh                     # SQLite snapshot → backups/<timestamp>/
│
├── docs/
│   └── ARCHITECTURE.md               # (this README serves as the doc)
│
├── .env.example
├── .gitignore
├── docker-compose.yml                # Production multi-service deployment
├── package.json                      # Bun workspaces root
├── tsconfig.json                     # Monorepo TS config
└── README.md                         # This file
```

---

## Setup

### Prerequisites

- **Bun** ≥ 1.1.0 ([install](https://bun.sh))
- **Node.js** ≥ 20 (for Next.js tooling)
- **SQLite** (bundled — no separate install needed)
- **Caddy** (optional, for production gateway)

### Development Setup

```bash
# 1. Install dependencies
bash scripts/install.sh

# 2. Initialize database (creates prisma/suika.db)
bash scripts/migrate.sh push

# 3. Start all services (web:3000, worker, voice:3003, scheduler)
bash scripts/start.sh

# 4. In a new terminal, seed the system
bash scripts/seed.sh
```

### Manual Setup (without scripts)

```bash
bun install
bunx prisma generate
bunx prisma db push
cd apps/web && bun run dev    # terminal 1
cd services/worker && bun run dev    # terminal 2
cd services/voice-service && bun run dev    # terminal 3
cd services/scheduler && bun run dev    # terminal 4
```

---

## Deployment

### Option 1: PM2 (recommended for single-host production)

```bash
# Build the Next.js app
cd apps/web && bun run build && cd ../..

# Start all 4 processes via PM2
bunx pm2-runtime docker/ecosystem.config.cjs

# Or with PM2 daemon:
bunx pm2 start docker/ecosystem.config.cjs
bunx pm2 status
bunx pm2 logs
```

### Option 2: Docker Compose

```bash
# Build and start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

### Option 3: Caddy Gateway (production)

The included Caddyfile exposes port 81 externally and routes:
- Default traffic → `localhost:3000` (Next.js)
- `?XTransformPort=3003` → `localhost:3003` (voice service)

```bash
caddy run --config docker/Caddyfile
```

### Production Checklist

- [ ] Set `SUIKA_JWT_SECRET` to a long random string
- [ ] Set `SUIKA_AUTH_PASSWORD` to a strong password
- [ ] Set at least one LLM provider key (`ZAI_API_KEY`, `OPENROUTER_API_KEY`, or `OPENAI_API_KEY`)
- [ ] Set `DATABASE_URL` to a persistent path (or PostgreSQL)
- [ ] Configure backups: `crontab -e` → `0 3 * * * cd /path/to/suika-core && bash scripts/backup.sh`
- [ ] Set up log rotation for `logs/*.log`
- [ ] Configure Caddy TLS (use `caddy` domain instead of `:81` for auto-HTTPS)

---

## Environment Variables

See [`.env.example`](.env.example) for the full list. Key variables:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `file:./prisma/suika.db` | SQLite path or PostgreSQL URL |
| `SUIKA_AUTH_USER` | `admin` | Login username |
| `SUIKA_AUTH_PASSWORD` | `suika-admin-2024` | Login password (CHANGE IN PROD) |
| `SUIKA_JWT_SECRET` | `change-me...` | JWT signing secret (CHANGE IN PROD) |
| `ZAI_API_KEY` | — | Z.AI SDK key (ASR/TTS/chat) |
| `OPENROUTER_API_KEY` | — | OpenRouter API key |
| `OPENROUTER_DEFAULT_MODEL` | `deepseek/deepseek-chat` | Default OpenRouter model |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `WEB_PORT` | `3000` | Next.js port |
| `VOICE_PORT` | `3003` | Voice service port |
| `GATEWAY_PORT` | `81` | Caddy gateway port |
| `WORKER_MAX_RETRIES` | `5` | Max job retry attempts |
| `PROVIDER_MAX_CONCURRENT` | `4` | Max concurrent provider calls |

---

## Troubleshooting

### "Cannot read properties of undefined (reading 'findUnique')"

The Prisma client is out of sync with the schema. Run:
```bash
bunx prisma generate
```
Then restart the dev server.

### Port already in use

```bash
# Find what's using port 3000
lsof -i :3000
# Kill it
kill -9 <PID>
```

### Voice service unreachable

1. Verify voice-service is running: `curl http://localhost:3003/`
2. Check the gateway routing: `curl "http://localhost:3000/api/suika/voice/sessions?XTransformPort=3003"`
3. Check logs: `tail -50 logs/voice.log`

### Microphone not working in browser

The voice HUD requires HTTPS (or `localhost`). If deploying remotely:
- Use Caddy with a domain (auto-HTTPS)
- Or access via `http://localhost:3000` only

### Provider 429 errors

The z-ai backend has rate limits. If all providers fail:
1. Check `providers` table: `sqlite3 prisma/suika.db "SELECT providerId, circuitState FROM ProviderConfig;"`
2. Reset circuits: `sqlite3 prisma/suika.db "UPDATE ProviderConfig SET circuitState='CLOSED', consecutiveFailures=0;"`
3. Wait 60s for rate limit to reset
4. Consider adding an OpenRouter or OpenAI key for provider diversity

### Workflow stuck in "pending"

Workers may be busy or crashed. Check:
```bash
tail -50 logs/worker.log
ps aux | grep "bun.*worker"
```
Restart workers if needed: `bash scripts/start.sh`

### Database locked

SQLite has a single-writer lock. If you see "database is locked":
1. Stop all services
2. Run `bunx prisma db push` to check integrity
3. Restart services

For production, switch to PostgreSQL (set `DATABASE_URL=postgresql://...`).

### Prisma migrate reset (⚠️ destructive)

```bash
bash scripts/migrate.sh reset
bash scripts/seed.sh
```

---

## API Reference

SUIKA exposes 76 API routes under `/api/suika/`. Key endpoints:

### Companion Intelligence (Phase 4.3)
- `GET /api/suika/companion/state` — companion state + traits + projects + initiatives
- `POST /api/suika/companion/state` `{action:"evolveTraits", success, userSentiment}` — evolve traits
- `GET/POST /api/suika/companion/projects` — list + create projects
- `GET/PATCH/POST /api/suika/companion/projects/[id]` — project CRUD + milestones/tasks/decisions/blockers
- `POST /api/suika/companion/context-fusion` `{userMessage}` — context fusion engine
- `GET/POST /api/suika/companion/initiatives` — list + generate initiatives
- `POST /api/suika/companion/initiatives/[id]` `{action:"decision"|"execute"}` — decide + execute
- `GET/POST /api/suika/companion/conversation` — analyze + persist + list summaries

### Voice Operating System (Phase 4.4)
- `GET /api/suika/voice/sessions` — list voice sessions (proxied to voice-service:3003)
- `GET/POST /api/suika/voice/session/[id]` — session detail + close
- Voice service (port 3003, via gateway `?XTransformPort=3003`):
  - `POST /asr` — speech-to-text
  - `POST /tts` — text-to-speech
  - `POST /conversation` — full voice loop
  - `POST /conversation/interrupt` — interrupt current TTS
  - `GET /sessions` — list sessions
  - `GET /session/:id` — session detail
  - `POST /session/:id/close` — close + summarize

### Core
- `GET /api/suika/system` — health + metrics
- `POST /api/suika/auth/login` — authenticate
- `GET /api/suika/agents` — list agents
- `POST /api/suika/agents/[id]/dispatch` — dispatch workflow
- `GET /api/suika/jobs` — job queue
- `GET /api/suika/events` — event stream
- `GET /api/suika/memory` — memory store
- `GET /api/suika/providers/health` — provider health
- `GET /api/suika/constitution` — constitution articles

**Auth**: All write operations (POST/PATCH/DELETE) require a session cookie from `/api/suika/auth/login`.

---

## Database Schema

44 Prisma models across 11 subsystems. See [`prisma/schema.prisma`](prisma/schema.prisma) for the canonical definition.

| Subsystem | Models | Purpose |
|---|---|---|
| Knowledge Fabric | `Entity`, `Relation` | Entity graph + typed relations |
| Memory | `Memory` | Episodic / semantic / procedural store |
| Agents | `Agent`, `Task`, `ModelCall` | Agent runtime + task DAG |
| Observability | `Event` | Structured event spine |
| Workspaces | `Workspace` | Multi-tenant contexts |
| Constitution | `ConstitutionArticle`, `ConstitutionAmendment`, `ConstitutionEvaluation` | Root authority |
| Identity | `IdentitySnapshot`, `IdentityAuditLog` | Evolving self-definition |
| Relationship | `RelationshipProfile`, `RelationshipGoal`, `RelationshipProject`, `RelationshipTrait`, `RelationshipMilestone`, `RelationshipDecision`, `Interaction` | User understanding |
| Workflow | `ExecutionJob`, `TaskAssignment`, `ScheduledJob`, `ToolCall`, `AgentHandoff`, `ReviewRecord`, `AgentProfile` | Durable execution |
| Providers | `ProviderConfig`, `ProviderHealth`, `ProviderCallLog` | LLM control plane |
| **Companion (4.3)** | `UserProfile`, `UserPreference`, `UserFact`, `ConversationSummary`, `RelationshipState`, `Project`, `ProjectMilestone`, `ProjectTask`, `ProjectDecision`, `ProjectBlocker`, `CompanionTraits`, `InitiativeAction` | Persistent companion memory + project management + personality |
| **Voice (4.4)** | `VoiceSession`, `VoiceTurn` | Voice conversation persistence |

---

## The 6 Canonical Agents

| Agent | Role | Capabilities | Reputation | Wallet |
|---|---|---|---|---|
| **Archivist-1** | memory.curator | retrieve, consolidate, rank | 0.82 | 120 |
| **Navigator-2** | graph.query | traverse, embed, match | 0.76 | 90 |
| **Oracle-3** | reasoning.planner | plan, decompose, synthesize | 0.90 | 200 |
| **Forge-4** | code.generate | generate, refactor, test | 0.84 | 150 |
| **Sentinel-5** (Critic) | safety.audit | verify, redact, enforce | 0.88 | 80 |
| **Scout-6** | research.crawl | search, fetch, summarize | 0.71 | 60 |

The **Executive** is any agent that receives a handoff; the **Architect** is Forge-4 in design mode.

---

## License

SUIKA X — Cognitive Operating System. Production-ready.

---

**SUIKA X © kernel.** A cognitive operating system that amplifies human cognition — warm, precise, and constitutionally grounded.

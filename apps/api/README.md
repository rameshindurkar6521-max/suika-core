# @suika/api

The SUIKA API is implemented as **Next.js API Routes** inside `apps/web/src/app/api/`.

## Why not a separate service?

The API is tightly integrated with the Next.js app — it shares the same Prisma
client, the same TypeScript types, and the same auth middleware. Splitting it
into a separate service would duplicate the route handlers without benefit.

## Endpoints (76 routes)

### Phase 4.3 — Companion Intelligence
- `GET/POST /api/suika/companion/state` — companion state + trait evolution
- `GET/POST /api/suika/companion/projects` — list + create projects
- `GET/PATCH/POST /api/suika/companion/projects/[id]` — project CRUD + milestones/tasks/decisions/blockers
- `POST /api/suika/companion/context-fusion` — context fusion engine
- `GET/POST /api/suika/companion/initiatives` — list + generate initiatives
- `POST /api/suika/companion/initiatives/[id]` — decide + execute
- `GET/POST /api/suika/companion/conversation` — analyze + persist + list summaries

### Phase 4.4 — Voice Operating System
- `GET /api/suika/voice/sessions` — list voice sessions (proxied to voice-service:3003)
- `GET/POST /api/suika/voice/session/[id]` — session detail + close
- Voice service endpoints (port 3003): `/asr`, `/tts`, `/conversation`, `/conversation/interrupt`, `/sessions`, `/session/:id`, `/session/:id/close`

### Core Subsystems
- `/api/suika/system` — health check + system metrics
- `/api/suika/system/seed` — bootstrap seed
- `/api/suika/auth/{login,logout,session}` — authentication
- `/api/suika/agents` + `/api/suika/agents/[id]/{dispatch,tasks,context}` — agent registry + dispatch
- `/api/suika/jobs` + `/api/suika/jobs/[id]/{requeue}` + `/api/suika/jobs/dead-letter` — job queue
- `/api/suika/tasks` + `/api/suika/tasks/[id]` — task management
- `/api/suika/multi-agent/{plan,agents,handoffs}` — multi-agent planner
- `/api/suika/memory` + `/api/suika/memory/{retrieve,consolidate,decay}` — memory system
- `/api/suika/fabric/{graph,entities,relations}` — knowledge fabric
- `/api/suika/router/{route,calls,models,completions}` — model router
- `/api/suika/providers` + `/api/suika/providers/[id]` + `/api/suika/providers/health` — provider control plane
- `/api/suika/constitution` + `/api/suika/constitution/{articles,amendments,evaluations,evaluate}` — constitution engine
- `/api/suika/identity` + `/api/suika/identity/{history,diff,audit,[version],[version]/validate}` — identity engine
- `/api/suika/relationship` + `/api/suika/relationship/{goals,projects,traits,milestones,decisions,interactions,analytics,context,profiles}` — relationship engine
- `/api/suika/events` — observability event stream
- `/api/suika/workspaces` + `/api/suika/workspaces/[id]/activate` — workspace system
- `/api/suika/scheduler` — scheduled jobs
- `/api/suika/tools` — tool runtime
- `/api/suika/reviews` — review records
- `/api/suika/operations/{worker-status,planner-inspect,audit-timeline}` — operations

## Auth

All `/api/suika/*` routes require authentication for write operations
(POST/PATCH/DELETE). Login via:
```bash
curl -X POST http://localhost:3000/api/suika/auth/login \
  -H "Content-Type: application/json" \
  -d '{"user":"admin","password":"suika-admin-2024"}'
```

The session cookie is returned and must be included in subsequent requests.

## Gateway

A single Caddy gateway exposes port 81 externally. Requests with
`?XTransformPort=<port>` are routed to the specified internal port
(e.g. voice-service on 3003). See `docker/Caddyfile`.

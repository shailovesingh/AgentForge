# DECISIONS — AGENTFORGE

> Decision log. Only entries with **Status: Approved** are binding.
> **Proposed** entries are recommendations awaiting Product Owner / Principal Architect review. (None outstanding as of 2026-11-03.)
> Never change an Approved decision silently. Supersede it with a new entry instead.

| ID | Title | Status |
|---|---|---|
| D-001 | Initial technology stack | **Approved** |
| D-002 | Monorepo layout | **Approved** |
| D-003 | Workflow JSON format decoupled from React Flow | **Approved** |
| D-004 | Schema source of truth: TS in Phase 1, Pydantic from Phase 2 | **Approved** |
| D-005 | Zustand for frontend editor state | **Approved** |
| D-006 | General engine v1 is DAG-only (no cycles) | **Approved** |
| D-007 | NL workflow edits as patch operations | **Approved** |
| D-008 | Backend pinned to Python 3.12 via uv | **Approved** |
| D-009 | SQLAlchemy 2.0 + Alembic for persistence | **Approved** |
| D-010 | MCP: remote (streamable HTTP) servers only at first | **Approved** |
| D-011 | CSS Modules for styling | **Approved** |

---

## D-001 — Initial technology stack
- **Status:** Approved (Product Owner, project inception)
- **Decision:**
  - Frontend: React + TypeScript + Vite, with @xyflow/react and Lucide React.
  - Backend: Python + FastAPI + Pydantic.
  - AI: LangGraph, LangChain where useful, and pluggable LLM providers.
  - Infrastructure: PostgreSQL, Redis when required, Docker.
- **Consequences:** any additional major technology requires an explicit decision entry.

## D-002 — Monorepo layout
- **Status:** Approved (Product Owner, 2026-11-03)
- **Context:** the frontend and backend share a contract (the workflow JSON and the catalog) and evolve together.
- **Decision:** a single repo with `frontend/` and `backend/` at the root. No shared package; the contract is shared through generated types (D-004).
- **Alternatives:** separate repos (they create contract-drift and coordination overhead); a workspace tool such as Nx or Turborepo (unnecessary at this size).
- **Consequences:** one place for docs and CI. Each side keeps its own toolchain (npm and uv).

## D-003 — Workflow JSON format decoupled from React Flow
- **Status:** Approved (Product Owner, 2026-11-03)
- **Context:** React Flow's node and edge objects carry UI state (selection, dimensions, internals) and can change between library versions. The engine, the validator and the AI generator need a stable contract.
- **Decision:** AgentForge defines its own versioned Workflow JSON v1 (see ARCHITECTURE §4). The editor converts it to and from React Flow objects, and React Flow types never appear in exported documents.
- **Alternatives:** persisting React Flow's `toObject()` output directly. That needs less code initially, but it couples the backend and the AI layer to a UI library.
- **Consequences:** one small mapping layer in the frontend. The document format is frozen now, before Phase 1 code is written.

## D-004 — Schema source of truth
- **Status:** Approved (Product Owner, 2026-11-03)
- **Context:** Phase 1 (frontend) comes before Phase 2 (backend), but the backend must eventually own validation.
- **Decision:** in Phase 1, hand-written TS types implement the frozen v1 format. From Phase 2, Pydantic models are canonical: their exported JSON Schema generates the TS types, and CI checks for drift.
- **Alternatives:** JSON Schema files as the root source, which adds a third artifact to maintain; or keeping types duplicated by hand, which drifts.
- **Consequences:** one mechanical type-generation step is added in Phase 2.

## D-005 — Zustand for frontend editor state
- **Status:** Approved (Product Owner, 2026-11-03)
- **Context:** the canvas, config panel, node library and import/export all read and write the same graph. React Flow's `useNodesState` is local to one component.
- **Decision:** a single Zustand store holds workflow nodes, edges and selection, and React Flow is rendered from it in controlled mode.
- **Alternatives:** React Context with `useReducer` (re-renders the whole tree on every drag unless split carefully); Redux Toolkit (heavier for this need).
- **Consequences:** about 1 KB of runtime. React Flow already depends on Zustand internally, so no new transitive risk is introduced. This pattern is documented by React Flow.

## D-006 — General engine v1 is DAG-only
- **Status:** Approved (Product Owner, 2026-11-03)
- **Context:** cycles in a general workflow need termination semantics. Autonomous looping is LangGraph's job.
- **Decision:** the validator rejects cycles. Iteration happens inside the Agent node (LangGraph) or later in an explicit, bounded Loop node.
- **Alternatives:** allowing arbitrary cycles with a step limit, which is harder to reason about, debug and generate with AI.
- **Consequences:** simpler scheduling and validation. Some n8n-style loop patterns must wait for a Loop node.
- **PO clarification (2026-11-03):** the engine must be a dependency-based DAG executor, not a sequential node runner. It must support conditional branching, branch selection, skipped nodes and dependency-driven execution. Independent nodes must be architecturally capable of concurrent execution, even if concurrency is implemented later. Cycles are rejected in the general graph; LangGraph handles loops and reasoning inside the Agent node.

## D-007 — NL workflow edits as patch operations
- **Status:** Approved (Product Owner, 2026-11-03)
- **Context:** regenerating the whole workflow on each edit risks silently changing unrelated nodes, and it is hard to review.
- **Decision:** conversational edits return a list of operations (`addNode`, `removeNode`, `updateConfig`, `connect`, `disconnect`, `updateLabel`). The operations are applied to a copy, validated, and shown as a diff before the user accepts.
- **Alternatives:** full regeneration (simpler prompt, poor reviewability).
- **Consequences:** a small patch-application module plus a validator pass. Diffs become possible in the UI.

## D-008 — Backend pinned to Python 3.12 via uv
- **Status:** Approved (Product Owner, 2026-11-03)
- **Context:** the machine's default Python is 3.14.2. The LangChain, LangGraph, psycopg and asyncpg ecosystem has the broadest tested wheel support on 3.12. uv 0.9.24 is already installed.
- **Decision:** `backend/.python-version` = `3.12`, with uv for the environment and dependency management (`pyproject.toml` + `uv.lock`).
- **Alternatives:** 3.14 (newest, with some risk of missing or lagging wheels); pip + venv (no lockfile).
- **Consequences:** uv downloads a managed 3.12 interpreter on first sync.

## D-009 — SQLAlchemy 2.0 + Alembic
- **Status:** Approved (Product Owner, 2026-11-03)
- **Context:** PostgreSQL persistence needs schema migrations and typed queries.
- **Decision:** SQLAlchemy 2.0 (async, typed ORM) with Alembic for migrations. Workflow documents are stored as JSONB.
- **Alternatives:** SQLModel (thinner, but it couples DB models to API models); raw asyncpg (no migrations, more boilerplate).
- **Consequences:** this is the de-facto standard stack, and it keeps DB models separate from the Pydantic API models.

## D-010 — MCP remote servers only at first
- **Status:** Approved (Product Owner, 2026-11-03)
- **Context:** a stdio MCP server means spawning arbitrary local commands chosen by users, which is code execution in the API host.
- **Decision:** support streamable-HTTP (remote) MCP servers first. stdio stays disabled until a sandboxed runner exists.
- **Consequences:** some community MCP servers (stdio-only) are not usable at first.

## D-011 — CSS Modules for styling
- **Status:** Approved (Product Owner, 2026-11-03)
- **Context:** Vite supports CSS Modules natively. React Flow ships its own stylesheet.
- **Decision:** plain CSS Modules with CSS custom properties for theming. No Tailwind and no component library for now.
- **Alternatives:** Tailwind (adds tooling and a new dependency); a UI library such as MUI or shadcn (heavier, and needs approval).
- **Consequences:** zero added dependencies. This can be revisited if UI velocity becomes a bottleneck.

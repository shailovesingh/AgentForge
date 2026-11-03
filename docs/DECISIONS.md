# DECISIONS — AGENTFORGE

> Decision log. Only entries with **Status: Approved** are binding.
> **Proposed** entries are recommendations awaiting Product Owner / Principal Architect review. **Pending** entries are accepted in direction but blocked on a named review step.
> Never change an Approved decision silently. Supersede it with a new entry instead.
> D-012 to D-018 were recorded on 2026-11-03 (Session 3) from the Phase 1 review and are in commit `b7e5cbc` (pushed to GitHub). D-019 to D-024 were recorded on 2026-11-03 (Session 4) from the PO's Phase 1 review decisions; they are **uncommitted working-tree changes**.

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
| D-012 | Keep TypeScript 7, Vite 8, Oxlint, Vitest 5 (no ESLint) | **Approved** |
| D-013 | Workflow JSON v1 and node catalog architecture | **Pending final code review** |
| D-014 | Initial LLM providers: Groq, OpenAI, Anthropic, Ollama | **Approved** (catalog not yet updated) |
| D-015 | Provider-neutral LLM adapter architecture | **Approved** (not yet implemented) |
| D-016 | Credentials never stored in workflow JSON | **Approved** (already holds in Phase 1) |
| D-017 | Non-blocking editor warnings (amended: aware of node categories and port direction) | **Approved** (not yet implemented; rules proposed in PHASE1_1_PLAN §3.6) |
| D-018 | Structural errors kept separate from warnings | **Approved** (not yet implemented) |
| D-019 | Playwright added to the repository as a Phase 1.1 task | **Approved** |
| D-020 | Phase 1 accepted as functionally complete, subject to Phase 1.1 | **Approved** |
| D-021 | Single-user local mode with a `get_current_user()` boundary | **Approved** |
| D-022 | Phase 1.1 contract hardening (H1 JSON Schema subset, H2 shared fixtures, H3 node migrations, H4 branch semantics, H5 canonical JSON) | **H2 Approved; direction of H1, H3, H4, H5 Approved; designs Proposed** (final approval pending) |
| D-023 | Secret guard for workflow JSON (HTTP headers and free-text config) | **Proposed** |
| D-024 | Extensible provider architecture mechanism | **Proposed** (providers themselves Approved in D-014) |

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

## D-012 — Keep the Phase 1 toolchain
- **Status:** Approved (Product Owner / Principal Architect review, 2026-11-03)
- **Context:** Phase 1 was scaffolded from the current Vite template: TypeScript 7, Vite 8, Oxlint, Vitest 5. `tsc`, `oxlint`, `vitest` and `vite build` all pass on it (48 unit tests).
- **Decision:** keep TypeScript 7, Vite 8, Oxlint and Vitest 5. Do not switch to ESLint.
- **Consequences:** if an ecosystem tool later lacks TypeScript 7 support, raise it as a new decision rather than downgrading silently.

## D-013 — Workflow JSON v1 and node catalog architecture
- **Status:** **Pending final code review.** The architecture is kept as implemented, subject to the Principal Architect's review of the source files.
- **Scope under review:** `frontend/src/workflow/types.ts`, `frontend/src/catalog/nodes.ts`, `frontend/src/workflow/connections.ts`, `frontend/src/workflow/validate.ts` (plus `migrate.ts`, `configSchema.ts`, `serialize.ts`).
- **Decision:** the contract stays frozen and **is not modified during the review**. Review findings and the Phase 2 concerns are in `docs/PHASE1_REVIEW.md` §1.
- **Consequences:** Phase 2 step 2 (Pydantic models) must not start until this entry is Approved or amended. Any amendment must stay backward compatible (see ARCHITECTURE §4).

## D-014 — Initial LLM provider support
- **Status:** Approved (PO / Principal Architect review, 2026-11-03). **Not yet reflected in the catalog.**
- **Decision:** initial providers are **Groq, OpenAI, Anthropic and Ollama**.
- **Consequences:** the Phase 1 `provider` enum is `ollama | openai | anthropic` and lacks `groq`. Adding it is an additive catalog change and belongs with the D-013 outcome (not changed during this review).

## D-015 — Provider-neutral adapter architecture
- **Status:** Approved (not yet implemented; backend work, Phase 4).
- **Decision:** LLM access goes through one provider-neutral function (`get_chat_model(provider, model, credential)`, ARCHITECTURE §7) over LangChain chat models. Nodes and the workflow JSON name a provider and a model id only; nothing provider-specific leaks into the engine or the contract.
- **Consequences:** a new provider is a new adapter registration, not a contract change. Model lists are not hard-coded in the catalog.

## D-016 — Credentials are never stored in workflow JSON
- **Status:** Approved. Already true in Phase 1: no catalog node has a credential or key field, and export contains only catalog-defined settings.
- **Decision:** API keys and credentials must never be stored directly in workflow JSON, exports, logs, events or LLM prompts. Workflows reference credentials only by an opaque `credentialRef`, resolved in the backend (ARCHITECTURE §11).
- **Consequences:** the catalog needs a credential-reference setting type in Phase 2/4 (an additive change). The HTTP Request `headers` field is free-form JSON and could still hold a pasted secret; its description warns against this, but no technical guard exists yet (tracked in PROJECT_BRAIN §9).

## D-017 — Non-blocking editor warnings
- **Status:** Approved (not yet implemented; proposed as Phase 1.1).
- **Decision:** the editor shows warnings, never blocking export or import, for: (1) unconnected required inputs, (2) empty required fields, (3) unused nodes. **Amendment (PO, 2026-11-03): the warning rules must be aware of node categories and port direction** (for example Triggers are sources, Output nodes are sinks, required inputs are checked on input ports, results on output ports). The concrete rules are proposed in `docs/PHASE1_1_PLAN.md` §3.6.
- **Consequences:** a pure `lintWorkflow(workflow, catalog)` function is added next to the validator; the exact definitions (e.g. what counts as "unused") are in `docs/PHASE1_REVIEW.md` §2, question 6, and need PO confirmation before implementation.

## D-018 — Structural errors are separate from warnings
- **Status:** Approved (not yet implemented).
- **Decision:** `validateWorkflow` keeps returning **errors** only (invalid structure, unknown types, bad configs, illegal edges), and these block import and, later, save. **Warnings** come from a separate function with a separate type and are never mixed into the error list.
- **Consequences:** the same split applies on the backend in Phase 2: the API returns 422 for errors and may return warnings separately.

## D-019 — Playwright added to the repository
- **Status:** Approved (PO, 2026-11-03)
- **Decision:** add `@playwright/test` as a development dependency in `frontend/` as a Phase 1.1 task, with Chromium-only reproducible local runs and GitHub Actions CI. The first Phase 1.1 task, so it protects the later contract changes.
- **Details:** `docs/PHASE1_1_PLAN.md` §3.9 and task T1; test selection in `docs/PHASE1_REVIEW.md` §3.2.

## D-020 — Phase 1 acceptance
- **Status:** Approved (PO, 2026-11-03)
- **Decision:** Phase 1 is accepted as **functionally complete**, **subject to the Phase 1.1 follow-ups**.
- **Consequences:** D-013 (the workflow contract) is still pending final code review. Phase 2 remains **unapproved**.

## D-021 — Single-user local mode and the authentication boundary
- **Status:** Approved (PO, 2026-11-03)
- **Decision:** single-user local development mode initially. The backend keeps a `get_current_user()` authentication boundary from the start (every owned row has `owner_id`). The application must **not** be exposed beyond localhost without proper authentication.
- **Consequences:** no auth library or login UI before Phase 7; default bind address `127.0.0.1`.

## D-022 — Phase 1.1 contract hardening (H1 to H5)
- **Status:** **H2 Approved** (shared JSON fixtures for Vitest and pytest). **H1, H3, H4, H5: direction Approved** by the PO's instructions; **the designs in `docs/PHASE1_1_PLAN.md` §3.1 to §3.5 are Proposed and await final PO and architect approval.**
- **Decision (requirements set by the PO):**
  - H1: move toward standard JSON Schema-compatible definitions (integer, array, nested objects, defaults, required, items); UI hints such as multiline stay separate from validation.
  - H2: shared JSON fixtures consumed by both Vitest and pytest, with a clear structure and common expected outcomes.
  - H3: a versioned node migration mechanism keyed by `type` and `typeVersion`; old saved workflows are preserved and never overwritten silently.
  - H4: define named condition outputs, selected branches and skipped nodes for the future DAG engine, compatible with Workflow JSON v1.
  - H5: deterministic serialization with recursively sorted object keys and preserved array order, consistent across TypeScript, Python and PostgreSQL JSONB.
- **Impact on Workflow JSON v1:** none of H1 to H5 changes the document structure or requires a `schemaVersion` bump (`docs/PHASE1_1_PLAN.md` §2). The catalog contract changes (H1, H4, providers), and export bytes change once (H5).
- **Consequences:** D-013 stays pending until the architect reviews the contract files together with this plan.

## D-023 — Secret guard for workflow JSON
- **Status:** Proposed
- **Context:** `http.request.config.headers` is free-form JSON and can hold pasted credentials; the same applies to any free-text config and `metadata` (conflicts with D-016).
- **Decision (proposed):** a shared detector scans all config strings and keys. High-confidence matches (known credential header names with literal values; well-known token shapes) **block export** (and, in Phase 2, save) with no override and never echo the value; medium-confidence matches only warn. Credentials themselves stay outside workflow JSON; references arrive with backend credential management.
- **Details and limits:** `docs/PHASE1_1_PLAN.md` §3.7. Needs PO decision S1.

## D-024 — Extensible provider architecture (mechanism)
- **Status:** Proposed (the providers Groq, OpenAI, Anthropic and Ollama are Approved in D-014; the neutral adapter is Approved in D-015)
- **Decision (proposed):** one `PROVIDERS` constant is the only list of providers in Phase 1.1, and the node `provider` enums are built from it. From Phase 2/4 the backend registry of adapters generates the catalog enum, so adding a provider never changes the contract shape. `model` stays free text.
- **Details:** `docs/PHASE1_1_PLAN.md` §3.8.
# PROJECT BRAIN — AGENTFORGE

> This is the canonical shared engineering memory for AgentForge.
> Keep it synchronized with the actual repository state.
> Do not confuse planned functionality with implemented functionality.

## 1. Project Identity

- **Name:** AgentForge
- **Product:** Visual AI Agent Builder
- **Status:** Architecture approved (D-001 to D-011). Phase 1 (visual builder) **implemented and verified; awaiting Product Owner acceptance**. No backend exists.
- **Product Owner:** User
- **Principal Architect:** ChatGPT
- **Implementation Engineer:** Claude Code

## 2. Product Vision

Build a platform that allows users to create AI agents and automation workflows through:

1. Visual drag-and-drop editing.
2. Natural-language workflow generation.
3. Conversational workflow modification.
4. Autonomous AI agent execution.
5. MCP and external integrations.
6. Workflow monitoring and debugging.

## 3. Approved Technology Choices

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript |
| Frontend tooling | Vite |
| Visual editor | @xyflow/react |
| Editor state | Zustand (D-005) |
| Styling | CSS Modules (D-011) |
| Backend | Python 3.12 (uv) + FastAPI (D-008) |
| Validation | Pydantic |
| Agent runtime | LangGraph |
| LLM integrations | LangChain / provider adapters |
| Primary database | PostgreSQL via SQLAlchemy 2.0 + Alembic (D-009) |
| Queue/cache | Redis, when needed |
| Deployment | Docker |

Record changes in `docs/DECISIONS.md`.

**Versions actually installed in `frontend/` (resolved by npm on 2026-11-03):** React 19.3, Vite 8.3, TypeScript 7.0, Vitest 5.1, @xyflow/react 12.12, zustand 5.0, lucide-react 1.66, oxlint 1.x. See Known Issue 8.

## 4. Core Architecture

Full description: `docs/ARCHITECTURE.md`. Summary:

- **Frontend:** visual canvas, node library, config panel, editor store. Implemented in Phase 1.
- **Backend:** API layer, workflow manager, validation, node catalog/registry, DAG execution engine, agent runtime, integrations. **Not started.**
- **AI layer:** workflow generation, NL editing, LLM node, agent node, memory, tool calling. **Not started.**

## 5. Architecture Rules

- Workflow JSON is the canonical workflow definition.
- Node catalog is the source of truth for available nodes.
- Every node has defined input/output contracts.
- The workflow engine is independent of LangGraph and is a dependency-based DAG executor with conditional branching, skipped nodes and concurrency-capable design (D-006, as clarified by the PO).
- LangGraph manages autonomous agent behavior inside the Agent node.
- AI-generated graphs must pass validation.
- External actions must respect authorization and approval.
- Secrets must not be included in LLM prompts or workflow exports.

## 6. Actual Repository Status

*Last updated 2026-11-03 (Session 2).*

### Git

Branch `main`. Commits:

| Commit | Content |
|---|---|
| `798ab84` | Initial commit: documentation and Claude rules |
| `2466b26` | Phase 1 step 1: scaffold frontend |
| `5af36e5` | Phase 1 steps 2–3: Workflow v1 types, catalog, store |
| `35fe3bc` | Phase 1 steps 4–9: canvas, library, config panel, connection rules, import/export |

The documentation commit for step 10 follows `35fe3bc`; see `git log`.

### Repository layout (actual)

```
AgentForge/
  CLAUDE.md  .gitignore  .gitattributes
  .claude/rules/{architecture,frontend,backend}.md
  docs/{PROJECT_BRAIN,ARCHITECTURE,DECISIONS,ROADMAP,DEVELOPMENT_LOG}.md
  frontend/
    src/
      app/           App.tsx, Toolbar.tsx (New / Import / Export, import error panel)
      canvas/        Canvas.tsx (controlled React Flow), flowMapping.ts (the only Workflow <-> React Flow mapping)
      nodes/         WorkflowNode.tsx (single generic node), NodeIcon.tsx, icons.ts
      library/       Library.tsx (grouped, searchable, draggable), search.ts
      config-panel/  ConfigPanel.tsx (form generated from configSchema)
      catalog/       nodes.ts (static catalog, 6 nodes), index.ts (lookups)
      store/         editorStore.ts (Zustand)
      workflow/      types.ts, configSchema.ts, connections.ts, migrate.ts, validate.ts, serialize.ts
```

No `backend/` directory exists. No Docker files exist.

### Environment (verified on this machine)

| Tool | Version / State |
|---|---|
| git | 2.51.0 |
| Node / npm | 24.13.0 / 11.16.0 |
| Python | 3.14.2 default; uv-managed 3.11.14 and 3.14.2 available |
| uv | 0.9.24 |
| Docker | **Not installed** (PO will install Docker Desktop before Phase 2) |
| PostgreSQL / Redis | **Not installed** |
| Browser used for verification | Google Chrome (headless) |
| OS | Windows 11 |

### Completed
- [x] Repository initialized (git, branch `main`)
- [x] Frontend initialized (Vite react-ts, strict TypeScript)
- [ ] Backend initialized (not started; needs a separate review)
- [x] Architecture documentation created and approved by PO (2026-11-03)

### Phase 1 — Visual Builder

Status legend: **Implemented** = code exists. **Tested** = verified as stated in §7.

- [x] React Flow canvas — Implemented, Tested (unit + Chrome)
- [x] Custom node components (one generic catalog-driven component) — Implemented, Tested (Chrome)
- [x] Node library sidebar (categories, search) — Implemented, Tested (unit + Chrome)
- [x] Drag-and-drop nodes (plus click / Enter add) — Implemented, Tested (Chrome)
- [x] Node connections with rules (self-loop, duplicate, single input, data types, cycles) — Implemented, Tested (unit + Chrome; cycle rule is unit-tested only)
- [x] Configuration panel (schema-driven, invalid input not committed) — Implemented, Tested (unit for parsing + Chrome)
- [x] Workflow JSON export — Implemented, Tested (unit + Chrome)
- [x] Workflow JSON import with migrate + validate — Implemented, Tested (unit + Chrome)
- [ ] Phase 1 acceptance by the Product Owner / Principal Architect — **pending**

Not part of Phase 1 and **not implemented**: persistence, execution, undo/redo, auto-layout, NL generation, authentication, repo-based E2E tests.

### Phase 2 — Backend (not started)
- [ ] FastAPI application
- [ ] Workflow API
- [ ] Pydantic schemas
- [ ] Workflow persistence
- [ ] PostgreSQL integration

### Phase 3 — Execution Engine (not started)
- [ ] Node registry
- [ ] Node execution interface
- [ ] Graph validator
- [ ] Execution scheduler
- [ ] Data propagation
- [ ] Execution logs

### Phase 4 — AI Runtime (not started)
- [ ] LLM node
- [ ] Agent node
- [ ] LangGraph integration
- [ ] Tool calling
- [ ] Memory

### Phase 5 — AI Workflow Generation (not started)
- [ ] Natural-language prompt interface
- [ ] Node catalog retrieval
- [ ] Structured graph generation
- [ ] Workflow validation
- [ ] Canvas rendering
- [ ] Conversational workflow editing

### Phase 6 — Integrations (not started)
- [ ] MCP integration
- [ ] HTTP tools
- [ ] Database tools
- [ ] RAG integration

### Phase 7 — Production (not started)
- [ ] Authentication
- [ ] Credential management
- [ ] Background workers
- [ ] Human approval
- [ ] Monitoring
- [ ] Docker deployment

## 7. Current Development State

- **Current phase:** Phase 1 — implementation complete, awaiting acceptance.
- **Last completed task:** Session 2. Phase 1 steps 0–10.
- **Last code commit:** `35fe3bc`.

### Verification results (actual, run 2026-11-03)

| Check | Result |
|---|---|
| `npx tsc -b` (strict) | exit 0 |
| `npm run lint` (oxlint) | exit 0, no warnings |
| `npm test` (Vitest) | **6 files, 48 tests, all passed** |
| `npm run build` | exit 0 (JS 431 kB / 137 kB gzip) |
| Browser run, Chrome headless, Playwright script | **44 / 44 checks passed** |

**Unit tests cover:** catalog consistency (unique types, unique port names, defaults satisfy schema); config validation and input parsing; every store action; every connection rule including transitive cycles; export -> import -> export byte-identical; migration chain; rejection of malformed JSON, wrong version, unknown node types, bad configs, duplicate ids, bad ports, type mismatch and cycles; library search; icon registry.

**Browser run covered (Chrome only):** library list, search and empty state; drag-and-drop landing at the cursor; click and Enter-key add; Delete/Backspace on nodes and edges; valid connections; rejection of occupied-input, duplicate and type-mismatched connections; config panel editing, label edit, invalid number and invalid JSON flagged and **not committed**; export contents (no React Flow fields, edited config present, name-derived filename); import into a fresh page; byte-identical re-export; failed imports leaving the graph untouched; node drag persisting position; deleting a node removing its edges; "New" clearing the canvas; no console errors.

**The browser script is not in the repository.** It ran from a scratch directory with `playwright-core` and the locally installed Chrome. It is therefore not reproducible from the repo, and repo-based E2E remains deferred (open question 2).

**Not tested:** Firefox, Safari, Edge; dark mode appearance; screen-reader behavior; keyboard-only canvas operation (moving or connecting nodes without a mouse); large graphs; touch devices.

## 8. Technical Decisions

Full log: `docs/DECISIONS.md`. **All of D-001 to D-011 are Approved.** D-006 carries the PO clarification (dependency-based DAG executor with branching, skipping and concurrency-capable design; cycles rejected in v1; LangGraph handles loops inside the Agent node).

Small implementation choices made in Session 2 without a decision entry (flagged for architect review):
- Followed Vite template defaults: **oxlint** instead of ESLint, **TypeScript 7**, Vite 8, Vitest 5.
- `strict: true` enabled in `tsconfig.app.json` (the template lacked it).
- Workflow JSON v1 omits `credentialRef` config fields for now; they arrive with credential management.
- Connection rules live in one pure function (`workflow/connections.ts`) reused by the canvas, the store and the importer.
- `fitView` runs only after an import; on mount it zoomed into the first node added.

## 9. Known Issues and Limitations

1. **Unrelated parent instructions file.** `C:\Users\shail\Downloads\CLAUDE.md` is the spec for a different project (AI Hiring MVP: Streamlit/FAISS/Whisper). Claude Code loads it into every AgentForge session and it conflicts with this stack. **Action for PO:** move it out of the AgentForge parent path. Claude does not modify files outside this repo.
2. **No persistence.** Reloading the page loses the in-editor workflow (by design; persistence is Phase 2). Export/import is the only way to keep work.
3. **No undo/redo.**
4. **Browser coverage is Chrome only**; see "Not tested" in §7.
5. **Provider list is a placeholder.** The LLM and Agent nodes offer `ollama | openai | anthropic`, pending open question 1.
6. **The importer does not enforce "required inputs connected" or non-empty required strings** (e.g. an empty HTTP URL is accepted). ARCHITECTURE §4 lists these as validator rules; they belong to run-time validation in Phase 3, since an editor must be able to hold incomplete graphs.
7. **The workflow `description` and `metadata` are preserved on import/export but have no UI.**
8. **Toolchain versions are newer than typical** (TypeScript 7, Vite 8, oxlint). They work, but the architect should confirm they are acceptable; falling back to ESLint is possible.
9. **Windows encoding incident (fixed):** early in Session 2, PowerShell 5.1 `Set-Content -Encoding utf8` added UTF-8 BOMs and re-encoded non-ASCII characters in `docs/PROJECT_BRAIN.md` and `docs/DECISIONS.md` (e.g. `§` became `Â§`). Both were repaired and verified by scanning all docs for mojibake. These two files were committed with the damage in `798ab84`; the repair is in the documentation commit.
10. Node ids are 8-character random strings; collision risk is negligible at editor scale but unchecked.

## 10. Open Questions

1. **LLM providers.** Which are first-class in Phase 4 (e.g. OpenAI, Anthropic, Ollama for local)? Affects the node `provider` enum, `get_chat_model` and the test fakes.
2. **Repo-based E2E tests.** Approve adding Playwright as a dev dependency now, or keep it deferred until after Phase 2?
3. **Toolchain.** Accept TypeScript 7 / Vite 8 / oxlint, or switch to ESLint?
4. **Phase 1 acceptance.** Does the PO / architect accept Phase 1 as complete? If so, Phase 2 needs its own plan and review before any backend work begins.
5. **Auth.** Is multi-user auth a hard requirement before any deployment, or is single-user local mode acceptable until Phase 7?
6. **Editor-side validation UX.** Should the editor show non-blocking warnings (unconnected required inputs, empty required fields) before Phase 3, or wait for the engine's validator?

## 11. Last Session Handoff

- **Date:** 2026-11-03 (Session 2)
- **Last task:** Phase 1 steps 0–10 (git init, scaffold, types and catalog, store, canvas, node component, library, connection rules, config panel, import/export).
- **Implemented changes:** see §6 layout and `docs/DEVELOPMENT_LOG.md` Session 2.
- **Tests:** see §7 (all executed checks passed).
- **Next task:** Product Owner / Principal Architect review of Phase 1.

## 12. Next Recommended Action

1. PO and Principal Architect review the Phase 1 handoff and answer §10 questions 1–6.
2. PO moves `Downloads\CLAUDE.md` out of the AgentForge parent path.
3. If Phase 1 is accepted, Claude drafts a **Phase 2 plan for separate review**: FastAPI scaffold under `backend/` on Python 3.12 via uv; Pydantic models for Workflow JSON v1 and the node catalog as the canonical source; generating the TypeScript types from the exported JSON Schema with a CI drift check; `GET /api/catalog`; workflow CRUD with versioned JSONB snapshots; PostgreSQL through Docker Compose. **No backend work begins before that review.**

## 13. Update Rules

After every meaningful implementation task:

1. Update actual completion status.
2. Record changed files.
3. Record commands and tests executed.
4. Record known issues.
5. Record approved decisions.
6. Set the next task.
7. Update the last-session handoff.

Do not invent implementation status, test results, commit IDs, or decisions.

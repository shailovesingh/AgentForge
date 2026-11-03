# PROJECT BRAIN — AGENTFORGE

> This is the canonical shared engineering memory for AgentForge.
> Keep it synchronized with the actual repository state.
> Do not confuse planned functionality with implemented functionality.

## 1. Project Identity

- **Name:** AgentForge
- **Product:** Visual AI Agent Builder
- **Status:** Architecture approved (D-001 to D-011). Phase 1 (visual builder) **accepted as functionally complete by the PO (D-020), subject to Phase 1.1**. Workflow contract **pending final code review** (D-013). **Phase 1.1 is planned (`docs/PHASE1_1_PLAN.md`), awaiting final approval.** **Phase 2 is proposed only, not approved**; no backend exists.
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

Latest commit: **`b7e5cbc`** (`git commit -m "docs: update documentation for project progress and planning"`; the message text is literal, the commit contains the Session 3 review documents). It is **the same commit on `origin/main`** (verified with `git ls-remote origin HEAD`).

**GitHub remote (added outside the Claude session):** `origin` = `https://github.com/shailovesingh/AgentForge.git`, account `shailovesingh`. All commits `798ab84` to `b7e5cbc` are on it. Claude did not create the remote or push; it observed both in Session 4.

**Uncommitted working-tree changes (Session 4, not committed until the PO approves):** `docs/DECISIONS.md` (D-019 to D-024), `docs/PROJECT_BRAIN.md`, `docs/ROADMAP.md`, `docs/DEVELOPMENT_LOG.md`, `docs/PHASE1_REVIEW.md` (§4), `docs/PHASE2_PLAN.md` (revision note) and the new `docs/PHASE1_1_PLAN.md`. No application code is modified (`git diff HEAD -- frontend` is empty).
### Repository layout (actual)

```
AgentForge/
  CLAUDE.md  .gitignore  .gitattributes
  .claude/rules/{architecture,frontend,backend}.md
  docs/{PROJECT_BRAIN,ARCHITECTURE,DECISIONS,ROADMAP,DEVELOPMENT_LOG}.md
  docs/PHASE1_REVIEW.md   (review package: contract review, six questions, Playwright proposal; PO decisions in §4)
  docs/PHASE1_1_PLAN.md   (PROPOSED Phase 1.1 plan, uncommitted)
  docs/PHASE2_PLAN.md     (PROPOSED, not approved)
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
- [x] Node connections with rules (self-loop, duplicate, single input, data types, cycles) — Implemented, Tested (unit + Chrome; cycle rule also verified in Chrome)
- [x] Configuration panel (schema-driven, invalid input not committed) — Implemented, Tested (unit for parsing + Chrome)
- [x] Workflow JSON export — Implemented, Tested (unit + Chrome)
- [x] Workflow JSON import with migrate + validate — Implemented, Tested (unit + Chrome)
- [x] Phase 1 accepted as functionally complete by the PO (D-020), **subject to Phase 1.1**. D-013 (workflow contract) still pending final code review.

Not part of Phase 1 and **not implemented**: persistence, execution, undo/redo, auto-layout, NL generation, authentication, repo-based E2E tests.

### Phase 1.1 — Contract hardening, warnings, Playwright (PROPOSED; plan in `docs/PHASE1_1_PLAN.md`; none of it is implemented)
- [ ] T1 Playwright harness, 49 ported checks, GitHub Actions CI, `npm run verify`
- [ ] T2 Structured validation errors `{code, path, message}`
- [ ] T3 Shared JSON fixtures in `contracts/` with a Vitest runner (H2, approved)
- [ ] T4 Canonical JSON serialization (H5)
- [ ] T5 JSON Schema subset for `configSchema`, UI hints separated, `groq` and a single `PROVIDERS` constant (H1)
- [ ] T6 Versioned node migrations; `agent.autonomous` v2 as the first real migration (H3)
- [ ] T7 Non-blocking editor warnings, category- and direction-aware (D-017, D-018)
- [ ] T8 Branch semantics specification and the optional `PortDefinition.branch` field (H4)
- [ ] T9 Secret guard for HTTP headers and free-text config (D-023)
- [ ] T10 Documentation, decision records and acceptance report

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

- **Current phase:** Phase 1 — accepted as functionally complete (D-020), subject to Phase 1.1. Phase 1.1 (`docs/PHASE1_1_PLAN.md`) is **proposed, awaiting final approval**; Phase 2 is **proposed only**.
- **Last completed task:** Session 4 (Phase 1.1 plan and decision records, uncommitted); Session 3 review documents are committed in `b7e5cbc`; Session 2 delivered Phase 1 steps 0–10.
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

**Re-run in Session 3 (code unchanged vs `HEAD`):** `npx tsc -b` exit 0; `npm run lint` exit 0; `npm test` 6 files / 48 tests passed; `npm run build` exit 0.

**Follow-up browser run (second ad hoc script, Chrome, 8/8 checks):** cycle rejection (llm2 -> llm1 creates no edge); handle feedback while dragging (occupied input shows the danger colour, a valid free input shows the ok colour, releasing on it creates the edge); pan and wheel zoom change the viewport; dark colour scheme applies and was inspected in a screenshot (legible).

**Not tested:** Firefox, Safari, Edge; screen-reader behavior; keyboard-only canvas operation (moving or connecting nodes without a mouse); large graphs; touch devices.

## 8. Technical Decisions

Full log: `docs/DECISIONS.md`. **D-001 to D-012 and D-019 to D-021 are Approved.** D-022 (Phase 1.1 contract hardening) is **H2 Approved, directions of H1/H3/H4/H5 Approved, designs Proposed**; D-023 (secret guard) and D-024 (provider extensibility mechanism) are **Proposed**. Session 3 review decisions (recorded but uncommitted): D-012 keep TypeScript 7 / Vite 8 / Oxlint / Vitest 5 (Approved); **D-013 Workflow JSON v1 and catalog architecture: Pending final code review**; D-014 providers Groq, OpenAI, Anthropic, Ollama (Approved, catalog not yet updated); D-015 provider-neutral adapter (Approved, not implemented); D-016 no credentials in workflow JSON (Approved, holds today); D-017 non-blocking editor warnings (Approved, not implemented); D-018 errors separate from warnings (Approved, not implemented). D-006 carries the PO clarification (dependency-based DAG executor with branching, skipping and concurrency-capable design; cycles rejected in v1; LangGraph handles loops inside the Agent node).

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
10. **Edge stroke is low-contrast in dark mode** (cosmetic; React Flow default colours).
11. Node ids are 8-character random strings; collision risk is negligible at editor scale but unchecked.
12. **No CI yet.** The GitHub remote exists but there is no `.github/workflows/`; the first workflow is part of Phase 1.1 task T1. Note: history on GitHub still contains the first commit's damaged `PROJECT_BRAIN.md`/`DECISIONS.md` encoding (repaired in later commits); history was not rewritten.
13. **HTTP Request `headers` is free-form JSON** and could hold a pasted secret; only its description warns against this (D-016). No technical guard yet.
14. **Workflow contract concerns for Phase 2** (5 high, 9 medium, 7 low) are listed in `docs/PHASE1_REVIEW.md` §1.4. The high ones (H1 config schema is a hand-rolled subset, H2 rules exist only in TypeScript, H3 no `typeVersion` migration, H4 branching not expressible, H5 JSONB key order vs byte-identical export) need decisions before the Pydantic models are written.
15. The provider enum lacks `groq` (D-014); it is not changed during the review because the contract is frozen.

## 10. Open Questions

The six original questions were **all decided by the PO on 2026-11-03** (Session 4). Full text and reasoning: `docs/PHASE1_REVIEW.md` §2 and §4.

| # | Question | Decision |
|---|---|---|
| 1 | **LLM providers.** Which are first-class in Phase 4? | Groq, OpenAI, Anthropic, Ollama (D-014). `groq` is not yet in the catalog; added in Phase 1.1 T5. |
| 2 | **Repo-based E2E tests.** Add Playwright now or defer? | Approved as a Phase 1.1 task (D-019), first task T1. |
| 3 | **Toolchain.** Accept TypeScript 7 / Vite 8 / oxlint, or ESLint? | Keep (D-012). |
| 4 | **Phase 1 acceptance.** Accept as complete? | Accepted as functionally complete, subject to Phase 1.1 (D-020). |
| 5 | **Auth.** Hard requirement before deployment, or single-user local mode until Phase 7? | Single-user local mode; `get_current_user()` boundary; never beyond localhost without proper auth (D-021). |
| 6 | **Editor-side validation UX.** Warnings before Phase 3? | Yes, non-blocking, aware of node categories and port direction (D-017 amended). |

**Pending decisions (need PO / architect approval; none resolved yet):**
- **Phase 1.1 plan** (`docs/PHASE1_1_PLAN.md`): final approval of the H1, H3, H4, H5 designs (D-022), the secret guard (D-023), the provider mechanism (D-024), and the recommendations P1 to P7, S1, W1, V1, G1 listed in its §6.
- **D-013:** final code review of the Workflow contract (`types.ts`, `nodes.ts`, `connections.ts`, `validate.ts`), best done together with the Phase 1.1 plan because the plan changes the catalog layer.
- **Phase 2:** approval of `docs/PHASE2_PLAN.md` and its decisions X1 to X9 (X1, X2, X3 are largely resolved by Phase 1.1 if approved).

**Blocked:**
- Phase 2 step 2 onward: blocked on Phase 1.1 and D-013.
- Phase 2 step 6 onward: blocked on Docker Desktop (PO will install).
- Phase 1.1 T1 can start only after approval of the plan; CI can run now that the remote exists.
## 11. Last Session Handoff

- **Date:** 2026-11-03 (Session 4)
- **Last task:** Recorded the PO's review decisions (D-019 to D-024, D-017 amendment) and prepared the revised **Phase 1.1 plan**: H1 to H5 designs, which of them change Workflow JSON v1 (none change the document structure), warning rules, secret guard, provider mechanism, Playwright with local and CI runs, ten tasks with dependencies, files, acceptance criteria, tests and risks.
- **Implemented changes:** documentation only. No application code, contract, dependency or configuration change (`git diff HEAD -- frontend` empty).
- **Tests:** unchanged code; last full run (Session 3, `tsc`, `oxlint`, 48 Vitest tests, `vite build`) all passed. Session 4 ran only small standalone Node and Python snippets to verify JavaScript-versus-Python serialization differences used in the H5 design.
- **Repository events observed:** `b7e5cbc` committed and pushed to `origin/main` (GitHub `shailovesingh/AgentForge`) outside the Claude session.
- **Next task:** PO and architect final approval of the Phase 1.1 plan.

## 12. Next Recommended Action

1. **PO and Principal Architect:** review `docs/PHASE1_1_PLAN.md`; answer §6 (P1 to P7, S1, W1, V1, G1); complete the D-013 code review alongside it.
2. **After approval:** commit these documents, then start Phase 1.1 **T1 (Playwright harness and CI)**, one task per commit.
3. **PO:** move `Downloads\CLAUDE.md` out of the AgentForge parent path; install Docker Desktop before Phase 2 step 6.
4. **No Phase 2 or backend work begins** until Phase 1.1 is complete and Phase 2 is separately approved.
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

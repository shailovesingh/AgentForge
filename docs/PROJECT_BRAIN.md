# PROJECT BRAIN — AGENTFORGE

> This is the canonical shared engineering memory for AgentForge.
> Keep it synchronized with the actual repository state.
> Do not confuse planned functionality with implemented functionality.

## 1. Project Identity

- **Name:** AgentForge
- **Product:** Visual AI Agent Builder
- **Status:** Architecture approved (D-001 to D-011). Phase 1 (visual builder) **accepted as functionally complete by the PO (D-020), subject to Phase 1.1**. Workflow contract **pending final code review** (D-013). **Phase 1.1 is APPROVED for implementation (final authorization 2026-11-03, D-026). T1 (Playwright harness and CI) is implemented and committed locally; T2 to T10 are not started.** **Phase 2 is proposed only, not approved**; no backend exists.
- **Product Owner:** User
- **Principal Architect:** Claude (main session, Sonnet 5.5). ChatGPT held this role until 2026-11-03 (D-027).
- **Implementation Engineer:** Sonnet 5.5 subagent (`implementer`)
- **Reviewer:** Opus 5.5 subagent (`reviewer`)

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

Latest commit when this was written: **`382d6a4`** (Claude's Phase 1.1 T1 commit). Per the local `origin/main` reflog it was **pushed at 13:21:06 +0530, 51 seconds after it was committed, by someone other than Claude**; the actor is not verifiable locally. Claude did not push and cannot see GitHub, so **the CI result for `382d6a4` is unknown to Claude** (the PO is asked to report it). T1 review-fix commits (Session 7) follow it; check `git status -sb` and `git log` for their current state.

**GitHub remote:** `origin` = `https://github.com/shailovesingh/AgentForge.git` (account `shailovesingh`). All history up to `cf738b5` is on it.

**Three commit-and-push pairs were made by others, and a fourth push carried Claude's own T1 commit:** `b7e5cbc` (12:16:35 / pushed 12:17:05), `db451da` (12:37:04 / 12:37:28) and `cf738b5` (12:56:14 / 12:56:37), each with the editor-style message `git commit -m "docs: ..."`, each preceded by a `FETCH_HEAD` write 3 seconds before the push. Claude never ran `git push`, `fetch`, `pull` or `remote add`. Evidence and its limits are in `docs/DEVELOPMENT_LOG.md` Sessions 5 and 6; the actor and credential are not verifiable locally. Claude ran two read-only network commands: `git ls-remote origin HEAD` once (a slip: it should have asked first; disclosed in Session 6) and `git ls-remote --tags` against three public action repositories (with the PO's permission, for C5).
### Repository layout (actual)

```
AgentForge/
  CLAUDE.md  .gitignore  .gitattributes
  .claude/rules/{architecture,frontend,backend}.md
  docs/{PROJECT_BRAIN,ARCHITECTURE,DECISIONS,ROADMAP,DEVELOPMENT_LOG}.md
  docs/PHASE1_REVIEW.md   (review package: contract review, six questions, Playwright proposal; PO decisions in §4)
  docs/PHASE1_1_PLAN.md   (Phase 1.1 plan, APPROVED FOR IMPLEMENTATION; T1 implemented (acceptance pending CI), T2 to T10 pending)
  docs/PHASE2_PLAN.md     (PROPOSED, not approved)
  .github/workflows/ci.yml   (CI: runs npm run verify; actions pinned to SHAs; pushed with 382d6a4; GitHub run result unknown to Claude)
  frontend/
    README.md  playwright.config.ts  tsconfig.e2e.json
    e2e/         (26 Playwright tests in 5 specs, editor helpers, console-error fixture)
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

### Phase 1.1 — Contract hardening, warnings, Playwright (APPROVED; T1, T2, T3 done; **milestone MS-A reached, PO review due**; T4 to T10 not started; next milestones MS-B after T6, MS-C after T10)
- [x] T1 Playwright harness, 49 of 52 ad hoc checks ported (26 tests), `npm run verify`, GitHub Actions CI workflow with SHA-pinned actions — **done**: independently reviewed (Opus: PASS WITH FINDINGS), review fixes in `f4cc801`, and the **PO reported the GitHub Actions run green** (48 unit, 26 e2e; PO-reported, not verified by Claude, commit not specified)
- [x] T2 Structured validation errors `{code, path, message}` (23 `ERROR_CODES`, RFC 6901 JSON Pointer paths), shown in the import-error panel — **done**: Sonnet-implemented (`29b8aeb`), Opus-reviewed twice (both PASS WITH FINDINGS, no blockers), fixes `b9d136a`, `60b1609`, `6e97207`; accepted by the Principal Architect; `npm run verify` exit 0 (83 unit, 27 e2e). Two real bugs of one class (untrusted keys reaching inherited object members) were found and fixed on the way: config keys and `schemaVersion` on the import path, and node ids in the canvas.
- [x] T3 Shared JSON fixtures in `contracts/` (74 case files in four families plus the catalog export) and the TypeScript runner (strict shape checker, multiset comparison, coverage guards, minimum-count floors, catalog drift test) — **done**: Sonnet-implemented (`e28483d`), Opus-reviewed (PASS WITH FINDINGS, no blockers; the reviewer verified the expectations against the spec, not the code), fixes `b299782`, accepted by the Principal Architect; `npm run verify` exit 0 (184 unit, 27 e2e). **Tested in TypeScript only; no Python parity is claimed** (a Python runner is a Phase 2 task).
- [ ] T2 Structured validation errors `{code, path, message}`
- [ ] T3 Shared JSON fixtures in `contracts/` with a Vitest runner (H2, approved)
- [ ] T4 Strict parsing (duplicate keys rejected), canonical JSON (compact, hashing) and export JSON (pretty), 120+ fixtures (H5, P7 revised)
- [ ] T5 JSON Schema subset for `configSchema`, UI hints separated, explicit `applyDefaults`, `groq` and a single `PROVIDERS` constant (H1, P1 revised)
- [ ] T6 Versioned node migrations; `agent.autonomous` v2 as the first real migration (H3)
- [ ] T7 Non-blocking editor warnings, category- and direction-aware (D-017, D-018)
- [ ] T8 Branch semantics specification and the optional `PortDefinition.branch` field (H4)
- [ ] T9 Secret detection, prominent warnings and explicit export confirmation (D-023 as revised)
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

- **Current phase:** Phase 1 accepted (D-020). **Phase 1.1 in progress: T1, T2, T3 done; milestone MS-A reached and awaiting the PO's review; T4 starts after that review.** Cadence (D-029): Opus reviews every task, the Principal Architect accepts, the PO reviews at milestones. Phase 2 is **proposed only** and unauthorized.
- **Last completed task:** Session 9: T3 (shared fixtures and the TypeScript runner) implemented, reviewed by Opus, fixed and accepted; Lesson L3 written; milestone MS-A reached. Earlier: T2 (Session 8), T1 (Session 6). Documentation commits `b7e5cbc`, `db451da`, `cf738b5` were made and pushed by others.
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

### Verification results, Session 9 (Phase 1.1 T3; actual, 2026-11-03)

| Check | Result |
|---|---|
| `npm run verify` at `b299782` (run by the Principal Architect) | **exit 0**: oxlint clean; **9 files, 184 unit tests passed** (83 before T3; 166 after `e28483d`; 184 after `b299782`); build ok; **27 e2e tests passed** (unchanged) |
| Fixtures | 74 case files: workflow/valid 7, workflow/invalid 30, connection 22, config 15; plus `format.json` and the catalog export; largest fixture file now 9 KB |
| Type-check separation | `npm exec --no -- tsc -p tsconfig.app.json --listFilesOnly` lists 0 `@types/node` files (the browser app does not see Node types) |
| Opus review of `e28483d` | PASS WITH FINDINGS (no blockers, no majors); the reviewer ran `npm run verify` itself: green |
| Mutation checks (by the implementer; not repeated by Claude) | four deliberate breaks of `connections.ts` each fail exactly the intended fixture; swapping `input-occupied` and `type-mismatch` is caught only by a new fixture |
### Verification results, Session 8 (Phase 1.1 T2; actual, 2026-11-03)

| Check | Result |
|---|---|
| `npm run verify` at `6e97207` (run by the Principal Architect after every fix commit) | **exit 0**: oxlint clean; **8 files, 83 unit tests passed** (78 after `29b8aeb`, 80 after `b9d136a`, 84 after `60b1609`, 83 after `6e97207`); build ok; **27 e2e tests passed** (26 plus one new test for node ids `constructor` and `__proto__`) |
| Opus review 1 (`29b8aeb`) and review 2 (`b9d136a`, `60b1609`) | both PASS WITH FINDINGS, no blockers; each ran `npm run verify` itself: green |
| Fault injection (by the implementer; not repeated by Claude) | reverting the own-property checks fails the new tests; breaking the path text fails the e2e tests |
### Verification results, Session 6 (Phase 1.1 T1; actual, 2026-11-03)

| Check | Result |
|---|---|
| `npx tsc -b` (app, node tooling, e2e) | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` (Vitest) | 6 files, **48 tests passed** (unchanged) |
| `npm run build` | exit 0 |
| `npm run test:e2e` (Playwright, Chromium) | **26 passed**. First run 25 passed and 1 failed (a flaw in my test, fixed, not an app bug); then 5 consecutive green runs including one with `CI=1` |
| `npm run verify` | **exit 0** |
| Clean-room run (67 files, no `node_modules`, `npm ci` then `verify`) | **exit 0**. Windows only; Chromium download was already cached |
| Fault injection (3 temporary source faults, restored) | all three caught by the intended tests; `git diff -- frontend/src` empty afterwards |
| `.github/workflows/ci.yml` | YAML parses; every `uses:` is a 40-character SHA. Pushed with `382d6a4` by someone else; **the GitHub run result is unknown to Claude** |

Pinned actions: `actions/checkout` v7.0.1 `3d3c42e5aac5ba805825da76410c181273ba90b1`; `actions/setup-node` v7.1.0 `949feb2413d6458794dcd2491c4babbbce0c15c1`; `actions/upload-artifact` v7.0.2 `cf430e030ddbb5b0abf93d22962f4752f3646cd9` (resolved with `git ls-remote --tags`; tag existence verified, not GitHub Release objects).
**Re-run in Session 3 (code unchanged vs `HEAD`):** `npx tsc -b` exit 0; `npm run lint` exit 0; `npm test` 6 files / 48 tests passed; `npm run build` exit 0.

**Follow-up browser run (second ad hoc script, Chrome, 8/8 checks):** cycle rejection (llm2 -> llm1 creates no edge); handle feedback while dragging (occupied input shows the danger colour, a valid free input shows the ok colour, releasing on it creates the edge); pan and wheel zoom change the viewport; dark colour scheme applies and was inspected in a screenshot (legible).

**Not tested:** Firefox, Safari, Edge; screen-reader behavior; keyboard-only canvas operation (moving or connecting nodes without a mouse); large graphs; touch devices.

## 8. Technical Decisions

Full log: `docs/DECISIONS.md`. **D-001 to D-012 and D-019 to D-024 are Approved** (D-022 H1 to H5 with P7 subject to revisions that are now applied; D-023 secret detection **as revised**: prominent warning plus explicit export confirmation, not blocking; D-024 providers mechanism, Ollama stays default). **D-025** (absent required config keys are a completeness concern, consequence of the P1 revision) is **Proposed**. **D-013** (workflow contract final code review) is still **pending**. Session 3 review decisions (recorded but uncommitted): D-012 keep TypeScript 7 / Vite 8 / Oxlint / Vitest 5 (Approved); **D-013 Workflow JSON v1 and catalog architecture: Pending final code review**; D-014 providers Groq, OpenAI, Anthropic, Ollama (Approved, catalog not yet updated); D-015 provider-neutral adapter (Approved, not implemented); D-016 no credentials in workflow JSON (Approved, holds today); D-017 non-blocking editor warnings (Approved, not implemented); D-018 errors separate from warnings (Approved, not implemented). D-006 carries the PO clarification (dependency-based DAG executor with branching, skipping and concurrency-capable design; cycles rejected in v1; LangGraph handles loops inside the Agent node).

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
13. **HTTP Request `headers` is free-form JSON** and could hold a pasted secret; only its description warns against this (D-016). No technical guard yet. Planned (D-023, T9): detection, prominent warning and explicit confirmation before export (not blocking).
14. **Workflow contract concerns for Phase 2** (5 high, 9 medium, 7 low) are listed in `docs/PHASE1_REVIEW.md` §1.4. The high ones (H1 config schema is a hand-rolled subset, H2 rules exist only in TypeScript, H3 no `typeVersion` migration, H4 branching not expressible, H5 JSONB key order vs byte-identical export) need decisions before the Pydantic models are written.
15. The provider enum lacks `groq` (D-014); added in Phase 1.1 T5.
16. **Unattributed commits and pushes.** `b7e5cbc` and `db451da` reached GitHub from outside Claude's shell; the actor and credential are not verifiable locally (see DEVELOPMENT_LOG Session 5). Both commits contained review documents that the PO had asked to keep uncommitted pending approval.
17. **CI result unconfirmed.** `382d6a4` was pushed (13:21:06), so the workflow has very probably run once on GitHub, but Claude cannot see the result. The input names used with the v7 actions (`node-version`, `cache`, `cache-dependency-path`, `persist-credentials`, `name`, `path`, `retention-days`, `if-no-files-found`) were not checked against each action's `action.yml` (only tag listings were permitted). Linux behaviour of the e2e suite is unverified (local runs were Windows). The e2e suite tests the Vite dev server, not the production build.
18. **E2E is Chromium only** and the 5 consecutive green runs are a small stability sample. Playwright prints a harmless Node `NO_COLOR`/`FORCE_COLOR` warning; the dev server prints a harmless React Flow attribution `console.warn` (the e2e fixture fails only on console errors).
19. **Whether the T2 commits are pushed, and any CI result for them, is unknown to Claude** (D-030: the PO pushes and reports). The T1 CI result is PO-reported green.
20. **Screen-reader behaviour of the import-error list is untested** with real assistive technology (the path is plain visible text, which should be fine).
21. **The final T2 fix (`6e97207`) and Lesson L2 had no independent Opus re-review**, only the Principal Architect's verification (the tutor's external-world facts are unverified general knowledge).
22. **Carry-overs** for T3, T5, T6 and T7 from the T2 reviews are listed in `docs/PHASE1_1_PLAN.md`.
23. **Fixtures are tested in TypeScript only.** The Python runner is a Phase 2 task; **no parity between TypeScript and Python is claimed or verified.** The fixtures were written as language-neutral data so it can be proven later.
24. **The `b299782` fix and Lesson L3 had no second Opus review**, only the Principal Architect's verification (same limitation as T2's last fix). The tutor's real-world parallels (conformance suites, golden files) are general knowledge and unverified in the repository.
25. **Fixture files are read with `JSON.parse`**, so a duplicate key inside a fixture file is not detected until the strict parser exists (T4). The fixture runner needs Node 20.12 or newer (`package.json` has no `engines` field; CI and local use Node 24).
26. **A 5 MB fixture blob is in the history of `e28483d`** (about 23 KB compressed). History is never rewritten, so it stays; the working tree no longer contains it.

## 10. Open Questions

The six original questions are all decided (see `docs/PHASE1_REVIEW.md` §4 and §4.1). Phase 1.1 decisions P1 to P7, S1, W1, V1, G1 and C1 to C5 are decided (D-017, D-019, D-022 to D-026). **No design question is open.**

**Pending (need PO review or decision):**
- **PO review of T1** (this task) before T2 begins.
- **D-013:** final code review of the Workflow contract, best done alongside Phase 1.1.
- **Phase 2:** approval of `docs/PHASE2_PLAN.md` and decisions X1 to X10. **Phase 2 is not authorized.**
- **Git coordination:** two kinds of actor now commit and push to this repository (see §6). The PO decides how that is coordinated; Claude will not push, fetch, pull or change remotes without explicit permission.
- **First CI run:** needs a push, which Claude may not do. The PO can push when ready and report the result; failures would be fixed in a follow-up Phase 1.1 commit.

**Blocked:** T2 onward waits for T1 review. Phase 2 step 2 onward waits for Phase 1.1 and D-013. Phase 2 step 6 onward waits for Docker Desktop (PO will install).
## 11. Last Session Handoff

- **Date:** 2026-11-03 (Session 9)
- **Last task:** T3 (shared fixtures and the TypeScript runner): Sonnet implementer, Opus review (PASS WITH FINDINGS, no blockers), one fix commit, accepted. Lesson L3 (Sonnet tutor). **Milestone MS-A (T1 to T3) reached.**
- **Implemented changes:** `contracts/` (README, format, 74 fixtures, catalog export), `frontend/src/contracts/fixtures.test.ts`, `frontend/tsconfig.contracts.json` and the tsconfig reference changes. No application source changed.
- **Tests:** `npm run verify` exit 0 at `b299782` (184 unit, 27 e2e), run by the Principal Architect and by the reviewer.
- **Git:** local commits only (D-030); the last `git status` showed `main` ahead of `origin/main` by 10 commits. Whether the PO has pushed since is unknown to Claude.
- **Learning:** Lessons L1, L2 and L3 delivered, each ending in a Knowledge Check; nothing marked Understood; evaluation at the end of the project.
- **Next task:** the PO's MS-A review, then T4.

## 12. Next Recommended Action

1. **PO: review milestone MS-A (T1 to T3).** What to look at: the `contracts/` folder and its `README.md`; `docs/DEVELOPMENT_LOG.md` Sessions 6 to 9; the two Opus reviews and their triage; `npm run verify` (or the GitHub Actions run if you push). Decide: continue to T4 (strict parsing, canonical JSON), or change course.
2. **PO (optional):** push to GitHub for a Linux CI run and a backup; report any CI failure to Claude (D-030).
3. **PO (housekeeping):** move `Downloads\CLAUDE.md` out of the AgentForge parent path; install Docker Desktop before Phase 2 step 6.
4. **No Phase 2 or backend work.**
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

## 14. Learning Progress

> Tracked **separately from implementation progress** (D-028). The curriculum is `docs/LEARNING.md`; the evidence is in `docs/LEARNING_GUIDE.md`. A topic is Understood only with evidence from the Product Owner's answers.

- **Current learning module:** Module 3, Workflow JSON and State Management (structured validation errors, shared fixtures), via **Lessons L2 and L3**; Module 1 (contract-first design) via **Lesson L3**; Module 12 (testing and CI, data-driven tests) via **Lessons L1 and L3**. Recommended next: Modules 1, 2 and the rest of Module 3 (they describe code that already exists).
- **Concepts explained:**
  - **L1 (taught 2026-11-03):** end-to-end versus unit tests, fixtures and helpers, auto-waiting assertions, flaky tests and retries, vacuous tests and fault injection, continuous integration, supply-chain pinning by commit SHA.
  - **L2 (taught 2026-11-03, after Phase 1.1 T2):** machine-readable versus human-readable errors, stable namespaced error codes, JSON Pointer (RFC 6901), string-literal union types and compile-time exhaustiveness, validating untrusted input at a boundary (own-property lookups), table-driven and guard tests, errors versus warnings (D-018).
  - **L3 (taught 2026-11-03, after Phase 1.1 T3):** contract-first design with a shared contract between two implementations (language-neutral fixtures in `contracts/`; the Python runner is planned for Phase 2 and no parity is claimed), data-driven tests with data kept apart from code, comparing `{code, path}` as multisets and never the message, rule order in `checkConnection` as part of the contract, the import semantics a second implementation must follow, coverage guards and minimum-count floors, the catalog drift test with fail-on-purpose regeneration, `inputRepeat` (a generator spec instead of a 5 MB file), circular tests and expectations written from the specification, and mutation checks.
  - **Primer (reference only, no lesson, no evidence):** workflow, node, port, edge, catalog, config schema, `schemaVersion` versus `typeVersion`, validation versus warnings, DAG, credentials.
- **Topics understood:** **none yet.** By design (D-029) answers are collected in one dedicated learning session at the end of the project; no per-lesson questions are asked in conversation.
- **Topics requiring revision:** none recorded.
- **Next learning objective:** keep building; each completed task gets a lesson ending in a Knowledge Check (next: Lesson L4 after T4, strict parsing and canonical JSON). The evaluation session happens at the end of the project.
- **Module status summary:** Modules 1, 3 and 12 In Progress; Modules 2 and 4 to 11 Not Started.
# PROJECT BRAIN — AGENTFORGE

> This is the canonical shared engineering memory for AgentForge.
> Keep it synchronized with the actual repository state.
> Do not confuse planned functionality with implemented functionality.

## 1. Project Identity

- **Name:** AgentForge
- **Product:** Visual AI Agent Builder
- **Status:** Architecture approved (D-001 to D-011). Phase 1 (visual builder) **accepted as functionally complete by the PO (D-020), subject to Phase 1.1**. Workflow contract **pending final code review** (D-013). **Phase 1.1 is APPROVED for implementation (final authorization 2026-11-03, D-026). T1 to T6 are implemented and committed locally (T6 under review fixes; MS-B follows); T8, T7, T9 and T10 are not started.** **Phase 2 is proposed only, not approved**; no backend exists.
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
| Docker | Docker Desktop 4.97.0 installed and running (per-user install; client and server 29.9.2; Compose v5.6.1); not on this shell's PATH |
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
- [ ] T4 Strict parsing, canonical JSON (compact, hashing) and export JSON (pretty) (H5, P7 revised): **split (D-031).** **T4a done**: strict RFC 8259 parser (`strictJson.ts`: duplicate keys after decoding, depth 64 with root = 1, NUL, lone surrogates, token-level number analysis, safe object building), import by bytes with a 5,000,000-UTF-8-byte limit, BOM, fatal UTF-8 decoding, `valuePolicy.ts` for editor values, 7 new error codes (30), `inputBytesBase64`, 153 fixtures; Sonnet-implemented (`9477df7`), Opus-reviewed (PASS WITH FINDINGS), fixes `a0abf63`, accepted; `npm run verify` exit 0 (460 unit, 28 e2e). **T4b in progress** (canonical and export JSON, serialization fixtures, export guard).
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

- **Current phase:** Phase 1 accepted (D-020). **Phase 1.1 in progress: T1 to T6 and T8 done (MS-A and MS-B approved by the PO); T7a (pure warning function) in progress.** Cadence (D-029): Opus reviews every task, the Principal Architect accepts, the PO reviews at milestones (next after MS-B: MS-C after T10). T8, T7, T9, T10 are not started. Phase 2 is **proposed only** and unauthorized.
- **Last completed task:** Session 11: T5a, T5b and T6 (JSON Schema subset validator; catalog, importer and config panel on the subset; versioned node migrations with the upgrade banner) implemented, Opus-reviewed, fixed and accepted; Lessons L6 to L8 written. Earlier: T4 (Session 10), T3 (Session 9), T2 (Session 8), T1 (Session 6).
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

### Verification results, Session 11 (Phase 1.1 T5a, T5b, T6; actual, 2026-11-05)

| Check | Result |
|---|---|
| `npm run verify` (run by the Principal Architect) | T5a `a009b20`: exit 0, 14 files, 905 unit, 30 e2e. T5b `44bd7f4`: exit 0, 15 files, 934 unit, 35 e2e. **T6 `be43319`: exit 0, 17 files, 988 unit, 39 e2e** |
| Fixtures at `be43319` | workflow/valid 21, workflow/invalid 107, connection 22, config 19, serialization 109, schema 148, migration 10 (floor 436) |
| Opus reviews | T5a: PASS WITH FINDINGS (1 major, `checkSchemaSubset` crash; own validator 120,000 cases, 0 differences). T5b: PASS WITH FINDINGS (1 major, UI showed "ollama" for an absent provider; 60,000-document differential old vs new). T6: PASS WITH FINDINGS (1 major in the written contract, fixed by D-033; own reference 6 x 20,000 documents, 0 differences). All reviewer numbers are the reviewers' reports, not repeated by Claude |
| Mutation checks (by implementers; not repeated by Claude) | T5a 7 proofs, T5b 5, T6 8 plus the fix round; equivalent mutants recorded (`Math.round` vs half-up on 1 to 50; redundant loop guard) |
| Not verified | Python parity (no Python runner; planned Phase 2); screen-reader behaviour of the banner; browsers other than Chromium; CI on Linux (PO-reported only) |

### Verification results, Session 10 (Phase 1.1 T4b; actual, 2026-11-04)

| Check | Result |
|---|---|
| `npm run verify` at `d2ef493` (run by the Principal Architect) | **exit 0**: oxlint clean; **13 files, 707 unit tests passed** (679 at `dd33e84`); build ok; **30 e2e tests passed** (29 before) |
| Fixtures | 262 case files: workflow/valid 19, workflow/invalid 97, connection 22, config 15, serialization 109 (100 valid, 9 invalid; 12 are whole-workflow `ser-workflow-*`) |
| Opus review of `dd33e84` | PASS WITH FINDINGS (no blockers or majors): the reviewer wrote its own writer from the spec and it reproduced all 100 valid fixtures with 0 mismatches (reviewer's report, not repeated by Claude) |
| Mutation checks (by the implementer; not repeated by Claude) | `dd33e84`: 17 breaks of the writer, all caught except one equivalent mutant (`JSON.stringify(n)` for numbers). `d2ef493`: removing the try/catch fails 8 tests; skipping the projection fails 3 |
| Not verified | Python parity (no Python runner exists; planned Phase 2); the e2e no-download check is timing based |

### Verification results, Session 10 (Phase 1.1 T4a; actual, 2026-11-04)

| Check | Result |
|---|---|
| `npm run verify` at `a0abf63` (run by the Principal Architect) | **exit 0**: oxlint clean; **12 files, 460 unit tests passed** (185 before T4a; 456 after `9477df7`; 460 after `a0abf63`); build ok; **28 e2e tests passed** (27 before) |
| Fixtures | 153 case files: workflow/valid 19, workflow/invalid 97, connection 22, config 15 |
| Opus review of `9477df7` | PASS WITH FINDINGS, no blockers/majors; the reviewer ran `npm run verify` itself (green), compared the number classifier with a post-conversion classifier on 300,000 tokens (0 differences), verified depth and size boundaries independently, timed 5 MB inputs as linear |
| Invisible/decoded-escape scan of `frontend/src`, `frontend/e2e`, `contracts` | only the deliberate `é` and an emoji remain |
| Mutation checks (by the implementer; not repeated by Claude) | `Number.isSafeInteger(Number(token))`: 50 failures; duplicates before decoding: 6; characters not bytes: 2; plain assignment (`__proto__`): 5; one mutation (post-conversion magnitude check) is an **equivalent mutant**, undetectable by design and recorded |
### Verification results, Session 9 (Phase 1.1 T3; actual, 2026-11-03)

| Check | Result |
|---|---|
| `npm run verify` at `058faae` (run by the Principal Architect) | **exit 0**: oxlint clean; **9 files, 185 unit tests passed** (83 before T3; 166 after `e28483d`; 184 after `b299782`; 185 after `058faae`); build ok; **27 e2e tests passed** (unchanged) |
| Fixtures | 75 case files: workflow/valid 7, workflow/invalid 31, connection 22, config 15; plus `format.json` and the catalog export; largest fixture file now 9 KB |
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
27. **Docker Desktop is installed and running (verified by Claude, 2026-11-04).** It is a **per-user install** (`C:\Users\shail\AppData\Local\Programs\DockerDesktop`, Docker Desktop 4.97.0, found through the registry and running processes; an earlier check looked only in `Program Files` and wrongly concluded it was missing). The engine answers on its named pipe: `docker` client and server 29.9.2 (linux/amd64), Docker Compose v5.6.1, WSL 2 backend (Ubuntu), 8 CPUs and about 8 GB of memory available to it, context `desktop-linux`, **0 containers and 0 images**. `docker` is **not on this shell's PATH**: use `C:\Users\shail\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe` (or add that folder to the PATH). Nothing was pulled or started. It unblocks nothing yet: Phase 2 is unauthorized.
28. **An untracked `.kilo/` folder** (2 small files from another tool, created 2026-11-04 00:35) exists in the repository root. It is not ours, is not committed and is left alone; the PO may want to add it to `.gitignore` or delete it.
29. **Safeguard 1 (token-level number decision) is met in structure but cannot be observed in behaviour** (equivalent mutant, see `docs/PHASE1_1_PLAN.md`). **Other messages that echo attacker-controlled ids, types or `schemaVersion` are not length-bounded** (the Toolbar truncates the display to 200 characters). (Resolved in T4b: the config panel's typed JSON now uses the strict parser.)
30. **T4b soft spots (accepted, D-032):** the JSON Pointer in the export-only error `value.not-json-data` is parsed from the canonical writer's error text (a structured error would be sturdier); the Playwright no-download assertion after a refused export is a 1-second negative wait. A one-time effect: exported files list top-level keys alphabetically (`schemaVersion` last); older files still import. Old validator (`validateConfig`) and the new schema validator (T5a) coexist until T5b removes the old one.

## 10. Open Questions

The six original questions are all decided (see `docs/PHASE1_REVIEW.md` §4 and §4.1). Phase 1.1 decisions P1 to P7, S1, W1, V1, G1 and C1 to C5 are decided (D-017, D-019, D-022 to D-026). **No design question is open.**

**Pending (need PO review or decision):**
- **PO review at milestone MS-B (after T6)** and MS-C (after T10); no review is pending now (MS-A was approved).
- **D-013:** final code review of the Workflow contract, best done alongside Phase 1.1.
- **Phase 2:** approval of `docs/PHASE2_PLAN.md` and decisions X1 to X10. **Phase 2 is not authorized.**
- **Git coordination:** two kinds of actor now commit and push to this repository (see §6). The PO decides how that is coordinated; Claude will not push, fetch, pull or change remotes without explicit permission.
- **First CI run:** needs a push, which Claude may not do. The PO can push when ready and report the result; failures would be fixed in a follow-up Phase 1.1 commit.

**Blocked:** nothing in Phase 1.1. Phase 2 step 2 onward waits for Phase 1.1 and D-013. Phase 2 step 6 onward waits for Docker Desktop (PO will install).
## 11. Last Session Handoff

- **Date:** 2026-11-05 (Session 11)
- **Last task:** T6 (node migrations): Sonnet implementer, Opus review (PASS WITH FINDINGS, no blockers, one major in the written contract fixed by D-033), fix commit, accepted. Also this session: T5a and T5b. Lessons L6 to L8 (Sonnet tutor). **Milestone MS-B (T1 to T6) reached.**
- **Implemented changes (Session 11):** `workflow/jsonSchema.ts` (validator, `applyDefaults`, `checkSchemaSubset`), catalog on the schema subset with a `ui` block and `groq`, importer C1 (absent required keys import), config panel from schema, `workflow/nodeMigrations.ts` (`agent.autonomous` 1 to 2), `UpgradeBanner`, the `schema` and `migration` fixture families, `contracts/CONFIG_SCHEMA.md`, `contracts/MIGRATIONS.md`.
- **Tests:** `npm run verify` exit 0 at `be43319` (17 files, 988 unit, 39 e2e), run by the Principal Architect. Fixtures: workflow/valid 21, invalid 107, connection 22, config 19, serialization 109, schema 148, migration 10 (436 floor).
- **Git:** local commits only (D-030). Whether the PO has pushed is unknown to Claude.
- **Learning:** Lessons L1 to L8 delivered, each ending in a Knowledge Check; nothing marked Understood; evaluation at the end of the project.
- **In flight:** nothing; waiting for the Product Owner's MS-B review.
- **Next task:** after the PO's MS-B decision: T8 (branch semantics and catalog marker), T7 (editor warnings), T9 (secret detection and export confirmation), T10 (documentation and acceptance report); MS-C after T10.

## 12. Next Recommended Action

1. **PO: review milestone MS-B (T1 to T6) and decide: continue with T8, T7, T9, T10 (recommended), or redirect.** What to look at: `docs/DEVELOPMENT_LOG.md` Sessions 10 and 11; the Opus reviews and their triage; `contracts/` (README, CONFIG_SCHEMA.md, MIGRATIONS.md, CANONICAL_JSON.md); `npm run verify` (or the GitHub Actions run if you push). Phase 2 stays unauthorized.
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

- **Current learning module:** Module 3, Workflow JSON and State Management (structured validation errors, shared fixtures, strict parsing and the policy limits, canonical and export JSON), via **Lessons L2, L3, L4, L5, L6, L7 and L8** (L7: the importer's incomplete-draft behaviour, decision C1, explicit defaults at creation; L8: versioned node migrations and the two-phase import); Module 7 (the catalog as the single source of truth for node settings, and its versions over time) via **Lessons L6, L7 and L8**; Module 2 (a settings panel generated from a schema; the upgrade banner) via **Lessons L7 and L8**; Module 1 (contract-first design, the limits and the canonical text as part of the contract) via **Lessons L3, L4, L5 and L6**; Module 12 (testing and CI, data-driven tests, trust boundaries, golden files, property tests, reference implementations, differential and mutation testing, equivalent mutants, fixtures as a specification) via **Lessons L1, L3, L4, L5, L6, L7 and L8**. **Lesson L9 (after Phase 1.1 T8)** adds the branching, skipping and joins **specification** (Modules 5 and 6, specification only: no engine exists), the `branch` marker (Module 7) and reviewing a specification (Module 12). **Lesson L10 (after Phase 1.1 T7a)** adds editor warnings as a pure, derived function (Module 3 main; also Modules 7, 6 and 12). Recommended next: Modules 1, 2 and the rest of Module 3 (they describe code that already exists).
- **Concepts explained:**
  - **L1 (taught 2026-11-03):** end-to-end versus unit tests, fixtures and helpers, auto-waiting assertions, flaky tests and retries, vacuous tests and fault injection, continuous integration, supply-chain pinning by commit SHA.
  - **L2 (taught 2026-11-03, after Phase 1.1 T2):** machine-readable versus human-readable errors, stable namespaced error codes, JSON Pointer (RFC 6901), string-literal union types and compile-time exhaustiveness, validating untrusted input at a boundary (own-property lookups), table-driven and guard tests, errors versus warnings (D-018).
  - **L3 (taught 2026-11-03, after Phase 1.1 T3):** contract-first design with a shared contract between two implementations (language-neutral fixtures in `contracts/`; the Python runner is planned for Phase 2 and no parity is claimed), data-driven tests with data kept apart from code, comparing `{code, path}` as multisets and never the message, rule order in `checkConnection` as part of the contract, the import semantics a second implementation must follow, coverage guards and minimum-count floors, the catalog drift test with fail-on-purpose regeneration, `inputRepeat` (a generator spec instead of a 5 MB file), circular tests and expectations written from the specification, and mutation checks.
  - **L4 (taught 2026-11-04, after Phase 1.1 T4a):** why the built-in `JSON.parse` is not enough for an untrusted file (last duplicate key wins, lenient decoding of invalid bytes, big integers rounded), the strict RFC 8259 parser (`strictJson.ts`), the policy limits and where each rule comes from (RFC, I-JSON / RFC 8785, AgentForge policy, PostgreSQL compatibility), deciding a number's range from its token text, size in UTF-8 bytes, depth counted as containers open, the byte order mark and strict UTF-8, safe object construction (`__proto__`), round-trip integrity for values typed in the editor (`valuePolicy.ts`), rejecting rather than repairing, bounded error messages, boundary-value and differential tests, and mutation testing with an equivalent mutant (TypeScript only; Python parity is planned for Phase 2 and not claimed).
  - **L5 (taught 2026-11-04, after Phase 1.1 T4b):** canonical form and deterministic serialization (why a hash needs the same bytes everywhere), the two named profiles (`canonical-json/1` compact for hashing, `export-json/1` pretty for files and never hashed; no hashing code exists yet), why integer-like keys defeat `JSON.stringify` (also with a sorting replacer) so `canonicalJson.ts` sorts the key list and writes the text directly, UTF-16 code unit order versus code point order (U+E000 and U+1F600), number text (`String(n)` versus Python `repr`, verified on this machine), string escapes and no Unicode normalization, the rule sources (RFC 8785, I-JSON, AgentForge policy, PostgreSQL compatibility), writers that refuse non-JSON data, idempotence and round trip, the export guard `exportWorkflowText` (projects to known fields, never throws, export-only code `value.not-json-data`; lesson revised for the review-fix commit `d2ef493`), PostgreSQL JSONB losing key order (documented, not verified), golden files, a property test against an independent reference, a reviewer's independent re-implementation, a refactor that dropped two implicit protections (fixed in `d2ef493`), and mutation testing with an equivalent mutant (TypeScript only; Python runner and hashing planned for Phase 2; no parity claimed).
  - **L6 (taught 2026-11-05, after Phase 1.1 T5a, commits `96cc80d` and `a009b20`):** the home-made `configSchema` and its limits, the documented JSON Schema subset (draft 2020-12) and its deliberate non-goals (`$ref`, `anyOf`, `pattern`: Pydantic output and regex dialects), `validateAgainstSchema` (type first with an early return, `{code, path}` errors, own-property lookups), the mandatory `checkRequired` option and decision C1 (importer wiring planned for T5b), explicit `applyDefaults`, `checkSchemaSubset` as a total function with one uniform default rule, code-point length, safe integers and enum equality as rules two languages must agree on, the temporary `SCHEMA_ONLY_CODES` list, the three fixture kinds (148 files), a property test against an independent reference and a soundness corollary, and the review findings (reviewer's independent validator and mutation-found gaps are reports). TypeScript only; nothing uses the validator yet (T5b wires it in); no Python parity claimed.
  - **L7 (taught 2026-11-05, after Phase 1.1 T5b, commits `7b09662` and `44bd7f4`):** the catalog as the single source of truth (one `configSchema` per node in the JSON Schema subset with `additionalProperties: false`, explicit `default`s, a separate `ui` block for presentation, the removed `defaults`, `ConfigProperty` and `format: 'multiline'`), three consumers of one definition (node creation through `applyDefaults`, import through `validateAgainstSchema` with `checkRequired: false`, the settings panel), decision C1 / D-025 in code (an incomplete draft imports; the `required-field-empty` warning is planned, T7, not built; execution enforcement is planned, Phase 3), why the importer never applies defaults, a table of who applies defaults and who checks `required` at each moment, `schema.required` on the test-only `codeExemptions.ts` list, the mandatory `checkRequired` field in config fixtures, `PROVIDERS` with `groq`, the schema-driven settings panel and the "(not set)" option (a UI bug that C1 made reachable), the message-versus-path split, and the review stories (a 60,000-document differential run, the "(not set)" finding, mutation-found weak tests: reports). Described at commit `44bd7f4` (15 test files, 934 unit tests, 35 e2e, as recorded by the Principal Architect). TypeScript only; no Python parity claimed; T6 (node migrations) is covered by L8.
  - **L8 (taught 2026-11-05, after Phase 1.1 T6, commits `2baee23` and `be43319`):** two version numbers (`schemaVersion` migrated by `migrate.ts`, `typeVersion` migrated by `nodeMigrations.ts`), the import pipeline (parse, document `migrate`, `migrateNodes`, `validateWorkflow`, load) with the two-phase rule (version errors are returned alone, before validation), `migrateNodes` as a pure, total function that never mutates its input, a chain of single-step migrations up to the catalog's latest version with one `UpgradeReport` per node, the latest-only catalog plus a migration registry, the five node-version outcomes and the codes `node.version-newer`, `node.no-migration-path` and `node.unknown-type` (now only for unknown types), port renames that rewrite edges (synthetic registries only; no real rename yet), `agent.autonomous` version 2 (`maxIterations` an integer; version 1 values rounded half up, only when they were valid at version 1), "never silent, never overwritten" and the three real guarantees, the upgrade banner (an always-mounted status region, focus returned to Import on Dismiss), the half up versus half to even rule that a Python port must follow (Python `round()` described from general knowledge, not run), the equivalent mutant `Math.round` and what to do about it (a written rule and shared fixtures, not a test), and the review stories (a reviewer's own reference on 6 runs of 20,000 documents and an old-versus-new importer comparison on 120,000, both reported; a spec bug found in review, fixed by writing the rule down and two fixtures; an e2e check that could not fail because of the app and its honest rewording; smaller findings). Alternatives: keep every old definition, migrate in the database (planned for Phase 2, not built), auto-rewrite the file, reject old files, a tolerant reader. Described at commit `be43319` (17 test files, 988 unit tests, 39 e2e, as recorded by the Principal Architect; not re-run by the tutor). TypeScript only; no Python parity claimed.
  - **L9 (taught 2026-11-12, after Phase 1.1 T8, code commit `4c696b4`; specification `docs/ARCHITECTURE.md` section 6.1 and D-034, corrected in `32066b2`):** what "emit on one port" means (an absent port was not selected; `null` is a real value), the four edge states (`pending`, `active`, `inactive`, `failed`), readiness and dependency-based scheduling, the fixed run-or-skip order (failure wins; a trigger runs; a non-trigger root is skipped `unreachable`) with a decision diagram, joins on `multiple` inputs (any active, a list in edge array order), failure without fail-fast (drain) and its trade-off, the run result (`no_output_reached`, partial results, aborted runs), records, concurrency and termination (no cycles, D-006), the optional `PortDefinition.branch` marker on output ports (set on both `logic.condition` outputs; catalog metadata only, not in documents; not used for scheduling; the emission check of rule 1 uses it), the alternatives rejected (implicit skipping, skip token, evaluate both, a scheduling marker, fail-fast), and how to review a specification: the reviewer found three Major contradictions in the first draft by walking eleven scenarios by hand (every trigger skipped through vacuous truth; failure versus join precedence; "no marker needed" being false), all fixed before acceptance (reports from `docs/DEVELOPMENT_LOG.md`). **No engine code exists; the specification has been reviewed by analysis only and nothing executes it.** Described at commit `4c696b4` (17 test files, 993 unit tests, 39 e2e, as recorded by the Principal Architect; not re-run by the tutor). TypeScript only; no Python parity claimed. T7a (the pure lint function) was in progress in the working tree and is not covered.
  - **L10 (taught 2026-11-12, after Phase 1.1 T7a, commits `62041bf` and `b472579`):** editor warnings as a pure function derived from the workflow and the catalog (`lintWorkflow` in `frontend/src/workflow/lint.ts`): never stored in the document, never changing it, never blocking; warnings versus errors in code (D-017, D-018, C1; `validateWorkflow` stays errors-only); roles read from the catalog (category and port direction); the five rules (`required-input-unconnected`, `required-field-empty`, `trigger-not-connected`, `node-unreachable`, `result-unused`) with AgentForge examples and fixtures; "empty" for a setting; node-unreachable only when a trigger exists; one cause, one warning and its limit; iterative breadth-first reachability, structural versus run-time reachability (the engine's rule 5(c), specification only); defensive Map and own-property lookups; messages that never contain values; fixed result order; the `warnings` fixture family (34 files, multiset comparison, `negativeFor`, coverage guards; order is unit-tested only); the cross-language whitespace contract (the exact 25 code points of JavaScript `trim`, verified with Node; Python `strip()` differs: general knowledge, not run); review stories (the reviewer's own implementation on 4 x 20,000 graphs, a report; "never throws" overclaimed and fixed by documenting, not by `try/catch`; a scaling test that needs two graph shapes; a spec contradiction; a file-tool Unicode-escape hazard). **T7b, the UI that shows the warnings (`eb166b1`), is under review and not covered.** Described at commits `62041bf` and `b472579`; I ran `src/workflow/lint.test.ts` alone (79 tests passed); the totals at `eb166b1` (19 test files, 1122 unit tests, 51 e2e) are the Principal Architect's `npm run verify` result, not re-run by the tutor. TypeScript only; no Python parity claimed.
  - **Primer (reference only, no lesson, no evidence):** workflow, node, port, edge, catalog, config schema, `schemaVersion` versus `typeVersion`, validation versus warnings, DAG, credentials.
- **Topics understood:** **none yet.** By design (D-029) answers are collected in one dedicated learning session at the end of the project; no per-lesson questions are asked in conversation.
- **Topics requiring revision:** none recorded.
- **Next learning objective:** keep building; each completed task gets a lesson ending in a Knowledge Check (next: a lesson after the next accepted task, T7b, showing the warnings in the editor, once accepted, then T9, secret detection; Lesson L10 covers T7a, Lesson L9 covers T8 and Lesson L8 covers T6). The evaluation session happens at the end of the project.
- **Module status summary:** Modules 1, 2, 3, 5, 6, 7 and 12 In Progress (Module 2 only for the schema-driven settings panel and the banner; Modules 5 and 6 only for the branching specification, since no engine exists); Modules 4 and 8 to 11 Not Started.
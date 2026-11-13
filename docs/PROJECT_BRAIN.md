# PROJECT BRAIN — AGENTFORGE

> This is the canonical shared engineering memory for AgentForge.
> Keep it synchronized with the actual repository state.
> Do not confuse planned functionality with implemented functionality.

## 1. Project Identity

- **Name:** AgentForge
- **Product:** Visual AI Agent Builder
- **Status (2026-11-13, Session 13):** Architecture approved (D-001 to D-011). Phase 1 (visual builder) accepted by the Product Owner (D-020). **Phase 1.1 (contract hardening, warnings, secret safeguards, Playwright and CI) is implemented: all ten tasks T1 to T10 are done and accepted by the Principal Architect; the Product Owner approved milestones MS-A and MS-B; the final phase-level Opus review (D-036) found two blockers, both fixed in Session 13 (`00db75b` documents, `1816a1f` code); milestone MS-C (the Product Owner's acceptance of Phase 1.1) is NOT yet approved.** The workflow contract review D-013 is complete (Approved, T10). **Phase 2 is proposed only, NOT approved**; no backend exists and no Python exists.
- **Product Owner:** User
- **Principal Architect:** Claude (main session, Sonnet 5.5). ChatGPT held this role until 2026-11-03 (D-027).
- **Implementation Engineer:** Sonnet 5.5 subagent (`implementer`); from 2026-11-13 it implements a whole phase in batches (D-036).
- **Reviewer:** Opus 5.5 subagent (`reviewer`); from 2026-11-13 it reviews a completed phase once, plus an early review of security-critical steps (D-036).
- **Tutor:** Sonnet 5.5 subagent (`tutor`), lessons per D-028.

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

**Versions actually installed in `frontend/` (resolved by npm):** React 19.3, Vite 8.3, TypeScript 7.0, Vitest 5.1, @xyflow/react 12.12, zustand 5.0, lucide-react 1.66, oxlint 1.x; Phase 1.1 added only the dev dependencies `@playwright/test`, `playwright` and `playwright-core` 1.64.1 (no runtime dependency changed; verified by the phase review). See Known Issue 12.

## 4. Core Architecture

Full description: `docs/ARCHITECTURE.md`. Summary:

- **Frontend:** visual canvas, node library, config panel generated from the catalog schema, editor store, derived warnings and secret safeguards. Implemented (Phase 1 and 1.1).
- **Contracts:** language-neutral specifications and shared fixtures in `contracts/` (canonical JSON, config schema, migrations, warnings, secrets). Run by TypeScript only; **no Python parity is claimed**.
- **Backend:** API layer, workflow manager, validation, node catalog/registry, DAG execution engine, agent runtime, integrations. **Not started.** The branching and skipping semantics of the future engine are a binding specification (ARCHITECTURE section 6.1, D-034); no engine code exists.
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

*Last updated 2026-11-13 (Session 13), from the repository at `81310b7` plus the review-fix work in progress.*

### Git

Branch `main`, 55 commits at `81310b7`. **`origin/main` is still at `382d6a4`: 46 local commits are not pushed** (D-030: the Product Owner pushes; Claude never pushes, fetches or pulls). The Phase 1 commits are `798ab84`, `2466b26`, `5af36e5`, `35fe3bc`; Phase 1.1 starts at `382d6a4` (T1). Per-task commit lists are in `docs/DEVELOPMENT_LOG.md` Sessions 6 to 13. GitHub remote: `origin` = `https://github.com/shailovesingh/AgentForge.git`. History notes (not rewritten): three documentation commits reached GitHub from outside Claude's shell in Session 5; an early commit has damaged encoding in two documents (repaired later); a 5 MB fixture blob is in the history of `e28483d`. **Before the first push the Product Owner should know:** the repository-wide token scan found no credential-shaped string in the tree or in any commit, but two ordinary-word strings in history match the project's own pattern for an OpenAI-style key (a fixture file name made of the letters s and k, a hyphen and a long run of ordinary words, since renamed in `2a0f501`; and a test string of ordinary words that ended in a risk-like word, added in `33740c3` and since removed); they are not credentials, and GitHub's real patterns could not be checked offline. (This sentence describes them in words on purpose: the repository-wide token guard test scans this document too and flagged the first version of this sentence, which quoted the file name.)

### Repository layout (actual)

```
AgentForge/
  CLAUDE.md  .gitignore  .gitattributes
  .claude/rules/{architecture,frontend,backend}.md   .claude/agents/{implementer,reviewer,tutor}.md
  .github/workflows/ci.yml     (npm ci then npm run verify; actions pinned to commit SHAs; permissions contents: read)
  docs/                         PROJECT_BRAIN, ARCHITECTURE, DECISIONS (D-001 to D-036), ROADMAP, DEVELOPMENT_LOG (Sessions 1 to 13),
                                PHASE1_REVIEW, PHASE1_1_PLAN, PHASE2_PLAN (PROPOSED), LEARNING, LEARNING_GUIDE (Lessons L1 to L13)
  contracts/                    README, CANONICAL_JSON, CONFIG_SCHEMA, MIGRATIONS, WARNINGS, SECRETS (specifications)
                                fixtures/{workflow/valid 21, workflow/invalid 107, connection 22, config 19, serialization 109,
                                          schema 148, migration 10, warnings 39, secrets 84, catalog/builtin.catalog.json, format.json}
  frontend/
    playwright.config.ts  tsconfig.{app,node,e2e,contracts}.json
    e2e/                        8 files: canvas-editing, config-panel, connections, import-export, library, secrets, warnings specs
                                (87 tests) plus editor helpers and the console-error fixture
    src/
      app/           App, Toolbar, UpgradeBanner, WarningsMenu, ConfirmDialog, downloadName, shorten, describeUpgrades
      canvas/        Canvas, flowMapping (the only Workflow <-> React Flow mapping)
      nodes/         WorkflowNode (single generic node, warning and secret badges), NodeIcon, icons
      library/       Library, search
      config-panel/  ConfigPanel (generated from the node schema and its ui block), propertyOrder
      catalog/       nodes.ts (6 nodes, PROVIDERS with groq, agent.autonomous v2), index.ts
      store/         editorStore, warnings, useWarnings, secretReport, useSecretReport (identity-stable derived data)
      workflow/      types, errors (37 codes), strictJson, canonicalJson, valuePolicy, jsonSchema, configSchema, connections,
                     migrate, nodeMigrations, validate, serialize, lint, secrets, codeExemptions (test support)
      contracts/     fixtures.test.ts (the shared-fixture runner and the repository-wide token guard)
```

No `backend/` directory exists. No Docker files exist.

### Environment (verified on this machine)

| Tool | Version / State |
|---|---|
| git | 2.51.0 |
| Node / npm | 24.13.0 / 11.16.0 |
| Python | 3.14.2 default; uv-managed 3.11.14 and 3.14.2 available (no Python code in this repository) |
| uv | 0.9.24 |
| Docker | Docker Desktop 4.97.0 installed and running (per-user install; client and server 29.9.2; Compose v5.6.1); not on this shell's PATH |
| PostgreSQL / Redis | **Not installed** |
| Browser used for verification | Chromium through Playwright |
| OS | Windows 11 |

Tool note: in the Bash tool Vitest has failed intermittently with a `config` error that does not occur in PowerShell; several implementers ran their tests through PowerShell.

### Completed
- [x] Repository initialized (git, branch `main`)
- [x] Frontend initialized (Vite react-ts, strict TypeScript)
- [ ] Backend initialized (not started; Phase 2 is not approved)
- [x] Architecture documentation created, approved by the PO (2026-11-03) and brought in line with the code in T10

### Phase 1 — Visual Builder (accepted by the PO, D-020)
- [x] React Flow canvas, one generic catalog-driven node component, node library with search, drag-and-drop and click/Enter add, connection rules, schema-driven configuration panel, workflow JSON export and import with migrate and validate.
- Not part of Phase 1 and **not implemented**: persistence, execution, undo/redo, auto-layout, NL generation, authentication.

### Phase 1.1 — Contract hardening, warnings, secret safeguards, Playwright (all tasks done, accepted by the Principal Architect; MS-A and MS-B approved by the PO; MS-C pending)
- [x] **T1** Playwright harness, `npm run verify`, GitHub Actions CI with SHA-pinned actions (`382d6a4`, fixes `f4cc801`).
- [x] **T2** Structured validation errors `{code, path, message}` with stable codes and JSON Pointer paths (`29b8aeb` and fixes).
- [x] **T3** Shared JSON fixtures in `contracts/` and the TypeScript runner (strict shape checks, multiset comparison, coverage guards, floors, catalog drift test) (`e28483d`, `b299782`).
- [x] **T4a** Strict RFC 8259 parser with policy limits (`9477df7`, `a0abf63`); **T4b** canonical compact JSON and pretty export JSON, export guard (`dd33e84`, `d2ef493`).
- [x] **T5a** JSON Schema subset validator, explicit `applyDefaults` (`96cc80d`, `a009b20`); **T5b** catalog on the subset, `ui` block, `groq`, importer decision C1, panel from schema (`7b09662`, `44bd7f4`).
- [x] **T6** Versioned node migrations, `agent.autonomous` version 2, upgrade banner (`2baee23`, `be43319`).
- [x] **T8** Branching, skipping and join specification (ARCHITECTURE 6.1, D-034) and the `branch` catalog marker (`4c696b4`).
- [x] **T7a** Pure `lintWorkflow`, five editor warnings, `warnings` fixtures (`62041bf`, `b472579`); **T7b** warning badge, toolbar list, settings-panel section, non-blocking (`eb166b1`, `5fd6687`).
- [x] **T9a** Pure secret detector, `secret-likely` and `secret-suspected` lint codes, `secrets` fixtures with run-time token placeholders (`33740c3`, `2a0f501`); **T9b** prominent indicators, export confirmation dialog, never-echo browser tests (`23456e6`, `3e4a5a5`, `dbc68a0`).
- [x] **T10** Documents aligned with the code, D-013 resolved (Principal Architect, `81310b7`).
- [x] **Final phase-level Opus review fixes** (two blockers: a credential in `schemaVersion` could still show in the import error panel because the check ran on JSON-escaped text; this file was stale): fixed. This file was rewritten from the repository (`00db75b`); the code fix is `1816a1f` (the check now runs on the raw value before JSON escaping; one key rule; `React.memo` on the node view).

### Phase 2 — Backend (not started; NOT approved)
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

- **Current phase:** Phase 1.1 implemented and fixed after the phase-level Opus review (D-036: FAIL with two blockers, both fixed); the acceptance report for milestone MS-C is the next step. Phase 2 is **proposed only** and unauthorized.
- **Process:** since 2026-11-13 (D-036) Sonnet implements a whole phase, Opus reviews the completed phase once, and security-critical steps get an early Opus review (approved by the Product Owner).
- **Last code commit:** `1816a1f` (final phase-review fixes).

### Verification results (actual)

| Check | Result |
|---|---|
| `npm run verify` at `1816a1f` (run by the Principal Architect, Session 13) | **exit 0**: oxlint clean; typecheck of all four tsconfigs; **22 test files, 1440 unit tests passed**; build ok (JS about 462 kB, 148 kB gzip at `81310b7`; Phase 1 was 431 kB / 137 kB); **88 Playwright (Chromium) tests passed** |
| The same by the phase reviewer, from a clean `git archive` of `81310b7` | typecheck, lint, 1429 unit tests; e2e 87 passed three times in a row (reviewer's report) |
| Fixtures at `dbc68a0` | 559 case files: workflow/valid 21, invalid 107, connection 22, config 19, serialization 109, schema 148, migration 10, warnings 39, secrets 84 (+ `format.json` and the catalog export); `MIN_COUNTS` matches |
| Error codes | 37 in `ERROR_CODES`; every code appears in a fixture except the documented exemptions (`value.not-json-data`, export only; five schema-only codes) |
| Progress of the counts | Phase 1: 48 unit; T1: 26 e2e; T2: 83 unit; T3: 185; T4a: 460; T4b: 707 and 30 e2e; T5: 934 and 35; T6: 988 and 39; T7: 1320 and 56; T9: 1429 and 87; final fixes: 1440 and 88 |
| Independent reviews | Opus reviewed every task T1 to T9 once or twice with real defects found and fixed each time (examples: prototype-key bypasses, a lost projection in export, a crash in `checkSchemaSubset`, a UI that showed a provider that was not in the data, a contradictory branching specification, a 500-node drag slowdown, a credential exportable without the dialog, a credential partly shown in an error panel); the phase-level review (Session 13) found two blockers. Reviewer numbers (differentials, mutation runs, timings) are the reviewers' reports and were not repeated by Claude; the mutation proofs are the implementers' reports |
| Not verified | Python parity (no Python exists); screen-reader behaviour; browsers other than Chromium; CI on Linux for T2 to T10 (only T1 was reported green by the PO); the e2e suite runs against the Vite dev server, not the production build; GitHub's real push-protection patterns |

## 8. Technical Decisions

Full log: `docs/DECISIONS.md`, **D-001 to D-036**, each with a table row and an entry. Highlights for Phase 1.1: D-013 workflow contract (Approved after the T10 review); D-014 providers (`groq` now in the catalog; Ollama stays default, D-024); D-016 credentials never in workflow JSON; D-017 and D-018 warnings and errors are separate (implemented in T7); D-019 Playwright and CI; D-022 contract hardening H1 to H5; D-023 secret detection with explicit export confirmation, never blocking (implemented in T9); D-025 incomplete drafts (C1, implemented in T5b); D-026 Phase 1.1 authorization; D-029 milestone cadence; D-030 local-only, the Product Owner pushes; D-031 to D-035 task-level decisions (T4 split, T4b outcomes and T5 split, two-phase import, branching semantics, per-confidence secret caps that reverse an earlier accepted limit); **D-036 phase-level implementation and review with a security exception (Product Owner, 2026-11-13)**. D-006 carries the PO clarification (dependency-based DAG executor with branching, skipping and concurrency-capable design; cycles rejected in v1; LangGraph handles loops inside the Agent node).

## 9. Known Issues and Limitations

1. **Unrelated parent instructions file.** `C:\Users\shail\Downloads\CLAUDE.md` is the spec for a different project (AI Hiring MVP) and Claude Code loads it into every AgentForge session. **Action for the PO:** move it out of the AgentForge parent path. An untracked `.kilo/` folder (from another tool) sits in the repository root; it is not ours and is left alone.
2. **No persistence, no undo/redo, no backend.** Reloading the page loses the in-editor workflow (by design until Phase 2); export/import is the only way to keep work.
3. **Python parity is unproven.** All specifications and fixtures are run by TypeScript only. The cross-language hazards (number text, UTF-16 key order and key length, half-up rounding in migrations, the 25-code-point `trim` whitespace set, JavaScript `\s`, code-point string length, strict parsing, enum equality of booleans and numbers) are written down but unverified until a Python runner passes the 559 fixtures (Phase 2).
4. **Credentials are detected, not stored safely.** `credentialRef` does not exist in the catalog; detection is a heuristic (`contracts/SECRETS.md`: formats not detected, `NAME_sk-...` style misses); the secret scan covers node `config` and `metadata` only: **workflow name, description, node labels and ids are not scanned** (the workflow name is kept out of the download file name when credential-shaped, but is still written into the exported JSON without a dialog: the phase reviewer's finding M2, a decision for the Product Owner under D-035, not yet decided); React Flow's own `data-id` attribute carries node ids. Backend secret policy (X10) is undecided.
5. **Echoing untrusted text is fragile.** Every place that builds a message from attacker-controlled text must call `echoSafe` itself; two review rounds found cut-before-check and escape-before-check leaks (fixed); the final fix is in progress. Future backends (for example FastAPI validation errors that include the rejected input) must be treated the same way.
6. **Editor speed at 500 nodes.** The phase reviewer measured, in the dev server, a median per frame vs `35fe3bc` (Phase 1.1 start): moving a node 249.9 vs 317.4 ms (+27%), typing in a config field 182.3 vs 276.2 ms (+52%); lint and secret scans cost about 1 ms, so it is rendering. The final fix round measured the PRODUCTION build at 500 nodes with a 6x CPU throttle (implementer's report): drag +26%, config typing +34%, workflow-name typing +42% versus `35fe3bc`; the cause was the node badge markup re-rendering on every frame; `React.memo` on the node view now makes drag about 24% FASTER and config typing about 30% faster than before the badges (reported), but the workflow-name edit stays +42% (about 2.7 ms per keystroke at 500 nodes) with an unexplained cause. No CI check measures speed.
7. **UI tests are thin.** No React component test library is installed; components are covered by Playwright (Chromium, dev server) and by source-text guards, which check that text exists, not behaviour.
8. **Duplicated helpers (debt).** Text cutting exists in four places (`shorten.ts`, a private `shorten` in `strictJson.ts`, `cutText`, the cut inside `safeDisplayName`) and the key-redaction rule is written twice; settings are scanned by both `lintWorkflow` and `scanSecrets`.
9. **`exportWorkflowText` catches every exception** and reports it as `value.not-json-data` (so a bug in `projectWorkflow` would be hidden); the JSON Pointer in that error is parsed from the writer's message.
10. **Catalog types are loose.** One `PortDefinition` interface allows output-only fields on inputs and the reverse (a catalog test enforces it); Phase 2 models should separate input and output ports.
11. **CI on Linux unconfirmed.** The T1 run was reported green by the PO; later runs have not been seen by Claude (D-030).
12. **Toolchain versions are newer than typical** (TypeScript 7, Vite 8, oxlint); they work; falling back is possible.
13. **Process record.** Implementers repeatedly broke the tool rules (shell here-docs and `perl` edits, bare `npx`, stray `python` calls) in several tasks; every case is recorded in the development log and the results were verified by the checks; fix commits were reviewed only at the phase level.
14. Minor: Node ids are 8-character random strings (collision risk negligible, unchecked); the workflow `description` and `metadata` have no UI; the edge stroke is low-contrast in dark mode; early documents had a Windows encoding incident (fixed); the Safeguard 1 number-token decision is met in structure but cannot be observed in behaviour (equivalent mutant).

## 10. Open Questions

No design question is open for Phase 1.1. **Pending (need the Product Owner):**
- **MS-C: acceptance of Phase 1.1** (the Principal Architect's acceptance report follows the final fixes).
- **Scope of secret detection (phase review M2):** should the detector and the export dialog also cover the workflow name, description and node labels? Recommendation: yes (a token pasted into a label is plausible).
- **Phase 2:** approval of `docs/PHASE2_PLAN.md` with the Principal Architect's recommended answers to X1 to X10 (a ready-to-approve brief accompanies the MS-C report). **Phase 2 is not authorized.**
- **Push to GitHub:** 46 local commits are unpushed; the Product Owner pushes (D-030) and reports the CI result; see the note under Git above.
- **Housekeeping:** move `Downloads\CLAUDE.md` out of the AgentForge parent path; decide about the untracked `.kilo/` folder.

**Blocked:** nothing in Phase 1.1. Phase 2 waits for the Product Owner's approval; Phase 2 step 6 onward needs Docker Desktop (installed).

## 11. Last Session Handoff

- **Date:** 2026-11-13 (Session 13)
- **Last task:** Phase 1.1 T7b, T9a, T9b and T10 completed and accepted by the Principal Architect; the Product Owner changed the process (D-036) and approved a security exception; the phase-level Opus review of Phase 1.1 returned FAIL with two blockers (stale project memory: fixed by rewriting this file; a credential in `schemaVersion` could still show in the import error panel because the check ran on JSON-escaped text: fixed in `1816a1f`); the Principal Architect then verified: `npm run verify` exit 0.
- **Tests:** `npm run verify` exit 0 at `1816a1f` (22 files, 1440 unit, 88 e2e), run by the Principal Architect.
- **Git:** local commits only (D-030); 46 unpushed.
- **Learning:** Lessons L1 to L13 delivered, each ending in a Knowledge Check; nothing marked Understood; evaluation at the end of the project.
- **In flight:** nothing; the MS-C acceptance report is being sent.
- **Next task:** the Product Owner decides MS-C, the secret-scan scope (M2) and the Phase 2 brief; nothing else is pending.

## 12. Next Recommended Action

1. **Principal Architect:** MS-C acceptance report sent; wait for the Product Owner.
2. **PO:** review MS-C; decide the secret-scan scope (M2); approve or change the Phase 2 brief (X1 to X10); push when ready and report the CI result.
3. **PO (housekeeping):** move `Downloads\CLAUDE.md` out of the parent path.
4. **No Phase 2 or backend work until the PO approves it.**

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

- **Current learning module:** Module 3, Workflow JSON and State Management (structured validation errors, shared fixtures, strict parsing and the policy limits, canonical and export JSON), via **Lessons L2, L3, L4, L5, L6, L7 and L8** (L7: the importer's incomplete-draft behaviour, decision C1, explicit defaults at creation; L8: versioned node migrations and the two-phase import); Module 7 (the catalog as the single source of truth for node settings, and its versions over time) via **Lessons L6, L7 and L8**; Module 2 (a settings panel generated from a schema; the upgrade banner) via **Lessons L7 and L8**; Module 1 (contract-first design, the limits and the canonical text as part of the contract) via **Lessons L3, L4, L5 and L6**; Module 12 (testing and CI, data-driven tests, trust boundaries, golden files, property tests, reference implementations, differential and mutation testing, equivalent mutants, fixtures as a specification) via **Lessons L1, L3, L4, L5, L6, L7 and L8**. **Lesson L9 (after Phase 1.1 T8)** adds the branching, skipping and joins **specification** (Modules 5 and 6, specification only: no engine exists), the `branch` marker (Module 7) and reviewing a specification (Module 12). **Lesson L10 (after Phase 1.1 T7a)** adds editor warnings as a pure, derived function (Module 3 main; also Modules 7, 6 and 12). **Lesson L11 (after Phase 1.1 T7b)** adds showing the derived warnings in the UI without slowing the editor (Module 2 main: selectors, subscriptions, reference identity, the disclosure pattern, live regions, focus; also Module 3: derived data that is not stored; Module 12: measuring a performance cost, mutation testing, what tests must pin). **Lesson L12 (after Phase 1.1 T9a)** adds secret detection as a pure function (Module 12 main: a heuristic detector, never echo, bounding the output, test data that cannot trigger GitHub push protection, an independent reference implementation; also Module 3: the document must never hold credentials, D-016; Module 7: `credentialRef`, planned and not built). **Lesson L13 (after Phase 1.1 T9b)** adds the export confirmation dialog, the prominent indicators and never echoing a secret in the UI (Module 12 main: a protection with a hole is worse than none, a limit that changes a security guarantee needs the decision-maker, never echo as a checklist of output channels, error messages as a leak surface, a never-echo browser test with a self-test, reviewing the fix; Module 2: the native modal dialog, focus rules, keyboard events and propagation, a view model, selectors; Module 3: the user's side of D-016 and D-023). Recommended next: Modules 1, 2 and the rest of Module 3 (they describe code that already exists).
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
  - **L10 (taught 2026-11-12, after Phase 1.1 T7a, commits `62041bf` and `b472579`):** editor warnings as a pure function derived from the workflow and the catalog (`lintWorkflow` in `frontend/src/workflow/lint.ts`): never stored in the document, never changing it, never blocking; warnings versus errors in code (D-017, D-018, C1; `validateWorkflow` stays errors-only); roles read from the catalog (category and port direction); the five rules (`required-input-unconnected`, `required-field-empty`, `trigger-not-connected`, `node-unreachable`, `result-unused`) with AgentForge examples and fixtures; "empty" for a setting; node-unreachable only when a trigger exists; one cause, one warning and its limit; iterative breadth-first reachability, structural versus run-time reachability (the engine's rule 5(c), specification only); defensive Map and own-property lookups; messages that never contain values; fixed result order; the `warnings` fixture family (34 files, multiset comparison, `negativeFor`, coverage guards; order is unit-tested only); the cross-language whitespace contract (the exact 25 code points of JavaScript `trim`, verified with Node; Python `strip()` differs: general knowledge, not run); review stories (the reviewer's own implementation on 4 x 20,000 graphs, a report; "never throws" overclaimed and fixed by documenting, not by `try/catch`; a scaling test that needs two graph shapes; a spec contradiction; a file-tool Unicode-escape hazard). **T7b, the UI that shows the warnings, is covered by Lesson L11.** Described at commits `62041bf` and `b472579`; I ran `src/workflow/lint.test.ts` alone (79 tests passed); the totals at `eb166b1` (19 test files, 1122 unit tests, 51 e2e) are the Principal Architect's `npm run verify` result, not re-run by the tutor. TypeScript only; no Python parity claimed.
  - **L11 (taught 2026-11-13, after Phase 1.1 T7b, commits `eb166b1` and `5fd6687`):** showing the derived warnings (L10) in the UI: a muted badge on each node (`role="img"` with an accessible name, a shortened tooltip), a toolbar count with a non-modal disclosure list whose entries are real buttons that select the node, and a "Warnings for this node" section in the settings panel; no live region, nothing blocked, nothing in the exported document (an e2e test pins the exact key sets and `metadata` equal to `{}`). The main lesson from the review: a feature cheap in logic (linting 500 nodes under a millisecond) made dragging slow because of rendering (the first version subscribed every node to the whole workflow, and the store makes a new workflow object on every edit; the reviewer measured a 500-node drag going from about 86 to 105 ms to about 500 to 600 ms, reports). The fix in `store/warnings.ts` and `store/useWarnings.ts`: a per-workflow `WeakMap` plus one previous view returned when the warning list is equal (structural sharing, stable identity), per-node selectors with a shared frozen empty array, list entries rendered only while open. Concepts: immutable updates and reference identity, selectors and subscriptions, structural sharing, logic cost versus rendering cost, measure rather than guess, a Mermaid data-flow diagram and a first-versus-fixed re-render table. Review stories: six mutation survivors (a non-first entry, the right node's section, an off-by-one badge number, collapse after zero, one lint per component, a leak into the export under another key) and the rule "pin exact shapes, do not search for a word"; e2e tests that pinned wording the contract leaves free; keyboard and focus details (Delete and Backspace inside the list, focus returned to the toggle, stable keys); accessibility judgement (contrast ratios from the reviewer's numbers; no screen-reader test); a fresh node warns at once by design. Honest limits stated in the lesson: the project has no React testing library and no render test, a source-text guard checks a name and not a behaviour, and no test measures drag speed. Described at `5fd6687`; I ran `src/store/warnings.test.ts` alone (16 tests passed); the totals at `5fd6687` (20 test files, 1320 unit tests, 56 e2e) are the Principal Architect's `npm run verify` result and the unit count includes T9a's tests; the reviewer's and implementer's measurements are reports. T9a (secret detector) is not covered.
  - **L12 (taught 2026-11-13, after Phase 1.1 T9a, commits `33740c3` and `2a0f501`):** why a pasted credential in a free-form setting breaks D-016 and what D-023 decided (detect, warn prominently, never echo, confirm before each export, never block; backend enforcement is a separate Phase 2 decision, X10); the detector `frontend/src/workflow/secrets.ts` as a heuristic pure function (seven header names, nine credential shapes found anywhere in a text or key, six key words; high versus medium; the per-key medium rule; the left boundary and precision versus recall; the honest list of misses and of formats not detected); never echo (a finding is a node id, confidence, reason and display path, `[redacted key]`, `safeDisplayName`); bounding the output and not only the work (the reviewer's 2 MB file that gave 120,000 findings and about 288 MB of path text: reports; the cap of 50 findings per node, counted not collected, 200-character paths, `scanSecrets` omitted counts); an iterative walk; the two lint warnings `secret-likely` and `secret-suspected`; the placeholder method (fixtures hold placeholders, the runner builds tokens from pieces at run time) and the repository-wide guard of 13 patterns that prints only file, line and pattern name (scope: the working tree, not history); a labelled-needle never-echo test; the reviewer's second implementation without regular expressions (20,000 workflows, 0 differences: a report); a specification corrected to match the code and pinned by fixtures; a minimum-count floor left at 67 for 83 fixtures; a Mermaid data-flow diagram, rule tables and an alternatives table. Described at `2a0f501` (20 test files, 1367 unit tests, 56 e2e: the Principal Architect's `npm run verify`, not re-run by the tutor); I ran `secrets.test.ts`, `lint.test.ts` and `fixtures.test.ts` together (875 passed; an early transient runner failure of the default pool made me use the `vmThreads` pool for that run) and, after writing, the whole `npm test` (21 files, 1384 passed, including the token guard; that total also includes T9b's uncommitted work). **T9b (the export confirmation dialog, the distinct badge and the toolbar indicator) is covered by L13.** TypeScript only; no Python parity claimed.
  - **L13 (taught 2026-11-13, after Phase 1.1 T9b, commits `23456e6`, `3e4a5a5` and `dbc68a0`; updated after the second review):** the Product Owner's D-023 as a user experience (detect, warn prominently, confirm on every export with Cancel as the default, never block, never echo, nothing remembered); a view model (`frontend/src/store/secretReport.ts`) as the only data the dialog sees, so the leak is impossible to write; the native `<dialog>` with `showModal()` (`frontend/src/app/ConfirmDialog.tsx`: Cancel focused first, a manual Tab cycle, focus returned to Export, a late `close` event under React's development double mount); a Mermaid data flow of one export click; a table of every output surface (dialog, node tooltip, toolbar text, settings notice, warnings list, error panel, console, file name) with how each is enforced and tested, including the honest gap that the workflow name is not scanned; the main story, **a protection with a hole is worse than none** (T9a's cap of 50 findings counted all confidences together, so 50 medium findings before a real credential made it only "counted": no badge, no dialog, a file downloaded with the secret; reproduced end to end by the reviewer: a report; accepted in T9a as a documented limit and reversed by the Principal Architect because it narrowed a binding decision; fixed with separate caps, 50 high and 50 medium, the first high always kept; fixture `sec-cap-mediums-before-high`); **a limit that silently changes a security guarantee needs the decision-maker**; **time of check versus time of use** (Delete or Backspace in the open dialog reached the canvas; "Export anyway" exported a different workflow; fixed by stopping every key but Tab and Escape and exporting the workflow captured at click time); a hostile file made the uncapped dialog slow to paint (reviewer's measurement, a report; capped at 50 nodes); the never-echo browser test (a run-time sentinel scanned in visible text, hidden text, attributes, form values, the title and the console, with a self-test) and the mutation findings behind it; error messages as a leak surface (`shown()` redaction, every lint rule through `safeDisplayName`); the alternatives (block export, a banner, a custom modal, a remember-my-choice checkbox rejected by the Product Owner, server-only checks); real-world applications. **The second, adversarial Opus review of `3e4a5a5` (commissioned because this is a binding Product Owner security decision) was BLOCKED on one narrow item and found no way to export a credential without the dialog (a 100,000-workflow differential against its own oracle: 0 disagreements; 28 keys and chords with the dialog open: nothing reached the canvas; double click and double Enter: one download; all reports).** The blocker: an import error echoed 18 of 27 characters of a credential-shaped key because the duplicate-key message was cut to 100 characters BEFORE the credential check. The lesson now teaches **check before you truncate** and **redact at the source, not at the display** (`echoSafe`, `echoSafePointer`, `isRedactedKey` in `frontend/src/workflow/secrets.ts`, used by `strictJson`, `validate`, `nodeMigrations`, `migrate` and the Toolbar; tested at every cut offset 0 to 120; the marker `(hidden: may contain a credential)`), the smaller second-review fixes (a key-recording listener test that proves only Tab and Escape reach the page, the `onClose` guard tested through `dialog.close()`, a credential-shaped workflow name falling back to `workflow.json`, stale statements), and the review-process change D-036 (Sonnet implements a whole phase, Opus reviews once, with an earlier review kept for security-critical steps). **A final Opus review of the whole of Phase 1.1 is running; its result is not covered and the code may change after the lesson.** Described at `dbc68a0` (22 test files, 1429 unit tests, 87 e2e: the Principal Architect's `npm run verify`; I re-ran `npm test`, result in my report; I did not run the e2e tests). TypeScript only; no Python parity claimed; no server-side enforcement (X10, not built).
  - **Primer (reference only, no lesson, no evidence):** workflow, node, port, edge, catalog, config schema, `schemaVersion` versus `typeVersion`, validation versus warnings, DAG, credentials.
- **Topics understood:** **none yet.** By design (D-029) answers are collected in one dedicated learning session at the end of the project; no per-lesson questions are asked in conversation.
- **Topics requiring revision:** none recorded.
- **Next learning objective:** keep building; each completed task gets a lesson ending in a Knowledge Check (next: a lesson for T10, the final documentation and review of Phase 1.1, and, after the final Opus review of the whole of Phase 1.1 is triaged, an update to Lesson L13 if the code changes; Lesson L13 covers T9b, Lesson L12 covers T9a, Lesson L11 covers T7b, Lesson L10 covers T7a, Lesson L9 covers T8 and Lesson L8 covers T6). The evaluation session happens at the end of the project.
- **Module status summary:** Modules 1, 2, 3, 5, 6, 7 and 12 In Progress (Module 2 only for the schema-driven settings panel and the banner; Modules 5 and 6 only for the branching specification, since no engine exists); Modules 4 and 8 to 11 Not Started.
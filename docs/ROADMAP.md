# ROADMAP — AGENTFORGE

> Status legend: **Not started** · **Planned** (detailed plan exists) · **In progress** · **Done** (implemented + verified).
> Last updated: 2026-11-04 (Session 10). Phase 1.1 is approved and in progress (T1 to T10 done and accepted by the Principal Architect; MS-B approved; final phase review running, MS-C pending). The Phase 2 row is a **proposal**. Learning progress is tracked in `docs/LEARNING.md`, not here.

| Phase | Name | Status | Prerequisites |
|---|---|---|---|
| 0 | Project bootstrap (docs, rules, architecture proposal) | **Done** (architecture approved 2026-11-03) | — |
| 1 | Visual workflow builder (frontend only) | **Accepted as functionally complete by the PO (D-020), subject to Phase 1.1.** Contract pending final code review (D-013) | — |
| 1.1 | Contract hardening and follow-ups: Playwright + CI with SHA-pinned actions (D-019), shared fixtures, JSON Schema config with explicit defaults (H1), node migrations (H3), branch semantics (H4), strict parsing and canonical JSON (H5), `groq`, category-aware warnings, secret detection with explicit export confirmation (D-023) | **APPROVED; IN PROGRESS.** T1, T2, T3 **done** (MS-A reviewed and approved by the PO). **T4 done (D-031): T4a** (strict parsing) and **T4b** (canonical and export JSON; `dd33e84`, review fixes `d2ef493`; 707 unit, 30 e2e) Opus-reviewed, fixed, accepted. **T5 split (D-032): T5a done** (pure JSON Schema subset validator, explicit `applyDefaults`, schema fixtures; `96cc80d`, review fixes `a009b20`; 905 unit, 30 e2e; Opus-reviewed, accepted); **T5b done** (catalog on the schema subset, importer C1, config panel from schema, `groq`; `7b09662`, review fixes `44bd7f4`; 934 unit, 35 e2e; Opus-reviewed, accepted). **T6 done** (node migrations, `agent.autonomous` version 2, upgrade banner, `migration` fixtures; `2baee23`, review fixes `be43319`; 988 unit, 39 e2e; Opus-reviewed, accepted; D-033). **Milestone MS-B (T1 to T6) reached and approved by the PO (2026-11-12: "Continue with T8, T7, T9, T10").** **T8 done** (branch semantics: binding specification `ARCHITECTURE.md` section 6.1, D-034, catalog marker `branch`; `4c696b4`; 993 unit, 39 e2e; Opus-reviewed, specification rewritten after three Major findings, accepted). **T7 done** (T7a pure `lintWorkflow` and fixtures `62041bf`+`b472579`; T7b warning UI `eb166b1`+`5fd6687`; 1320 unit, 56 e2e; both Opus-reviewed, the T7b major was a 500-node drag slowdown caused by re-rendering, fixed). **T9 split: T9a done** (pure secret detector, `secret-likely`/`secret-suspected` lint codes, `secrets` fixtures with run-time token placeholders; `33740c3`+`2a0f501`; 1367 unit, 56 e2e; Opus-reviewed, accepted); **T9b done** (prominent indicators, the export confirmation dialog, never-echo browser tests; `23456e6`, `3e4a5a5`, `dbc68a0`; two Opus reviews, the second adversarial; D-035 reversed an accepted secret-cap limit); **T10 done** (documents brought in line with the code, D-013 resolved). All ten tasks are implemented and accepted by the Principal Architect at `dbc68a0` (22 test files, 1429 unit tests, 87 e2e). **The final phase-level Opus review of Phase 1.1 is running (D-036: Opus now reviews a completed phase once); milestone MS-C awaits it and then the Product Owner.** Order: T1 → T2 → T3 → T4 → T5 → T6 → T8 → T7 → T9 → T10. **PO milestones:** MS-B after T6, MS-C after T10 (D-029). Plan: `docs/PHASE1_1_PLAN.md` | Opus review of every task; PO review at milestones; D-013 review |
| 2 | Backend: FastAPI, Pydantic schemas, workflow API, PostgreSQL | **Proposed only; NOT approved; not started.** Ten-step plan in `docs/PHASE2_PLAN.md` | PO approval of the plan; D-013 contract review (blocks step 2 onward); Docker Desktop (blocks step 6 onward); D-008, D-009 approved |
| 3 | Execution engine (registry, validator, DAG scheduler, run logs, SSE) | Not started | Phase 2; D-006 |
| 4 | AI runtime (LLM node, Agent node, LangGraph, tools, memory) | Not started | Phase 3 |
| 5 | AI workflow generation (NL create, patch-based edit) | Not started | Phases 2–4; D-007 |
| 6 | Integrations (MCP, HTTP tools, DB tools, RAG) | Not started | Phase 4; D-010 |
| 7 | Production (auth, credential mgmt UI, workers, approvals, monitoring, Docker deploy) | Not started | Phases 2–6 |

Note: credential encryption, `owner_id` scoping and execution limits are built *into* Phases 2–4 rather than deferred to Phase 7. Phase 7 adds user-facing authentication and operational hardening.

---

## Phase 1 — Visual Workflow Builder (Detailed Plan)

**Goal:** a workflow author can build a workflow on a canvas from catalog nodes, configure it, and export or import it as Workflow JSON v1.

**Scope:** frontend only. There is no backend, persistence or execution in this phase.

| # | Step | Depends on | Acceptance criteria |
|---|---|---|---|
| 0 | `git init`, root `.gitignore` (node_modules, dist, .env*, .venv, __pycache__), initial commit **with PO approval** | — | Repo tracked; `git status` clean; no secrets or build output tracked |
| 1 | Scaffold `frontend/` with Vite `react-ts`; add `@xyflow/react`, `lucide-react`, `zustand`; add Vitest; strict `tsconfig` | 0 | `npm run dev`, `npm run build`, `npm run lint`, `npm test` all succeed |
| 2 | `workflow/types.ts` (Workflow JSON v1) and `catalog/` static `NodeDefinition[]`: Manual Trigger, LLM Prompt, HTTP Request, Condition, Agent, Output | 1 | Types compile; test: unique `type`s, unique port names per node, `defaults` satisfy `configSchema` |
| 3 | Zustand store: nodes, edges, selection; actions `addNode`, `updateNodeConfig`, `updateNodeLabel`, `removeNodes`, `connect`, `removeEdges`, `moveNode`, `loadWorkflow`, `reset` | 2 | Unit tests per action; removing a node removes its edges |
| 4 | Canvas: controlled `<ReactFlow>` from the store; Background, Controls, MiniMap; Delete/Backspace removes the selection; fit view | 3 | Store changes render; pan, zoom and delete work in the browser |
| 5 | Generic `WorkflowNode` component: icon (Lucide by name), label, input handles on the left, output handles on the right, handle id = port name, port labels | 2, 4 | Every catalog node renders correctly; selected state is visible |
| 6 | Node library sidebar: grouped by category, text search, HTML5 drag source; drop handler uses `screenToFlowPosition`; click/Enter adds at the viewport center (keyboard accessible) | 4, 5 | A dropped node appears at the cursor with catalog defaults; search filters by label and description |
| 7 | Connection rules: pure `canConnect(workflow, catalog, connection)` covering no self-loop, no cycle, input not already connected unless `multiple`, compatible `dataType` (`any` matches all); wired to `isValidConnection` | 3 | Unit test per rule; invalid drags show as rejected and create no edge |
| 8 | Config panel: shows the selected node; label editor; form rendered from `configSchema` (string, text, number, boolean, enum, json); inline validation messages | 3, 5 | Edits persist in the store and show up in the export; invalid JSON or number input is flagged and not committed |
| 9 | Export: serialize the store to Workflow JSON v1 and download `<name>.json`. Import: file picker, then parse, then `migrate`, then validate (schema shape, known types and versions, port references, rules from step 7), with readable error list | 2, 3, 7 | **Round-trip test:** export → import → export is byte-identical. Malformed or unknown-type files are rejected with specific messages and leave the current graph untouched |
| 10 | Update PROJECT_BRAIN, DEVELOPMENT_LOG and ROADMAP; handoff report | all | Docs reflect the actual verified state |

**Results (Session 2, 2026-11-03).** "Unit" = Vitest. "Chrome" = ad hoc Playwright run against the dev server (script kept outside the repo).

| # | Status | Evidence |
|---|---|---|
| 0 | Done | `git init`, `.gitignore`, `.gitattributes`; staged files inspected; secret-pattern scan found nothing; commit `798ab84` |
| 1 | Done | `build`, `lint`, `test` exit 0; dev server answered HTTP 200; commit `2466b26` |
| 2 | Done | Unit: unique `type@version`, unique port names, defaults satisfy `configSchema`, config validator cases |
| 3 | Done | Unit: every store action, including node removal cascading to edges (commit `5af36e5`) |
| 4 | Done | Chrome: store renders; Delete/Backspace remove nodes and edges. Pan and wheel zoom verified in the follow-up Chrome run; MiniMap renders but was not interacted with |
| 5 | Done | Chrome: all six catalog nodes render labels, icons and handles; handle ids equal port names (edges connected through them) |
| 6 | Done | Chrome: drop lands at the cursor (within 40 px); search filter and empty state; click and Enter add |
| 7 | Done | Unit: every rule. Chrome: occupied input, duplicate and type mismatch create no edge. Cycle rejection and the green/red handle feedback while dragging were verified in Chrome in a follow-up run (8/8 checks) |
| 8 | Done | Unit: input parsing. Chrome: label edit, enum select, invalid number and invalid JSON flagged and not committed (confirmed via export) |
| 9 | Done | Unit: round trip byte-identical, 8 rejection cases, migration chain. Chrome: export, fresh-page import, byte-identical re-export, failed imports leave the graph untouched (commit `35fe3bc`) |
| 10 | Done | This documentation update |

Totals: 48 unit tests passed; 44/44 Chrome checks passed; `tsc`, `oxlint` and `vite build` clean. Chrome-only; see PROJECT_BRAIN §7 "Not tested".

**Explicitly out of scope for Phase 1:** backend and persistence, workflow execution, undo/redo, auto-layout, NL generation, authentication, Playwright E2E.

**Phase 1 exit criteria:**
- Every acceptance criterion above is met.
- `npm run build`, `npm run lint` and `npm test` pass.
- A manual browser check covers building a 4+ node workflow, configuring it, exporting it, reloading the page, importing it, and confirming the result is identical.

**Risks:**
- The Workflow v1 format freezing too late. Mitigation: D-003 and D-004 are decided before step 2.
- React Flow's controlled-mode performance with large graphs. Not a concern at Phase 1 scale; revisit above about 500 nodes.

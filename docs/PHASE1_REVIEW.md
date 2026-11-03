# PHASE 1 REVIEW PACKAGE — AGENTFORGE

> **Status: review material prepared 2026-11-03 (Session 3), committed in `b7e5cbc`. The PO decided Q1 to Q6 on 2026-11-03 (see §4). The answers in §2 are kept as originally proposed.**
> Nothing here changes application code or the frozen Workflow JSON v1 contract.
> Contents: §1 workflow contract review · §2 the six open questions with proposed answers · §3 Playwright proposal.
> Phase 2 plan: `docs/PHASE2_PLAN.md`. Decisions: `docs/DECISIONS.md` (D-012 to D-018).

---

## 1. Workflow Contract Review

Files under review (all unchanged since commit `35fe3bc`; `git diff HEAD -- frontend` is empty):

| File | Lines of concern | Role |
|---|---|---|
| `frontend/src/workflow/types.ts` | pure types | The shapes: document, nodes, edges, ports, catalog definitions, config schema subset |
| `frontend/src/catalog/nodes.ts` | static data | The six built-in `NodeDefinition`s |
| `frontend/src/workflow/connections.ts` | pure logic | `checkConnection`: the single rule set for "may this edge exist?" |
| `frontend/src/workflow/validate.ts` | pure logic | `validateWorkflow`: turns an untrusted parsed document into a canonical `Workflow`, or a list of errors |

Satellite files the four depend on: `workflow/configSchema.ts` (config value checks), `workflow/migrate.ts` (schemaVersion upgrade chain), `workflow/serialize.ts` (canonical export, import pipeline), `catalog/index.ts` (lookups).

### 1.1 What each file does

**`types.ts`** declares data shapes only and has no logic or React imports (apart from one constant, `SCHEMA_VERSION = '1.0'`).

- **Document:** `Workflow { schemaVersion, id, name, description, nodes[], edges[], metadata }`.
- **Node:** `WorkflowNode { id, type, typeVersion, label, config, position{x,y} }`. `config` is `Record<string, unknown>`.
- **Edge:** `WorkflowEdge { id, source: PortRef, target: PortRef }`, where `PortRef { nodeId, port }`. An edge always goes from an **output** port to an **input** port.
- **Catalog entry:** `NodeDefinition { type, version, category, label, description, icon, inputs[], outputs[], configSchema, defaults }`.
- **Port:** `PortDefinition { name, label, dataType, required?, multiple? }`. `name` doubles as the React Flow handle id.
- **Config schema subset:** `ConfigSchema { type:'object', properties, required? }` with `ConfigProperty { type: 'string'|'number'|'boolean'|'object', title, description?, enum?, format?: 'multiline', minimum?, maximum? }`.
- **Closed unions:** `DataType` (`any | text | json | number | boolean | messages | tool`) and `NodeCategory` (`Triggers | AI | Integrations | Logic | Output`).

**`nodes.ts`** is the catalog: an array of six `NodeDefinition`s, shaped exactly like the future `GET /api/catalog` response.

| Type | Inputs | Outputs | Config keys |
|---|---|---|---|
| `trigger.manual` | none | `data: json` | `payload` (object) |
| `llm.prompt` | `input: any` | `text: text` | `provider` (enum), `model`, `systemPrompt`, `prompt`, `temperature` (0–2); required: provider, prompt |
| `http.request` | `input: any` | `body: json`, `status: number` | `method` (enum), `url`, `headers` (object), `body`; required: method, url |
| `logic.condition` | `input: any` (required) | `true: any`, `false: any` | `field`, `operator` (enum), `value`; required: operator |
| `agent.autonomous` | `input: text` (required), `tools: tool` (multiple) | `output: text`, `messages: messages` | `provider` (enum), `model`, `instructions`, `maxIterations` (1–50); required: provider |
| `output.result` | `input: any` (required) | none | `format` (enum text/json) |

Every definition is at `version: 1`. `defaults` supplies a value for every required key.

**`connections.ts`** exports `checkConnection(workflow, catalog, source, target)`, which returns `null` (allowed) or the **first failing rule**, in this order:

1. `unknown-node`: either node is missing from the workflow or its `type@typeVersion` is not in the catalog.
2. `unknown-port`: the source port is not an output of the source node, or the target port is not an input of the target node (this also catches wrong direction).
3. `self-loop`: same node on both ends.
4. `duplicate`: an identical source/target pair already exists.
5. `input-occupied`: the target input is not `multiple` and already has an incoming edge.
6. `type-mismatch`: data types are incompatible (see 1.3).
7. `cycle`: the target can already reach the source through existing edges (DFS reachability).

It also exports `CONNECTION_ERROR_MESSAGES` (human text per code).

**`validate.ts`** exports `validateWorkflow(doc, catalog)` and takes a document that has **already been through `migrate()`**. It runs three phases and collects up to 20 errors:

1. **Document shape:** `id`, `name`, `description` are strings; `metadata` is an object; `nodes` and `edges` are arrays.
2. **Nodes** (each): object with id, type, integer typeVersion, label, config object and finite `position.x/y`; unique id; the catalog contains `type@typeVersion`; config passes `validateConfig` against that definition's `configSchema` (unknown keys, missing required keys, wrong types, bad enum, out-of-range numbers are errors).
3. **Edges** (each, in array order): well-formed shape; unique id; then `checkConnection` against **the nodes plus only the edges accepted so far**. This reuses the exact editor rules, including cycle detection.

On success it returns a **canonical `Workflow`** with fixed key order and unknown extra keys dropped, which is what makes export, import, export byte-identical.

### 1.2 How the four files interact

```
types.ts ──defines shapes for──► nodes.ts (catalog data)
    │                                │
    │                                ▼
    ├──────────────► connections.ts  (reads Workflow + NodeDefinition[]; pure)
    │                      ▲   ▲   ▲
    │      canvas drag ────┘   │   └──── store.connect() (last gate)
    ▼                          │
validate.ts ── per edge ───────┘    (also uses configSchema.validateConfig per node)

Import pipeline (serialize.importWorkflow):
  text ─► size cap ─► JSON.parse ─► migrate() ─► validateWorkflow() ─► store.loadWorkflow()
Export:  store.workflow ─► serializeWorkflow() (canonical key order) ─► file
```

The key design property is **one rule set, three call sites**: live drag feedback in the canvas, the store's last-gate check, and every edge during import all call `checkConnection`. There is no second copy of the rules inside the TypeScript code base.

### 1.3 Contract facts requested by the review

**Document structure.** See 1.1. Credentials do not appear anywhere in it (D-016). `position` is the only UI data. `metadata` and `description` are preserved but have no UI.

**Node and edge types.** Nodes reference catalog entries by `type` + `typeVersion` (exact match required). Edges reference `nodeId` + `port` on both ends, with no edge type, label or condition.

**Input/output port definitions.** Ports are declared **per node type**, not per node instance. `required` is metadata only and is not enforced anywhere yet (D-017 will add warnings). `multiple` is meaningful only on inputs (a catalog test checks that no output sets it). Port names are unique across inputs and outputs of one node (catalog test enforces this; the type does not).

**Data type compatibility.** Rule: `compatible(out, in) = out == 'any' || in == 'any' || out == in`. It is symmetric, has no coercions and no subtype relations.

| From \ To | any | text | json | number | boolean | messages | tool |
|---|---|---|---|---|---|---|---|
| any | yes | yes | yes | yes | yes | yes | yes |
| text | yes | yes | no | no | no | no | no |
| json | yes | no | yes | no | no | no | no |
| number | yes | no | no | yes | no | no | no |
| boolean | yes | no | no | no | yes | no | no |
| messages | yes | no | no | no | no | yes | no |
| tool | yes | no | no | no | no | no | yes |

**Node configuration schema.** A hand-rolled JSON-Schema **subset**: flat object of properties; `string` (optionally `enum` or `format:'multiline'`), `number` (inclusive `minimum`/`maximum`), `boolean`, `object` (any plain JSON object, no nested schema). `required` means "key must be present", and defaults ensure it is. Checked by `validateConfig`; the config panel renders forms from the same schema.

**Versioning and migration.** Two independent version numbers: `schemaVersion` (document format, currently `"1.0"`) and `typeVersion` (per node type). `migrate()` upgrades documents through a keyed chain (`MIGRATIONS`) until `schemaVersion === SCHEMA_VERSION`; the registry is empty today because only 1.0 exists. A loop guard prevents a step that does not advance the version. **There is no equivalent mechanism for `typeVersion`** (see concern H3).

**Validation rules.** Exactly the three phases in 1.1, with the seven connection rules in the order given. Errors are human-readable strings with array indexes (`nodes[2] ("n_ab12"): ...`), not codes.

### 1.4 Limitations that could cause problems when implementing Pydantic models in Phase 2

Severity: **High** = decide before Phase 2 step 2 (models). **Medium** = decide during Phase 2. **Low** = note.

| # | Sev | Concern | Why it matters | Suggested handling |
|---|---|---|---|---|
| H1 | High | **`configSchema` is a hand-rolled subset, not something Pydantic generates.** Pydantic's `model_json_schema()` emits `$defs`/`$ref`, `anyOf` for Optional, `title`, `default`, `integer`; our subset has no `integer`, array, nested object, nullable, `default`, and `format:'multiline'` is a custom keyword. | D-004 says "Pydantic becomes the source of truth", but for node configs that cannot be taken literally without changing the catalog contract. | Keep `configSchema` as **catalog data** modelled by a Pydantic `ConfigSchema` that mirrors the subset, validated by a Python port of `validateConfig`. Typed per-node config models arrive with executors in Phase 3, with a test that they agree with `configSchema`. Needs an explicit architect decision. |
| H2 | High | **Validation rules exist only in TypeScript.** Generated types cover shapes, not rules (type compatibility, single-input, cycles, config checks). | The backend must re-implement them; two implementations will drift. | Shared **conformance fixtures** (valid and invalid workflows with expected error codes) run by both Vitest and pytest, plus structured error codes (see M5). |
| H3 | High | **No migration for `typeVersion`.** Lookup is exact (`type@typeVersion`); `migrate()` only upgrades `schemaVersion`. | The day a node type goes to version 2, old workflows fail with "unknown node type x@1" unless v1 definitions are kept forever. | Add an additive per-node migration registry before any node version bump. No change to the document format. |
| H4 | High | **Branching is not expressible.** Condition's `true`/`false` are ordinary `any` outputs. | D-006 requires conditional branching and skipped nodes; the engine has no way to know those ports are branch ports. | Additive marker on the port or definition (e.g. `PortDefinition.branch: true`) added while the Pydantic models are first written, which is cheaper than later. |
| H5 | High | **Postgres `jsonb` does not preserve key order**, while `serializeWorkflow` canonicalizes document, node and edge key order but leaves **`config` and `metadata` key order as stored**. | A save, load, export cycle through JSONB would reorder config keys and break the "byte-identical" guarantee for server-loaded workflows. | Either sort `config`/`metadata` keys in `serializeWorkflow` (byte change for existing exports is ordering only) or store the document as text/`json`. Decide in Phase 2 step 8. |
| M1 | Med | **Ids are client-generated strings** (`wf_xxxxxxxx`) and import keeps the file's `id`. | Importing the same file twice, or into another account, collides on the server. | Server assigns the workflow id on create and ignores or remaps the client id. Document the semantics. |
| M2 | Med | **No size limits in the contract**: arrays and strings are unbounded (only the importer's 5M-character cap exists). | An API accepting arbitrary documents is a DoS surface. | Pydantic constraints for max nodes, edges and string lengths. They appear in the JSON Schema and so in the generated TS types. Numbers to be chosen. |
| M3 | Med | **Number typing.** `typeVersion` is integer-checked at runtime but typed `number`; `maxIterations` is declared `number`, so `2.5` passes. | Pydantic `int` would reject what the frontend accepts. Python also prints `1.0` where JS prints `1`, which matters if the backend ever re-serializes. | Add `integer` to the config subset (additive) and use it for `maxIterations`. Never re-serialize on the backend for export. |
| M4 | Med | **`schemaVersion` is compared by exact string equality.** A future `"1.1"` document is rejected by a 1.0 reader. | There is no minor-version compatibility policy. | Define the rule (e.g. same major is readable) and model it as a pattern or `Literal`. |
| M5 | Med | **Validation errors are strings**, not `{code, path, message}` (only connection errors have internal codes). | An API error contract needs codes and paths, and fixtures (H2) need codes. | Refactor `validate.ts` to emit structured errors, keeping the message text. Contract-adjacent, so needs approval. |
| M6 | Med | **Ports are static per node type.** | Dynamic ports (Switch with N branches, MCP tool with variable I/O, Loop) cannot be expressed, and `configSchema` cannot carry a nested tool input schema. | Not a Phase 2 blocker; flag now so the Phase 2 models leave room (e.g. definitions that can be generated per instance in Phase 6). |
| M7 | Med | **Data types are labels without payload contracts.** `json`, `messages` and `tool` have no structure; `text` to `json` is rejected; `any` to `tool` is accepted (a Condition output can feed Agent `tools`). | Phase 3 needs runtime coercion and shape rules. | Decide payload shapes in Phase 3. Consider forbidding `any` to `tool`. |
| M8 | Med | **No credential-reference setting type**, and HTTP `headers` is free-form JSON. | D-016 forbids secrets in workflow JSON but nothing technically stops one being pasted into `headers`. | Add a `credentialRef` setting type (additive) and consider a warning for secret-looking header values. |
| M9 | Med | **`requiresApproval` is mentioned in ARCHITECTURE §6 and §11 but exists nowhere in `NodeDefinition` or `WorkflowNode`.** | The approval flow has no home in the contract. | Decide the location (catalog default plus node-level override) in Phase 2. |
| L1 | Low | `position` is required. | NL generation (Phase 5) must emit positions or an auto-layout step. | Consider making it optional or defaulted. |
| L2 | Low | Unknown extra keys are silently dropped on import and export. | Pydantic needs an `extra` policy (`ignore` matches today). | Choose and document. |
| L3 | Low | Empty strings are valid for `name`, `label` and ids; ids have no format. | Weak constraints. | Add minimal lengths and a charset in Pydantic. |
| L4 | Low | Edge validation is order-dependent and capped at 20 errors; a cycle is blamed on whichever edge closes it. | Backend parity depends on array order. | Fixtures assert on codes and edge ids, not on error counts. |
| L5 | Low | `NodeCategory` is a closed union of five. | New categories change the contract. | Acceptable; revisit with Phase 6. |
| L6 | Low | `provider` enum lacks `groq` (D-014). | Catalog and decision disagree. | Additive enum change as part of the D-013 outcome. |
| L7 | Low | Port `required` is unenforced. | D-017 addresses it with warnings. | Phase 1.1. |

**Overall assessment (engineer's view).** The structure is sound and suitable as the basis for Pydantic models. H1 to H5 should be decided before the Phase 2 models are written, because each is cheaper to resolve in the model definitions than afterwards. H3 and H4 are additive and need no change to the existing documents.

---

## 2. The Six Open Questions

Reproduced verbatim from `docs/PROJECT_BRAIN.md` §10 (as of commit `5c89203`), each with a proposed answer. **Status column: Settled** means the PO's 2026-11-03 message already decided it; **Proposed** means the answer is my recommendation and awaits PO confirmation.

### Q1. LLM providers
> Which are first-class in Phase 4 (e.g. OpenAI, Anthropic, Ollama for local)? Affects the node `provider` enum, `get_chat_model` and the test fakes.

**Status: Settled (D-014).** **Answer:** Groq, OpenAI, Anthropic and Ollama.
**Reasoning and consequences:**
- All four have maintained LangChain chat-model integrations, so they fit behind the provider-neutral adapter (D-015).
- Ollama (local) and Groq (hosted, fast) keep development and tests cheap; OpenAI and Anthropic cover the paid cases.
- The catalog enum must gain `groq` (additive); not changed during this review (L6).
- Model ids stay free text, not enumerated, so new models need no contract change.
- Ollama needs a base URL rather than a key; the other three need a credential reference (D-016).
- Test fakes: one fake chat model registered only in tests, so no test calls a real provider.

### Q2. Repo-based E2E tests
> Approve adding Playwright as a dev dependency now, or keep it deferred until after Phase 2?

**Status: Proposed.** **Answer:** approve now, implemented as a small "Phase 1.1" task **before** Phase 2 step 10 (frontend–backend integration).
**Reasoning:**
- The UI is stable and 52 browser checks already exist as an ad hoc script that nobody else can run.
- Phase 2 step 10 will need browser tests against a real backend, and it is cheaper to have the harness first.
- Cost is small (see §3) and it adds only a dev dependency.
- Note: GitHub Actions needs a GitHub remote; one now exists (see §3.4).

### Q3. Toolchain
> Accept TypeScript 7 / Vite 8 / oxlint, or switch to ESLint?

**Status: Settled (D-012).** **Answer:** keep TypeScript 7, Vite 8, Oxlint, Vitest 5; no ESLint.
**Reasoning:** everything passes on this toolchain today (`tsc`, lint, 48 tests, build). Revisit only if a needed tool lacks support, as a new decision.

### Q4. Phase 1 acceptance
> Does the PO / architect accept Phase 1 as complete? If so, Phase 2 needs its own plan and review before any backend work begins.

**Status: Proposed.** **Answer:** accept Phase 1 as **functionally complete and verified**, with two conditions tracked separately:
1. **D-013 final code review** of the four contract files. This **blocks Phase 2 step 2** (the Pydantic models) and nothing else.
2. A small **Phase 1.1** follow-up: add `groq` to the provider enum, the warnings of D-017/D-018, and Playwright (Q2). These do not block accepting Phase 1.

Phase 2 is **not** approved by this answer. `docs/PHASE2_PLAN.md` is a proposal for separate review.

### Q5. Auth
> Is multi-user auth a hard requirement before any deployment, or is single-user local mode acceptable until Phase 7?

**Status: Proposed.** **Answer:** single-user local mode is acceptable until Phase 7, **but design for multi-user now**, and never expose the service beyond localhost without auth.
**Reasoning:**
- Include `users` and an `owner_id` on every owned row from the first migration (already in ARCHITECTURE §10).
- Route every query through one `get_current_user()` dependency that returns a fixed local user, so real auth in Phase 7 replaces one function.
- Add no auth library and no login UI before Phase 7.
- Bind the dev server to `127.0.0.1` by default and document that exposing it publicly requires Phase 7.

### Q6. Editor-side validation UX
> Should the editor show non-blocking warnings (unconnected required inputs, empty required fields) before Phase 3, or wait for the engine's validator?

**Status: Settled in direction (D-017, D-018): yes, before Phase 3.** The PO also added "unused nodes". **Proposed definitions** (need PO confirmation before implementation):
- **Unconnected required input:** an input port with `required: true` that has no incoming edge. Today this applies to Condition `input`, Agent `input` (Task), and Output `input`.
- **Empty required field:** a key in `configSchema.required` whose value is an empty or whitespace-only string (e.g. LLM `prompt`, HTTP `url`). Numbers and enums cannot be empty.
- **Unused node:** a node with **no edges at all** when the graph has more than one node. A stricter definition (cannot reach an Output, or is not reachable from a Trigger) is a possible later refinement and needs a PO choice.

**Design:** a pure `lintWorkflow(workflow, catalog)` returns `{code, nodeId, message}` warnings, with its own type and separate from `validateWorkflow`'s errors (D-018). The UI shows a badge on the node, a count in the toolbar and the list in the config panel. Warnings never block export or import. New nodes will warn immediately (for example an empty prompt), which is intended. Scope: one logic file, one test file and small UI changes.

---

## 3. Playwright Proposal (not implemented)

### 3.1 Recommended package and configuration

- **Package:** `@playwright/test` as a `devDependency` in `frontend/` (latest at implementation time; `npm view` currently reports `1.64.1`). One new dependency; it requires PO approval because it is new tooling.
- **Browser:** Chromium only. Locally `npx playwright install chromium` (about 150 MB, one time); CI installs the same.
- **`frontend/playwright.config.ts`:**
  - `testDir: 'e2e'` and `testMatch: '**/*.e2e.ts'`. The `.e2e.ts` suffix avoids Vitest collecting the files (Vitest's default include matches `*.spec.ts`).
  - `webServer: { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI }`.
  - `use: { baseURL, viewport: 1400x900, trace: 'on-first-retry' }`, `retries: process.env.CI ? 1 : 0`, `reporter: process.env.CI ? [['github'], ['html']] : 'list'`.
- **TypeScript:** add `e2e/` to a small `tsconfig.e2e.json` (or `tsconfig.node.json`) so `tsc -b` type-checks the specs.
- **Scripts:** `"test:e2e": "playwright test"`.
- **Ignore:** `playwright-report/`, `test-results/` in `.gitignore`.

### 3.2 Which of the existing browser checks become automated tests

The ad hoc runs contain **44 checks (first script) plus 8 (follow-up) = 52 checks**. Proposal: automate **49 of the 52** (all 44 from the first script and 5 of the 8 follow-up checks), grouped into about 30 tests across 5 spec files. The 44 are numbered in the order they appear in the first script's output.

| Spec file | Checks automated | Notes |
|---|---|---|
| `library.e2e.ts` | 1 library lists 6; 2 search filters; 3 empty state | |
| `canvas-editing.e2e.ts` | 4 DnD creates 3 nodes; 5 drop lands at cursor; 6 catalog labels; 7 click adds; 8 Enter adds; 9 Delete; 10 Backspace; node drag persists position; drag keeps edges; edge delete; edge delete keeps nodes; node delete removes edges; 38 New clears | The drag-position and delete checks are the 5 added in the second pass of the first script |
| `connections.e2e.ts` | 11 valid; 12 second valid; 13 occupied rejected; 14 duplicate rejected; 15 type mismatch rejected; cycle rejected; handle feedback (assert the `valid` and `connectingto` classes, not exact RGB); release on valid target creates the edge | The cycle and handle checks come from the follow-up script |
| `config-panel.e2e.ts` | 16 empty-state prompt; 17 panel shows selected node; 18 label edit; 19 invalid number flagged; 20 error clears; 21 invalid JSON flagged; 22 valid JSON accepted; 27 invalid value not committed (via export) | |
| `import-export.e2e.ts` | 23 filename; 24 schemaVersion; 25 node/edge counts; 26 edited config; 28 payload; 29 no React Flow fields; 30 fresh load empty; 31 import restores graph; 32 restores name; 33 byte-identical re-export; 34 malformed JSON; 35 graph untouched; 36 unknown type; 37 still untouched | |
| shared fixture | 39 no console or page errors | Applied automatically to every test through a fixture |

**Deliberately not automated (3):** pan, wheel zoom (React Flow's own behaviour; not our code) and the exact dark-mode background value (brittle). One dark-scheme smoke test (`colorScheme: 'dark'`, page renders without errors) is optional.

### 3.3 How the tests run

- **Locally:** `npm run test:e2e` (starts the dev server itself, or reuses a running one). Also `npx playwright test --ui` for debugging. `npm test` (Vitest) is unaffected.
- **GitHub Actions** (new file `.github/workflows/frontend.yml`), on push and pull request to `main`, `ubuntu-latest`:
  1. `actions/checkout`
  2. `actions/setup-node` (Node 24, npm cache)
  3. `npm ci`
  4. `npx tsc -b`, `npm run lint`, `npm test`, `npm run build`
  5. `npx playwright install --with-deps chromium`
  6. `npm run test:e2e`
  7. `actions/upload-artifact` of `playwright-report/` on failure

  Pin the current major version of each action at implementation time.

### 3.4 Estimated scope and files affected

Rough estimate (engineering judgment, not measured): about 300 to 400 lines of test code plus config, roughly half a day, mostly in selector helpers (connect via handles, drop via drag).

| File | Change |
|---|---|
| `frontend/package.json`, `package-lock.json` | `@playwright/test` devDependency, `test:e2e` script |
| `frontend/playwright.config.ts` | new |
| `frontend/e2e/{fixtures.ts, helpers.ts, library, canvas-editing, connections, config-panel, import-export}.e2e.ts` | new |
| `frontend/tsconfig.e2e.json` (or edit of `tsconfig.node.json`) | new or small edit |
| `.gitignore` | two lines |
| `.github/workflows/frontend.yml` | new |
| `docs/*` | brain, log, roadmap, decision entry |

No application code changes. If selectors prove brittle, adding `data-testid` attributes to a few components would be a small, separate change.

**Prerequisite (resolved after this section was written):** a GitHub remote now exists (`origin` = `https://github.com/shailovesingh/AgentForge.git`), so the workflow can run on the first push. **Risk:** Browser tests that drag and connect can be timing-sensitive; the first ad hoc script passed on three consecutive runs after its fixes and the second passed once in full, which is too small a sample to call stable, and CI runners are slower. Hence `retries: 1` and traces on retry.

---

## 4. Decisions on this review (Product Owner, 2026-11-03, Session 4)

| Item | Decision | Recorded as |
|---|---|---|
| Q1 providers | Approved: Groq, OpenAI, Anthropic, Ollama | D-014 |
| Q2 Playwright | Approved as a Phase 1.1 task | D-019 |
| Q3 toolchain | Keep TypeScript 7, Vite 8, Oxlint, Vitest 5 | D-012 |
| Q4 acceptance | Phase 1 accepted as functionally complete, subject to Phase 1.1 follow-ups | D-020 |
| Q5 auth | Single-user local mode; keep a `get_current_user()` boundary; never expose beyond localhost without proper authentication | D-021 |
| Q6 warnings | Approved, with rules aware of node categories and port direction | D-017 (amended) |
| H1 | Review the custom `configSchema`; propose a migration to standard JSON Schema; keep UI hints separate | D-022; design in `PHASE1_1_PLAN.md` §3.1 |
| H2 | Approved: shared JSON fixtures for Vitest and pytest | D-022; `PHASE1_1_PLAN.md` §3.2 |
| H3 | Design a versioned node migration mechanism; never overwrite old workflows silently | D-022; `PHASE1_1_PLAN.md` §3.3 |
| H4 | Define condition output, branch and skip semantics, compatible with v1 | D-022; `PHASE1_1_PLAN.md` §3.4 |
| H5 | Deterministic serialization, recursively sorted keys, across TypeScript, Python and JSONB | D-022; `PHASE1_1_PLAN.md` §3.5 |
| Extras | HTTP header credential exposure, credentials outside JSON, extensible providers, non-blocking warnings, Playwright | D-023, D-024, D-016; `PHASE1_1_PLAN.md` §3.6 to §3.9 |

**Still pending:** D-013 (final code review of the contract, which this plan now proposes to change in the catalog layer), final approval of the Phase 1.1 designs (D-022 to D-024), and Phase 2 approval.

**What these decisions change in §1.4:** concerns H1 to H5 are now **assigned to Phase 1.1** with designs (not to Phase 2). M3 (integer typing), M5 (structured errors), M8 (credential exposure) and L6 (groq) are absorbed by the same plan. M1, M2, M4, M6, M7 and M9 remain Phase 2 or later.
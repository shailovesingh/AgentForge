# AgentForge Learning Roadmap

> **AgentForge is also a hands-on AI Engineering learning project (D-028, permanent).**
> The Product Owner wants to understand the architecture, implementation, internal data flow, technology choices and engineering decisions well enough to **explain the project independently in technical interviews and engineering discussions.**
>
> **This file is the curriculum**: 12 modules aligned with the development roadmap, with learning status and interview questions.
> **`docs/LEARNING_GUIDE.md` is the record**: lessons actually taught and the Product Owner's demonstrated understanding.
> **Learning progress is tracked separately from implementation progress.** A module can be fully built and still be "Not Started" here, and the reverse.

## How status works

| Status | Meaning |
|---|---|
| **Not Started** | No lesson has been taught for this module yet |
| **In Progress** | At least one lesson has been taught; understanding not yet demonstrated |
| **Understood** | The Product Owner has answered check questions or explained the concept back, and the answers showed real understanding. **The evidence is recorded in `LEARNING_GUIDE.md`.** |
| **Needs Revision** | Answers showed gaps; the topic is scheduled for re-teaching |

**Rules.** (1) A module is never marked Understood because something was *explained*; only because the Product Owner's answers *demonstrated* it. (2) Only the Principal Architect changes a status, and only after evaluating the Product Owner's submitted answers. (3) Teaching follows `.claude/agents/tutor.md`: simple language first, then terminology, with examples from AgentForge. (4) **Evaluation protocol (D-029):** each lesson ends with a Knowledge Check / Interview Questions section; the Product Owner answers all questions, plus the per-module questions below, in one dedicated learning session at the end of the project. Until then every status stays at most In Progress and the focus is building.

## Overview

"Available" says when AgentForge contains the thing being taught. Modules whose code does not exist yet are still listed so the roadmap is complete; they are taught when the code lands, so lessons always describe real code.

| # | Module | Built in AgentForge | Learning status | Lessons taught |
|---|---|---|---|---|
| 1 | System Architecture | Partly (frontend, contracts, docs) | **In Progress** | L6 touches the settings contract as a JSON Schema subset a Python backend must match (Phase 1.1 T5a); L3 touches contract-first design (Phase 1.1 T3: shared fixtures); L4 touches the policy limits as part of the contract and round-trip integrity; L5 touches one contract across languages and storage (canonical text, PostgreSQL JSONB); L2 touches stable codes as a contract; primer available |
| 2 | Frontend and React Flow | Yes (Phase 1) | **In Progress** | L7 touches the settings panel generated from a node's schema (Phase 1.1 T5b); the canvas, React Flow, drag and drop are not taught yet (primer available) |
| 3 | Workflow JSON and State Management | Yes (Phase 1); being hardened in Phase 1.1 | **In Progress** | L2 (Phase 1.1 T2: structured validation errors); L3 (Phase 1.1 T3: shared fixtures and their rules); L4 (Phase 1.1 T4a: strict JSON parsing and the policy limits); L5 (Phase 1.1 T4b: canonical compact JSON, pretty export JSON and the export guard); L6 (Phase 1.1 T5a: the JSON Schema subset validator, explicit defaults, schema fixtures); L7 (Phase 1.1 T5b: the catalog, importer decision C1 and settings panel on the schema subset, incomplete drafts) |
| 4 | Backend and FastAPI | No (Phase 2) | Not Started | none |
| 5 | Workflow Execution Engine | No (Phase 3) | Not Started | none |
| 6 | Graph Theory and DAG Execution | Partly (cycle rule, Phase 1) | Not Started | none |
| 7 | Node Registry and Data Propagation | Partly (catalog, port types) | **In Progress** | L7 (Phase 1.1 T5b: the catalog converted to the JSON Schema subset as the single source of truth for node settings, `PROVIDERS`, schema defaults applied at node creation, the `ui` block); L6 touches the catalog's configuration contract (Phase 1.1 T5a: the validator and explicit defaults) |
| 8 | LLM Integration | No (Phase 4) | Not Started | none |
| 9 | LangGraph and Autonomous Agents | No (Phase 4) | Not Started | none |
| 10 | MCP Integration | No (Phase 6) | Not Started | none |
| 11 | Natural-Language Workflow Generation | No (Phase 5) | Not Started | none |
| 12 | Security, Testing and Deployment | Partly (tests, CI) | **In Progress** | L1 (Phase 1.1 T1: testing and CI); L2 touches table-driven and guard tests; L3 (Phase 1.1 T3: data-driven tests, coverage guards, mutation checks); L4 (Phase 1.1 T4a: trust boundaries, boundary-value and differential tests, equivalent mutants, bounded error messages); L5 (Phase 1.1 T4b: golden files, property tests against an independent reference, mutation testing of a writer); L6 (Phase 1.1 T5a: total functions on untrusted input, a reference implementation, a soundness corollary, fixtures as the cross-language contract); L7 (Phase 1.1 T5b: differential testing between old and new code, golden values from the brief, source-text guards, mutation-found weak tests, a UI bug that only a behaviour change made reachable) |

**Suggested order.** Modules 1, 2 and 3 now (they describe code that exists). Module 12's testing part alongside. Module 6 once the connection rules are understood. Modules 4, 5 and 7 as Phases 2 and 3 are built; then 8 to 11.

---

## Module 1: System Architecture

- **Status:** **In Progress** (Lessons L2, L3, L4 and L5 touch contract-first design; no answers recorded yet)
- **Lessons taught:** L6 (Phase 1.1 T5a): the node settings contract as a documented subset of JSON Schema that TypeScript implements now and a Python backend (Pydantic, planned for Phase 2) must match, with the Pydantic-driven non-goals (`$ref`, `anyOf`) and regex-dialect non-goal (`pattern`) and the honest limit that no Python parity is claimed. L5 (Phase 1.1 T4b): one contract that three systems must honour (TypeScript, a planned Python backend, PostgreSQL JSONB, which does not keep key order, so the database is never the canonical form: canonicalize on read), the verified TypeScript versus Python differences (key order, UTF-16 versus code point order, number text) as the checklist for Phase 2, rule sources stated honestly (RFC 8785, I-JSON, AgentForge policy, PostgreSQL compatibility), and the honest limit that only TypeScript implements and tests the two profiles today (Python runner and hashing planned, Phase 2; no parity claimed). L4 (Phase 1.1 T4a): the import limits (numbers, depth, size, encoding, text rules) as part of the contract with each rule's source stated (RFC, I-JSON, AgentForge policy, PostgreSQL compatibility), round-trip integrity (what the editor can export it must be able to import), and the honest limit that only TypeScript implements and tests them today (Python planned for Phase 2, no parity claimed). L3 (Phase 1.1 T3): a shared contract between two implementations, language-neutral fixtures as the executable form of the contract, and the honest limit that Python parity is planned for Phase 2 and not claimed. L2 (Phase 1.1 T2): stable error codes as a contract. The primer in `docs/LEARNING_GUIDE.md` Part 1 still covers the rest of the module as reference only.
- **Concepts to learn:** client and server; separation of concerns; contract-first design (a shared data format that everyone agrees on); monorepo; layered architecture; where state lives; architecture decision records (ADRs); API versus internal boundaries; versioning for backward compatibility.
- **Why it is needed:** AgentForge has an editor, a server, an engine, AI components and a database. Without clear boundaries and one shared contract they would tangle. This is the module that lets you explain *why the system is shaped this way*.
- **Where it appears:** the browser editor never runs workflows; the Workflow JSON document is the contract between editor, backend, engine and AI; the engine is kept independent of LangGraph; every significant choice is recorded in `docs/DECISIONS.md`; the top-level `contracts/` folder holds language-neutral fixtures that the TypeScript runner executes today and a future Python runner will execute too (planned, Phase 2); `contracts/CANONICAL_JSON.md` specifies the two deterministic text profiles that the backend and the database must match (L5).
- **Related files:** `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (D-002, D-003, D-004, D-006), `.claude/rules/architecture.md`, the top-level folder layout (`frontend/`, `docs/`, `contracts/`, planned `backend/`), `contracts/README.md` (including the parsing and policy rules), `contracts/CANONICAL_JSON.md` (L5), `contracts/fixtures/` (including `serialization/`, L5), `frontend/src/contracts/fixtures.test.ts`, `frontend/src/workflow/valuePolicy.ts`, `frontend/src/workflow/canonicalJson.ts` (L5), `docs/PHASE1_1_PLAN.md` sections 3.2 and 3.5, `docs/DECISIONS.md` D-026 and D-031.
- **Interview questions:**
  1. Why is the workflow stored as a JSON document instead of in the format of the drawing library?
  2. Why keep the execution engine separate from the AI agent framework?
  3. What does "contract-first" mean, and where is the contract in AgentForge?
  4. What goes wrong if the frontend and backend each define their own copy of the workflow format?
  5. What is an architecture decision record, and why did we write decisions down before coding them?

## Module 2: Frontend and React Flow

- **Status:** **In Progress** (Lesson L7 touches only the settings panel generated from a schema; the rest of the module is not taught yet; no answers recorded yet)
- **Lessons taught:** L7 (Phase 1.1 T5b, commits `7b09662` and `44bd7f4`): a form generated from a schema instead of one hand-written form per node (`ConfigPanel.tsx`: the control is chosen from the schema type, a separate `ui` block holds presentation hints, only `widget: 'textarea'` is honoured and the other widget values are reserved), the draft-then-commit pattern (`parseConfigInput` validates typed text and the store is updated only when it is valid), `propertyOrder.ts` as a React-free helper, and a controlled select that must not display a value the data does not hold (the disabled `(not set)` option). The primer in `docs/LEARNING_GUIDE.md` Part 1 still covers the rest of the module as reference only.
- **Concepts to learn:** React components and state; controlled components; hooks; what React Flow is (nodes, edges, handles, viewport); custom node components; HTML5 drag and drop; screen versus canvas coordinates; mapping our data to a library's data; CSS Modules; keyboard accessibility.
- **Why it is needed:** the editor is the product's face. Understanding how a canvas library is driven from your own state (instead of owning it) is the core frontend skill in AgentForge.
- **Where it appears:** one generic node component draws all node types from the catalog; the canvas is *controlled* (it renders what the store says); one file translates between our workflow and React Flow's objects.
- **Related files:** `frontend/src/canvas/Canvas.tsx`, `frontend/src/canvas/flowMapping.ts`, `frontend/src/nodes/WorkflowNode.tsx`, `frontend/src/library/Library.tsx`, `frontend/src/config-panel/ConfigPanel.tsx` (L7: generated from schema and `ui`), `frontend/src/config-panel/propertyOrder.ts` and `propertyOrder.test.ts` (L7), `frontend/e2e/config-panel.e2e.ts` (L7), `frontend/src/app/Toolbar.tsx`.
- **Interview questions:**
  1. What does it mean that the React Flow canvas is "controlled"? What would break if it were not?
  2. How does a node dropped from the library end up on the canvas at the cursor?
  3. Why is there one `WorkflowNode` component instead of one per node type?
  4. Why does `flowMapping.ts` exist at all?
  5. How would you make dragging from the library usable without a mouse?

## Module 3: Workflow JSON and State Management

- **Status:** **In Progress** (Lessons L2, L3, L4, L5, L6 and L7 taught: structured validation errors, the shared fixtures, strict parsing with the policy limits, canonical and export JSON, the JSON Schema subset validator, and the importer's incomplete-draft behaviour; no answers recorded yet)
- **Lessons taught:** L7 (Phase 1.1 T5b, commits `7b09662` and `44bd7f4`): the validator of L6 becomes the importer's config check; decision C1 (D-025) in code: `validateAgainstSchema(..., { checkRequired: false })`, so an incomplete draft (a node missing a required setting) imports while wrong types, bad enum values, out-of-range numbers and unknown settings still reject; why the importer never applies defaults (`raw.config` is kept as read) and `addNode` is the one production caller of `applyDefaults`; a table of who applies defaults and who checks `required` at creation, import, editing and (planned) execution; `schema.required` unreachable from import and exempted in the test-only `codeExemptions.ts`; the mandatory `checkRequired` field in config fixtures; the message versus path split (JSON Pointer escapes undone in the message only); the `required-field-empty` warning is planned (T7) and not built. TypeScript only; no Python parity claimed; T6 (node migrations) is not covered. L6 (Phase 1.1 T5a, commits `96cc80d` and `a009b20`): the home-made `configSchema` and its limits; the documented subset of JSON Schema draft 2020-12 and its deliberate non-goals (`$ref`, `anyOf`, `pattern` and others, with the Pydantic and regex-dialect reasons); `validateAgainstSchema` (type first with an early return, enum, per-type keywords, recursion, `{code, path}` errors, own-property lookups); the mandatory `checkRequired` option and decision C1 (drafts import, execution requires; the importer wiring is planned for T5b); explicit `applyDefaults` (no recursion, deep copy, never called by a validator); `checkSchemaSubset` as a total function with one uniform default rule; code-point string length, safe integers and enum equality as rules two languages must agree on; the four new `schema.*` codes and the temporary `SCHEMA_ONLY_CODES` list; the three fixture kinds (148 files); the review findings (a checker that could crash on malformed input, `true` versus `1`, fixture gaps found by mutation testing). TypeScript only; nothing uses the validator yet (T5b wires it in); no Python parity claimed. L5 (Phase 1.1 T4b): canonical form and deterministic serialization, the two profiles (`canonical-json/1` compact for hashing, `export-json/1` pretty for files and never hashed; no hashing code exists yet), why integer-like keys defeat `JSON.stringify` (even with a sorting replacer) and so the text is written directly, UTF-16 code unit key order, number text by `String(n)`, string escapes, no Unicode normalization, writers that refuse non-JSON data, idempotence and round trip, the export guard `exportWorkflowText` (projects to the known fields, then the policy and 5,000,000-byte check before a file is written; never throws, and returns the export-only code `value.not-json-data` for a value that is not JSON data), typed JSON in settings now parsed strictly, a distinct internal-parser-error message, the one-time change in exported byte order, and a review finding that a refactor had dropped two implicit protections (fixed in commit `d2ef493`, mutation-checked by the implementer). L4 (Phase 1.1 T4a): why the built-in `JSON.parse` is not enough for an untrusted file (last duplicate key wins, big integers rounded, lenient decoding of invalid bytes), our strict RFC 8259 parser (`strictParse`, `classifyNumber`), the policy limits and where each comes from, deciding a number's range from its token text, size counted in UTF-8 bytes, depth counted as containers open, the byte order mark and strict UTF-8, safe object construction (a key named `__proto__`), values typed in the editor obeying the same policy, rejecting rather than repairing, and bounded error messages. L2 (Phase 1.1 T2): machine-readable versus human-readable errors, stable namespaced error codes, JSON Pointer, string-literal union types, validating untrusted input at the boundary, table-driven and guard tests. L3 (Phase 1.1 T3): shared language-neutral fixtures, `{code, path}` compared as multisets and never the message, rule order in `checkConnection` as part of the contract, the import semantics a second implementation must follow (cascades, stop-early, the 20-error cap), `inputRepeat`, and the prototype-named-key fixtures. The primer in `docs/LEARNING_GUIDE.md` Part 1 still covers the rest of the module as reference only.
- **Concepts to learn:** JSON documents and schemas; JSON Schema basics; `schemaVersion` versus `typeVersion`; immutable state updates; a store (Zustand) and selectors; validation versus warnings; serialization; import as untrusted input; migrations; canonical (repeatable) JSON; shared test fixtures.
- **Why it is needed:** the workflow document is the heart of the system. Everything else reads or writes it, so getting its shape, versioning and validation right is the most valuable thing to understand.
- **Where it appears:** the store holds the document being edited; export writes it; import reads the file as bytes, checks size and encoding, parses it with the strict parser (`strictJson.ts`, L4), upgrades, validates and loads it, and a rejected file produces a list of `{code, path, message}` errors shown in the toolbar panel (L2); export checks the whole workflow against the same limits (`exportWorkflowText`) and writes it with `canonicalJson.ts` (L5), or refuses with "Export failed. No file was created."; the catalog describes node types; config schemas describe settings with the JSON Schema subset (L6, L7): the importer checks each node's config against the catalog schema with `checkRequired: false` (an incomplete draft imports, decision C1), `addNode` applies the schema defaults, and the settings panel is generated from the schema (T5b, done).
- **Related files:** `frontend/src/workflow/types.ts` (`NodeDefinition`, `NodeUi`: L7), `validate.ts` (L7: the config check with `checkRequired: false`), `serialize.ts` (`importWorkflow`, `MAX_IMPORT_BYTES`), `migrate.ts`, `configSchema.ts` (`parseConfigInput`, now on the subset validator: L7), `codeExemptions.ts` (L7: test-only exemption lists), `jsonSchema.ts` and `jsonSchema.test.ts` (L6: the subset validator, `applyDefaults`, `checkSchemaSubset`; used by production code since T5b), `connections.ts`, `errors.ts` (error codes, `ValidationError`, `jsonPointer`) and `errors.test.ts`, `strictJson.ts` and `strictJson.test.ts` (L4), `valuePolicy.ts` and `valuePolicy.test.ts` (L4), `canonicalJson.ts` and `canonicalJson.test.ts` (L5), `serialize.test.ts` (L5: round trip, the export guard, projection to known fields and the non-JSON-data cases); `serialize.ts` (L5: `projectWorkflow`, `serializeWorkflow` throws, `exportWorkflowText` never throws); `frontend/src/app/Toolbar.tsx` (import error panel, file size check) and `frontend/src/app/shorten.ts`; `frontend/e2e/import-export.e2e.ts`; `frontend/src/store/editorStore.ts` (L7: `addNode` calls `applyDefaults`); `frontend/src/catalog/nodes.ts`; `contracts/README.md`, `contracts/CANONICAL_JSON.md` (L5), `contracts/CONFIG_SCHEMA.md` (L6, L7) and `contracts/fixtures/` (shared fixtures, L3; the `serialization/` family, L5; the `schema/` family, L6; the `config/` family and the workflow fixtures for incomplete drafts, L7); `frontend/src/contracts/fixtures.test.ts` (the runner); `docs/PHASE1_1_PLAN.md` section 3.2; `docs/DECISIONS.md` D-018, D-022. Planned in Phase 1.1: `nodeMigrations.ts`, `lint.ts`, and more fixture families under `contracts/fixtures/` (T6 onward).
- **Interview questions:**
  1. Why are `schemaVersion` and `typeVersion` two separate numbers?
  2. What is the difference between a validation error and a warning in AgentForge, and why keep them apart?
  3. Why must an imported file be treated as untrusted input?
  4. Why do we want the same workflow to always export to byte-identical text?
  5. Why does the store hold a `Workflow` document instead of React Flow's nodes and edges?

## Module 4: Backend and FastAPI

- **Status:** Not Started *(taught when Phase 2 is built)*
- **Concepts to learn:** HTTP and REST; FastAPI routes; Pydantic models and validation; async I/O; dependency injection (`get_current_user`); settings from environment variables; PostgreSQL and JSONB; SQLAlchemy and Alembic migrations; Docker Compose; optimistic concurrency; owner-scoped data.
- **Why it is needed:** the backend owns persistence, validation, execution, AI calls and secrets. The browser is not trusted with any of those.
- **Where it appears:** planned Phase 2: workflow CRUD, versioned snapshots, `GET /api/catalog`.
- **Related files (planned):** `backend/app/main.py`, `backend/app/api/`, `backend/app/workflow/models.py`, `backend/app/db/`, `docker-compose.yml`. See `docs/PHASE2_PLAN.md`.
- **Interview questions:**
  1. Why use Pydantic models at the API boundary?
  2. What is an immutable version snapshot, and why store workflows that way?
  3. How does optimistic concurrency prevent two editors overwriting each other?
  4. Why scope every query by `owner_id` even in single-user mode?
  5. Why can the database not be the canonical form of the JSON (hint: JSONB key order)?

## Module 5: Workflow Execution Engine

- **Status:** Not Started *(taught when Phase 3 is built)*
- **Concepts to learn:** the run lifecycle; an executor interface; run context; node-run records; statuses (succeeded, failed, skipped); timeouts and limits; streaming progress (SSE); background execution; human approval pauses.
- **Why it is needed:** this is what turns a drawing into behaviour.
- **Where it appears:** planned Phase 3. The rules for edges, skipping and branching are already specified in `docs/PHASE1_1_PLAN.md` section 3.4.
- **Related files (planned):** `backend/app/engine/`, `backend/app/catalog/`.
- **Interview questions:**
  1. Walk through what happens from "Run" to the final result.
  2. How does the engine decide a node is ready to run?
  3. What happens to downstream nodes when a node fails?
  4. Why does every run record the exact workflow version it executed?
  5. How do you stop a runaway workflow?

## Module 6: Graph Theory and DAG Execution

- **Status:** Not Started
- **Concepts to learn:** graphs, nodes and edges; directed and acyclic; reachability; cycle detection; topological order; dependency-based scheduling; concurrency from independent branches; branching and skipped nodes.
- **Why it is needed:** a workflow is a graph. These ideas decide what can connect, what runs first and what can run in parallel.
- **Where it appears:** the connection rules reject cycles using a reachability search (built); the engine's scheduling rules are specified (planned build in Phase 3).
- **Related files:** `frontend/src/workflow/connections.ts` (`isReachable`, the `cycle` rule), `frontend/src/workflow/connections.test.ts`, `docs/PHASE1_1_PLAN.md` section 3.4, `docs/DECISIONS.md` D-006.
- **Interview questions:**
  1. What is a DAG and why must a workflow be one?
  2. How does AgentForge decide that adding an edge would create a cycle?
  3. How can two nodes run at the same time safely?
  4. If a Condition takes its `true` branch, what happens to the nodes on the `false` branch?
  5. Where do loops live in AgentForge, if not in the graph?

## Module 7: Node Registry and Data Propagation

- **Status:** **In Progress** (Lessons L6 and L7 touch the catalog's configuration contract; the executor registry and data propagation are not taught yet; no answers recorded yet)
- **Lessons taught:** L7 (Phase 1.1 T5b, commits `7b09662` and `44bd7f4`): the catalog as the single source of truth for a node's settings: each `NodeDefinition` carries `configSchema: ObjectSchema` (with `additionalProperties: false`, explicit `default`s and `required`) and an optional `ui` block, three consumers read it (creation through `applyDefaults`, import through `validateAgainstSchema` with `checkRequired: false`, the settings panel), `PROVIDERS` as the one list that both AI nodes derive their enum from (with `groq` appended last), why `required` and `default` are different questions, and the removal of `NodeDefinition.defaults`, `ConfigProperty` and `format: 'multiline'`. The catalog lookups (`getNodeDefinition`, `getLatestNodeDefinition`) and who uses which. T6 (node migrations and `agent.autonomous` version 2) is not covered. L6 (Phase 1.1 T5a): how a node's settings are described and checked: the JSON Schema subset as the config contract of every catalog node, `default` as the planned single source of initial values in place of `NodeDefinition.defaults` (T5b does the replacement; the six node definitions in `frontend/src/catalog/nodes.ts` are not converted yet), explicit `applyDefaults` at node creation, `checkRequired` for drafts versus execution, and `checkSchemaSubset` as the gate a catalog schema must pass when it is loaded. The primer in `docs/LEARNING_GUIDE.md` Part 1 still covers the rest of the module as reference only.
- **Concepts to learn:** the registry pattern; an executor interface (protocol); ports as typed contracts; data type compatibility; how a value travels along an edge; inputs that accept several edges; catalog versus registry consistency; per-node versioning and migration.
- **Why it is needed:** this is how new node types are added without touching the engine, and how data safely flows between them.
- **Where it appears:** the catalog and port compatibility rules exist now; the executor registry arrives in Phase 3. Each node's `configSchema` is its settings contract, written in the JSON Schema subset (L6) and used by node creation, the importer and the settings panel (L7, T5b done); the `ui` block carries presentation hints only.
- **Related files:** `frontend/src/workflow/jsonSchema.ts` (L6), `contracts/CONFIG_SCHEMA.md` (L6, L7), `frontend/src/catalog/nodes.ts` (L7: `PROVIDERS`, the six converted definitions), `frontend/src/catalog/catalog.test.ts` (L7), `frontend/src/catalog/index.ts`, `frontend/src/workflow/types.ts` (`NodeDefinition`, `NodeUi`), `frontend/src/workflow/types.ts` (`PortDefinition`, `DataType`), `frontend/src/workflow/connections.ts`; planned `backend/app/catalog/` and `nodeMigrations.ts`.
- **Interview questions:**
  1. How would you add a new node type to AgentForge? What files change?
  2. What does the `multiple` flag on a port change?
  3. Why is `text` not allowed to connect to `json`?
  4. What should happen when an old workflow uses version 1 of a node that is now at version 2?
  5. Why should the catalog and the executor registry always agree?

## Module 8: LLM Integration

- **Status:** Not Started *(taught when Phase 4 is built)*
- **Concepts to learn:** chat models; prompts and system prompts; temperature; structured output; providers (Ollama, OpenAI, Anthropic, Groq) and the adapter pattern; tokens and cost; timeouts and retries; testing with fake models; credentials.
- **Why it is needed:** the LLM node and the Agent are the "intelligence" of AgentForge.
- **Where it appears:** the `llm.prompt` node definition exists (settings only); the runtime is planned for Phase 4.
- **Related files:** `frontend/src/catalog/nodes.ts` (`llm.prompt`), `docs/DECISIONS.md` D-014, D-015, D-024; planned `backend/app/integrations/llm.py`.
- **Interview questions:**
  1. Why a provider-neutral adapter instead of calling each provider's SDK in the node?
  2. What does temperature do, and when would you set it to 0?
  3. How do you test LLM-dependent code without calling a real model?
  4. Why must API keys never reach the model or the workflow file?
  5. What is structured output and why does natural-language generation need it?

## Module 9: LangGraph and Autonomous Agents

- **Status:** Not Started *(taught when Phase 4 is built)*
- **Concepts to learn:** the agent loop (reason, act, observe); tools; state graphs; checkpointers and memory; recursion and tool-call limits; why agents are non-deterministic; why the agent is isolated inside one node.
- **Why it is needed:** agents are the most powerful and least predictable part of the platform.
- **Where it appears:** the `agent.autonomous` node definition exists; the LangGraph runtime is planned for Phase 4.
- **Related files:** `frontend/src/catalog/nodes.ts` (`agent.autonomous`), `docs/ARCHITECTURE.md` section 7, `docs/DECISIONS.md` D-006; planned `backend/app/agents/`.
- **Interview questions:**
  1. What is an agent loop? How is it different from a normal workflow?
  2. Why is LangGraph used only inside the Agent node?
  3. What stops an agent from looping forever or spending unlimited money?
  4. How does an agent get its tools?
  5. What is a checkpointer and what does it give you?

## Module 10: MCP Integration

- **Status:** Not Started *(taught when Phase 6 is built)*
- **Concepts to learn:** the Model Context Protocol; clients and servers; tool discovery; transports (remote HTTP versus local stdio); trust and security of tool servers; exposing tools as nodes and as agent tools.
- **Why it is needed:** MCP is how AgentForge reaches the outside world without custom code per tool.
- **Where it appears:** planned Phase 6; decision D-010 restricts the first version to remote servers.
- **Related files:** `docs/ARCHITECTURE.md` section 9, `docs/DECISIONS.md` D-010; planned `backend/app/integrations/mcp/`.
- **Interview questions:**
  1. What problem does MCP solve?
  2. Why did we exclude local (stdio) MCP servers at first?
  3. How are MCP tools discovered at run time?
  4. Why is a tool's output treated as untrusted data?
  5. How could an MCP tool be abused for SSRF, and how do we prevent that?

## Module 11: Natural-Language Workflow Generation

- **Status:** Not Started *(taught when Phase 5 is built)*
- **Concepts to learn:** structured generation of data (not code); prompting with the catalog; the validate-and-repair loop; patch operations versus regeneration; preview and accept; prompt injection; evaluating generation quality.
- **Why it is needed:** this is the feature that makes AgentForge feel like magic, and the one most likely to go wrong if the output is not strictly validated.
- **Where it appears:** planned Phase 5; decisions D-007 (patch-based edits) and architecture rule 8 (never executable code).
- **Related files:** `docs/ARCHITECTURE.md` section 8, `docs/DECISIONS.md` D-007; planned `backend/app/generation/`.
- **Interview questions:**
  1. Why must the model produce workflow data and never code?
  2. What is the validate-and-repair loop?
  3. Why are edits expressed as patch operations instead of a new workflow?
  4. How is a user's request treated as untrusted input?
  5. How would you measure whether generation is getting better?

## Module 12: Security, Testing and Deployment

- **Status:** **In Progress** (Lesson L1 taught: testing and CI; Lessons L2 to L7 also touch table-driven tests, guard tests, fixtures, trust boundaries, golden files, property tests, reference implementations, differential testing and mutation testing; no answers recorded yet)
- **Lessons taught:** L7 (Phase 1.1 T5b): differential testing when replacing a component (the reviewer's 60,000-document comparison of old and new code found only the two intended differences and one accidental message change, a report), a UI bug made reachable by an approved behaviour change and caught in review (the "(not set)" select) with an e2e test that checks the export, golden values copied from the brief instead of computed from the code, source-text guards (`applyDefaults` has one production caller; the exemption file is imported by tests only, with a regex self-test), an identity assertion that makes a copied list fail, and mutation-found weak tests (the provider list copy, the textarea `rows`; reports). L6 (Phase 1.1 T5a): a seeded property test against an independent reference (2000 pairs, both `checkRequired` values), a totality test (3000 random and corrupted schemas never throw) with a soundness corollary (a clean schema never makes the validator throw), a rule two languages must agree on written down and fixture-tested (enum equality, code-point length, safe integers), a pinned one-line helper (`enumEquals`) because a loose comparison could not be seen through `validate`, a temporary named exemption list (`SCHEMA_ONLY_CODES`) and a no-production-import guard, the three fixture kinds, the reviewer's independent validator (120,000 cases, reviewer's report) and fixture gaps found by mutation testing (report). L5 (Phase 1.1 T4b): golden files with hand-written expectations (109 serialization cases), property-based testing with a seeded generator against an independent reference writer (and the limit that the reference shares `String(n)` with the code), a guard on the generator itself, round-trip tests over every valid workflow fixture (and, since `d2ef493`, the `ser-workflow-*` fixtures imported as whole workflows), independent re-implementation by a reviewer as the answer to circular tests, mutation testing of a writer (17 breaks) and the equivalent mutant `JSON.stringify(n)` versus `String(n)`, and a refactor that silently removed two protections (fixed in `d2ef493`; the implementer reports mutation checks: removing the `catch` fails 8 tests, skipping the projection fails 3). L4 (Phase 1.1 T4a): the trust boundary for untrusted files, boundary-value tests in pairs, differential testing against `JSON.parse`, never-throws tests (every prefix, random garbage), a guard test over source text, mutation testing and the equivalent mutant, a vacuous test caused by the tooling, and bounding attacker-controlled text in error messages. L1 (Phase 1.1 T1): end-to-end versus unit tests, auto-waiting, flaky tests, vacuous tests and fault injection, CI, supply-chain pinning. L2 (Phase 1.1 T2): table-driven and guard tests. L3 (Phase 1.1 T3): data-driven tests with data kept apart from code, a conformance suite, circular tests, coverage guards and minimum-count floors, a drift test with fail-on-purpose regeneration, and mutation checks applied to the fixtures.
- **Concepts to learn:** secrets and credential references; secret detection; SSRF; authorization and owner scoping; sandboxing; limits and timeouts; unit, integration and end-to-end tests; shared fixtures; fault injection (mutation) and vacuous tests; CI with GitHub Actions; supply-chain pinning by commit SHA; Docker and Compose.
- **Why it is needed:** a platform that runs user-defined workflows with AI and external tools is a security problem first. Tests and CI are what let us change the system without fear.
- **Where it appears:** unit tests and Playwright tests exist; the shared fixtures and their TypeScript runner exist (Python runner planned, Phase 2); the strict import parser and its limits are the first concrete trust boundary (T4a, L4); a CI workflow exists; secret detection is planned (Phase 1.1 T9); backend security and Docker are planned (Phase 2 onward).
- **Related files:** `frontend/e2e/`, `frontend/playwright.config.ts`, `.github/workflows/ci.yml`, `frontend/src/**/*.test.ts`, `frontend/src/contracts/fixtures.test.ts`, `frontend/src/workflow/strictJson.test.ts`, `frontend/src/workflow/serialize.test.ts`, `frontend/src/workflow/valuePolicy.test.ts`, `frontend/src/workflow/canonicalJson.test.ts` (L5), `frontend/src/workflow/jsonSchema.test.ts` (L6), `frontend/src/catalog/catalog.test.ts`, `frontend/src/store/editorStore.test.ts` (L7: the source-text guards), `frontend/e2e/config-panel.e2e.ts` (L7), `contracts/README.md`, `contracts/CANONICAL_JSON.md` (L5), `contracts/CONFIG_SCHEMA.md` (L6), `contracts/fixtures/` (including `schema/`, L6), `.claude/rules/architecture.md`, `docs/ARCHITECTURE.md` section 11 and 12, `docs/DECISIONS.md` D-016, D-019, D-023.
- **Interview questions:**
  1. Why pin GitHub Actions to a commit SHA instead of a version tag?
  2. What can an end-to-end test catch that a unit test cannot, and the reverse?
  3. What is a vacuous test? Give an example from this project.
  4. Why must credentials never appear in a workflow file, and what replaces them?
  5. Why is a server-side request forgery guard needed when a workflow can call arbitrary URLs?

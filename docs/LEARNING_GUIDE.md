# AgentForge Learning Guide

> **For the Product Owner.** Part 1 is a plain-language **primer** (reference material: what we are building and how the code is organised). Part 2 is the **teaching record** (lessons actually taught and what you demonstrated).
> The **curriculum and statuses** are in `docs/LEARNING.md`. Learning progress is tracked separately from implementation progress.
> **Living document.** The Principal Architect updates it at the end of every task (D-028). The primer describes the project **as it is today**; where something is planned but not built, it says so.
> Last updated: 2026-11-12, after Phase 1.1 T7a, the pure editor-warning function `lintWorkflow` (Lesson L10, commits `62041bf` and `b472579`; the UI that shows the warnings, T7b, `eb166b1`, is under review and not yet taught). Before that: T8, the branching specification (Lesson L9).

# Part 1: Primer

---

## 1. What we are building

AgentForge is a **visual builder for AI workflows**, in the same family as n8n, Langflow and Dify. A user:

1. **Draws** a workflow on a canvas by dragging boxes (called *nodes*) and connecting them with lines.
2. **(Later)** describes a workflow in plain English and lets AI draw it.
3. **(Later)** runs the workflow and watches what happens at each step.
4. **(Later)** builds *agents*: AI that decides its own next steps in a loop and can use tools.

A tiny example workflow: *Manual Trigger → LLM Prompt ("summarise this") → Output*. You press run, the text goes to an AI model, and the answer appears in the Output node.

## 2. Where we are today

| Built and tested | Not built yet |
|---|---|
| The visual editor in the browser: drag nodes from a library, connect them with rules, edit each node's settings, save the workflow to a `.json` file and load it back | Running workflows (the "engine") |
| A catalog of 6 node types | AI models, agents, tools (Phase 4) |
| Old files keep working: a file saved with an older version of a node is upgraded in memory and the editor tells you (the original file is never rewritten) | Natural-language workflow generation (Phase 5) |
| The rules for conditional branching, skipped nodes and joins are written down as a binding specification (`docs/ARCHITECTURE.md` section 6.1); the only code is a small marker on the Condition's output ports | |
| The pure function that works out the editor warnings (an unconnected required input, an empty required setting, a trigger leading nowhere, a node nothing starts, a result nobody uses); it is built and tested (Lesson L10); showing it in the editor, T7b, is committed and still under review | |
| 1122 unit tests in 19 test files and 51 browser tests (at commit `eb166b1`, which includes T7b's tests) | |
| A CI workflow that runs the checks on GitHub | The backend server, database, saving to a server (Phase 2) |

**Important:** today everything runs **in your browser only**. There is no server. Nothing runs a workflow yet. The editor produces a *description* of a workflow; later phases will execute it.

| Phase | What it delivers | Status |
|---|---|---|
| 1 | The visual editor | Done and accepted |
| 1.1 | Hardening: stricter file format rules, better settings forms, upgrades for old files, warnings, browser tests | In progress (tasks 1 to 6, T8 and T7a of 10 done, with task 5 in two halves, T5a and T5b; T6, upgrading old files, T8, the branch rules, and T7a, the warning function, are done; T7b, showing the warnings in the editor, is committed and under review) |
| 2 | Backend server and database; save/load workflows | Planned, not approved |
| 3 | Execution engine: actually run workflows | Planned |
| 4 | AI runtime: LLM and Agent nodes | Planned |
| 5 | Describe a workflow in English and get it drawn | Planned |
| 6 | MCP and other integrations | Planned |
| 7 | Logins, credentials, production hardening | Planned |

## 3. The big picture

```
        YOUR BROWSER (built, Phase 1)                         SERVER (not built yet)
 ┌───────────────────────────────────────────┐        ┌─────────────────────────────────┐
 │ Node library  │  Canvas  │ Settings panel │        │ Stores workflows (database)     │
 │ (drag from)   │ (draw)   │ (edit a node)  │  <──>  │ Validates them                  │
 │               │          │                │  Phase │ Runs them (engine)              │
 │   Editor state ("store") = the workflow   │   2+   │ Runs AI agents                  │
 └───────────────────────────────────────────┘        └─────────────────────────────────┘
              │  Export / Import
              ▼
        a  workflow.json  file
```

The most important idea in the whole project: **the workflow is a JSON document** (a text file with a defined shape). The editor draws it, the server will store it, the engine will run it, and AI will generate it. Everything revolves around that one document, so we are careful about its exact format.

## 4. Key ideas (a glossary with examples)

**Workflow.** The whole diagram: nodes plus the lines between them.

**Node.** One box. It has a *type* (for example `llm.prompt`), a *label* you can rename, *settings* (called `config`) and a *position* on the canvas. The six types today: Manual Trigger, LLM Prompt, HTTP Request, Condition, Agent, Output.

**Port.** A connection point on a node. *Input* ports are on the left and *output* ports on the right. Each has a name (`input`, `text`, `data`) and a *data type* (`text`, `json`, `number`, ...).

**Edge.** A line from one node's output port to another node's input port.

**Data types and compatibility.** You can only connect compatible ports. `any` connects to everything; otherwise the types must match. So a number cannot flow into a text input.

**Catalog and node definition.** The catalog is the list of node types the platform offers. A *definition* describes one type: its ports, its settings, its icon. The library, the settings forms, the validator and (later) the engine and the AI generator all read the same catalog, so there is one source of truth. See `frontend/src/catalog/nodes.ts`.

**Config schema.** A description of what settings a node accepts (for example `temperature` is a number from 0 to 2). The settings panel builds its form from it, and the importer uses it to check files. We use a small, documented subset of **JSON Schema**, a standard way to describe JSON. The checker for that subset (Lesson L6) is now the only one: since T5b (Lesson L7) the catalog, the "new node" step, the settings panel and the importer all use it. A setting's starting value is its schema `default`, applied only when you create a node; how a setting is *drawn* (a multi-line box, its height) lives in a separate `ui` block, never in the schema.

**Workflow JSON.** The file format. A minimal real example (a trigger connected to an output):

```json
{
  "schemaVersion": "1.0",
  "id": "wf_1a2b3c4d",
  "name": "Untitled workflow",
  "description": "",
  "nodes": [
    { "id": "n_1", "type": "trigger.manual", "typeVersion": 1, "label": "Manual Trigger",
      "config": { "payload": {} }, "position": { "x": 100, "y": 200 } },
    { "id": "n_2", "type": "output.result", "typeVersion": 1, "label": "Output",
      "config": { "format": "text" }, "position": { "x": 400, "y": 200 } }
  ],
  "edges": [
    { "id": "e_1", "source": { "nodeId": "n_1", "port": "data" },
      "target": { "nodeId": "n_2", "port": "input" } }
  ],
  "metadata": {}
}
```

**`schemaVersion` vs `typeVersion`.** Two separate version numbers. `schemaVersion` versions the *file format*. `typeVersion` versions *one node type* (if we change how the Agent node works, it becomes version 2). Keeping them separate lets each evolve without breaking the other.

**Migration.** Upgrading an old file to the current format *in memory*, without overwriting the original. Built in Phase 1.1 task T6 (Lesson L8): when you import a file, each node whose `typeVersion` is older than the catalog's is upgraded by a chain of small steps (`frontend/src/workflow/nodeMigrations.ts`); the Agent node's `maxIterations` became a whole number in version 2, so a version 1 value such as 2.5 is rounded half up to 3 with a note. A banner tells you what changed. A node *newer* than the editor, or older with no path, is an error (`node.version-newer`, `node.no-migration-path`). Writing the upgraded file to a server is planned (Phase 2), not built.

**Validation (errors) vs warnings.** *Errors* mean the file is structurally wrong (unknown node type, impossible connection); it is rejected. *Warnings* mean "this looks incomplete" (an empty required setting, an unconnected node); they never stop you from working. We keep them strictly separate (decision D-018). The warnings come from a separate pure function, `lintWorkflow` in `frontend/src/workflow/lint.ts` (T7a, Lesson L10): they are worked out again from the workflow and the catalog whenever needed, never stored in the file, never blocking.

**DAG and "no cycles".** A *directed acyclic graph*: arrows that never loop back. The workflow engine will run nodes in dependency order, which only works if there are no loops. Anything that needs looping (an agent thinking in steps) happens *inside* the Agent node using a library called LangGraph. The editor already refuses a connection that would create a cycle.

**Condition and branches (rules written, Lesson L9; the engine that applies them is planned, Phase 3).** A Condition node sends data down either its `true` or its `false` port. Nodes on the branch not taken are *skipped*, and a skip spreads downstream. The exact rules are a binding specification in `docs/ARCHITECTURE.md` section 6.1 (decision D-034): each edge is `pending`, `active`, `inactive` or `failed`; a fixed order decides whether a ready node runs or is skipped; a failure beats an active input; independent branches keep running after a failure. In the code, the Condition's two output ports carry an optional `branch: true` marker (`frontend/src/catalog/nodes.ts`). **No engine exists yet, so nothing runs these rules.**

**Agent (planned).** A node where an AI model decides what to do next, repeatedly, and can call tools.

**Credentials.** API keys and passwords. **They never go inside a workflow file** (decision D-016). Later, workflows will refer to a stored credential by id. Until then, a detector will warn if someone pastes a secret into a setting (planned, task T9).

**Provider.** Which AI service a node uses: Ollama (local), OpenAI, Anthropic or Groq. We design so adding one does not change the file format. Groq was added in T5b; the one `PROVIDERS` list in `frontend/src/catalog/nodes.ts` feeds both the LLM Prompt and the Agent node.

**Incomplete drafts (decision C1, built in T5b, Lesson L7).** A file whose node is missing a *required* setting (for example an LLM Prompt with no `provider`) still imports. The editor must be able to hold half-finished work. A wrong type, a value outside the allowed list or range, or an unknown setting are still errors. A missing required setting is a *warning* in the editor (`required-field-empty`, computed by `lintWorkflow`, T7a, Lesson L10; showing it in the editor is T7b, under review) and an *error only when the workflow is run* (Phase 3, planned).

**Strict parsing (built in task T4a, Lesson L4).** Reading an imported file with our own small parser instead of the browser's built-in one, so that problems the built-in parser hides (a repeated key, a number too big to store exactly, a file that is not valid UTF-8) become clear errors. It also enforces AgentForge's limits: numbers no larger than 2^53 - 1 in magnitude, nesting at most 64 levels, files at most 5,000,000 bytes. See `frontend/src/workflow/strictJson.ts` and `valuePolicy.ts`.

**Canonical JSON and export JSON (built in task T4b, Lesson L5; TypeScript only).** Writing a workflow to text in one exact, repeatable way (keys sorted, numbers formatted the same everywhere) so the same workflow always produces byte-identical text. There are two named forms: `canonical-json/1` (compact, meant for hashing) and `export-json/1` (pretty, 2-space indent, for the `.json` files you download; never hashed). See `frontend/src/workflow/canonicalJson.ts` and `contracts/CANONICAL_JSON.md`. **Built and tested in TypeScript only: the Python version is planned for Phase 2 and no parity is claimed; no hashing code exists yet (planned, Phase 2).**

**Fixtures (built in task T3, Lesson L3).** Shared test data files in the top-level `contracts/` folder, one case per file, with no code inside. The TypeScript tests read them today; the Python backend tests are planned (Phase 2) to read the same files, and only then can the two sides be said to agree.

## 5. A tour of the code

Everything built so far lives in `frontend/`. Think of it in layers:

```
frontend/src/
  workflow/      THE CONTRACT: types, rules, parsing. No screen code in here.
    types.ts          what a Workflow, node, edge, port and node definition look like
    connections.ts    "may this edge exist?" (the 7 connection rules)
    validate.ts       checks an imported file and returns a clean Workflow or a list of errors
    jsonSchema.ts     the JSON Schema subset checker and applyDefaults (T5a, L6)
    configSchema.ts   parses what you type into one settings field and checks it against that property's schema
    codeExemptions.ts two lists of error codes that tests exempt; imported by tests only (T5b)
    migrate.ts        upgrades old document formats (schemaVersion; no steps registered yet)
    nodeMigrations.ts upgrades old node versions (typeVersion) in memory, and reports what changed (T6)
    serialize.ts      export to text (with the export guard), import from text (bytes or text)
    canonicalJson.ts  the two repeatable JSON text writers: compact (for hashing) and pretty (for files) (T4b)
    strictJson.ts     our strict JSON parser for imported files (T4a)
    valuePolicy.ts    the limits (numbers, nesting, text rules) as one shared checker (T4a)
    errors.ts         the error codes and JSON Pointer paths (T2)
  catalog/       the six node types (nodes.ts) and lookups (index.ts)
  store/         editorStore.ts: the single source of truth for the workflow being edited
  canvas/        the drawing surface (React Flow) and flowMapping.ts, the only place that
                 translates our workflow into React Flow's objects
  nodes/         WorkflowNode.tsx: one component that draws every node type from the catalog
  library/       the searchable, draggable list of node types
  config-panel/  the settings form for the selected node, generated from the node's schema (ConfigPanel.tsx)
                 and propertyOrder.ts, the small helper that decides the field order
  app/           the page layout, the toolbar (New / Import / Export) and the upgrade banner (UpgradeBanner.tsx)
frontend/e2e/    browser tests that click through the real app (Playwright)
frontend/src/contracts/fixtures.test.ts   the runner for the shared fixtures
```

Outside `frontend/`, the top-level `contracts/` folder holds the language-neutral test data (JSON files, no code) that the runner reads (Lesson L3).

**Follow one action through the code.** You drag "LLM Prompt" onto the canvas:

1. `library/Library.tsx` starts a drag that carries the text `llm.prompt`.
2. `canvas/Canvas.tsx` receives the drop, converts the mouse position to canvas coordinates, and calls `addNode`.
3. `store/editorStore.ts` looks up the definition in the catalog, creates a node whose settings come from `applyDefaults(def.configSchema)` (the schema's `default`s), and updates the workflow.
4. The store change re-renders: `canvas/flowMapping.ts` converts the workflow to React Flow objects, and `nodes/WorkflowNode.tsx` draws the box with its ports.
5. You connect two ports: `Canvas.tsx` asks `workflow/connections.ts` whether it is allowed, and only then calls `store.connect`.
6. You click Export: `app/Toolbar.tsx` calls `exportWorkflowText` in `serialize.ts`, which checks the workflow against the limits, writes it with `canonicalJson.ts` (keys sorted, one exact layout) and only then lets the browser download the `.json` file. If a check fails, the toolbar says "Export failed. No file was created."

**Suggested reading order** (each is short): `workflow/types.ts` → `catalog/nodes.ts` → `workflow/connections.ts` → `store/editorStore.ts` → `canvas/Canvas.tsx` → `workflow/validate.ts`.

## 6. How we know it works

| Kind | Tool | What it does | Command |
|---|---|---|---|
| **Unit tests** | Vitest | Small, fast tests of single functions (the connection rules, the store, import/export, the strict parser, the two JSON writers, the JSON Schema subset validator, the warning function, the catalog and the shared fixtures in `contracts/`). 1122 in 19 test files at commit `eb166b1` (the Principal Architect's `npm run verify`). | `npm test` |
| **Browser tests** | Playwright | A real browser clicks through the app: drag, connect, edit, export, import (and, since T7b, the warnings). 51 at commit `eb166b1`. | `npm run test:e2e` |
| **Type check** | TypeScript | Catches mismatched data shapes before running | part of `npm run build` |
| **Lint** | Oxlint | Catches suspicious code patterns | `npm run lint` |
| **Everything** | | All of the above, in order | `npm run verify` |

"Green" means *the checks we wrote passed*. It does **not** mean there are no bugs. To make sure the tests are meaningful, we sometimes break the code on purpose and confirm a test fails (we did this for T1: removing the cycle rule made the cycle test fail).

## 7. How the team works

You are the **Product Owner**: you decide *what* and *why*, and you accept results. Claude, as **Principal Architect**, decides *how*, plans the work and keeps the documents honest. A **Sonnet 5.5** subagent writes the code for one task at a time. An **Opus 5.5** subagent reviews each task independently and never edits files. A **Sonnet 5.5 tutor** subagent prepares the lessons in Part 2 of this file. Then the architect reports to you in plain language. The full loop is in `CLAUDE.md` section 16 and decision D-027.

| Document | Read it to learn |
|---|---|
| `docs/PROJECT_BRAIN.md` | The current state, always |
| `docs/DECISIONS.md` | Every decision, and whether it is approved |
| `docs/ARCHITECTURE.md` | How the whole system is designed |
| `docs/ROADMAP.md` | The phases and where we are |
| `docs/PHASE1_1_PLAN.md` | The current detailed plan, task by task |
| `docs/DEVELOPMENT_LOG.md` | A diary of what was done, with real test results |
| `docs/LEARNING.md` | The curriculum: 12 modules, your learning status, interview questions |

## 8. Try it yourself

```
cd frontend
npm install              # first time only
npm run dev              # open http://localhost:5173
```

**Exercises**

1. **Build and export.** Drag Manual Trigger, LLM Prompt and Output onto the canvas and connect them. Click Export and open the `.json` file. Find your three nodes and two edges, and match them to section 4.
2. **Break a rule.** Drag two LLM Prompt nodes onto the canvas, connect A to B, then try to connect B back to A (a loop). Also try connecting the HTTP Request node's `Status` (a number) to an Agent's `Task` (text). The editor refuses both; `workflow/connections.ts` is the code that decides.
3. **Bad settings.** Select LLM Prompt and type `5` as the temperature. The form flags it and does not save it.
4. **Round trip.** Export, press New, Import the file. Export again and compare the two files; they are identical.
5. **See a test fail.** In `frontend/src/workflow/connections.ts`, comment out the line that returns `'cycle'`, run `npm run test:e2e`, and watch the cycle test fail. Undo the change (`git checkout -- frontend/src/workflow/connections.ts`).

## 9. Why we made these choices (short answers)

| Choice | Why |
|---|---|
| **A JSON document is the heart of the system** | One shared, checkable format that the editor, server, engine and AI can all agree on |
| **Our file format is separate from React Flow's** | The drawing library is a view detail; it must not leak into saved files or the backend |
| **One catalog drives everything** | Adding a node type means adding data, not changing five places |
| **The engine and LangGraph are separate** | A predictable "run these steps in order" engine for normal workflows; the looping, unpredictable AI behaviour is contained inside the Agent node |
| **Zustand for editor state** | Small, simple, and the canvas, library and settings panel all need to share the same workflow |
| **Our own small JSON Schema checker** | Fewer dependencies, and we can keep TypeScript and Python in exact agreement with shared test data |
| **TypeScript first, then Python models** | We built the editor first; in Phase 2 the backend models become the source of truth and generate the TypeScript types |
| **Warnings never block you** | An editor must let you hold half-finished work |
| **No secrets in files, ever** | A workflow file gets shared, committed and stored; a key inside would leak |

## 10. What happens next

Phase 1.1, in order: **T1** browser tests and CI (done); **T2** structured error codes (done); **T3** shared fixtures (done); **T4a** strict parsing and the policy limits (done, Lesson L4); **T4b** repeatable (canonical) JSON export (done, Lesson L5; its review fixes are committed); **T5a** the JSON Schema subset validator, explicit defaults and the `schema` fixtures (done, Lesson L6); **T5b** switching the catalog, the settings panel and the importer to it, plus the Groq provider (done, Lesson L7; its review fixes are committed); **T6** upgrading old files with node migrations (done, Lesson L8; its review fixes are committed); **T8** the branch rules written down (done, Lesson L9; the specification is in `docs/ARCHITECTURE.md` section 6.1, no engine); **T7a** the pure warning function (done, Lesson L10); **T7b** showing the warnings in the editor (committed, under review); **T9** secret detection; **T10** final documentation and review. Then, if you approve it, Phase 2: the backend server and database.

## 11. Glossary, quick reference

| Term | One line |
|---|---|
| **React / TypeScript / Vite** | The tools the frontend is made with: UI library, typed JavaScript, dev server and bundler |
| **React Flow (`@xyflow/react`)** | The library that draws the canvas, nodes and lines |
| **Zustand** | The small library that holds the editor's state |
| **Vitest / Playwright** | Unit-test runner / real-browser test runner |
| **CI** | Continuous integration: an automatic run of the checks on every change pushed to GitHub |
| **LangGraph** | A library for AI agents that loop and use tools (Phase 4) |
| **MCP** | Model Context Protocol: a standard way for AI to use outside tools (Phase 6) |
| **Pydantic / FastAPI** | Python tools for data models and the web server (Phase 2) |
| **PostgreSQL / JSONB** | The database and its JSON column type (Phase 2) |
| **Commit** | A saved snapshot of the project in Git |

---
---

# Part 2: Teaching record

> **What this part is.** A record of the lessons actually taught and what the Product Owner demonstrated. It is separate from the primer above (reference material) and from implementation progress.
> **Rule (D-029).** Every lesson ends with a **Knowledge Check / Interview Questions** section. You answer all of them in one dedicated learning session at the end of the project and submit the answers for evaluation. **Only then** are statuses updated. Until then every concept is **Explained (no evidence)**. The curriculum and statuses live in `docs/LEARNING.md`.

## Lesson index

| Lesson | After task | Modules | Taught | Check questions | Status |
|---|---|---|---|---|---|
| **L1** | Phase 1.1 T1: Playwright and CI | 12 (testing and CI) | 2026-11-03 | 5 (answered at the end of the project) | Explained; evaluation pending |
| **L2** | Phase 1.1 T2: structured validation errors | 3 (main); also 1 and 12 | 2026-11-03 | 6 (answered at the end of the project) | Explained; evaluation pending |
| **L3** | Phase 1.1 T3: shared JSON fixtures and the TypeScript runner | 1, 3, 12 | 2026-11-03 | 6 (answered at the end of the project) | Explained; evaluation pending |
| **L4** | Phase 1.1 T4a: strict JSON parsing and the policy limits | 3 (main), 12, 1 | 2026-11-04 | 6 (answered at the end of the project) | Explained; evaluation pending |
| **L5** | Phase 1.1 T4b (commits `dd33e84`, `d2ef493`): canonical compact JSON, pretty export JSON and the export guard | 3 (main), 1, 12 | 2026-11-04 | 6 (answered at the end of the project) | Explained; evaluation pending |
| **L6** | Phase 1.1 T5a (commits `96cc80d`, `a009b20`): the JSON Schema subset validator, explicit `applyDefaults` and the `schema` fixtures | 3 (main), 7, 12 | 2026-11-05 | 6 (answered at the end of the project) | Explained; evaluation pending |
| **L7** | Phase 1.1 T5b (commits `7b09662`, `44bd7f4`): the catalog, importer (decision C1) and settings panel move onto the JSON Schema subset | 7 (main), 3, 2, 12 | 2026-11-05 | 6 (answered at the end of the project) | Explained; evaluation pending |
| **L8** | Phase 1.1 T6 (commits `2baee23`, `be43319`): versioned node migrations, `agent.autonomous` version 2, the upgrade banner | 3 (main), 7, 2, 12 | 2026-11-05 | 6 (answered at the end of the project) | Explained; evaluation pending |
| **L9** | Phase 1.1 T8 (code `4c696b4`; specification `ARCHITECTURE.md` section 6.1 and D-034, corrected in `32066b2`): branching, skipping and joins; the `branch` marker; reviewing a specification | 6 and 5 (main, for the specification only: no engine exists), 7, 12, 3 | 2026-11-12 | 6 (answered at the end of the project) | Explained; evaluation pending |
| **L10** | Phase 1.1 T7a (commits `62041bf`, `b472579`): editor warnings as a pure, derived function (`lintWorkflow`), the five rules, the whitespace contract and the review stories (the UI that shows them, T7b, is not covered) | 3 (main), 7, 6, 12 | 2026-11-12 | 6 (answered at the end of the project) | Explained; evaluation pending |

## Concept index

| Concept | Module | Lesson | Status |
|---|---|---|---|
| End-to-end test versus unit test | 12 | L1 | Explained (no evidence) |
| Test fixture and helper functions | 12 | L1 | Explained (no evidence) |
| Auto-waiting assertions | 12 | L1 | Explained (no evidence) |
| Flaky tests and retries | 12 | L1 | Explained (no evidence) |
| Vacuous tests and fault injection | 12 | L1 | Explained (no evidence) |
| Continuous integration (CI) | 12 | L1 | Explained (no evidence) |
| Supply-chain pinning by commit SHA | 12 | L1 | Explained (no evidence) |
| Machine-readable versus human-readable errors | 3 | L2 | Explained (no evidence) |
| Stable error codes as a contract (namespaced codes) | 1, 3 | L2 | Explained (no evidence) |
| JSON Pointer (RFC 6901) | 3 | L2 | Explained (no evidence) |
| String-literal union types and compile-time exhaustiveness (`ErrorCode`) | 3 | L2 | Explained (no evidence) |
| Validate, do not trust, at a boundary (own-property lookups) | 3, 12 | L2 | Explained (no evidence) |
| Table-driven tests, one test per code, guard tests | 12 | L2 | Explained (no evidence) |
| Errors versus warnings (D-018), applied to the import path | 3 | L2 | Explained (no evidence) |
| Contract-first design: one shared contract, two implementations (language-neutral fixtures) | 1 | L3 | Explained (no evidence) |
| Data-driven (table-driven) tests with test data kept apart from test code | 12 | L3 | Explained (no evidence) |
| A conformance suite and golden files; circular (self-confirming) tests and expectations written from the specification | 12 | L3 | Explained (no evidence) |
| Comparing `{code, path}` as multisets, never the message | 3, 12 | L3 | Explained (no evidence) |
| Rule order as part of a contract (`checkConnection`), caught only by a fixture | 1, 3 | L3 | Explained (no evidence) |
| Import semantics a second implementation must follow (cascades, stop-early, error cap) | 3 | L3 | Explained (no evidence) |
| Coverage guards, minimum-count floors and a drift test (fail-on-purpose regeneration) | 12 | L3 | Explained (no evidence) |
| A generator spec instead of a huge file (`inputRepeat`) | 12 | L3 | Explained (no evidence) |
| Mutation checks to prove a test can fail (applied to fixtures) | 12 | L3 | Explained (no evidence) |
| Trust boundary: untrusted file input, and why information lost during parsing cannot be recovered by checks afterwards | 3, 12 | L4 | Explained (no evidence) |
| What the built-in `JSON.parse` does silently (last duplicate key wins, big integers lose precision, invalid bytes replaced when decoding text) | 3 | L4 | Explained (no evidence) |
| A strict RFC 8259 parser: recursive descent, first problem only, a result type that never throws | 3 | L4 | Explained (no evidence) |
| Policy limits and where each rule comes from (RFC 8259, I-JSON / RFC 8785, AgentForge policy, PostgreSQL compatibility) | 1, 3 | L4 | Explained (no evidence) |
| Deciding a number's range from its token text, before conversion; why the safe-integer limit exists | 3 | L4 | Explained (no evidence) |
| Limits counted in the right unit: UTF-8 bytes not characters; depth counted as containers open | 3, 12 | L4 | Explained (no evidence) |
| Strict UTF-8 decoding, the byte order mark, and lone surrogates | 3 | L4 | Explained (no evidence) |
| Safe object construction (`defineProperty`, a key named `__proto__`) | 3, 12 | L4 | Explained (no evidence) |
| Round-trip integrity: values typed in the editor obey the same policy as imported files | 1, 3 | L4 | Explained (no evidence) |
| Reject rather than clamp or normalise | 3 | L4 | Explained (no evidence) |
| Bounding attacker-controlled text when it is echoed in a message (exact machine path, short human message) | 3, 12 | L4 | Explained (no evidence) |
| Boundary-value tests, differential testing against `JSON.parse`, fuzz-style truncation tests, a guard test over source text | 12 | L4 | Explained (no evidence) |
| Mutation testing and the equivalent mutant; a vacuous test caused by the tooling | 12 | L4 | Explained (no evidence) |
| Canonical form and deterministic serialization (same data, same bytes); why a hash needs it | 1, 3 | L5 | Explained (no evidence) |
| Two named profiles: `canonical-json/1` (compact, for hashing) and `export-json/1` (pretty, for files, never hashed); no hashing code exists yet | 3 | L5 | Explained (no evidence) |
| Why integer-like keys defeat `JSON.stringify` (also with a sorting replacer) and the fix: sort the key list and write the text directly | 3 | L5 | Explained (no evidence) |
| UTF-16 code unit order versus code point order (the U+E000 and U+1F600 pair); what a Python implementation must do | 1, 3 | L5 | Explained (no evidence) |
| Number text: ECMAScript `String(n)` versus Python `repr`; minus zero; the 1e-7 threshold | 3 | L5 | Explained (no evidence) |
| String escapes: only the standard set; U+007F, U+2028, U+2029 literal; no Unicode normalization | 3 | L5 | Explained (no evidence) |
| Which rules come from RFC 8785, I-JSON, AgentForge policy or PostgreSQL compatibility (and the export layout being AgentForge's own) | 1, 3 | L5 | Explained (no evidence) |
| Idempotence and round trip: export, import, export is byte-identical; the export guard (`exportWorkflowText`) and "what you can export you can import" | 1, 3 | L5 | Explained (no evidence) |
| Writers that refuse non-JSON data (undefined, Map, Date, cycles) instead of skipping it | 3, 12 | L5 | Explained (no evidence) |
| A guard that never throws: project to known fields, check, write inside try/catch, return one structured error (`value.not-json-data`, an export-only code) | 1, 3, 12 | L5 | Explained (no evidence) |
| PostgreSQL JSONB does not keep key order, so canonicalize on read (documented; not verified here) | 1 | L5 | Explained (no evidence) |
| Golden files with hand-written expectations; property-based testing against an independent reference; a reference that shares one call with the code (numbers) | 12 | L5 | Explained (no evidence) |
| Independent re-implementation by a reviewer as an answer to circular tests | 12 | L5 | Explained (no evidence) |
| A refactor can delete an implicit protection (projecting to known fields; catching writer failures) | 3, 12 | L5 | Explained (no evidence) |
| Mutation testing of a writer (17 breaks) and an equivalent mutant (`JSON.stringify(n)` versus `String(n)`) | 12 | L5 | Explained (no evidence) |
| A documented subset of JSON Schema (draft 2020-12) as a contract two languages implement; the deliberate non-goals (`$ref`, `anyOf`, `pattern`) and why (Pydantic output, regex dialects) | 1, 3, 7 | L6 | Explained (no evidence) |
| `validateAgainstSchema`: recursive walk, `{code, path}` errors, the early return after `schema.type`, own-property lookups | 3, 7 | L6 | Explained (no evidence) |
| A mandatory option as design (`checkRequired`), the C1 draft-versus-execution split (wiring is planned for T5b) | 3, 7 | L6 | Explained (no evidence) |
| Explicit versus implicit defaults (`applyDefaults`: no recursion, deep copy, never called by validators) | 3, 7 | L6 | Explained (no evidence) |
| A schema about schemas (`checkSchemaSubset`) and total functions on untrusted input; the uniform default rule | 3, 12 | L6 | Explained (no evidence) |
| Rules two languages must agree on: code-point string length, safe integers, enum equality (`true` versus `1`, JavaScript versus Python) | 3, 7, 12 | L6 | Explained (no evidence) |
| A temporary, named exemption list for codes no workflow can produce yet (`SCHEMA_ONLY_CODES`) and a no-production-import guard test | 12 | L6 | Explained (no evidence) |
| The three fixture case kinds (validation, defaults, schema check); a property test against an independent reference; a soundness corollary; a reviewer's independent validator and mutation-found fixture gaps (reports) | 12 | L6 | Explained (no evidence) |
| The node catalog as the single source of truth: one `configSchema` (a JSON Schema subset, `additionalProperties: false`) per node, and a `ui` block for presentation only | 7, 2, 3 | L7 | Explained (no evidence) |
| A form generated from a schema instead of one hand-written form per node (`ConfigPanel.tsx`, `propertyOrder.ts`); reserved `ui` widget values | 2, 7 | L7 | Explained (no evidence) |
| Who applies defaults and who checks `required`, at each moment (creation, import, editing, future execution); the incomplete draft (decision C1, D-025) | 3, 7 | L7 | Explained (no evidence) |
| Imported data is never silently changed: the importer keeps `raw.config` as read; defaults are applied only in `addNode` | 3 | L7 | Explained (no evidence) |
| A behaviour change can make an unreachable state reachable somewhere else: the "(not set)" select that stops the screen from lying about the data | 2, 3, 12 | L7 | Explained (no evidence) |
| One list, derived everywhere (`PROVIDERS`), enforced by an identity assertion; adding `groq` without changing existing option order | 7, 12 | L7 | Explained (no evidence) |
| Differential testing between the old and new implementation (the reviewer's 60,000-document run, a report); only the intended differences may appear | 12 | L7 | Explained (no evidence) |
| Golden values copied from the brief (not computed from the code), source-text guards (`applyDefaults` has one caller; `codeExemptions` is imported by tests only) and a mutation-found weak test | 12 | L7 | Explained (no evidence) |
| A temporary exemption list for an execution-only code (`schema.required` in `codeExemptions.ts`); fixtures that state their mode (`checkRequired` on every config fixture) | 3, 12 | L7 | Explained (no evidence) |
| Messages for people versus paths for programs: undoing JSON Pointer escapes in the message only | 3 | L7 | Explained (no evidence) |
| Two version numbers: `schemaVersion` (document, `migrate.ts`, no steps yet) versus `typeVersion` (one node type, `nodeMigrations.ts`) | 3, 7 | L8 | Explained (no evidence) |
| A migration as a pure, deterministic, total function; a chain of single steps up to the catalog's latest version; one report per node | 3, 7, 12 | L8 | Explained (no evidence) |
| Latest-only catalog plus a migration registry (history in the registry, not in the catalog) | 7 | L8 | Explained (no evidence) |
| The five node-version outcomes (equal, older with chain, older without chain, newer, unknown type) and the codes `node.version-newer`, `node.no-migration-path`, `node.unknown-type` (now for unknown types only) | 3, 7 | L8 | Explained (no evidence) |
| The two-phase import rule (version errors are returned alone, before validation) and why a wrong written spec is worse than none | 1, 3, 12 | L8 | Explained (no evidence) |
| Upgrade in memory, never rewrite the saved file, never silent (`UpgradeReport`, the banner); the honest guarantees of "never overwritten" | 1, 3, 12 | L8 | Explained (no evidence) |
| Port renames rewrite edges (supported and tested with synthetic registries; no real rename yet) | 3, 7 | L8 | Explained (no evidence) |
| Half up versus half to even: a rule two languages must agree on (Python `round()` is general knowledge, not run); the `.5` fixtures that discriminate (2.5, 48.5) | 1, 3, 12 | L8 | Explained (no evidence) |
| The equivalent mutant (`Math.round` versus `Math.floor(x + 0.5)`) and what to do about it: a written rule plus shared fixtures, not a test | 12 | L8 | Explained (no evidence) |
| Differential testing against a reviewer's reference and old-versus-new importer (reports); fixtures must pin every behaviour a second implementation could get wrong | 12 | L8 | Explained (no evidence) |
| Do not overclaim what a test proves (an e2e check that cannot fail because of the app); a widened source-text guard with a regex self-test | 12 | L8 | Explained (no evidence) |
| A user-visible banner: an always-mounted `role=status` live region, keyboard focus returned to Import on Dismiss, bounded text (`shorten`) | 2 | L8 | Explained (no evidence) |
| Database migration at read time with a save as a new immutable version (planned for Phase 2, not built) | 1, 4 | L8 | Explained (no evidence) |
| Absent port versus a port whose value is `null` (emission, rule 1); only `branch` ports may be absent; why a buggy executor must fail loudly | 5, 7 | L9 | Explained (no evidence) |
| The `branch` marker: optional, output ports only, catalog metadata that is not in the document (no `schemaVersion` change); not used for scheduling | 7, 3 | L9 | Explained (no evidence) |
| Edge states (`pending`, `active`, `inactive`, `failed`), resolved nodes, readiness (no `pending` incoming edge) and how a skip spreads downstream | 6, 5 | L9 | Explained (no evidence) |
| The fixed run-or-skip order (failure wins, then "has edges and none active", then a required input without an active edge, then run); the start rule for triggers and unreachable roots | 5, 6 | L9 | Explained (no evidence) |
| Vacuous truth (an empty group satisfies "all"), and precedence between rules that both apply | 12, 6 | L9 | Explained (no evidence) |
| Joins: a `multiple` input, policy "any active", a list in edge array order; `input-occupied` limits ordinary inputs to one edge | 6, 7 | L9 | Explained (no evidence) |
| Failure without fail-fast (drain): deterministic records versus half-done side effects; `upstream_failed` propagation; run result, `no_output_reached`, partial results, aborted runs | 5, 6 | L9 | Explained (no evidence) |
| Concurrency from independent ready nodes, termination because the graph has no cycles (D-006) | 6, 5 | L9 | Explained (no evidence) |
| A specification is code you cannot run: review it by walking worked examples by hand; find contradictions before acceptance; examples as future tests (specification only, no engine; reports from the review) | 12 | L9 | Explained (no evidence) |
| Alternatives rejected for branching (implicit skipping, skip token, evaluate both, scheduling marker, fail-fast) | 5, 6 | L9 | Explained (no evidence) |
| Derived data versus stored data: a pure function recomputed after every edit, nothing kept in the document (`lintWorkflow`) | 3 | L10 | Explained (no evidence) |
| Warnings versus errors in code: a separate function and type, never blocking; `validateWorkflow` stays errors-only (D-017, D-018); only workflows that import are linted | 3 | L10 | Explained (no evidence) |
| Roles from the catalog (category: source, sink, processor; port direction) instead of a private list of node types | 7 | L10 | Explained (no evidence) |
| The five rules (`required-input-unconnected`, `required-field-empty`, `trigger-not-connected`, `node-unreachable`, `result-unused`), "empty" for a setting, "only evaluated when a trigger exists" | 3, 7 | L10 | Explained (no evidence) |
| One cause, one warning (the suppression rule) and its limit (an incoming edge on another port) | 3, 6 | L10 | Explained (no evidence) |
| Reachability by breadth-first search; why iterative with a moving index; structural versus run-time reachability (the engine's rule 5(c)) | 6, 5 | L10 | Explained (no evidence) |
| Defensive reading of untrusted-shaped data: Map and own-property lookups, ids such as `__proto__`, an edge table that ignores edges to nowhere | 3, 12 | L10 | Explained (no evidence) |
| Messages never contain values (so a later secret detector cannot leak a secret into the UI) | 3, 12 | L10 | Explained (no evidence) |
| The whitespace contract: the exact 25 code points of JavaScript `trim`, near misses, Python `strip` differing (general knowledge, not run); fixtures a port must run | 1, 3, 12 | L10 | Explained (no evidence) |
| The `warnings` fixture family: multiset comparison, `negativeFor` ("the rule applies but does not fire"), coverage guards; order is unit-tested only | 12 | L10 | Explained (no evidence) |
| Independent reference implementations (in-test `reference()` and a reviewer's own, a report), a generator that must exercise the rules, differential testing | 12 | L10 | Explained (no evidence) |
| Scaling tests: compare 5,000 with 50,000 nodes, a ratio instead of milliseconds, two graph shapes (chain and star) because a test detects only what its input exercises | 12 | L10 | Explained (no evidence) |
| Documenting a boundary honestly (never throws for JSON-shaped values; duplicate ids) instead of over-engineering for an unreachable case | 12, 3 | L10 | Explained (no evidence) |
| A specification can contradict the code it describes (ARCHITECTURE 6.1 rule 4 versus the suppression rule); a file-tool hazard with Unicode escapes and the byte check | 12 | L10 | Explained (no evidence) |
| Primer concepts (workflow, node, port, edge, catalog, config schema, `schemaVersion` vs `typeVersion`, validation vs warnings, DAG, credentials) | 1, 2, 3, 6, 7 | Primer (Part 1) | Explained as reference (no evidence, no lesson) |

---

## Lesson L1: Testing the editor like a user, and checking it automatically

**Task:** Phase 1.1 T1 (Playwright browser tests and the CI workflow). **Module:** 12 (Security, Testing and Deployment).

### 1. The problem

After Phase 1, the editor worked, and we knew it because someone (me) had clicked through it with a throwaway script that nobody else could run. In the next tasks (T2 to T9) we change the *rules* the editor depends on: how files are parsed, how settings are checked, how connections are judged. Any of those changes could quietly break something as basic as dragging a node. We needed a **robot user** that repeats the same checks, the same way, every time, and on every change.

### 2. The concept

**End-to-end (E2E) testing** means a program drives the *real application in a real browser*, the way a person would: it drags, clicks, types, then looks at what happened. It protects against **regressions** (something that used to work stops working).

Compare it with a **unit test**, which tests one small function in isolation (for example "is this connection allowed?"). Unit tests are fast and precise. E2E tests are slower but prove that all the pieces, including the screen, work together. Teams use both; a common picture is a *pyramid*: many unit tests, fewer E2E tests.

**Continuous integration (CI)** means a server automatically runs all the checks whenever code is pushed, so a break is noticed within minutes and not weeks.

### 3. Why this approach

- **Playwright** drives a real Chromium browser, so drag and drop, layout and keyboard behaviour are real, not simulated. It also *waits automatically* (see section 4), which removes most flakiness.
- **One browser (Chromium) and a fixed window size**, because the drag and connect tests depend on exact positions; fewer variables means more repeatable results.
- **A fresh page per test**, so tests cannot affect each other.
- **A rule that any console error fails the test**, so hidden crashes cannot pass unnoticed.
- **CI on GitHub** with a single command (`npm run verify`) so "green locally" and "green in CI" mean the same thing.
- **Actions pinned to a commit SHA** instead of a version tag (explained below).

### 4. How it works internally

```mermaid
sequenceDiagram
  participant R as Test runner (Playwright, Node)
  participant V as Dev server (Vite)
  participant B as Real browser (Chromium)
  participant A as AgentForge app (React)
  R->>V: start the dev server (config: webServer)
  R->>B: launch a fresh browser page
  B->>V: request the page
  V-->>B: HTML and JavaScript
  B->>A: the app starts
  R->>B: drag from library, click, type (like a user)
  B->>A: real mouse and keyboard events
  A-->>B: the screen updates
  R->>B: assert what is visible or exported
```

**Auto-waiting.** A line such as `expect(editor.nodes).toHaveCount(3)` does not check once; it keeps re-checking until it is true or a time limit passes. That is better than "wait 2 seconds", which is either too slow or too short. The tests never use fixed sleeps.

**Flaky tests.** A test that sometimes passes and sometimes fails for no code reason. In CI we allow one retry (to keep a trace of what happened) but also set `failOnFlakyTests`, so a test that needed a retry still turns the run red and gets fixed instead of hidden.

### 5. How it communicates with other components

- The **runner** talks to the **browser** over a control channel (like a remote control).
- The **browser** talks to the **dev server** over ordinary HTTP, exactly as a user's browser would.
- Tests talk to the app only through the **screen** and the **exported file**, never by reaching into its internals. That is why they survive refactors.
- **CI** runs `npm run verify` on a GitHub machine:

```mermaid
flowchart LR
  P[Push to GitHub] --> C[CI starts on a fresh Linux machine]
  C --> K[Check out the code]
  K --> N[Install Node 24 and the exact dependencies]
  N --> B[Install Chromium]
  B --> L[lint]
  L --> U[unit tests]
  U --> D[type-check and build]
  D --> E[browser tests]
  E -->|any step fails| R[Upload the report]
```

### 6. Important code paths

| Where | What it does |
|---|---|
| `frontend/playwright.config.ts` | Chromium only, fixed window, starts its own dev server on a dedicated port and never reuses a running one, retries and flaky-failure policy for CI |
| `frontend/e2e/fixtures.ts` | Gives every test a fresh editor page and fails the test on any console error or uncaught error |
| `frontend/e2e/editor.ts` | Helpers that act like a user: `drop` (drag from the library onto the canvas), `connect` (drag between two ports), `exportWorkflow`, `importText` |
| `frontend/e2e/connections.e2e.ts` | One test per connection rule: valid, occupied input, duplicate, type mismatch, cycle, and live feedback while dragging |
| `frontend/package.json` (`verify`) | The single command: lint, unit tests, build with type-check, browser tests |
| `.github/workflows/ci.yml` | Runs `npm run verify` on GitHub on every push and pull request |

### 7. Alternatives and trade-offs

| Option | Good | Costs |
|---|---|---|
| **Playwright (chosen)** | Real browser, auto-waiting, good traces | Heavier than unit tests; needs a browser download |
| Cypress or Selenium | Also drive real browsers | Different trade-offs in speed, setup and API; no strong reason to switch |
| A simulated DOM (jsdom) with Testing Library | Very fast | Not a real browser: no real layout, so dragging and connecting cannot be tested properly |
| Only unit tests | Fastest, most precise | Cannot prove the screen, store and rules work together |
| Pin actions by tag (`@v7`) | Convenient | A tag can be moved; whoever controls the action repository could change what your CI runs |
| **Pin actions by commit SHA (chosen)** | The exact code is fixed and reviewable | Updates are manual |

### 8. Real-world applications

Every product team keeps a small E2E "smoke" suite in CI and treats flaky tests as bugs. Pinning CI actions to commit SHAs is a standard supply-chain precaution; in March 2025 a widely used GitHub Action (`tj-actions/changed-files`) was publicly reported as compromised, with its version tags repointed to malicious code, and workflows pinned to SHAs were not affected.

### Two lessons from our own review (real examples)

1. **A green test can be meaningless (a "vacuous" test).** The independent reviewer found that our test "a duplicate connection is rejected" still passed if we *deleted* the duplicate rule, because a different rule (the input is already occupied) rejected the same connection. The test was green but proved nothing about the rule in its title. The fix builds a situation where only the rule under test can reject, and we **proved** it by deleting the rule and watching the test fail. This technique, deliberately breaking the code to see whether a test notices, is called **fault injection** (or mutation testing).
2. **Understand your tools before asserting exact numbers.** Our first drag test failed because the node moved 90% of the mouse distance: the canvas library uses the first mouse movement to *start* the drag. The honest fix was to change what we assert (the exported position matches where the node really is), not to loosen the numbers until the test passed.

### Knowledge Check / Interview Questions

*Answers are not given here. Study this lesson and `docs/LEARNING.md`, then answer all questions in the dedicated learning session at the end of the project.*

1. We pinned the CI actions to a long commit code instead of a version tag like `v7`. In your own words, why? What attack does it defend against?
2. A test called "duplicate connections are rejected" stayed green after we deleted the duplicate rule. What does that tell you about a green test, and how do you check that a test is able to fail?
3. Give one kind of bug an end-to-end test would catch that a unit test of the connection rules would not, and one kind the unit test catches better.
4. What is "auto-waiting" in Playwright, and why is it better than waiting a fixed two seconds?
5. Locally and in CI we run the same single command (`npm run verify`). Why is that useful, and what does it consist of?

---

## Lesson L2: Errors that a program can read, not only a person

**Task:** Phase 1.1 T2 (structured validation errors), commit `29b8aeb`. **Modules:** 3 (Workflow JSON and State Management) mainly; also touches 1 (contracts) and 12 (testing).

### 1. The problem

When you imported a broken workflow file, the editor told you what was wrong as a **sentence**, for example `nodes[2]: duplicate node id "t".` A person can read that. A program cannot use it. Three things we are about to build need more:

- **The future Python backend** must reject the same bad files for the same reasons, and we want to *prove* it with shared tests (task T3). Comparing English sentences across two languages is fragile; one reworded message and every test breaks.
- **The future API** (Phase 2) will answer a bad request with an error body (HTTP 422). The frontend needs to know *which field* to highlight, not just show text.
- **The future AI generator** (Phase 5) will get validation errors fed back to it so it can repair its own draft. A model, like a program, does better with `{ what, where }` than with prose.

So before T3 we changed every error on the import path from a string into a small object with three parts.

### 2. The concept

Every error is now `{ code, path, message }`:

| Part | Plain meaning | Example | Who it is for |
|---|---|---|---|
| `code` | A short, stable **name** for the kind of problem | `node.unknown-type`, `connection.cycle` | Programs, tests, other languages |
| `path` | **Where** in the imported file the problem is | `/nodes/2/config/provider` | Programs (and humans debugging) |
| `message` | The sentence a person reads | `nodes[1] ("l"): unknown node type mystery.node@1.` | People |

Three ideas sit behind this:

1. **Machine-readable versus human-readable.** A message is written for people and may change (wording, translation). A code is a **contract**: once published, it never changes meaning. Good APIs return both.
2. **JSON Pointer (RFC 6901).** A standard text format for "the thing at this place inside a JSON document". `/nodes/2/config/provider` means: take `nodes`, its item number 2 (counting from 0), then `config`, then `provider`. The empty string `""` means the whole document. Characters `/` and `~` inside a key are escaped as `~1` and `~0`, so a key named `a/b` becomes `/a~1b`.
3. **Errors versus warnings (D-018).** These objects are only for **errors**: the file is structurally wrong and the import is rejected. "Looks incomplete" warnings are a separate list from a separate function (planned, T7) and are never mixed in.

The codes are grouped by a **namespace prefix** (`doc.`, `node.`, `edge.`, `connection.`, `schema.`). There are 23 today. They are listed in one place, `ERROR_CODES` in `frontend/src/workflow/errors.ts`, and more will be added by later tasks (for example `doc.duplicate-key` in T4). The plan for the full table is `docs/PHASE1_1_PLAN.md` section 3.2.

### 3. Why this approach

- **A plain object, not an exception or a class.** The import path already "never throws; returns readable errors" (see `importWorkflow`). Returning data keeps that, and a plain `{code, path, message}` turns into JSON with no effort, which is exactly what an API response and a shared test fixture are.
- **Strings from a closed list.** `ErrorCode` is a TypeScript type built from the `ERROR_CODES` list, so a typo such as `'node.unknwon-type'` does not compile.
- **The message text did not change.** T2 added structure; it did not rewrite sentences. That keeps the change small and lets the old assertions on wording stay valid.
- **The error list is plain data that both languages can read.** In Phase 2 the Python backend will produce the same `code` and `path` for the same input. That is **planned, not built**: there is no `backend/` folder yet, and until the shared fixtures run in Python (T3 writes them; Phase 2 adds the Python runner) nobody can claim the two sides agree.

### 4. How it works internally

The import path, from the file's text to a result (`frontend/src/workflow/serialize.ts`, `migrate.ts`, `validate.ts`):

```mermaid
flowchart TD
  T["File bytes from the Import button"] --> S{"More than 5,000,000 UTF-8 bytes?"}
  S -- yes --> E1["doc.too-large"]
  S -- no --> J["strictParse: our own strict parser (T4a; before T4a this was JSON.parse)"]
  J -- "bad grammar, duplicate key, too deep, unsafe number, bad encoding" --> E2["doc.not-json and the other parse codes"]
  J -- ok --> M["migrate: upgrade old schemaVersion"]
  M -- "not a JSON object" --> E3["doc.not-object"]
  M -- "unknown schemaVersion" --> E4["doc.unsupported-version"]
  M -- ok --> V1["validate: top-level fields id, name, description, metadata, nodes, edges"]
  V1 -- "wrong type" --> E5["doc.invalid-field (stop here)"]
  V1 -- ok --> V2["validate each node: shape, duplicate id, catalog type, config check"]
  V2 --> V3["validate each edge: shape, duplicate id, then the connection rules"]
  V3 --> D{"Any errors collected?"}
  D -- no --> W["A clean Workflow, loaded into the store"]
  D -- yes --> L["List of code, path, message (at most 20)"]
  E1 --> P["Toolbar error panel; the current workflow is not changed"]
  E2 --> P
  E3 --> P
  E4 --> P
  L --> P
```

Points worth knowing:

- **Early exits versus collecting.** The first four failures (too large, not JSON, not an object, unsupported version) stop immediately, because nothing else can be checked. Bad top-level fields also stop. After that the validator **collects**: it keeps going through every node and every edge so the user sees many problems at once, up to `MAX_ERRORS = 20` (extra errors are silently dropped).
- **One problem per node or edge, but all settings problems.** A node that is malformed, has a duplicate id or an unknown type reports that one problem and moves on (the `return err(...)` lines in `validate.ts`). Its settings are checked by `validateConfig`, which can report several errors for one node.
- **Who knows the path.** `validateConfig` in `configSchema.ts` does not know where the node sits in the file, so it returns `{ key, code, message }`. `validate.ts` builds the full pointer with `jsonPointer('nodes', i, 'config', key)`. This split matters because the settings form in the editor (`config-panel/ConfigPanel.tsx`) reuses the same checking code through `parseConfigInput`, and a form field has no document path.
- **One check, many callers.** The internal `checkValue` function in `configSchema.ts` is the single place that decides "is this value valid for this setting" and returns a code plus a message. The form and the importer both go through it, so they cannot disagree. This is the "avoid duplicated business logic" rule in action.
- **Reusing the editor's connection rules.** For each edge the importer calls `checkConnection` from `connections.ts`, the same function the canvas uses while you drag. It returns the *first* rule that fails, in a fixed order: unknown node, unknown port, self-loop, duplicate, input already occupied, type mismatch, cycle. Each edge is checked "as if it were being added" to the edges accepted so far.
- **The type system keeps the two lists in step.** The line that turns a connection problem into a code is the template `connection.${problem}`. TypeScript knows the result must be one of the codes in `ErrorCode`, so if someone adds an eighth connection rule and forgets to add its code, the project does not compile. This is a **string-literal union** with **compile-time exhaustiveness**: the compiler checks you covered every case.

### 5. How it communicates with other components

- `importWorkflow` (in `serialize.ts`) is the only entry point. It returns `{ ok: true, workflow }` or `{ ok: false, errors }`. The same `ValidationError` type is used by `migrate.ts`, `validate.ts` and `serialize.ts`, so nothing has to translate between layers.
- `frontend/src/app/Toolbar.tsx` receives the list and shows each item as the **code** in a small badge followed by the **message**. The path is shown next to the message as plain, muted text (for example `at /nodes/0/type`), so everyone can see it (the first version hid it in a tooltip, which a review flagged as not accessible). A failed import leaves the current workflow untouched; only a fully valid file replaces it.
- The browser test `frontend/e2e/import-export.e2e.ts` checks this on the real screen: a broken file shows `doc.not-json`, and a file with an unknown node type shows `node.unknown-type`, while the three nodes and two edges already on the canvas stay.
- **Built afterwards in T3 (Lesson L3):** the test cases now also live as shared JSON fixture files in the top-level `contracts/` folder. The TypeScript runner reads them today; the Python backend runner is **planned for Phase 2** and does not exist. The comparison looks at `{code, path}` only and ignores the human message and the order of the list.

### 6. Important code paths

| Where | What it does |
|---|---|
| `frontend/src/workflow/errors.ts` | `ERROR_CODES` (the closed list), `ErrorCode` (the type made from it), `ValidationError` (`{code, path, message}`), `jsonPointer(...)` (builds an escaped RFC 6901 pointer) |
| `frontend/src/workflow/validate.ts` | `validateWorkflow`: shape, nodes, edges; the small `err` helper that records an error and enforces the 20 limit; the `connection.${problem}` mapping |
| `frontend/src/workflow/configSchema.ts` | `checkValue` (one check, one code), `validateConfig` (returns `{key, code, message}` for each setting problem); `ConfigErrorCode` is limited to the `schema.*` codes |
| `frontend/src/workflow/migrate.ts` | `migrate`: reports `doc.not-object` and `doc.unsupported-version` with the path `/schemaVersion` |
| `frontend/src/workflow/serialize.ts` | `importWorkflow`: size check in bytes (`doc.too-large`), strict parsing (`doc.not-json` and the other parse codes; this was `JSON.parse` until T4a), then migrate and validate |
| `frontend/src/workflow/connections.ts` | `checkConnection` and `CONNECTION_ERROR_MESSAGES`: the seven connection rules and their sentences |
| `frontend/src/app/Toolbar.tsx` | The import error panel |
| `frontend/src/workflow/errors.test.ts` | The table of cases (one real bad file per code) and the guard tests |
| `frontend/src/workflow/serialize.test.ts`, `frontend/e2e/import-export.e2e.ts` | Existing tests re-expressed on `{code, path}`; the on-screen check |

#### How we test it: table-driven tests and guard tests

`errors.test.ts` is a good example of three test ideas.

1. **Table-driven test.** Instead of 23 hand-written tests, there is one table: for each code, a function that builds a real bad file and the path we expect. One loop runs them all. Adding a code means adding one row.
2. **One test per code, with a real input.** Each row starts from a valid workflow and makes **one** small edit, and a first test proves the starting workflow is valid. That is how we know a failure comes from the edit and from nothing else. The test asserts the *exact* code and path, not just "it failed".
3. **Guard tests.** These tests do not test behaviour; they test the *tests*. One checks that every code in `ERROR_CODES` has a row in the table and that every row is a real code, so nobody can add a code and forget its test. Another checks that every connection rule has a matching `connection.*` code and the counts are equal. The table is also typed `Record<ErrorCode, ...>`, so the compiler rejects a missing row as well. Why both? Vitest strips types without checking them, so the runtime guard catches the omission when tests run, and the type check catches it when the project is built.

### 7. Alternatives and trade-offs

| Option | Good | Costs |
|---|---|---|
| Strings only (before T2) | Simplest | Programs must read prose; one rewording breaks consumers; no location; cannot be shared with another language |
| Throw an exception on the first error | Natural in many languages | Only one problem at a time; exceptions do not travel across languages or over HTTP; control flow gets harder to follow |
| A single numeric code (like HTTP `422` or `errno`) | Compact | Unreadable; no room for location; numbers have no namespace, so adding codes means central coordination |
| Error classes (`UnknownNodeTypeError`, ...) | Typed in-language | Do not serialise to JSON or cross to Python; adding a class per rule is heavy |
| Use a JSON Schema library's error format (for example Ajv) | Ready-made, includes a pointer | Our schema language is a small subset we control (so TypeScript and Python can agree); the library's keywords would become our public contract, and we also have rules a schema cannot express (graph cycles, connection types) |
| **`{code, path, message}` with namespaced string codes (chosen)** | Stable, readable in logs, language-neutral, carries location, easy to turn into fixtures and API bodies | We must keep the code list consistent (hence the guard tests); a code never changes meaning once released |

One more design choice: `path` is a **JSON Pointer string**, not an array of keys. A single string is easy to compare, store and show, and the standard defines the escaping. An array (as some libraries use) avoids escaping but is awkward to compare in fixtures.

### 8. Real-world applications

- **HTTP APIs.** RFC 9457 "Problem Details for HTTP APIs" standardises a JSON error body with a stable `type` and a human `detail`, plus extension fields. FastAPI (our Phase 2 backend) returns validation failures as a list of objects, each with a location (`loc`), a machine-readable `type` and a human `msg`. Our shape was chosen to map onto that naturally.
- **Compilers and linters.** Diagnostics carry a file, line and column plus a rule or error id (TypeScript's `TS2322`, ESLint's rule names). The id lets you search, suppress and count; the message tells you what happened.
- **Form libraries.** Libraries such as Zod and Ajv report problems with a field path so the UI can put the red text next to the right input.

### Two lessons from our own review (real examples)

1. **A test that did not test what its title said, caught by asserting the exact code.** The old test was titled "edges: ..., cycle". Its last check only demanded that the message match `/e4.*(cycle|already has a connection)/`, which accepts either wording. When T2 changed it to assert the exact code, it turned out the failing rule was `connection.input-occupied`, not `connection.cycle`: the edge `e4` pointed at an input that `e1` already used, and `checkConnection` checks "input occupied" **before** "cycle" because the rules run in a fixed order. So the old test never exercised a cycle. The commit adds a comment saying so, a follow-up commit renamed the test, and `errors.test.ts` now has a real cycle (two HTTP nodes feeding each other) for `connection.cycle`. Same family as the "vacuous test" in Lesson L1: a loose assertion lets the wrong thing pass.
2. **An imported key can name something JavaScript quietly gives every object.** The independent reviewer found that a setting called `constructor` (or an own `__proto__` key written in the file) slipped past the "unknown setting" check. The reason: `schema.properties[key]` is an ordinary object lookup, and for the key `"constructor"` JavaScript returns an *inherited* member of every object, which looked like "a known setting", so no error was raised. The same mistake was possible for a `schemaVersion` of `"constructor"` in `migrate.ts`. The fix is to ask for an **own** property (`Object.hasOwn(...)`) before trusting the lookup. This was found in review and fixed in a follow-up commit (`b9d136a`). A second look then found the **same bug class in the canvas**: `flowMapping.ts` stored node sizes in a plain object keyed by node id, and node ids also come from imported files, so a node id of `"constructor"` or `"__proto__"` would have returned an inherited value instead of a size. It was fixed by switching that lookup to a `Map` (`60b1609`), which has no inherited keys. It is a classic **trust-boundary bug**: file contents are untrusted, and an untrusted string used as an object key must never be allowed to reach inherited members. Task T3 carried it forward (Lesson L3): the shared fixtures include keys named `constructor`, `toString`, `hasOwnProperty`, `valueOf` and `__proto__`, so the future Python side proves the same behaviour.

### Knowledge Check / Interview Questions

*Answers are not given here. Study this lesson and `docs/LEARNING.md`, then answer all questions in the dedicated learning session at the end of the project.*

1. A teammate says: "Why not keep the error strings and just have the Python backend produce the same sentences?" Give at least two concrete reasons the `{code, path, message}` design is better, and say which part of the object each reason relies on.
2. Write the JSON Pointer for the `provider` setting of the third node in the file, and for a setting whose key is `a/b`. What does the empty string `""` point to, and which of our errors uses it?
3. The old "cycle" test never produced a cycle error. Explain exactly why, which behaviour of `checkConnection` caused it, and how asserting the exact code exposed it. What does this tell you about assertions such as "the message matches A or B"?
4. `ErrorCode` is a union built from the `ERROR_CODES` list, and `errors.test.ts` also has runtime guard tests. What does the type protect you from, what do the guard tests protect you from, and why are both needed?
5. Config keys come from an untrusted file. Explain the `constructor` bug in plain language: what did the lookup return, why was no error produced, and why is `Object.hasOwn` the fix? Name one other way to avoid the problem.
6. Compare returning `{code, path, message}` objects with throwing exceptions or using error classes for a validator that must run in both TypeScript and Python and may later produce an HTTP response. Which would you choose and why?

---

## Lesson L3: One set of test data that two programming languages must both pass

**Task:** Phase 1.1 T3 (shared JSON fixtures and the TypeScript runner), commits `e28483d` and `b299782`. **Modules:** 1 (System Architecture: a shared contract between two implementations), 3 (Workflow JSON: validation behaviour), 12 (Testing: data-driven tests, coverage guards, mutation checks).

### 1. The problem

In Lesson L2 we gave every import error a stable `code` and a `path`. That solves half of a bigger problem. The editor today is TypeScript. In Phase 2 the backend will be Python, and it must **reject exactly the same bad workflow files for exactly the same reasons**, otherwise a file the editor accepts could be refused by the server (or worse, the reverse). Two programs in two languages will never be identical, so how do you prove they agree?

If each side writes its own tests, each side tests **its own idea** of the rules. Both can be green while the two disagree. We need one shared yardstick that both must pass. That yardstick is T3: a folder of **test data** that is not tied to any language.

An honest limit, stated up front: **in Phase 1.1 only TypeScript runs these fixtures. The Python runner does not exist.** It is planned for Phase 2 (`docs/PHASE1_1_PLAN.md` section 3.2, `backend/tests/test_fixtures.py`). Until it exists and passes, nobody may claim the two sides agree. T3 builds the yardstick and proves the TypeScript side against it; it does not prove parity.

### 2. The concept

**Test data separate from test code.** A normal test mixes both: `expect(importWorkflow(text)).toBe(...)`. Here the **cases** are plain JSON files (the "data") and a small **runner** program reads them (the "code"). The technical names are **data-driven** (or table-driven, as in L2) tests and a **conformance suite**. A conformance suite is a set of cases that any implementation of a specification can run to show it follows the specification.

**A contract between two implementations (Module 1).** In Lesson L2 we said the error `code` is a contract. T3 turns the whole behaviour of validation into a contract you can run. The Workflow JSON format is the contract between editor and server; the fixtures are the **executable examples** of that contract.

**A fixture** is a ready-made input plus the result we expect. In AgentForge one fixture is one small JSON file, for example `contracts/fixtures/config/cfg-key-constructor.json`:

```json
{
  "name": "cfg-key-constructor",
  "description": "A config key named after an inherited object member (constructor) is an unknown key, not a schema property.",
  "nodeType": "output.result",
  "config": { "constructor": 1 },
  "expect": [{ "code": "schema.additionalProperties", "path": "/constructor" }]
}
```

Read it as: "if a node of type `output.result` has a setting named `constructor`, the checker must report one error, code `schema.additionalProperties`, at `/constructor`." Nothing in the file says TypeScript or Python.

**The four families** (75 case files today; counts verified in the folder):

| Folder under `contracts/fixtures/` | Cases | Question the case asks |
|---|---|---|
| `workflow/valid/` | 7 | Does this whole file import successfully (and come out unchanged)? |
| `workflow/invalid/` | 31 | Is this whole file rejected, with exactly these `{code, path}` errors? |
| `connection/` | 22 | In this small graph, may this one edge be added? If not, which rule says no? |
| `config/` | 15 | Does this one node's settings object produce exactly these schema errors? |

Two more files are not cases: `format.json` (the version of the fixture format, currently `{ "fixtureFormat": 1 }`) and `catalog/builtin.catalog.json` (a JSON export of our node catalog, explained in section 4). The format of every family is documented in `contracts/README.md`.

### 3. Why this approach (the design decisions)

1. **Test data separate from test code.** Python cannot run a TypeScript test, but it can read a JSON file. Keeping cases as data is what makes a second language possible at all.
2. **`{code, path}` is the contract, and the message text is not.** A sentence such as `nodes[1] ("l"): unknown node type mystery.node@1.` is written for people, is built differently in each language and may be reworded. The code and the path are the stable, language-neutral part (L2). So the runner **never compares the message**.
3. **Compare error lists as multisets.** A *multiset* is a list where **order does not matter but duplicates do**: `[A, B]` equals `[B, A]`, but `[A, A, B]` does not equal `[A, B]`. Why order-insensitive? The README gives one reason: JavaScript objects keep integer-like keys in a different order from Python dictionaries, so two correct implementations may list the same errors in a different order. Why count duplicates? Two errors at the same place are two facts; losing one would hide a bug.
4. **The expected results are written from the rules, not copied from what the code prints.** If you generate the "expected" file by running the code, the test can only confirm the code does what it does, which is a **circular test**: it cannot fail when the code is wrong. `contracts/README.md` says it directly: case fixtures are never generated from code and are "the independent statement of what the code must do". (The one exception, the catalog export, is generated on purpose; see the drift test below.)
5. **Strict shape checking.** Unknown fields are errors, `name` must equal the file name, error codes must be real codes, paths must be JSON Pointers. A typo in a fixture must fail loudly, not be silently ignored.
6. **Guards that protect the test suite itself** (section 4): every error code must be covered, minimum counts stop fixtures being deleted, and a drift test keeps the catalog export honest.
7. **`inputRepeat`: a tiny generator spec instead of a huge file.** One case needs a 5 MB text (the importer refuses files over a size limit). The first version committed a file of about 5 MB. The fix describes it instead: `{ "unit": " ", "times": 5000001 }` means "the text is one space repeated 5,000,001 times", which is one byte over the 5,000,000-byte limit (the first version used 5 MiB of characters; task T4a changed the limit to bytes), so it must be rejected with `doc.too-large`. The runner builds the text at test time as `prefix + unit.repeat(times) + suffix`. `times` is capped at 10,000,000 so a typo cannot allocate gigabytes. The error-cap fixture (`wf-invalid-error-cap.json`) uses the same trick to build a 23-node document.
8. **Rule order is part of the contract.** See section 4 and the review stories.

### 4. How it works internally

```mermaid
flowchart TD
  F["contracts/fixtures/**/*.json<br/>75 case files in 4 families"] --> L["loadCorpus: find every file and parse the JSON"]
  L --> S["checkShape and checkUniqueNames<br/>strict: unknown fields, names, codes, pointers"]
  S -- "any problem" --> X["test fails and names the file"]
  S -- "well-formed" --> RV["runner: workflow/valid"]
  S -- "well-formed" --> RI["runner: workflow/invalid"]
  S -- "well-formed" --> RC["runner: connection"]
  S -- "well-formed" --> RG["runner: config"]
  RV --> IMP["importWorkflow"]
  RI --> IMP
  RC --> CHK["checkConnection"]
  RG --> VAL["validateConfig"]
  IMP --> CV["valid: ok, and workflow equals the parsed input"]
  IMP --> CM["invalid: compare as multisets of code and path"]
  VAL --> CM
  CHK --> CS["connection: exact rule code or null"]
  CAT["catalog/builtin.catalog.json"] --> DR["drift test: file equals the JSON of nodeDefinitions in code"]
  FM["format.json"] --> FC["test: fixtureFormat is 1"]
  PY["Python runner<br/>(planned, Phase 2; does not exist)"] -.-> F
```

The solid arrows are built and run by `npm test`. The dashed arrow is **planned for Phase 2**.

**The loader and the shape checker.** `loadCorpus` walks `contracts/fixtures`, parses each file and calls `checkShape(file, value)`, a pure function that returns a list of problems (an empty list means the file is well-formed). `checkUniqueNames` makes sure no two files share a `name`. If anything is wrong, one test fails with the file names listed, and the malformed file is not run. The shape checker is itself tested with deliberately bad examples (the `checkShape` tests at the bottom of the same file), so it cannot quietly stop checking.

**One runner per family**, each calling the **real** production function, not a copy:

- `workflow/valid` and `workflow/invalid` call `importWorkflow(text, nodeDefinitions)`. A valid case must succeed and the imported workflow must deep-equal the parsed input (the valid files are written in canonical shape, so importing changes nothing). An invalid case must fail with the expected multiset of `{code, path}`.
- `connection` builds a small workflow from the compact description in the file (each node `{id, type}`, empty `config`, position 0,0; edges numbered `e1`, `e2`...) and calls `checkConnection`. The result is compared with the expected rule code (`connection.cycle`, ...) or `null` for "allowed". It is a single result, so no multiset is needed.
- `config` finds the latest catalog definition of the node type, calls `validateConfig`, turns each result into `{code, path}` (with `jsonPointer(key)`, a path relative to the config object) and compares as multisets. It can take the settings as text (`configText`) when the exact characters matter: a JSON parser makes an **own** `__proto__` key, but a JavaScript object literal would set the prototype instead, so the `cfg-key-proto-own` fixture states its settings as raw text.

**The guards on the suite itself**, all in `frontend/src/contracts/fixtures.test.ts`:

- **Coverage guards.** One test checks that *every* error code in `ERROR_CODES` is expected by at least one `workflow/invalid` fixture. Another checks that every `connection.*` code is the expected result of at least one `connection` fixture. Add a code and forget a fixture, and the run fails.
- **Minimum-count floors** (`MIN_COUNTS`: 75 total, 7, 31, 22, 15). Deleting fixtures to make a failure go away would shrink the counts and fail the run. The README says the floors are raised when you add cases and never lowered.
- **A drift test for the catalog.** `builtin.catalog.json` is an export of `nodeDefinitions` from `frontend/src/catalog/nodes.ts`. The test asserts the stored file equals the code's catalog, so the catalog contract cannot change silently. If you change the catalog on purpose, you regenerate the file by running the tests with the environment variable `UPDATE_FIXTURES` set. In that mode the test rewrites the file and then **fails on purpose** ("catalog fixture regenerated; unset UPDATE_FIXTURES and run again"). Why fail deliberately? If a forgotten environment variable made the test rewrite and then pass, the drift check would **pass silently forever**, because the file would always be regenerated to match the code. Failing forces you to unset it and run again, so the next run really compares.

**Rule order, pinned by fixtures.** `checkConnection` (`frontend/src/workflow/connections.ts`) returns the **first** rule that fails, in this order: `unknown-node`, `unknown-port`, `self-loop`, `duplicate`, `input-occupied`, `type-mismatch`, `cycle`. That order is observable: when a proposed edge breaks two rules at once, the first one in the list is what you see. Python has to reproduce the order, so the order is part of the contract, and fixtures that break two rules at once pin each neighbouring pair (for example `conn-input-occupied-before-type-mismatch`, `conn-type-mismatch-before-cycle`, `conn-input-occupied-before-cycle`, `conn-unknown-port-before-self-loop`).

**Import semantics a second implementation must follow.** The README lists them because they are not obvious from the data alone and the fixtures pin them. In short:

- **Edges are checked in order against the edges accepted so far**, as if each were being added. A cycle is reported on the edge that *closes* it, not on the earlier edges.
- **A rejected item is not added.** So errors can **cascade**: a node with an unknown type is rejected, so an edge that uses it also fails with `connection.unknown-node` (fixture `wf-invalid-cascade-unknown-type-edge`).
- **The second duplicate is the one blamed**: with two nodes sharing an id, the error points at the later one.
- **Document-level errors stop early.** If a top-level field such as `id` has the wrong type, only that error is returned and nodes and edges are not examined (fixture `wf-invalid-doc-error-stops-before-nodes`).
- **At most 20 errors** are returned (`MAX_ERRORS` in `frontend/src/workflow/validate.ts`); the first 20 in checking order are kept (fixture `wf-invalid-error-cap`).

**The security carry-over is enforced by fixtures too.** In L2 the reviewer found that a setting named `constructor` slipped through. Now `cfg-key-constructor`, `cfg-key-tostring`, `cfg-key-hasownproperty`, `cfg-key-valueof` and `cfg-key-proto-own` each demand `schema.additionalProperties`, and two `wf-invalid-doc-unsupported-version-*` fixtures (`constructor`, `toString`) demand `doc.unsupported-version`. The fixtures are the written, runnable form of that security rule, so the Python side will have to prove it handles the same keys when its runner exists (planned).

### 5. How it communicates with other components

- The runner **imports the real functions**: `importWorkflow` (`serialize.ts`), `checkConnection` (`connections.ts`), `validateConfig` (`configSchema.ts`), `getLatestNodeDefinition` and `nodeDefinitions` (the catalog) and `ERROR_CODES` and `jsonPointer` (`errors.ts`). It reads the fixture files with Node's `fs`. Nothing else in the app knows the fixtures exist.
- It runs as part of the normal unit tests: `cd frontend && npm test`. That is why `npm run verify` and CI include it with no extra step. The runner has its own small TypeScript project, `frontend/tsconfig.contracts.json`, so Node's types are available to this one test without leaking into the browser app's type check.
- The fixtures depend on the **error code list** (`ERROR_CODES`) and the **catalog**. Change either and the coverage guard or drift test tells you.
- **Planned, not built:** in Phase 2 a Python test (`backend/tests/test_fixtures.py` in the plan) reads the same files and runs them against the Python models. Only when that runner exists and passes can we say the two sides agree. Later tasks also add fixture families (strict parsing and canonical JSON in T4, config schema cases in T5, migration fixtures in T6, warnings in T7, secrets in T9), all following this format.

### 6. Important code paths

| Where | What it does |
|---|---|
| `contracts/README.md` | The documented format of every family, the import semantics, the multiset rule, how to add a case and why never to edit expected values just to pass |
| `contracts/fixtures/{workflow/valid,workflow/invalid,connection,config}/*.json` | The 75 cases (one per file) |
| `contracts/fixtures/catalog/builtin.catalog.json` | JSON export of `nodeDefinitions`, protected by the drift test |
| `contracts/fixtures/format.json` | `{ "fixtureFormat": 1 }`, asserted by the runner |
| `frontend/src/contracts/fixtures.test.ts` | The runner: `checkShape`, `checkUniqueNames`, `loadCorpus`, `asMultiset`, `workflowText` (builds `inputRepeat`), `connectionWorkflow`, `MIN_COUNTS`, the coverage guards, the drift test, and the tests of `checkShape` itself |
| `frontend/tsconfig.contracts.json` | A separate TypeScript project for this one test (Node types) |
| `frontend/src/workflow/connections.ts`, `validate.ts`, `serialize.ts`, `configSchema.ts` | The real code the fixtures exercise |

### 7. Alternatives and trade-offs

| Option | Good | Costs |
|---|---|---|
| Each language writes its own tests | Simple, idiomatic | Each side tests its own interpretation; green and green can still disagree. No proof of agreement |
| **Shared language-neutral data plus one runner per language (chosen)** | One yardstick for both; cases are readable data; adding a case needs no code | We must write and maintain a runner per language and a documented format; the data format must stay simple |
| Generate "expected" from the current code (snapshot or golden-output tests) | Cheap to produce, good at spotting accidental change | Circular: it records what the code does, bugs included. Good as a regression net, weak as a specification. We use it only for the catalog export, where "equals the code" is exactly the point |
| Property-based tests (generate random inputs) | Finds surprising cases | Hard to share across languages (random generators and shrinkers differ); better as an addition (the plan mentions a property-style round trip in T4) |
| Test the future Python server over HTTP from TypeScript | Tests the real integration | Needs the server running; slower; failures are harder to pin to a rule. Useful later as integration tests, not as the rule-by-rule contract |
| Keep one implementation only (call the server for validation) | No second implementation to keep in step | The editor would need the network for every check and could not validate offline or while dragging |
| Compare the exact message text | Strictest | Brittle; couples languages to wording; blocks translation |

### 8. Real-world applications

*The following are from general knowledge, not from this repository.*

- **JSON-Schema-Test-Suite.** The JSON Schema community keeps a language-neutral collection of JSON test cases that validator libraries in many languages run. It is the same idea as `contracts/`, at much larger scale.
- **Parser conformance tests.** HTML5 parser implementations are commonly checked against shared tree-construction test files (the html5lib tests), so different engines agree on how to read broken HTML.
- **API contract testing.** Teams that split a frontend and a backend (or many microservices) test against a shared written contract (for example consumer-driven contract tests) so each side can change independently without breaking the other.
- **Golden files.** Many projects store expected output in files next to the tests and compare against them. The risk is the circularity discussed above: a golden file is only as good as the review that approved it.

### Three lessons from our own review (real examples)

1. **A test suite that cannot fail proves nothing, so we tried to make it fail (mutation checks).** The implementer reported deliberately breaking `checkConnection` in four different ways and confirming that each time exactly the intended fixture failed. One break was **swapping two rules** (for example checking `cycle` before `input-occupied`). That was caught **only by a new fixture**: the existing unit tests in `connections.test.ts` did not notice. Reading that file explains why: its occupied-input test has no cycle in it, and its cycle test builds a graph where the target input is free, so neither case is "both at once" and neither can tell which rule runs first. Only a case that breaks two rules together, such as `conn-input-occupied-before-cycle` (added in the review-fix commit `b299782`), can. Lesson: a **mutation check** (change the code on purpose, expect a test to fail) is how you learn whether the tests protect what you think they protect. It is the same idea as the fault injection in Lesson L1, now applied to the fixtures. *The mutation runs themselves were reported by the implementer; this lesson's author read the fixtures and tests but did not repeat the runs.*
2. **"Is the expected value a real specification, or just a copy of what the code does?"** The independent reviewer asked exactly this about the first corpus, because expectations that were derived from the code would be a circular test. The reviewer checked a sample of expected values against the specification, and found fixtures that encoded **behaviour that is about to change**. Two are labelled in their descriptions today. `wf-invalid-schema-required.json` says it "documents CURRENT behaviour": a config missing a required key is rejected with `schema.required`, and task T5 changes this under decision D-025 (a missing required key becomes a completeness warning, not a structural import error). `wf-invalid-doc-too-large.json` documents the Phase 1 limit, counted in characters, and says task T4 changes it to a count of UTF-8 bytes. Labelling them tells the next person (and the Python implementer) that these are deliberate snapshots of today, to be updated together with the code, not eternal truths. This is also why the README insists expectations come from the rules.
3. **A 5 MB file in the repository.** The first commit (`e28483d`) stored the "too large" case as a real file of about 5 million bytes. Every clone, diff and review would carry it. The fix commit (`b299782`) replaced it with the few-line `inputRepeat` generator spec. Generate big or repetitive test data; do not store it. (`inputRepeat` itself got a safety cap and tests, so the generator cannot be misused.)

A smaller point from the same review: the first version of the `connection` format filled each node's settings from the catalog defaults, so a connection fixture would silently change if a default changed. The fix gives every node an empty `config`, because the connection rules never read settings. A fixture format should depend on as little as possible.

### Knowledge Check / Interview Questions

*Answers are not given here. Study this lesson and `docs/LEARNING.md`, then answer all questions in the dedicated learning session at the end of the project.*

1. Explain in plain words why we keep test cases as JSON files in `contracts/` instead of writing them as ordinary Vitest tests. What does that make possible in Phase 2, and what can we **not** yet claim in Phase 1.1?
2. The runner compares only `{code, path}` and treats the error list as a multiset. Give one reason for ignoring the message, one reason for ignoring the order, and one reason for still counting duplicates.
3. `checkConnection` returns the first failing rule, in a fixed order. Describe a proposed connection that breaks two rules at once, say which error is reported and why, and explain why the older unit tests could not detect two rules being swapped but a fixture could.
4. What is a circular test? Why does `contracts/README.md` forbid generating case fixtures from the code, and why is the catalog export the one deliberate exception? What does the "fail on purpose" behaviour of `UPDATE_FIXTURES` protect against?
5. A new error code is added to `ERROR_CODES` but nobody writes a fixture for it, and another developer deletes three fixtures that were failing. Which guards in the runner catch each of these, and how?
6. Describe three rules of import behaviour that a second implementation must follow beyond "return the right error for a bad input" (for example cascades, the second duplicate being blamed, early exit on document errors, the 20-error cap). For one of them, say what a Python implementer would get wrong if it were not written down and pinned by a fixture.

---

## Lesson L4: Never trust the built-in parser with a file you did not write (strict JSON parsing and the policy limits)

**Task:** Phase 1.1 T4a (strict JSON parsing, policy limits and value checks), commits `9477df7` and the review-fix commit `a0abf63`. **Modules:** 3 (Workflow JSON: parsing untrusted input), 12 (Security and Testing: trust boundaries, boundary-value tests, mutation testing), 1 (System Architecture: the limits are part of the contract).

*T4b (canonical and export JSON, repeatable text for hashing) is a separate task and is not part of this lesson.*

### 1. The problem

When you press **Import**, you give the editor a file. The editor did not write that file. It may have been edited by hand, produced by another tool, damaged in transit, or crafted on purpose to cause trouble. In security language this is **untrusted input**, and the place where it enters the program is a **trust boundary**.

Until T4a, the importer read the text with the browser's built-in `JSON.parse`. That function is fast and correct for *what it was designed to do*: turn valid JSON text into JavaScript values. But for an untrusted file it quietly does several things we do not want. I re-ran the JavaScript ones on this machine:

| Input | What `JSON.parse` does | Why it matters to AgentForge |
|---|---|---|
| `{"a":1,"a":2}` | Returns `{a: 2}`. It silently keeps the **last** duplicate | A hand-edited workflow with two `"id"` or two `"type"` keys changes meaning with no warning. Which one did the author intend? |
| `9007199254740993` | Returns `9007199254740992` (verified: it is off by one) | The number was **changed before our code ever saw it**: the exact value you wrote is gone. This is why the policy limit exists (every accepted number must be exactly representable). With that limit in place, even a check on the parsed result would still refuse this particular number; see review story 1 for what that means for the design |
| `{"__proto__": {...}}` | Creates an ordinary own property named `__proto__` (verified). It does not change a prototype | `JSON.parse` itself is safe here, but any code that copies such a key with a plain assignment (`out[key] = value`) does set a prototype (verified in Node: `Object.keys` becomes empty and the inherited property appears). A hand-written parser, or later code, can get this wrong |
| `1e400` | Returns `Infinity` (verified in the plan's table) | Infinity cannot be written back to JSON, and Python's `json` reads it differently |
| Invalid UTF-8 bytes, when you first turn the file into a string with the usual `File.text()` | The invalid bytes are replaced by the replacement character U+FFFD (the decoder behaviour I verified: a stray byte `0xFF` followed by `A` becomes the replacement character then `A`) | A damaged file would **import "successfully" with corrupted text** instead of being refused |
| Very deep nesting, or a huge file | No limit that we choose, and no structured error we control (general knowledge about engines; not verified here) | A denial-of-service shape: someone sends a file that burns memory or time |

*Verification note.* The duplicate-key, big-integer, `1e400` and `__proto__` rows come from `docs/PHASE1_1_PLAN.md` section 3.5 (the hazards table, which the plan says was verified with Node 24.13 and Python 3.14.2 side by side). I re-ran the JavaScript behaviours of the duplicate key, the big integer, `__proto__` and the replacement character on the local Node. The Python column of that table I did **not** re-run. That `File.text()` uses the lenient decoder is general knowledge about the browser API, not something I tested here.

So the problem is not only "add more checks after parsing". The duplicate-key problem **destroys information during parsing**: once the built-in parser has kept the last value, nothing after it can know there were two. The same is true of bytes already replaced by U+FFFD. You cannot validate what you can no longer see. For numbers the story is subtler (and review story 1 below is honest about it): the rounded value still shows that a number was too large, so a range check afterwards would often agree with ours, but the exact digits are gone, the range check has to be exactly right, and the plan chose to decide from the text so that the rule can be stated, and later implemented in Python, in terms of what the file says. The parser itself has to be strict.

### 2. The concept

**Trust boundary and parse, then validate.** The rule in `.claude/rules/architecture.md` is "every load goes through `migrate()` then `validate()`". T4a adds a stage in front of both: a *strict parser* that decides what the text means. The three stages are: **read the text strictly** (T4a) -> **upgrade the old format** (`migrate`) -> **check the shape** (`validate`). The first stage is where bytes become data, so it must not lose anything.

**RFC 8259** is the standard that defines JSON text. A *strict* parser accepts exactly that grammar: no comments, no trailing commas, no `NaN`, no leading zeros such as `01`, no single quotes. A **recursive descent parser** is a parser written as small functions that call each other following the grammar (a value is an object or an array or a string or a number or `true`/`false`/`null`; an object contains values; and so on). It is the simplest kind to write by hand and to read.

**Policy limits, and where each rule comes from.** The grammar says what JSON *is*. AgentForge adds rules about what it *accepts*. It matters to say honestly where each one comes from, because in an interview "the standard says so" and "we decided so" are very different statements:

| Rule | Where it comes from |
|---|---|
| Text is valid JSON; no trailing garbage | RFC 8259 (the JSON grammar) |
| Object keys unique | I-JSON (RFC 7493), which the canonical JSON standard RFC 8785 requires of its input. **We enforce it while parsing** (`doc.duplicate-key`) |
| No lone surrogates in strings | I-JSON / RFC 8785 (`value.invalid-unicode`) |
| Numbers are finite | I-JSON (`value.not-finite`) |
| **Magnitude of every number at most 2^53 - 1** (9007199254740991) | **AgentForge policy** (`value.unsafe-integer`). Not an RFC rule. It is what keeps TypeScript and Python exactly in agreement and prevents silent rounding |
| No U+0000 (the NUL character) | **AgentForge / PostgreSQL compatibility rule** (`value.nul-character`). PostgreSQL's `jsonb` cannot store it (stated in the plan; PostgreSQL is not installed here, so not verified). **Not an RFC rule** |
| Nesting at most 64 levels, root = level 1 | **AgentForge policy** (`doc.too-deep`): stack safety, and Python and JavaScript recursion limits differ |
| Size at most 5,000,000 **UTF-8 bytes** | **AgentForge policy** (`doc.too-large`) |
| One leading byte order mark tolerated and removed; invalid UTF-8 refused | **AgentForge policy** (`doc.invalid-encoding`) |

These limits were approved in decision D-026 (clarification C2 for depth and size) and the number rule was clarified in D-031 (see `docs/DECISIONS.md`).

**Two small ideas with big consequences.**

- **Reject, do not repair.** When a file breaks a rule, we return an error. We do not clamp the number, drop the duplicate or replace the bad character. Silent repair means the editor shows something the file did not say, and a later export would then differ from what the author wrote.
- **Round-trip integrity.** If the editor lets you *export* a workflow, you must always be able to *import* it again. If the importer refuses files the editor happily produces, the user can create a file that they cannot reopen. So the same limits must also apply to values typed into the editor (section 4).

### 3. Why we selected this approach

1. **Our own parser (one file, `strictJson.ts`, about 260 lines) instead of `JSON.parse` plus extra checks.** Because information is lost *during* parsing: duplicates and invalid bytes can never be recovered afterwards (section 1), and the plan wants every rule stated in terms of what the file says. The binding safeguards for T4 (decision D-026, written out in `docs/PHASE1_1_PLAN.md` section 3.5) say it plainly: `JSON.parse` followed by `Number.isSafeInteger` "is **not** acceptable, because `JSON.parse` has already lost the information".
2. **A number is judged from its text.** The parser looks at the digits of the token, not at the converted number (section 4). This is a binding safeguard in D-026, and it is also what a Python implementation will naturally do, because Python reads integers exactly. As review story 1 explains, the observable verdicts are the same as a check after conversion; the benefit is a rule that is stated, and testable, in terms of the file's own text.
3. **One rule for numbers: magnitude at most 2^53 - 1** (decision D-031). The plan first said "integers must be safe integers". D-031 restates it as one magnitude rule, which is the same restriction because every double of magnitude 2^53 or more is already a whole number, and it removes the need to ask "is `1.0` or `1e2` an integer?" The rule applies to every number whatever its spelling, so `0.1` and `5e-324` are fine, and `1e21` and `9007199254740992` are not.
4. **Bytes, not characters, for size.** A limit is only a limit if it measures what is stored and sent. The letter `e` with an accent is one character but two bytes in UTF-8; an emoji is two JavaScript "characters" (a surrogate pair) but four bytes. A limit counted in characters would let a file of roughly twice the intended size through.
5. **Return the first problem as data, never throw.** `strictParse` returns `{ ok: true, value }` or `{ ok: false, error }` where the error is the same `{code, path, message}` shape from Lesson L2. The importer then returns the list of errors the toolbar already knows how to show. A parser that threw would need a try/catch at every caller.
6. **Same rules for typed values.** One shared module, `valuePolicy.ts`, so there is one definition of "allowed value".
7. **Do not add a library.** The architecture rules (`CLAUDE.md` section 4 and `.claude/rules/architecture.md`) require approval for any new major dependency, the Python side needs the same behaviour anyway, and 260 lines are small enough to be tested exhaustively (section 6 and the review stories).

### 4. How it works internally

```mermaid
flowchart TD
  FILE["File chosen in the browser"] --> T1{"Toolbar.tsx: file.size over 5,000,000?"}
  T1 -- yes --> E1["doc.too-large<br/>refused before the file is read into memory"]
  T1 -- no --> RB["file.arrayBuffer() becomes a Uint8Array"]
  RB --> IW["importWorkflow(bytes) in serialize.ts"]
  IW --> S2{"byteLength over 5,000,000?"}
  S2 -- yes --> E1
  S2 -- no --> BOM{"first 3 bytes are EF BB BF?"}
  BOM -- yes --> STRIP["drop those 3 bytes, once"]
  BOM -- no --> DEC
  STRIP --> DEC["TextDecoder utf-8 with fatal = true"]
  DEC -- "invalid UTF-8" --> E2["doc.invalid-encoding"]
  DEC -- "text" --> SP["strictParse(text) in strictJson.ts"]
  SP -- "grammar problem" --> E3["doc.not-json"]
  SP -- "container opens at depth 65" --> E4["doc.too-deep"]
  SP -- "same decoded key twice" --> E5["doc.duplicate-key"]
  SP -- "NUL in a string or key" --> E6["value.nul-character"]
  SP -- "lone surrogate" --> E7["value.invalid-unicode"]
  SP -- "magnitude 2^53 or more" --> E8["value.unsafe-integer"]
  SP -- "beyond the double range" --> E9["value.not-finite"]
  SP -- "value" --> MG["migrate(value)"]
  MG -- "not an object, or unsupported version" --> E10["doc.not-object or doc.unsupported-version"]
  MG -- "upgraded document" --> VL["validateWorkflow(doc, catalog)"]
  VL -- "problems" --> E11["list of errors (at most 20)"]
  VL -- "clean" --> OK["Workflow, then store.loadWorkflow in Toolbar.tsx"]
  E2 --> ALERT["import alert panel: code, shortened message, path"]
  E3 --> ALERT
  E4 --> ALERT
  E5 --> ALERT
  E6 --> ALERT
  E7 --> ALERT
  E8 --> ALERT
  E9 --> ALERT
  E10 --> ALERT
  E11 --> ALERT
  E1 --> ALERT
```

Every box on the left is a place where the file can be refused, and every refusal is the same shape: `{code, path, message}`. Nothing in this chain throws to the user. The current graph is replaced only on the final `OK` box.

**Step 1: size, in bytes, twice.** `frontend/src/app/Toolbar.tsx` first compares `file.size` with `MAX_IMPORT_BYTES` (5,000,000, defined in `serialize.ts`), so an oversized file is refused **before it is read into memory**. `importWorkflow` checks again on the bytes (and for plain strings, which the tests and fixtures use, `utf8Length` counts the UTF-8 size without encoding a copy, and stops counting once the limit is passed). A lone surrogate counts as 3 bytes because that is what encoding it to UTF-8 would produce (U+FFFD). The checks are repeated on purpose: the function is the real defence and must not rely on its caller.

**Step 2: encoding.** If the first three bytes are EF BB BF, that is a **byte order mark** (BOM), an invisible marker some editors, notably on Windows, put at the start of a UTF-8 file. We drop exactly one. Then `TextDecoder('utf-8', { fatal: true, ignoreBOM: true })` turns bytes into text. `fatal: true` is the important part: instead of silently inventing replacement characters, it throws, and we turn that into `doc.invalid-encoding`. (`ignoreBOM: true` only means the decoder keeps a BOM so that we, not the decoder, decide to strip one; a second BOM is then ordinary content and gets a normal `doc.not-json`. The fixture `wf-invalid-bom-twice` pins this.)

**Step 3: `strictParse`.** It keeps a position `pos` in the text and a `path` stack that always holds the location of whatever it is reading (the segments become the JSON Pointer in the error, using `jsonPointer` from `errors.ts`). It reads one value at a time:

- **Strings** are decoded (escapes resolved) first, and **then** checked: the check `stringProblem` in `valuePolicy.ts` looks at the *decoded* text for U+0000 and for lone surrogates. Checking after decoding means it does not matter how the character was spelled in the file. A key written as the letter `a` and the same key written with the six-character escape for `a` (backslash, u, 0, 0, 6, 1) are the same key, so they count as a duplicate. Likewise a NUL written as an escape is caught.
- **Numbers** go through `classifyNumber(token)`. Let me explain it with an example. The token `9007199254740993` is split into its digit string and exponent. The code works out `mag`, the number of digits in the integer part (here 16). If `mag` is 17 or more, the value is at least 10^16, which is above 2^53, so it is too big. If `mag` is 15 or less, it is below 2^53. If it is exactly 16, it compares the first 16 digits **as text** with `'9007199254740992'` (2^53 written out); two digit strings of the same length compare correctly as text. `9007199254740993` is not below `...992`, so the verdict is `value.unsafe-integer`. Only afterwards is the token converted with `Number(token)`: to tell "too big but finite" (`value.unsafe-integer`) from "beyond the double range" (`1e400`, `value.not-finite`), and as a backstop for the odd token such as `9007199254740991.7` whose text is below 2^53 but whose nearest double is exactly 2^53. Absurd exponent text such as `1e999999999999999999999` is capped so the arithmetic cannot misbehave.
- **Depth** is passed down as a counter. `enter(depth)` runs when a `[` or `{` opens and rejects the 65th level **before reading anything inside it**, so a file made of 200,000 opening brackets is refused at once without a stack overflow (a test does exactly this).
- **Duplicate keys.** Each object keeps a `Set` of the keys seen so far (after decoding). The second occurrence stops the parse with `doc.duplicate-key`, and the path points at the second occurrence.
- **Building the object.** Each member is added with `Object.defineProperty`, not with `out[key] = value`. A plain assignment to a key named `__proto__` changes the object's prototype (I verified this on Node); `defineProperty` always creates an ordinary property. So `__proto__` is just a key. A test checks that after parsing such a document, `({}).polluted` is still undefined.
- **First problem only.** A private `Stop` exception unwinds the recursion when something is wrong, and `strictParse` catches it at the top and returns it as a result. The whole function is wrapped, so even an unexpected failure becomes a `doc.not-json` result and not a crash.

**Step 4: message safety.** Error messages can contain attacker-chosen text (an object key). Before the review fix, the duplicate-key message echoed the key whole, so a 2,000,000-character key produced a 2,000,000-character error message pushed into the page. Now the message uses `shorten(...)` at 100 characters (`MAX_ECHO`), while the machine-readable `path` stays exact because it is a contract value (Lesson L2). The import alert panel in `Toolbar.tsx` also cuts any message or path to 200 characters for display, using `frontend/src/app/shorten.ts`, which never cuts a surrogate pair in half.

**Step 5: values typed in the editor.** `valuePolicy.ts` exports `findPolicyViolations(value, baseDepth)`, which walks an **already parsed value** and applies the same rules (finite numbers, magnitude at most 2^53 - 1, no NUL, no lone surrogates, depth). `parseConfigInput` in `frontend/src/workflow/configSchema.ts` calls it after the ordinary schema check, and refuses to commit a value the importer would reject. A config object sits at depth 5 in the document (Workflow = 1, nodes = 2, node = 3, config = 4, the typed object = 5), so the constant `CONFIG_PARENT_DEPTH` is 4, and a typed JSON object can nest 60 levels before it would break the limit of 64 (the tests check 60 accepted and 61 rejected). A test, "round trip: the deepest value the panel accepts survives export then import", pins the promise. An honest detail: for an object-typed setting `parseConfigInput` still reads what you typed with `JSON.parse`, because this is the user's own text in a form, not an imported file; the safety comes from checking the resulting **value**, which is exactly what would be exported. The "no `JSON.parse(`" guard test (section 6) covers the four import-path files, not this one.

### 5. How it communicates with other components

- **`Toolbar.tsx` -> `importWorkflow`.** The toolbar hands over bytes (`new Uint8Array(await file.arrayBuffer())`) and shows the list of errors. Only a fully valid result calls `useEditorStore.getState().loadWorkflow(...)`; a rejected file leaves the current graph untouched (an end-to-end test checks this for a duplicate key).
- **`importWorkflow` -> `strictParse` -> `migrate` -> `validateWorkflow`.** The three-stage rule from the architecture rules. Because all three return the same error shape, the code that shows errors does not care which stage failed.
- **`strictJson.ts` <-> `valuePolicy.ts` <-> `errors.ts`.** The parser imports the limits and messages from `valuePolicy.ts`, and `jsonPointer` and the error types from `errors.ts`. Seven new error codes (30 in `ERROR_CODES` now): `doc.too-deep`, `doc.duplicate-key`, `doc.invalid-encoding`, `value.not-finite`, `value.unsafe-integer`, `value.invalid-unicode`, `value.nul-character`.
- **`ConfigPanel.tsx` -> `parseConfigInput` -> `findPolicyViolations`.** The settings form calls the same policy on typed values.
- **The shared fixtures (Lesson L3).** The runner `frontend/src/contracts/fixtures.test.ts` feeds the fixtures to `importWorkflow`. A new fixture field, `inputBytesBase64`, carries raw bytes (for invalid UTF-8 and BOM cases), because text cannot express them. There are now **153 case files** (valid 19, invalid 97, connection 22, config 15; I counted the folders) and the runner's minimum-count floor is 153. `contracts/README.md` documents every rule above "for a second implementation".
- **Planned, not built: Python.** The README states: "TypeScript runs these fixtures only; no Python parity is claimed until a Python runner exists." The plan's section 3.5 describes how Python would do it (`json.loads` with a hook that rejects duplicates, plus an iterative walk), but none of that exists. The plan's hazards table is the checklist for that future work.

### 6. Important code paths

| Where | What it does |
|---|---|
| `frontend/src/workflow/strictJson.ts` | `strictParse(text)`: the parser. `classifyNumber(token)`: the number verdict from text. Private helpers `parseString`, `parseNumber`, `parseObject`, `parseArray`, `enter` (depth), `shorten` (bounded echo), `Stop` (first problem) |
| `frontend/src/workflow/valuePolicy.ts` | `MAX_DEPTH` (64), `MAX_SAFE_MAGNITUDE` (2^53 - 1), `POLICY_MESSAGES`, `stringProblem` (NUL and lone surrogates), `findPolicyViolations` (the same rules on a parsed value; at most 20 findings; never descends past the depth limit) |
| `frontend/src/workflow/serialize.ts` | `importWorkflow(input: string or Uint8Array, catalog)`: size, BOM, strict decode, then the three stages. `MAX_IMPORT_BYTES`, `importTooLarge`, `utf8Length` |
| `frontend/src/app/Toolbar.tsx`, `frontend/src/app/shorten.ts` | Reads the file as bytes, refuses oversize files before reading, shows errors with shortened text |
| `frontend/src/workflow/configSchema.ts` | `parseConfigInput`: schema check, then `findPolicyViolations` with `CONFIG_PARENT_DEPTH` = 4 |
| `frontend/src/workflow/strictJson.test.ts` | Grammar accepted and rejected; duplicate keys; the 64 versus 65 depth boundary; string policy; the number boundary list; safe `__proto__`; a differential test (400 seeded random documents must parse to exactly what `JSON.parse` returns, for valid input); every-prefix and random-garbage "never throws" tests |
| `frontend/src/workflow/serialize.test.ts` | The size boundary in bytes (including 2,500,001 two-byte characters); BOM; invalid UTF-8; truncating a valid file at every byte; and a **guard test** that fails if the text `JSON.parse(` appears in `serialize.ts`, `strictJson.ts`, `migrate.ts` or `validate.ts` |
| `frontend/src/workflow/valuePolicy.test.ts` | The policy on typed values, and the round-trip test |
| `contracts/fixtures/workflow/{valid,invalid}/` | Boundary pairs: depth 64 valid and 65 invalid (arrays and objects), `...991` valid and `...992` invalid, exactly 5,000,000 bytes valid-size and one more too large, 2,500,000 versus 2,500,001 two-byte characters, BOM once versus twice, four invalid UTF-8 shapes |
| `contracts/README.md` | The parsing and policy rules written for a second implementation |

**The testing ideas worth knowing** (Module 12):

- **Boundary-value tests.** Bugs live at the edges, so the tests come in pairs on each side of every limit: 64 and 65 levels deep, `9007199254740991` and `9007199254740992`, 5,000,000 and 5,000,001 bytes. A limit tested only at one side could be off by one without anyone noticing.
- **Bytes versus characters, proved by a test.** 2,500,001 copies of the two-byte character is 5,000,002 bytes but only 2,500,001 characters, so it must be refused even though it is "less than 5,000,000 characters". The twin case with 2,500,000 copies is exactly at the limit and must be accepted as far as size goes (it then fails as not JSON, a different error, which is how the test shows the size check passed).
- **Differential testing.** Run two implementations on the same input and compare. For input that is valid and has no duplicates, our parser must give exactly what `JSON.parse` gives (including negative zero and the order of integer-like keys). Where we are **intentionally different** (duplicates, big numbers) the tests state the difference explicitly instead.
- **Never-throws tests.** Cut a valid document at every possible length, and feed 2,000 strings of random JSON-ish characters; the parser must always return a structured result with a known error code.

### 7. Alternatives and trade-offs

| Option | Good | Costs |
|---|---|---|
| **`JSON.parse`, then check the result** | One line, fast, already trusted | Cannot see duplicates (collapsed) or invalid bytes (already replaced), and no control over depth or error shape. For numbers a range check afterwards can work (story 1), but only if written exactly right |
| **`JSON.parse` with a reviver function** | Lets you inspect each value as it is built | The reviver runs after the values were converted and after duplicates collapsed, so it sees the same damaged data |
| **A third-party strict JSON library** | Less code to write and own | A new dependency that needs approval (`CLAUDE.md` section 4); we would still need Python to behave identically; harder to add our exact policy limits; the dependency is another supply-chain risk (compare the SHA pinning in Lesson L1) |
| **A schema-validation library (for example JSON Schema validators)** | Good for *shape* | Works on parsed data, so it does not solve the loss during parsing; we already use a small documented subset of JSON Schema for settings (Lesson L2), and the plan keeps that decision |
| **A streaming parser** | Handles files too large for memory | We cap files at 5,000,000 bytes, so memory is not the problem. More complex, and the rules above (duplicates, depth) still have to be coded |
| **Arbitrary-precision numbers (accept `9007199254740993` exactly using `BigInt`)** | No loss at all | TypeScript and Python would need to agree on a number model across the editor, the engine and PostgreSQL; the plan chose a smaller, safer limit instead |
| **Clamp or normalise instead of rejecting** (cut the number, drop the second key, fix the Unicode) | Fewer user-facing errors | The editor shows something the file never said; hashing and comparing files becomes unreliable; and different implementations repair differently. The design rejects with a precise code and path |
| **Count the size in characters** | Easy (`text.length`) | The same file means different sizes in different languages (JavaScript counts UTF-16 units, Python counts code points), and the stored size is bytes. Bytes are the only unit all sides agree on |

### 8. Real-world applications

*The following are from general knowledge, not from this repository.*

- **Parser differentials.** Security write-ups on JSON have shown that different parsers disagree about duplicate keys, big numbers, comments and strange Unicode. When a gateway checks a request with one parser and the backend acts on it with another, an attacker can send a document that the first reads as harmless and the second as harmful. The usual defence is the one used here: one strict parser at the boundary, and a documented policy.
- **Prototype pollution.** A long list of JavaScript library vulnerabilities came from merging untrusted objects with keys such as `__proto__` into other objects. Creating properties explicitly, and checking own properties, are standard defences (the same idea as the own-property lookups in Lesson L2).
- **I-JSON (RFC 7493).** A profile of JSON for protocols that need interoperability: unique keys, valid Unicode, numbers within double range. JSON canonicalization (RFC 8785, which T4b will use) assumes its input obeys it.
- **Big identifiers.** Services whose numeric ids exceed 2^53 have had to send them as strings so that JavaScript clients do not round them. Our safe-integer magnitude rule exists for the same reason.
- **Input limits.** Size, depth and time limits on parsers are a standard defence against denial of service by deeply nested or enormous documents.
- **Mutation testing tools** (for example Stryker for JavaScript) automate the idea used in our review.

### Three lessons from our own review (real examples)

1. **An "equivalent mutant": when you cannot write a test that fails, say so.** In **mutation testing** you change the code on purpose (a *mutant*) and check that some test fails. If no test fails, either the tests have a gap, or the mutant behaves *identically* to the original (an **equivalent mutant**), in which case no test could ever tell them apart. The mutation test run during the review found this for the number check. Our code decides the range from the token text, and a mutant that decided only after conversion (`Number(token)`, then compare with 2^53 - 1) survived. The reason is rounding. Converting text to the nearest double never moves a value across 2^53 (that number is exactly representable and rounding is monotonic): anything that is 2^53 or more in the text converts to a double of 2^53 or more, and a token just below it, such as `9007199254740991.7`, rounds **up to** exactly 2^53, which the post-conversion check also rejects. The comment in `classifyNumber` and the test comment in `strictJson.test.ts` both say the two approaches give the same verdicts. So the honest response was to **record the equivalent mutant and not to invent a fake test** that pretends to distinguish them. The code stays written from the text because the binding safeguard says so (D-026 final authorization, item 1, recorded in `docs/PHASE1_1_PLAN.md` section 3.5) and because it states the intent; the real protection is that the mutation that *does* matter, `JSON.parse` followed by `Number.isSafeInteger`, is caught by many tests. (That version would, for one thing, refuse `0.5`, because `Number.isSafeInteger(0.5)` is false; the accepted-number tests and fixtures with fractions and exponents fail under it.) *This story is from the review as reported to me; the review record is not yet in `docs/DEVELOPMENT_LOG.md` at the time of writing, and I did not repeat the mutation run. I did verify the reasoning on the local Node: `9007199254740991.7` converts to exactly 2^53 and `9007199254740991.3` to 2^53 - 1.*
2. **A test that was empty for tool reasons.** A test claimed to cover a lone surrogate in the size check, but the file-writing tool had converted the escape into the ordinary replacement character, so the test was checking something else entirely. The fix builds the character at run time. In `frontend/src/workflow/serialize.test.ts` you can see `const lone = String.fromCharCode(0xd800)` with a comment that a lone surrogate "cannot be stored in a UTF-8 source file", and the at-limit case (1,666,666 of them at 3 bytes each is 4,999,998 bytes; at 4 bytes each it would be over) is the one that tells 3 from 4. Lesson: a test can be **vacuous** (unable to fail) because of your tools, not only because of its logic. The review-fix commit also removed invisible characters from the source and builds the byte order mark with `String.fromCharCode(0xfeff)`; the repository's `implementer.md` now records this tool hazard. Fault injection (Lesson L1) is how you find such tests: break the code and see whether the test notices.
3. **Do not echo attacker-controlled text without a bound.** The first version of the duplicate-key message included the whole key. A 2,000,000-character key therefore became a 2,000,000-character message in the UI: the importer was refusing a hostile file and being harmed by the refusal. The fix (commit `a0abf63`): the message echoes at most 100 characters, the `path` stays exact, and the alert panel shortens anything over 200 characters. A test builds the 2,000,000-character key and asserts the message is at most 150 characters but the path is exact; a second assertion shows a key at the cut-off is echoed whole. Lesson: **error handling is part of the attack surface**.

### Knowledge Check / Interview Questions

*Answers are not given here. Study this lesson and `docs/LEARNING.md`, then answer all questions in the dedicated learning session at the end of the project.*

1. A colleague says "we can just call `JSON.parse` and then check each number and each key". Name two kinds of problem for which that design fails outright because the evidence is gone before the check runs, and one kind of number for which the post-conversion check would give the same verdict as ours. Then explain, using `9007199254740993`, `9007199254740991.7` and `0.5`, what the mutation test of the review taught us about "decide from the token text, then convert".
2. List the policy limits of the import path. For each, say whether it comes from an RFC, from I-JSON or RFC 8785, from AgentForge policy, or from PostgreSQL compatibility, and why it is important to be accurate about the source when you present this to an engineer who knows JSON well.
3. Why is the size limit counted in UTF-8 bytes and not in characters? Describe the two test cases (with 2,500,000 and 2,500,001 two-byte characters) and say what each proves, including why the 2,500,000 case still fails and why that failure is the right one.
4. The importer decodes the file with a *fatal* UTF-8 decoder and strips one byte order mark. What would happen to a damaged file if it used the default lenient decoding, and what would happen to a file that begins with two byte order marks? Where in the code and fixtures are these decisions pinned?
5. Walk through what happens when a user types a deeply nested JSON object or the number `9007199254740993` into a node's settings panel. Why must the editor obey the same limits as the importer (round-trip integrity), what does `CONFIG_PARENT_DEPTH` represent, and which part of that path still uses `JSON.parse` and why is it acceptable there?
6. Our review found an equivalent mutant, a vacuous surrogate test and an unbounded error message. For each, state in your own words what went wrong, how it was detected, and what the response was. Then explain why, for the equivalent mutant, "write a test that tells them apart" would have been the wrong response.

---

## Lesson L5: The same workflow, the same bytes, everywhere (canonical JSON, export JSON and the export guard)

**Task:** Phase 1.1 T4b (canonical compact JSON, pretty export JSON, the export guard and the serialization fixtures), commit `dd33e84`, plus its review-fix commit `d2ef493`. **Modules:** 3 (Workflow JSON: canonical form, deterministic output, round trip), 1 (System Architecture: one contract across languages and storage), 12 (Security, Testing and Deployment: golden files, property-based testing against an independent reference, mutation testing, equivalent mutants).

*Status of the code described here.* This lesson describes the code as of commit `d2ef493`, which is the follow-up to `dd33e84`. The independent review of `dd33e84` found two real problems (story 2 below); `d2ef493` fixes them, and this lesson describes the fixed code. Where the lesson says what `dd33e84` alone did, it says so. **What I verified myself:** I read `git show d2ef493`, the current `serialize.ts`, `errors.ts`, `strictJson.ts`, `configSchema.ts` and the new tests, and I ran `npm test` in `frontend/` (707 unit tests passed). **What I did not run:** the 30 browser (Playwright) tests (I counted the `test(` calls in `frontend/e2e/`: 30, but did not execute them) and the mutation checks (those are the implementer's and reviewer's reports, repeated here as reports).

### 1. The problem

Imagine two people each write down the same shopping list. One writes the items alphabetically, one in the order they thought of them; one writes "1.0 kg", the other "1 kg". Both lists mean the same thing, but if you compare them letter by letter, or compute a **fingerprint** (a hash) of each, they differ. A hash is a short code computed from the exact bytes of some data: change one byte and the fingerprint changes completely.

AgentForge will want fingerprints of workflows (to detect "nothing actually changed, do not save a new version", for caching, and later for version identity). That only works if **the same workflow always becomes exactly the same bytes**, whichever program wrote them. The workflow will be handled by three different systems: the TypeScript editor today, a Python backend (planned, Phase 2) and the PostgreSQL database (planned, Phase 2). The trouble is that they disagree about small things. I ran these on this machine (Node v24.13.0 and Python 3.14.2, the versions named in `docs/PHASE1_1_PLAN.md` section 3.5):

| Case | JavaScript | Python | Why it matters |
|---|---|---|---|
| An object with keys `"10"`, `"9"`, `"a"` | `Object.keys` lists `9, 10, a` (verified), and `JSON.stringify` writes them in that order | `json.dumps(..., sort_keys=True)` writes `10, 9, a` (verified) | Two languages sorting "the same" keys produce different text |
| Two keys: U+E000 and U+1F600 (the grinning-face emoji) | Default sort puts the emoji **first** (verified) | Default sort puts U+E000 **first** (verified) | The emoji is stored in UTF-16 as two code units that begin with D83D, which is smaller than E000. Python compares whole code points, where 1F600 is larger than E000. A Python writer must sort by UTF-16 code units. Encoding each key as `utf-16-be` before sorting restores the JavaScript order (verified) |
| The numbers one, minus zero, 0.00001, 0.000001, 0.0000001 | `1`, `0`, `0.00001`, `0.000001`, `1e-7` (verified via `String(n)`) | `repr` gives `1.0`, `-0.0`, `1e-05`, `1e-06`, `1e-07` (verified) | Same number, different text. Python pads the exponent and switches to exponent form earlier |
| `{"a":1,"a":2}` | Last value wins, silently | Last value wins, silently (both verified) | Handled at parse time since T4a (Lesson L4) |
| `1e400`, `NaN` | `JSON.parse` gives `Infinity`, and refuses `NaN` | `json.loads` gives `inf` and **accepts** `NaN` (verified) | Handled by the policy (finite numbers only) |
| A lone surrogate (half of an emoji) | `JSON.stringify` escapes it | Writing it as UTF-8 raises `UnicodeEncodeError` (verified) | Refused up front |

The PostgreSQL row is **not verified**, because PostgreSQL is not installed in this repository: the plan and `contracts/CANONICAL_JSON.md` document that its `jsonb` type does **not** keep key order, collapses duplicate keys, and stores numbers as `numeric`. That is why the database can never be the canonical form (see section 3).

And what did we have **before** T4b? `serializeWorkflow` in `frontend/src/workflow/serialize.ts` copied the known fields into a new object in a hand-written order (visible with `git show dd33e84^:frontend/src/workflow/serialize.ts`) and called `JSON.stringify(..., null, 2)`. That gave stable output only by accident: the top-level order was whatever the code listed, and `config` and `metadata` (user-typed settings) were written in whatever order their keys had been inserted. Nothing wrote down the rules, and nothing could be shared with another language.

### 2. The concept

**Canonical form (canonicalization).** A single agreed way to write a piece of data as text, so equal data gives equal text. **Deterministic serialization** means the same input always gives the same output. The relevant standard is **RFC 8785, the JSON Canonicalization Scheme (JCS)**. It defines: sort object keys by UTF-16 code units, write numbers the way ECMAScript's number-to-string does, write strings with a fixed set of escapes, and use no whitespace. (I read these rules as summarized in `contracts/CANONICAL_JSON.md` and the plan; I did not open the RFC itself in this session.)

**Two profiles, not one.** AgentForge names two text forms and keeps them separate:

| Profile | Function | Layout | Job |
|---|---|---|---|
| `canonical-json/1` | `canonicalCompact` | compact, no whitespace at all, no trailing LF | **The form meant for hashing**, ETags, equality and no-op detection. Never shown to people, never written to a file |
| `export-json/1` | `exportPretty` | 2-space indent, `": "` after a key, one item per line, empty `{}` and `[]` inline, LF line ends, exactly one trailing LF | Human-readable `.json` files you download. **Never hashed** |

Both live in `frontend/src/workflow/canonicalJson.ts` and share one function, so they have the same key order, number text and string escapes by construction. **Important honesty point:** no hashing code exists yet. Hashing is Phase 2 (planned: SHA-256 of the compact UTF-8 bytes, see `docs/PHASE1_1_PLAN.md` section 3.5). T4b only builds the two text profiles.

**Round trip and idempotence.** Two properties are the heart of the task. **Idempotent:** exporting, importing and exporting again gives byte-identical text. **Stable canonical form:** the compact form of the re-imported export equals the compact form of the original. These are the promises the tests check.

**Rules and where each one comes from.** As in Lesson L4, it matters to say honestly whether a rule is a standard or our own decision:

| Rule | Source |
|---|---|
| Keys sorted at every level by UTF-16 code unit order; array order kept | RFC 8785 (arrays: JSON semantics too) |
| Numbers written by ECMAScript number-to-string (shortest digits that read back the same; minus zero writes `0`; `1.0` writes `1`; `1e2` writes `100`; `0.000001` stays decimal; `0.0000001` writes `1e-7`) | RFC 8785 |
| Strings escape only: quote, backslash, `b t n f r` short forms, other controls below U+0020 as a six-character escape with **lowercase** hex. Slash, U+007F, U+2028, U+2029, U+FEFF and all non-ASCII stay literal | RFC 8785 |
| Keys unique; no lone surrogates; numbers finite | I-JSON (RFC 7493), which JCS requires of its input; we enforce uniqueness at parse time (Lesson L4) |
| **Magnitude of every number at most 2^53 - 1** | **AgentForge policy**, not an RFC 8785 rule |
| **No U+0000 anywhere in strings or keys** | **AgentForge / PostgreSQL `jsonb` compatibility rule**, not an RFC 8785 rule (PostgreSQL cannot store NUL; documented, not verified here) |
| Depth at most 64 (root is 1); size at most 5,000,000 UTF-8 bytes | AgentForge policy |
| No Unicode normalization (an e with an acute accent and an `e` followed by U+0301 are different) | AgentForge policy |
| The export **layout** (indent, `": "`, trailing LF) | AgentForge's own profile. RFC 8785 describes only the compact form (my understanding from general knowledge; `export-json/1` is an AgentForge name, not a standard) |

### 3. Why we selected this approach

1. **Two profiles, one function.** If you hash the pretty form, then any future tweak to the layout (indent width, a trailing newline, Windows line ends) changes every hash. Keeping hashing on the compact form and files on the pretty form means each can be tuned for its own job. The pretty form follows the compact form's rules, so a person reading the file sees the same content that gets hashed.
2. **Write the text directly. Do not rebuild an object and call `JSON.stringify`.** A JavaScript object lists integer-like keys first, in numeric order, whatever order you insert them in. So no amount of preparation can make `JSON.stringify` write `"10"` before `"9"`. I verified that even a "sorting replacer" function (the usual trick) still produces `9, 10, a`. `canonicalJson.ts` instead builds an array of text pieces and sorts the **key list** itself.
3. **Sort with the default `Array.prototype.sort()` on strings.** In JavaScript that compares UTF-16 code units, which is exactly the JCS order, so the code is one call: `Object.keys(v).sort()`. The fixtures (including the emoji versus U+E000 pair) pin it, so a later "improvement" to locale-aware or code-point sorting fails a test.
4. **Numbers with `String(value)`.** JavaScript already implements the ECMAScript algorithm, so we do not write a formatter. The Python side will need its own (its `repr` differs, see section 1).
5. **`JSON.stringify` on one string at a time for escapes.** For a single well-formed string it produces exactly the JCS escape set, so we reuse it. Lone surrogates and NUL are refused **before** it is called, so it never sees an ill-formed string. I verified that its output for the controls 0x01 and 0x1f uses lowercase hex.
6. **Refuse what is not JSON data.** The writers throw for `undefined`, functions, symbols, bigints, `Map`, `Set`, `Date`, class instances, circular structures, depth over 64, non-finite numbers, numbers beyond the safe range, and NUL or lone surrogates. A serializer that silently skips or converts these (as `JSON.stringify` does for `undefined` and `Date`) would produce text that is not the data you gave it.
7. **A guard before writing the file.** The promise "if the editor lets you export it, you can import it again" (round-trip integrity from Lesson L4) needs a check on the exporting side too. `exportWorkflowText` checks the same policy and the same size limit the importer will apply, **before** any file exists. It also **never throws**: a button handler that throws shows the user nothing, so every failure becomes a structured error. Two design choices came from the review: it projects to the known fields first (what is not written cannot block or leak), and it catches the writer's refusal of non-JSON data. The low-level `serializeWorkflow` is left throwing on purpose, so a programming error is loud there and only the UI-facing guard converts it.
8. **No library.** The two writers are about 100 lines in one file. A published JCS library might exist for each language (general knowledge; not evaluated here), but we still need our own policy rules, a second implementation proven against the same fixtures, and `CLAUDE.md` section 4 requires approval for new dependencies.
9. **Accept a one-time change in exported bytes, and do not bump `schemaVersion`.** Files exported before T4b listed `schemaVersion` first; now the top level is alphabetical (`description, edges, id, metadata, name, nodes, schemaVersion`), and every nested key is sorted too. Old files still import. The data model did not change, only how it is written as text, so no version bump is needed (`contracts/CANONICAL_JSON.md`, "The one-time export byte change"; the test "a Phase 1 export (schemaVersion first) still imports and is re-exported in the new order" in `serialize.test.ts` pins it).

### 4. How it works internally

**The writer** is one private function, `write(value, pretty)` in `frontend/src/workflow/canonicalJson.ts`, and the two public functions are one line each: `canonicalCompact` calls `write(value, false)`; `exportPretty` calls `write(value, true)` and appends one LF. It walks the value recursively and appends text pieces to an array that is joined at the end:

- **A string** (and each key): `stringProblem` (from `valuePolicy.ts`, Lesson L4) rejects NUL and lone surrogates; otherwise `JSON.stringify(s)` produces the quoted, escaped text.
- **A number:** refuse if not finite or if its magnitude is above 2^53 - 1; otherwise `String(v)`.
- **A container:** refuse if it is a class instance, `Map` and so on (only arrays and plain objects, including `Object.create(null)`, are accepted), if the same container is already being written higher up (a cycle, tracked in a set of "ancestors"), or if the depth would exceed 64. An empty `{}` or `[]` is written inline in both profiles. Otherwise the object's own keys are sorted and each member is written as key, colon (with one space after it in the pretty profile), value. Pretty layout adds a newline plus two spaces per depth before every item and before the closing bracket.
- **Failures** throw an `Error` whose message names the problem and the JSON Pointer (Lesson L2), for example "Cannot write JSON: a number that is not finite (NaN) at /n".

Only own, enumerable **string** keys are written. A key named `__proto__` is just a key (the property test and fixtures include it). A symbol-keyed property is ignored (a test pins this).

**The data flow of one export click**, from the store to the file:

```mermaid
flowchart TD
  ST["Editor store: the Workflow in memory"] --> TB["Toolbar.tsx onExport"]
  TB --> EWT["exportWorkflowText in serialize.ts"]
  EWT --> PROJ["projectWorkflow: copy only the known Workflow fields<br/>(config and metadata kept as they are)"]
  PROJ --> POL{"findPolicyViolations over the projected workflow:<br/>name, labels, config, metadata, positions<br/>(NUL, lone surrogate, not finite, over 2^53 - 1, depth over 64)"}
  POL -- "violations" --> FAIL["errors: code + JSON Pointer path<br/>Toolbar shows: Export failed. No file was created."]
  POL -- "clean" --> WR["exportPretty in canonicalJson.ts:<br/>sort keys explicitly by UTF-16 code units,<br/>write the text directly, 2-space layout, one trailing LF"]
  WR -- "value that is not JSON data: the writer throws,<br/>the try/catch in exportWorkflowText catches it" --> NJD["one error: value.not-json-data<br/>(export-only code, path from the writer's text)"]
  NJD --> FAIL
  WR --> SZ{"UTF-8 length of the text over 5,000,000 bytes?"}
  SZ -- "yes" --> FAIL
  SZ -- "no" --> FILE["Blob, download link: the .json file"]
  CC["canonicalCompact in canonicalJson.ts<br/>same writer, compact layout"] -.->|"planned, Phase 2"| HASH["SHA-256 content hash<br/>(no hashing code exists yet)"]
```

Notes on the diagram, so it can be explained in an interview. The solid path is what `exportWorkflowText` does in commit `d2ef493`. First the workflow is **projected** to its known fields (`projectWorkflow`), then the policy check runs on the **projected** value, then the text is written, and the **size is measured on the written text** (so it is the real number of bytes the importer will see). Projecting before checking means the check and the writer look at exactly the same data: an extra in-memory field with a bad value (a test sets one to `NaN`) can neither leak into the file nor block the export. The projection, the policy check and the write all sit inside one `try/catch`, so a value the policy check cannot see (undefined, an array hole, a Date, a function, a bigint) makes the writer throw and the `catch` turns that into **one structured error**. In commit `dd33e84` neither the projection nor the `catch` existed (story 2). The dashed hash box is Phase 2. `canonicalCompact` is not used anywhere in the editor today except by tests.

**A known soft spot, said honestly.** For that catch-all error, the JSON Pointer path is **taken out of the writer's error text** (the code looks for the words " at /" in a message starting with "Cannot write JSON: "). That works today (tests pin the paths) but it ties the guard to the exact wording of the writer's message. If the writer's message were reworded, the path would silently become empty (the error would still be returned, just without a location). A sturdier design would have the writer throw a typed error that carries the path as a field. Also note that `value.not-json-data` is an **export-only** code: an imported file is parsed JSON, which is always data, so an import can never produce it.

**Where the user sees a refusal.** `onExport` in `frontend/src/app/Toolbar.tsx` calls `exportWorkflowText`. If it returns `ok: false`, the toolbar shows the heading "Export failed. No file was created." with the list of errors (code and path), using the same panel as import errors (Lesson L4). A fresh export click clears the panel.

**The import direction** (unchanged since L4) is the mirror image: bytes, strict parse, `migrate`, `validateWorkflow`. The round-trip promise is that anything `exportWorkflowText` accepts survives that path and comes out identical.

**A second small change in the same commit.** `parseConfigInput` in `frontend/src/workflow/configSchema.ts` now reads text typed into an object-typed setting with `strictParse` instead of the built-in `JSON.parse`. So a duplicate key typed into a JSON setting is flagged ("must be valid JSON" is kept for plain typos; a duplicate shows the parser's bounded message) instead of silently collapsing. This closes the one remaining built-in-parser path that Lesson L4 said was carried over.

**A third small change, from the review fixes (`d2ef493`).** `strictParse` in `frontend/src/workflow/strictJson.ts` has a catch-all for an unexpected exception inside the parser itself (a bug, not bad text). Before, it produced "Not valid JSON: <the exception's text> at position N", which reads like a typo in the user's file. Now it returns a distinct message, the constant `INTERNAL_PARSER_ERROR` ("Not valid JSON: internal parser error (please report this)"), still under the code `doc.not-json`, and the exception text is not echoed. `parseConfigInput` in `configSchema.ts` shows that message as it is, while an ordinary typo still shows "must be valid JSON". The tests trigger it by passing a non-string to the parser, which makes it throw a `TypeError` inside itself. The point: a bug in our code should never be reported to the user as their mistake.

### 5. How it communicates with other components

- **`Toolbar.tsx` -> `exportWorkflowText` -> `findPolicyViolations` (`valuePolicy.ts`) -> `exportPretty`.** The same policy module the importer and the settings panel use (one definition of "allowed value", Lesson L4).
- **`serialize.ts` `serializeWorkflow`** is the low-level writer: `exportPretty(projectWorkflow(workflow))` (in `dd33e84` it was `exportPretty(workflow)`, without the projection). It **still throws** for values that are not JSON data. The UI uses `exportWorkflowText`, which does the same projection, the policy check and the size check around the writer and **never throws**: it returns `{ ok: true, text }` or `{ ok: false, errors }`.
- **`errors.ts`.** `ERROR_CODES` gained `value.not-json-data`. Because an imported file can never produce it, `errors.test.ts` and `fixtures.test.ts` each carry an explicit `EXPORT_ONLY_CODES` exemption list. The rule "every code has a test case and a fixture" still holds for every other code. The lists are deliberately short and named, so adding a code to dodge a missing import test would be visible in review.
- **`canonicalJson.ts` -> `errors.ts` and `valuePolicy.ts`.** For `jsonPointer`, the limits and the messages. It does not import the editor, the store or React: it is pure, so the future backend rules can be compared to it.
- **The shared fixtures (Lesson L3).** The new `serialization` family in `contracts/fixtures/serialization/` feeds `frontend/src/contracts/fixtures.test.ts`: parse the input text with `strictParse`, then compare `canonicalCompact` and `exportPretty` to the stored text **as exact strings**. Rejection cases compare `{code, path}`. `contracts/README.md` documents the format; `contracts/CANONICAL_JSON.md` is the specification of both profiles.
- **Planned, not built: Python and PostgreSQL.** A Python writer and Python fixture runner are planned for Phase 2. Until the same 109 files pass there, **no TypeScript-to-Python parity is claimed**. When a workflow is stored in PostgreSQL JSONB, key order is lost, so the plan says canonicalization **runs on read** (documented in `CANONICAL_JSON.md`; not verified because PostgreSQL is not installed).
- **Planned, not built: hashing.** `canonicalCompact` is the only function that will feed the hash. Nothing hashes in this repository today.

### 6. Important code paths

| Where | What it does |
|---|---|
| `frontend/src/workflow/canonicalJson.ts` | `canonicalCompact`, `exportPretty`, and the private `write` (explicit key sort, direct text, refusal of non-data) |
| `frontend/src/workflow/serialize.ts` | `projectWorkflow` (known fields only), `serializeWorkflow` (= `exportPretty(projectWorkflow(w))`, throws), `exportWorkflowText` (project, policy check, write inside try/catch, byte-size check, structured errors, never throws), `exportTooLarge`, `utf8Length`, `MAX_IMPORT_BYTES` |
| `frontend/src/workflow/errors.ts` | `ERROR_CODES`, now including the export-only `value.not-json-data` |
| `frontend/src/workflow/strictJson.ts` | `INTERNAL_PARSER_ERROR`: an unexpected exception inside the parser now gives its own `doc.not-json` message (see below) instead of one that looks like a typo in the text |
| `frontend/src/workflow/valuePolicy.ts` | `findPolicyViolations` (reused by the guard), `stringProblem`, `MAX_DEPTH`, `MAX_SAFE_MAGNITUDE` |
| `frontend/src/app/Toolbar.tsx` | `onExport`: calls the guard, shows "Export failed. No file was created." or downloads the text |
| `frontend/src/workflow/configSchema.ts` | `parseConfigInput` now uses `strictParse` for typed JSON |
| `contracts/CANONICAL_JSON.md` | The specification: both profiles, every rule with its source, the layout, the guarantees, the one-time byte change |
| `contracts/fixtures/serialization/` | 109 hand-written cases: 100 valid (exact `compact` and `export` text) and 9 rejected (`ser-invalid-*`). Families by file name: `ser-keys-*`, `ser-number-*`, `ser-escape-*`, `ser-unicode-*`, `ser-layout-*`, `ser-workflow-*`, `ser-scalar-*` |
| `frontend/src/workflow/canonicalJson.test.ts` | Hand-written examples; a table of 26 refusal cases (with message and JSON Pointer); the depth boundary (64 written, 65 refused, 100,000 refused without a stack overflow); and the property tests below |
| `frontend/src/workflow/serialize.test.ts` | Round trip, key order, the Phase 1 file still imports, the guard tests (NUL in the name, a lone surrogate in a label, config and position and metadata, depth 60 versus 61, the byte limit exactly at and one over, bytes not characters), the five non-JSON-data cases (undefined, array hole, Date, function, bigint: a structured error with a pointer, nothing throws, while `serializeWorkflow` does throw), and the projection tests (extra fields such as `selected` never reach the text, even an extra field holding `NaN` does not block the export, export then import then export is byte-identical) |
| `frontend/e2e/import-export.e2e.ts` | A Playwright test: a workflow name containing a NUL character shows "Export failed. No file was created.", the code `value.nul-character` and `at /name`, and no download happens |
| `frontend/src/contracts/fixtures.test.ts` | The serialization runner, the floor (`serialization: 109`, `serializationInvalid: 9`), the coverage guard for rejection codes (with the `EXPORT_ONLY_CODES` exemption), the property test over every valid workflow fixture, and a runner that imports each `ser-workflow-*` fixture (12 files) as a whole workflow and requires `serializeWorkflow` of the result to equal the fixture's stored `expect.export` text |

**Testing ideas worth knowing** (Module 12):

- **Golden files (also "snapshot tests").** Store the exact expected output and compare strings. The weakness, as Lesson L3 said, is circularity: if the expected text is pasted from what the code printed, the test only proves the code equals itself. `contracts/README.md` therefore says the expected texts are **written by hand from the rules**. A golden file is only as trustworthy as the review of its expectations.
- **Property-based testing against an independent reference.** In `canonicalJson.test.ts`, a seeded random generator (a small function named `rng`) builds 1,500 random JSON-like values. Their alphabet deliberately includes the awkward characters: quotes, a backslash, two control characters, DEL, U+2028, U+E000, the emoji, a combining accent. For each value the test checks four things: the writer's output equals a **reference writer** (`referenceCompact`, which sorts with its own explicit loop over UTF-16 code units and its own escape table: a different mechanism from the real code); the output re-parses with the strict parser to the same data; writing it again gives the same text; and (a second test) the pretty output round-trips and is idempotent. A **guard on the generator** asserts that more than 20 of the cases contain integer-like keys, so the test cannot quietly stop covering the hard case. The seed is fixed, so a failure is reproducible. One honest limit I found by reading the reference: it writes numbers with `String(v)` too, the same call as the implementation, so number text is **not** independently checked by the property test. Numbers are protected by the hand-written number fixtures and the table test instead.
- **Round-trip tests over real data.** For every valid workflow fixture (19 today) the runner imports, exports, imports and exports again, and asserts byte-identity, a stable canonical form, no CR and exactly one trailing LF.
- **A fixture-guard change in `d2ef493`.** The serialization fixtures named `ser-workflow-*` (12 files) used to be checked only as text through the writers. The runner now also imports each one **as a whole workflow** with `importWorkflow` and requires `serializeWorkflow(imported)` to equal the fixture's hand-written `expect.export`. So the whole-workflow path (parse, migrate, validate, project, write) is covered by the hand-written golden text, not only the low-level writer. A guard test requires at least 12 such fixtures so the loop cannot quietly become empty.
- **One more property-test guard.** The integer-like-key assertion in the property test was replaced by a stronger one: it measures objects that mix integer-like keys with other keys, at several nesting levels, and counts those whose JavaScript key order differs from the sorted order (the case a naive writer gets wrong). The earlier version only grepped the output text for `{"` followed by a digit. This is in the same `d2ef493` commit (`canonicalJson.test.ts`; I read the diff, I did not re-derive the thresholds).

### 7. Alternatives and trade-offs

| Option | Good | Costs |
|---|---|---|
| **`JSON.stringify` of a rebuilt object with sorted keys** (before T4b, with a fixed field order) | One line | Cannot order integer-like keys (I verified: a sorting replacer still gives `9, 10, a`); order of user-typed `config` keys depends on insertion; no written rules |
| **`JSON.stringify` with a replacer that sorts keys** | Looks like a fix | Same flaw: the replacer returns an object, and objects reorder integer-like keys |
| **A published RFC 8785 (JCS) library** | Less code to own, written by specialists | New dependency needing approval; each language needs its own; our extra policy (safe integers, NUL, depth, size) still has to be coded; we must still prove the two sides agree with shared fixtures. Not chosen, not ruled out for Phase 2 |
| **Canonicalize inside the database** | One place | JSONB does not keep key order, so the database cannot be the canonical form; it also ties the rule to one product. Chosen instead: canonicalize on read |
| **Hash the pretty export** | One text form to maintain | Layout (indent, trailing LF, line endings) becomes part of every workflow's identity; a formatting tweak changes every hash |
| **Store the author's original text and hash that** | Preserves exactly what was typed | Equal workflows get different hashes; no-op detection and "same version" checks fail; it would still need a canonical form for comparison. A system can store both |
| **Compare parsed objects instead of text** | Fine inside one program | Useless for hashing, for a diff in git, and for cross-language agreement |
| **Sort keys by code point** (Python's default) | Natural in Python | Wrong for RFC 8785 (the emoji case); caught by fixtures |
| **A "lenient" writer that skips or converts odd values** (`JSON.stringify` drops `undefined`, turns `Date` into text) | Never throws | The text no longer matches the data; silent corruption |

### 8. Real-world applications

*The following are from general knowledge, not from this repository.*

- **Content addressing.** Git names objects by a hash of their exact bytes, and container registries identify images by digest. Any system that hashes data needs a byte-for-byte stable form of that data.
- **Signatures over JSON.** RFC 8785 was written so a JSON document can be signed or hashed independent of how a library laid it out. Standards that sign JSON have this problem.
- **HTTP caching and ETags,** and **no-op detection** ("the user pressed Save but nothing changed"), compare a stable representation.
- **Formatters and lockfiles.** Tools such as formatters and package lockfiles write stable, sorted output so that version-control diffs show real changes only.
- **Cross-language contract tests.** Teams that share a data format between services in different languages keep shared test vectors (the same idea as `contracts/`). Cryptographic libraries use "known-answer" test vectors the same way.
- **Property-based testing** (QuickCheck, Hypothesis, fast-check) and **differential testing** against a reference implementation are standard ways to test parsers and serializers.
- **Mutation testing tools** (for example Stryker for JavaScript) automate the break-the-code-on-purpose idea used in this task's review.

### Three lessons from our own review (real examples)

1. **"Are the expected values just a copy of the code?" The reviewer answered it by writing its own writer.** A golden file written by the implementer proves little if the implementer's code and the implementer's expectations share the same misunderstanding. The independent Opus reviewer did not trust the fixtures: it **wrote its own writer from the specification** and ran it over the fixtures. It reproduced all 100 valid fixtures with zero mismatches (this was reported to me by the Principal Architect; I did not repeat it and it is not yet in `docs/DEVELOPMENT_LOG.md`). That is stronger than the in-repo property test, because a different author with only the specification is unlikely to repeat the same mistake. Lesson: independent re-implementation from the spec is one of the best answers to the circularity worry from Lesson L3. (I count the 100 as the valid cases in `contracts/fixtures/serialization/`, 109 minus the 9 `ser-invalid-*` files; I listed the folder.)
2. **A refactor silently deleted two protections (found by the reviewer, fixed in `d2ef493`).** The review of `dd33e84` found two linked problems, both visible in the code at that commit:
   - *The export button could still throw.* `exportWorkflowText` runs `findPolicyViolations`, but that function (in `valuePolicy.ts`) only looks at strings, numbers and containers: it never complains about `undefined`, a function, a `Date` or a bigint. Such a value passed the guard and then `exportPretty` threw. In `dd33e84` nothing in `exportWorkflowText` or `onExport` caught it, so the user would get an uncaught error and no message instead of "Export failed. No file was created."
   - *Dropping the old "copy only the known fields" step let extra fields leak.* The pre-T4b exporter built a new object from the known fields only (I read it with `git show dd33e84^:...`). The new `serializeWorkflow` of `dd33e84` passed the whole object to `exportPretty`. If an in-memory node carried an extra property (a view-library field such as `selected` is the classic example), it was written into the file. On import, `validateWorkflow` returns only the known fields (its own comment in `validate.ts` says "unknown extra keys dropped"), so the next export no longer contains it: the file is **not** byte-identical after a round trip, breaking the promise this task exists to keep.
   
   **The fix, commit `d2ef493`** (I read the code and ran the unit tests; I did not run the mutation checks): `projectWorkflow` restores the projection to the known fields, and `exportWorkflowText` now does projection, policy check and write inside one `try/catch` that returns a single `value.not-json-data` error. New tests pin both fixes: five non-JSON values each give a structured error with a pointer, extra fields never reach the text, and export, import, export is byte-identical for an object that carries extras. **Mutation-checked (the implementer's report, not repeated by me):** removing the `catch` makes 8 tests fail, and skipping the projection makes 3 tests fail. That is what you want to see: each protection has tests that break the moment it is deleted again. Lesson: when you replace one implementation with another, list **everything the old one did implicitly** (here, dropping unknown fields) and check each is still done. A refactor can delete a protection nobody wrote down, and the way to keep it from being deleted twice is a test that fails without it.
3. **Mutation testing: 17 breaks, all caught, one equivalent mutant.** The implementer broke the writer 17 ways (sort by code point, no sort at all, rebuild the object and `JSON.stringify` it, `toFixed` for numbers, CRLF line ends, a missing trailing LF, escaping U+007F, uppercase hex, and so on) and reported that every break made some test fail (reported to me, not repeated by me). One variant did **not** fail anything: writing the number text with `JSON.stringify(n)` instead of `String(n)`. That is an **equivalent mutant** (Lesson L4): for a finite number the two use the same ECMAScript algorithm, so no test could ever tell them apart. I checked it on this machine: 200,000 random doubles of mixed magnitudes gave identical text for both, including minus zero (that is a spot check, not a proof; the reason is the shared algorithm, which is general knowledge about the language specification). The right response is to record it, not to invent a fake test. Contrast with `toFixed`: a different algorithm, so it **is** distinguishable, and it was caught.

### Knowledge Check / Interview Questions

*Answers are not given here. Study this lesson and `docs/LEARNING.md`, then answer all questions in the dedicated learning session at the end of the project.*

1. A colleague proposes: "sort the keys, put them in a new object and call `JSON.stringify`: done." Using the keys `"10"`, `"9"` and `"a"`, explain exactly what goes wrong and why a sorting replacer function does not fix it. Then explain how `canonicalJson.ts` avoids the problem, and why the pair U+E000 and U+1F600 matters to a future Python implementer (which default would they have to override, and with what?).
2. AgentForge has two named text profiles. State the job of each, and what would happen to every stored hash if a future task changed the export indent from 2 spaces to 4 under (a) the current design, and (b) a design that hashed the pretty export. Why does the design say "export is never hashed", and what exists today that actually hashes (be precise)?
3. For each of these rules, say whether its source is RFC 8785, I-JSON, AgentForge policy or PostgreSQL compatibility, and explain why being accurate matters when you present the design to an engineer who knows JSON: key order by UTF-16 code units; the number text `1e-7`; magnitude at most 2^53 - 1; no U+0000; U+007F written literally; the 2-space layout.
4. `exportWorkflowText` runs the value policy and a size check before writing. What promise does it protect, and why is the size measured on the **written text in UTF-8 bytes** instead of the object or the character count? Then use the review of `dd33e84` and its fix `d2ef493` to explain two ways a refactor of the exporter broke that promise (one involving a value that is not JSON data, one involving an extra field on an in-memory object), what `exportWorkflowText` does about each now (why does it project to the known fields **before** the policy check, and why is `serializeWorkflow` still allowed to throw while `exportWorkflowText` never is?), and which tests would fail if each protection were deleted again. Finally, name the soft spot in how the `value.not-json-data` path is obtained and what you would change.
5. The fixtures' expected text is written by hand, the property test has a reference writer, and the independent reviewer wrote a third writer. Explain how these together answer "are the expected values just a copy of the code?" Then identify one thing the in-repo reference writer does **not** check independently (read it), and say what protects that area instead.
6. The implementer made 17 deliberate breaks of the writer. Explain what a mutation test proves and what it cannot. Why did "number text via `JSON.stringify`" survive without that being a test gap, while `toFixed` did not survive? In Phase 2 a Python implementer writes `1e-07` for the number 0.0000001: which fixture fails, when, and why can we not say today that TypeScript and Python agree?

---

## Lesson L6: Describing a node's settings with a small, shared rulebook (the JSON Schema subset validator)

**Task:** Phase 1.1 T5a (the pure JSON Schema subset validator, explicit `applyDefaults`, the `schema` fixture family and `contracts/CONFIG_SCHEMA.md`), commit `96cc80d`, plus its review-fix commit `a009b20`. **Modules:** 3 (Workflow JSON and State Management: schemas, defaults, validation at the import boundary), 7 (Node Registry and Data Propagation: the catalog's configuration contract), 12 (Security, Testing and Deployment: reference implementations, property tests, mutation testing, fixtures as the cross-language contract).

*Status of the code described here.* This lesson describes the code as of commit `a009b20`. **T5a builds the validator and nothing uses it yet.** The catalog, the editor store, the config panel and the importer still use the older `validateConfig` in `frontend/src/workflow/configSchema.ts`; **T5b wires the new validator in** (catalog conversion, store defaults, config panel, importer behaviour, the Groq provider) and deletes the old code. A test in `frontend/src/contracts/fixtures.test.ts` ("only test files import it") checks that, at this commit, no production file imports `jsonSchema.ts`. **What I verified myself:** I read `jsonSchema.ts`, `jsonSchema.test.ts`, the `schema` runner in `fixtures.test.ts`, `contracts/CONFIG_SCHEMA.md`, `git show 96cc80d --stat`, the full `jsonSchema.ts` diff of `a009b20`, counted the files in `contracts/fixtures/schema/` (148), and ran `npm test` in `frontend/` (905 tests passed, at `a009b20`). **What I did not run:** the Playwright tests, the mutation checks, the reviewer's 120,000-case comparison (those are reports from the implementer and the reviewer, labelled as reports below), and the old, pre-fix code (I read the diff that fixed it).

### 1. The problem

Every node in AgentForge has *settings*: an LLM node has a provider, a temperature and a prompt; an agent node has a maximum number of iterations. Something has to say what a valid setting looks like, so that the settings form can be built, an imported file can be checked, and (later) the server can refuse bad input. That description is the node's `configSchema`.

The `configSchema` we had was **home-made**. Reading the code (`frontend/src/workflow/types.ts` and `docs/PHASE1_1_PLAN.md` section 3.1) shows four weaknesses:

- **It cannot say much.** `ConfigProperty` knows only `string`, `number`, `boolean` and `object`, plus `enum`, `minimum` and `maximum`. There is no `integer` (so `maxIterations` accepted `2.5`), no list, no nested object, no length limit.
- **Presentation is mixed into validation.** `format: 'multiline'` is not about validity at all; it is the config panel's wish to draw a textarea.
- **The starting values live somewhere else.** `NodeDefinition.defaults` is a separate object next to the schema, so the two can drift apart.
- **It is a private language.** The backend (Phase 2, planned) will use Pydantic, and Pydantic describes models with the standard **JSON Schema**. Two private languages for the same idea means two places to disagree.

The fix has to be a *contract that two programming languages can implement identically*, which is the theme that started in Lesson L3.

### 2. The concept

**JSON Schema** is a standard way to describe JSON data with JSON itself: `{ "type": "integer", "minimum": 1 }` means "a whole number, at least 1". **A subset** means we support a small, chosen part of the standard and say clearly what we leave out. Our subset uses **draft 2020-12** keywords: `type` (string, number, integer, boolean, array, object), `title`, `description`, `default`, `enum`, `minLength`, `maxLength`, `minimum`, `maximum`, `items`, `minItems`, `maxItems`, `properties`, `required`, `additionalProperties`. The full table, with which differences from plain JSON Schema are AgentForge policy, is in `contracts/CONFIG_SCHEMA.md`.

Three ideas make up the task:

1. **Validating a value against a schema** (`validateAgainstSchema`): walk the value and the schema together, and report every mismatch as an error with a machine-readable **code** (such as `schema.type`) and a **path** (a JSON Pointer such as `/options/0/name`, Lesson L2).
2. **Defaults as an explicit act** (`applyDefaults`): "the initial value of a setting" is a *schema annotation* (`default`), but **nothing fills it in automatically**. A function you call on purpose does it, when a node is created.
3. **A schema about schemas** (`checkSchemaSubset`): before a schema is trusted, check that it is itself inside the subset. This is how you reject the keywords you decided not to support (for example `$ref`) instead of silently ignoring them.

### 3. Why we selected this approach

1. **A deliberately small subset, written down.** The subset is what the editor and the settings form can actually render and what we can implement twice (TypeScript now, Python later) and prove identical. `CONFIG_SCHEMA.md` lists the **deliberate non-goals**: `$ref`, `$defs`, `anyOf`, `oneOf`, `allOf`, `not`, `if`, `then`, `else`, `patternProperties`, `format`, `pattern`. Two reasons stand out. **Pydantic emits `$ref`, `$defs` and `anyOf` by default** (for nested models and optional fields), so the Phase 2 backend will have to *flatten* its output into this subset; supporting composition would multiply the validator and the config panel for no current need. And **`pattern` is a regular expression, and regular-expression dialects differ between JavaScript and Python**, so the same pattern could accept different text in the two runtimes, which breaks the whole point of a shared contract.
2. **`checkRequired` is a mandatory option, not a default.** The signature is `validateAgainstSchema(schema, value, { checkRequired })`. The reason is decision C1 in the plan: the editor must be able to hold and export an *incomplete draft* (D-017), so **importing a file must not reject a document just because a required setting is still empty**. Execution (Phase 3, planned) will use `checkRequired: true`. A boolean with a default would let a caller get it wrong by accident; making it mandatory forces every caller to decide. It is mandatory **at run time too**: a missing or non-boolean option throws a `TypeError` (the review added this; the test "a missing or malformed options value throws a TypeError" tries nine bad values). Note that C1 is the *planned* importer behaviour: T5b wires it in.
3. **Defaults are explicit, never implicit.** If a validator or the importer quietly filled in missing values, then *importing a file would change its data*, and exporting it again would not give back what was imported. So validators never apply defaults and the importer never will; `applyDefaults(schema)` is called **only** by node creation (and, later, by a migration that introduces a new property; both are T5b and later work, planned). Two further rules keep it predictable: **no recursion** (a nested object gets a value only from an explicit `default` on that property; nothing is invented), and the result is a **deep copy** (`structuredClone`), so editing a new node's config can never edit the schema's own default object.
4. **`checkSchemaSubset` exists so the validator can stay small.** The validator itself does not defend against a malformed schema (its doc comment says so). The contract is: *check the schema once, when it is loaded, then validate many values against it*.
5. **Our own validator, no library.** It is one pure file, `frontend/src/workflow/jsonSchema.ts` (about 320 lines including comments, most of it `checkSchemaSubset`), with no React and no dependency. `CLAUDE.md` section 4 requires approval for a new major dependency, and a library would still not give us the AgentForge-specific rules (code-point length, safe integers, own-property lookups, error codes and paths we control). The recommendation is recorded as D-022-a in the plan.
6. **Code points, safe integers, own keys: three AgentForge rules chosen so two languages agree.** String length counts **code points**: the emoji U+1F600 has length 1, although JavaScript's `text.length` says 2 (it counts UTF-16 units) and Python's `len` says 1; the code uses `[...text].length`. An `integer` must be a **safe integer** (at most 2^53 - 1), the same document-wide rule as Lesson L4. And a key of the *validated value* is matched against `properties` only if `properties` **owns** it (`Object.hasOwn`), so a hostile file with a key named `constructor` or `__proto__` is just an unknown key.

### 4. How it works internally

**`validateAgainstSchema`** (in `frontend/src/workflow/jsonSchema.ts`) checks its options, then calls a private recursive function `validate(schema, value, path, checkRequired, errors)` that appends to one `errors` list. For each node of the value:

1. **Check the type first.** `typeProblem` decides whether the value has the schema's `type`. If not, it reports `schema.type` and **returns at once**: every other keyword is skipped for that node (a number given where an object was expected has no keys worth checking). This early return is a documented rule and a fixture family pins it (`sch-type-error-skips-object-keywords` and its string, number and array siblings; the object one uses `checkRequired: true` and still expects only `schema.type`).
2. **Check `enum`** if present. It compares with `enumEquals`, which is just `a === b`, so the **same JSON type and value** are required. This was pulled out into a named exported function by the review (story 2 below).
3. **Then the keywords of that type.** A string: `minLength` and `maxLength`, counting code points. A number or integer: `minimum` and `maximum`. An array: `minItems`, `maxItems`, then **recurse into every element** with the path extended by `/<index>`. An object: if `checkRequired`, every required key that is absent (not an own property, or an own property whose value is `undefined`) gives `schema.required` at `/<key>`; then **for each own key of the value**, recurse into the matching `properties` entry, or else apply `additionalProperties` (`false` gives `schema.additionalProperties`; a schema is validated against; `true` or absent accepts). A boolean has no further keywords.

```mermaid
flowchart TD
  IN["Inputs: schema, value, options { checkRequired }"] --> OPT{"options is an object whose<br/>checkRequired is a boolean?"}
  OPT -- "no" --> TE["throws TypeError (a programming error, loud)"]
  OPT -- "yes" --> V["validate(schema, value, path, ...)"]
  V --> TY{"value has the schema's type?"}
  TY -- "no" --> E1["error schema.type at this path<br/>EARLY RETURN: no other keyword is checked for this node"]
  TY -- "yes" --> EN{"enum present and no entry equal<br/>(same type and value)?"}
  EN -- "yes" --> E2["error schema.enum (checking continues)"]
  EN -- "no" --> KW{"type of the node"}
  E2 --> KW
  KW -- "string" --> S["minLength / maxLength, counted in code points<br/>schema.minLength, schema.maxLength"]
  KW -- "number or integer" --> N["minimum / maximum<br/>schema.minimum, schema.maximum"]
  KW -- "array" --> A["minItems / maxItems, then for each element:<br/>validate(items, element, path + /index)"]
  KW -- "object" --> O["if checkRequired: absent required key gives schema.required at /key<br/>for each OWN key of the value:<br/>known property: validate(property schema, child, path + /key)<br/>unknown, additionalProperties false: schema.additionalProperties<br/>unknown, additionalProperties a schema: validate against it"]
  KW -- "boolean" --> B["nothing more"]
  S --> OUT["errors: a list of { code, path, message }"]
  N --> OUT
  A --> OUT
  O --> OUT
  B --> OUT
  E1 --> OUT
```

Reading the diagram aloud, for an interview: the same `errors` list is passed down the recursion, so one call reports **every** problem, not only the first (the fixture `sch-multiple-errors` covers it). The **code and path are the contract**; the message is for people and is never compared by a fixture. Order is stable but not part of the contract (`required` errors first, then the value's keys in key order, then array elements by index), so fixtures compare as **multisets**, as in Lesson L3.

**`applyDefaults`** is a few lines: take `schema.properties` in order, keep those with a `default` other than `undefined` (so `0`, `false` and the empty string count), and build an object from `[key, structuredClone(default)]` pairs. It uses `Object.fromEntries`, which *defines* own properties, so a schema property named `__proto__` cannot reach the prototype. A required property without a default stays **absent**: that is exactly the incomplete-draft situation `checkRequired: false` exists to allow.

**`checkSchemaSubset(schema: unknown)`** takes *any* value and returns a list of `{ path, message }` problems (paths point into the schema, for example `/properties/a/pattern`). Per schema node it reports, among others: unknown keywords (naming the non-goals specially), a wrong or missing `type`, a keyword on the wrong type (`minLength` on a number, `enum` on an array), `required` names that are not keys of `properties` or are listed twice, an empty `enum` or an entry not of the schema's type, a negative or fractional `minLength`, an unsatisfiable range (`minimum` greater than `maximum`, reported at the max keyword), nesting deeper than `MAX_SCHEMA_DEPTH` (16), and a `default` that does not validate against its own schema (using `validateAgainstSchema` with `checkRequired: false`). **The default rule** is uniform: a `default` is checked only if *that node and every node beneath it have no problem of their own*; otherwise the default is skipped and never reported. So a broken schema reports its real problem, not a second derived one, and the validator only ever runs on a sound schema.

**The three kinds of fixture** (one JSON file per case in `contracts/fixtures/schema/`: 148 files at `a009b20`, 75 validation, 8 defaults and 65 schema check, counted by file name prefix and by the runner's floor in `fixtures.test.ts`):

| Kind | What the file holds | What the runner does (the `schema` describe in `fixtures.test.ts`) | Example |
|---|---|---|---|
| **Validation** | `schema`, `value`, `options: { checkRequired }`, `expect: [{ code, path }]` | requires the case's own schema to pass `checkSchemaSubset`; runs `validateAgainstSchema`; compares `{code, path}` as multisets | `sch-string-emoji-minlength`: `minLength: 2` and one emoji gives `schema.minLength` at the empty path |
| **Defaults** | `schema`, `applyDefaults: true`, `expect: { value }` | checks the schema is in the subset; runs `applyDefaults`; requires the result to validate with `checkRequired: false`; compares `JSON.stringify` of result and expectation, so **key order counts** | `sch-defaults-basic`: properties `a` and `b` have defaults, `c` has none, so the result holds `a` and `b` only |
| **Schema check** | `schema` (possibly malformed on purpose), `checkSchema: true`, `expect: [{ path }]` | runs `checkSchemaSubset`; compares the sorted problem paths | `sch-check-nongoal-ref`: a property with `$ref` gives one problem at `/properties/a/$ref` |

### 5. How it communicates with other components

- **`errors.ts`.** T5a added four codes to `ERROR_CODES` in `frontend/src/workflow/errors.ts`: `schema.minLength`, `schema.maxLength`, `schema.minItems`, `schema.maxItems` (ten `schema.*` codes now). Because no catalog schema uses those four keywords yet, no imported workflow can produce them, so the guards that say "every code has a workflow fixture" would fail. The answer is the same pattern as `EXPORT_ONLY_CODES` in Lesson L5: **one named, temporary exemption list**, `SCHEMA_ONLY_CODES`, exported from `jsonSchema.ts` and imported by both `errors.test.ts` and `fixtures.test.ts` (the review made it one definition instead of two copies). Its comment says T5b removes entries as workflow fixtures start covering them. The validator also reuses `jsonPointer` from `errors.ts` for paths.
- **The existing code is untouched.** `configSchema.ts` (`validateConfig`, `parseConfigInput`), the catalog, the store and the config panel still run the old checks. Two validators coexist between T5a and T5b on purpose (D-032), and the no-import guard test makes "nothing uses the new one yet" a checked fact instead of a claim. The guard regex catches static, side-effect and dynamic imports, with or without a file extension, and is itself tested against eight positive and five negative strings (the review found the first regex could be bypassed).
- **The fixtures.** The `schema` runner shares the corpus loader and the shape checker (`checkShape`, with a `schema` entry in `FAMILY_FIELDS`) with the other families, so a malformed schema fixture is itself reported. `contracts/README.md` documents the format.
- **Planned, not built.** **T5b** converts the six catalog node definitions to JSON Schema, replaces `NodeDefinition.defaults` with schema `default`s applied through `applyDefaults`, makes the config panel render from the schema, and has the importer call `validateAgainstSchema` with `checkRequired: false` (all described in `docs/PHASE1_1_PLAN.md` section 3.1; none of it is done in the code this lesson covers). **Phase 2** adds the Python runner for the same 148 files and a Pydantic-to-subset flattening step. **Until the Python runner exists and passes, nothing says the two languages agree**; `CONFIG_SCHEMA.md` says exactly that ("TypeScript only. No Python parity is claimed").

### 6. Important code paths

| Where | What it does |
|---|---|
| `frontend/src/workflow/jsonSchema.ts`: `validateAgainstSchema`, private `validate`, `typeProblem` | The validator: type first with an early return, then enum, then the keywords of the type, recursing into items and properties |
| same file: `enumEquals` | Enum equality (same JSON type and value; a one-line `===` that is exported so a test can pin it) |
| same file: `applyDefaults` | Explicit, non-recursive, copying defaults; never called by a validator |
| same file: `checkSchemaSubset`, private `checkNode`, `NON_GOAL_KEYWORDS`, `KEYWORDS_BY_TYPE`, `MAX_SCHEMA_DEPTH` | The schema-about-schemas check, total on any input |
| same file: `SCHEMA_ONLY_CODES` | The temporary exemption list, shared by the two test runners |
| `frontend/src/workflow/errors.ts` | `ERROR_CODES`, now with the four length and item codes |
| `contracts/CONFIG_SCHEMA.md` | The specification: keywords, the AgentForge differences, non-goals and why, `checkRequired`, defaults, error codes and paths, the three fixture shapes |
| `contracts/fixtures/schema/` | 148 hand-written cases (families by file name: `sch-string-*`, `sch-integer-*`, `sch-enum-*`, `sch-array-*`, `sch-object-*`, `sch-key-*`, `sch-defaults-*`, `sch-check-*`, `sch-type-error-skips-*`) |
| `frontend/src/contracts/fixtures.test.ts`: the `schema` describe, `schemaKind`, the floor (`schema: 148`, `schemaValidation: 75`, `schemaDefaults: 8`, `schemaCheck: 65`), the no-production-import guard | The runner, the counts and the guard |
| `frontend/src/workflow/jsonSchema.test.ts` | Unit tests; the seeded property test against an independent `reference` function (2000 schema and value pairs, each with both `checkRequired` values); the totality test (3000 seeded random and corrupted schemas never throw) |

**How the tests are built** (Module 12):

- **A property test against a reference written differently on purpose.** `reference` in `jsonSchema.test.ts` uses a per-type predicate table, errors as plain strings, `split` and `join` for escaping, `Array.from` for code points and `hasOwnProperty.call` for own keys, while the real code uses a `switch`, `Object.hasOwn`, spread and `jsonPointer`. A seeded generator (`rng`, a small mulberry32 function) makes the schemas and values; the test asserts that valid and invalid outcomes both occur in volume and that nearly every code is produced, so agreement proves something.
- **A soundness corollary in the totality test.** For every random or corrupted schema that `checkSchemaSubset` calls clean, the test then runs the validator on random values and requires that it **does not throw**. That ties the two functions together: "clean" must mean "safe to use".
- **Boundary pairs** in fixtures: `minItems` one short and exactly at the limit, `maxItems` one over and at the limit, `2^53` against `2^53 - 1`, `1.0` and `-0` as integers.

### 7. Alternatives and trade-offs

| Option | Good | Costs |
|---|---|---|
| **Our own validator for a documented subset (chosen)** | No dependency; exactly the rules we need; two implementations kept in step through shared fixtures; error codes and paths we control | We own the code and the tests; the subset must be policed (`checkSchemaSubset`); less than the standard |
| **A JSON Schema library such as Ajv** (general knowledge, not evaluated here) | Full standard, mature, fast | A new dependency needing approval; we would still need our own mapping to `{code, path}`, our code-point and safe-integer policy, and a Python counterpart whose behaviour matches exactly; a bigger feature surface than the config panel can render |
| **Zod or a similar TypeScript-first library** (general knowledge) | Pleasant for TypeScript types | The schema lives in TypeScript code, not as data, so it cannot be sent to a backend, stored as catalog JSON or shared with Python; not a standard |
| **The home-made model we had** | Already worked | Cannot express integer, list, nested object, length; presentation mixed in; defaults separate; nothing to share with Pydantic |
| **Derive the schema only from Pydantic (Phase 2)** | One source of truth later | The editor works today with no backend; the plan keeps TypeScript first and has Phase 2 generate and check against this contract. Pydantic's default output (`$ref`, `anyOf`) also falls outside the subset |
| **Support full JSON Schema** (`$ref`, `anyOf`, `pattern`) | Maximum compatibility | A much bigger validator and config panel; regular-expression dialect differences between JavaScript and Python; nothing in the six node types needs it |
| **Implicit defaults** (validator or importer fills them in) | Convenient | Importing changes the file's data, so a round trip is no longer identical; hides mistakes (a missing required value looks fine); recursion invents nested structure |

### 8. Real-world applications

*The following are from general knowledge, not from this repository.*

- **JSON Schema in practice.** OpenAPI documents describe request and response bodies with it; many editors validate configuration files (for example `package.json`) against published schemas; form builders generate forms from schemas, the way our config panel will (the plan's separate `ui` block keeps presentation out of the schema, the same split as the `uiSchema` of React JSON Schema Form).
- **Pydantic and FastAPI.** Pydantic models emit JSON Schema, and FastAPI uses it for validation and its generated API docs. This is the reason the subset leaves out `$ref` and `anyOf`: a flattening step is the price of sharing the contract.
- **LLM function calling and structured output.** The tool and structured-output features of LLM providers take a JSON Schema describing the arguments or the answer. A small, well-understood subset is what such features handle best, and it is the same kind of schema that AgentForge nodes and (Phase 5) generated workflows will need.
- **Total functions on untrusted input.** Anything that validates user-supplied definitions (schema registries, API gateways, configuration loaders) must not crash on a malformed definition; it reports it.
- **Reference implementations and differential testing.** Standards bodies keep language-neutral test suites (the JSON Schema project publishes one) so that many implementations can be checked against the same cases, which is the idea of our `contracts/` folder.
- **Mutation testing** (tools such as Stryker) automates "break the code, see if a test notices", the technique used in this task's review.

### Three lessons from our own review (real examples)

1. **A checker must be built for the input it exists to reject (found by the reviewer, fixed in `a009b20`).** `checkSchemaSubset` is meant to receive *malformed* schemas, yet it could **crash** on one. Reading the diff: it remembered how many problems it had found (`before`) *after* it had already reported the node's own unknown or misplaced keywords, so a node with such a problem still had its `default` validated. The validator then ran on a schema such as `{ type: 'array', enum: 5, default: [] }` (an `enum` that is not a list, on a type that may not even have one) and tried to call a list method on `5`. The fix moves the `before` marker to the start of the node and states **one uniform rule** for the default (see section 4). A second, linked gap: the rule for *when a default is checked* had not been written down at all, so each level could have done something different. The test "a default is validated only when its node and everything beneath it is sound" lists the reproducers (including `enum: 5` on an array and `enum: null` on an object) and the totality test runs 3000 seeded random and corrupted schemas. The general principle: a **total function** (defined for every input, never throwing) is the right shape for anything at a trust boundary, and the schema check is one, because a schema can come from a catalog file or, in Phase 5, from AI output. I read the diff and the tests; I did not run the pre-fix code.
2. **A spec rule two languages must agree on has to be written down and fixture-tested.** Two examples from this task. **Enum equality:** in JavaScript `true === 1` is `false`, but in Python `True == 1` is `True`, so a port that compares loosely would accept `1` for an enum of `[true]`. The fix is both a sentence in `CONFIG_SCHEMA.md` ("the same JSON type and the same value") and fixtures (`sch-enum-boolean-rejects-number`, `sch-enum-integer-rejects-boolean`), and the comparison lives in its own exported function, `enumEquals`, with a unit test over eleven pairs, because *through* `validate` a loose `==` could not be told apart (the type check runs first, so both sides always have the same type by then). **String length:** the code-point rule has fixtures with an emoji (`sch-string-emoji-*`). The wider lesson: **a check that only a property test catches will be missing from the Python port**, because the Python implementer reads the spec and the fixtures, not the TypeScript test suite. If a rule matters, it needs a fixture.
3. **Independent re-implementation and mutation testing found what the author's tests did not.** The Opus reviewer **wrote its own validator from the specification text and compared 120,000 generated cases against the implementation, with zero disagreements** (the reviewer's report, relayed to me by the Principal Architect; I did not repeat it). The same review reported **fixture gaps found by mutation testing**: a deliberate break of the code that survived every test, meaning the tests did not pin that behaviour (reported to me, not repeated by me; the review-fix commit message lists 23 new fixtures, for example `required` inside array items and under `additionalProperties`, an escaped key in a `required` path, and item-count boundaries). The review also found a duplicate `required` name accepted, `minimum` greater than `maximum` accepted, and the import-guard regex bypass (section 5). Why this is the right habit: a test suite is only as good as the bugs it can notice; breaking the code on purpose is the direct way to measure that, and a second author working from the spec is the best answer to "are the tests just a copy of the code?" (Lesson L5 made the same point for the writers).

### Knowledge Check / Interview Questions

*Answers are not given here. Study this lesson and `docs/LEARNING.md`, then answer all questions in the dedicated learning session at the end of the project.*

1. `validateAgainstSchema` requires `{ checkRequired }` and has no default for it. A user drops an LLM node onto the canvas whose schema requires `provider` but gives it no `default`, exports the draft, and imports it later. What does `applyDefaults` put in the new node's config, what does import validation do with `checkRequired: false`, and what will execution do with `checkRequired: true` in Phase 3? Why is making the option mandatory (with a `TypeError` when it is missing) a better design than defaulting it to `true` or to `false`?
2. Give two concrete harms of letting the importer fill in schema defaults silently, one about the round trip from Lesson L5 and one about hiding a user's mistake. Then explain the three rules that keep `applyDefaults` predictable (no recursion, a deep copy, only explicit calls) and what could go wrong with each rule broken.
3. Explain what "a schema about schemas" is and why `checkSchemaSubset` must be a total function. Use the review finding: why did an `enum` that is not a list, on an array schema that also has a `default`, make the first version crash, what change in where the `before` marker is set fixes it, and what is the uniform default rule? What is the "soundness corollary" in the totality test, and why does it tie `checkSchemaSubset` to `validateAgainstSchema`?
4. The subset excludes `$ref`, `anyOf` and `pattern` on purpose. Explain the reason for each in terms of Pydantic and of the two runtimes. What will the Phase 2 backend therefore have to do, and what does the statement "TypeScript only, no Python parity claimed" in `CONFIG_SCHEMA.md` mean for what we may say today in an interview?
5. Name three places where JavaScript and Python would give different answers for a validator like this one (think about enum equality, string length and the integer range), say what AgentForge chose in each case, and explain why `enumEquals` is a separate exported function with its own unit test instead of being left inline in `validate`. Then explain the sentence "a check that only a property test catches will be missing from the Python port" and say what you would add so it is not missing.
6. The tests for this task include language-neutral fixtures, a seeded property test against an independent reference, a totality test, and (from the review) an independent re-implementation and mutation testing. For each, say what kind of mistake it can catch that the others cannot. Why is the early return after `schema.type` pinned by a fixture that uses `checkRequired: true`, and what behaviour could a Python port silently get wrong if that fixture did not exist?

---

## Lesson L7: One description per node, three users (the catalog, the importer and the settings panel move onto the JSON Schema subset)

**Task:** Phase 1.1 T5b (catalog conversion, explicit defaults at node creation, the importer behaviour of decision C1, the settings panel generated from the schema, the Groq provider), commit `7b09662`, plus its review-fix commit `44bd7f4`. **Modules:** 7 (Node Registry and Data Propagation: the catalog as the single source of truth), 3 (Workflow JSON and State Management: explicit defaults, incomplete drafts, the schema as a contract), 2 (Frontend and React Flow: a form generated from data), 12 (Security, Testing and Deployment: differential testing, golden values, mutation testing, guards).

*Status of the code described here.* This lesson describes the code **at commit `44bd7f4`**. **T6 (node migrations, including version 2 of `agent.autonomous`) is running as I write and adds migrations; it is not described here and nothing below is a claim about it.** The working tree may therefore already differ from what you read in `frontend/src/catalog/nodes.ts`, `store/`, `validate.ts`, `serialize.ts` and `app/`; the commit is the reference (`git show 44bd7f4:frontend/src/catalog/nodes.ts`). **What I verified myself:** I read both commits' messages and `--stat`, and these files as they are at `44bd7f4`: `frontend/src/catalog/nodes.ts` and `index.ts`, `frontend/src/workflow/types.ts`, `validate.ts`, `configSchema.ts`, `codeExemptions.ts`, `errors.ts` (header), `jsonSchema.ts` (the exported names), `frontend/src/store/editorStore.ts` (`addNode`), `frontend/src/config-panel/ConfigPanel.tsx`, `propertyOrder.ts` and its test, `frontend/src/catalog/catalog.test.ts`, the guards in `frontend/src/store/editorStore.test.ts`, `frontend/e2e/config-panel.e2e.ts`, `contracts/CONFIG_SCHEMA.md`, the changed fixtures, and the old (pre-`7b09662`) `types.ts`, `configSchema.ts`, `nodes.ts` and `validate.ts` for the before-and-after. I counted the fixture files with `git ls-tree` (workflow/valid 21, workflow/invalid 96, config 19, schema 148). **What I did not run:** the test suites. The counts **15 test files, 934 unit tests and 35 browser tests at `44bd7f4`** are the numbers recorded by the Principal Architect in `docs/DEVELOPMENT_LOG.md` (reported to me; I did not repeat them because the working tree has moved on to T6). The reviewer's 60,000-document comparison and the mutation runs are **reports** and are labelled as such below.

### 1. The problem

Lesson L6 built a careful, tested validator for node settings, but at that commit **nothing used it**. The real editor still ran on the old, home-made code, and that code had four problems that you can see by reading the pre-`7b09662` files:

- **The catalog described settings in a private, weak language.** `ConfigProperty` in `frontend/src/workflow/types.ts` knew only `string`, `number`, `boolean` and `object`, with `enum`, `minimum`, `maximum`. No `integer` (so the Agent's `maxIterations` accepted `2.5`), no length limits, no lists.
- **Starting values lived in a second place.** Each node definition had a `defaults` object next to its `configSchema`. Two descriptions of the same thing can drift apart.
- **Presentation was mixed into validity.** `format: 'multiline'` is not a rule about valid data; it is the settings panel's wish to draw a bigger box.
- **An incomplete draft was rejected on import.** The old `validateConfig` returned a `schema.required` error whenever a required key was absent. But an editor must be able to hold unfinished work (decision D-017): a user saves a half-built "LLM Prompt" with no provider yet, and gets "Import failed" on the way back in. That contradicts what the editor is for. Decision D-025 ("C1") had already said the file should import.

So the task is a **switch-over**: take the validator of L6 and make it the one thing that describes, creates, checks and draws a node's settings, and delete the old code.

### 2. The concept

Think of the catalog entry for a node as a **form template that is also a rulebook**. It says, for one node type, "these are the settings you may have, here is each one's type and limits, here is its starting value". Three different parts of the program read that one template and each uses a different part of it:

1. **Creating a node** copies the starting values out of it (`applyDefaults`).
2. **Importing a file** checks the file against its rules (`validateAgainstSchema`, with the "do not insist on required settings" switch off).
3. **Drawing the settings panel** builds the form from it (the types decide the controls, a separate `ui` block decides the look).

The technical terms:

- **Single source of truth.** One place that defines a fact; everything else derives from it. Here: `configSchema` in `frontend/src/catalog/nodes.ts`.
- **Schema-driven UI** (a form generated from a schema, rather than one hand-written form per node).
- **Separation of validation and presentation.** What makes data valid goes in `configSchema`; how it is displayed goes in the optional `ui` block, which a validator ignores.
- **Explicit versus implicit defaults** (introduced in L6; this task is where the one explicit call happens).
- **Incomplete draft** (decision C1): a document that is structurally sound but has a required setting still empty. Structurally sound means every setting that *is* present has the right type, value range and name.

### 3. Why we selected this approach

1. **Reuse the tested validator instead of keeping two.** Two validators in one program disagree sooner or later (D-032 accepted that only for the short gap between T5a and T5b). After T5b the old `validateConfig`, the `ConfigProperty` and `ConfigSchema` types, `format: 'multiline'` and `NodeDefinition.defaults` are all deleted (the commit message of `7b09662` lists them; the type check and the test "the old presentation and defaults fields are gone" in `catalog.test.ts` keep them deleted).
2. **Defaults are applied in exactly one place, and the importer never applies them.** Suppose the importer quietly filled in a missing `provider` with `ollama`. Then *importing a file would change its data*; the user's file says one thing and the editor holds another; export would write something the user never wrote, and the "export, import, export gives identical bytes" promise of L5 would quietly depend on the catalog's current defaults. So `validateWorkflow` in `frontend/src/workflow/validate.ts` stores `config: raw.config`, the object it read, untouched. The only production caller of `applyDefaults` is `addNode` in `frontend/src/store/editorStore.ts`, and a test enforces that by reading source text (section 6).
3. **Decision C1: `checkRequired: false` at import.** The importer calls `validateAgainstSchema(def.configSchema, raw.config, { checkRequired: false })`. Wrong types, values outside an `enum`, out-of-range numbers and unknown keys are still errors. A *missing* required key is not. Execution in Phase 3 (planned) will call it with `true`. D-025 also says the editor will show such gaps as `required-field-empty` **warnings**; that warning is **planned (task T7)** and is not built.
4. **`schema.required` becomes unreachable from import.** This has a consequence for the test guards. Earlier guards (L2, L3) require that every error code has a workflow fixture that produces it. Now no workflow can produce `schema.required`, so it is put on a **temporary, named exemption list**, `SCHEMA_ONLY_CODES` in `frontend/src/workflow/codeExemptions.ts`, with a comment that says why ("Execution-only: import validates with checkRequired: false"). It is still covered, by the `schema` and `config` fixture families, which can state `checkRequired: true`. The file is a **test-only** module: its header says "Imported by tests only", and a guard in `editorStore.test.ts` fails if production code imports it (section 6).
5. **A separate `ui` block, with a small honest vocabulary.** The type `NodeUi` in `frontend/src/workflow/types.ts` allows five `widget` values, but **only `textarea` (on a string) is rendered**; the others (`text`, `select`, `json`, `checkbox`) are *reserved*. The review (finding m2) made that explicit: `contracts/CONFIG_SCHEMA.md` says so, and the catalog test only accepts widgets the panel honours, so nobody writes a hint that silently does nothing.
6. **Groq without touching the file format.** `PROVIDERS = ['ollama', 'openai', 'anthropic', 'groq']` is one exported constant in `frontend/src/catalog/nodes.ts`; both `llm.prompt` and `agent.autonomous` use it as their `provider` enum. `groq` is **appended last** so the existing option order in the dropdown does not change. Adding a provider is a catalog change, not a schema-version change.

### 4. How it works internally

**The shape of a catalog entry (at `44bd7f4`).** `NodeDefinition` has `configSchema: ObjectSchema` (an object schema from `jsonSchema.ts`) and an optional `ui?: NodeUi`. `defaults` is gone. Every one of the six catalog schemas sets `additionalProperties: false`, which keeps the old behaviour that an unknown setting is an error (the standard JSON Schema default would allow extras; the catalog test asserts the `false`). A small example, abridged from the `llm.prompt` entry:

- `provider`: a string with `enum: PROVIDERS`, `default: 'ollama'`
- `prompt`: a string, `default: ''`
- `temperature`: a number from 0 to 2, `default: 0.7`
- `required: ['provider', 'prompt']`
- `ui.fields`: `systemPrompt` and `prompt` are `{ widget: 'textarea', rows: 4 }`

Note that `required` and `default` are **different questions**. A property can be required and still have a default (every required property in today's catalog has one), or be required with none. A new node gets the default; an imported node gets whatever the file says, including nothing.

```mermaid
flowchart TD
  CAT["frontend/src/catalog/nodes.ts<br/>configSchema (ObjectSchema: properties, required,<br/>defaults, additionalProperties false) + ui"]
  CAT --> A["(a) Node creation: addNode in editorStore.ts<br/>config = applyDefaults(def.configSchema)<br/>only explicit defaults; a required key without a default stays absent"]
  CAT --> B["(b) Import: validateWorkflow in validate.ts<br/>validateAgainstSchema(def.configSchema, raw.config, checkRequired false)<br/>errors for type, enum, range, unknown key; NEVER fills in or changes the config"]
  CAT --> C["(c) Settings panel: ConfigPanel.tsx<br/>propertyOrder(def): ui.order first, then schema order<br/>one ConfigField per property, control chosen by schema type and ui"]
  C --> D{"string property with an enum?"}
  D -- "yes" --> E{"stored value equals one of the enum entries?"}
  E -- "yes" --> F["select shows that option"]
  E -- "no: absent, e.g. imported draft" --> G["select shows a disabled option (not set)<br/>the config is unchanged until the user picks"]
  D -- "no" --> H["text input, textarea (ui widget textarea or object/array), or checkbox"]
  C --> I["User types: parseConfigInput(prop, raw) in configSchema.ts<br/>validateAgainstSchema(prop, value, checkRequired false)<br/>commit to the store only if it validates"]
```

**(a) Creating a node.** `addNode(type, position)` looks up the latest catalog definition and builds `{ id, type, typeVersion, label, config: applyDefaults(def.configSchema), position }`. `applyDefaults` (L6) returns a fresh object with a deep copy of each explicit default; the test "two nodes of the same type never share a nested object" in `catalog.test.ts` changes one node's `headers` and checks that a second node and the catalog are unaffected.

**(b) Importing.** For each node, `validateWorkflow` finds the definition by type and version (`node.unknown-type` if there is none), then runs the schema check and maps each `{code, path, message}` onto the document path `/nodes/<i>/config<path>`. The check does not stop at the first problem. If the result has any error, the document is rejected as a whole (the existing 20-error cap and rules are unchanged).

**(c) Drawing the panel.** `ConfigPanel.tsx` asks `propertyOrder(def)` for the property names (the helper is in its own React-free file, `propertyOrder.ts`, with unit tests, so its behaviour can be tested without a browser) and renders one `ConfigField` per name with `prop` (the schema for that property) and `ui` (its hint, if any). The control is chosen from the schema: `boolean` gives a checkbox; a `string` with `enum` gives a select; an `object` or `array` (or a string whose hint is `textarea`) gives a textarea, with `ui.rows` if given, otherwise 5 rows for JSON and 4 for text; everything else is a text input (with a numeric keyboard hint for `number` and `integer`). A field keeps a **draft** (the text in the control); each change goes through `parseConfigInput`, which parses object and array text with the strict parser from L4, validates that one value with `checkRequired: false` (a single property has nothing to be "required" of), applies the document policy limits from L4, and only then calls `updateNodeConfig`. An invalid draft shows an error and the last valid value stays in the store.

**The "(not set)" case, and why it exists.** This is the most instructive thing in the task. Before C1, a node in the store always had a provider, because the importer rejected files without one and `addNode` always filled one in (the user could change it, but never remove it). After C1, a node can be imported with `config: {}`. The select control then received a value (`''`) that matched none of its options. **A browser shows the first option when a select's value matches nothing**, so the panel displayed "ollama" while the config held **no provider at all**. The screen lied about the data; and exporting would write a file with no provider, which the user, looking at the screen, would not expect. The fix in `44bd7f4` (review finding M1): in `ConfigField`, if no enum entry equals the current draft, render a **disabled** `(not set)` option and select it; once the user picks a real option the placeholder disappears. The e2e test "an imported node without a provider shows '(not set)' and exports no provider until one is picked" in `frontend/e2e/config-panel.e2e.ts` imports a workflow with an empty `llm.prompt` config, checks the dropdown shows `(not set)` first and disabled, **exports and checks the file really has no `provider` key** (so viewing a node changes nothing), then picks `ollama` and checks the export now has it.

### 5. How it communicates with other components

- **Catalog to everything.** `frontend/src/catalog/index.ts` re-exports `PROVIDERS` and `nodeDefinitions` and provides `getNodeDefinition(type, version)` and `getLatestNodeDefinition(type)`. The store uses the latest definition (creation); the importer uses the exact version stored in the file; the panel uses the version of the selected node.
- **Store to panel.** The panel reads the selected node from the Zustand store (`useEditorStore`) and writes through `updateNodeConfig`. The store never validates; the panel does, before committing. (The architecture rule "every load goes through migrate then validate" concerns loading documents; panel input is validated at the form.)
- **Importer to errors.** `validate.ts` produces `{code, path, message}` with the `schema.*` codes of L2 and L6. A review fix (finding m1): the *message* names the setting the way the user wrote it. The path is a JSON Pointer in which `/` and `~` inside a key are written `~1` and `~0`; the first version of the new code derived the message from that escaped path, so the human text showed the escaped form (the review's report). The fix undoes the escapes in the message only (first `~1`, then `~0`, in the order RFC 6901 requires), and the test in `serialize.test.ts` tries the keys `a/b`, `a~b` and `a~1b`, checking the path is escaped and the message is not. **Code and path are the contract; the message is for people.**
- **Fixtures.** The `config` fixture family (`contracts/fixtures/config/`, 19 files at `44bd7f4`) validates a catalog node's config against the catalog schema. T5b made a `checkRequired` field **mandatory** in every config fixture, so a case always states the mode it runs in. The old `cfg-missing-required` became two: `cfg-missing-required-checked` (an empty `llm.prompt` config with `checkRequired: true` expects `schema.required` at `/provider` and at `/prompt`) and `cfg-missing-required-unchecked` (the same config with `false` expects no errors). The workflow family changed in the same direction: `wf-invalid-schema-required` was **deleted** from `workflow/invalid` and two **valid** fixtures were added, `wf-valid-incomplete-required-key-absent` (an `llm.prompt` with `config: { prompt: 'hi' }`, no provider) and `wf-valid-empty-config-required-keys` (empty configs for an `llm.prompt` and an `http.request` node). Fixtures for `groq` (`cfg-valid-provider-groq-agent`, `cfg-valid-provider-groq-llm-prompt`) and one that pins `maxIterations: 2.5` as still valid (`cfg-valid-max-iterations-fraction`; its description says T6 turns it into an integer with a migration, and the catalog source carries a matching comment) were added.
- **Planned, not built.** The `required-field-empty` warning (T7); the node migrations of T6 (which may call `applyDefaults` when a new version introduces a property, as `CONFIG_SCHEMA.md` anticipates); execution with `checkRequired: true` (Phase 3). **TypeScript only: no Python parity is claimed.**

**Who applies defaults and who checks `required`, moment by moment (at `44bd7f4`):**

| Moment | Code | Applies defaults? | Checks `required`? | Other schema rules (type, enum, range, unknown key) |
|---|---|---|---|---|
| Creating a node | `addNode` calls `applyDefaults(def.configSchema)` | **Yes**, explicit defaults only; a required key with no default stays absent | No | Not checked (the defaults are valid by the catalog test) |
| Importing a file | `validateWorkflow` calls `validateAgainstSchema(..., { checkRequired: false })` | **Never**; `raw.config` is kept exactly as read | **No** (decision C1) | Yes: any violation rejects the document |
| Editing in the panel | `parseConfigInput` validates one property value with `checkRequired: false` | No | No (one property) | Yes, for that value; invalid input is not committed |
| Executing (Phase 3, planned, not built) | planned: `validateAgainstSchema(..., { checkRequired: true })` | Not decided here | **Yes**, as errors (D-025) | Yes |
| Warning the user (T7, planned, not built) | planned `required-field-empty` warning | n/a | Reported as a warning, never blocks (D-018) | n/a |

### 6. Important code paths

| Where | What it does |
|---|---|
| `frontend/src/catalog/nodes.ts`: `PROVIDERS`, `nodeDefinitions` | The six definitions; schema `default`s; `additionalProperties: false`; `ui` hints; the one provider list |
| `frontend/src/workflow/types.ts`: `NodeDefinition`, `NodeUi` | `configSchema: ObjectSchema`, optional `ui`; no `defaults` |
| `frontend/src/store/editorStore.ts`: `addNode` | The only production call of `applyDefaults` |
| `frontend/src/workflow/validate.ts`: `validateWorkflow` | Importer: `checkRequired: false`, path mapping, message with unescaped key; never changes `config` |
| `frontend/src/workflow/configSchema.ts`: `parseConfigInput` | Parse typed text for one property (strict parser for JSON), validate, apply the policy limits; returns a value or an error |
| `frontend/src/config-panel/ConfigPanel.tsx`: `ConfigPanel`, `ConfigField`, `toDraft` | Form generated from schema and `ui`; the `(not set)` option |
| `frontend/src/config-panel/propertyOrder.ts` | Field order: `ui.order` first (existing names, each once), then the rest in schema order |
| `frontend/src/workflow/codeExemptions.ts`: `EXPORT_ONLY_CODES`, `SCHEMA_ONLY_CODES` | Test-only exemption lists; `schema.required` is on the second |
| `contracts/CONFIG_SCHEMA.md` | The specification: status, `checkRequired` and C1, defaults, the `ui` block, error codes |
| `frontend/src/catalog/catalog.test.ts` | Catalog tests: schema in the subset, `additionalProperties: false`, `PROVIDERS` identity, `ui` vocabulary, literal initial configs |
| `frontend/src/store/editorStore.test.ts` | The two source-text guards |
| `frontend/e2e/config-panel.e2e.ts` | Browser tests, including the export-checking provider and `(not set)` tests and the `rows` assertion |

**How the tests are built (Module 12).**

- **Golden values copied from the brief.** The test "addNode produces exactly the documented initial config for each of the six types" in `catalog.test.ts` states the literal config of each type (for example `{ provider: 'ollama', model: '', systemPrompt: '', prompt: '', temperature: 0.7 }`), and its comment says they are copied from the brief, **not computed from the catalog**. If the expectation were computed from the catalog, a mistake in the catalog would pass its own test. This is how the claim "existing nodes start exactly as before" is checked.
- **A guard by reading source text.** "applyDefaults is called by production code in exactly one place: addNode" uses Vite's eager raw-text import of every source file, drops tests and `jsonSchema.ts` itself, and requires the list of callers to equal `['/src/store/editorStore.ts']` with one call there. It turns the sentence "the importer never fills in defaults" into a checked fact.
- **Test-only code kept out of production.** "codeExemptions is imported by tests only" does the same for the exemption file; it includes a **self-test of its own regular expression** (it must match a static import, a re-export and a dynamic `import()`, and must not match a different file name or a comment), then requires at least one test importer (so the guard cannot pass vacuously) and no production importer. This came from review finding m3.
- **A single list, proved by identity.** The test compares `providers` to `PROVIDERS` with `toEqual` *and* with `toBe` (same object). With only `toEqual`, a literal copy of the list in `nodes.ts` would pass; the `toBe` assertion fails for any copy. (See the review story below.)
- **Behaviour through the browser.** Typing and exporting in a real browser catches what unit tests on functions cannot: that the select shows what the config holds.

### 7. Alternatives and trade-offs

| Option | Good | Costs |
|---|---|---|
| **Settings panel generated from the schema plus a small `ui` block (chosen)** | One definition per node; adding a node or a setting needs no new form code; the panel cannot drift from the validator | A generic form is less flexible than a custom one; the `ui` vocabulary must be policed (the reserved widgets) |
| **A hand-coded form per node type** | Full control of layout and wording | Six forms now and one more per node forever; each can disagree with the validator; the exact failure the catalog exists to avoid |
| **A library such as react-jsonschema-form** (general knowledge, not evaluated here) | Mature, generates forms from JSON Schema, has a separate `uiSchema` (the same split we made) | A new dependency (needs approval, `CLAUDE.md` section 4); our own error codes, strict parsing and policy limits would still need wiring; a bigger feature surface than six node types need |
| **Implicit defaults on import** (fill in missing values) | Every node looks complete; no "(not set)" state | Importing changes the file's data; hides the user's mistake; the export is no longer what was imported; imports depend on today's catalog version |
| **Reject incomplete drafts on import (the old behaviour)** | Simple; every imported node is complete | You cannot reload your own unfinished work; contradicts D-017 and D-025 |
| **Derive the UI only from TypeScript types** | Less data | Types are erased at run time; they cannot be sent to a backend or an AI generator, and they cannot say "between 0 and 2" or "one of these four" |
| **Make `required` also mean "must have a default"** | Removes the "(not set)" case | Forces a made-up default for settings with no sensible one (a prompt, a URL); the plan's revision P1 rejects this explicitly |

### 8. Real-world applications

*From general knowledge, not from this repository.*

- **Schema-driven forms** are everywhere: workflow tools describe each node's parameters as data and render a settings panel from it; Kubernetes-style and OpenAPI tooling generate forms and documentation from schemas. Keeping presentation hints in a separate block mirrors the `uiSchema` of React JSON Schema Form.
- **Draft saves.** Any product that lets you save unfinished work (document editors, form builders, CI configuration) separates "well-formed" from "complete", and enforces completeness only at the moment of use (submit, run, deploy). Decision C1 is that pattern.
- **Differential testing when replacing a component.** Before swapping an old implementation for a new one, teams run both on the same large input set and inspect every difference (used when migrating parsers, query planners and payment rules). The only differences allowed are the intended ones.
- **UI that must not misrepresent state.** A control that displays something the model does not hold (an unselected dropdown showing its first item, a checkbox that looks off for "unknown") is a classic source of silent data errors in forms; "unset" is usually given its own visible state.
- **Single source of truth with an enforcing test.** Large codebases derive enums and lists from one definition and use a test or lint rule to forbid copies.

### Three lessons from our own review (real examples)

1. **Differential testing found nothing it should not have, and one thing nobody meant.** The Opus reviewer ran the **old** validator and the **new** one on about **60,000 generated documents** and compared the results (the reviewer's report, relayed by the Principal Architect; I did not repeat it). The only differences were the two intended ones: an absent required key now imports, and `groq` is now an accepted provider. It also found **one accidental difference**: for a config key containing a slash or a tilde, the *message* text changed, because the new code derives the setting name in the message from the path, which is JSON-Pointer-escaped. That was fixed in `44bd7f4` (the message undoes the escapes; I read `validate.ts` and the test in `serialize.test.ts`). The lesson: when you replace a component, "all tests still pass" is not enough; **compare the old and the new on the same inputs and demand an explanation for every difference**. A difference you did not intend is a bug in one of them.
2. **A behaviour change made a state reachable that was unreachable before, and the bug appeared in the UI, not in the validator.** This is the "(not set)" story of section 4 (review finding M1, fixed in `44bd7f4`). Nothing in the changed validator was wrong. C1 was a deliberate, approved decision. But a different part of the system had been relying on the old rule ("every node has a provider") without anyone writing that down. The reviewer found it (the report; I read the fix and its test, not the review itself); the way to find such a bug is to ask what the importer now allows and walk each consumer of the config. The e2e test checks the **export**, not just what is displayed, because the displayed value was exactly the thing that could not be trusted. Habit to take away: when you loosen a rule, list every consumer of the data and ask "what do they do with the newly possible values?".
3. **Mutation testing exposed two weak tests (a report from the review round; I did not repeat the runs).** First, a **literal copy** of the provider list in place of the shared constant survived all tests, because the assertion only compared contents; the identity assertion (`toBe(PROVIDERS)`) was added, with a message "derived from PROVIDERS itself, not a second copy of the list". Second, the textarea's `rows` setting survived because nothing observed it; the e2e assertion `toHaveAttribute('rows', '4')` was added (and a second test for the default 5 rows of a JSON field). In both cases the code had a rule and the tests had no way to notice it being broken. The same review round added the source-text guard for `codeExemptions` (m3) and the `ui` vocabulary check (m2). I also noticed, reading the panel (my own observation, not a review finding, and not a bug in today's catalog): a `boolean` property that is absent is drawn as an **unchecked** box (`checked={value === true}`), which is the same kind of "the screen shows a value the config does not hold" problem. No catalog property is a boolean today, so it cannot occur yet.

### Knowledge Check / Interview Questions

*Answers are not given here. Study this lesson and `docs/LEARNING.md`, then answer all questions in the dedicated learning session at the end of the project.*

1. A user saves a draft containing an LLM Prompt node with no `provider` and later imports the file. Walk the file through the importer: which function checks the config, with which `checkRequired` value, what does it do with the missing `provider`, and what does the settings panel show for that node? Then say what each of these would do with the same node: creating a fresh LLM Prompt node, and (Phase 3, planned) executing the workflow. Why is it correct that these four moments behave differently?
2. The importer stores `config: raw.config` and never applies defaults. Give two concrete harms if it filled in `provider: 'ollama'` for you, one about the "export, import, export is byte-identical" promise from Lesson L5 and one about hiding a mistake. Why is `addNode` still allowed to apply defaults, and how does the test "applyDefaults is called by production code in exactly one place" make the rule hard to break by accident?
3. Explain the "(not set)" bug as a chain of causes: what was true before decision C1 that made it impossible, what C1 changed, why did the browser display "ollama" for a node whose config had no provider, and why does the e2e test export the workflow instead of only checking what the dropdown shows? Name another control in the panel (reading `ConfigField`) that could have the same problem if the catalog had a certain kind of property, and say what you would do.
4. Compare generating the settings panel from `configSchema` plus a `ui` block with (a) one hand-written form per node and (b) a form library. For each, say what would drift or what would have to be wired by hand. Why does the `ui` block exist at all instead of putting `multiline` back into the schema, and what does it mean that most `widget` values are "reserved"? What does the catalog test do to stop a reserved value from being used?
5. `schema.required` can no longer be produced by importing a workflow, yet it stays in `ERROR_CODES`. Explain why, where it is exempted from the "every code has a workflow fixture" guard and why that exemption list may be imported only by tests, and which fixtures still cover the code. What does it mean that every config fixture now has a mandatory `checkRequired` field?
6. The review used a 60,000-document differential run between the old and the new implementation, and mutation testing. For each of these four findings (the escaped key in a message, the "(not set)" select, the copied provider list, the `rows` attribute), say which technique found it and why an ordinary test run that was already green had not. When you replace a working component, what would you do to be confident the only behaviour changes are the intended ones?

---

## Lesson L8: Old files keep working (versioned node migrations, `agent.autonomous` version 2, and the upgrade banner)

**Task:** Phase 1.1 T6 (versioned node migrations, decision H3), commit `2baee23`, plus its review-fix commit `be43319`. **Modules:** 3 (Workflow JSON and State Management: two version numbers, the import pipeline), 7 (Node Registry: the catalog over time, latest-only catalog plus a migration registry), 2 (Frontend: a user-visible banner, a live region, keyboard focus), 12 (Security, Testing and Deployment: differential testing against a reference, equivalent mutants, fixtures as a specification, honest test claims).

*Status of the code described here.* This lesson describes the code **at commit `be43319`**. **What I verified myself:** I read both commits' messages and `--stat`, and these files at that state: `contracts/MIGRATIONS.md`, `contracts/README.md` (the import-phase rules), `frontend/src/workflow/nodeMigrations.ts` and `nodeMigrations.test.ts`, `serialize.ts` (`importWorkflow`), `validate.ts` (the version branch), `migrate.ts`, `errors.ts` (the code list), `frontend/src/catalog/nodes.ts` (`agent.autonomous`), `frontend/src/store/editorStore.ts`, `frontend/src/app/UpgradeBanner.tsx`, `describeUpgrades.ts`, `importButton.ts`, `Toolbar.tsx`, `App.tsx`, `frontend/e2e/import-export.e2e.ts`, the runner section for the `migration` family in `frontend/src/contracts/fixtures.test.ts`, the fixtures `mig-agent-half-48-5.json`, `wf-invalid-node-version-only-wins-over-document-errors.json` and `wf-invalid-node-version-only-no-edge-cascade.json` (and the file lists of `contracts/fixtures/migration/` and `workflow/invalid/`), and `docs/PHASE1_1_PLAN.md` section 3.3. **What I ran myself:** one small JavaScript check in this session, comparing `Math.round(x)` with `Math.floor(x + 0.5)` for about 5,000,000 random numbers between 1 and 50 plus values just below and just above every half: 0 differences (section 2). **What I did not run:** the test suites. The counts **17 test files, 988 unit tests and 39 browser tests at `be43319`** are the numbers from the Principal Architect's `npm run verify` (exit 0), reported to me. I also did not run Python: what I say about Python's `round()` is **general knowledge, not run in this session**. The reviewer's comparisons and mutation findings below are **reports**, not things I repeated. The migration to a database (Phase 2) is **planned and not implemented**.

### 1. The problem

Imagine you saved a workflow last week that contains an Agent node. In that file the Agent's "max iterations" setting is the number `2.5`. (A silly value, but the old version of the editor allowed it, because the setting was just "a number from 1 to 50".) This week we decide that max iterations must be a **whole number**, because "run the loop two and a half times" means nothing. The catalog changes, and now `2.5` is invalid.

Three bad outcomes are possible, and we want none of them:

1. **Your old file stops opening.** Every file made before the change would show "Import failed". That breaks the architecture rule "preserve backward compatibility" (`.claude/rules/architecture.md`).
2. **Your file is changed behind your back.** If the editor quietly rewrote the old file on disk, you could not trust any file you own.
3. **The change is invisible.** If `2.5` quietly became `3` and nobody told you, the workflow would behave differently and you would not know why.

So the problem has three parts: keep old files working, never rewrite them, and always tell the user what changed. There is also a quiet fourth part, which the review found: the rules for all this must be written down precisely enough that a **second implementation** (the Python backend of Phase 2) behaves identically.

### 2. The concept

**Two version numbers, changing independently.** A workflow file has a `schemaVersion` at the top (the format of the whole document, today `"1.0"`) and every node has a `typeVersion` (the version of that one node type's settings and ports). If we change how the Agent node's settings work, the file format is the same, so only the Agent's `typeVersion` moves, from 1 to 2. Upgrading the first is `migrate()` in `frontend/src/workflow/migrate.ts` (a registry that is still **empty**: `MIGRATIONS = {}`, because `schemaVersion` has never changed). Upgrading the second is `migrateNodes()` in `frontend/src/workflow/nodeMigrations.ts`, which is new.

**A migration** is a small, pure function that turns the settings written for version N into the settings for version N+1. "Pure" means: same input, same output, no clock, no random numbers, no file or network access, and it must not throw on any input (it is **total**).

**Latest-only catalog, history in a registry.** The catalog (`frontend/src/catalog/nodes.ts`) serves only the newest definition of each node type: `agent.autonomous` has `version: 2` and nothing about version 1. The knowledge of how to get from 1 to 2 lives in a separate list, `NODE_MIGRATIONS` in `nodeMigrations.ts`. So the catalog never has to carry old definitions around.

**In memory, never on disk.** The upgrade happens to the data after the file has been read. The saved file is never touched. If you later press Export, that creates a **new** file at the new version.

**Half up versus half to even.** The first real migration rounds a fractional `maxIterations`. The rule is **half up**: `Math.floor(x + 0.5)`, so 2.5 becomes 3 and 3.5 becomes 4. Python's built-in `round()` rounds **half to even** (also called banker's rounding): 2.5 becomes 2, 3.5 becomes 4, 48.5 becomes 48. (General knowledge, not run in this session.) If the Python backend of Phase 2 used `round()`, the same file would upgrade to different values in the browser and on the server. This is why the rule is written in `contracts/MIGRATIONS.md` ("Rounding hazard for a Python port").

**An equivalent mutant, again.** In Lesson L4 you met mutation testing (break the code on purpose; a good test then fails) and the *equivalent mutant* (a break that does not change behaviour, so no test can fail). Here is a sharper example. Change `Math.floor(value + 0.5)` in `nodeMigrations.ts` to `Math.round(value)`. In JavaScript these two agree on every value the migration touches (it only rounds values from 1 to 50 that have a fraction; I checked about 5,000,000 random values and the values around every half and found 0 differences, and `MIGRATIONS.md` states the same). So **no TypeScript test can tell them apart**, however clever. That is not because the tests are weak; the two programs are the same program for these inputs. But `Math.round` is *spelled* like the thing a Python author would be tempted to copy (`round`), and the two languages differ here. The tests in TypeScript therefore cannot protect the rule. Section 3 says what does.

### 3. Why we selected this approach

1. **A chain of small steps, up to the latest.** `migrateNodes` follows `from -> to` steps until it reaches the catalog's latest version. A node at version 1 of a type that is now at version 4 runs 1->2, 2->3, 3->4 and gets **one** report saying "from 1 to 4" with all the notes in order. The test "registry integrity" in `nodeMigrations.test.ts` forces every step to be exactly one version (`to` equals `from + 1`) and every version below the latest to have a step. The alternative (a direct migration from every old version to the latest) needs a new function for every old version each time the type changes.
2. **Check the whole chain before running any step.** The code first builds the chain and only then migrates. A gap rejects the file before any migration of that node runs.
3. **All or nothing.** If any node has a version problem, the import is rejected, and the editor keeps what is currently open. A half-migrated document would be a worse state than either end.
4. **Never silent.** `migrateNodes` returns one `UpgradeReport` (`nodeId`, `type`, `from`, `to`, `notes`) per upgraded node, even when nothing visible changed (empty notes). The editor shows them. A migration that changed nothing is still reported, because the user should always know the file is not the one they saved.
5. **Round only what was valid before.** The migration rounds `maxIterations` only if it is a finite number with a fractional part **and** was valid at version 1 (1 to 50). Everything else (absent, text, `null`, `0.5`, `51`, an already whole number) is left exactly as it is, so validation reports it as version 1 would have. A migration should not "fix" garbage, because then it would be guessing what the user meant.
6. **Write the rule down and pin it with data, because tests in one language cannot.** The rounding rule is in `MIGRATIONS.md`, in a comment on `NODE_MIGRATIONS`, and in fixtures with values chosen so that the two rules disagree: `mig-agent-half-48-5.json` expects `49` and its description says outright that Python's round would give 48 and "a port that uses it fails here". Of the five `.5` fixtures (1.5, 2.5, 3.5, 48.5, 49.5) only 2.5 and 48.5 actually tell half up from half to even (the others agree under both rules); `MIGRATIONS.md` says so. **What you do about an equivalent mutant** is therefore not "write a test that fails" (impossible here) but: (a) say clearly in the spec why the rule matters, (b) put the discriminating cases in shared data that the *other* implementation must pass, (c) accept honestly that the TypeScript suite alone will not notice `Math.round`. A hand-written banker's-rounding mutant is **not** equivalent: it would give 2 for 2.5, and the table test "maxIterations is rounded HALF UP" in `nodeMigrations.test.ts` lists 2.5 and 48.5 (that last point is my reasoning from the table, not a run).
7. **Version errors are a phase of their own.** See section 4. The review found that this behaviour had not been written down correctly.

### 4. How it works internally

The import pipeline (`importWorkflow` in `frontend/src/workflow/serialize.ts`):

```mermaid
flowchart TD
  F["File bytes, read in the Toolbar<br/>(Toolbar.tsx onImport: file.arrayBuffer)"] --> S["size and UTF-8 checks, strictParse<br/>(parse errors stop here)"]
  S --> D["migrate: document schemaVersion<br/>(migrate.ts, no real steps yet)"]
  D --> N["migrateNodes: node typeVersion<br/>(nodeMigrations.ts, on the raw parsed document)"]
  N -- "any node.version-newer or node.no-migration-path:<br/>ONLY those errors are returned, at most 20" --> E["error panel in the toolbar;<br/>open workflow untouched, no banner change"]
  N -- "no version error: new document + UpgradeReport list" --> V["validateWorkflow: document, nodes, connections, config<br/>(validate.ts)"]
  V -- "errors" --> E
  V -- "valid" --> L["loadWorkflow(workflow, upgrades)<br/>(editorStore.ts)"]
  L --> B["UpgradeBanner shows the reports<br/>(role status region); Dismiss clears them"]
```

**Phase 1: version problems only.** `migrateNodes` looks only at "well-formed" nodes: an object with a string `id`, a string `type` and an integer `typeVersion`. Anything else is left for the validator to call `node.malformed`. For each such node it compares the file's version with the catalog's latest version of that type. There are exactly five outcomes:

| Node in the file | `migrateNodes` does | Result |
|---|---|---|
| Type known, version **equal** to the latest | nothing | node untouched, no report |
| Type known, version **older**, complete chain of steps to the latest | runs the steps in order | new node at the latest version, **one** `UpgradeReport` (banner) |
| Type known, version **older**, no complete chain (a gap, or below the first step, e.g. version 0) | nothing runs | error `node.no-migration-path` at `/nodes/<i>/typeVersion` |
| Type known, version **newer** than the latest | nothing | error `node.version-newer` at `/nodes/<i>/typeVersion` ("created by a newer editor") |
| Type **unknown** to the catalog | skips it | in phase 2, `validateWorkflow` reports `node.unknown-type` at `/nodes/<i>/type` |

`node.unknown-type` is now **only** for an unknown type. Before T6 a known type with a bad version also gave `node.unknown-type`, which was a misleading name for "this node type exists, but not at that version". `validateWorkflow` still guards its own entry (it can be called without the migration step in a test): for a known type with a missing version it produces the version error via the shared helper `nodeVersionProblem`, with a message that says "has not been migrated" rather than claiming no migration exists (a review fix, tested in `nodeMigrations.test.ts`).

**The two-phase rule.** If phase 1 finds even one version error, the import returns **only the version errors** (at most 20, in node order). Document-level errors, malformed nodes, duplicate ids, connection errors and config errors of the same file are not reported until the next import. Reason: a node of the wrong version cannot be checked against a catalog that does not have its version, so continuing would produce confusing follow-on errors (for example `connection.unknown-node` for every edge to that node). This is written in `contracts/README.md` ("Phase 1" and "Phase 2") and `MIGRATIONS.md` (rule 4), and pinned by two fixtures (see story b in the review section below).

**What `migrateNodes` does to the data.** It never mutates its input (the test deep-freezes the input and checks it is unchanged). If no node needed upgrading it returns the input document itself; otherwise it returns a new document that shares every untouched node, edge and config by reference. It builds `Map`s for the catalog's latest versions and for the steps instead of using plain objects, because the `type` string comes from an untrusted file and a type named `constructor` or `__proto__` must be ordinary data, not a lookup into the object prototype (the same safe-lookup habit as L2 and L4; tested with prototype-named types). Errors are capped by `MAX_ERRORS` (20) from `errors.ts`.

**Port renames.** A migration may also return `portRenames` (`inputs` and `outputs`, old name to new name). The edges that touch the migrated node are rewritten in the same step, so renaming a port cannot orphan an edge. **No real migration renames a port yet**; this is tested only with synthetic registries (`nodeMigrations.test.ts`: "port renames rewrite the matching edge ends", "renames of a chain compose in step order").

**Phase 2: normal validation**, on the migrated document, using the latest catalog definition. Then `loadWorkflow(result.workflow, result.upgrades)` in the Toolbar calls the store (`editorStore.ts`), which keeps `upgrades` next to the workflow. `New` (`reset`) and any later load replace `upgrades`; `dismissUpgrades` empties it. A **failed** import calls neither, so the previous graph and the previous banner stay (an e2e test checks this).

**The first real migration (`agent.autonomous` 1 to 2).** In `nodes.ts` the Agent entry is `version: 2` and `maxIterations` is `{ type: 'integer', minimum: 1, maximum: 50, default: 10 }`, with a comment pointing at the migration. New nodes are created at version 2 (`addNode` uses the latest definition). A version 1 agent whose value is already whole, or absent, **still migrates to version 2** and is reported with empty notes. A value like `50.4` or `0.5`, which was invalid at version 1 and is not rounded, now fails `schema.type` (it is not an integer) where version 1 would have said `schema.maximum` or `schema.minimum`; whole out-of-range values like `51` and text give the same error code as before. This is stated in `MIGRATIONS.md` and the property test checks it.

**The banner (Module 2).** `UpgradeBanner.tsx` reads `upgrades` from the store with a selector and renders `describeUpgrades(upgrades)`: "Upgraded 1 node (Agent v1 to v2). Review the changes. Your original file was not modified.", then one line per note with the node id (cut to 40 characters) and the note (cut to 200) through `shorten`, so a hostile huge note cannot flood the page. Two accessibility details from the review: (a) the container with `role="status"` (a **live region**: screen readers announce changes inside it) is **always mounted**, empty when there is nothing to say, because a live region that is added to the page together with its content is often not announced, while one already in the page is (the code comment says this; it is general screen-reader behaviour, which I did not test); (b) when you press Dismiss, the button disappears, so keyboard focus would fall back to the page. The code moves focus to the Import button (`IMPORT_BUTTON_ID` in `importButton.ts`, set on the button in `Toolbar.tsx`), the thing you were using when the banner appeared. The e2e test asserts the region count is 1 before and after, and that Import has focus after Dismiss.

### 5. How it communicates with other components

- **Toolbar to importer.** `Toolbar.tsx` reads the picked file into bytes and calls `importWorkflow(bytes, nodeDefinitions)`. It never gives the importer a file handle, only the content (a guarantee, see section 6).
- **Importer to the catalog.** `migrateNodes` receives the catalog as a parameter, together with the registry (a default parameter, `NODE_MIGRATIONS`). That is why tests can pass synthetic catalogs and registries to exercise chains and renames that the real registry does not have.
- **Importer to the store.** The result `{ ok: true, workflow, upgrades }` goes to `loadWorkflow`; `{ ok: false, errors }` goes to the error panel only.
- **Store to banner.** `UpgradeBanner` subscribes to `upgrades` through a selector; `App.tsx` mounts it.
- **Fixtures to the future Python runner.** The `migration` fixture family (10 files in `contracts/fixtures/migration/`) holds a version 1 document in and the expected `upgrades` plus migrated `workflow` out; the runner in `frontend/src/contracts/fixtures.test.ts` imports each, compares both, and re-imports the exported result, expecting nothing to upgrade. The `workflow/invalid` family has the version cases (it has 107 files at `be43319`, 11 more than at `44bd7f4`). **TypeScript only: no Python parity is claimed.**
- **Planned, not built (Phase 2).** `MIGRATIONS.md` says the backend will migrate **in memory at read time** and persist the upgraded workflow **only when the user saves**, as a **new immutable version**, never touching the stored old one. No backend exists.

### 6. Important code paths

| Where | What it does |
|---|---|
| `frontend/src/workflow/nodeMigrations.ts`: `NODE_MIGRATIONS`, `migrateNodes`, `nodeVersionProblem`, `UpgradeReport` | The registry (one real step), the pure pipeline stage, the shared version-error builder, the report type |
| `frontend/src/workflow/serialize.ts`: `importWorkflow` | The full pipeline: size and encoding, `strictParse`, `migrate`, `migrateNodes`, `validateWorkflow`; returns `{ workflow, upgrades }` or errors |
| `frontend/src/workflow/validate.ts` | The version branch for a known type with a missing version, and `node.unknown-type` for unknown types only |
| `frontend/src/workflow/errors.ts` | The new codes `node.version-newer` and `node.no-migration-path` |
| `frontend/src/catalog/nodes.ts`: `agent.autonomous` | `version: 2`, `maxIterations` as an integer |
| `frontend/src/store/editorStore.ts`: `loadWorkflow`, `dismissUpgrades`, `reset` | Holds `upgrades` beside the workflow |
| `frontend/src/app/UpgradeBanner.tsx`, `describeUpgrades.ts`, `importButton.ts` | The banner, its sentence, the focus target |
| `contracts/MIGRATIONS.md`, `contracts/README.md` | The specification: eleven rules, the two phases, the rounding hazard, the fixture layout |
| `contracts/fixtures/migration/*.json`, `workflow/invalid/wf-invalid-node-version-*.json` and `wf-invalid-agent-v1-*.json` | The executable specification |
| `frontend/src/workflow/nodeMigrations.test.ts`, `frontend/e2e/import-export.e2e.ts` | Unit, property and source-guard tests; browser tests of the banner |

**What "never overwritten" really means.** This was corrected in the review (the review section below, story c). The honest guarantees, from `MIGRATIONS.md` rule 8: (a) the importer only receives the file's **content**, never a handle it could write through; (b) a browser gives a page no write access to a file picked in a file input; (c) a source-text test in `nodeMigrations.test.ts` checks that the five import-path files (`nodeMigrations.ts`, `migrate.ts`, `serialize.ts`, `strictJson.ts`, `Toolbar.tsx`) use no write-capable, storage or network API (`showSaveFilePicker`, `createWritable`, `localStorage`, `fetch(` and so on). It first tests its own regular expressions on good and bad examples, so the guard cannot pass vacuously, the same habit as the `codeExemptions` guard in L7. Exporting is a separate, explicit action that creates a **new** file.

### 7. Alternatives and trade-offs

| Option | Good | Costs |
|---|---|---|
| **Latest-only catalog plus a migration registry, upgrade in memory (chosen)** | The catalog stays small; each step is tiny and testable; old files open; the file on disk is never touched; the user is told | A new registry to maintain; each type change needs a step and fixtures; old versions cannot be "executed as they were" |
| **Keep every old node definition in the catalog and run old versions forever** | No data conversion; exact old behaviour | The catalog and (later) the engine registry grow without limit; every old version needs executors and tests forever; the UI must draw old forms; the single source of truth stops being single |
| **Migrate in the database** (a bulk data migration of stored rows, for example with Alembic; general knowledge) | One-off, everything converted | Changes data nobody asked to change; irreversible without backups; needs a backend (**not built**); the planned Phase 2 design instead migrates at read time and saves a new version only on an explicit save |
| **Rewrite the saved file automatically** | The file is current the next time | Violates trust: the user's file changes silently; a shared file would be changed by merely opening it; an older editor can no longer open it |
| **Reject old files** | Trivial | Every catalog change breaks every saved workflow; contradicts the backward-compatibility rule |
| **A versionless "tolerant reader"** (accept anything that looks close enough) | No version numbers | No way to know what an old file meant; rounding `2.5` and every similar rule becomes guesswork scattered through the code; two implementations drift apart |
| **One direct migration from each old version to the latest** | One function per file version | A new function for every old version at every change; chains of single steps compose automatically |

### 8. Real-world engineering applications

*From general knowledge, not from this repository.*

- **Database schema migrations** (Alembic, Rails, Flyway) are ordered single steps from version N to N+1, applied in sequence, with a table recording the version: the same shape as our chain.
- **Schema evolution in data formats** (Protocol Buffers, Avro) and **API versioning** (Kubernetes converts between API versions) follow the same ideas: old data keeps working; a reader that meets a *newer* version than it knows either refuses or ignores safely, and ours refuses (`node.version-newer`).
- **Office documents and design tools** open an older file, convert it in memory, and ask you to "Save as" the new format rather than overwriting the old one without asking.
- **Lock files and state files** (Terraform state, package lock files) carry a format version and refuse a file written by a newer tool.
- **Cross-language ports and conformance suites.** When one rule must hold in two languages, the shared test data and the written rule are the safeguard, exactly as for the JSON text rules of L5. Rounding is a classic place where languages differ.
- **Differential testing against an independent reference**: write your own version of the specification and compare outputs on many generated inputs; any difference is a bug in one of the two or in the spec.

### What the review found (real examples)

The following are reports relayed to me, except where I say I read the code.

**(a) The reviewer wrote its own implementation, and found no difference.** The Opus reviewer wrote its **own reference** of the migration pipeline from the specification and compared it with the real one on **6 runs of 20,000 generated documents (reported: 0 differences)**. It also compared the **old and the new importer** on **120,000 documents without version problems (reported: 0 differences, identical export bytes)**. The old importer is the one from before T6; the second comparison proves that adding the new stage changed nothing for any file that has no version problem. Lesson: an independent reimplementation catches the mistakes the author of a function repeats in its own test (L5 told the same story for the JSON writer). It does not prove the code correct; it says that two people reading the specification got the same answers.

**(b) A major bug in the written spec, not in the code.** `contracts/README.md` said that document-level errors are reported first. But `importWorkflow` returns **only** version errors whenever one exists (`if (!upgraded.ok) return upgraded` in `serialize.ts`: I read it). A Python port following the README would have passed **every fixture** (none exercised the combination) and still disagreed with the TypeScript on real files. The fix in `be43319` is to write the two-phase rule down in `README.md` and `MIGRATIONS.md` and to add two fixtures that pin it: `wf-invalid-node-version-only-wins-over-document-errors.json` (a file with a missing document `id` and a newer node reports only `node.version-newer`) and `wf-invalid-node-version-only-no-edge-cascade.json` (an edge to a newer node does not cause a `connection.unknown-node` error). **A spec that is wrong is worse than no spec**, because people trust it. And a fixture suite must pin **every behaviour a second implementation could get wrong**, not just the ones the first implementation happens to test.

**(c) A test that claimed more than it could prove.** The e2e test in `2baee23` was described as proving "the file on disk is never modified" (the commit message of `2baee23` says so). It reads the bytes of the picked file before and after an import and compares them. But the browser gives the page **no write access** to a file chosen in a file input, so this check **cannot fail because of the app**. Whatever we did in the code, the test would pass. That is a vacuous assertion (L1) with a confident name. The fix in `be43319`: the claim in `MIGRATIONS.md` rule 8 is reworded to the three real guarantees (section 6), the e2e check is **kept but labelled** in a comment as documenting the guarantee and unable to fail because of the app, and the source-text guard was **widened** from the migration files to the whole import path, with its regular expressions tested on examples. Lesson: do not overclaim what a test proves; say what the test *can* detect, and put the real protection somewhere that can fail.

**(d) Smaller findings, all with fixes.** A misleading message when `validateWorkflow` is called on a not-yet-migrated node (it used to say "no migration"; now "has not been migrated", tested). The **cap of 20 errors** in `migrateNodes` had no test, which mutation testing exposed (a report); the test "the error list is capped at MAX_ERRORS" now has 25 bad nodes and expects exactly 20, in order. The banner's always-mounted live region and the focus move after Dismiss (section 4). A failed import after an upgrade must leave the previous banner and graph alone: an e2e test was added.

**A process note, honestly.** The Principal Architect's record (`docs/DEVELOPMENT_LOG.md`) says the implementer broke the project's tool rules in **both** rounds: a stray `python` call early, and here-documents and in-place `perl` edits to create or change repository files. The results were checked by type check, lint, the full verify and a scan of the added lines (no carriage returns, no byte order marks, no decoded escape sequences), so the **outcome** was verified, but the **rule** was not kept. A correct result reached by a forbidden route is still a process failure, because the rules exist for the cases where nobody checks.

### Knowledge Check / Interview Questions

*Answers are not given here. Study this lesson and `docs/LEARNING.md`, then answer all questions in the dedicated learning session at the end of the project.*

1. A saved workflow has an Agent node at `typeVersion` 1 with `maxIterations: 2.5`. Walk it through `importWorkflow` stage by stage (parse, document `migrate`, `migrateNodes`, `validateWorkflow`, `loadWorkflow`) and say what is produced at each stage, what the user sees, and what happens to the file on disk. Then change the file so the node says `typeVersion` 3, then 0, then a type `mystery.node`: for each, name the error code and its path, or say that no error occurs and why.
2. Why are `schemaVersion` and `typeVersion` separate, and why does the catalog hold only the latest definition of each node type while the history lives in `NODE_MIGRATIONS`? What would break, in the catalog, the UI and (in Phase 3, planned) the engine, if the catalog kept every old version instead? What does it cost us that it does not?
3. A file has a missing document `id` and also a node of `typeVersion` 3. What does the importer report, and why? Explain why this was a "major bug in the written spec, not in the code", why a Python port could have passed every fixture and still been wrong, and what the two new fixtures do about it. What general rule about fixtures does that suggest?
4. The migration rounds half up with `Math.floor(x + 0.5)`. Explain half up versus half to even, why a Python backend using the built-in `round()` would disagree, and why `Math.round(x)` is an equivalent mutant in TypeScript while a hand-written banker's rounding is not. Since no TypeScript test can fail for `Math.round`, what exactly protects the future Python port? Which of the five `.5` fixtures actually discriminate between the two rules, and why do the other three not?
5. An e2e test compared the bytes of the imported file before and after and was named as proving "the file on disk is never modified". Why can that test never fail because of the app? What are the real guarantees, and which of them could a future change break and be caught? Rewrite the test's claim honestly in one sentence.
6. The reviewer ran two comparisons (a reference implementation written from the spec on generated documents, and the old versus the new importer on documents without version problems). What does each comparison prove, and what can neither prove? How is this different from the mutation checks in earlier lessons, and why does this lesson count an equivalent mutant as a reason for writing a specification rather than for writing a test?

---

## Lesson L9: What does "send it down the true path" mean? (branching, skipping and joins: the execution rules written before the engine, and the `branch` marker)

**Task:** Phase 1.1 T8 (decision H4), code commit `4c696b4` (the `branch` marker and its tests), plus the specification `docs/ARCHITECTURE.md` section 6.1 and decision D-034, rewritten after review and committed in `32066b2`. **Modules:** 5 (Workflow Execution Engine: readiness, scheduling, run result), 6 (Graph Theory and DAG Execution: edge states, reachability, joins, termination), 7 (Node Registry and Data Propagation: ports, `branch`, `multiple`), 12 (Security, Testing and Deployment: how to review a specification), 3 (Workflow JSON: the new marker is catalog metadata and does not change the document).

*Status of what this lesson describes.* **There is no execution engine in AgentForge yet.** The engine is Phase 3 and is planned, not built. What exists is (a) a binding written **specification** of how branches, skipped nodes and joins must behave (section 6.1) and (b) one small code change: an optional `branch` flag on output ports. Everything in sections 2 to 4 about "what the engine does" describes **what the specification says the Phase 3 engine must do**; no code runs these rules, and the specification has been checked by a reviewer reading it and walking examples through it by hand, not by running anything. **What I verified myself:** I read `docs/ARCHITECTURE.md` sections 5, 6 and 6.1 in full, `docs/DECISIONS.md` D-006 and D-034, `git show 4c696b4 --stat` (5 files, +52/-5) and its diff of `contracts/fixtures/catalog/builtin.catalog.json` (exactly two added `"branch": true` lines), `frontend/src/workflow/types.ts` (`PortDefinition`), `frontend/src/catalog/nodes.ts` (all six definitions' ports), `frontend/src/catalog/catalog.test.ts` (the five branch tests), `frontend/src/workflow/connections.ts` (the connection rules), `contracts/README.md` at HEAD (the `branch` note), `docs/PHASE1_1_PLAN.md` section 3.4 (the first draft of the rules, to compare with the final text), and `docs/DEVELOPMENT_LOG.md` Session 12 (the review triage). I checked that `contracts/fixtures/` has no family for execution (so the worked examples below are prose, not executable data). **What I ran myself:** one line of JavaScript, `[].every(() => false)`, which printed `true` (section 2, vacuous truth). **What I did not run:** the test suites. The counts **17 test files, 993 unit tests and 39 browser tests at `4c696b4`** are the numbers from the Principal Architect's `npm run verify` (exit 0), reported to me. The reviewer's findings and its hand walk-through (eleven scenarios) and its mutation run (seven mutants) are **reports** from `docs/DEVELOPMENT_LOG.md`, not things I repeated. The editor warning `node-unreachable` is mentioned in the specification and planned in task T7 (`docs/PHASE1_1_PLAN.md` section 3.6); I do not describe it as built. Remarks about other tools are **general knowledge, not checked here**.

### 1. The problem

Picture a road with a fork and a traffic light. The light (our **Condition** node) sends each car **left or right, never both**. Now ask the questions nobody asked yet:

- What happens to the shop on the road **not** taken? Does it open with no customer, or stay closed?
- If the shop stays closed, what about the warehouse behind it that waits for the shop's delivery? Does it wait forever?
- If the left road is blocked by an accident (a node **fails**), do the shops on the right road close too?
- At the end, the Output node is on the road that was not taken. Did the whole trip fail? Or succeed with nothing to show?

Here is the same thing in AgentForge terms. Take the workflow `Manual Trigger -> Condition; Condition.true -> LLM A; Condition.false -> LLM B; A -> Output`. The drawing says "take the true path". It does **not** say what "the false path is not taken" means for B, or for Output when the condition is false.

Why decide this now, with no engine to test it? Three reasons from the record:

1. **The Product Owner already required it** (D-006, clarification of 2026-11-03): the engine must be "a dependency-based DAG executor, not a sequential node runner", with conditional branching, branch selection, skipped nodes and independent nodes that could run at the same time. A "skipped node" is a word, not yet a rule.
2. **Several parts must agree**: the editor's warnings (T7, planned), the validator, the future Phase 3 engine and the future Python backend. If each guessed the meaning separately, they would drift apart, the same danger as in L3 and L8.
3. **Writing it down first is cheap, and changing a running engine is not.** A wrong rule found now costs a sentence. The same wrong rule found after the engine exists costs code, data and records.

### 2. The concept

**Silence is not the same as saying nothing (absent versus `null`).** When a node finishes, the engine receives a map from output port name to value, for example `{ true: "hello" }`. Compare two cases. If the port `false` is **not in the map at all**, the node made no choice for that port: it was **not selected**. If `false` is in the map with the value `null`, the node **did** send something, and the something is "nothing" (JSON `null`). These must be different, because a perfectly normal node can output `null` as data, and that must never be confused with "this branch was not taken". This is the same distinction as a missing key versus a key whose value is null in any JSON or Python dictionary.

**Four states for a line (an edge).** Think of each edge as having a small light:

| State | Plain meaning | Set when |
|---|---|---|
| `pending` | Not decided yet | Initial: the node at the start of the edge has not finished or been skipped |
| `active` | A value travelled along this line | The source succeeded and emitted on that output port |
| `inactive` | Nothing travelled, and that is fine | The source succeeded but did not emit on that port (a branch not taken), or the source was skipped because nothing reached it |
| `failed` | Something went wrong upstream | The source failed, or the source was skipped because of an upstream failure |

A node is **resolved** when it has `succeeded`, `failed` or been `skipped`. An edge leaves `pending` the moment its source is resolved. A node is **ready** when none of its incoming edges is `pending`. This is dependency-based scheduling: a node waits for **information about every input line**, not for the value of every line (the value may never come; "inactive" is also information).

**Skipping.** A skipped node does not run and emits nothing. Its outgoing edges therefore become `inactive` (or `failed`, if it was skipped because of a failure), so the skip **spreads downstream** by the same rules. No node needs special skip code; skipping is just "all my inputs were silent".

**Vacuous truth, the trap in the first draft.** A statement about "all things in an empty group" is true, whatever the statement: "all the unicorns in this room are purple" is true when the room has no unicorns. In code this is `[].every(...)`, which I ran: `[].every(() => false)` prints `true`. It is called **vacuous truth** (a condition that holds only because there is nothing to check). In a specification, "a node is skipped if all its incoming edges are inactive" is therefore true for a node with **no** incoming edges at all, such as the trigger. Section "What the review found" shows what this did.

**Precedence.** When two rules give different answers for the same situation, the specification must say which wins. The final text uses a **fixed evaluation order** with "the first matching case decides" (rule 5), and says explicitly that **failure beats an active edge**.

### 3. Why we selected this approach

1. **Absence is the signal; nothing else.** The scheduling rules look only at "was this port emitted or not". There is no special "skip value" and no extra flag that the engine has to track. Less to implement and less to get wrong.
2. **A marker, but only to catch bugs.** The optional `branch: true` on an **output** port says "this node is allowed to leave this port unselected". Rule 1 then says: **only** ports marked `branch` may be absent; every other declared output must be present (`null` is allowed); a node with branch ports must emit on at least one of them; a key the node does not declare is an executor error; any violation **fails the node**. Why: without this, a buggy HTTP executor that forgets to return its `body` would silently look like "a branch not taken" and its downstream nodes would be skipped with no error. With the rule, the bug is loud. The marker does **not** drive scheduling (scheduling works from absence alone); the engine reads it for exactly this one check, and static checks and editor warnings can use it too.
3. **Failure wins, and there is no fail-fast.** If one input of a node failed and another is active, the node is skipped with the reason `upstream_failed`. When a node fails, the nodes **not** downstream of it **keep running** until everything is resolved, and then the run ends `failed`. The trade-off is in section 7.
4. **Joins deliver a list in edge array order.** An input port that is not `multiple` accepts at most one edge (the connection rule `input-occupied`, in `connections.ts`). A `multiple` input can have several edges and, in v1, runs when **at least one** is active ("any active"), receiving a **list** of the active values **in the order the edges appear in the document's `edges` array**. The specification gives this as the reason the `edges` order is preserved by the canonical form (array order is data; I did not re-read `canonicalJson.ts` for this lesson). Other join policies (for example "wait for all") are future catalog options, not v1.
5. **One run-or-skip order, written once.** See the diagram.
6. **A specification with worked examples, not a pile of prose.** Seven examples sit directly under the rules in section 6.1; each one is a small test a future engine must pass.

### 4. How it works internally

*(All of this is the specification; no engine executes it yet.)*

**The life of a run, in the order of ARCHITECTURE section 6.** Load: migrate and validate the document and resolve each node to its executor; a workflow with no trigger at all cannot be started (a load error). Plan: cycles are rejected (D-006), so the graph is a DAG and the run must end. Run: every Trigger is ready at the start; **a root that is not a trigger** (a node with no incoming edge that is not in the Triggers category) is skipped at the start with the reason `unreachable`, because nothing starts it. Then, again and again, the engine takes the **ready set** (nodes with no `pending` incoming edge), decides run-or-skip for each, runs the ones that run (independent ones may run at the same time, under a limit, ties broken by node array order), resolves them, and so turns more edges from `pending` into `active`, `inactive` or `failed`, which makes more nodes ready. Because the graph has no cycle, every node is eventually resolved and the loop ends.

**The run-or-skip decision for one ready node** (rule 5). The order matters: the first case that matches decides.

```mermaid
flowchart TD
  R["Node is ready<br/>(no incoming edge is pending)"] --> A{"Is any incoming edge failed?"}
  A -- yes --> S1["SKIP, reason upstream_failed<br/>(outgoing edges become failed)"]
  A -- no --> B{"Does it have incoming edges<br/>and none of them is active?"}
  B -- yes --> S2["SKIP, reason no_active_input<br/>(outgoing edges become inactive)"]
  B -- no --> C{"Does a required input port<br/>have no active edge?<br/>(includes no edge at all)"}
  C -- yes --> S3["SKIP, reason no_active_input<br/>(outgoing edges become inactive)"]
  C -- no --> D["RUN<br/>(a trigger always lands here)"]
```

Read the diagram with the vacuous-truth trap in mind: case B says "**has** incoming edges **and** none active", and the case C test is only reached after B. A trigger has no incoming edges, so A is false, B is false (it has none), C is false (it has no required inputs), and it **runs**. An optional input with no active edge is **absent** from the executor's input map (its key is omitted; it is not `null`).

**Worked examples** (T = Manual Trigger, C = Condition, A and B = LLM Prompt, O = Output; X is a hypothetical node whose input is `multiple`). These are the specification's own examples, in short form with the run result:

| Graph and situation | Runs | Skipped (reason) | Run result |
|---|---|---|---|
| T -> C; C.true -> A; C.false -> B; A -> O, condition **true** | T, C, A, O | B (`no_active_input`) | `succeeded`, result is O's value |
| Same graph, condition **false** | T, C, B | A (`no_active_input`), then O (`no_active_input`: its only edge comes from a skipped node, so it is `inactive`) | `succeeded` with an **empty** result and the note `no_output_reached` |
| C.true -> X.in and C.false -> X.in (`multiple`) | X once | none | X receives a **list with one value** |
| T -> A (fails); A -> O; T -> B; B -> O2 | T, B, O2 | O (`upstream_failed`) | run ends `failed`; result lists O2's value (partial results) |
| J has a `multiple` input fed by a failed node and an active node | none of J | J (`upstream_failed`) | rule 5a wins over the active edge |
| An HTTP node with no incoming edge, not reachable from a trigger | none of it | itself (`unreachable`) | the run is unaffected; the editor is meant to warn (`node-unreachable`, planned T7) |
| A Condition whose input edge is `inactive` | none of it | the Condition (`no_active_input`) | both its outgoing edges become `inactive`, so both branches are skipped |

Two things in this table are worth stopping at. **Row 2** is the answer to "did the whole trip fail?": **no**. A run in which the Output node was on a branch that was not taken **succeeds with an empty result** (`no_output_reached`), because nothing went wrong; it is the workflow author's choice whether that is useful. **Row 4** shows why "no fail-fast" gives deterministic records: B and O2 are not downstream of the failure, so they always run, whichever of A and B finished first.

**Records and aborted runs** (rule 10). Every node run is stored with a status (`succeeded`, `failed`, `skipped`, and for aborted runs `cancelled` or `not_started`) and, for skipped nodes, a reason; every edge records its final state. A user cancellation ends the run `cancelled`; a run-level limit (maximum steps or wall-clock time) ends it `failed` with the limit named; a **node** timeout is just a node failure (rule 7). The monitor and debugger (planned) display exactly these records.

**Deferred on purpose** (rule 11): approval waits (`waiting_approval`) and the meaning of tool edges (the Agent's `tools` input) are not defined here; tool edges are treated as ordinary data edges and their semantics belong to the Phase 4 Agent executor.

### 5. How it communicates with other components

- **Catalog to everything.** `frontend/src/catalog/nodes.ts` is the single source of node types (architecture rule). The marker lives there: the two outputs of `logic.condition` carry `branch: true`; no other port does (a test says so, and says that adding another must update the test **and** the specification). The UI, the validator, the future engine registry and the future natural-language generator all read the catalog, so they all see the marker.
- **Catalog to the shared fixture and the future Python backend.** `contracts/fixtures/catalog/builtin.catalog.json` is the catalog exported as data, and a drift test (L3) compares it with the code. The commit regenerated it; its diff is exactly two added lines. `contracts/README.md` documents the field ("output ports only, never on inputs", "TypeScript only, no Python parity is claimed; the engine that uses it is Phase 3"). A Python catalog in Phase 2 will have to carry `branch` too (planned).
- **The document does not change.** Edges already name ports (`source: { nodeId, port }`), so "the edge that leaves the `true` port" is already expressible. `branch` is **catalog metadata**: it is on port **definitions**, which documents never contain. A catalog test builds a workflow with a Condition and checks that its exported text does not contain the word `branch`. So nothing about saved files, `schemaVersion`, migrations (L8) or the canonical form (L5) changes.
- **Connection rules to scheduling.** `connections.ts` (`checkConnection`) decides which edges may exist: no cycle (this is what makes termination possible), one edge per non-`multiple` input (this is why joins only arise on `multiple` ports), no duplicates. The execution rules assume those checks have already passed ("Load-time assumptions").
- **Editor warnings (T7, planned).** D-034 states as a consequence that the warning rules **may** use `branch`, for example "Condition has only one branch wired", and the specification relies on the planned `node-unreachable` warning for the unconnected non-trigger root. I describe these as planned; I did not read them as built.
- **Phase 3 engine (planned).** Implements the eleven rules; the specification says it must follow them "exactly". Also records per-node statuses and reasons and streams them to the monitor (planned).

### 6. Important classes, functions and code paths

| Where | What it does |
|---|---|
| `docs/ARCHITECTURE.md` section 6.1 | The binding specification: marker, vocabulary, load-time assumptions, eleven rules, worked examples, alternatives |
| `docs/DECISIONS.md` D-006, D-034 | The Product Owner's DAG-executor requirement; the approved decision for the specification and the marker (D-034 records the three review contradictions) |
| `frontend/src/workflow/types.ts`: `PortDefinition.branch?: boolean` | The marker field; the comment says "Output only (never on inputs)" |
| `frontend/src/catalog/nodes.ts`: `logic.condition` | `inputs: [input (required)]`, `outputs: [true, false]`, both `branch: true` |
| `frontend/src/catalog/catalog.test.ts`: `describe('the branch marker ...')` | Five tests: no input port has a `branch` key; Condition has exactly `true` and `false`, both `true`; no other node declares a branch output; a present `branch` value is the boolean `true`; a document and its export never contain `branch` |
| `contracts/fixtures/catalog/builtin.catalog.json`, `contracts/README.md` | The regenerated shared catalog fixture and the documented field |
| `frontend/src/workflow/connections.ts`: `checkConnection`, `isReachable` | The connection rules the execution rules rely on (cycle, `input-occupied` unless `multiple`) |
| `docs/PHASE1_1_PLAN.md` section 3.4 | The **first draft** of the rules, kept for comparison with the final text |

Reading hint: compare plan section 3.4 (ten rules, one pass, "the core runtime rule below needs no marker") with ARCHITECTURE section 6.1 (eleven rules, an order, a start rule, a failure policy, an emission check that **does** use the marker). The difference is the review.

### 7. Alternatives and trade-offs

| Option | Good | Costs |
|---|---|---|
| **Absence is the signal; the marker only guards emission (chosen)** | Simple scheduling; a buggy executor fails loudly; no skip value to understand | The engine must implement the emission check; the specification is long |
| **Skip implicitly whenever an input is missing** (rejected, D-034) | Least to write | A wrongly missing output is silently treated as a branch not taken; bugs become invisible skips |
| **A special "skip token" value on the unselected port** (rejected) | Explicit | Every executor, edge and test must understand the token; it can leak into data |
| **Evaluate both branches and discard one** (rejected) | Easy to reason about as pure data | Side effects (HTTP calls, emails, LLM cost) run on the branch that should not run |
| **A marker that drives scheduling** (rejected) | One flag to look at | Unneeded: scheduling already works from absence; two sources of truth to keep consistent |
| **Fail-fast on the first failure** (rejected for v1) | Stops quickly; less wasted work | Stopping independent branches mid-flight leaves **half-done side effects** (an email sent, a record not written) and the records depend on **timing** (which node was in flight when the stop came). Draining keeps the records deterministic |
| **Drain (chosen): independent nodes keep running** | Deterministic records; side effects either happen fully or not at all per branch | A failed run may spend time and money on branches whose results are partial; a later option could be a per-workflow setting |
| **Join policy "any active" (chosen for v1)** | Fits "one of two branches ran" (the usual case) | A join that must wait for **all** inputs cannot be expressed yet; planned as a future catalog option |

*Other tools (general knowledge, not checked here).* Workflow tools differ on exactly these points. For example, Apache Airflow lets each task choose a "trigger rule" that says when it runs given its upstream results (all succeeded, one succeeded, and so on), and GitHub Actions skips a job whose required job failed unless the author asks otherwise. AgentForge chose one fixed rule set for v1 and left per-node policies for later; I have not compared the details with those tools.

### 8. Real-world engineering applications

*From general knowledge, not from this repository.*

- **Conditional routing and fan-in** are in every workflow and CI system: approve or reject paths, steps that run only `if` a condition holds, and a final job that depends on several earlier ones.
- **Short-circuit evaluation** in programming languages (`a and b` does not evaluate `b` if `a` is false) is the same idea: the branch not taken must not run.
- **Null versus missing** is a classic source of bugs in APIs and databases (a missing field, an explicit null); treating them as different is a design decision, as here.
- **Vacuous truth** appears in database queries (`ALL` over an empty set), in access-control rules ("all required approvals present" when none are required) and in formal specifications; careful authors always ask "what if the set is empty?".
- **Specifications reviewed by example.** Protocol and standards authors test a draft by running worked scenarios through it by hand (or with a model checker) before anyone codes it; contract tests then turn the examples into executable checks.
- **Drain versus fail-fast** is the familiar choice in task runners and test runners (`--fail-fast`, `keep going`): the trade-off between speed of feedback and a complete, deterministic picture.

### What the review found (real examples)

These are reports from `docs/DEVELOPMENT_LOG.md` Session 12, except where I say I read the file. The reviewer (Opus 5.5, read-only) found the **code correct and well tested** and **no blockers**. But it found **three Major contradictions in the specification itself**, which the Principal Architect had written in the first draft (the draft is `docs/PHASE1_1_PLAN.md` section 3.4, promoted into ARCHITECTURE). It did so by **walking eleven scenarios through the rules by hand**. All three were **fixed before the task was accepted** (the commit `32066b2` message says the section was rewritten after review).

**(1) Every trigger would be skipped (vacuous truth).** The draft said a node runs "if every required input port has an active edge" and, in another place, that "a node with only inactive incoming edges is skipped". A trigger has **no incoming edges**: "every required input has an active edge" is true (it has no required inputs) **and** "all its incoming edges are inactive" is also true (it has none). Read literally, the second sentence skipped every trigger, so no workflow would ever start. It also left open what an unconnected **non-trigger** node does (optional inputs make such nodes possible: the LLM Prompt's `input` and the HTTP Request's `input` are not required, as I read in `nodes.ts`). The fix is in the diagram above: a fixed order, case B written as "has incoming edges **and** none is active", an explicit **start rule** (triggers start; a non-trigger root is skipped `unreachable`), and the load-time assumption that a workflow has at least one trigger. This is the best single example in the project of why you ask "what if the group is empty?".

**(2) A join with one failed and one active input: run or skip?** One rule said a `multiple` input runs when any edge is active; another said a node downstream of a failure is skipped. For a join fed by one failed and one active edge, they disagreed. Related gaps: what is the skip reason **two hops** from a failure; fail-fast or drain; what happens when a run is cancelled or hits a limit; what a failed run returns. The fix: edges leaving a node skipped for `upstream_failed` are themselves `failed` (so the failure keeps propagating and the reason stays right two hops away), **failure wins** (rule 5a), **no fail-fast**, and the aborted-run statuses and the partial-result rule were written.

**(3) "No marker is needed at run time" was false.** The draft (and D-034) said the runtime does not need the `branch` marker, yet rule 1 needs it to know which absent ports are legal. And a node with branch ports could emit on **none** of them and silently skip everything. The fix: rule 1 as described in section 3, and the marker paragraph and D-034 corrected (I read both at HEAD). **A claim in a document can be false without any code being wrong**: here the contradiction was between two sentences of the same text.

**Smaller findings (all fixed in the text):** the value shape of a `multiple` input (a list, in edge array order), the `pending` state that was lost when the plan was promoted, "absent" being ambiguous for Python (it now means the key is omitted, not `null`), the run-result shape (a list of `{ nodeId, value }` in node array order), tool edges, an example that was not buildable with today's catalog (the specification now uses a hypothetical node X), a stale `PortDefinition` block in section 5 (I checked: it now shows `branch`), and a misplaced Deployment paragraph.

**Code nits, carried into the next round.** The reviewer's mutation run (seven mutants: six killed, one survived) found that the test "a document and its export never contain branch" checks only the exported **text**; a mutant that stored port definitions on the node would be missed. That was passed on to the next task (T7a's fix round). Also, `branch` is allowed on input ports by the TypeScript **type**; a test enforces the rule, and the Principal Architect accepted it (documents never carry port definitions; the Phase 2 Pydantic models should model inputs and outputs separately).

**What this teaches, in four lines.**
1. **A specification is code you cannot run.** The only way to test it is to walk concrete examples through it, by hand, and to try the **empty case** and the **both-rules-apply case** every time.
2. **Fixing it before acceptance is cheap.** The same three contradictions found in Phase 3 would have been found as engine bugs, perhaps in production runs (a workflow that never starts; a join that runs on failed data).
3. **Examples are tests waiting for an engine.** The seven worked examples are the natural first test cases for Phase 3 (and, as L3 and L8 taught, shared data is the way to keep a second implementation honest); today they exist only as prose, and nothing executes them.
4. **Be honest about the evidence.** "Reviewed by analysis only, nothing executes it" is in the Principal Architect's record; the lesson repeats it so that you can say it in an interview without overclaiming.

### Knowledge Check / Interview Questions

*Answers are not given here. Study this lesson and `docs/LEARNING.md`, then answer all questions in the dedicated learning session at the end of the project.*

1. In the workflow `Trigger -> Condition; Condition.true -> LLM A; Condition.false -> LLM B; A -> Output`, the condition evaluates to `false`. Using the edge states and the run-or-skip order, walk through every node and every edge: what state does each edge end in, which nodes run, which are skipped and for what reason, and how does the run end? Then say what changes if A and B both feed a hypothetical node X with a `multiple` input (and A -> Output is removed), and why a skipped node's outgoing edge is `inactive` rather than `failed`. Why can you not simply connect both A and B to the Output node's single `input` port?
2. Explain the difference between an output port that is **absent** and one whose value is `null`. Why must the engine treat them differently? What exactly does rule 1 require of a node that has no `branch` ports, and what bug does that requirement make impossible to hide? Why is the `branch` marker not used to schedule anything?
3. Explain vacuous truth with the example of a trigger node. Show the two sentences in the first draft that, read together, skipped every trigger, and explain how the final order of cases (and the explicit start rule) removes the problem. Give one other place in a program or a query where "all of an empty set" could bite you.
4. A node J has a `multiple` input fed by one failed edge and one active edge. What does the specification say happens, which rule decides, and why was this unclear in the first draft? Then argue for or against "no fail-fast": what are the costs of letting independent branches keep running after a failure, and what are the costs of stopping them?
5. The reviewer found the code correct but the specification contradictory. What does that tell you about where bugs hide in a design? How did the reviewer find them without running anything, and what would you do to turn the seven worked examples into automatic tests once the engine exists?
6. The `branch` marker is added to the catalog but not to saved workflow documents. Why does that mean no `schemaVersion` bump and no migration are needed, and which test checks it? What would break for old files if `branch` were stored in the document instead? Name one future component (planned, not built) that depends on `branch` appearing in the catalog fixture, and explain why.

---

## Lesson L10: Telling people what is unfinished without ever stopping them (editor warnings as a pure, derived function: `lintWorkflow`)

**Task:** Phase 1.1 T7a (decisions D-017 and D-018; plan section 3.6), commits `62041bf` (the function, its fixtures and its tests) and `b472579` (the review fixes). **Modules:** 3 (Workflow JSON and State Management: derived data versus stored data, warnings versus errors), 7 (Node Registry and Data Propagation: the node contract as the source of roles: category, required ports), 6 (Graph Theory and DAG Execution: reachability, why the search is iterative), 12 (Security, Testing and Deployment: independent reference implementations, mutation testing, scaling tests, fixtures as the cross-language contract).

*Status of what this lesson describes.* The **pure function exists and is tested**. **T7b, the part that shows the warnings in the editor (a badge on a node, a list in the toolbar, a section in the settings panel), is separate work: T7b shows them in the UI.** It is committed (`eb166b1`) and under review, and this lesson does not cover it. The secret-detection codes (`secret-likely`, `secret-suspected`) are planned for task T9 and do not exist. There is no Python version: `contracts/WARNINGS.md` says "TypeScript only. No Python parity is claimed; the Python runner is planned for Phase 2". **What I verified myself:** I read `frontend/src/workflow/lint.ts` and `frontend/src/workflow/lint.test.ts` in full, `contracts/WARNINGS.md`, the warnings runner in `frontend/src/contracts/fixtures.test.ts`, the fixtures `warn-orphan-chain`, `warn-llm-result-unused`, `warn-isolated-trigger`, `warn-output-without-input`, `warn-http-url-empty`, `warn-new-node-defaults`, `warn-no-trigger-no-unreachable`, `warn-condition-one-branch-wired`, both suppression fixtures and the three whitespace fixtures, `frontend/src/catalog/nodes.ts` (categories, required ports and required settings of all six node types), `docs/PHASE1_1_PLAN.md` section 3.6, `docs/DECISIONS.md` D-017 and D-018, and `docs/DEVELOPMENT_LOG.md` Session 12 (the review triage). `git show --stat` for both commits: `62041bf` is 36 files (+1675/-5) and `b472579` is 9 files (+222/-32). **What I ran myself:** (1) a Node program that enumerated every UTF-16 code unit outside the surrogate range and printed the ones whose `trim()` is empty: **25 of them, exactly the list in `contracts/WARNINGS.md`**; it also confirmed that U+0085, U+180E, U+200B and U+001C to U+001F are **not** trimmed to empty, and that the JavaScript regular-expression whitespace shorthand matches U+FEFF but not U+0085 or U+001C; (2) `npm test -- src/workflow/lint.test.ts` in `frontend/`: **1 file, 79 tests passed**. **What I did not run:** the full suite. The numbers **19 test files, 1122 unit tests and 51 end-to-end tests at `eb166b1`** are the Principal Architect's `npm run verify` result (exit 0), reported to me; the 51 includes T7b's browser tests, and the new tests that belong to this lesson's subject are the pure-function ones (`lint.test.ts`, the warnings fixture runner and the fixtures). **Reports, not repeated by me:** the Opus reviewer's own implementation and its comparison on 4 x 20,000 generated graphs, its 36 mutants, its timings and its hand derivation of the fixtures, as recorded in `docs/DEVELOPMENT_LOG.md` Session 12. **Python facts** (what `str.strip()` removes) are general knowledge, not run in this session. One more honest note: the corrected wording of `docs/ARCHITECTURE.md` section 6.1 rule 4 (finding 5 below) is in the Principal Architect's **uncommitted** working-tree edit at the time of writing; the committed (HEAD) text still has the old wording.

### 1. The problem

Think of a spell-checker in a word processor. It underlines a word in red, but it never stops you typing, never refuses to save the file, and the red lines are not part of the file. If you close and re-open the document, the underlines are worked out again from the text. Now imagine the opposite design: the word processor refuses to save a document that contains a typo, or writes the red lines into the file. That would be unusable for drafts.

AgentForge's editor has the same need. A person drags an LLM Prompt node onto the canvas: its prompt is empty, nothing is connected. That is a perfectly normal moment in building a workflow, and the project already decided it must be allowed (decision D-017: warnings never block; decision C1 / D-025: an absent required setting is a completeness question, not an import error; Lesson L7). But the person should still be told what is unfinished. Five kinds of unfinished are worth reporting:

| Code | Plain meaning |
|---|---|
| `required-input-unconnected` | A required input has no line going into it |
| `required-field-empty` | A required setting is missing, blank or an empty list |
| `trigger-not-connected` | A trigger (a starting point) has nothing connected to it |
| `node-unreachable` | Nothing that starts a workflow can ever lead to this node |
| `result-unused` | A node produces a result that nobody uses |

Two design traps sit behind this list, and both were named in the decisions before any code existed:

1. **Mixing hints into the validator** (D-018). `validateWorkflow` answers "is this file valid?". "This draft is unfinished" is a different question with a different consequence (a warning never blocks anything, an error rejects the file). Putting both in one list, even with a severity field, invites someone to later treat "any item in the list" as "reject".
2. **Storing hints in the document.** A saved workflow must mean the same thing whoever opens it. If warnings lived inside it, the file would depend on UI state, would go stale the moment someone edited a node, and would travel to the backend, the engine and the AI generator as noise.

### 2. The concept

**Derived data versus stored data.** A value is *derived* when you can always work it out again from other data, so you do not keep a copy. The warnings are derived from two inputs only: the workflow document and the node catalog. The function `lintWorkflow(workflow, catalog)` is a **pure function** (same input, same output; it changes nothing; it has no memory between calls), so "ask again after every edit" is always correct and there is nothing to keep in sync.

**Warnings versus errors (D-018).** Errors mean the file is structurally wrong (unknown type, impossible connection, wrong value type). They block import and, later, save. Warnings mean the file is fine but unfinished. They never block editing, saving, exporting, importing or running. They have their own type (`Warning`, with `severity: 'warning'`) and their own function, and `validateWorkflow` does not know they exist.

**Roles from the contract, not from a private list.** A rule such as "a node nobody starts" needs to know which nodes *start* things and which *end* them. The function does not keep its own list of node types (the project rule is that the catalog is the single source of node types). It reads two facts from the catalog definition: the node's **category** and the **direction of each port**. `Triggers` are **sources** (they start things), `Output` is a **sink** (it ends things; its result is "used" by definition), and `AI`, `Integrations` and `Logic` are **processors**. Inputs receive; outputs emit. A new node type placed in the catalog with the right category gets the right warnings with no change to `lint.ts`.

**Reachability.** A node is *reachable* when you can follow lines forward from some trigger and arrive at it. The function marks everything reachable with a **breadth-first search (BFS)**: start with all triggers, repeatedly visit the nodes their outgoing lines lead to, never visit a node twice. This is **structural** reachability: every line counts and every output port counts, whatever the node would do at run time. (The engine's rules in `docs/ARCHITECTURE.md` section 6.1 are about behaviour: a Condition node's untaken branch is *skipped at run time* although the line to it is drawn. The two ideas are deliberately different; see section 4.)

**One cause, one warning.** If an Output node has nothing connected, it is true that it has an unconnected required input **and** that it is not reachable from a trigger. Two warnings about one mistake would be noise. The rule: when a node has an unconnected required input **and no incoming line at all**, report only the input.

### 3. Why we selected this approach

1. **A separate pure function.** It can be tested with plain data, no browser, no store, no React. It cannot block anything because nothing awaits it and it returns a list. It cannot corrupt the document because it never writes to it (a test deep-freezes the workflow and the catalog and checks they are unchanged).
2. **Derived, never stored.** No synchronisation, no stale warnings, no change to the file format (so no `schemaVersion` bump and no migration, compare L9's `branch` marker).
3. **Roles from the catalog.** One source of truth for node types; adding a node type needs no rule change.
4. **Text-free comparison.** The `message` is for people and may be reworded at any time, so fixtures compare only `{code, nodeId, port, field}`, the same policy as the error fixtures (L2, L3).
5. **Messages never contain values.** A message names the node (its label, or its id when the label is blank) and the port or field, never a setting's value. Reason: task T9 will detect secrets pasted into settings; a warning that quoted the value would copy the secret into the screen. A unit test plants a sentinel string in settings, workflow metadata, name and description and asserts it appears in no message (I read the test).
6. **Written down as a contract** (`contracts/WARNINGS.md`) with a fixture family, so that the Phase 2 Python backend (planned) can implement the same function and be checked against the same files.

### 4. How it works internally

*(All of this is in `frontend/src/workflow/lint.ts`. The diagram follows the code.)*

```mermaid
flowchart TD
  IN["Inputs: the workflow (nodes, edges) and the catalog (node definitions)"] --> ITEMS["Per-node facts (an Item): id, display name (label or id),<br/>definition found by the exact (type, typeVersion) pair, config<br/>an unknown type or version gives no definition"]
  ITEMS --> TABLES["One pass over the edges builds three tables:<br/>incoming: node id to input ports that have an edge<br/>outgoing: node id to output ports that have an edge<br/>next: node id to target node ids<br/>An edge is ignored if a node is missing, or, for a node with a known definition, if its port is missing in that direction"]
  TABLES --> SEED{"Is any node in category Triggers?"}
  SEED -- "yes (hasTrigger)" --> BFS["Iterative BFS from every trigger along next<br/>result: the reached set"]
  SEED -- "no" --> NOREACH["reached stays empty and rule 4 is never evaluated"]
  BFS --> LOOP
  NOREACH --> LOOP
  LOOP["Then ONE loop over nodes in array order, rules 1 to 5 for each node (nodes without a definition are skipped)"]
  LOOP --> R1["Rule 1 required-input-unconnected<br/>uses: incoming"]
  LOOP --> R2["Rule 2 required-field-empty<br/>uses: config only, no edges"]
  LOOP --> R3["Rule 3 trigger-not-connected<br/>uses: outgoing"]
  LOOP --> R4["Rule 4 node-unreachable<br/>uses: reached"]
  LOOP --> R5["Rule 5 result-unused<br/>uses: outgoing"]
  R1 -. "suppression: rule 4 stays silent when the node has an unconnected required input and no incoming edge at all" .-> R4
  R1 --> OUT
  R2 --> OUT
  R3 --> OUT
  R4 --> OUT
  R5 --> OUT
  OUT["Warning list: node array order, then rule 1 to 5, then port or field in catalog order"]
```

**Step by step.**

1. **Defensive reading.** The first lines treat the input as *untrusted-shaped*: `isRecord` and `list` accept anything and fall back to "nothing". Each node's definition is found with a `Map` keyed by type and then an exact `version` match, the same exact pair that `connections.ts` uses. A node with an unknown type or version simply has no definition: no rule that needs a definition fires for it, but it still carries edges, so a path through it still counts for reachability (a unit test checks this).
2. **The edge tables.** Every lookup keyed by an id, port or config key that came from a file uses a `Map` or `Object.hasOwn`, never a plain object property read. Why: an id such as `__proto__`, `constructor` or `toString` would otherwise find something that was never put there (this is the lesson of L4 and L2 applied again, and two fixtures, `warn-prototype-named-ids-clean` and `warn-prototype-named-ids-warn`, pin it).
3. **Reachability.** The queue is a plain array with a moving `head` index, and the loop is a `for`, not a recursive function and not `queue.shift()`. Why this matters is in the review stories (finding 4).
4. **The five rules**, applied to each node in turn. Roles and an example of each:

| # | Code | Which nodes | AgentForge example | Fixture that shows it |
|---|---|---|---|---|
| 1 | `required-input-unconnected` | Any category; every input with `required: true` and no incoming edge | The Output node's single `input` (required) with nothing connected; the Agent's `input` (Task); the Condition's `input` | `warn-output-without-input` |
| 2 | `required-field-empty` | Any node with a catalog definition; each property in its `configSchema.required` that is absent, a blank string or an empty list | An LLM Prompt (required: `provider`, `prompt`) whose `prompt` is the empty string, which is what a freshly dropped node has; an HTTP Request whose `url` is empty | `warn-new-node-defaults`, `warn-http-url-empty` |
| 3 | `trigger-not-connected` | Sources only: a `Triggers` node that has outputs and none of them has an outgoing edge | A Manual Trigger whose `data` port goes nowhere | `warn-isolated-trigger` |
| 4 | `node-unreachable` | Everything except `Triggers`, **only if the graph contains a trigger**, and not reachable from any trigger | A second LLM Prompt wired to a second Output but not to the trigger: both warn | `warn-orphan-chain`, `warn-no-trigger-no-unreachable` (the case where it must not fire) |
| 5 | `result-unused` | Processors only (not `Output`, not `Triggers`) that have outputs, none of which has an outgoing edge | An LLM Prompt fed by the trigger whose `text` port is not connected | `warn-llm-result-unused`, `warn-condition-one-branch-wired` (wiring one of a Condition's two branches is enough, so no warning) |

Three details worth stopping at. **Rule 2 reads the settings only**: it does not look at any edge, and "empty" means absent (not an own key, or `undefined`), a blank string, or an empty array; `0`, `false`, `null` and `{}` are values (a unit test table pins each). **Rule 4's "only when there is a trigger"** reflects that a half-built workflow with no trigger yet is not wrong about reachability; there is nothing to be reachable *from* (`warn-no-trigger-no-unreachable`). **The suppression rule** is the single condition in rule 4: `!(missingInput && !connectedIn)`. Read it as "do not warn about unreachability when the node has an unconnected required input *and* nothing at all is connected into it". The fixture `warn-suppression-one-cause` shows a second, lone Output: it gets only `required-input-unconnected`. The fixture `warn-suppression-needs-no-incoming-edge` shows the limit: an Agent whose required Task input is unconnected but whose optional `tools` input receives a line from an orphan Condition gets **both** `required-input-unconnected` and `node-unreachable` (plus `result-unused`), because it does have an incoming edge, so the two warnings are two different facts.

5. **Order.** The list is in a fixed order: node array order, then rule 1 to 5, then port or field in catalog order. The same input always gives the same list, and the order of the `edges` array does not matter (a test reverses it). Why it matters: a UI list that reshuffles on every edit is unusable, and a second implementation must be able to match the order.

**A worked example.** Nodes in array order: `t` Manual Trigger, `l` LLM Prompt (provider set) with an empty prompt, `o` Output, `l2` LLM Prompt with provider and prompt set, `o2` Output, `o3` Output. Lines: `t.data -> l.input`, `l.text -> o.input`, `l2.text -> o2.input`. Then: `t` is connected (no rule 3 warning). `l` has `required-field-empty` for `prompt`; it is connected, reached and its result is used. `o` is fine. `l2` is **not reachable** from `t` (`node-unreachable`), though its own result is used. `o2` has a connected input but is not reachable (`node-unreachable`). `o3` has `required-input-unconnected` and, because nothing at all is connected into it, **no** `node-unreachable`. The list is therefore, in order: `required-field-empty|l|prompt`, `node-unreachable|l2`, `node-unreachable|o2`, `required-input-unconnected|o3|input`.

**Structural versus run-time reachability.** `contracts/WARNINGS.md` states the limit explicitly: reachability here follows every drawn line and counts every output port, selected or not. A node can be reachable here and still be **skipped at run time** (a Condition's untaken branch, or a node whose required input has no active edge: the engine's rule 5(c) in `docs/ARCHITECTURE.md` section 6.1, specification only, no engine exists). That second cause is reported once, as `required-input-unconnected` on the node, not as `node-unreachable`.

### 5. How it communicates with other components

- **Inputs.** `lintWorkflow(workflow: Workflow, catalog: NodeDefinition[]): Warning[]`. The workflow is the same document the store holds and `importWorkflow` produces; the catalog is the built-in one (`frontend/src/catalog/nodes.ts`, `nodeDefinitions`). No other input, no global state.
- **Output.** A list of `Warning` objects: `code`, `severity: 'warning'`, `nodeId`, optional `port` (for rule 1) or `field` (for rule 2), and a `message`. `nodeId` lets a UI jump to the node; `port` and `field` let it point at the exact input or setting.
- **Callers today.** The shared-fixture runner `frontend/src/contracts/fixtures.test.ts` (the `warnings` family) and the unit tests. **T7b shows them in the UI**; I did not review T7b for this lesson. Notice what this means for the data flow: nothing about the *import* path changed. A file is parsed, migrated, validated and loaded exactly as in L8; only afterwards can the editor ask `lintWorkflow` about the loaded workflow.
- **The validator.** `validate.ts` is untouched and does not know warnings exist (D-018). The fixture runner first calls `importWorkflow` on each fixture and asserts that it **imports successfully**: warnings are only defined for workflows that are valid but unfinished, which is also why incomplete configs import (decision C1, L7).
- **The catalog.** Rules read `category`, port `required` flags and `configSchema.required`. The catalog is also where the planned engine and the planned natural-language generator will read the same facts.
- **Future components (planned).** T9 will add `secret-likely` and `secret-suspected` to `WARNING_CODES` (a comment in `lint.ts` says so); Phase 2 may serve warnings next to the 422 errors from the API (D-018 consequences); the engine's rule 5 uses the *same* graph facts at run time, which is why the specification cross-refers to `node-unreachable`.
- **The fixture family.** `contracts/fixtures/warnings/` holds 34 files at HEAD (I counted: 31 from the first commit plus the 3 whitespace fixtures from the fix commit). `MIN_COUNTS.warnings` in the runner is 34. Two coverage guards (also in the runner): every code must be **expected** by at least one fixture, and every code must appear in at least one `negativeFor`.

**`negativeFor`, in plain words.** A test that only shows "this warning fires" does not show that the rule is not simply always on. So a fixture may list `negativeFor: ["result-unused"]`, meaning "this workflow *contains something the rule is about* but the rule must stay quiet". The runner checks two things: the fixture does not expect that code, and the workflow really has a node the rule applies to (`RULE_APPLIES` in the runner: for example for `result-unused`, a non-sink non-trigger node with outputs). Because the whole expected list must equal what `lintWorkflow` returns, "applies and not expected" means "applies and did not fire".

### 6. Important classes, functions and code paths

| Where | What it does |
|---|---|
| `frontend/src/workflow/lint.ts`: `lintWorkflow` | The whole function: items, edge tables, BFS, the five rules, the ordered list |
| `lint.ts`: `WARNING_CODES`, `Warning` | The five codes (a tuple, so `WarningCode` is a union type) and the result type |
| `lint.ts`: `isEmptyValue` | Rule 2's definition of empty: `undefined`, `value.trim() === ''` for strings, an empty array. Anything else is a value |
| `lint.ts`: `portsOf`, `requiredFields`, `isRecord`, `list` | Defensive readers: wrong shapes become "nothing", never an exception |
| `lint.ts`: `byType` map, `firstById` map | Exact `(type, version)` lookup; with duplicate ids the first node's definition decides which ports an edge may use |
| `frontend/src/workflow/lint.test.ts` | 79 tests (I ran this file): each rule, messages, purity (deep-frozen inputs), determinism and order, totality on garbage, prototype-named ids, duplicate ids, scaling on two graph shapes, and the seeded property test against `reference()` |
| `frontend/src/contracts/fixtures.test.ts`: the `warnings` family | Validates fixture shape, imports each workflow, compares warnings as a multiset (`asWarningMultiset`), runs the `negativeFor` and coverage guards |
| `contracts/WARNINGS.md` | The contract: roles, the five rules, the 25-code-point whitespace set, order, duplicate ids, structural reachability, messages, fixture format |
| `contracts/fixtures/warnings/*.json` | 34 language-neutral cases |
| `docs/PHASE1_1_PLAN.md` section 3.6 | The approved design, including the roles table |

### 7. Alternatives and trade-offs

| Option | Good | Costs |
|---|---|---|
| **A separate pure derived function (chosen)** | Testable with data; cannot block or corrupt anything; nothing stored to go stale; no file-format change | The caller must recompute (cheap at editor scale: one pass over nodes and edges plus a traversal) |
| **Warnings inside `validateWorkflow` with severity levels** (rejected, D-018) | One pass, one list | Blurs "invalid file" with "unfinished draft"; one forgotten `if (severity === 'error')` turns warnings into blockers; the backend would inherit the confusion |
| **Store warnings in the document** | The UI could show them without recomputing | The file depends on UI state; stale after any edit; noise for the engine and the AI generator; changes the file format |
| **Compute inside each component** (badge, list, panel) | Each component has what it needs | Three implementations that disagree; three sets of tests; no contract to give a second language |
| **Use a lint library** | Less code to write | A rules engine for five graph rules is a heavy dependency; our rules need our catalog's roles and our exact whitespace contract; a new major dependency needs a decision record |
| **Throw on incomplete drafts** | Simple to reason about | The editor could not hold half-finished work at all; contradicts D-017 and C1 |
| **Make the function try/catch everything** (rejected in the review) | Looks "safer" | Hides bugs; defends against inputs (getters, proxies) that cannot occur: the input is JSON or store data. See finding 2 |

### 8. Real-world engineering applications

*From general knowledge, not from this repository.*

- **Linters and language servers** (ESLint, the problems panel of an editor) work the same way: derived from the source, never stored in the file, severity levels separate from compile errors.
- **Form builders and low-code tools** (n8n, Zapier, Node-RED) show "required field missing" and "node not connected" hints on a canvas without blocking save.
- **Static analysis of pipelines**: CI systems and infrastructure-as-code tools check for unreachable jobs or unused outputs in a graph before running anything.
- **Reachability by BFS** is also used to find dead code, orphaned database rows, and unreachable states in a state machine.
- **Contract tests across languages**: any system that has a TypeScript front end and a Python back end that must agree on small rules (whitespace, ordering) benefits from a shared set of data cases instead of two descriptions in prose.

### The cross-language lesson: what exactly is "blank"?

For a text setting, "empty" uses JavaScript's `trim()`. That sounds trivial until a second language must agree. **Whitespace is not one thing; every language has its own list.** `contracts/WARNINGS.md` therefore does not say "blank means whitespace". It says **the contract is this exact set of 25 code points**, the ones `String.prototype.trim` removes. I enumerated them with Node and got the same 25: U+0009 to U+000D (5), U+0020, U+00A0, U+1680, U+2000 to U+200A (11), U+2028, U+2029, U+202F, U+205F, U+3000 and U+FEFF. Characters that look like whitespace but are **not** in the set (so a string made only of them is text, not blank): U+0085 (next line), U+180E (Mongolian vowel separator), U+200B (zero width space) and the controls U+001C to U+001F. I confirmed with Node that these are not trimmed to empty.

*General knowledge, not run in this session:* Python's `str.strip()` removes a different set. It does not remove U+FEFF (JavaScript does) and it **does** remove U+0085 and U+001C to U+001F (JavaScript does not). A Python port that simply called `strip()` would disagree on exactly the characters above. Worse, **the obvious fixes also disagree**: I ran the JavaScript regular-expression whitespace shorthand and it matches U+FEFF but not U+0085 or U+001C, so someone who "improves" `trim()` into a regular expression can still change the behaviour if they pick a different class.

**Fixtures are what a second implementation runs.** The review found that the first version of the tests and fixtures were silent about all this: a mutant that replaced `trim` by a regular expression missing U+2028 and U+3000 passed every test, and a Python-like strip set passed every fixture (report from Session 12). The fix added three fixtures (in the fix commit `b472579`):

- `warn-unicode-spaces-only-prompt`: a prompt made of U+00A0, U+FEFF and U+2028 is **blank** (it warns). The file holds the characters as the six-character JSON escape sequences (a backslash, then `u` and four hex digits); I read the file to confirm.
- `warn-next-line-control-is-not-blank`: a prompt of U+0085 is **not** blank (`negativeFor` `required-field-empty`).
- `warn-file-separator-control-is-not-blank`: a prompt of U+001C is **not** blank.

Plus unit tests that check the set against the platform's own `trim`. **The rule for you to take away: pin every behaviour a port could plausibly get wrong, with a case that fails if it does.** Also notice a limit of the *existing* property test: its pool of generated setting values (`VALUES` in `lint.test.ts`) holds only the empty string, two spaces and a tab as blank strings, so even a perfect independent reference would never have exercised the exotic characters. A test finds only what its inputs exercise.

A related honest limit: **the result order is a contract that only the TypeScript unit tests check**, because fixtures compare as multisets (order does not matter) so a Python port gets no fixture signal for it. `WARNINGS.md` says so in its text.

### What the review found (real examples)

The reviewer (Opus 5.5, read-only) found **no blockers and no majors** in `62041bf` (verdict: pass with findings). These are reports from `docs/DEVELOPMENT_LOG.md` Session 12 except where I say I read the code. All were fixed in `b472579` unless stated.

**1. A second implementation written from the spec alone (a method).** The reviewer did not just read the code. It wrote **its own `lintWorkflow` from the specification text**, in a different style (index-based facts, an adjacency matrix and a transitive closure instead of a BFS, an explicit code-point whitespace set), and compared the two on **4 seeds of 20,000 generated graphs each**: **0 differences on every workflow without duplicate ids** (report). That is *differential testing* against an independent reference. The repository has the same idea in miniature: `lint.test.ts` contains a `reference()` function written deliberately in another shape (plain arrays and scanning instead of Maps, a fixpoint loop instead of a queue, one predicate per rule) and a seeded property test that compares it with `lintWorkflow` on 1,500 random graphs (I read it, and I ran the file: it passes). The test also asserts that the generator really produces warnings in more than 1,000 runs and that all five codes appear, because a comparison where nothing ever fires proves nothing.

**2. "Never throws" was overclaimed; document the boundary instead of covering it.** The first text said the function "never throws, whatever the object holds". The reviewer showed a **getter that throws, or a revoked proxy, on the workflow** would throw out of the function. The duplicate-id behaviour was also described wrongly (the text said the first node wins; the code keys facts by the id string, so every node with that id shares the first node's connections and reachability; the test named for it only asserted "does not crash"). The fix was to **write down what the code really does**: "never throws for any JSON-shaped value (own data properties only)", and a test that asserts both probes. **No try/catch was added.** Why this is the right call: the input is always JSON from an imported file or the store's own data; a getter or proxy cannot occur; wrapping everything in `try/catch` would add code for an unreachable case and could hide a real bug. Duplicate ids cannot reach the function in the app because validation rejects them before import. Lesson: **documenting a boundary honestly beats over-engineering for a case that cannot happen** (compare L8's "do not overclaim what a test proves").

**3. Fixtures are the cross-language contract.** See the cross-language lesson above (the whitespace gap).

**4. A performance test that could not catch the bug it was written for.** The first performance test linted **one 5,000-node chain** and passed under a time limit (I read it at `62041bf`). The reviewer's mutants showed it could not detect a quadratic implementation. The fix measures **scaling**: the same function on 5,000 and on 50,000 nodes (best of three runs; the minimum is the least noisy estimate) and requires the 50,000-node time to be **less than 40 times** the 5,000-node time (a linear function gives about 10, a quadratic about 100), plus a generous absolute backstop of 5 seconds. The ratio, not the milliseconds, is the signal, because machines differ. It needed **two graph shapes**, a chain and a star, and the reason is the lesson: in a **chain** the BFS queue never holds more than about one item, so a mutant that uses `queue.shift()` (which moves every remaining item, a cost proportional to the queue length) hides; in a **star** (one trigger fanned out to n processors) the queue grows to n items and the same mutant is exposed. The `items.find` mutant (a search through all nodes for every edge) fails the scaling test (report). **A test only detects what its input shape exercises.** The star also checks the number of warnings (n unused results), so a fast function that returns the wrong answer cannot pass.

**5. A mismatch in the specification itself.** The reviewer noticed that `docs/ARCHITECTURE.md` section 6.1 (rule 4) said a non-trigger root that nothing starts gets `node-unreachable`, but with the approved suppression rule a root that has a required input gets `required-input-unconnected` *instead*. The code was right; the text contradicted it. The fix amended the specification ("one cause, one warning") and `contracts/WARNINGS.md` now states that reachability is structural and does not model the engine's rule 5(c). (The amended wording is in the Principal Architect's uncommitted edit of `docs/ARCHITECTURE.md`, as noted at the top.) This is the L9 lesson again, from the other side: even the author of a spec can contradict it, and an independent reader finds it.

**6. A tool hazard.** The file-writing tool **decoded the Unicode escape sequences** the implementer put into the new fixture files, turning an escape into the actual character, which would have destroyed the very characters the fixtures test (and a lone surrogate cannot even be stored in a UTF-8 file). The implementer found a workaround (write a harmless placeholder after the backslash, then replace the placeholder with the `u` and hex digits in a second edit) and the Principal Architect checked the bytes of the three fixtures with `od -c` (pure ASCII, escapes intact; report). I confirmed the same thing by reading the files. Lesson: **after writing a file whose content must contain an escape, read the bytes back.** This is also why this lesson describes the escape in words instead of printing it.

**Other things carried forward.** The order contract is documented as unit-test-only; the coarse `negativeFor` guard was accepted without change (the full multiset comparison already implies applicability). **For T9:** messages echo the node *label* and id; T9 scans setting values and metadata, not labels, and if it widens scanning to labels the message format must change (note N5 in the log).

**What this teaches, in four lines.**
1. **Derived data needs no storage, and a pure function needs no UI to test.** The cheapest way to keep two things in sync is to have only one.
2. **Say exactly what you guarantee.** "Never throws for JSON-shaped values" is true and checkable; "never throws" was not.
3. **A test is as strong as its inputs.** One shape of graph, one pool of strings, one language: each hid a different bug.
4. **A contract between languages is data, not prose.** If a rule could be implemented two ways, write a fixture that fails for the wrong way.

### Knowledge Check / Interview Questions

*Answers are not given here. Study this lesson and `docs/LEARNING.md`, then answer all questions in the dedicated learning session at the end of the project.*

1. A draft has these nodes in array order: a Manual Trigger `t`, an LLM Prompt `l` with its provider set and an empty prompt, an Output `o`, a second LLM Prompt `l2` with provider and prompt set, a second Output `o2`, and a third Output `o3`. Lines: `t.data -> l.input`, `l.text -> o.input`, `l2.text -> o2.input`. List every warning `lintWorkflow` returns, in order, naming the code and the port or field, and explain which rule produces each. Why does `o3` get one warning and not two, and what would have to be true of a node for it to get both? Then give one example of a node that this function calls reachable but that the engine specification (`docs/ARCHITECTURE.md` section 6.1) would skip at run time, and say why the two notions of reachability are kept apart.
2. A teammate proposes adding an `errors` and a `warnings` list to the result of `validateWorkflow`, with a severity field, "to avoid two functions". Argue against it using decisions D-017, D-018 and C1. What exactly could go wrong in the import path, in a future save API and in a future second implementation? And what would go wrong if the warnings were stored inside the workflow document instead? Which two properties of `lintWorkflow` (name them) make "recompute after every edit" safe?
3. The reachability search uses a queue held in an array with a moving index. Explain breadth-first search in your own words, then explain why it is iterative rather than recursive, and why the performance test needs both a chain and a star to catch a `queue.shift()` mutant. Why does the test compare a ratio of two timings rather than a fixed number of milliseconds, and what would the ratio be for a quadratic implementation?
4. A Python backend will implement the same warnings in Phase 2. List everything in `contracts/WARNINGS.md` and the fixtures that lets it agree with the TypeScript code on "empty", on "which port counts", and on the suppression rule. Give two behaviours that the fixtures do **not** check, say which test (if any) checks them today, and what you would add so that a port could not get them wrong. Why is "use the language's strip function" not an acceptable implementation of "blank"?
5. In review, the claim "never throws, whatever the object holds" was found to be false for a getter or a proxy, and the fix was to change the wording, not to add a `try/catch`. Defend that decision. Name a place in AgentForge where input does cross a trust boundary and a defensive check is the right tool (hint: Lessons L2 and L4), and say what makes it different from the input of `lintWorkflow`.
6. The repository has an in-test `reference()` implementation compared with `lintWorkflow` on 1,500 random graphs, and the reviewer also wrote its own implementation and compared 80,000 graphs. What does each comparison prove, what can neither prove, and why can the in-repo property test not catch a regression in how U+2028 or U+3000 is treated (look at the value pool the generator draws from)? What would you add to the generator?

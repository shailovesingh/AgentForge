# ARCHITECTURE — AGENTFORGE

> **Status: PROPOSED — awaiting approval from the Product Owner and Principal Architect.**
> Nothing in this document is implemented yet. Decision IDs (D-xxx) refer to `docs/DECISIONS.md`.
> Last updated: 2026-11-03 (Session 1).

---

## 1. Overall System Architecture

```
┌──────────────────────── Browser (React SPA) ────────────────────────┐
│  Canvas (@xyflow/react) · Node Library · Config Panel · NL Builder  │
│  Run Monitor                                                        │
│                 Editor store (Zustand) ── Workflow JSON v1          │
└──────────────────────────────┬──────────────────────────────────────┘
                REST (JSON)    │    SSE (run events)
┌──────────────────────────────┴──────────────────────────────────────┐
│                         FastAPI backend                             │
│  api/ (routers) → services/ (business logic)                        │
│     ├─ catalog/       node definitions + executor registry          │
│     ├─ workflow/      schema, validator, migrations                 │
│     ├─ engine/        general DAG executor   (NO LangGraph)         │
│     ├─ agents/        LangGraph runtime      (agent node only)      │
│     ├─ generation/    NL → workflow drafts / patches                │
│     ├─ integrations/  LLM providers, HTTP, MCP client manager       │
│     └─ db/            SQLAlchemy models, Alembic migrations         │
└──────────┬───────────────────────────────┬──────────────────────────┘
       PostgreSQL                    Redis (later: run queue)
```

**Responsibilities**

- **Browser:** holds editor state only: the graph being edited, the selection and UI state. It never holds secrets and never executes nodes.
- **Backend:** owns persistence, validation, execution, AI calls, credentials and authorization.
- **Shared contract:** the **Workflow JSON v1** document (§4) and the **Node Catalog** (§5).

**Monorepo layout (D-002)**

```
AgentForge/
  frontend/        Vite + React + TS
  backend/         FastAPI (uv-managed, Python 3.12 — D-008)
  docs/
  .claude/rules/
  docker-compose.yml   (Phase 2+)
```

There is no shared package. The contract is shared through generated types (D-004), not through a common code library.

---

## 2. Frontend Architecture

```
frontend/src/
  app/            App shell, layout
  canvas/         <ReactFlow> wrapper, drop handling, connection rules
  nodes/          WorkflowNode (single generic component), handle rendering
  library/        Node library sidebar (categories, search, drag source)
  config-panel/   Schema-driven config form
  workflow/       types.ts, serialize.ts, validate.ts, migrate.ts  (pure, tested)
  catalog/        Static catalog (Phase 1) → API client (Phase 2)
  store/          Zustand editor store
```

**Principles**

- **React Flow is the view layer only.** The store holds workflow nodes and edges. React Flow's `Node` and `Edge` objects are derived from them, and they never appear in exported JSON (D-003).
- **One store (Zustand, D-005).** The canvas, config panel, library and import/export all read and write it. React Flow's own `useNodesState` cannot be reached from sibling panels without prop drilling, and React Flow already depends on Zustand internally.
- **One generic node component.** It renders the icon, label and input/output handles from the node's catalog definition. Adding a node type means adding catalog data, not writing a new component.
- **Schema-driven config panel.** Forms are rendered from `configSchema`. Phase 1 supports a small JSON-Schema subset (string, text, number, boolean, enum, json). No form library is added.
- **Pure logic in `workflow/`** (serialization, validation, connection rules, migrations). This code has no React imports and is unit tested.
- **Styling:** CSS Modules, which Vite supports natively (D-011). Icons come from Lucide only.

---

## 3. Backend Architecture

```
backend/app/
  main.py           FastAPI app factory, router registration
  api/              Routers — thin: parse, authorize, call service, return
  services/         Business logic (workflows, runs, credentials, generation)
  workflow/         Pydantic Workflow models, validator, migrations
  catalog/          NodeDefinition models, built-in definitions, executor registry
  engine/           DAG executor, run context, events
  agents/           LangGraph agent builder (used only by the agent node executor)
  generation/       NL workflow generation and patching
  integrations/     llm.py (get_chat_model), http.py, mcp/
  db/               SQLAlchemy models, session, Alembic
  security/         credential encryption, SSRF guard, redaction
backend/tests/
```

- **Pydantic v2 at every boundary:** requests, responses, workflow documents, node configs and LLM structured outputs.
- **Routers stay thin and services hold the logic.** There is no repository-pattern layer over SQLAlchemy until a second storage backend actually exists.
- Async I/O throughout. Settings come from environment variables through `pydantic-settings`.

---

## 4. Workflow JSON Schema Strategy

**Document format v1 (D-003):** this is AgentForge's own format and does not mirror React Flow.

```json
{
  "schemaVersion": "1.0",
  "id": "wf_01H...",
  "name": "Summarize URL",
  "description": "",
  "nodes": [
    {
      "id": "n1",
      "type": "http.request",
      "typeVersion": 1,
      "label": "Fetch page",
      "config": { "method": "GET", "url": "https://example.com", "credentialRef": null },
      "position": { "x": 120, "y": 80 }
    }
  ],
  "edges": [
    { "id": "e1", "source": { "nodeId": "n1", "port": "body" }, "target": { "nodeId": "n2", "port": "input" } }
  ],
  "metadata": {}
}
```

**Rules**

- `schemaVersion` versions the document format. `typeVersion` versions each node type's config and ports. They change independently.
- **Credentials are never stored inline.** Config holds only a `credentialRef` (an opaque ID). Exports therefore never contain secrets.
- `position` is the only UI data in the document, and the engine ignores it.
- **Back-compat:** every load runs through `migrate(doc)`, which applies stepwise upgrades (`1.0 → 1.1 → …`). Old documents are never rejected only because their version is old. Breaking changes require a new major `schemaVersion` together with a migration.

**Source of truth (D-004)**

- **Phase 1:** hand-written TypeScript types in `frontend/src/workflow/types.ts`. The format above is frozen now so that Phase 2 can adopt it without changes.
- **Phase 2 onward:** Pydantic models are canonical. A script exports their JSON Schema, and the frontend types are generated from that schema and checked in. CI fails if the generated types drift.

**Validation:** the same rules run on every path in, whether a manual save, an import or an AI-generated draft.

- Schema shape.
- Unique IDs.
- Known `type@typeVersion`.
- Ports exist on the referenced nodes.
- Data types are compatible.
- Single-connection inputs are respected.
- No cycles (D-006).
- Required inputs are connected.
- Config validates against the node's `configSchema`.

---

## 5. Node Catalog and Registry

**NodeDefinition** is pure data and serializable. It is served as `GET /api/catalog`.

```ts
interface NodeDefinition {
  type: string;            // "llm.prompt"
  version: number;         // 1
  category: string;        // "AI" | "Triggers" | "Logic" | "Integrations" | "Output"
  label: string;
  description: string;     // also used in NL-generation prompts
  icon: string;            // Lucide icon name
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  configSchema: JSONSchemaSubset;
  defaults: Record<string, unknown>;
}
interface PortDefinition {
  name: string;            // handle id
  label: string;
  dataType: "any" | "text" | "json" | "number" | "boolean" | "messages" | "tool";
  required?: boolean;
  multiple?: boolean;      // input accepts multiple edges
}
```

**Registry (backend only).** It maps `type@version` to an executor:

```python
class NodeExecutor(Protocol):
    async def execute(self, inputs: dict, config: BaseModel, ctx: RunContext) -> dict: ...
```

**Rules**

- One catalog feeds four consumers: the UI library, config-panel rendering, the validator and the NL-generation prompt. No consumer keeps its own private list of node types.
- A definition without a registered executor is a startup error. An executor without a definition is also a startup error.
- **Phase 1:** a static TS module exports `NodeDefinition[]` with exactly the shape the future API returns. Switching to the API later is a one-line change.

**Initial node set (Phase 1 catalog):** Manual Trigger, LLM Prompt, HTTP Request, Condition, Agent, Output.

---

## 6. Workflow Execution Engine

The engine is a general DAG executor with **no LangGraph dependency**.

1. **Load:** `migrate` the document, `validate` it, then resolve each node to its executor.
2. **Plan:** a topological sort. **Cycles are rejected in v1 (D-006).** Iteration happens inside the Agent node, or later in an explicit Loop node that has its own bounded semantics.
3. **Run:** ready nodes (all upstream inputs resolved) run concurrently with `asyncio`. Each node's outputs are written to its named output ports, and edges carry those values to downstream inputs.
4. **Branching:** a Condition node emits only on its `true` or `false` port. Nodes that receive no input because of an untaken branch are marked `skipped`, and the skip propagates downstream.
5. **Limits:** a per-node timeout, a per-run max step count and a per-run wall-clock limit. Cancellation is supported.
6. **Records:** a `runs` row plus one `node_runs` row per node (status, inputs, outputs, error, timings), with secrets redacted. Events stream to the UI over SSE.
7. **Approval:** a node flagged `requiresApproval` pauses the run in state `waiting_approval` until a user approves or rejects it.

**Deployment:** v1 runs in-process as a background asyncio task behind a `start_run()` service call. When runs need durability or horizontal scale, a Redis-backed worker (arq) replaces this behind the same call. Callers do not change.

---

## 7. LangGraph Integration

```
Workflow Engine (DAG)
   └── Agent node executor ──► agents.build_agent(config, tools, model)
                                   └── LangGraph StateGraph / prebuilt ReAct agent
```

- **LangGraph is used only inside the Agent node executor.** The engine sees the agent node as a black box with an I/O contract: inputs `input` (text) and `tools` (multiple tool edges); outputs `output` (text) and `messages`.
- **Tools** come from tool-type nodes connected to the agent's `tools` port and from selected MCP tools (§9). Every tool call goes through the same authorization and approval checks as a regular node.
- **Limits:** `recursion_limit`, a wall-clock timeout, a max tool-call count and a max token budget, all set in the agent config with server-side caps.
- **Memory:** in v1 it is limited to the run. Persistent memory later uses the LangGraph Postgres checkpointer, keyed by agent and conversation.
- **LLM providers:** a single `get_chat_model(provider, model, credential)` function returns a LangChain chat model. A plugin or factory system waits until a second need actually appears.
- Agent steps (thoughts, tool calls, tool results) are emitted as run events for the monitor and debugger.

---

## 8. Natural-Language Workflow Generation

**Create flow**

```
user request
   → prompt = system rules + compact catalog (type, description, ports, config keys)
   → LLM structured output: WorkflowDraft (Pydantic)
   → validator (same as §4)
        └─ errors? → feed errors back to the LLM, retry (max 3)
   → draft returned to UI → rendered on canvas as preview → user accepts / discards
```

**Edit flow (D-007).** The LLM returns **patch operations** rather than a whole new workflow:

```json
[{ "op": "addNode", "node": {...} },
 { "op": "connect", "edge": {...} },
 { "op": "updateConfig", "nodeId": "n3", "set": { "temperature": 0.2 } },
 { "op": "removeNode", "nodeId": "n5" }]
```

Patches are applied to a copy, validated, and shown as a diff before the user accepts them. Unrelated nodes cannot be silently rewritten, and every change can be reviewed.

**Rules**

- The output is always structured workflow data. The LLM never produces executable code.
- Credentials are never sent to the LLM; it sees only `credentialRef` placeholders.
- The user's request is treated as untrusted input.
- Generation never auto-executes a workflow.

---

## 9. MCP Integration

- **Client manager** (`integrations/mcp/`), built on the official `mcp` Python SDK, with `langchain-mcp-adapters` for agent tools.
- **Server configs** are stored per user in `mcp_servers` (URL, transport, `credentialRef`). Tools are discovered at runtime (`list_tools`) and cached with a TTL.
- **Exposure:**
  - **MCP Tool node:** a workflow node whose config selects the server and tool. Its config schema is derived from the tool's input schema.
  - **Agent tools:** selected MCP tools are attached to an Agent node.
- **Transport policy (D-010):** remote servers (streamable HTTP) only at first. A **stdio** server means spawning arbitrary local processes, so it stays disabled until there is a sandboxed runner.
- MCP tool outputs are untrusted data. Calls go through the SSRF guard, timeouts and approval policy.

---

## 10. Database and Persistence

PostgreSQL, accessed through SQLAlchemy 2.0 (async) with Alembic migrations (D-009).

| Table | Purpose |
|---|---|
| `users` | Identity (auth arrives in Phase 7; `owner_id` is used from day one) |
| `workflows` | id, owner_id, name, current_version_id, timestamps |
| `workflow_versions` | Immutable JSONB snapshots of Workflow JSON plus schemaVersion |
| `credentials` | owner_id, provider, name, **encrypted** payload |
| `runs` | workflow_version_id, status, timings, trigger, error |
| `node_runs` | run_id, node_id, status, inputs/outputs (redacted JSONB), logs, timings |
| `mcp_servers` | owner_id, url, transport, credential_ref |

- Every query on user-owned data is scoped by `owner_id`.
- Saving a workflow creates a new immutable version. Each run references the exact version it executed.
- Redis is introduced only when the run queue or a cache is actually needed.

---

## 11. Security and Credential Management

| Concern | Measure |
|---|---|
| Secrets at rest | Fernet encryption (`cryptography`). The key comes from the environment or a secret manager and is never stored in the DB. |
| Secrets in use | Referenced by `credentialRef` and decrypted **only inside the node executor** at call time. |
| Secrets in output | Redacted from logs, `node_runs` records and SSE events. Never included in exports or LLM prompts. |
| AuthZ | Every workflow, run, credential and MCP-server access is checked against `owner_id`. Tools are authorized before execution. |
| SSRF | The HTTP and MCP clients block private, loopback and link-local ranges by default (an allowlist overrides this). |
| Untrusted content | User prompts, LLM output and tool output are data. They can never grant permissions or bypass approval. |
| Sensitive actions | `requiresApproval` on a node pauses the run until a human approves it. |
| Arbitrary code | There is no code node and no `eval` or `exec` in the API process. Any future code node runs in an isolated sandbox (container or WASM). |
| Resource limits | Node timeouts, run step and time limits, agent recursion, tool-call and token caps. |
| Transport | CORS restricted to the frontend origin; HTTPS in deployment. |

---

## 12. Testing Strategy

| Layer | Tooling | Focus |
|---|---|---|
| Frontend logic | Vitest | Serialize/import round-trip, `canConnect` rules, import validation, migrations, store actions |
| Frontend UI | Vitest + Testing Library (selective) | Config panel form rendering, library search |
| Frontend E2E | Playwright (**deferred** until a stable end-to-end flow exists) | Drag, connect, configure, export |
| Backend unit | pytest | Validator, migrations, catalog/registry consistency, credential encryption, SSRF guard |
| Engine | pytest + fake executors | Ordering, concurrency, branching/skip, timeouts, limits, approval pause |
| AI | pytest + **fake LLM provider** | Agent loop bounds, generation repair loop, patch application |
| AI quality | Small golden eval set (request → expected node types/edges) | NL generation regression, run on demand |
| API | pytest + httpx `AsyncClient` | Contracts, authZ scoping |

Tests never call paid LLM APIs by default. Live-provider tests are opt-in through an environment flag.

---

## Open Architectural Questions

See `docs/PROJECT_BRAIN.md` §10.

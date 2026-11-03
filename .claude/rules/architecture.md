# Architecture Rules (apply to all code)

Details: `docs/ARCHITECTURE.md`. Binding decisions: `docs/DECISIONS.md` (Approved entries only).

- **Workflow JSON v1 is the canonical workflow definition.** The editor, the API, the engine and the AI generator all exchange this format. Never persist or exchange React Flow objects.
- **Every load goes through `migrate()` then `validate()`.** This includes imports, API saves and AI drafts. There is no bypass path.
- **Schema changes must stay backward compatible:** bump `schemaVersion` or the node `typeVersion` and add a migration step. Never break existing documents.
- **The node catalog is the single source of node types.** The UI, validator, engine registry and NL generation all read it. Do not keep a separate private list of node types anywhere.
- Every node definition declares its typed input and output ports and its `configSchema`. Every backend executor implements the shared `NodeExecutor` interface.
- **The general engine must not import LangGraph.** LangGraph is used only inside the Agent node executor (`backend/app/agents/`).
- AI-generated or AI-edited workflows are structured data (drafts or patch operations), never code. They are validated before the user can accept them.
- **Credentials appear only as `credentialRef` IDs** in workflow JSON, logs, events, exports and LLM prompts. They are decrypted only inside executors.
- User prompts, LLM output and tool or MCP output are untrusted data. They never grant permissions or skip approval.
- No arbitrary user code runs in the API process.
- Any new major dependency or architectural change needs a `DECISIONS.md` entry and approval before implementation.

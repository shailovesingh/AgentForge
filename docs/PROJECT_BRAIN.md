# PROJECT BRAIN â€” AGENTFORGE

> This is the canonical shared engineering memory for AgentForge.
> Keep it synchronized with the actual repository state.
> Do not confuse planned functionality with implemented functionality.

## 1. Project Identity

- **Name:** AgentForge
- **Product:** Visual AI Agent Builder
- **Status:** Architecture approved (D-001 to D-011). Phase 1 (visual builder) in progress. See §7.
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

## 3. Approved Initial Technology Choices

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript |
| Frontend tooling | Vite |
| Visual editor | @xyflow/react |
| Backend | Python + FastAPI |
| Validation | Pydantic |
| Agent runtime | LangGraph |
| LLM integrations | LangChain / provider adapters |
| Primary database | PostgreSQL |
| Queue/cache | Redis, when needed |
| Deployment | Docker |

These are initial choices. Record approved changes in DECISIONS.md.

## 4. Core Architecture

### Frontend
- Visual workflow canvas.
- Node library.
- Custom node components.
- Configuration panel.
- Natural-language builder.
- Execution monitoring interface.

### Backend
- API layer.
- Workflow manager.
- Workflow schema validation.
- Node catalog and registry.
- General workflow execution engine.
- Agent runtime.
- Integration adapters.

### AI Layer
- Workflow generation agent.
- Natural-language workflow editor.
- LLM node.
- Autonomous agent node.
- Memory and tool calling.
- AI debugging and optimization.

## 5. Architecture Rules

- Workflow JSON is the canonical workflow definition.
- Node catalog is the source of truth for available nodes.
- Every node has defined input/output contracts.
- The workflow engine is independent of LangGraph.
- LangGraph manages autonomous agent behavior.
- AI-generated graphs must pass validation.
- External actions must respect authorization and approval.
- Secrets must not be included in LLM prompts or workflow exports.

## 6. Actual Repository Status

*Inspected 2026-11-03 (Session 1).*

**Repository contents:**
- `CLAUDE.md`
- `docs/` (6 files)
- `.claude/rules/` (3 files)

There is no frontend, no backend, no application code, and the directory is **not a git repository**.

### Environment (verified on this machine)

| Tool | Version / State |
|---|---|
| git | 2.51.0 (repo not initialized) |
| Node / npm | 24.13.0 / 11.16.0 (no pnpm, no yarn) |
| Python | 3.14.2 default; uv-managed 3.11.14 and 3.14.2 available |
| uv | 0.9.24 |
| Docker | **Not installed** |
| PostgreSQL | **Not installed** |
| Redis | **Not installed** |
| OS | Windows 11 |

### Files

| File | State |
|---|---|
| `CLAUDE.md` | Product Owner content kept; Â§14 Documentation Map and Â§15 Handoff Protocols appended (Session 1) |
| `docs/PROJECT_BRAIN.md` | Updated with actual state (Session 1) |
| `docs/ARCHITECTURE.md` | Written: full architecture proposal, status Proposed (Session 1) |
| `docs/DECISIONS.md` | Written: D-001 Approved, D-002 to D-011 Proposed (Session 1) |
| `docs/ROADMAP.md` | Written: phases 0â€“7 and the detailed Phase 1 plan (Session 1) |
| `docs/DEVELOPMENT_LOG.md` | Session 1 entry appended |
| `.claude/rules/architecture.md`, `frontend.md`, `backend.md` | Created (Session 1) |

### Completed
- [x] Repository initialized (git, branch `main`)
- [ ] Frontend initialized
- [ ] Backend initialized
- [x] Architecture documentation created and approved by PO (2026-11-03)

### Phase 1 â€” Visual Builder
- [ ] React Flow canvas
- [ ] Custom node components
- [ ] Node library sidebar
- [ ] Drag-and-drop nodes
- [ ] Node connections
- [ ] Configuration panel
- [ ] Workflow JSON export
- [ ] Workflow JSON import

### Phase 2 â€” Backend
- [ ] FastAPI application
- [ ] Workflow API
- [ ] Pydantic schemas
- [ ] Workflow persistence
- [ ] PostgreSQL integration

### Phase 3 â€” Execution Engine
- [ ] Node registry
- [ ] Node execution interface
- [ ] Graph validator
- [ ] Execution scheduler
- [ ] Data propagation
- [ ] Execution logs

### Phase 4 â€” AI Runtime
- [ ] LLM node
- [ ] Agent node
- [ ] LangGraph integration
- [ ] Tool calling
- [ ] Memory

### Phase 5 â€” AI Workflow Generation
- [ ] Natural-language prompt interface
- [ ] Node catalog retrieval
- [ ] Structured graph generation
- [ ] Workflow validation
- [ ] Canvas rendering
- [ ] Conversational workflow editing

### Phase 6 â€” Integrations
- [ ] MCP integration
- [ ] HTTP tools
- [ ] Database tools
- [ ] RAG integration

### Phase 7 â€” Production
- [ ] Authentication
- [ ] Credential management
- [ ] Background workers
- [ ] Human approval
- [ ] Monitoring
- [ ] Docker deployment

## 7. Current Development State

- **Current phase:** Phase 0 (bootstrap) is complete. Phase 1 (visual builder) is **planned and blocked on architecture approval**.
- **Current milestone:** Architecture review.
- **Current task:** Waiting for PO and Principal Architect review of `docs/ARCHITECTURE.md` and the Proposed decisions D-002 to D-011.
- **Last completed task:** Session 1. Repository inspection, documentation, rules, architecture proposal, Phase 1 plan.
- **Last verified commit:** None (git not initialized).

## 8. Technical Decisions

Full log: `docs/DECISIONS.md`.

**Approved:**
- D-001 Initial technology stack (React/TS/Vite/@xyflow/react/Lucide; FastAPI/Pydantic; LangGraph/LangChain; PostgreSQL/Redis/Docker).

**Also approved by the PO on 2026-11-03 (D-006 clarified: dependency-based DAG executor with branching, skipping and concurrency-capable design; cycles rejected):**
- D-002 monorepo
- D-003 workflow JSON decoupled from React Flow
- D-004 TS types first, then Pydantic-canonical
- D-005 Zustand
- D-006 DAG-only engine v1 (with PO clarification, see DECISIONS.md)
- D-007 NL edits as patches
- D-008 Python 3.12 via uv
- D-009 SQLAlchemy + Alembic
- D-010 remote-only MCP
- D-011 CSS Modules

## 9. Known Issues

1. **Unrelated parent instructions file.** `C:\Users\shail\Downloads\CLAUDE.md` contains the spec for a different project (an AI Hiring MVP: Streamlit/FAISS/Whisper). Claude Code loads it into every AgentForge session, and it conflicts with this project's stack. **Action for PO:** move it into that project's own folder. Claude will not modify files outside this repo.
2. **Not a git repository.** Proposed as Phase 1 step 0.
3. **Docker, PostgreSQL and Redis are not installed.** Not needed for Phase 1; Docker Desktop is required before Phase 2.
4. **Default Python is 3.14.2.** Proposed: pin the backend to 3.12 via uv (D-008).

## 10. Open Questions

1. Approve or amend the architecture proposal (`docs/ARCHITECTURE.md`) and decisions D-002 to D-011, especially:
   - D-003/D-004: freezing Workflow JSON v1 before Phase 1.
   - D-005: Zustand, a new dependency.
   - D-009: SQLAlchemy + Alembic, new dependencies.
2. Approve `git init` plus an initial commit (Phase 1 step 0)?
3. Phase 2 local database: install Docker Desktop (recommended) or a native PostgreSQL install?
4. Which LLM providers are first-class in Phase 4 (e.g. OpenAI, Anthropic, Ollama for local)? Affects `get_chat_model` and test fakes.
5. Is multi-user auth a hard requirement before any deployment, or is single-user local mode acceptable until Phase 7?

## 11. Last Session Handoff

- **Date:** 2026-11-03 (Session 1)
- **Last task:** Project bootstrap (Tasks 1â€“7): inspection, docs, rules, architecture proposal, Phase 1 plan.
- **Implemented changes:** documentation and rule files only (see Â§6 Files). No application code.
- **Tests:** none executed, because no code exists. Verification consisted of reading back every created file.
- **Next task:** architecture review by the PO and ChatGPT. After approval: Phase 1 step 0 (git init) and step 1 (frontend scaffold).

## 12. Next Recommended Action

1. PO / Principal Architect review `docs/ARCHITECTURE.md` and mark decisions D-002 to D-011 Approved, Amended or Rejected in `docs/DECISIONS.md`.
2. PO moves `Downloads\CLAUDE.md` out of the AgentForge parent path.
3. Once approved, execute **Phase 1 step 0** (git init + `.gitignore`), then **step 1** (scaffold `frontend/`), as detailed in `docs/ROADMAP.md`.

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
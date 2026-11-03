# PHASE 2 PLAN — BACKEND FOUNDATION (PROPOSED)

> **Status: PROPOSED. Phase 2 is NOT approved. No backend work has started and none will until the Product Owner explicitly approves this plan.**
> Prepared 2026-11-03 (Session 3) as review material. Uncommitted until the PO approves.
> Related: `docs/ARCHITECTURE.md` §3, §4, §10 · `docs/DECISIONS.md` (D-002, D-004, D-008, D-009, D-013 to D-018) · `docs/PHASE1_REVIEW.md` §1.4 (contract concerns H1–H5, M1–M9).

## 0. Goal and scope

**Goal:** a backend that owns the Workflow JSON v1 contract (Pydantic as source of truth, per D-004), serves the node catalog, stores workflows with immutable versions in PostgreSQL, validates every document, and is wired to the existing frontend for save and open.

**In scope:** the ten steps below.
**Out of scope (later phases):** workflow execution and the engine (Phase 3), LLM nodes and agents (Phase 4), natural-language generation (Phase 5), MCP and tools (Phase 6), real authentication, credentials storage and background workers (Phase 7; see Q5 in the review for the single-user stance).

## 1. Preconditions (blocked until done)

| # | Precondition | Owner | State |
|---|---|---|---|
| P1 | PO approves this plan | PO | **Pending** |
| P2 | D-013 workflow contract final code review completed, and decisions on H1–H5 recorded | Principal Architect + PO | **Pending** (blocks step 2 onward) |
| P3 | Docker Desktop installed | PO | **Pending** (blocks step 6 onward; steps 1–5 do not need it) |
| P4 | A GitHub remote exists, only if CI is wanted | PO | **Pending**, optional (the repo has no remote) |

## 2. Decisions needed from the PO / architect before or during Phase 2

| # | Decision | Recommendation |
|---|---|---|
| X1 | How node configs are modelled in Pydantic (H1) | Keep `configSchema` as catalog data validated by a Python port of `validateConfig`; typed per-node config models arrive with executors in Phase 3 |
| X2 | Branch-port marker and per-node migration hook (H3, H4) | Add both as additive optional fields while writing the models |
| X3 | JSONB vs key-order stability (H5) | Sort `config` and `metadata` keys in the frontend `serializeWorkflow`; store JSONB |
| X4 | Id ownership (M1) | Server assigns the workflow id on create |
| X5 | New dev tooling: `ruff` (lint and format), optionally `mypy` | Approve `ruff`; `mypy` optional |
| X6 | New dependencies: `asyncpg` (driver, implied by D-009), `json-schema-to-typescript` (frontend dev, step 4) | Approve both |
| X7 | `GET /api/catalog` response envelope | `{ "nodes": [...] }` rather than a bare array, so metadata can be added later |
| X8 | Contract size limits (M2) | Choose numbers in step 2 (e.g. max nodes, edges, string lengths) |
| X9 | Whether Playwright (Phase 1.1) lands before step 10 | Recommended yes |

## 3. Dependency order

```
P2 ──► 1 ─► 2 ─► 3 ─► 4 ─┐
        │    ├─► 5 ───────┤
        │    └─► 9 ───────┤
P3 ──► 6 ─► 7 ─► 8 ───────┴─► 10
```

Step 1 can start after P1 alone. Step 2 needs P2. Steps 6–8 need P3. Step 10 needs 4, 5, 8 and 9.

---

## 4. Steps

Sizes (S/M/L) are rough engineering estimates, not commitments.

### Step 1 — FastAPI scaffold on Python 3.12 with uv (S)

- **Objective:** a runnable, tested, lint-clean backend skeleton that follows `.claude/rules/backend.md`.
- **Dependencies:** P1. No Docker needed.
- **Scope:**
  - `backend/` with `.python-version` = `3.12`, `pyproject.toml`, `uv.lock`.
  - Runtime deps: `fastapi`, `uvicorn[standard]`, `pydantic`, `pydantic-settings`. Dev deps: `pytest`, `pytest-asyncio`, `httpx`, `ruff` (X5).
  - `app/main.py` with an app factory and router registration; `app/settings.py` (env-driven, no secrets in code); `app/api/health.py` with `GET /api/health`.
  - One central domain-exception to HTTP-error mapping; CORS limited to the frontend dev origin; default bind `127.0.0.1` (review Q5).
  - `.env.example` with placeholders only. `.gitignore` already covers `.env`.
- **Acceptance:** `uv sync` succeeds on a clean checkout; `uv run uvicorn app.main:app` serves; `GET /api/health` returns 200; `uv run pytest` and `uv run ruff check` exit 0.
- **Tests:** health endpoint via `httpx.AsyncClient`; settings load from env and fail clearly when a required value is missing; CORS header for the allowed origin only.

### Step 2 — Pydantic workflow and node-catalog models (M)

- **Objective:** make Pydantic the canonical definition of the document and catalog shapes, exactly matching the frozen v1 contract.
- **Dependencies:** Steps 1, P2 (decisions X1, X2, X4, X8).
- **Scope:**
  - `app/workflow/models.py`: `Workflow`, `WorkflowNode`, `WorkflowEdge`, `PortRef`, `Position`. `schemaVersion` as a `Literal` or pattern (M4), integer `typeVersion`, finite floats, `extra` policy decided (L2), size and length constraints (M2).
  - `app/catalog/models.py`: `NodeDefinition`, `PortDefinition`, `ConfigSchema`, `ConfigProperty`, `DataType` and `NodeCategory` as enums or Literals. Include any additive fields approved in X2 (branch marker, node-migration hook).
  - `app/catalog/builtin.py`: the six built-in definitions ported from `frontend/src/catalog/nodes.ts` **with identical values**, plus `groq` in the provider enum (D-014) if approved in the D-013 outcome.
  - A parity test that the Python catalog equals a JSON export of the TS catalog.
- **Acceptance:** the six definitions serialize to JSON identical (modulo key order) to the frontend catalog; models reject malformed documents; every `defaults` value satisfies its `configSchema`.
- **Tests:** model validation (valid, malformed, boundary sizes); catalog consistency tests ported from `catalog.test.ts` (unique `type@version`, unique port names, defaults valid); TS/Python catalog parity test.

### Step 3 — JSON Schema generation (S)

- **Objective:** a deterministic, committed JSON Schema for the document and the catalog, generated from the Pydantic models.
- **Dependencies:** Step 2.
- **Scope:** `backend/scripts/export_schemas.py` writes `contracts/workflow.schema.json` and `contracts/catalog.schema.json` (sorted keys, stable formatting). The `contracts/` directory sits at the repo root and is committed. A `uv run` entry point regenerates them.
- **Acceptance:** running the exporter twice produces no diff; the schemas validate the golden sample workflows; the schema encodes the constraints chosen in step 2.
- **Tests:** a test that regenerates the schema in memory and asserts equality with the committed files (the drift check for the backend side); sample documents validate against the schema.

### Step 4 — TypeScript type generation and drift checks (M)

- **Objective:** the frontend's contract types come from the backend schema, replacing hand-written types without changing behaviour.
- **Dependencies:** Step 3 (and X6 for `json-schema-to-typescript`).
- **Scope:**
  - Add `json-schema-to-typescript` as a frontend dev dependency; script `npm run gen:types` writes `frontend/src/workflow/generated/*.ts`.
  - Transition: keep `types.ts` as a thin re-export of generated types plus the `SCHEMA_VERSION` constant and any hand-written refinements; add a type-level equivalence test (Vitest `expectTypeOf`) between old and new shapes during the switch, then remove the hand-written duplicates.
  - Drift check: `npm run gen:types` followed by `git diff --exit-code` as a script (`npm run check:types`), plus the backend test from step 3; both wired into CI if P4.
- **Acceptance:** `tsc -b`, lint, 48+ Vitest tests and the build all still pass; generated output is deterministic; modifying a Pydantic model without regenerating fails the drift check.
- **Tests:** existing frontend suite unchanged and passing; type-equivalence test; drift check demonstrated to fail on a deliberate change (recorded in the dev log).

### Step 5 — `GET /api/catalog` (S)

- **Objective:** serve the node catalog from the backend as the single source for the editor.
- **Dependencies:** Step 2.
- **Scope:** `app/api/catalog.py` returns `{ "nodes": [NodeDefinition, ...] }` (X7) from `app/catalog/builtin.py`; a response model; `ETag` and `Cache-Control` so the editor can revalidate cheaply. No auth and no per-user catalog yet.
- **Acceptance:** the response validates against `catalog.schema.json` and equals the built-in catalog; the frontend can consume it unchanged.
- **Tests:** status and body shape; schema validation of the response; `If-None-Match` returns 304; ordering is stable.

### Step 6 — PostgreSQL via Docker Compose, SQLAlchemy and Alembic (M)

- **Objective:** a reproducible local database with versioned migrations (D-009).
- **Dependencies:** Step 1, P3.
- **Scope:**
  - `docker-compose.yml` at the repo root with `postgres` (pinned major version), a named volume, a healthcheck, and credentials read from environment variables with placeholders in `.env.example`. **No real secrets are committed.**
  - `app/db/`: async engine and session (SQLAlchemy 2.0, `asyncpg`), declarative models, `alembic/` configured with an async env.
  - First migration: `users` (with one seeded local user, review Q5), `workflows`, `workflow_versions` (JSONB `document`). Every owned table has `owner_id`.
  - A dedicated test database and a pytest fixture that migrates it and isolates each test (rollback or truncate).
- **Acceptance:** `docker compose up -d db` becomes healthy; `alembic upgrade head` then `alembic downgrade base` both succeed on a clean database; the app connects using only environment configuration.
- **Tests:** migration up and down; constraint tests (unique, foreign keys); session and fixture isolation test.

### Step 7 — Workflow CRUD APIs (M)

- **Objective:** create, list, read, replace and delete workflows, scoped by owner.
- **Dependencies:** Steps 2, 6 (and 9 for validation, which can start with a stub and be completed in step 9).
- **Scope:**
  - `POST /api/workflows`, `GET /api/workflows` (summaries with `limit`/`offset`), `GET /api/workflows/{id}`, `PUT /api/workflows/{id}`, `DELETE /api/workflows/{id}`.
  - Pydantic request and response models; server-assigned ids (X4); every query scoped to the current user via a single `get_current_user()` dependency returning the local user; consistent error mapping (404, 409, 422).
- **Acceptance:** a full create, read, update, delete cycle through the API; a workflow belonging to another `owner_id` returns 404; invalid documents are rejected with 422.
- **Tests:** per-endpoint happy and error paths via `httpx.AsyncClient`; owner isolation (a second user cannot read or delete); pagination bounds; id assignment ignores a client-supplied id.

### Step 8 — Versioned workflow snapshots (M)

- **Objective:** every save creates an immutable version; runs and history can later refer to an exact version.
- **Dependencies:** Steps 6, 7.
- **Scope:**
  - `PUT` creates a new row in `workflow_versions` (monotonic version number, `schemaVersion`, content hash, timestamp) and updates `workflows.current_version_id`. Rows are never updated.
  - Identical content (same canonical hash) does not create a new version.
  - Optimistic concurrency: `PUT` carries `baseVersion`; a mismatch returns 409.
  - `GET /api/workflows/{id}/versions` and `GET /api/workflows/{id}/versions/{n}`.
  - The hash uses a canonical, key-sorted serialization, so it is stable despite JSONB key reordering (X3 and review H5).
- **Acceptance:** versions increment on change and not on no-op saves; old versions stay readable and unchanged; concurrent stale writes get 409.
- **Tests:** increment and no-op cases; immutability (no update path exists); 409 on stale `baseVersion`; version listing order; the JSONB round trip preserves content.

### Step 9 — Backend validation and conformance tests (L)

- **Objective:** the backend enforces the same rules as the editor, with structured errors and proof of parity.
- **Dependencies:** Step 2 (needed by step 7's final form and step 10).
- **Scope:**
  - `app/workflow/validator.py`: a Python port of `validateWorkflow`, `checkConnection` and `validateConfig`, with the same rule order, producing `{code, path, message}` errors (M5).
  - `contracts/fixtures/`: shared JSON cases (valid workflows and invalid ones with expected error codes and paths), consumed by **both** pytest and Vitest.
  - Frontend refactor (needs approval, see M5): `validate.ts` emits structured errors while keeping the message text, with fixture tests added to Vitest.
  - `migrate` ported with an empty registry and the loop guard; per-node migration hook if approved (X2).
  - The API returns 422 with the structured error list. Warnings (D-017/D-018) stay frontend-only in Phase 2.
- **Acceptance:** every fixture gives the same codes in TypeScript and Python; the API rejects each invalid fixture with the expected codes; no rule exists in only one implementation.
- **Tests:** the fixture suite on both sides; unit tests per rule (the seven connection rules, config checks); cycle detection on larger graphs; error cap and ordering behaviour documented and tested (L4).

### Step 10 — Frontend–backend integration (M)

- **Objective:** the editor loads its catalog from the backend and saves and opens workflows through the API.
- **Dependencies:** Steps 4, 5, 8, 9 (and X9 for browser tests).
- **Scope:**
  - `frontend/src/api/`: a small typed client (fetch wrapper, error mapping), using the generated types.
  - Load the catalog from `GET /api/catalog` at startup (loading and error states). The static catalog remains only as a test fixture.
  - Toolbar: **Save**, **Open** (list from the API), unsaved-changes indicator; show 409 (reload or overwrite choice) and 422 (list the structured errors).
  - Vite dev proxy for `/api`; `README` run instructions for `docker compose`, backend and frontend.
  - Export and Import stay as they are.
- **Acceptance:** with the backend running, a user can build a workflow, save it, reload the page, open it from the list and get an identical workflow, with the exported bytes unchanged from before the save (X3); backend errors are shown readably; the editor shows a clear message when the backend is down.
- **Tests:** Vitest for the client (mocked fetch: success, 409, 422, network failure); Playwright end-to-end against the real backend if Phase 1.1 landed (save → reload → open → byte-identical export); manual check otherwise, recorded honestly in the log.

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| Contract drift between TypeScript and Python | Generated types (step 4), shared fixtures (step 9), CI drift checks |
| JSONB key order breaks byte-identical export (H5) | X3: sort `config`/`metadata` keys in `serializeWorkflow`; hash over canonical JSON |
| Changing the contract after the models exist | Decide H1–H5 first (P2); keep every change additive |
| Docker not available on the PO's machine | Steps 1–5 and the pure parts of 9 proceed without it |
| Scope creep into execution or auth | Execution is Phase 3, auth is Phase 7; the `get_current_user()` seam is the only concession |
| Toolchain newness (Python 3.12 via uv on Windows, TS 7 type generation) | Verify early in steps 1 and 4; report problems instead of working around them silently |

## 6. Definition of done for Phase 2

All ten steps meet their acceptance criteria; backend `pytest` and `ruff` pass; frontend `tsc`, lint, Vitest and build pass; drift checks pass; the end-to-end save and open flow is verified and the evidence recorded in `docs/DEVELOPMENT_LOG.md`; `PROJECT_BRAIN.md` matches the repository; remaining limitations are listed.

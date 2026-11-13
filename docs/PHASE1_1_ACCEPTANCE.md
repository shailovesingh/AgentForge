# PHASE 1.1 ACCEPTANCE REPORT (milestone MS-C)

> Written by the Principal Architect for the Product Owner, 2026-11-13 (Session 13), at commit `1816a1f`.
> **Status: awaiting the Product Owner's decision.** MS-C is not approved yet. Phase 2 is not authorized.
> Source of truth for detail: `docs/DEVELOPMENT_LOG.md` Sessions 6 to 13, `docs/PROJECT_BRAIN.md`, `docs/DECISIONS.md` (D-001 to D-036).

## 1. Outcome in plain language

Phase 1 gave AgentForge a working visual workflow editor. Phase 1.1 made it trustworthy: a precise, tested contract for what a workflow file is and how it is read and written, honest warnings about unfinished drafts, protection against pasting a credential into an exported file, and an automated browser test suite with CI. All ten tasks (T1 to T10) are implemented. Every task was reviewed by an independent Opus reviewer when it landed, the whole phase was reviewed again at the end (decision D-036), and every blocker and major finding was fixed.

What a user can now do and rely on:
- Import and export workflow files with strict, deterministic handling (duplicate keys, huge numbers, bad encodings, oversize files are rejected with precise, structured errors; the same workflow always exports to the same bytes).
- Open an older file (for example an Agent node saved before a settings change): it is upgraded in memory, the user is told what changed, and the saved file is never rewritten.
- Build unfinished drafts: missing required settings and unconnected inputs show as quiet warnings and never block anything.
- Paste a credential by accident and be warned prominently; every export that contains a probable credential asks for explicit confirmation (Cancel is the default; nothing is remembered); the credential is never repeated on screen.

## 2. What was verified, and what was not

| Check | Result (actual) |
|---|---|
| `npm run verify` at `1816a1f`, run by the Principal Architect | **exit 0**: lint clean, typecheck of all four tsconfigs, **22 test files, 1440 unit tests**, production build, **88 browser tests (Chromium)** |
| Shared fixtures | 559 case files in 9 families; the runner checks shape, compares `{code, path}` as multisets, requires every error code to be covered (documented exemptions only), enforces minimum counts, and scans every text file of the repository for token-shaped strings |
| Phase-level Opus review (read-only, whole phase) | FAIL with two blockers (stale project memory; a credential could still show in one error panel): both fixed and re-verified. It also reported: no runtime dependency added, CI actions pinned to commit SHAs, no credential-shaped string in the tree, in any commit message or in the whole git history |
| Reviewer and implementer numbers | Differentials (up to 120,000 generated cases), mutation proofs and speed measurements are **reports by the reviewers and implementers**; the Principal Architect re-ran the project checks, not those experiments |
| **Not verified** | **Python parity (no Python exists)**; screen-reader behaviour; browsers other than Chromium; CI on Linux for tasks after T1 (not seen by Claude); the browser tests run against the Vite dev server, not the production build; GitHub's real push-protection rules |

## 3. Deliverables

| Task | Delivered |
|---|---|
| T1 | Playwright browser tests, `npm run verify`, GitHub Actions CI with actions pinned to commit SHAs |
| T2 | Structured errors `{code, path, message}` with stable codes and JSON Pointer paths (37 codes) |
| T3 | Language-neutral shared fixtures in `contracts/` and their TypeScript runner |
| T4 | Strict JSON parser with policy limits; canonical compact JSON (for hashing) and pretty export JSON; export that never throws |
| T5 | Node settings described by a documented JSON Schema subset; explicit defaults; `groq` provider; incomplete drafts import (decision C1) |
| T6 | Versioned node migrations (Agent node version 2) with an upgrade banner |
| T7 | Editor warnings as a pure derived function; node badge, toolbar list, settings-panel section |
| T8 | Binding specification of branching, skipping and joins (`ARCHITECTURE.md` 6.1) and the `branch` marker |
| T9 | Secret detector; prominent indicators; export confirmation dialog; never-echo browser tests |
| T10 | Documents aligned with the code; D-013 (contract review) approved; this report |

Specifications and fixtures live in `contracts/`: `CANONICAL_JSON.md`, `CONFIG_SCHEMA.md`, `MIGRATIONS.md`, `WARNINGS.md`, `SECRETS.md`.

## 4. What the reviews caught (why the review loop was worth it)

Real defects that all tests had passed: a refactor that lost a protection and let editor-only fields into exported files; a checker that crashed on a malformed schema; a settings dropdown that **displayed "ollama" while the data held no provider**; a branching specification that contradicted itself (it skipped every trigger when read literally); a warning UI that made dragging a 500-node workflow about 5 times slower; **a credential that could be exported with no warning when 50 harmless-looking findings came first** (this one also showed that a limit I had accepted as "documented" narrowed a Product Owner security decision: reversed, D-035); a Delete key that deleted nodes behind the open confirmation dialog; credential text partly shown in two different error messages (cut before checking; checked after JSON escaping). All fixed and covered by tests.

## 5. Known limitations (the ones that matter)

1. No Python exists; every cross-language rule (number text, key order, half-up rounding, whitespace set, string lengths, strict parsing) is written down but unproven until Phase 2 runs the fixtures in Python.
2. Credentials are only **detected**, never stored safely; `credentialRef` does not exist yet. The detector covers node settings and metadata, **not the workflow name, description or node labels** (decision needed, section 6).
3. Editor speed at 500 nodes: node-drag and settings typing are now faster than before the warning badges (implementer's production-build measurement), but typing in the **workflow name** is still about 40% slower than at the start of Phase 1.1 (cause not found).
4. No component tests (browser tests and source-text guards instead); no speed check in CI.
5. 46 local commits are not pushed; CI on Linux is unseen. Two ordinary-word strings in git history resemble an OpenAI-style key pattern (not credentials); GitHub's real push-protection rules could not be checked offline.
6. Debts: duplicated text-cutting helpers; `exportWorkflowText` catches every exception; loose catalog port types.

## 6. Decisions needed from the Product Owner

1. **Accept milestone MS-C (Phase 1.1)?** Recommendation: yes.
2. **Secret-scan scope (review finding M2).** Today a token pasted into the workflow **name** (or description, or a node label) is not detected and is exported without the dialog (it is kept out of the download file name). Recommendation: **also scan name, description and labels** (a small change, about one task; it strengthens D-023, so it needs your approval).
3. **Push.** Push to GitHub when you are ready (I never push) and tell me how CI went. If it fails, I fix it as a follow-up.
4. **Phase 2.** Approve, change or defer the brief in section 7.
5. Housekeeping: move `C:\Users\shail\Downloads\CLAUDE.md` (the unrelated AI-hiring spec) out of the AgentForge parent folder; decide about the untracked `.kilo/` folder.

## 7. Phase 2 brief (PROPOSED; ready to approve)

**Goal:** a backend that owns the Workflow JSON contract (Pydantic as the source of truth), serves the node catalog, stores workflows as immutable versions in PostgreSQL, validates every document with the same rules as the editor (proven by running the same 559 fixtures in Python), and is wired to the existing editor for Save and Open. Details of each step: `docs/PHASE2_PLAN.md` (steps 1 to 10, amended with the Phase 1.1 outcomes).

**How it would run (D-036):** Sonnet implements the phase in three batches, one commit per step, checks after every step; I verify at each batch boundary; Opus reviews the completed phase once, plus an **early Opus review for the security-critical steps** (marked below).

| Batch | Steps | Notes |
|---|---|---|
| A (no Docker needed) | 1 FastAPI scaffold on Python 3.12 with uv; 2 Pydantic models; 3 JSON Schema generation; 4 TypeScript type generation with a drift check; 5 `GET /api/catalog` | Step 2 must accept the Phase 1.1 catalog contract (schema subset, `ui`, `branch`, no `defaults`, agent v2) and the strict-parser limits |
| B | 6 PostgreSQL via Docker Compose, SQLAlchemy, Alembic; 7 workflow CRUD APIs; 8 immutable versions with a content hash (SHA-256 of the canonical compact form) | **Step 7 is security-critical** (owner isolation: a user must never read another user's workflow): early Opus review when the batch lands |
| C | 9 backend validation and conformance (a Python port of the strict parser, validator, schema checker, migrations and canonical JSON, run against the 559 shared fixtures); 10 editor integration (Save, Open, 409 and 422 handling) | **Step 9 is security-critical** (the untrusted-input boundary: strict request parsing, no echo of input values in server errors): early Opus review |

**Preconditions status:** Phase 1.1 accepted (your MS-C decision); D-013 resolved; Docker Desktop is installed and running; Python 3.12 via uv is already approved (D-008); a GitHub remote exists.

**My recommended answers to the open Phase 2 decisions (approve all with one word, or change any):**

| # | Decision | Recommendation |
|---|---|---|
| X1 | How node settings are modelled | Keep the settings schema as catalog **data** in the documented subset; the Python side ports the validator and checks every catalog schema against the official JSON Schema metaschema. Typed per-node models come with executors in Phase 3. |
| X2 | Branch marker and node migration hook | Already built in Phase 1.1 (T8, T6): port them. |
| X3 | JSONB key order vs byte-identical export | Already solved in Phase 1.1 (T4): export writes sorted keys; the hash uses the canonical compact form; store JSONB. |
| X4 | Who assigns workflow ids | The **server** assigns the id on create and ignores a client-supplied id. |
| X5 | Python tooling | Approve `ruff` (lint and format); `mypy` optional, not required. |
| X6 | New dependencies | Approve `asyncpg` (database driver) and `json-schema-to-typescript` (frontend dev dependency for step 4). |
| X7 | `GET /api/catalog` envelope | `{ "nodes": [...] }`, not a bare array. |
| X8 | Contract size limits | At most 1,000 nodes and 5,000 edges per workflow; label and name at most 200 characters; description at most 5,000; the existing limits stay (5,000,000 bytes, depth 64). Step 2 may adjust with evidence. |
| X9 | Playwright before step 10 | Done in Phase 1.1 (88 browser tests). |
| X10 | Backend secret handling | **Reject** a save that contains a high-confidence credential with a structured 422 and no override (the server persists what it receives); credential storage itself is a later phase. This depends on your secret-scan scope decision in section 6. |

**Risks to accept with the brief:** the Python side is unproven until step 9; defects found at the phase review cost more rework (mitigated by checks after every step and the two early security reviews); Phase 2 changes no editor behaviour except adding Save and Open.

**Not in Phase 2:** workflow execution (Phase 3), LLM and agent nodes (Phase 4), natural-language generation (Phase 5), MCP and integrations (Phase 6), authentication, credential storage, workers and deployment (Phase 7).

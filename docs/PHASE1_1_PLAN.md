# PHASE 1.1 PLAN — CONTRACT HARDENING, WARNINGS, PLAYWRIGHT (PROPOSED)

> **Status: PROPOSED, awaiting final approval from the Product Owner and Principal Architect. Nothing here is implemented.**
> Prepared 2026-11-03 (Session 4). **Phase 2 is not started and not authorized.** This plan changes no application code until approved.
> Inputs: the PO's review decisions of 2026-11-03 (Q1–Q6, H1–H5, additional requirements) · `docs/PHASE1_REVIEW.md` · `docs/DECISIONS.md` (D-012 to D-024).

---

## 1. What the Product Owner decided (recap)

| Item | PO decision | Where it lands in this plan |
|---|---|---|
| Q1 | Providers: Groq, OpenAI, Anthropic, Ollama | §3.8, task T5 |
| Q2 | Playwright approved as a Phase 1.1 task | §3.9, task T1 |
| Q3 | Keep TypeScript 7, Vite 8, Oxlint, Vitest 5 | no change |
| Q4 | Phase 1 accepted as functionally complete, subject to Phase 1.1 follow-ups | this plan |
| Q5 | Single-user local mode; keep a `get_current_user()` boundary; no exposure beyond localhost without proper auth | Phase 2 (unchanged) |
| Q6 | Non-blocking warnings, **aware of node categories and port direction** | §3.6, task T7 |
| H1 | Propose migration toward standard JSON Schema (integer, array, nested objects, defaults, required, items); UI hints separate from validation | §3.1, task T5 |
| H2 | **Approved:** shared JSON fixtures for Vitest and pytest; propose structure and expected outcomes | §3.2, task T3 |
| H3 | Design versioned node migration by `type` + `typeVersion`; never overwrite old workflows silently | §3.3, task T6 |
| H4 | Define named-output, selected-branch and skipped-node semantics for the future engine, compatible with v1 | §3.4, task T8 |
| H5 | Deterministic serialization: recursively sorted keys, array order preserved; same across TypeScript, Python, PostgreSQL JSONB | §3.5, task T4 |
| Extra | Review HTTP header credential exposure; credentials stay outside workflow JSON; extensible providers; warnings never block editing; add Playwright with reproducible local and CI runs | §3.7, §3.8, §3.9 |

## 2. Which issues change Workflow JSON v1?

Two contracts are involved and the answer differs for each:

- **Workflow document (v1)**: what a saved or exported `.json` workflow contains (`schemaVersion`, `nodes`, `edges`, ...).
- **Node catalog contract**: `NodeDefinition` and its `configSchema`, served later by `GET /api/catalog`. It has no external consumer yet, so it is cheap to change now.

| Issue | Changes the **document structure** (needs `schemaVersion` bump)? | Changes the **catalog contract**? | Changes **bytes on export**? | Can break existing saved workflows? |
|---|---|---|---|---|
| H1 JSON Schema config | **No.** Node `config` stays an arbitrary JSON object; arrays and nested objects only widen what a value may be. | **Yes** (`configSchema` becomes a JSON Schema subset, UI hints move to `ui`, `defaults` replaced by schema `default`). | No | Only if `maxIterations` is tightened to `integer`; handled by a **node** migration (H3), not a document change. |
| H2 Shared fixtures | No | No | No | No |
| H3 Node migrations | **No.** Uses the `typeVersion` field that v1 already has. | No (a node's new version is a new catalog definition) | No | No: migration is the mechanism that **prevents** breakage. |
| H4 Condition semantics | **No.** Edges already name ports. | **Additive, optional**: `PortDefinition.branch` | No | No |
| H5 Canonical serialization | **No structural change.** Reading is unaffected. | No | **Yes, once.** Keys become recursively sorted, so e.g. `schemaVersion` moves from first to last. Old files still import and re-export in the new order. | No for reading. Stricter value rules (safe integers, no NUL, no lone surrogates) would newly reject documents that hold such values; none are producible by the editor today. |
| Secret guard | No | No | No | A document that already contains a high-confidence secret would be blocked at export (that is the intent). |
| Warnings | No (warnings are derived, never stored) | No | No | No |
| Providers | No | Additive enum value (`groq`) | No | No |

**Conclusion:** none of H1–H5 requires a new `schemaVersion` or a structural change to Workflow JSON v1. The format is **not** broken. The catalog contract changes (H1, H4, providers) and the export byte layout changes once (H5). If the architect treats the canonical byte form as part of the format, H5 is the only candidate for a `1.1` bump; my recommendation is no bump, because every reader of v1 is unaffected.

All catalog and serialization changes are in scope of D-013 (**still pending final code review**), so I recommend the architect reviews this plan and the four contract files together.

---

## 3. Design

### 3.1 H1 — Configuration schema moves to a JSON Schema subset

**Findings from the code (verified):**
- `ConfigProperty` supports `string | number | boolean | object`, `enum`, `minimum`, `maximum`, and a non-standard `format: 'multiline'` (`workflow/types.ts`). `format: 'multiline'` is used on 4 properties in `catalog/nodes.ts` and read by `ConfigPanel.tsx`.
- `NodeDefinition.defaults` is a separate object (`catalog/nodes.ts`, read by `editorStore.addNode`).
- There is no `integer`, array, nested object, `items`, `default`, `additionalProperties` or length keyword. `maxIterations` is a `number`, so `2.5` is accepted.
- `validateConfig` rejects unknown keys implicitly (JSON Schema's default would allow them).

**Proposed model.** `configSchema` becomes a **documented subset of JSON Schema draft 2020-12**; presentation moves to a separate `ui` block.

```ts
// workflow/types.ts (proposed)
type JsonSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
interface JsonSchema {
  type: JsonSchemaType
  title?: string; description?: string; default?: unknown
  enum?: unknown[]
  minLength?: number; maxLength?: number                      // string
  minimum?: number; maximum?: number                           // number, integer
  items?: JsonSchema; minItems?: number; maxItems?: number     // array
  properties?: Record<string, JsonSchema>                      // object
  required?: string[]; additionalProperties?: boolean | JsonSchema
}
type ConfigSchema = JsonSchema & { type: 'object' }

interface NodeDefinition {
  /* ...existing... */
  configSchema: ConfigSchema          // validation semantics only
  ui?: {                              // presentation only; never affects validity
    order?: string[]
    fields?: Record<string, { widget?: 'text' | 'textarea' | 'select' | 'json' | 'checkbox'; rows?: number; placeholder?: string }>
  }
  // `defaults` is REMOVED: new nodes are built from schema `default` values
}
```

**Subset rules (documented in `contracts/CONFIG_SCHEMA.md`):**
- **Supported keywords:** `type`, `title`, `description`, `default`, `enum`, `minLength`, `maxLength`, `minimum`, `maximum`, `items`, `minItems`, `maxItems`, `properties`, `required`, `additionalProperties`.
- **Deliberate non-goals** (not in the subset): `$ref`, `$defs`, `anyOf`, `oneOf`, `allOf`, `not`, `if/then/else`, `patternProperties`, `format`, `pattern`. Reason: `pattern` has different regex dialects in JavaScript and Python; `$ref` and `anyOf` are what Pydantic emits by default, so Phase 2 must emit this flat subset (see risk R3).
- **Strings:** `minLength` and `maxLength` count **Unicode code points**, not UTF-16 units. The TypeScript validator must use `[...value].length`; `'😀'.length` is `2` in JavaScript but `len('😀')` is `1` in Python (checked on this machine).
- **Integers:** `integer` accepts any JSON number with no fractional part (`1.0` is an integer). Values must be safe integers (see H5).
- **Objects:** every catalog schema sets `additionalProperties: false` explicitly, which preserves today's "unknown setting is an error" behaviour (the standard default would allow extras).
- **Defaults:** `default` is the single source for initial values. Every `required` property must have a `default` (kept from today's catalog test). Defaults must validate against their own schema (test).
- **UI separation:** `multiline` becomes `ui.fields.<name>.widget = 'textarea'`. Nothing in `ui` is read by the validator; the importer ignores it.
- **Config panel rendering in 1.1:** string, enum, number, integer and boolean get real controls. **Arrays and nested objects use the existing JSON editor** (validated against the schema). Rich array and nested-object editors are out of scope.

**Validator.** `configSchema.ts` is generalized to `validateAgainstSchema(schema, value, path)` returning `{ path, code, message }` with keyword-derived codes (`schema.type`, `schema.enum`, `schema.required`, `schema.minimum`, `schema.maxLength`, `schema.additionalProperties`, ...). It is our own small implementation (no new runtime dependency; this is recommendation D-022-a). Standards conformance of the catalog schemas is checked in Phase 2 by validating each against the official metaschema with Python `jsonschema`.

**First migration this enables:** `agent.autonomous.maxIterations` becomes `integer`. Because that tightens validation, the node moves to `typeVersion` 2 with a node migration (§3.3) that rounds non-integers and records a note. This is the first real exercise of H3.

**Unchanged:** the document format, `config` as `Record<string, unknown>`, port definitions.

### 3.2 H2 — Shared fixtures for Vitest and pytest (approved)

**Location:** `contracts/` at the repo root (neutral between `frontend/` and `backend/`).

```
contracts/
  README.md                 fixture format, rules for adding cases, how each runner loads them
  CONFIG_SCHEMA.md          the schema subset (H1)
  CANONICAL_JSON.md         the serialization profile (H5)
  fixtures/
    format.json             { "fixtureFormat": 1 }
    catalog/
      builtin.catalog.json  export of the TS catalog (Phase 2 asserts the Python catalog equals it)
    workflow/
      valid/*.json          each: { name, description, input, expect: { valid: true, canonical: <ref> } }
      invalid/*.json        each: { name, input, expect: { valid: false, errors: [{code, path}] } }
    connection/*.json       { name, workflow, source, target, expect: null | "<code>" }
    config/*.json           { name, schemaOf: "llm.prompt", value, expect: [{code, path}] }
    migration/*.json        { name, input, expect: { valid, workflow, upgrades } }
    serialization/*.json    { name, inputText, expectCompact, expectExport }
    warnings/*.json         { name, workflow, expect: [{code, nodeId, port?}] }   (TS only; backend does not lint in Phase 2)
    secrets/*.json          { name, config, expect: { level: "block"|"warn"|"none", paths: [...] } }
```

**Common expected outcomes (the shared contract between the two runners):**
- **Valid:** `valid: true` and the canonical compact text of the resulting workflow.
- **Invalid:** `valid: false` and a list of `{ code, path }`. The runner compares the lists as **multisets**, ignoring order and ignoring the human message. `path` is a JSON Pointer (e.g. `/nodes/2/config/provider`).
- **Connection cases:** the first failing rule code, or `null`.
- **Raw JSON text** is used wherever number or key text matters (`inputText`), because parsing a fixture would already lose `1.0`, `-0`, `1e21` and key order.

**Proposed error codes** (stable, namespaced; also the basis of the API's 422 body in Phase 2):

| Namespace | Codes |
|---|---|
| `doc.*` | `not-json`, `not-object`, `too-large`, `unsupported-version`, `invalid-field` |
| `node.*` | `malformed`, `duplicate-id`, `unknown-type`, `version-newer`, `no-migration-path` |
| `connection.*` | `unknown-node`, `unknown-port`, `self-loop`, `duplicate`, `input-occupied`, `type-mismatch`, `cycle` |
| `edge.*` | `malformed`, `duplicate-id` |
| `schema.*` | `type`, `enum`, `required`, `additionalProperties`, `minimum`, `maximum`, `minLength`, `maxLength`, `minItems`, `maxItems` |
| `value.*` | `not-finite`, `unsafe-integer`, `invalid-unicode`, `nul-character` |
| `secret.*` | `detected` |

**Runners:**
- **Phase 1.1 (TypeScript):** `frontend/src/contracts/fixtures.test.ts` loads every file with Node `fs` and runs it against the real functions. The initial corpus is converted from the existing unit tests (about 40 cases).
- **Phase 2 (Python):** `backend/tests/test_fixtures.py` runs the same files (Phase 2 step 9).
- **Limitation (honest):** until Phase 2, the Python side does not exist, so parity is **not yet proven**. Mitigation: fixtures are written in implementation-neutral terms, and §3.5 and §3.1 list the known JS-vs-Python differences explicitly so the Python port can be written against them.

**Prerequisite:** the validator currently returns message strings only; task T2 adds `{ code, path, message }` first.

### 3.3 H3 — Versioned node migrations

**Goal:** a workflow saved with `agent.autonomous@1` must keep working after the catalog moves to version 2, without ever rewriting the saved file or version.

**Mechanism (code only; no document change):**

```ts
// workflow/nodeMigrations.ts (proposed)
interface NodeMigration {
  type: string; from: number; to: number               // normally to = from + 1
  migrate(node: { label: string; config: Record<string, unknown> }): {
    config: Record<string, unknown>
    notes: string[]                                    // human-readable, shown to the user
    portRenames?: { inputs?: Record<string, string>; outputs?: Record<string, string> }  // applied to edges
  }
}
const NODE_MIGRATIONS: NodeMigration[]                  // registry, ordered by (type, from)
```

**Pipeline** (extends the existing import path):
`text → JSON.parse → migrate (document schemaVersion) → migrateNodes (type + typeVersion) → validateWorkflow → loadWorkflow`

**Rules:**
1. `migrateNodes` works on the raw parsed object and only touches nodes with a string `type` and an integer `typeVersion` that have a registered chain; anything else is left for the validator to report.
2. It follows `from → to` until the catalog's **latest** version for that type. If the node is already at the latest version, nothing happens.
3. A node **newer** than the catalog (`typeVersion` greater than any known version) is an error `node.version-newer` ("created by a newer editor"). A gap with no chain is `node.no-migration-path`. Both reject the import and leave the open workflow unchanged.
4. Migrations are **pure, deterministic and total** over every config that was valid at the old version. No I/O, clock or randomness. A fixture-driven test asserts that each migrated result validates against the new schema.
5. A migration that renames a port also supplies `portRenames`, and edges are rewritten in the same step, so renames cannot orphan edges.
6. **Never silent.** `importWorkflow` returns `{ workflow, upgrades: [{ nodeId, type, from, to, notes }] }`. The editor shows a dismissible banner: *"Upgraded 2 nodes (Agent v1 to v2). Review the changes. Your original file was not modified."*
7. **Never overwritten.** The importer never writes back to the file. Exporting is an explicit user action producing a new file. **Phase 2 rule (to be recorded in that plan):** migration happens in memory at read time; the upgraded workflow is persisted only when the user saves, as a **new immutable version**, and the stored old version is never touched.
8. No downgrade path. A file exported at version 2 will not open in an older editor, which fails safely under rule 3.

**First real migration:** `agent.autonomous` 1 to 2 (`maxIterations` becomes `integer`): `Math.round`, note `"maxIterations 2.5 was not a whole number and was rounded to 3"`. Fixture: a v1 document with `2.5`, and one with `10` that migrates with no note.

**Catalog policy:** the catalog serves **only the latest** definition per type; history lives in the migration registry. The existing `getNodeDefinition(type, version)` exact lookup stays for validation after migration.

### 3.4 H4 — Condition execution semantics (specification; no engine in 1.1)

**Starting point:** `logic.condition` has outputs `true` and `false`, both `any`. The document needs no change; edges already name ports. What is missing is the **meaning** of "emit on one port", which D-006 requires (conditional branching, branch selection, skipped nodes, dependency-based execution, concurrency-capable).

**Proposed additive catalog field:** `PortDefinition.branch?: boolean` on **output** ports (Condition `true` and `false` get `branch: true`). Optional, so existing definitions and all documents are untouched. It is metadata for validators, the warning rules and the engine contract; the core runtime rule below needs no marker.

**Runtime semantics (to be implemented in Phase 3):**

1. **Emission.** An executor returns a map `outputPort → value`. A port that is **absent** from the map was **not selected**. A port that is present with the value `null` **was** selected. Only nodes with `branch` output ports may omit declared outputs; any other omission is an executor error (this stops a buggy executor silently skipping its downstream).
2. **Condition node.** Evaluates its comparison and emits the input value on exactly one of `true` or `false`. The other is absent.
3. **Edge states** (after the source node finishes):
   - `active`: the source succeeded and emitted on that port.
   - `inactive`: the source succeeded but did not emit on that port, **or** the source was skipped.
   - `failed`: the source failed.
4. **Readiness.** A node is ready when none of its incoming edges is still pending (every one is active, inactive or failed). Nodes with no incoming edges (Triggers) are ready at the start.
5. **Run or skip.** A ready node **runs** if every `required` input port has at least one active incoming edge. Otherwise it is **skipped**. An optional input with no active edge receives an absent value. A node with only inactive incoming edges is skipped. Skipping emits nothing, so its outgoing edges become inactive and the skip propagates.
6. **Multiple inputs (`multiple: true`).** The default join policy is "any active": the node runs when at least one incoming edge is active, receiving the values of the active edges in **edge array order** (which is why array order is preserved, §3.5). Other policies (all-active) are future catalog options, not in v1.
7. **Failure.** If a node fails, its downstream nodes are skipped with reason `upstream_failed` and the run ends `failed` (no error branches in v1; a future convention could use an error output port).
8. **Run result.** The run succeeds if no node failed. Its result is the output of the Output nodes that ran; if none ran, the run still succeeds with an empty result and a `no_output_reached` note.
9. **Concurrency.** The ready set is computed from resolved edges, and independent ready nodes may run concurrently under a bounded limit. Tie-breaking for logging and stable behaviour uses the node array order. No cycles exist (D-006), so this terminates.
10. **Records.** Each node run is stored as `succeeded | failed | skipped` with a skip reason (`no_active_input` or `upstream_failed`); each edge records its state. This is what the monitor and debugger display.
11. **Approval waits** (`waiting_approval`) are a separate state and not defined here.

**Task T8 deliverables:** this specification promoted into a proper section of `docs/ARCHITECTURE.md` §6; the `branch` field on `PortDefinition`; Condition outputs marked; a catalog test (branch only on outputs; Condition has two); no engine code.

### 3.5 H5 — Canonical serialization

**Verified hazards on this machine (Node and Python run side by side):**

| Case | JavaScript | Python `json` | Consequence |
|---|---|---|---|
| Keys `"10"`, `"9"`, `"a"` | object order becomes `9, 10, a` (integer-like keys are always ordered first and numerically) | `sort_keys` gives `10, 9, a` | **Building a JS object cannot produce code-unit-sorted output.** The TS serializer must emit text directly, not via `JSON.stringify` on a rebuilt object. |
| `1.0` | `1` | `1.0` | Number formatting must be defined. |
| `-0` | `0` | `-0.0` | Same. |
| `1e-7` | `1e-7` | `1e-07` | Exponent format differs. |
| `1e21` | `1e+21` | `1e+21` | Threshold for exponent form differs (`1e16` in Python). |
| `'😀'.length` | 2 | `len` = 1 | Length semantics (H1). |
| lone surrogate `\ud800` | `JSON.stringify` writes `"\ud800"` | default `ensure_ascii=True` also escapes it; with `ensure_ascii=False`, encoding to UTF-8 raises `UnicodeEncodeError` | Behaviour depends on a flag, so it must be rejected up front. |
| `NaN` literal | `JSON.parse` throws | `json.loads('NaN')` returns `nan` | Python must reject via `parse_constant`. |
| integer `12345678901234567890123` | parses to `1.2345678901234568e+22` (precision silently lost) | parses to the exact integer | Why only **safe integers** (±(2^53 − 1)) are allowed. |
| duplicate key `{"a":1,"a":2}` | last wins (`{"a":2}`) | last wins | Same behaviour today; still treated as undefined (rule 7). |

(All rows above were run on this machine with Node 24.13 and Python 3.14.2. The PostgreSQL facts below come from its documentation and were **not** verified here, because PostgreSQL is not installed; Phase 2 step 6 must confirm them.)

**PostgreSQL `jsonb` facts:** key order is **not** preserved; duplicate keys collapse (last wins); numbers are stored as `numeric`, so `1.0` stays `1.0` and `1e2` becomes `100`; the string `\u0000` is **not storable**; arrays keep their order. So the database text can never be the canonical form, and **canonicalization must run on read**, not on trust.

**Proposed profile `canonical-json/1`** (a pinned subset of **RFC 8785 JCS**, which defines the same rules for sorting, number text and string escapes, restricted to I-JSON):

1. **Objects:** keys sorted at **every level** by **UTF-16 code unit order** (JCS). Python sorts with `key=lambda k: k.encode('utf-16-be')` to match JavaScript.
2. **Arrays:** order preserved exactly (`nodes`, `edges`, `enum`, and edge order for `multiple` inputs all carry meaning).
3. **Numbers:** the ECMAScript number-to-string rules. Integral values print without a fraction or exponent below `1e21`; `-0` prints `0`; shortest round-trip digits. Python reuses `repr` for the digits and reformats to the ES layout (or uses an RFC 8785 library; decided in Phase 2).
4. **Safe integers only:** integers must lie within ±(2^53 − 1). Larger values are rejected (`value.unsafe-integer`). Non-finite values are rejected (`value.not-finite`).
5. **Strings:** JCS escapes only: `\"`, `\\`, `\b \t \n \f \r`, other C0 controls as `\u00xx` (lowercase hex). No escaping of `/`, no `\u` for non-ASCII, UTF-8 output, **no Unicode normalization**.
6. **Rejected strings:** containing U+0000 (`value.nul-character`; PostgreSQL cannot store it) or a lone surrogate (`value.invalid-unicode`).
7. **Duplicate keys:** both runtimes keep the last value. Treated as undefined behaviour and listed in the README; a custom duplicate-key parser is out of scope.
8. **Two layouts, one ordering:** the **compact** form (no whitespace) is used for hashing, ETags and comparison. The **export** form is the same ordering and number and string rules, with 2-space indentation and a trailing newline, used for downloaded files.
9. **Implementation (TS):** `workflow/canonicalJson.ts` walks the parsed value and writes text directly (this avoids the integer-key and `__proto__` problems of building objects). `serializeWorkflow` becomes `exportForm(workflow)`.
10. **Implementation (Python, Phase 2):** equivalent module; the shared `fixtures/serialization/` files are the proof. The content hash (`sha256` of the compact form) is the identity used for no-op saves (Phase 2 step 8).

**Effects:**
- Export bytes change **once**: `description, edges, id, metadata, name, nodes, schemaVersion` become alphabetical, and `config` and `metadata` keys are now sorted. Files exported by Phase 1 import fine and re-export in the new order.
- It resolves review concern H5 (JSONB reorders keys): the server can store JSONB, and export always re-canonicalizes.
- Readability trade-off: `schemaVersion` is no longer the first key. Accepted by the PO's requirement ("recursively sorted keys").

### 3.6 Q6 — Editor warnings, aware of categories and port direction

**Separation (D-018):** warnings come from a new pure function `lintWorkflow(workflow, catalog)` in `workflow/lint.ts`, with their own type. `validateWorkflow` stays errors-only. Warnings are **derived**, never stored in the document, never block import, export (except the security gate, §3.7) or editing.

```ts
interface Warning { code: string; severity: 'warning'; nodeId?: string; port?: string; message: string }
```

**Roles used by the rules:** the node's `category` (`Triggers` are sources, `Output` are sinks, `AI | Integrations | Logic` are processors) and the **direction** of the port (inputs receive, outputs emit; reachability follows edges from source to target).

| Code | Applies to | Condition |
|---|---|---|
| `required-input-unconnected` | **input** ports with `required: true`, any category | no incoming edge on that port |
| `required-field-empty` | node config | a property in `configSchema.required` whose value is an empty or whitespace-only string, or an empty array |
| `trigger-not-connected` | category `Triggers` | the node has outputs and none has an outgoing edge |
| `node-unreachable` | all categories **except** `Triggers` | not reachable from any Trigger. Evaluated only when the graph has at least one Trigger. Suppressed when the node already has `required-input-unconnected` and no incoming edge at all (avoids two warnings for the same cause) |
| `result-unused` | all categories **except** `Output` and `Triggers` | the node has outputs and **no output port** has an outgoing edge. For nodes with `branch` ports (Condition), warn only when none of the branch ports is connected, because using one branch is legitimate |
| `secret-suspected` | config values | medium-confidence secret heuristics (§3.7) |

**Optional extras (default off; PO to decide):** `no-trigger` and `no-output` for a non-empty graph with none of that category; `branch-unconnected` when only one branch of a Condition is wired.

**Not-blocking guarantees (tested):** warnings never disable a button, never open a modal, never steal focus, never prevent drag, connect, edit, import, or export. The count updates silently.

**UI:** a warning badge on the node (with an accessible label), a count in the toolbar with a list (clicking an entry selects that node), and a "Warnings for this node" section in the config panel. New nodes warn immediately (an empty prompt, for example), which is intended and visually subdued.

**Cost:** one pass over nodes and edges plus a graph traversal, memoized on the workflow, fine at editor scale.

### 3.7 HTTP header credential exposure and credentials outside workflow JSON

**Review finding.** `http.request.config.headers` is a free-form JSON object, so a user can paste `Authorization: Bearer ...` or `X-API-Key: ...`, which then lands in the exported file and, from Phase 2, in the database. The same applies to any free-text config field (`payload`, `body`, prompts) and to `metadata`. Today only a description says "Do not put secrets here". This conflicts with D-016.

**Proposed layered control:**
1. **Detector** (`workflow/secrets.ts`, one module, shared fixtures `secrets/*.json`): scans **every string and key in every node `config`** and `metadata`, recursively.
   - **High confidence (block):** header names `authorization`, `proxy-authorization`, `cookie`, `x-api-key`, `api-key`, `x-auth-token`, `x-access-token` with a non-empty literal value; and well-known credential shapes in any string: `sk-...`, `sk-ant-...`, `gsk_...`, `ghp_...`/`github_pat_...`, `AKIA...`, `xox[baprs]-...`, JWT-like `eyJ...`.`...`.`...`, `-----BEGIN ... PRIVATE KEY-----`, `Bearer <long token>`.
   - **Medium confidence (warn):** object keys containing `secret`, `password`, `passwd`, `token`, `apikey`, `api_key` with a non-empty string value.
2. **Warning:** medium confidence gives the `secret-suspected` warning; high confidence also shows it, plus a persistent notice on the node.
3. **Security gate:** **high-confidence matches block export** (and, in Phase 2, save; the backend runs the same detector and returns 422 with `secret.detected`). The message names the node and property but never echoes the value. **No override** is proposed. This is a security control, not a structural warning, so it does not conflict with D-018 or with "warnings never block editing": editing, saving drafts in the browser and everything else remain possible. *(PO decision S1.)*
4. **Config-panel hint** on `headers`: "Do not enter credentials. Use a credential reference when credentials are supported." The reserved shape for credential references (`credentialRef`) is **not** added in 1.1; it needs the backend credential store (Phase 4 and 7). Until then the guard is the only protection.
5. **Phase 2 and later:** server-side detection on save; redaction of the same patterns in logs, node-run records and events; secrets never sent to LLMs (ARCHITECTURE §11).

**Known limits (documented, tested):** heuristics have false positives (a literal example token in a prompt) and false negatives (an unfamiliar key format, an obfuscated value). They reduce accidents; they are not a guarantee, and the real fix is credential references.

### 3.8 Provider architecture (extensible)

- **Phase 1.1:** one exported constant `PROVIDERS = ['groq', 'openai', 'anthropic', 'ollama']` is the only place providers are listed. The `provider` enums of `llm.prompt` and `agent.autonomous` are built from it, with a catalog test. Adding a provider is one line plus a test. This resolves L6 and implements D-014. `model` stays free text.
- **Default provider:** remains `ollama` (local, no credential needed). *(Confirm with the PO.)*
- **Phase 2 / 4 path (not built now):** the backend owns a provider registry; each provider is an adapter behind `get_chat_model(provider, model, credential)` (D-015); the catalog's `provider` enum is **generated from registered adapters**, so adding a provider never changes the contract shape. Provider-specific settings (for example an Ollama base URL, which is not a secret) become optional settings declared by the provider, not new node types.

### 3.9 Playwright (approved) — reproducible local and CI testing

**Package and config:** `@playwright/test` as a `devDependency` (version pinned by the lockfile; `npm view` currently reports 1.64.1). Chromium only, installed by `npx playwright install chromium`, so local runs do not depend on the machine's Chrome. `playwright.config.ts`: `testDir: 'e2e'`, `testMatch: '**/*.e2e.ts'`, fixed viewport (1400x900), `reducedMotion: 'reduce'`, `webServer` starting `npm run dev -- --port 5173 --strictPort` with `reuseExistingServer: !process.env.CI`, `retries: CI ? 1 : 0`, `trace: 'on-first-retry'`.

**Scripts:** `test:e2e` (Playwright) and `verify` (`tsc -b && lint && test && build && test:e2e`), the single command that proves a clean checkout.

**Reproducible local run:** `cd frontend && npm ci && npx playwright install chromium && npm run verify`. Documented in a short `frontend/README.md`.

**Tests:** the 49 of 52 browser checks selected in `PHASE1_REVIEW.md` §3.2, in 5 spec files plus a console-error fixture. These become the regression net that protects T4 to T7 (the changes that touch the editor and the contract), which is why Playwright is the **first** task.

**CI:** `.github/workflows/ci.yml` on push and pull request to `main`: checkout, setup-node (Node 24, npm cache), `npm ci`, `tsc -b`, lint, Vitest, build, `playwright install --with-deps chromium`, `test:e2e`, upload `playwright-report/` on failure; `permissions: contents: read`; `concurrency` cancel-in-progress. Pin each action by commit SHA (verified from the action's release page at implementation time). The GitHub remote now exists, so CI can run on the first push of this task. The backend job is added in Phase 2.

---

## 4. Task plan

Sizes (S/M/L) are rough estimates. Each task ends with the full local check (`npm run verify` once T1 exists) and a documentation update.

### T1 — Playwright harness and ported checks (M)
- **Dependencies:** none. **Do this first.**
- **Files:** `frontend/package.json` and `package-lock.json`, `frontend/playwright.config.ts`, `frontend/e2e/{fixtures,helpers}.ts`, `frontend/e2e/{library,canvas-editing,connections,config-panel,import-export}.e2e.ts`, `frontend/tsconfig.e2e.json` (or edit `tsconfig.node.json`), `frontend/README.md`, `.gitignore`, `.github/workflows/ci.yml`.
- **Architecture change:** none (tests only).
- **Acceptance:** `npm run verify` passes on a clean clone; 49 checks run as automated tests; a deliberately broken selector or behaviour makes a test fail (demonstrated once and recorded); CI runs green on GitHub.
- **Tests:** the e2e suite itself, plus all existing 48 unit tests unchanged.

### T2 — Structured validation errors (S)
- **Dependencies:** T1.
- **Files:** `workflow/{validate,connections,configSchema,serialize}.ts`, `app/Toolbar.tsx` (show code and message), tests.
- **Change:** every error becomes `{ code, path, message }` using the code table in §3.2; message text stays the same.
- **Acceptance:** no string-only errors remain; the import error panel shows codes; all existing tests pass with updated assertions.
- **Tests:** existing unit tests re-expressed on `{code, path}`; one test per code.

### T3 — Shared fixtures and the TypeScript runner (M)
- **Dependencies:** T2.
- **Files:** `contracts/**` (README, format, initial corpus), `frontend/src/contracts/fixtures.test.ts`.
- **Acceptance:** at least 40 cases across `workflow`, `connection`, `config`, `catalog`; the runner fails if a fixture file is malformed; the README documents the format and the multiset rule.
- **Tests:** the runner is the test; a mutation check (change one rule, a fixture fails) is recorded.

### T4 — Canonical JSON (H5) (M)
- **Dependencies:** T3.
- **Files:** `workflow/canonicalJson.ts` (+ test), `workflow/serialize.ts`, `workflow/validate.ts` (new `value.*` rules), `contracts/CANONICAL_JSON.md`, `contracts/fixtures/serialization/*`, e2e import/export expectations.
- **Acceptance:** recursive sorted keys; numeric-like keys, `1.0`, `-0`, `1e-7`, `1e21`, surrogate pairs, NUL and lone surrogates all behave as specified; export, import, export is byte-identical; a Phase 1 export still imports; unsafe integers and invalid strings are rejected with codes.
- **Tests:** about 20 serialization fixtures; property-style round trip over generated documents; updated Playwright import/export checks.

### T5 — JSON Schema subset, UI separation, providers (H1) (L)
- **Dependencies:** T2, T3.
- **Files:** `workflow/types.ts`, `workflow/configSchema.ts` (generalized validator), `catalog/nodes.ts` (all six definitions converted; `PROVIDERS` constant with `groq`; `defaults` removed), `catalog/index.ts`, `store/editorStore.ts` (defaults from schema), `config-panel/ConfigPanel.tsx` (render from schema + `ui`; JSON editor for arrays and nested objects), `contracts/CONFIG_SCHEMA.md`, `contracts/fixtures/config/*`, `contracts/fixtures/catalog/builtin.catalog.json`, tests.
- **Acceptance:** the validator supports every keyword in §3.1 including `integer`, `array`/`items`, nested objects, `default`, `required`, `additionalProperties`; `multiline` no longer exists in `configSchema`; accepted configs for all existing nodes are unchanged (except the planned `maxIterations` change in T6); catalog tests (unique ports, defaults valid and complete for `required`, enums derived from `PROVIDERS`) pass; the config panel behaves as before for existing nodes.
- **Tests:** config fixtures (types, ranges, code-point length with emoji, nested and array cases, unknown keys); catalog consistency tests; Playwright config-panel checks.

### T6 — Node migrations and the first real migration (H3) (M)
- **Dependencies:** T5.
- **Files:** `workflow/nodeMigrations.ts`, `workflow/migrate.ts` (pipeline), `workflow/serialize.ts` (`importWorkflow` returns upgrades), `catalog/nodes.ts` (`agent.autonomous` to version 2), `store/editorStore.ts` (upgrade report), `app/Toolbar.tsx` or a small `UpgradeBanner`, `contracts/fixtures/migration/*`.
- **Acceptance:** a v1 agent workflow with `maxIterations: 2.5` imports as v2 with `3`, a visible banner and a note; the original file is byte-unchanged; newer-than-known and gap cases are rejected with `node.version-newer` and `node.no-migration-path` and leave the open workflow untouched; every migration result validates against the new schema.
- **Tests:** migration fixtures; round trip after migration; Playwright check for the banner; test that the importer never writes.

### T7 — Editor warnings (Q6, D-017, D-018) (M)
- **Dependencies:** T5 (and T8 for `branch`-aware `result-unused`, otherwise a conservative rule is used until T8 lands).
- **Files:** `workflow/lint.ts`, `workflow/lint.test.ts`, `contracts/fixtures/warnings/*`, `canvas`/`nodes` (badge), `app/Toolbar.tsx` (count and list), `config-panel/ConfigPanel.tsx` (node warnings), CSS modules, e2e spec.
- **Acceptance:** every rule in §3.6 fires and does not fire in the documented cases; category and direction cases (Trigger without outputs connected, Output without input, Condition with one branch wired, orphan chain) are covered; warnings never block any action (explicit tests); `validateWorkflow` is untouched in meaning.
- **Tests:** warning fixtures; unit tests per rule; Playwright: warning appears, clears when fixed, and export still works with warnings present.

### T8 — Branch semantics specification and catalog marker (H4) (S)
- **Dependencies:** none for the document; schedule before T7 if possible.
- **Files:** `docs/ARCHITECTURE.md` §6 (expanded semantics from §3.4), `workflow/types.ts` (`PortDefinition.branch?`), `catalog/nodes.ts` (Condition outputs), catalog test.
- **Acceptance:** the specification is merged into ARCHITECTURE; `branch` exists only on output ports; documents are unaffected; the architect signs off the semantics.
- **Tests:** catalog test; no engine code.

### T9 — Secret guard (S/M)
- **Dependencies:** T2, T3, T7.
- **Files:** `workflow/secrets.ts`, tests, `contracts/fixtures/secrets/*`, export path in `app/Toolbar.tsx`, `config-panel/ConfigPanel.tsx` (hint), e2e spec.
- **Acceptance:** high-confidence values block export with a message that never prints the value; medium-confidence values warn; examples from §3.7 behave as stated; false-positive and false-negative cases are documented as fixtures.
- **Tests:** secrets fixtures; Playwright: pasting an `Authorization` header blocks export, removing it unblocks.

### T10 — Documentation, decision records and acceptance report (S)
- **Dependencies:** T1 to T9.
- **Files:** `docs/{PROJECT_BRAIN,ROADMAP,DECISIONS,DEVELOPMENT_LOG,ARCHITECTURE}.md`, `.claude/rules/frontend.md` (contracts, canonical JSON, warnings vs errors), `docs/PHASE2_PLAN.md` (update steps 2, 3, 4, 8, 9 to the Phase 1.1 outcomes).
- **Acceptance:** documents match the repository; D-013 resolved by the architect's final code review; full verification evidence recorded; remaining limitations listed.

### Dependency order

```
T1 ─► T2 ─► T3 ─┬─► T4
                ├─► T5 ─► T6
                │     └─► T7 ◄─ T8
                └─────────────► T9 (after T7)
all ─► T10
```

T8 is documentation plus a tiny catalog change and can run any time before T7. T4 and T5 both touch `serialize`, `validate` and `configSchema`, so do them sequentially (T4 first).

## 5. Risks and trade-offs

| # | Risk or trade-off | Mitigation |
|---|---|---|
| R1 | **Scope.** T4 to T7 change the core contract and the editor together | T1 first (regression net), one task per commit, full `verify` after each |
| R2 | **Python parity is unproven until Phase 2.** Fixtures are only run by TypeScript in 1.1 | Implementation-neutral fixtures; the hazards table in §3.5 and the length rule in §3.1 are the checklist for the Python port; Phase 2 step 9 runs the same files |
| R3 | **JSON Schema subset versus what Pydantic emits** (`$ref`, `anyOf`, `integer` constraints, `title`) | Phase 2 keeps authoring catalog `configSchema` as data in the subset (decision X1), and validates it against the metaschema; per-node typed config models come with executors in Phase 3 |
| R4 | **Own validator instead of Ajv** means we maintain keyword semantics | Small keyword set, fixture-driven, no `$ref`; revisit if the subset grows |
| R5 | **Export bytes change once** (H5) | Documented; old files still import; no `schemaVersion` bump |
| R6 | **Stricter value rules** (safe integers, NUL, lone surrogates) | The editor cannot produce them; clear error codes |
| R7 | **`defaults` removal** changes the catalog contract | No external consumer yet; D-013 review covers it; Phase 2 models are written after this |
| R8 | **Secret detection is heuristic** | Block only high-confidence; document limits; real fix is credential references |
| R9 | **Warnings noise** on fresh nodes | Subdued styling, separate list, rules are category and direction aware; optional extras default off |
| R10 | **Playwright flakiness** on drag and connect | Fixed viewport, reduced motion, helpers that use handle geometry, one retry in CI with traces |
| R11 | **Arrays and nested objects edited as JSON** in the panel | Accepted for 1.1; richer editors later when a node needs them |
| R12 | **Node v2 for `maxIterations`** adds migration machinery for a tiny change | It is the deliberate first user of H3; without it the mechanism would ship untested |

## 6. Decisions requested from the PO / architect

| # | Decision | Recommendation |
|---|---|---|
| P1 | Remove `NodeDefinition.defaults` in favour of schema `default` (H1) | Yes |
| P2 | Own subset validator, no Ajv (H1) | Yes |
| P3 | `agent.autonomous` v2 with `integer` `maxIterations` as the first migration (H1, H3) | Yes |
| P4 | Arrays and nested objects use the JSON editor in 1.1 | Yes |
| P5 | Import always upgrades to the latest node version with a visible report; never writes back (H3) | Yes |
| P6 | Add `PortDefinition.branch` and adopt the §3.4 semantics, including "any active" join for `multiple` (H4) | Yes |
| P7 | Adopt `canonical-json/1` (JCS subset); accept the one-time export byte change; no `schemaVersion` bump (H5) | Yes |
| S1 | Block export on high-confidence secrets with no override; warn on medium confidence | Yes |
| W1 | Include the optional warning extras (`no-trigger`, `no-output`, `branch-unconnected`)? | No (off) |
| V1 | Keep `ollama` as the default provider | Yes |
| G1 | CI now that the GitHub remote exists; pin actions by SHA | Yes |

## 7. Definition of done for Phase 1.1

Tasks T1 to T10 meet their acceptance criteria; `npm run verify` (type check, lint, unit tests, build, Playwright) passes locally and in GitHub Actions; the shared fixtures run green in Vitest; PROJECT_BRAIN, ROADMAP, DECISIONS, ARCHITECTURE and DEVELOPMENT_LOG match the repository; D-013 is resolved; limitations are listed. **Phase 2 begins only after separate explicit approval.**

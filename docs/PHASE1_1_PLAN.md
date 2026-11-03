# PHASE 1.1 PLAN — CONTRACT HARDENING, WARNINGS, PLAYWRIGHT (APPROVED WITH REVISIONS)

> **Status (2026-11-03, Session 5): the Product Owner approved most decisions and required revisions to P1, P7 and S1. This version applies those revisions. The implementation scope still awaits final approval. Nothing here is implemented.**
> **Phase 2 is not started and not authorized.** No application code changes until the implementation scope is approved.
> Inputs: the PO's review decisions (Q1–Q6, H1–H5, P1–P7, S1, W1, V1, G1) · `docs/PHASE1_REVIEW.md` · `docs/DECISIONS.md` (D-012 to D-025).
> History: Session 4 first draft. Session 5 (this version): P1 explicit defaults, P7 canonical JSON, S1 secret detection revised as the PO required.

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

### 1.1 Approvals and required revisions (Session 5)

| Item | PO decision | Status in this plan |
|---|---|---|
| P1 | Schema defaults replace `NodeDefinition.defaults`, but defaults must be **explicitly applied during node creation**. Do **not** require every required property to have a default. | Approved **with revision**, applied in §3.1 (consequence C1 in §6) |
| P2 | Own documented JSON Schema subset validator, with shared fixtures | Approved |
| P3 | `agent.autonomous` v2 with a visible migration report | Approved |
| P4 | JSON editor for arrays and nested objects initially | Approved |
| P5 | Migrate imported workflows **in memory**, show the upgrade report, never silently overwrite the original | Approved |
| P6 | Branch-selection and skipped-node semantics as proposed | Approved |
| P7 | Canonical JSON, **subject to five revisions** (reject duplicate keys at parse; NUL is an AgentForge/PostgreSQL rule; separate compact hashing form from pretty export; safe integers are AgentForge policy; cross-language fixtures for every numeric, Unicode and key-order edge case) | Approved subject to revisions, **applied in §3.5** |
| S1 | **Not approved as proposed.** No unconditional export blocking. High-confidence matches: prominent warning, never echo the value, **explicit user confirmation before export**, explain replacing the value with a credential reference. Backend credential-storage enforcement is separate from the local export UX. | **Revised**, applied in §3.7 |
| W1 | Optional extra warnings stay disabled | Approved |
| V1 | Ollama stays the default provider | Approved |
| G1 | GitHub Actions CI, actions pinned to **verified commit SHAs** | Approved (§3.9) |
| Toolchain | Keep TypeScript 7, Vite 8, Oxlint, Vitest 5 | Approved |
## 2. Which issues change Workflow JSON v1?

Two contracts are involved and the answer differs for each:

- **Workflow document (v1)**: what a saved or exported `.json` workflow contains (`schemaVersion`, `nodes`, `edges`, ...).
- **Node catalog contract**: `NodeDefinition` and its `configSchema`, served later by `GET /api/catalog`. It has no external consumer yet, so it is cheap to change now.

| Issue | Changes the **document structure** (needs `schemaVersion` bump)? | Changes the **catalog contract**? | Changes **bytes on export**? | Can break existing saved workflows? |
|---|---|---|---|---|
| H1 JSON Schema config | **No.** Node `config` stays an arbitrary JSON object; arrays and nested objects only widen what a value may be. | **Yes** (`configSchema` becomes a JSON Schema subset, UI hints move to `ui`, `defaults` replaced by explicitly applied schema `default`s; absent required config keys stop being a structural error, see C1). | No | Only if `maxIterations` is tightened to `integer`; handled by a **node** migration (H3), not a document change. |
| H2 Shared fixtures | No | No | No | No |
| H3 Node migrations | **No.** Uses the `typeVersion` field that v1 already has. | No (a node's new version is a new catalog definition) | No | No: migration is the mechanism that **prevents** breakage. |
| H4 Condition semantics | **No.** Edges already name ports. | **Additive, optional**: `PortDefinition.branch` | No | No |
| H5 Canonical serialization | **No structural change.** Reading is unaffected. | No | **Yes, once.** Keys become recursively sorted, so e.g. `schemaVersion` moves from first to last. Old files still import and re-export in the new order. | No for reading. Stricter parsing and value rules (unique object keys, safe integers, no NUL, no lone surrogates, depth limit) would newly reject documents that hold such values; none are producible by the editor today. |
| Secret detection | No | No | No | No. A document that already contains a high-confidence secret still imports and exports; the user gets a prominent warning and an explicit export confirmation. |
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
  // `defaults` is REMOVED: initial values come from schema `default`s, applied explicitly by applyDefaults() at creation
}
```

**Subset rules (documented in `contracts/CONFIG_SCHEMA.md`):**
- **Supported keywords:** `type`, `title`, `description`, `default`, `enum`, `minLength`, `maxLength`, `minimum`, `maximum`, `items`, `minItems`, `maxItems`, `properties`, `required`, `additionalProperties`.
- **Deliberate non-goals** (not in the subset): `$ref`, `$defs`, `anyOf`, `oneOf`, `allOf`, `not`, `if/then/else`, `patternProperties`, `format`, `pattern`. Reason: `pattern` has different regex dialects in JavaScript and Python; `$ref` and `anyOf` are what Pydantic emits by default, so Phase 2 must emit this flat subset (see risk R3).
- **Strings:** `minLength` and `maxLength` count **Unicode code points**, not UTF-16 units. The TypeScript validator must use `[...value].length`; `'😀'.length` is `2` in JavaScript but `len('😀')` is `1` in Python (checked on this machine).
- **Integers:** `integer` accepts any JSON number with no fractional part (`1.0` is an integer). Values must be safe integers (see H5).
- **Objects:** every catalog schema sets `additionalProperties: false` explicitly, which preserves today's "unknown setting is an error" behaviour (the standard default would allow extras).
- **Defaults (revised by P1):** a property's `default` annotation is the single source of its initial value and **replaces `NodeDefinition.defaults`**. Defaults are applied **explicitly**: a pure `applyDefaults(schema)` function is called by node creation (`addNode`) and, where a migration introduces a new property, by that migration's own code. **Validators, the importer and the store never apply defaults implicitly**, so imported data is never silently altered. A nested object receives an initial value only from an explicit `default` on that property (no recursive synthesis). **A required property is not required to have a default**: without one it is simply absent on a new node. The six existing nodes keep exactly today's initial values by carrying them as explicit `default`s, and every `default` must validate against its own schema (test).
- **Required properties and incomplete configs (consequence of P1; decision C1).** The editor must be able to hold and export incomplete drafts (D-017), and a new node can now lack a required value. Therefore **structural validation of a document does not reject an absent required config key**. `validateAgainstSchema` implements `required` completely but takes a `checkRequired` option: import (and later save) validation uses `checkRequired: false` (type, enum, range, length and unknown-key checks remain errors); the editor's completeness check uses `required` to raise `required-field-empty` warnings (absent or empty); execution in Phase 3 will use `checkRequired: true` and report errors. This only makes import more lenient: no file that imports today is rejected. Python and shared fixtures carry the same option.
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
    parsing/duplicates/*.json  { name, inputText, expect: { valid: false, errors: [{code, path}] } }   (duplicate keys, depth, encoding)
    serialization/{numbers,unicode,keys,export}/*.json   { name, inputText | inputBytesBase64, expectCompact, expectExport } or { name, inputText, expect: { valid: false, errors: [{code, path}] } }
    warnings/*.json         { name, workflow, expect: [{code, nodeId, port?}] }   (TS only; backend does not lint in Phase 2)
    secrets/*.json          { name, config, expect: { level: "high" | "medium" | "none", paths: [...] } }   (warnings only; never an error code)
```

**Common expected outcomes (the shared contract between the two runners):**
- **Valid:** `valid: true` and the canonical compact text of the resulting workflow.
- **Invalid:** `valid: false` and a list of `{ code, path }`. The runner compares the lists as **multisets**, ignoring order and ignoring the human message. `path` is a JSON Pointer (e.g. `/nodes/2/config/provider`).
- **Connection cases:** the first failing rule code, or `null`.
- **Raw JSON text** is used wherever number or key text matters (`inputText`), because parsing a fixture would already lose `1.0`, `-0`, `1e21` and key order.

**Proposed error codes** (stable, namespaced; also the basis of the API's 422 body in Phase 2):

| Namespace | Codes |
|---|---|
| `doc.*` | `not-json`, `not-object`, `invalid-encoding`, `too-large`, `too-deep`, `duplicate-key`, `unsupported-version`, `invalid-field` |
| `node.*` | `malformed`, `duplicate-id`, `unknown-type`, `version-newer`, `no-migration-path` |
| `connection.*` | `unknown-node`, `unknown-port`, `self-loop`, `duplicate`, `input-occupied`, `type-mismatch`, `cycle` |
| `edge.*` | `malformed`, `duplicate-id` |
| `schema.*` | `type`, `enum`, `required`, `additionalProperties`, `minimum`, `maximum`, `minLength`, `maxLength`, `minItems`, `maxItems` |
| `value.*` | `not-finite`, `unsafe-integer`, `invalid-unicode`, `nul-character` |

**Runners:**
- **Phase 1.1 (TypeScript):** `frontend/src/contracts/fixtures.test.ts` loads every file with Node `fs` and runs it against the real functions. The initial corpus is converted from the existing unit tests (about 40 cases); T4 adds the 120+ serialization and parsing fixtures of §3.5.
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

### 3.5 H5 — Canonical JSON (revised per PO decision P7)

The PO approved deterministic canonical serialization **subject to five revisions**, all applied here: (1) duplicate keys are rejected **during parsing**; (2) NUL rejection is an AgentForge/PostgreSQL rule, not an RFC 8785 rule; (3) the compact canonical form used for hashing is **separate** from the pretty deterministic export form; (4) the safe-integer limit is documented as **AgentForge policy**; (5) cross-language fixtures cover every numeric, Unicode and key-order edge case.

**Hazards verified on this machine** (Node 24.13 and Python 3.14.2 run side by side):

| Case | JavaScript | Python | Consequence |
|---|---|---|---|
| Object with keys `"10"`, `"9"`, `"a"` | key order becomes `9, 10, a` (integer-like keys always first, numerically) | `sort_keys` gives `10, 9, a` | A JS serializer cannot rebuild an object and expect sorted output; **it must write text directly**. |
| Keys U+E000 and U+1F600 (😀) | UTF-16 code unit order puts 😀 **first** | code point order puts U+E000 **first** | Sort by **UTF-16 code units** (RFC 8785); Python uses `key=lambda k: k.encode('utf-16-be')` (checked: gives the JS order). |
| `1.0`, `-0` | `1`, `0` | `1.0`, `-0.0` | Number text must be defined. |
| `0.00001`, `0.000001`, `1e-7` | `0.00001`, `0.000001`, `1e-7` | `1e-05`, `1e-06`, `1e-07` | Exponent threshold and exponent padding differ. Python needs its own formatter. |
| `1e21`, `1e22`, largest double | `1e+21`, `1e+22`, `1.7976931348623157e+308` (all integral) | same text | Rejected by the safe-integer policy, so large-exponent text is never produced. |
| `9007199254740993` | parses to `9007199254740992` (precision lost) | exact integer | The policy check catches both. |
| `1e400` | parses to `Infinity` | `inf` | Rejected (`value.not-finite`). |
| `'😀'.length` | 2 | `len` is 1 | String length is counted in code points (H1). |
| Lone surrogate `\ud800` | `JSON.stringify` escapes it | `ensure_ascii=False` then UTF-8 encoding raises `UnicodeEncodeError` | Rejected up front. |
| `NaN` literal | `JSON.parse` throws | `json.loads` accepts it | Rejected. |
| Duplicate keys `{"a":1,"a":2}` | last one wins, silently | last one wins, silently | **Rejected during parsing** (revision 1). |

**Rules and where each one comes from** (revisions 2 and 4: AgentForge rules are labelled as such and are not attributed to RFC 8785):

| # | Rule | Source |
|---|---|---|
| 1 | Object keys sorted recursively by UTF-16 code unit order | RFC 8785 (JCS) |
| 2 | Array order preserved exactly (`nodes`, `edges`, `enum`; edge order matters for `multiple` inputs) | JSON semantics; RFC 8785 |
| 3 | Numbers written with the ECMAScript number-to-string algorithm (shortest round-trip digits; `-0` writes `0`) | RFC 8785 |
| 4 | Strings escape only `"`, `\`, `\b \t \n \f \r`, and other C0 controls as lowercase `\u00xx`. `/`, non-ASCII and U+007F stay literal; UTF-8 output | RFC 8785 |
| 5 | Object member names must be unique | I-JSON (RFC 7493), which JCS requires of its input. **AgentForge enforces it at parse time** (`doc.duplicate-key`) |
| 6 | Strings must be valid Unicode: no lone surrogates | I-JSON / JCS. Enforced as `value.invalid-unicode` |
| 7 | Numbers must be finite doubles | I-JSON. Enforced as `value.not-finite` |
| 8 | **Integers must be safe integers: -(2^53 - 1) to 2^53 - 1.** Because every double of magnitude 2^53 or more is an integer, this also bounds all numbers to that magnitude | **AgentForge policy** (not an RFC 8785 rule): keeps TypeScript and Python in exact agreement and avoids silent precision loss. Code `value.unsafe-integer` |
| 9 | **Strings, keys and escapes must not contain U+0000** | **AgentForge / PostgreSQL `jsonb` compatibility rule** (PostgreSQL cannot store `\u0000`); **not** an RFC 8785 requirement. Code `value.nul-character` |
| 10 | Maximum nesting depth 64 | AgentForge policy (stack safety, and Python and JavaScript recursion limits differ). Code `doc.too-deep` |
| 11 | Maximum document size 5,000,000 characters | AgentForge policy (exists today). Code `doc.too-large` |
| 12 | A UTF-8 byte order mark is tolerated and stripped on input and never written; invalid UTF-8 is rejected | AgentForge policy. Code `doc.invalid-encoding` |
| 13 | No Unicode normalization: strings and keys are preserved exactly, so `é` and `e` + U+0301 are different | AgentForge policy |

**Strict parsing (revision 1).** Untrusted text is parsed by `workflow/strictJson.ts`, a small RFC 8259 parser, **not** `JSON.parse` (which silently keeps the last duplicate). It rejects: duplicate keys (compared **after** escape decoding, so `"a"` and `"a"` collide) with the JSON Pointer of the second occurrence; depth over 64; `NaN`/`Infinity` tokens, leading zeros, `+1`, `.5`, `1.`, trailing commas and trailing garbage; invalid escapes and raw control characters in strings; lone surrogates; U+0000; numbers that overflow to infinity; and unsafe integers. Objects are built with `Object.defineProperty`, so a key named `__proto__` is an ordinary own property and cannot change a prototype. **Python (Phase 2)** does the same with `json.loads(..., object_pairs_hook=<reject duplicates>, parse_constant=<reject>)` plus an iterative walk for depth, surrogates, NUL and number range. The importer (and the API) use the strict parser only.

**Two named profiles, one ordering (revision 3).**

- **`canonical-json/1` (compact):** no whitespace at all; rules 1 to 4 above. The **only** form used for hashing, ETags, equality and no-op detection. Never shown to users and never written to a file.
- **`export-json/1` (pretty, deterministic):** the same key ordering, number text and string escapes, laid out for people: 2-space indentation; `": "` after a key; one array element or member per line; empty containers written inline as `[]` and `{}`; LF line endings on every platform; exactly one trailing LF; no trailing spaces. The **only** form written to downloaded files. It is **never** hashed.
- **Guarantees (tested in both languages):** `export(parse(export(x))) == export(x)`, and `canonical(parse(export(x))) == canonical(x)`.
- **Numbers.** TypeScript uses `String(value)` after the range check, because JavaScript already implements the ECMAScript algorithm. Python reuses the digits of `repr(float)` and re-lays them out in the ECMAScript form (decimal notation for magnitudes from `1e-6` up, exponent form below, e.g. `1e-7`, with no zero padding), or an RFC 8785 library; the choice is made in Phase 2.
- **Content hash (Phase 2):** SHA-256 of the **compact** UTF-8 bytes.

**PostgreSQL `jsonb` (documentation only; not verified here because PostgreSQL is not installed; Phase 2 step 6 must confirm):** key order is not preserved; duplicate keys collapse; numbers are stored as `numeric` (`1.0` stays `1.0`, `1e2` becomes `100`); `\u0000` is not storable; arrays keep their order. So database text is never the canonical form, and **canonicalization runs on read**.

**Cross-language fixtures (revision 5).** Every case is a shared JSON file in `contracts/fixtures/` (`inputText` keeps the raw text, because parsing a fixture would already lose `1.0`, `-0`, key order and duplicates; invalid byte sequences use `inputBytesBase64`). Each case states either `expectCompact` and `expectExport` strings, or the rejection `{code, path}`. Both runners compare **exact strings**. At least **120 fixtures**, in these families:

| Family | Cases that must exist |
|---|---|
| **Numbers, accepted** | `0`, `-0` (writes `0`), `1`, `1.0`, `1e2`, `1E2`, `1e+2`, `0.1e1`, `0.1`, `100.5`, `0.30000000000000004`, `4.35`, `0.00001`, `0.000001`, `0.0000001` (writes `1e-7`), `1.5e-7`, `123e-20` (writes `1.23e-18`), `2.5e-5` (writes `0.000025`), `5e-324`, `9007199254740991`, `-9007199254740991`, `9007199254740991.0` |
| **Numbers, rejected** | `9007199254740992`, `9007199254740993`, `-9007199254740992`, `9007199254740992.0`, `1e21`, `1e22`, `1.7976931348623157e308` (all `value.unsafe-integer`); `1e400`, `-1e400` (`value.not-finite`) |
| **Number syntax, invalid** | `NaN`, `Infinity`, `-Infinity`, `01`, `+1`, `.5`, `1.`, `1e`, `0x10`, `--1` (`doc.not-json`) |
| **Unicode, accepted** | literal `é`; `é` and `é` (both write literal `é`); `e` + U+0301 kept distinct from `é` in a key and in a value; literal 😀; surrogate-pair escape `😀` (writes literal 😀); U+2028 and U+2029 literal; U+007F literal; U+FEFF inside a string; U+FFFF; `\b \t \n \f \r` short forms; `\u0001` and `\u001f` (write lowercase hex); `\/` (writes `/`); `\"` and `\\`; UTF-8 BOM before the document (tolerated) |
| **Unicode, rejected** | `\u0000` (`value.nul-character`); lone `\ud800`; lone `\udc00`; reversed pair `\udc00\ud800` (`value.invalid-unicode`); invalid UTF-8 bytes and an overlong sequence (`doc.invalid-encoding`); raw control character inside a string (`doc.not-json`) |
| **Key order** | integer-like keys `10`, `9`, `1`, `01`, `-1`, `1.5`; `B` before `a`; prefixes `a`, `ab`, `b`; the empty key first; `é` after `z`; **U+E000 versus U+1F600** (UTF-16 versus code point order); keys written with escapes sorted after decoding; nested objects sorted recursively; objects inside arrays sorted internally while array order is kept; keys `__proto__`, `constructor`, `toString`, `hasOwnProperty`; keys containing quotes, backslashes and spaces; NFC and NFD forms of the same letter as two distinct keys |
| **Duplicate keys (rejected, `doc.duplicate-key`)** | top level; nested object; object inside an array; duplicate differing only by escape (`"a"` and `"a"`); duplicate `__proto__`; three occurrences; different value types. **Not** duplicates: the same key in sibling objects; keys differing only by case |
| **Limits** | depth 64 accepted and depth 65 rejected (`doc.too-deep`) for both arrays and objects; empty object and empty array; size at and over the limit (generated in the test, not stored) |
| **Export layout** | `{}`, `[]`, nested empty containers, arrays of primitives one per line, deep indentation, one trailing LF, no CRLF, no trailing spaces; both guarantees above |
| **Workflow round trips** | at least 10 whole workflows covering all six node types, numeric edge cases in `config` and `position`, and non-ASCII labels |

**Effects.**
- Export bytes change **once**: `description, edges, id, metadata, name, nodes, schemaVersion` become alphabetical (`schemaVersion` moves to the end) and `config` and `metadata` keys are sorted. Phase 1 exports still import and re-export in the new order. No `schemaVersion` bump.
- Concern H5 (JSONB reorders keys) is resolved: the server may store JSONB; export always re-canonicalizes.
- Files with duplicate keys, unsafe integers, NUL, lone surrogates or nesting over 64 levels are now rejected with a clear code. The editor cannot produce any of them.

**Implementation.** TypeScript: `workflow/strictJson.ts`, `workflow/canonicalJson.ts` (functions `canonicalCompact` and `exportPretty`; `serializeWorkflow` becomes `exportPretty`). Python (Phase 2): equivalents, proven by the same fixtures. The Python side does not exist yet, so parity is **not proven until Phase 2**; the verified hazards above are its checklist.

### 3.6 Q6 — Editor warnings, aware of categories and port direction

**Separation (D-018):** warnings come from a new pure function `lintWorkflow(workflow, catalog)` in `workflow/lint.ts`, with their own type. `validateWorkflow` stays errors-only. Warnings are **derived**, never stored in the document, never block import, export or editing. The only related safeguard is the explicit export confirmation for high-confidence secret matches (§3.7), which is a prompt the user can accept, not a block.

```ts
interface Warning { code: string; severity: 'warning'; nodeId?: string; port?: string; message: string }
```

**Roles used by the rules:** the node's `category` (`Triggers` are sources, `Output` are sinks, `AI | Integrations | Logic` are processors) and the **direction** of the port (inputs receive, outputs emit; reachability follows edges from source to target).

| Code | Applies to | Condition |
|---|---|---|
| `required-input-unconnected` | **input** ports with `required: true`, any category | no incoming edge on that port |
| `required-field-empty` | node config | a property in `configSchema.required` that is **absent**, an empty or whitespace-only string, or an empty array (see C1: absence is a warning, not a structural error) |
| `trigger-not-connected` | category `Triggers` | the node has outputs and none has an outgoing edge |
| `node-unreachable` | all categories **except** `Triggers` | not reachable from any Trigger. Evaluated only when the graph has at least one Trigger. Suppressed when the node already has `required-input-unconnected` and no incoming edge at all (avoids two warnings for the same cause) |
| `result-unused` | all categories **except** `Output` and `Triggers` | the node has outputs and **no output port** has an outgoing edge. For nodes with `branch` ports (Condition), warn only when none of the branch ports is connected, because using one branch is legitimate |
| `secret-likely` | config values and keys | **high-confidence** secret match (§3.7). Rendered prominently and triggers the export confirmation |
| `secret-suspected` | config values and keys | **medium-confidence** secret match (§3.7). Warning only |

**Optional extras (default off; PO to decide):** `no-trigger` and `no-output` for a non-empty graph with none of that category; `branch-unconnected` when only one branch of a Condition is wired.

**Not-blocking guarantees (tested):** warnings never disable a button, never open a modal, never steal focus, never prevent drag, connect, edit, import, or export. (A high-confidence secret match adds an explicit confirmation step to export, §3.7; the user can always confirm.) The count updates silently.

**UI:** a warning badge on the node (with an accessible label), a count in the toolbar with a list (clicking an entry selects that node), and a "Warnings for this node" section in the config panel. New nodes warn immediately (an empty prompt, for example), which is intended and visually subdued.

**Cost:** one pass over nodes and edges plus a graph traversal, memoized on the workflow, fine at editor scale.

### 3.7 Secret detection, warnings and export confirmation (revised per PO decision S1)

**Review finding (unchanged).** `http.request.config.headers` is free-form JSON, so a user can paste `Authorization: Bearer ...` or `X-API-Key: ...`, which then lands in an exported file and, from Phase 2, in a database. The same applies to any free-text config (`payload`, `body`, prompts) and to `metadata`. Today only a description says "Do not put secrets here". This conflicts with D-016 (credentials never in workflow JSON).

**What the PO decided.** The detector and its warning system are approved. **Unconditional export blocking without an override is not approved.** Instead: high-confidence matches show a **prominent warning**; the secret value is **never echoed**; the user must **explicitly confirm before exporting**; the UI **explains how to replace the value with a credential reference**; and **backend credential-storage enforcement is kept separate** from this local export experience.

**Detector (`workflow/secrets.ts`, one module, shared fixtures `secrets/*.json`).** It scans **every string value and every object key** in every node `config` and in `metadata`, recursively.
- **High confidence:**
  - header names `authorization`, `proxy-authorization`, `cookie`, `x-api-key`, `api-key`, `x-auth-token`, `x-access-token` whose value is a non-empty literal;
  - well-known credential shapes in any string or key: `sk-...`, `sk-ant-...`, `gsk_...`, `ghp_...`, `github_pat_...`, `AKIA...`, `xox[baprs]-...`, JWT-like `eyJ...`.`...`.`...`, `-----BEGIN ... PRIVATE KEY-----`, `Bearer <long token>`.
- **Medium confidence:** object keys containing `secret`, `password`, `passwd`, `token`, `apikey` or `api_key` with a non-empty string value.
- **Honest limits:** heuristics produce false positives (an example token in a prompt) and false negatives (an unfamiliar format, an obfuscated value). They reduce accidents; they are not a guarantee. The real fix is credential references.

**Behaviour in the editor.**
1. **Medium confidence:** the `secret-suspected` warning only (node badge, count, list). No confirmation.
2. **High confidence:** the `secret-likely` warning, shown **prominently**: a distinct badge on the node, a persistent indicator in the toolbar ("Possible credential in this workflow"), and a notice in the config panel for that node.
3. **Export:** if any high-confidence match exists, **every export attempt** opens a confirmation dialog before a file is created. The dialog:
   - states that anyone who obtains the file can use the credential, and that the file may be shared, committed or stored;
   - lists the affected **nodes and property paths** only; never a value, and never a key that itself looks like a secret (shown as `‹redacted key›`);
   - explains the replacement path: *remove the value from the workflow. Credential references (an opaque `credentialRef` pointing to a credential stored by the AgentForge backend) **are not available yet**; they arrive with backend credential management. Until then keep the secret out of the file and provide it where the workflow runs. When references exist, replace the value with one.* (The dialog says plainly that references do not exist yet. Nothing in Phase 1.1 pretends otherwise.);
   - offers **Cancel** (default focus) and **Export anyway**; `Esc` cancels; focus is trapped inside and returns to the Export button; there is **no "don't ask again"**, and confirmation is not remembered between exports.
4. **Import:** a file containing a high-confidence match imports normally and shows the same prominent warning. Import is never blocked.
5. **Nothing else is blocked.** Editing, dragging, connecting, saving a draft in the browser and every other action work as usual.

**Never echo (tested).** The raw value, any substring of it, a hash of it, and any secret-shaped key must not appear in: the dialog, warning text, the toolbar indicator, `aria-label`s, the console, error panels, test output and logs. The config field in which the user typed it is the user's own input and is exempt. A Playwright test plants a sentinel secret and asserts that it appears nowhere in the page text outside that field, and in no console message.

**How this fits the decisions.** Detection results are **warnings** from the lint function (D-018 keeps `validateWorkflow` errors-only; there is no new error code). The export confirmation is a user-experience safeguard, not a structural rule, and it does not conflict with "warnings never block editing" (D-017).

**Backend enforcement is separate (Phase 2 and later, not decided here).** What the server does with credentials is its own decision: whether `save` should refuse or sanitize high-confidence matches, server-side redaction in logs, node-run records and events, `credentialRef` resolution inside executors, and never sending secrets to an LLM (ARCHITECTURE §11). It is tracked as decision **X10** in `docs/PHASE2_PLAN.md`. The detector and its fixtures are written so the backend can reuse them, but nothing about the backend is implied by the local export dialog. (My recommendation for X10: because the server **persists** what it receives, reject high-confidence matches on save with a clear 422 and no override. This is only a recommendation for the architect.)

### 3.8 Provider architecture (extensible)

- **Phase 1.1:** one exported constant `PROVIDERS = ['groq', 'openai', 'anthropic', 'ollama']` is the only place providers are listed. The `provider` enums of `llm.prompt` and `agent.autonomous` are built from it, with a catalog test. Adding a provider is one line plus a test. This resolves L6 and implements D-014. `model` stays free text.
- **Default provider:** remains `ollama` (local, no credential needed). **(Approved, V1.)**
- **Phase 2 / 4 path (not built now):** the backend owns a provider registry; each provider is an adapter behind `get_chat_model(provider, model, credential)` (D-015); the catalog's `provider` enum is **generated from registered adapters**, so adding a provider never changes the contract shape. Provider-specific settings (for example an Ollama base URL, which is not a secret) become optional settings declared by the provider, not new node types.

### 3.9 Playwright (approved) — reproducible local and CI testing

**Package and config:** `@playwright/test` as a `devDependency` (version pinned by the lockfile; `npm view` currently reports 1.64.1). Chromium only, installed by `npx playwright install chromium`, so local runs do not depend on the machine's Chrome. `playwright.config.ts`: `testDir: 'e2e'`, `testMatch: '**/*.e2e.ts'`, fixed viewport (1400x900), `reducedMotion: 'reduce'`, `webServer` starting `npm run dev -- --port 5173 --strictPort` with `reuseExistingServer: !process.env.CI`, `retries: CI ? 1 : 0`, `trace: 'on-first-retry'`.

**Scripts:** `test:e2e` (Playwright) and `verify` (`tsc -b && lint && test && build && test:e2e`), the single command that proves a clean checkout.

**Reproducible local run:** `cd frontend && npm ci && npx playwright install chromium && npm run verify`. Documented in a short `frontend/README.md`.

**Tests:** the 49 of 52 browser checks selected in `PHASE1_REVIEW.md` §3.2, in 5 spec files plus a console-error fixture. These become the regression net that protects T4 to T7 (the changes that touch the editor and the contract), which is why Playwright is the **first** task.

**CI:** `.github/workflows/ci.yml` on push and pull request to `main`: checkout, setup-node (Node 24, npm cache), `npm ci`, `tsc -b`, lint, Vitest, build, `playwright install --with-deps chromium`, `test:e2e`, upload `playwright-report/` on failure; `permissions: contents: read`; `concurrency` cancel-in-progress. Every action is pinned to a **verified commit SHA** (G1): at implementation time each SHA is resolved from the action repository's release tag with `git ls-remote --tags https://github.com/<owner>/<action> <tag>`, checked to be the commit the tag points to (dereferenced tag for annotated tags), and recorded in a trailing comment (`# v4.x.y`). A short note in `docs/DEVELOPMENT.md`-style form (in `frontend/README.md`) says how to re-verify when updating. The GitHub remote now exists, so CI can run on the first push of this task. The backend job is added in Phase 2.

---

## 4. Task plan

Sizes (S/M/L) are rough estimates. Each task ends with the full local check (`npm run verify` once T1 exists) and a documentation update.

### T1 — Playwright harness and ported checks (M)
- **Dependencies:** none. **Do this first.**
- **Files:** `frontend/package.json` and `package-lock.json`, `frontend/playwright.config.ts`, `frontend/e2e/{fixtures,helpers}.ts`, `frontend/e2e/{library,canvas-editing,connections,config-panel,import-export}.e2e.ts`, `frontend/tsconfig.e2e.json` (or edit `tsconfig.node.json`), `frontend/README.md`, `.gitignore`, `.github/workflows/ci.yml`.
- **Architecture change:** none (tests only).
- **Acceptance:** `npm run verify` passes on a clean clone; 49 checks run as automated tests; a deliberately broken selector or behaviour makes a test fail (demonstrated once and recorded); CI runs green on GitHub with every action pinned to a verified commit SHA (G1).
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

### T4 — Strict parsing, canonical JSON and export JSON (H5, revised P7) (L)
- **Dependencies:** T3.
- **Files:** `workflow/strictJson.ts` and test, `workflow/canonicalJson.ts` and test, `workflow/serialize.ts` (strict parse in, `exportPretty` out), `workflow/validate.ts` (value rules), `contracts/CANONICAL_JSON.md`, `contracts/fixtures/{parsing,serialization}/**` (120+ fixtures), Playwright import/export expectations.
- **Acceptance:**
  - Duplicate object keys are rejected **during parsing** with `doc.duplicate-key` and the JSON Pointer of the second occurrence, including duplicates that differ only by escape.
  - Every rule in the §3.5 table is enforced with its stated code, and the AgentForge-policy rules (safe integers, NUL, depth, size, BOM) are documented as policy in `CANONICAL_JSON.md`, never attributed to RFC 8785.
  - The compact profile (`canonical-json/1`) and the export profile (`export-json/1`) behave exactly as specified; export is never used for hashing.
  - All 120+ fixtures pass, including the U+E000 versus U+1F600 key-order case and the `1e-5`, `1e-6`, `1e-7` number cases.
  - `export(parse(export(x))) == export(x)` and `canonical(parse(export(x))) == canonical(x)`; a Phase 1 export still imports; `JSON.parse` is no longer used on untrusted import text (a test greps for it).
- **Tests:** the fixture runner; a property-style round trip over generated documents; a mutation check (change one rule and a fixture must fail); a lightweight truncation fuzz (a truncated file always produces a structured error, never an exception); updated Playwright import/export checks.

### T5 — JSON Schema subset, UI separation, providers (H1) (L)
- **Dependencies:** T2, T3.
- **Files:** `workflow/types.ts`, `workflow/configSchema.ts` (generalized validator), `catalog/nodes.ts` (all six definitions converted; `PROVIDERS` constant with `groq`; `defaults` removed), `catalog/index.ts`, `store/editorStore.ts` (defaults from schema), `config-panel/ConfigPanel.tsx` (render from schema + `ui`; JSON editor for arrays and nested objects), `contracts/CONFIG_SCHEMA.md`, `contracts/fixtures/config/*`, `contracts/fixtures/catalog/builtin.catalog.json`, tests.
- **Acceptance:** the validator supports every keyword in §3.1 including `integer`, `array`/`items`, nested objects, `default`, `required`, `additionalProperties`; `multiline` no longer exists in `configSchema`; accepted configs for all existing nodes are unchanged (except the planned `maxIterations` change in T6); catalog tests (unique ports, schema defaults valid against their own schemas, applied only by the explicit `applyDefaults` at creation (no requirement that required properties have defaults, see C1), enums derived from `PROVIDERS`) pass; the config panel behaves as before for existing nodes.
- **Tests:** config fixtures (types, ranges, code-point length with emoji, nested and array cases, unknown keys, `checkRequired` on and off cases (C1)); catalog consistency tests (unique ports, defaults valid against their schemas, enums derived from `PROVIDERS`); Playwright config-panel checks.

### T6 — Node migrations and the first real migration (H3) (M)
- **Dependencies:** T5.
- **Files:** `workflow/nodeMigrations.ts`, `workflow/migrate.ts` (pipeline), `workflow/serialize.ts` (`importWorkflow` returns upgrades), `catalog/nodes.ts` (`agent.autonomous` to version 2), `store/editorStore.ts` (upgrade report), `app/Toolbar.tsx` or a small `UpgradeBanner`, `contracts/fixtures/migration/*`.
- **Acceptance:** a v1 agent workflow with `maxIterations: 2.5` imports as v2 with `3`, a visible banner and a note; the original file is byte-unchanged; newer-than-known and gap cases are rejected with `node.version-newer` and `node.no-migration-path` and leave the open workflow untouched; every migration result validates against the new schema. A migration that introduces a property sets it by calling `applyDefaults` explicitly.
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

### T9 — Secret detection, warnings and export confirmation (S/M)
- **Dependencies:** T2, T3, T7.
- **Files:** `workflow/secrets.ts` and test, `contracts/fixtures/secrets/*`, `workflow/lint.ts` (adds `secret-likely` and `secret-suspected`), `app/Toolbar.tsx` (export flow and indicator), `app/ConfirmDialog.tsx` (small accessible dialog), `config-panel/ConfigPanel.tsx` (hint and node notice), Playwright spec.
- **Acceptance:**
  - High-confidence matches show a prominent warning (node badge, toolbar indicator, panel notice) and **every export opens the confirmation dialog**; Cancel is the default focus, `Esc` cancels, focus is trapped and returns to the Export button; there is no "don't ask again".
  - Cancel creates no file; **Export anyway** creates the file.
  - Medium-confidence matches only warn. Importing a file with a high-confidence match succeeds and warns.
  - The dialog explains that credential references are **not available yet** and how to replace the value when they are; it lists nodes and property paths only.
  - A planted sentinel secret (and a secret-shaped key) appears nowhere in dialog text, warning text, toolbar, `aria-label`s or console output.
  - False-positive and false-negative examples are fixtures, documenting the heuristic's limits.
- **Tests:** secrets fixtures (positives, negatives, edge cases); unit tests for the detector and the redacted paths; Playwright: paste an `Authorization` header, see the badge and indicator, export, see the dialog, Cancel gives no download, Export anyway downloads, sentinel absent from the page text outside the editing field and from the console; keyboard-only operation of the dialog.

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
| R8 | **Secret detection is heuristic** | Confirmation only for high-confidence matches; medium confidence only warns; document limits; the real fix is credential references |
| R9 | **Warnings noise** on fresh nodes | Subdued styling, separate list, rules are category and direction aware; optional extras default off |
| R10 | **Playwright flakiness** on drag and connect | Fixed viewport, reduced motion, helpers that use handle geometry, one retry in CI with traces |
| R11 | **Arrays and nested objects edited as JSON** in the panel | Accepted for 1.1; richer editors later when a node needs them |
| R12 | **Node v2 for `maxIterations`** adds migration machinery for a tiny change | It is the deliberate first user of H3; without it the mechanism would ship untested |

| R13 | **Own strict JSON parser** (revision 1) is security-relevant code we must get right | Small RFC 8259 grammar, 120+ fixtures, truncation fuzz, no `JSON.parse` on untrusted text; Python parity proven in Phase 2 |
| R14 | **Export confirmation fatigue** (revised S1): users may click through without reading | Dialog only for high-confidence matches; Cancel is the default; the text states the concrete risk; detection precision is tracked via fixtures |
| R15 | **Required keys no longer structurally required** (C1) means an incomplete file can import | Completeness is surfaced as warnings in the editor and as errors at execution (Phase 3); no file that imports today is rejected |
| R16 | **Hand-written number formatting in Python** (Phase 2) | Fixtures for every numeric edge case, including the verified `1e-5`/`1e-6`/`1e-7` differences; alternative is an RFC 8785 library |
| R17 | **Actions pinned to SHAs** need manual updates | Documented re-verification procedure; optional Dependabot for actions can be proposed later |

## 6. Decisions

### 6.1 Decided by the PO (2026-11-03, Session 5)

See §1.1. Approved: P1 (revised), P2, P3, P4, P5, P6, P7 (subject to revisions, applied), W1, V1, G1 and the toolchain. S1 was revised as the PO required. Recorded in `docs/DECISIONS.md` as D-017 (amended), D-019 (amended), D-022, D-023 (revised) and D-024.

### 6.2 Still requested (small; each has a recommendation)

| # | Decision | Recommendation |
|---|---|---|
| C1 | Because a required property no longer needs a default (P1 revision), **an absent required config key is a completeness warning, not a structural import error**, and execution (Phase 3) is where it becomes an error | Yes |
| C2 | Policy values: maximum nesting depth **64**, maximum document size **5,000,000 characters** (rules 10 and 11 of §3.5) | Yes |
| C3 | Export confirmation behaviour: shown on **every** export that has a high-confidence match, **Cancel is the default**, no "don't ask again" (§3.7) | Yes |
| C4 | Backend secret handling stays a **separate Phase 2 decision (X10)**; the local export dialog implies nothing about it | Yes |
| C5 | CI action pinning procedure: resolve each commit SHA from the release tag with `git ls-remote --tags`, check it, and record the tag in a comment (§3.9) | Yes |

### 6.3 Implementation scope requested for final approval

Approve **T1 to T10**, executed in this order, **one task per commit**, with `npm run verify` green after each, and no Phase 2 work:

`T1` Playwright and CI → `T2` structured errors → `T3` shared fixtures → `T4` strict parsing and canonical/export JSON → `T5` JSON Schema subset, `groq`, `PROVIDERS`, explicit defaults → `T6` node migrations and `agent.autonomous` v2 → `T8` branch semantics spec and `branch` field → `T7` warnings → `T9` secret detection and export confirmation → `T10` documentation and acceptance.

**Explicitly out of scope:** any backend or Phase 2 work; credential storage or `credentialRef`; Python code; rich array and nested-object editors; the optional extra warnings (disabled by W1); changing the toolchain.

## 7. Definition of done for Phase 1.1

Tasks T1 to T10 meet their acceptance criteria; `npm run verify` (type check, lint, unit tests, build, Playwright) passes locally and in GitHub Actions; the shared fixtures run green in Vitest; PROJECT_BRAIN, ROADMAP, DECISIONS, ARCHITECTURE and DEVELOPMENT_LOG match the repository; D-013 is resolved; limitations are listed. **Phase 2 begins only after separate explicit approval.**

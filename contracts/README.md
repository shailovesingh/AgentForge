# contracts/

Language-neutral test fixtures that describe the **expected outcome** of AgentForge's validation rules
(workflow import, connection rules, node config validation, and the node catalog). They are plain JSON
data with no code in them.

## Status: tested in TypeScript only

Today the only runner is `frontend/src/contracts/fixtures.test.ts` (Vitest). A Python runner for the
backend is **planned for Phase 2**. Until it exists and passes, **no parity between the TypeScript and
Python implementations is claimed**; the fixtures are written so a second implementation can run them,
nothing more.

Run them with the rest of the frontend tests: `cd frontend && npm test`.

## Layout

```
contracts/
  README.md
  fixtures/
    format.json                     { "fixtureFormat": 1 }; the runner asserts it
    catalog/builtin.catalog.json    export of the node catalog (see "Catalog fixture")
    workflow/valid/*.json           documents that must import successfully
    workflow/invalid/*.json         documents that must be rejected, with the expected errors
    connection/*.json               one proposed connection and the rule it should hit (or null)
    config/*.json                   one node config and the schema errors it should produce
```

## Common rules for every case file

- **One case per file.** The file is `<name>.json`.
- `name`: unique across **all** fixtures, and equal to the file name without `.json`.
- `description`: one sentence saying what the case shows.
- Exactly the other fields listed for its family below. **Unknown fields are an error.**
- Files are UTF-8 JSON (no byte order mark). LF or CRLF line endings are both fine.
- Error `code` values come from the stable code list in `frontend/src/workflow/errors.ts`
  (`ERROR_CODES`).
- `path` values are **RFC 6901 JSON Pointers** (`""` is the whole document, `/nodes/2/config/provider`
  is a nested location, `~` and `/` inside a key are written `~0` and `~1`).

The runner validates the shape of every file before running anything and fails, naming the file, if a
file is malformed, a name is duplicated, or a code is not a known code.

## Families

### `workflow/valid/*.json`

```json
{ "name": "...", "description": "...", "input": { ... }, "expect": { "valid": true } }
```

`input` is a JSON value. Instead of `input` a case may use `inputText` (a string with the raw text to
import; only when the exact text matters: line endings, escapes, whitespace) or `inputRepeat` (below).
Give **exactly one** of `input`, `inputText`, `inputRepeat`.

`inputRepeat` builds a large or repetitive import text without a large file:

```json
{ "inputRepeat": { "prefix": "[", "unit": "1,", "times": 3, "suffix": "1]" } }
```

The text is `prefix + unit.repeat(times) + suffix` (the example is `[1,1,1,1]`). `prefix` and `suffix` are
optional strings, `unit` is a string and `times` is an integer from 0 to **10,000,000** (the runner rejects
anything larger so a typo cannot allocate gigabytes). The fixture format version stays 1.

The import must succeed, and the resulting workflow must deep-equal the parsed input (valid cases are
written in canonical shape, so importing changes nothing).

### `workflow/invalid/*.json`

```json
{ "name": "...", "description": "...", "input": { ... },
  "expect": { "valid": false, "errors": [ { "code": "node.duplicate-id", "path": "/nodes/1/id" } ] } }
```

`input` / `inputText` / `inputRepeat` as above. `errors` must be non-empty. The import must fail with
exactly these errors (see the comparison rule below). `wf-invalid-doc-too-large.json` uses `inputRepeat`
(5,242,881 spaces) so the repository holds no large file.

#### Import semantics a second runner must follow

- **Document-level errors stop validation.** If the document fields (`id`, `name`, `description`,
  `metadata`, `nodes`, `edges`) are wrong, those errors are returned and nodes and edges are not checked
  (see `wf-invalid-doc-error-stops-before-nodes`).
- **Nodes** are checked in array order. Each node goes through these checks in this order: malformed
  (`node.malformed`), duplicate id (`node.duplicate-id`), unknown type or version (`node.unknown-type`),
  then its config. Exactly three cases are **not added**: a malformed node, a duplicate id (the **second**
  occurrence is the one blamed and is dropped) and an unknown type. A node whose **only** problems are
  config errors **is still added**: its config errors (`schema.*`, at `/nodes/<i>/config/<key>`) are
  reported and the node is kept, so edges that use it are checked normally (see
  `wf-invalid-config-error-node-still-connectable`).
- **Edges** are checked in array order, each as if it were being added to the edges **already accepted**
  and to the nodes **already added**. A malformed edge (`edge.malformed`) or a duplicate edge id
  (`edge.duplicate-id`) is rejected first; then the connection rules run in the order given under
  `connection/*.json`. A cycle is therefore reported on the edge that closes it, and a rejected edge is
  not added.
- Because a malformed, duplicate-id or unknown-type node is not added, such a node **cascades**: an edge
  that uses it also fails with `connection.unknown-node` (see `wf-invalid-cascade-unknown-type-edge`). A
  node with config errors does **not** cascade.
- **At most 20 errors** are reported (`MAX_ERRORS` in `frontend/src/workflow/validate.ts`); the first 20 in
  the order above are kept (see `wf-invalid-error-cap`, built with `inputRepeat`).

### `connection/*.json`

```json
{ "name": "...", "description": "...",
  "nodes": [ { "id": "t", "type": "trigger.manual" } ],
  "edges": [ { "source": ["t", "data"], "target": ["l", "input"] } ],
  "source": ["t", "data"], "target": ["o", "input"],
  "expect": null }
```

The workflow is described compactly: each node is `{ id, type }` and each edge is
`{ source: [nodeId, port], target: [nodeId, port] }`. A runner builds a full workflow from it: every
node gets `typeVersion` 1, its id as label, position `{0, 0}` and an **empty** `config` (`{}`; the
connection rules never read config, so this format does not depend on catalog defaults); edges get ids
`e1`, `e2`, ... in order. It then asks whether `source` -> `target` may be added.
`expect` is `null` when the connection is allowed, otherwise the first failing rule as a full code:
`connection.unknown-node`, `connection.unknown-port`, `connection.self-loop`, `connection.duplicate`,
`connection.input-occupied`, `connection.type-mismatch` or `connection.cycle`. The rule order matters
and is part of the contract, in this order: `unknown-node`, `unknown-port`, `self-loop`, `duplicate`,
`input-occupied`, `type-mismatch`, `cycle`. Fixtures that break two rules at once pin the adjacent pairs
(for example `conn-input-occupied-before-type-mismatch`, `conn-type-mismatch-before-cycle`). A port name must
exist in the right direction: the source among the node's outputs, the target among its inputs.

### `config/*.json`

```json
{ "name": "...", "description": "...", "nodeType": "llm.prompt", "config": { ... },
  "expect": [ { "code": "schema.required", "path": "/provider" } ] }
```

Validates `config` against the `configSchema` of the latest catalog definition of `nodeType`. `path` is
a JSON Pointer **relative to the config object** (`/provider`). `expect` may be empty (the config is
valid). Use `configText` (raw JSON text) instead of `config` when the exact text should be explicit, for
example in the `__proto__` fixture: a JSON parser always creates an **own** `__proto__` key, whereas an
object literal in JavaScript or Python would not, so `configText` makes that intent visible. Give exactly
one of `config` / `configText`.

## Comparing errors: multisets, no messages

Lists of `{ code, path }` are compared as **multisets**: order does not matter, duplicates count, and
the human-readable `message` is **never** compared. (The order of integer-like config keys differs
between a JavaScript object and a Python dict, and wording may change freely.)

## Catalog fixture

`fixtures/catalog/builtin.catalog.json` is the array `nodeDefinitions` from
`frontend/src/catalog/nodes.ts`, exported as JSON. A test asserts that it equals the catalog in code,
so the catalog contract cannot drift silently. If you change the catalog on purpose, regenerate the file
and review the diff:

```
cd frontend
UPDATE_FIXTURES=1 npm test                      # bash (then: unset UPDATE_FIXTURES)
$env:UPDATE_FIXTURES='1'; npm test; Remove-Item Env:UPDATE_FIXTURES   # Windows PowerShell
```

With `UPDATE_FIXTURES` set the catalog test rewrites the file and then **fails on purpose** ("catalog
fixture regenerated; unset UPDATE_FIXTURES and run again"), so a lingering environment variable can never
make the drift check pass silently. Unset it and run `npm test` again.

Only the catalog file is ever regenerated. The case fixtures are never generated from code: they are
the independent statement of what the code must do.

## Adding a case

1. Pick the family directory and create `<name>.json` with a unique `name`, a one-sentence
   `description`, and the fields of that family.
2. Write the expected result from the rules (the documented contract), not by pasting what the code
   currently prints.
3. Run `npm test` in `frontend/`. The runner names the file if it is malformed or fails.
4. Raise `MIN_COUNTS` in the runner to the new totals. The floors make deleting fixtures fail the run and
   are never lowered.
5. Every error code must stay covered by at least one `workflow/invalid` case, and every
   `connection.*` code by at least one `connection` case; the runner enforces both.

## Never edit expected values just to make a test pass

If a fixture fails, find out **why** first. Either the code has a bug (fix the code), or the rule
legitimately changed (then change the fixture and document the contract change in the same commit).
Changing an expected value without understanding the failure defeats the purpose of the fixtures.

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

`input` is a JSON value; use `inputText` (a string with the raw text to import) instead, and only when
the exact text matters (line endings, escapes, whitespace). Give exactly one of `input` / `inputText`.

The import must succeed, and the resulting workflow must deep-equal the parsed input (valid cases are
written in canonical shape, so importing changes nothing).

### `workflow/invalid/*.json`

```json
{ "name": "...", "description": "...", "input": { ... },
  "expect": { "valid": false, "errors": [ { "code": "node.duplicate-id", "path": "/nodes/1/id" } ] } }
```

`input` / `inputText` as above. `errors` must be non-empty. The import must fail with exactly these
errors (see the comparison rule below).

`wf-invalid-doc-too-large.json` is about 5 MB because the limit under test is 5 MiB of text; it is the
only large file and is a single line of spaces inside `inputText`.

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
node gets `typeVersion` 1, its id as label, position `{0, 0}` and its catalog default `config`; edges
get ids `e1`, `e2`, ... in order. It then asks whether `source` -> `target` may be added.
`expect` is `null` when the connection is allowed, otherwise the first failing rule as a full code:
`connection.unknown-node`, `connection.unknown-port`, `connection.self-loop`, `connection.duplicate`,
`connection.input-occupied`, `connection.type-mismatch` or `connection.cycle`. The rule order matters
and is part of the contract (for example `input-occupied` is reported before `type-mismatch`).

### `config/*.json`

```json
{ "name": "...", "description": "...", "nodeType": "llm.prompt", "config": { ... },
  "expect": [ { "code": "schema.required", "path": "/provider" } ] }
```

Validates `config` against the `configSchema` of the latest catalog definition of `nodeType`. `path` is
a JSON Pointer **relative to the config object** (`/provider`). `expect` may be empty (the config is
valid). Use `configText` (raw JSON text) instead of `config` when the parsed value must be built by a
JSON parser, for example to get an **own** `__proto__` key, which a literal object cannot express.
Give exactly one of `config` / `configText`.

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
UPDATE_FIXTURES=1 npm test                      # bash
$env:UPDATE_FIXTURES='1'; npm test              # Windows PowerShell
```

Only the catalog file is ever regenerated. The case fixtures are never generated from code: they are
the independent statement of what the code must do.

## Adding a case

1. Pick the family directory and create `<name>.json` with a unique `name`, a one-sentence
   `description`, and the fields of that family.
2. Write the expected result from the rules (the documented contract), not by pasting what the code
   currently prints.
3. Run `npm test` in `frontend/`. The runner names the file if it is malformed or fails.
4. Every error code must stay covered by at least one `workflow/invalid` case, and every
   `connection.*` code by at least one `connection` case; the runner enforces both.

## Never edit expected values just to make a test pass

If a fixture fails, find out **why** first. Either the code has a bug (fix the code), or the rule
legitimately changed (then change the fixture and document the contract change in the same commit).
Changing an expected value without understanding the failure defeats the purpose of the fixtures.

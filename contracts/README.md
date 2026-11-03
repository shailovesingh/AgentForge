# contracts/

Language-neutral test fixtures that describe the **expected outcome** of AgentForge's validation rules
(workflow import, connection rules, node config validation, the node catalog, and the exact JSON text
written by the two serialization profiles). They are plain JSON data with no code in them.
The serialization profiles are specified in `CANONICAL_JSON.md`.

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
  CANONICAL_JSON.md                 the two text profiles (canonical-json/1 and export-json/1)
  fixtures/
    format.json                     { "fixtureFormat": 1 }; the runner asserts it
    catalog/builtin.catalog.json    export of the node catalog (see "Catalog fixture")
    workflow/valid/*.json           documents that must import successfully
    workflow/invalid/*.json         documents that must be rejected, with the expected errors
    connection/*.json               one proposed connection and the rule it should hit (or null)
    config/*.json                   one node config and the schema errors it should produce
    serialization/*.json            arbitrary JSON text in, exact compact and export text out
```

## Common rules for every case file

- **One case per file.** The file is `<name>.json`.
- `name`: unique across **all** fixtures, and equal to the file name without `.json`.
- `description`: one sentence saying what the case shows.
- Exactly the other fields listed for its family below. **Unknown fields are an error.**
- Files are UTF-8 JSON (no byte order mark). LF or CRLF line endings are both fine.
- Error `code` values come from the stable code list in `frontend/src/workflow/errors.ts`
  (`ERROR_CODES`), **except the export-only codes** (today only `value.not-json-data`, produced by the
  editor's export guard for a value that is not JSON data). An imported file can never produce them, so
  no fixture may expect one; the runner keeps an explicit exemption list for them and checks every
  other code strictly.
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
import; only when the exact text matters: line endings, escapes, whitespace, duplicate keys, number spellings),
`inputRepeat` (below) or `inputBytesBase64` (below).
Give **exactly one** of `input`, `inputText`, `inputRepeat`, `inputBytesBase64`.

`inputRepeat` builds a large or repetitive import text without a large file:

```json
{ "inputRepeat": { "prefix": "[", "unit": "1,", "times": 3, "suffix": "1]" } }
```

The text is `prefix + unit.repeat(times) + suffix` (the example is `[1,1,1,1]`). `prefix` and `suffix` are
optional strings, `unit` is a string and `times` is an integer from 0 to **10,000,000** (the runner rejects
anything larger so a typo cannot allocate gigabytes). The fixture format version stays 1.

`inputBytesBase64` is a standard, padded base64 string of the **raw bytes** of the import file, for cases that
text cannot express: invalid UTF-8 and a leading byte order mark. The runner decodes it to bytes and passes the
bytes to the importer (so `doc.invalid-encoding` is reachable). An empty string is allowed (empty file).

The import must succeed, and the resulting workflow must deep-equal the parsed input (valid cases are
written in canonical shape, so importing changes nothing).

### `workflow/invalid/*.json`

```json
{ "name": "...", "description": "...", "input": { ... },
  "expect": { "valid": false, "errors": [ { "code": "node.duplicate-id", "path": "/nodes/1/id" } ] } }
```

`input` / `inputText` / `inputRepeat` / `inputBytesBase64` as above. `errors` must be non-empty. The import must
fail with exactly these errors (see the comparison rule below). `wf-invalid-doc-too-large.json` uses `inputRepeat`
(5,000,001 spaces) so the repository holds no large file.

#### Parsing and policy rules (AgentForge policy; written down here for a second implementation)

Import text is parsed by a strict RFC 8259 parser, **not** the platform's built-in parser. It reports the
**first** problem only. These limits are **AgentForge policy** (decisions C2 and D-026), not RFC 8785 rules:

- **Size:** at most **5,000,000 UTF-8 bytes** (bytes, not characters), checked before anything is parsed
  (`doc.too-large`). A file of exactly 5,000,000 bytes is accepted.
- **Encoding:** a single leading UTF-8 byte order mark is tolerated and ignored (never written); a second one
  is ordinary content. Invalid UTF-8 is `doc.invalid-encoding`.
- **Depth:** at most **64**, with the root value at depth **1**: an array or object adds one level when it
  opens, scalars add none. The 65th level is rejected when it opens (`doc.too-deep`, path = that container).
- **Duplicate keys** are `doc.duplicate-key`, path = the **second** occurrence. Keys are compared after escapes
  are decoded: a key written as the letter a and the same key written with the six-character escape for the
  letter a (backslash, u, 0, 0, 6, 1) are the same key.
- **Strings and keys:** U+0000 is `value.nul-character` (AgentForge/PostgreSQL rule, not an RFC 8785 rule); an
  unpaired surrogate, however it is written, is `value.invalid-unicode`. A pair written as two escapes is fine.
- **Numbers:** the magnitude of every number must be at most **2^53 - 1** (9007199254740991). A token whose
  value is 2^53 or more is `value.unsafe-integer`, unless it is beyond the double range (for example `1e400`),
  which is `value.not-finite`. The decision is made from the token text, before any conversion to a number; a
  token just below 2^53 that rounds to 2^53 (such as `9007199254740991.7`) is also rejected. Zero in any
  spelling and tiny values (`5e-324`) are accepted.
- **Grammar errors** (`NaN`, `Infinity`, leading zeros, `+1`, `.5`, `1.`, trailing commas, comments, raw control
  characters in strings, invalid escapes, trailing garbage, empty input) are `doc.not-json`. The "at position N"
  in a `Not valid JSON` message counts UTF-16 code units, after any leading byte order mark has been removed.
- A key named `__proto__` is an ordinary key.

TypeScript runs these fixtures only; **no Python parity is claimed** until a Python runner exists.

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

### `serialization/*.json`

Arbitrary JSON text in, the **exact text** of both output profiles out (see `CANONICAL_JSON.md`). This family
does not involve workflows or the catalog: it pins key order, number text, string escapes and layout.

```json
{ "name": "...", "description": "...", "inputText": "{\"b\":1.0,\"a\":[]}",
  "expect": { "valid": true, "compact": "{\"a\":[],\"b\":1}",
              "export": "{\n  \"a\": [],\n  \"b\": 1\n}\n" } }
```

- Exactly one of `inputText` (the raw JSON text) or `inputBytesBase64` (the UTF-8 bytes, standard padded base64;
  decoded without dropping a leading byte order mark, which the strict parser would then reject: tolerating a BOM
  is the importer's job, not the parser's).
- A valid case gives `compact` (profile `canonical-json/1`, no trailing LF) and `export` (profile `export-json/1`,
  ending with exactly one LF, no CR). The runner parses the input with the strict parser and compares **both texts as
  exact strings**.
- A rejection case is `{ "valid": false, "errors": [ { "code": "...", "path": "..." } ] }` with **exactly one**
  entry (the parser reports the first problem only), compared like the other families (below).
- `inputText` keeps the raw spelling on purpose: parsing a fixture would already lose `1.0`, `-0`, key order and
  duplicate keys.
- **The expected texts are written by hand from the rules** in `CANONICAL_JSON.md`. Do not paste what the code
  prints. A key sorted by Unicode code point, an escaped U+007F or U+2028, a CRLF export or a missing trailing LF must
  each make a fixture fail.

Besides this family the runner has property tests over the `workflow/valid` cases: importing, exporting, importing
and exporting again is byte-identical, and `canonicalCompact(parse(export)) === canonicalCompact(workflow)`. For every
`ser-workflow-*` case the runner also imports `inputText` as a whole workflow and requires the workflow writer's
output to equal `expect.export`.

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
5. Every error code (except the export-only exemption list in the runner) must stay covered by at least one
   `workflow/invalid` case, every `connection.*` code by at least one `connection` case, and the `serialization`
   family must keep covering its own rejection codes; the runner enforces all three.

## Never edit expected values just to make a test pass

If a fixture fails, find out **why** first. Either the code has a bug (fix the code), or the rule
legitimately changed (then change the fixture and document the contract change in the same commit).
Changing an expected value without understanding the failure defeats the purpose of the fixtures.

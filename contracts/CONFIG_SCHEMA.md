# The config schema subset

AgentForge describes a node's configuration (`configSchema`) with a **small, documented subset of JSON Schema
draft 2020-12**, and checks a config against it with its own validator. This file is the specification of that
subset. The code is `frontend/src/workflow/jsonSchema.ts`; the fixtures are in `contracts/fixtures/schema/`.

## Status: TypeScript only, not yet wired in

- The validator exists and is tested (fixtures, unit tests, a seeded property test against an independent
  reference). **Nothing uses it yet.** The catalog, the editor store, the config panel and the importer still use
  the older `validateConfig`. Converting them (task T5b) will delete the old code.
- **TypeScript only. No Python parity is claimed.** The fixtures are language-neutral so a Python runner can run
  them; that runner is **planned for Phase 2**. Until it exists and passes, nothing says the two languages agree.

## Supported keywords

| Keyword | Applies to | Meaning | JSON Schema or AgentForge policy |
|---|---|---|---|
| `type` | all (required) | one of `string`, `number`, `integer`, `boolean`, `array`, `object` | JSON Schema, with the integer rule below |
| `title`, `description` | all | annotations, never affect validity | JSON Schema |
| `default` | all | the initial value; see "Defaults" | JSON Schema annotation; applied only by `applyDefaults` |
| `enum` | string, number, integer, boolean | the value must `===` one entry; entries are strings, finite numbers or booleans | JSON Schema, restricted to primitives |
| `minLength`, `maxLength` | string | length limits counted in **code points** | **AgentForge policy** (see below) |
| `minimum`, `maximum` | number, integer | inclusive limits | JSON Schema |
| `items` | array | one schema for every element | JSON Schema (single schema only) |
| `minItems`, `maxItems` | array | length limits | JSON Schema |
| `properties` | object | schema per known key | JSON Schema |
| `required` | object | keys that must be present (see `checkRequired`); every name must be a key of `properties` | JSON Schema, plus the "in `properties`" rule |
| `additionalProperties` | object | `false`: an unknown key is an error; `true` or absent: accepted without checks; a schema: the value is validated against it | JSON Schema |

Where AgentForge differs from plain JSON Schema (all deliberate, all stated here so a second implementation can
copy them):

- **Code-point length.** `minLength`/`maxLength` count Unicode code points, not UTF-16 units. The emoji
  U+1F600 has length 1 (it is two UTF-16 units in JavaScript; Python's `len` also says 1). TypeScript uses
  `[...value].length`.
- **Safe integers.** `integer` accepts a finite number with no fractional part (`1.0` and `-0` are valid) **and**
  with magnitude at most 2^53 - 1. `9007199254740992` is not a valid integer. This matches the document-wide number
  rule in `CANONICAL_JSON.md` and `README.md`.
- **`number`** is a finite number (no NaN, no infinity; JSON cannot carry them anyway).
- **Wrong type skips the rest.** A value of the wrong type reports `schema.type` for that node and **no other
  keyword** is checked for it.
- **Own keys only.** Keys of a validated object are untrusted. A key is matched against `properties` only if
  `properties` owns it, so `constructor`, `toString` and `__proto__` are ordinary unknown keys (or ordinary
  properties if the schema names them), never inherited members. A JSON parser always makes `__proto__` an
  own key, so fixtures just contain it.
- **Unknown keys.** The JSON Schema default (`additionalProperties` absent) accepts unknown keys. AgentForge catalog
  schemas will state `additionalProperties: false` explicitly wherever they want the stricter behaviour.

## Deliberate non-goals

These keywords are **not** in the subset. `checkSchemaSubset` reports each one by name, and every other unknown
keyword too.

`$ref`, `$defs`, `anyOf`, `oneOf`, `allOf`, `not`, `if`, `then`, `else`, `patternProperties`, `format`, `pattern`.

Why:

- **`$ref`, `$defs`, `anyOf`, `oneOf` and friends.** Pydantic emits `$ref`/`$defs` for nested models and `anyOf`
  for optional fields by default. The backend must therefore emit this **flat** subset in Phase 2 (a flattening step,
  and each schema checked against the standard metaschema). Supporting composition would multiply the validator and
  the config panel for no current need.
- **`pattern` and `patternProperties`.** Regular-expression dialects differ between JavaScript and Python, so the
  same pattern could accept different strings in the two runtimes.
- **`format`.** Formats are annotations by default and validators differ on whether to assert them.
- **`type` as a list** (`["string", "null"]`) is not supported either: `type` is exactly one of the six names.

`checkSchemaSubset(schema)` also reports: a wrong or missing `type`; a keyword on the wrong type (`minLength` on a
number); `required` entries that are not own keys of `properties`; an `enum` entry that is not a string, finite
number or boolean; a keyword value of the wrong kind (a negative or fractional `minLength`, a non-numeric `minimum`);
a `default` that does not validate against its own schema (checked with `checkRequired: false`); and nesting deeper
than **16** levels (the root is level 1; `items`, `properties` and `additionalProperties` each add one).

## `checkRequired`

`validateAgainstSchema(schema, value, { checkRequired })`: the option is **mandatory** (no default) so nobody applies
it by accident.

- `required` is implemented completely. A key is **absent** when it is not an own property or its value is
  `undefined`. With `checkRequired: true`, each absent required key is `schema.required` at `/<key>`. The check
  applies at every nesting level.
- With `checkRequired: false` the `required` keyword is ignored; every other rule still applies.
- **Decision C1 (planned for T5b, not wired yet):** the editor must be able to hold and export incomplete drafts, so
  the importer will use `checkRequired: false` (type, enum, range, length and unknown-key problems stay errors; a
  missing required value is only an editor warning). Execution in Phase 3 will use `checkRequired: true`.

## Defaults are explicit, never implicit

`applyDefaults(schema)` returns a **fresh object** holding, for each property **in schema order** that has a
`default` (any value other than `undefined`, so `0`, `false` and `""` count), a deep copy of that default.

- No recursion and no synthesis: a nested object gets a value only from an explicit `default` on that property.
- A required property without a default stays absent.
- It never mutates the schema, and the result shares nothing with it.
- **No validator calls it.** Validating never changes data; the importer never fills in values. Only node creation
  (and a migration that introduces a property) calls it, deliberately.

## Error codes and paths

Every error is `{ code, path, message }`. The **code and path are the contract**; the message is for people and is
never compared by a fixture.

- `path` is an RFC 6901 JSON Pointer **relative to the validated value** (`""` is the value itself, `/a/0/b` is
  nested, `~` and `/` inside a key are written `~0` and `~1`).
- Codes (all in `ERROR_CODES` in `frontend/src/workflow/errors.ts`): `schema.type`, `schema.enum`,
  `schema.required`, `schema.additionalProperties`, `schema.minimum`, `schema.maximum`, `schema.minLength`,
  `schema.maxLength`, `schema.minItems`, `schema.maxItems`.
- The four length and item codes are produced by this validator but no catalog schema uses those keywords yet, so no
  workflow import can produce them. They are covered by the `schema` fixture family (and listed in an explicit,
  temporary exemption list in the runners until T5b).
- Order is stable but not part of the contract: `required` errors first (in the order of the `required` list), then
  the value's own keys in key order, then array elements by index. Fixtures compare as multisets.

`checkSchemaSubset` returns `{ path, message }` where `path` is a JSON Pointer into the **schema** (for example
`/properties/a/pattern`).

## Fixture case shapes (`contracts/fixtures/schema/`)

All three are one JSON file per case with `name` (equal to the file name), `description` and a `schema`.

```json
{ "name": "...", "description": "...", "schema": { ... }, "value": ..., "options": { "checkRequired": false },
  "expect": [ { "code": "schema.type", "path": "/a" } ] }
```

Validation case. `value` is any JSON value (including `null`). `options` is exactly `{ "checkRequired": true|false }`.
`expect` lists `{ code, path }` (empty means valid), compared as a multiset. The runner also requires the case's own
`schema` to pass `checkSchemaSubset`.

```json
{ "name": "...", "description": "...", "schema": { "type": "object", "properties": { ... } },
  "applyDefaults": true, "expect": { "value": { ... } } }
```

Defaults case. The result of `applyDefaults(schema)` must equal `expect.value`, **including key order** (compared as
JSON text, so avoid integer-like key names in these fixtures: their order differs between JavaScript and Python).

```json
{ "name": "...", "description": "...", "schema": ..., "checkSchema": true, "expect": [ { "path": "/properties/a/pattern" } ] }
```

Schema check case. `schema` is any JSON value (it may itself be malformed: that is the point). `expect` lists the
JSON Pointer paths of the problems the schema should produce, as a multiset; message text is not part of the contract.

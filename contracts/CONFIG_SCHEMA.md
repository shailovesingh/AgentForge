# The config schema subset

AgentForge describes a node's configuration (`configSchema`) with a **small, documented subset of JSON Schema
draft 2020-12**, and checks a config against it with its own validator. This file is the specification of that
subset. The code is `frontend/src/workflow/jsonSchema.ts`; the fixtures are in `contracts/fixtures/schema/`.

## Status: implemented in TypeScript, wired into the editor

- The validator is tested (fixtures, unit tests, a seeded property test against an independent reference) and is the
  only config validator: the catalog (`NodeDefinition.configSchema` is an `ObjectSchema`), the editor store
  (`applyDefaults` at node creation), the config panel and the importer (`checkRequired: false`, decision C1) all
  use it. The older `validateConfig`, the `ConfigProperty` type, `format: 'multiline'` and `NodeDefinition.defaults`
  are gone (task T5b).
- **TypeScript only. No Python parity is claimed.** The fixtures are language-neutral so a Python runner can run
  them; that runner is **planned for Phase 2**. Until it exists and passes, nothing says the two languages agree.

## Supported keywords

| Keyword | Applies to | Meaning | JSON Schema or AgentForge policy |
|---|---|---|---|
| `type` | all (required) | one of `string`, `number`, `integer`, `boolean`, `array`, `object` | JSON Schema, with the integer rule below |
| `title`, `description` | all | annotations, never affect validity | JSON Schema |
| `default` | all | the initial value; see "Defaults" | JSON Schema annotation; applied only by `applyDefaults` |
| `enum` | string, number, integer, boolean | the value must equal one entry (see "Enum equality"); every entry must itself have the schema's type; the list must not be empty | JSON Schema, restricted to primitives |
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
- **Enum equality.** A value equals an enum entry when it has **the same JSON type and the same value**. A boolean
  never equals a number (`true` is not `1`, `false` is not `0`) and text never equals a number. JavaScript's `===`
  gives exactly this; a port must not rely on a loose equality (Python's `True == 1` is true and would be wrong).
  The value's type is checked first (`true` against `type: integer` is `schema.type`, not `schema.enum`), and
  `checkSchemaSubset` requires every entry to have the schema's own type (an `integer` enum holds safe integers, a
  `number` enum finite numbers), so on a sound schema both sides of the comparison always have the same type.
- **Wrong type skips the rest.** A value of the wrong type reports `schema.type` for that node and **no other
  keyword** is checked for it.
- **Own keys only.** Keys of a validated object are untrusted. A key is matched against `properties` only if
  `properties` owns it, so `constructor`, `toString` and `__proto__` are ordinary unknown keys (or ordinary
  properties if the schema names them), never inherited members. A JSON parser always makes `__proto__` an
  own key, so fixtures just contain it.
- **Unknown keys.** The JSON Schema default (`additionalProperties` absent) accepts unknown keys. AgentForge catalog
  schemas state `additionalProperties: false` explicitly (all six built-in nodes do), so an unknown setting is an error.

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
number, `enum` on an array or object); `required` entries that are not own keys of `properties`, and a name listed
twice in `required` (a problem at `/required/<i>` of the **later** occurrence; the 2020-12 metaschema requires
`uniqueItems`); an `enum` that is empty (at `/enum`) or has an entry that is not of the schema's type (at
`/enum/<i>`); a keyword value of the wrong kind (a negative or fractional `minLength`, a non-numeric `minimum`);
an unsatisfiable range, reported at the **max** keyword: `minLength` greater than `maxLength`, `minimum` greater than
`maximum`, `minItems` greater than `maxItems` (equal limits are fine); a `default` that does not validate against its
own schema (checked with `checkRequired: false`); and nesting deeper than **16** levels (the root is level 1;
`items`, `properties` and `additionalProperties` each add one).

**The `default` rule.** A `default` is validated against its own schema **only when that schema node, and every
schema node beneath it, has no problem of its own**; otherwise the `default` is skipped and never reported. So a
schema with a bad keyword, an unknown keyword or a bad nested schema reports that problem and not a second,
derived one about the default, and the validator only ever runs on a sound schema. The rule is the same at every
level.

**`checkSchemaSubset` is total.** It accepts any value (including `null`, a list, a cyclic object or a schema whose
keywords have the wrong JSON type) and returns a list of problems; it never throws. A seeded property test checks
this on thousands of random and corrupted schemas.

**Precondition of the validator.** `validateAgainstSchema` assumes its `schema` passes `checkSchemaSubset` (callers
check a schema once, when it is loaded). A malformed or cyclic schema is not supported by the validator itself and
it may throw. Its `options` argument is mandatory at runtime too: a missing `options`, or an `options.checkRequired`
that is not `true` or `false`, throws a `TypeError`.

## `checkRequired`

`validateAgainstSchema(schema, value, { checkRequired })`: the option is **mandatory** (no default) so nobody applies
it by accident.

- `required` is implemented completely. A key is **absent** when it is not an own property or its value is
  `undefined`. With `checkRequired: true`, each absent required key is `schema.required` at `/<key>`. The check
  applies at every nesting level.
- With `checkRequired: false` the `required` keyword is ignored; every other rule still applies.
- **Decision C1 (implemented in T5b):** the editor must be able to hold and export incomplete drafts, so the importer
  uses `checkRequired: false` (type, enum, range, length and unknown-key problems stay errors; a missing required
  value is not a structural error and, later, only an editor warning). **`schema.required` therefore cannot be
  produced by an import.** It stays in `ERROR_CODES` as an execution-time code: Phase 3 execution will use
  `checkRequired: true`. A `config` fixture states the mode it runs in (its mandatory `checkRequired` field).

## Defaults are explicit, never implicit

`applyDefaults(schema)` returns a **fresh object** holding, for each property **in schema order** that has a
`default` (any value other than `undefined`, so `0`, `false` and `""` count), a deep copy of that default.

- No recursion and no synthesis: a nested object gets a value only from an explicit `default` on that property.
- A required property without a default stays absent.
- It never mutates the schema, and the result shares nothing with it.
- **No validator calls it.** Validating never changes data; the importer never fills in values. Only node creation
  (and a migration that introduces a property) calls it, deliberately. In the editor the only production caller is
  `addNode` in `store/editorStore.ts` (a test checks this by source text).
- The catalog carries every initial value as a schema `default` (for example `provider: 'ollama'`,
  `temperature: 0.7`, `payload: {}`); `NodeDefinition.defaults` no longer exists. A required property needs no
  default (see C1).

## The `ui` block (presentation, never validation)

A catalog definition may carry `ui` next to `configSchema`; a validator ignores it.

```ts
ui?: { order?: string[]; fields?: Record<string, { widget?: 'text' | 'textarea' | 'select' | 'json' | 'checkbox'; rows?: number; placeholder?: string }> }
```

- `order` lists property names; the panel shows them first, then any other property in schema order.
- Without a hint the panel renders from the schema type: `string` a text input, `string` with `enum` a select,
  `number` and `integer` a text input with a numeric keyboard hint, `boolean` a checkbox, `object` and `array` the
  JSON editor. `widget: 'textarea'` (with `rows`) makes a string multiline; the four multiline settings use it.
- The catalog tests check that `order` and `fields` name existing properties and that a widget fits its property type.

## Error codes and paths

Every error is `{ code, path, message }`. The **code and path are the contract**; the message is for people and is
never compared by a fixture.

- `path` is an RFC 6901 JSON Pointer **relative to the validated value** (`""` is the value itself, `/a/0/b` is
  nested, `~` and `/` inside a key are written `~0` and `~1`).
- Codes (all in `ERROR_CODES` in `frontend/src/workflow/errors.ts`): `schema.type`, `schema.enum`,
  `schema.required`, `schema.additionalProperties`, `schema.minimum`, `schema.maximum`, `schema.minLength`,
  `schema.maxLength`, `schema.minItems`, `schema.maxItems`.
- Codes that no imported workflow can produce are listed in an explicit exemption list (`SCHEMA_ONLY_CODES` in
  `frontend/src/workflow/codeExemptions.ts`, imported by the tests only): `schema.required` (execution-only, C1) and
  the four length and item codes (no catalog schema uses those keywords yet). They are covered by the `schema` and
  `config` fixture families instead; a guard fails if a `workflow/invalid` fixture starts covering one.
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
The runner also requires the case's `schema` to pass `checkSchemaSubset` and the result to validate against the
schema with `checkRequired: false` (a required property without a default stays absent, which that mode allows).
The comparison is of JSON text, so it cannot show that a default is a copy and not the schema's own object; that is
a unit test, not a fixture.

```json
{ "name": "...", "description": "...", "schema": ..., "checkSchema": true, "expect": [ { "path": "/properties/a/pattern" } ] }
```

Schema check case. `schema` is any JSON value (it may itself be malformed: that is the point). `expect` lists the
JSON Pointer paths of the problems the schema should produce, as a multiset; message text is not part of the contract.

# Node migrations (H3)

How a workflow saved with an older version of a node keeps working after the catalog moves that node to a newer
version, **without the saved file ever being rewritten and without any upgrade being invisible**.

**Status: implemented and tested in TypeScript only** (`frontend/src/workflow/nodeMigrations.ts`, the `migration`
fixture family and the `workflow/invalid` version cases). **No Python parity is claimed; the Python runner is planned
for Phase 2.** The Phase 2 persistence rule at the end is **planned, not implemented**.

## Two kinds of version

| Version | Where | Moves when |
|---|---|---|
| `schemaVersion` (document) | the top level of the file (`"1.0"`) | the shape of the whole document changes. Upgraded by `migrate()` in `migrate.ts`. |
| `typeVersion` (node) | every node (`"typeVersion": 2`) | one node type changes its config or its ports. Upgraded by `migrateNodes()` in `nodeMigrations.ts`. |

They are independent. This file is about `typeVersion`.

## The pipeline

```
bytes -> strictParse -> migrate (document schemaVersion) -> migrateNodes (node typeVersion) -> validateWorkflow -> load
```

`importWorkflow` runs all of it and returns `{ ok: true, workflow, upgrades }` or `{ ok: false, errors }`. `upgrades`
is `[]` when nothing was upgraded. `migrateNodes` works on the RAW parsed document, before validation, and **never
mutates its input** (it returns new objects).

## Rules

1. **The catalog serves only the latest definition of each node type.** The history lives in the migration registry
   (`NODE_MIGRATIONS`, ordered by type, then `from`). Validation after a migration looks the node up by exact
   `type` and `typeVersion` in the catalog, which is the latest.
2. **Which nodes are looked at.** Only a node that is an object with a string `id`, a string `type` and an integer
   `typeVersion`. Anything else is left alone for the validator (`node.malformed`). A node of a type the catalog does
   not have is left alone too: the validator reports `node.unknown-type` at `/nodes/<i>/type`. That code is **only**
   for an unknown TYPE: a known type with a bad version is never `node.unknown-type`.
3. **At the latest version:** untouched. **Lower, with a complete chain** of registered steps `from -> to` up to the
   latest: the steps run in order, and the node gets ONE upgrade report (`from` = the version in the file, `to` = the
   latest version, `notes` = all the notes in step order). **Lower, with no complete chain** (a gap, or below the
   first step, for example version 0): `node.no-migration-path` at `/nodes/<i>/typeVersion`. **Higher than the
   latest:** `node.version-newer` at `/nodes/<i>/typeVersion` ("created by a newer editor"). A non-integer
   `typeVersion` is not touched here (it is `node.malformed` in validation).
4. **All or nothing.** All version errors of all nodes are collected (at most 20) and the import is rejected:
   nothing is partially migrated, and the open workflow is never touched (the editor loads only a result that is
   fully valid). The chain is checked completely before any migration of that node runs.
5. **Pure, deterministic and total.** A migration has no I/O, clock or randomness, and it must not throw for ANY
   config: absent keys, wrong types, non-numbers, out-of-range values. A migration only changes what it understands.
   A value it does not understand is left exactly as it is, so validation reports it as the old version would have.
6. **Port renames.** A migration that renames a port also supplies `portRenames` (`inputs` and `outputs`, old name to
   new name). Edges that reference the migrated node (`source.port` through `outputs`, `target.port` through `inputs`)
   are rewritten in the same step, so a rename cannot orphan an edge. Renames of a chain are applied in step order.
   The real registry has no renames yet (tested with a synthetic registry).
7. **Never silent.** Every migrated node is reported (`{ nodeId, type, from, to, notes }`), including a node whose
   migration changed nothing (empty `notes`). The editor shows a dismissible banner: *"Upgraded 1 node (Agent v1 to
   v2). Review the changes. Your original file was not modified."* followed by the notes.
8. **Never overwritten.** The importer only reads. Nothing in this code path writes a file, storage or a network
   request (a source-text test guards `nodeMigrations.ts` and `migrate.ts`). Exporting is an explicit user action that
   produces a NEW file at the new version; an end-to-end test checks that the bytes of the imported file on disk are
   unchanged.
9. **No downgrade.** A file exported at version 2 does not open in an older editor, which fails safely with
   `node.version-newer`.
10. **Error paths.** After a migration, error paths point into the MIGRATED document. It has exactly the structure of
    the document that was read: a migration never adds, removes or reorders nodes or edges, so every node and edge
    index is unchanged; only values inside a node (`typeVersion`, `config`) can differ.
11. **Lookups keyed by untrusted data use own properties only** (`Map` or `Object.hasOwn`): a type, port or id named
    `constructor`, `__proto__` or `toString` is ordinary data.

## The first real migration: `agent.autonomous` 1 -> 2

`maxIterations` became an `integer` (still `minimum: 1`, `maximum: 50`, `default: 10`). Everything else about the node
is unchanged. New nodes are created at `typeVersion: 2`.

The migration rounds `maxIterations` **only when it is a finite number with a fractional part AND was valid at
version 1 (from 1 to 50 inclusive)**. The rounding is **half up**: `Math.floor(x + 0.5)`. 2.5 becomes 3, 3.5 becomes 4,
1.4 becomes 1, 49.5 becomes 50. The note is exactly
`maxIterations 2.5 was not a whole number and was rounded to 3` (with the real numbers).

**Rounding hazard for a Python port.** Python's built-in `round()` rounds **half to even**: `round(2.5) == 2`,
`round(48.5) == 48`. A Python implementation MUST implement half up (for example `math.floor(x + 0.5)`) or the same
file would migrate to a different value on the two sides. The fixtures include .5 cases (1.5, 2.5, 3.5, 48.5, 49.5)
for that reason. (In JavaScript, `Math.round` and `Math.floor(x + 0.5)` agree on every value from 1 to 50, so the rule
is stated for the port's sake.)

Every other value is left **unchanged**, with no note: absent (stays absent), text, `null`, a boolean, an array, an
object, a number out of the version 1 range (`0.5`, `50.4`, `51`, `0`, negative numbers) and a number that is already
whole. Validation then reports it. Note that a fractional number out of range (`50.4`, `0.5`) now fails the integer
type first (`schema.type`), where version 1 would have said `schema.minimum` or `schema.maximum`; a whole number out
of range (`51`) and text give the same error as at version 1.

A version 1 agent whose value is already a whole number (or absent) **still migrates to version 2** and is reported
with an **empty** notes list, so the user always sees that the node was upgraded.

## Fixtures

- `contracts/fixtures/migration/*.json`: the success cases (see `README.md`).
- `contracts/fixtures/workflow/invalid/`: `node.version-newer` (agent@3, `llm.prompt`@2), `node.no-migration-path`
  (agent@0), a node of an unknown type with a bad version (`node.unknown-type`), and the version 1 agents whose
  `maxIterations` stays invalid after the migration.

## Phase 2 (planned, not implemented)

In the backend, migration happens **in memory at read time**. The upgraded workflow is persisted **only when the user
saves**, as a **new immutable version**; the stored old version is never touched. The Python runner of these fixtures
is part of Phase 2 as well.

# Editor warnings (`warnings/*.json`, `lintWorkflow`)

Warnings tell the user that a workflow is **incomplete or suspicious**. They are not errors.
Decisions: D-017 (non-blocking editor warnings), D-018 (structural errors are separate from warnings), D-025 (C1:
an absent required config key is a completeness concern, not a structural error).

**Status: TypeScript only.** The implementation is `frontend/src/workflow/lint.ts` (`lintWorkflow`), run by
`frontend/src/contracts/fixtures.test.ts`. **No Python parity is claimed; the Python runner is planned for Phase 2.**
This task covers the pure function and its fixtures only; the editor UI that shows the warnings comes later (T7b), and
the secret-detection codes (`secret-likely`, `secret-suspected`) are added by T9.

## The principle: derived, never stored, never blocking

- A warning is **computed from a workflow and a catalog** every time it is needed. It is never written into the
  document, never exported and never imported.
- Warnings **never block** anything: not editing, saving, exporting, importing or running. `validateWorkflow` stays
  errors-only and does not know about warnings (D-018). A workflow with warnings is a valid workflow.
- A warning is a hint for a person. Its `message` is never compared by fixtures and may be reworded freely.

## The function

```ts
lintWorkflow(workflow: Workflow, catalog: NodeDefinition[]): Warning[]
interface Warning { code: WarningCode; severity: 'warning'; nodeId: string; port?: string; field?: string; message: string }
```

`port` names the input port (`required-input-unconnected`); `field` names the config property (`required-field-empty`).
`nodeId` is always set in this version. Node definitions are found by the **exact (type, version)** pair, as
`checkConnection` does.

## The role and direction model

- A node's **role** comes from its catalog `category`: `Triggers` are **sources**, `Output` is a **sink**, and
  `AI`, `Integrations` and `Logic` are **processors**.
- **Direction** comes from the port: inputs receive, outputs emit. Reachability follows edges from source to target.

## The rules

| # | Code | Fires for | Does not fire / notes |
|---|---|---|---|
| 1 | `required-input-unconnected` | every **input** port with `required: true` (any category) that has no incoming edge. One warning per port. `port` is set. | A connected required input; an optional input. |
| 2 | `required-field-empty` | every property listed in the node's `configSchema.required` whose value is **absent** (not an own key, or `undefined`), a **blank string** (`value.trim() === ''`) or an **empty array**. One warning per property, in schema order. `field` is set. | A non-string, non-array value is a value: `0`, `false`, `null` and `{}` are **not** empty. |
| 3 | `trigger-not-connected` | a `Triggers` node that has outputs and **none** of whose outputs has an outgoing edge. | A trigger with at least one connected output. |
| 4 | `node-unreachable` | every node whose category is not `Triggers` that is not reachable from any `Triggers` node, **only evaluated when the graph contains at least one Trigger**. | Suppressed for a node that already has a `required-input-unconnected` warning **and** has no incoming edge at all (one cause, one warning). A graph with no Trigger gets no `node-unreachable` warnings. |
| 5 | `result-unused` | every node whose category is neither `Output` nor `Triggers`, that has at least one output port, where **no** output port has an outgoing edge. | A Condition with only one of its two branch outputs wired does **not** warn: every Condition output is a `branch` port, and this single rule already gives that. A node without outputs never warns. |

An edge only counts when both of its nodes exist, and, for a node whose definition is known, its port exists in the
right direction (the source port among the node's outputs, the target port among its inputs). An edge to a missing node
or port is ignored. A node of an unknown type or version is skipped by every rule that needs its definition, but it still
counts for reachability.

### `required-field-empty` and whitespace

A string is blank when `value.trim() === ''` in **JavaScript**: `String.prototype.trim` removes white space and line
terminators (space, tab, line feed, carriage return, vertical tab, form feed, no-break space, the other Unicode space
separators, U+2028, U+2029 and the byte order mark U+FEFF). **That set is the contract.** Python's `str.strip()` and
JavaScript `trim()` differ for a few characters (general knowledge, not run in this session): U+FEFF is trimmed by
JavaScript but not by Python, and U+0085 is the other way round. A future port must therefore use this explicit set,
not its language's default strip.

## Order, determinism and comparison

- The result order is **node array order, then rule order (1 to 5), then port or field in catalog order**. The same
  input always gives the same output; the order of the edge array does not matter.
- The function is **pure** (it does not change its input; a deep-frozen workflow and catalog work) and **total** (it
  never throws, whatever the workflow object holds: unknown types, edges to nowhere, duplicate node ids, ids such as
  `__proto__`, malformed nodes and edges). With a duplicate node id, edges refer to the **first** node with that id.
- It runs in about linear time in nodes plus edges.
- Fixtures compare warnings as a **multiset** of `{ code, nodeId, port, field }` (order does not matter, duplicates
  count, `message` is never compared), like the error families.

## Messages never include values

A message names the node (its label, or its id when the label is blank) and the port or field. It **never contains a
config value or a metadata value**. A later task detects secrets in config values; a warning that repeated a value would
copy the secret into the UI. A unit test plants a sentinel string in config values, metadata, the workflow name and
description, and asserts it appears in no message.

## Fixture format (`contracts/fixtures/warnings/*.json`)

```json
{ "name": "...", "description": "...",
  "workflow": { ...a Workflow document... },
  "negativeFor": ["result-unused"],
  "expect": [ { "code": "required-input-unconnected", "nodeId": "o", "port": "input" } ] }
```

- `workflow` is a complete workflow document. The runner imports it with `importWorkflow(JSON.stringify(workflow))`, so it
  **must import successfully** (incomplete configs do: decision C1), then runs `lintWorkflow` on the imported workflow
  with the built-in catalog.
- `expect` is the list of expected warnings (`code`, `nodeId`, and `port` or `field` exactly where the code takes one);
  an empty list means no warnings. Compared as a multiset.
- `negativeFor` (optional) lists codes whose rule **applies** to this workflow but **does not fire**. The runner checks
  that the case does not expect that code and that the workflow contains a node the rule is about (an input with
  `required: true`, a schema `required` list, a trigger with outputs, a trigger plus a non-trigger node, a non-sink
  non-trigger node with outputs). Because the whole expectation must equal what `lintWorkflow` reports, "applies and was
  not expected" means "applies and did not fire".
- Coverage guards: every code in `WARNING_CODES` must be expected by at least one fixture **and** appear in at least one
  `negativeFor`. The family has a minimum count (`MIN_COUNTS.warnings`); the floor is never lowered.

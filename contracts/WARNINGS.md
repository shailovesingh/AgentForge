# Editor warnings (`warnings/*.json`, `lintWorkflow`)

Warnings tell the user that a workflow is **incomplete or suspicious**. They are not errors.
Decisions: D-017 (non-blocking editor warnings), D-018 (structural errors are separate from warnings), D-025 (C1:
an absent required config key is a completeness concern, not a structural error).

**Status: TypeScript only.** The implementation is `frontend/src/workflow/lint.ts` (`lintWorkflow`), run by
`frontend/src/contracts/fixtures.test.ts`. **No Python parity is claimed; the Python runner is planned for Phase 2.**
The editor UI that shows the warnings is T7b. The two secret-detection codes (`secret-likely`, `secret-suspected`) were
added by T9a; their rules, the display-path format and the never-echo contract are in `SECRETS.md`.

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

`port` names the input port (`required-input-unconnected`); `field` names the config property (`required-field-empty`) or,
for `secret-likely` and `secret-suspected`, the display path of the finding inside the node's config (`headers.Authorization`,
`items[2].token`, with a credential-shaped or very long key shown as `[redacted key]`; see `SECRETS.md`).
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
| 6 | `secret-likely` | a **high-confidence** finding of the secret detector in the node's `config` (a credential header name with a value, or a well-known credential shape in a value or a key). One warning per finding; `field` is the display path. | Every node is scanned, **known type or not**. Metadata findings are not warnings (a warning needs a node): the UI reads `scanSecrets` for them. **At most 50 warnings per node**: the detector keeps 50 findings per node and counts the rest; no extra warning and no count appears in any message (the UI shows "and N more" from `scanSecrets`). |
| 7 | `secret-suspected` | a **medium-confidence** finding in the node's `config` (a key containing `secret`, `password`, `passwd`, `token`, `apikey` or `api_key` with a non-empty string value). One warning per finding; `field` is the display path. | Not reported for a key whose own value is already a high finding (`SECRETS.md`). Same cap of 50 per node. |

Rules 6 and 7 come **after** rules 1 to 5 of the same node: all `secret-likely`, then all `secret-suspected`, each in the
detector's depth-first traversal order (own keys in `Object.keys` order, integer-like keys first). Their messages name the
node (its label or id through `safeDisplayName`: a credential-shaped name shows as `[redacted name]`, a long one is cut to
60 characters) and the display path, and **never a value or a credential-shaped key** (`SECRETS.md`, "Never echo"). The
messages of rules 1 to 5 are unchanged: they quote the label as it is, so a surface that reports secrets must not render them.
Rules 1 to 5 skip a node whose definition is unknown; rules 6 and 7 do not.

An edge only counts when both of its nodes exist, and, for a node whose definition is known, its port exists in the
right direction (the source port among the node's outputs, the target port among its inputs). An edge to a missing node
or port is ignored. A node of an unknown type or version is skipped by every rule that needs its definition, but it still
counts for reachability.

### `required-field-empty` and whitespace

A string is blank when `value.trim() === ''` in **JavaScript**. **The contract is this exact set of 25 code points**, the
ones `String.prototype.trim` removes (checked with Node by enumerating every code point; the count is 25):

- U+0009 to U+000D (tab, line feed, vertical tab, form feed, carriage return): 5
- U+0020 (space): 1
- U+00A0 (no-break space): 1
- U+1680 (ogham space mark): 1
- U+2000 to U+200A (the spaces from en quad to hair space): 11
- U+2028 (line separator) and U+2029 (paragraph separator): 2
- U+202F (narrow no-break space): 1
- U+205F (medium mathematical space): 1
- U+3000 (ideographic space): 1
- U+FEFF (byte order mark, zero width no-break space): 1

A string of any number of these (and only these) is blank. These near misses are **not** in the set, so a string made of
them is text, not blank: **U+0085** (next line), **U+180E** (Mongolian vowel separator) and **U+200B** (zero width space);
the control characters U+001C to U+001F are not in it either. Python's `str.strip()` and JavaScript `trim()` differ for a
few characters (general knowledge, not run in this session): U+FEFF is trimmed by JavaScript but not by Python, and U+0085
and U+001C to U+001F are the other way round. A future port must therefore use this explicit set, not its language's
default strip. Fixtures pin both sides (`warn-unicode-spaces-only-prompt`, `warn-next-line-control-is-not-blank`,
`warn-file-separator-control-is-not-blank`), and a unit test checks the set against the platform's `trim`.

## Order, determinism and comparison

- The result order is **node array order, then rule order (1 to 7), then port or field in catalog order** (for rules 6 and 7,
  the detector's depth-first traversal order). The same
  input always gives the same output; the order of the edge array does not matter.
- The function is **pure** (it does not change its input; a deep-frozen workflow and catalog work) and **never throws for
  any JSON-shaped value** (a workflow made of own data properties: unknown types, edges to nowhere, duplicate node ids,
  ids such as `__proto__`, malformed nodes and edges). Getters and proxies on the workflow are **out of scope**: they are
  not guarded against, and a getter that throws throws out of `lintWorkflow`.
- **Duplicate node ids.** Facts about a node (its connections and its reachability) are keyed by the node id **string**.
  With duplicate ids, every node with that id therefore **shares the first node's connections and reachability**: an edge
  into one of two outputs with the id `o` counts for both (neither warns `required-input-unconnected`), and a trigger and
  an integration node that share an id are both reached. The definition of the **first** node with that id decides which
  ports an edge may use. Validation rejects duplicate ids before an import, so this is unreachable in the app; it is
  defined only so that the function stays deterministic. No fixture covers it (a fixture must import); a unit test does.
- It runs in time **linear in the size of the workflow** (nodes, edges, and every string and key in the configs, which the
  secret rules scan). A unit test compares the cost of a 5,000-node and a 50,000-node chain. The secret rules keep at most 50
  findings (and so 50 warnings) per node, each path at most 200 characters, so the output stays small however large a config
  is; the scan itself still reads the whole config (`SECRETS.md`, "Bounded output").
- Fixtures compare warnings as a **multiset** of `{ code, nodeId, port, field }` (order does not matter, duplicates
  count, `message` is never compared), like the error families. **The order of the result is therefore a contract that
  only the TypeScript unit tests check**: a port gets no fixture signal for it.
- **Reachability is structural.** An edge counts whatever the node's behaviour, and every output port counts, selected or
  not. It does not model the engine's rule 5(c) (`docs/ARCHITECTURE.md` section 6.1): a node can be reachable here and
  still be skipped at run time because a required input has no active edge. That cause is reported once, as
  `required-input-unconnected` on that node.

## Messages never include values

A message names the node (its label, or its id when the label is blank) and the port or field. It **never contains a
config value or a metadata value**, and for the secret codes never a credential-shaped key (the display path shows
`[redacted key]`): a warning that repeated a value would copy the secret into the UI. A unit test plants a sentinel string in config values, metadata, the workflow name and
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
  non-trigger node with outputs; for the two secret codes, a node whose config holds a non-empty string somewhere).
  Because the whole expectation must equal what `lintWorkflow` reports, "applies and was
  not expected" means "applies and did not fire".
- Coverage guards: every code in `WARNING_CODES` must be expected by at least one fixture **and** appear in at least one
  `negativeFor`. The family has a minimum count (`MIN_COUNTS.warnings`); the floor is never lowered.

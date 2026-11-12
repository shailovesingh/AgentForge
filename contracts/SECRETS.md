# Secret detection (`secrets/*.json`, `detectSecrets`, `secret-likely`, `secret-suspected`)

Decisions: D-016 (credentials never in workflow JSON), D-023 (secret detection and export confirmation, as revised by
the Product Owner), D-017 and D-018 (warnings are derived and never block; `validateWorkflow` stays errors-only).

**Status: TypeScript only.** The implementation is `frontend/src/workflow/secrets.ts` (`detectSecrets`), used by
`lintWorkflow` in `frontend/src/workflow/lint.ts` and run against the fixtures by
`frontend/src/contracts/fixtures.test.ts`. **No Python parity is claimed; the Python runner is planned for Phase 2.**
This task is the pure detector, the two lint codes, the fixtures and this spec. The confirmation dialog, the badge, the
toolbar indicator and the config-panel notice (T9b) are **planned, not built**.

**Backend enforcement is separate (Phase 2, decision X10); not implemented.** What a server does with a credential it
receives (refuse on save, redact in logs and events, `credentialRef` resolution inside executors, never sending a secret
to an LLM) is its own decision. Nothing here is a server-side guarantee.

## What it is, and what it is not

A **heuristic**. It looks at the text of a workflow for things that look like a pasted credential, so that a person is
warned before the file is exported. It has **false positives** (harmless text that looks like a credential) and **false
negatives** (a real credential in an unfamiliar format, or hidden by encoding). It reduces accidents; it is **not a
guarantee**. The real fix is a credential reference (`credentialRef`), which does not exist yet: it arrives with backend
credential management.

## The function

```ts
detectSecrets(workflow: Workflow): SecretFinding[]
interface SecretFinding {
  confidence: 'high' | 'medium'
  location: 'config' | 'metadata'
  nodeId?: string      // set for location 'config' only
  path: string         // display path inside the config or the metadata; never a value
  reason: 'header-name' | 'credential-shape' | 'key-name'   // why it matched; never the matched text
}
```

(`lintWorkflow` calls the per-node form, `detectNodeSecrets(nodeId, config)`, so that two nodes that share an id stay
separate. It is the same scan.)

It scans **every string value and every object key**, at any depth, in **every node's `config`** and in **`metadata`**.
It uses an explicit stack, not recursion, so a 200,000-level value does not overflow the stack. It does **not** scan:

- node **labels**, the workflow **name** and the workflow **description**, nor
- anything that is not a string value or an object key (numbers, booleans, null are never matched).

(Those three are a **documented limit**: `sec-label-name-description-not-scanned`. A credential typed into a label is not
found, and a lint warning message does quote the node label, as every warning message does.)

## The rules

| Confidence | Reason | Fires when | Notes |
|---|---|---|---|
| **high** | `header-name` | an object **key**, trimmed and compared case-insensitively, is one of `authorization`, `proxy-authorization`, `cookie`, `x-api-key`, `api-key`, `x-auth-token`, `x-access-token`, and its **value is a string that is not empty after trim** | A longer name does not match (`Authorization-like`, `X-Authorization`, `Cookies`). An empty or whitespace-only value, or a value that is not a string, is **no finding**. |
| **high** | `credential-shape` | any string **value** or any object **key** contains one of the shapes below | Found **anywhere** inside a longer string (a prompt with a pasted key matches). A key match is reported at the path of that key's value, whatever the value is. |
| **medium** | `key-name` | an object **key**, case-insensitive, **contains** `secret`, `password`, `passwd`, `token`, `apikey` or `api_key`, its value is a string that is not empty after trim, and the path is **not already a high finding** | A path that is both high and medium reports **only the high one**. An empty or whitespace-only value, or a value that is not a string, is no finding. |

One finding per distinct **(location, nodeId, path, reason)**. A header named `Authorization` that holds a Bearer token is
therefore **two** findings at one path (`header-name` and `credential-shape`), and two different credential-shaped keys
under one parent are **one** finding (their display path is the same).

### The credential shapes

| Name | Shape (case-sensitive) |
|---|---|
| `sk` | `sk-` followed by 20 or more of `A-Z a-z 0-9 _ -` (covers `sk-ant-...`) |
| `gsk` | `gsk_` followed by 20 or more letters or digits |
| `ghp` | `ghp_` followed by 36 or more letters or digits |
| `github_pat` | `github_pat_` followed by 22 or more of `A-Z a-z 0-9 _` |
| `akia` | `AKIA` followed by 16 or more of `0-9 A-Z` |
| `xox` | `xox`, one of `b a p r s`, `-`, then 10 or more of `A-Z a-z 0-9 -` |
| `jwt` | `eyJ` and 5 or more base64url characters (`A-Z a-z 0-9 _ -`), a dot, 5 or more, a dot, 5 or more |
| `pem` | `-----BEGIN`, up to 30 uppercase letters or spaces, `PRIVATE KEY-----` (the plain, RSA, EC, OPENSSH and ENCRYPTED forms; a PUBLIC KEY header is not a match) |
| `bearer` | `Bearer`, one or more whitespace characters, then 20 or more of `A-Z a-z 0-9 . _ ~ + / = -` (case-sensitive: a lowercase `bearer` is a documented false negative) |

**The left boundary** (a decision of this task). Every shape except `pem` must start where the character before it is not
a letter, digit, `_` or `-`. So `task-` followed by 24 characters is not `sk-` followed by 24 characters (`task-...` and
`risk-assessment-...` are ordinary words), but `key=sk-...`, a quoted token and a token after a space or a newline are.
**The right side has no boundary**: more characters than the minimum still match. The lengths are exact counts in the
patterns (`{20}`), which match the same strings as "20 or more" because only existence matters.

**Linear time.** The patterns have no nested quantifiers; every count is exact or bounded, except the two open-ended runs
inside `jwt`, which can only start at the beginning of a run (that is what the left boundary also buys). Unit tests run
5,000,000-character adversarial strings (`sk-` plus 4,999,990 letters; `Bearer ` plus millions of spaces; `eyJ` plus
millions of dots; `eyJ-` repeated; `-----BEGIN ` repeated; and more) and a 60,000-key object, each under two seconds.

## The display path and redaction

`path` tells a person **where** to look, never **what** it was. It is the steps from the root of the config (or the
metadata) joined as `a.b[2].c`: an object key adds `.key` (no dot for the first step), an array index adds `[n]`.

- A header name such as `Authorization`, and an ordinary key such as `headers` or `payload`, **are not secret and are
  shown**: `headers.Authorization`.
- A step whose key is **itself credential-shaped** (it matches a shape above) **or longer than 40 characters** is shown as
  **`[redacted key]`**: `headers.[redacted key]`. (A key of exactly 40 characters is shown.) The same rule covers the middle
  of a path: `[redacted key].password`.
- A key that is not credential-shaped and is at most 40 characters is shown as written, **even if it is odd** (spaces,
  dots, brackets, an empty key). A path is therefore a display aid, **not a unique address**: two keys can share one. A key
  that hides a secret in a short, non-shaped form (`my password is hunter2`) is shown; that is a documented limit.

The `path` of a value match is the path of the string; the `path` of a key match is the path of that key's value.

## Never echo (a contract)

A finding, a lint warning, a log line or a thrown error **never contains** a value, **a prefix, suffix or any substring of a
value, a hash of a value, or a credential-shaped key**. `reason` says why a finding matched without saying what. The lint
message names the node, the display path and says that a credential may be present. Tests plant a sentinel token in many
places (a header value, a nested value, an array item, metadata, as a key, inside a long prompt) and in 1,200 seeded random
configs, and check that the sentinel, its first and last 8 characters and a simple hash of it appear in **no finding field
and no lint warning field**. The one place a value legitimately exists is the field in which the user typed it.

## Order

Nodes in array order (each node's `config`), then `metadata`. Inside one scan the walk is depth-first and keys come in
`Object.keys` order (integer-like keys first, then insertion order). For one path the reasons come in the order
`header-name`, `credential-shape`, `key-name`. **High before medium is not guaranteed** by the detector. Fixtures compare
findings as a **multiset**, so order is a contract that only the TypeScript unit tests check.

## Own properties, purity, totality

Only own enumerable properties are read (`Object.keys`), so an inherited property is never seen and a key named
`__proto__` is an ordinary key (the walk reads it as the own data property it is; nothing is polluted). The input is not
changed (a deep-frozen workflow works). The function never throws for a JSON-shaped value (own data properties); getters
and proxies are out of scope. An object reached a second time (a cycle, or a shared sub-object in memory) is walked **once**,
so the function ends; a JSON document has neither.

## How it fits with lint (T9a, done) and the UI (T9b, planned)

`lintWorkflow` adds **one warning per config finding**, after the five rules of the same node, for every node (a node of an
unknown type is scanned too, because it is exported all the same):

| Code | From | `field` |
|---|---|---|
| `secret-likely` | high findings | the display path |
| `secret-suspected` | medium findings | the display path |

Order inside a node: the five rules, then every `secret-likely` in path order, then every `secret-suspected` in path order.
**Metadata findings are not warnings**: a warning needs a node (`Warning.nodeId` is a required string). The T9b UI reads
`detectSecrets` directly for them. Details of the lint function: `WARNINGS.md`.

**T9b (planned, not built):** a distinct node badge and a toolbar indicator for `secret-likely`, a notice in the config
panel, and a confirmation dialog on **every export** when a high finding exists (Cancel is the default focus, Escape
cancels, no "do not ask again"; the dialog lists nodes and display paths only, and explains that credential references are
not available yet). The export is never blocked: the user can always confirm (decision D-023, `docs/PHASE1_1_PLAN.md`
section 3.7). Import is never blocked either.

## Fixtures (`fixtures/secrets/*.json`) and the placeholder method

A fixture is `{ "name", "description", "workflow", "expect" }`:

```json
{ "name": "sec-shape-sk-value", "description": "...",
  "workflow": { ...a Workflow document, with placeholders... },
  "expect": [ { "confidence": "high", "location": "config", "nodeId": "p", "path": "prompt", "reason": "credential-shape" } ] }
```

- `expect` is a list of findings (`confidence`, `location`, `nodeId` for `config` only, `path`, `reason`), compared as a
  **multiset**; an empty list means no finding. `reason: key-name` goes with `confidence: medium`, the other two with `high`.
- The runner imports the workflow with `importWorkflow` (it **must import**; `additionalProperties: false` means free
  text goes in `http.request` headers, `trigger.manual` payload, prompts, bodies and `metadata`) and runs `detectSecrets`.

**Push protection: a fixture, a test or a source file never contains a literal token.** The repository is pushed to GitHub,
whose secret scanning and push protection reject token-shaped strings. A fixture holds a **placeholder**, and the runner
replaces every placeholder, in **every string and every object key** of the workflow, with a synthetic token built **from
parts at run time**, before the workflow is imported and scanned. The syntax is `@@NAME@@` (the default size) or
`@@NAME:n@@` (the length n of the part the shape counts; for `JWT` the length of each of the three parts). An unknown name
fails the run. The placeholder table:

| Placeholder | Default size | Builds | Matches shape |
|---|---|---|---|
| `@@SK@@` | 24 | `sk-` + n letters | `sk` |
| `@@SKANT@@` | 30 | `sk-ant-api03-` + n letters | `sk` |
| `@@GSK@@` | 24 | `gsk_` + n letters | `gsk` |
| `@@GHP@@` | 36 | `ghp_` + n letters | `ghp` |
| `@@GHPAT@@` | 30 | `github_pat_` + n letters | `github_pat` |
| `@@AKIA@@` | 16 | `AKIA` + n uppercase letters | `akia` |
| `@@XOXB@@`, `@@XOXA@@`, `@@XOXP@@`, `@@XOXR@@`, `@@XOXS@@` | 12 | `xox<letter>-` + n digits | `xox` |
| `@@XOXZ@@` | 12 | `xoxz-` + n digits | none (a letter outside `a b p r s`) |
| `@@JWT@@` | 10 | `eyJ` + n letters, a dot, n letters, a dot, n letters | `jwt` |
| `@@JWT2@@` | 10 | the same with only two parts | none |
| `@@PEM@@` | (none) | the plain PRIVATE KEY header | `pem` |
| `@@PEMRSA@@` | (none) | the RSA PRIVATE KEY header | `pem` |
| `@@PEMPUBLIC@@` | (none) | a PUBLIC KEY header | none |
| `@@BEARER@@` | 24 | `Bearer ` + n letters | `bearer` |

(The table above describes the **result**; the table in the runner builds each token by concatenating separate pieces, so
no source file holds a token-shaped literal.) The runner **checks this**: one test reads every file under `fixtures/` and
every source file of the detector, its tests and the runner, and fails if the detector finds a token-shaped string in the
raw text. Another checks that every placeholder in the table is used by at least one fixture and that no fixture uses an
unknown one.

**Coverage guards** (in the runner): every credential shape is found by at least one positive fixture; every header name
and every medium key word appears in a positive fixture; every reason, both confidences and both locations are expected
somewhere; there are at least 12 negative fixtures; the family has a minimum count (`MIN_COUNTS.secrets`), never lowered.
The fixtures also document the **limits** as cases: a prompt that merely says "use a Bearer token here" (no finding),
`token_count: "5"` (a documented false positive), an unfamiliar header name (`Authorization-like`: a documented false
negative), a lowercase `bearer` (a documented false negative), base64 of a key (no finding), and labels, names and
descriptions (not scanned).

## Honest limits, in one place

- Heuristic. False positives: a harmless key such as `token_count`, an example key in a prompt. False negatives: an
  unfamiliar format, an obfuscated or encoded value, a credential under a header name not in the list, a lowercase
  `bearer` scheme, a credential in a JSON **string** that holds a header object as text, a credential typed into a label,
  a name or a description.
- It reads names and shapes, not meaning, and it never contacts a service to test a credential.
- It protects against **accidents**; it does not stop a determined user and is not a server-side control.
- The display path can show a short key that itself describes a secret; only credential-shaped and long keys are redacted.
- TypeScript only; the Python runner is planned for Phase 2; backend enforcement is decision X10 and is not implemented.

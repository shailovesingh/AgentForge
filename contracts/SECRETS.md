# Secret detection (`secrets/*.json`, `detectSecrets`, `scanSecrets`, `secret-likely`, `secret-suspected`)

Decisions: D-016 (credentials never in workflow JSON), D-023 (secret detection and export confirmation, as revised by
the Product Owner), D-017 and D-018 (warnings are derived and never block; `validateWorkflow` stays errors-only).

**Status: TypeScript only.** The implementation is `frontend/src/workflow/secrets.ts` (`detectSecrets`, `scanSecrets`,
`safeDisplayName`), used by `lintWorkflow` in `frontend/src/workflow/lint.ts` and run against the fixtures by
`frontend/src/contracts/fixtures.test.ts`. **No Python parity is claimed; the Python runner is planned for Phase 2.**
T9a is the pure detector, the two lint codes, the fixtures and this spec. **T9b (the UI) is built**: the node badge, the
toolbar indicator, the config-panel notice and the export confirmation dialog, described under "The UI (T9b)" below.

**Backend enforcement is separate (Phase 2, decision X10); not implemented.** What a server does with a credential it
receives (refuse on save, redact in logs and events, `credentialRef` resolution inside executors, never sending a secret
to an LLM) is its own decision. Nothing here is a server-side guarantee.

## What it is, and what it is not

A **heuristic**. It looks at the text of a workflow for things that look like a pasted credential, so that a person is
warned before the file is exported. It has **false positives** (harmless text that looks like a credential) and **false
negatives** (a real credential in an unfamiliar format, or hidden by encoding). It reduces accidents; it is **not a
guarantee**. The real fix is a credential reference (`credentialRef`), which does not exist yet: it arrives with backend
credential management.

## The functions

```ts
scanSecrets(workflow: Workflow): { findings: SecretFinding[]; omitted: { perNode: Map<string, { high: number; medium: number }>; metadata: { high: number; medium: number } } }
detectSecrets(workflow: Workflow): SecretFinding[]      // = scanSecrets(workflow).findings
safeDisplayName(text: string): string
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
It uses an explicit stack, not recursion, so a 200,000-level value does not overflow the stack.

**What is NOT scanned (a documented limit):** node **labels**, node **ids**, node **types**, **edges**, the workflow
**id**, **name** and **description**, and anything that is not a string value or an object key (numbers, booleans and null
are never matched). A credential typed into one of those is not found.

**Consequence for every surface that reports a secret** (the T9b dialog, the toolbar indicator, `aria-label`s, lint
messages): a label or an id could itself be a pasted token, so node names are shown **only through `safeDisplayName`**. Since
the T9b review every lint message (all seven rules) already names the node through it, so no `Warning.message` quotes a raw
label. `Warning.nodeId` is an identifier, not display text: show a node through `safeDisplayName(label, else id)`.

`safeDisplayName(text)` returns **`[redacted name]`** when the text is credential-shaped (any shape below, anywhere in
it, checked on the whole text before cutting), and otherwise the text cut to **60 characters** with `...` appended when it
was cut (never half of a surrogate pair). The messages of every lint rule use it for the node name.

## The rules

| Confidence | Reason | Fires when | Notes |
|---|---|---|---|
| **high** | `header-name` | an object **key**, trimmed and compared case-insensitively, is one of `authorization`, `proxy-authorization`, `cookie`, `x-api-key`, `api-key`, `x-auth-token`, `x-access-token`, and its **value is a string that is not empty after trim** | A longer name does not match (`Authorization-like`, `X-Authorization`, `Cookies`). An empty or whitespace-only value, or a value that is not a string, is **no finding**. |
| **high** | `credential-shape` | any string **value** or any object **key** contains one of the shapes below | Found **anywhere** inside a longer string (a prompt with a pasted key matches). A key match is reported at the path of that key's value, whatever the value is. |
| **medium** | `key-name` | an object **key**, case-insensitive, **contains** `secret`, `password`, `passwd`, `token`, `apikey` or `api_key`, and its value is a string that is not empty after trim | **Not reported for a key whose own value is already a `header-name` or `credential-shape` finding** (the rule is per KEY, one step of the walk, not per display path). An empty or whitespace-only value, or a value that is not a string, is no finding. |

**What "one finding" means.** Findings are deduplicated per scan (one node's config, or the metadata) on
**(location, nodeId, path, reason)** over the findings that are kept. Consequences, all intended:

- A header named `Authorization` that holds a Bearer token is **two** findings at one path (`header-name` and
  `credential-shape`): different reasons.
- Two different credential-shaped keys under one parent have the same display path (`[redacted key]`) and the same reason:
  **one** finding.
- Because the medium rule is per key and a display path is not an address, two different keys can share a path and both be
  reported. A credential-shaped key and an over-long key containing `password`, side by side, give a high `credential-shape`
  **and** a medium `key-name`, both at `[redacted key]` (`sec-medium-per-key-redacted-collision`). The key `a.password` and
  the nested `a` then `password` share the path `a.password`: a medium finding for the first key and a high finding for the
  second (`sec-medium-per-key-dotted-key`).
- With **duplicate node ids** two identical findings can occur (the scan is per node). Validation rejects duplicate ids
  before an import, so this cannot happen in the app.
- The reasons for one path come in the order the walk finds them (below), not sorted.

### The credential shapes

| Name | Shape (case-sensitive) | Left boundary |
|---|---|---|
| `sk` | `sk-` followed by 20 or more of `A-Z a-z 0-9 _ -` (covers `sk-ant-...`) | strict |
| `gsk` | `gsk_` followed by 20 or more letters or digits | relaxed |
| `gh` | `gh`, one of `p o u s r`, `_`, then 36 or more letters or digits (the GitHub token kinds `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`) | relaxed |
| `github_pat` | `github_pat_` followed by 22 or more of `A-Z a-z 0-9 _` | relaxed |
| `akia` | `AKIA` followed by 16 or more of `0-9 A-Z` | relaxed |
| `xox` | `xox`, one of `b a p r s`, `-`, then 10 or more of `A-Z a-z 0-9 -` | relaxed |
| `jwt` | `eyJ` and 5 or more base64url characters (`A-Z a-z 0-9 _ -`), a dot, 5 or more, a dot, 5 or more | strict |
| `pem` | `-----BEGIN`, up to 30 **uppercase** letters or spaces, `PRIVATE KEY-----` (the plain, RSA, EC, OPENSSH and ENCRYPTED forms; a PUBLIC KEY header, a lowercase gap or a missing closing run of dashes is not a match) | none |
| `bearer` | `Bearer`, one or more whitespace characters (JavaScript `\s`), then 20 or more of `A-Z a-z 0-9 . _ ~ + / = -` (case-sensitive: a lowercase `bearer` is a documented false negative) | strict |

**The left boundary** (a decision of T9a, refined by its review). A shape must start where the character before it is not:

- **strict** (`sk-`, `jwt`, `Bearer`): an ASCII letter, a digit, `_` or `-`. So `task-` followed by 24 characters is not
  `sk-` followed by 24 characters (`task-...` and `risk-assessment-...` are ordinary words), but `key=sk-...`, `config.` then a
  token, a quoted token and a token after a space or a newline are found.
- **relaxed** (the distinctive prefixes `gh?_`, `gsk_`, `github_pat_`, `AKIA`, `xox?-`): only an ASCII letter or a digit. So
  `GITHUB_TOKEN_ghp_...` and `key-ghp_...` are found, while `x` glued before `AKIA...` is not.
- "Letter" means **ASCII letters only**: an accented letter before a token does **not** hide it (`sec-port-non-ascii-letter-before-token`).
- `.` is never part of the boundary: `config.` followed by a token is found.

**The right side has no boundary**: more characters than the minimum still match. The lengths are exact counts in the
patterns (`{20}`), which match the same strings as "20 or more" because only existence matters. A text shorter than 15
characters cannot match any shape (the shortest is `xox?-` plus 10), so the detector skips the regexes for it.

**Linear time.** The patterns have no nested quantifiers; every count is exact or bounded, except the two open-ended runs
inside `jwt`, which can only start at the beginning of a run (that is what the strict boundary buys). Unit tests run
5,000,000-character adversarial strings (`sk-` plus 4,999,990 letters; `Bearer ` plus millions of spaces; `eyJ` plus
millions of dots; `eyJ-` repeated; `-----BEGIN ` repeated; and more) and a 60,000-key object, each under two seconds.

## The display path and redaction

`path` tells a person **where** to look, never **what** it was. It is the steps from the root of the config (or the
metadata) joined as `a.b[2].c`: an object key adds `.key` (no dot for the first step), an array index adds `[n]`.

- A header name such as `Authorization`, and an ordinary key such as `headers` or `payload`, **are not secret and are
  shown**: `headers.Authorization`.
- A step whose key is **redacted** is shown as **`[redacted key]`**: `headers.[redacted key]`, also in the middle of a path
  (`[redacted key].password`). A key is redacted when it
  1. is **credential-shaped** (it matches a shape above), or
  2. is **longer than 40 UTF-16 code units** (a key of exactly 40 is shown; 17 emoji after `password` are 42 units and are
     redacted), or
  3. **contains `=`, `:` or whitespace** (JavaScript `\s`: the same 25 code points as `trim`, see `WARNINGS.md`, including
     U+FEFF): a secret typed INTO a key (`token: abc123`, `password=hunter2`) or a key with spaces is never shown.
- Any other key is shown as written, **even if it is odd** (dots, brackets, an empty key). A path is therefore a display
  aid, **not a unique address**: two keys can share one. A key that hides a secret in a short, plain form (a Stripe-style
  `sk_live_...` key, a bare password used as a key) is shown: a documented limit.
- **The marker is ambiguous on purpose**: a real key can be literally `[redacted key]`. It is display text only.

**Length cap.** A display path is at most **200 characters**. A longer one is cut **after the last whole step that leaves
room for `...`**, and `...` is appended. A step is never cut, so a `[redacted key]` marker is never shortened. (Steps are at
most 40 characters, or the marker, or an array index.) Two long paths cut to the same text collapse into one finding.

The `path` of a value match is the path of the string; the `path` of a key match is the path of that key's value.

## Bounded output (a contract)

A hostile or accidental file can hold hundreds of thousands of findings (a 2 MB file that imports normally gave 120,000
findings and 288 MB of path text before this cap). So:

- **The caps are per confidence: at most 50 HIGH and at most 50 MEDIUM findings are kept per node, and the same for the
  metadata** (`MAX_FINDINGS_PER_SCAN`). The first 50 of each kind in the walk order are kept. After that the scan **keeps
  walking but only counts**: no path string and no dedup key is built for an omitted finding.
- **Why separate caps (a correction made in the T9b review).** T9a first used ONE cap of 50 for both kinds and accepted, as a
  documented limit, that 50 medium findings placed before a high one could push the high one out of the kept findings. That
  narrowed the Product Owner's decision D-023 (every export that carries a high-confidence finding must ask): such a file
  showed no badge, no indicator and no dialog, and left with the credential. **The limit is reversed.** With separate caps a
  medium finding can never use up the room of a high one, and **the first high finding of a node (or of the metadata) is
  always kept**, so "this node has a high finding" is exact however large the file is. (Fixture
  `sec-cap-mediums-before-high`, and unit tests for 50 and 55 mediums before a high one in a header, an array, a key and the
  metadata.)
- `scanSecrets` returns the kept findings and the counts that were left out, per confidence: `omitted.perNode` (node id to
  `{ high, medium }`, only nodes with at least one omitted finding; nodes that share an id add up) and `omitted.metadata`
  (`{ high, medium }`). The count is an **upper bound**: a duplicate of a kept finding counts too (the cap counts findings
  met, not distinct ones).
- `detectSecrets(workflow)` returns `scanSecrets(workflow).findings`.
- `lintWorkflow` emits one warning per **kept** config finding, so **at most 50 `secret-likely` and 50 `secret-suspected`
  warnings per node**. It adds **no** extra warning and **no** count in any message for what was omitted: the list is capped,
  and **the T9b dialog shows "and N more" from `scanSecrets`** (the omitted HIGH count).
- Every path is at most 200 characters (above), so the output is bounded by nodes times 100 times 200.

## Never echo (a contract)

A finding, a lint warning, a log line or a thrown error **never contains** a value, **a prefix, suffix or any substring of a
value, a hash of a value, or a credential-shaped key**. `reason` says why a finding matched without saying what. The lint
message names the node (through `safeDisplayName`), the display path, and says that a credential may be present. Tests plant
a sentinel token in many places (a header value, a nested value, an array item, metadata, as a key, inside a long prompt, in
a key with `:` or `=`) and in 1,200 seeded random configs, and check that the sentinel, its first and last 8 characters and a
simple hash of it appear in **no finding field and no lint warning field**. The one place a value legitimately exists is
the field in which the user typed it. **Test failure messages** print lengths, names and indexes, never a synthetic token.

## Order

Nodes in array order (each node's `config`), then `metadata`. Inside one scan the walk is **depth-first, with each object's
own keys in `Object.keys` order (integer-like keys first, in ascending order, then the other keys in insertion order)**.
For one key the reasons come in the order `header-name`, `credential-shape`, `key-name`. **High before medium is not
guaranteed** by the detector. Inside a node, lint emits all `secret-likely` and then all `secret-suspected`, each in the
detector's depth-first traversal order. Fixtures compare findings as a **multiset**, so order is a contract that only the
TypeScript unit tests check.

## Own properties, purity, totality

Only own enumerable properties are read (`Object.keys`), so an inherited property is never seen and a key named
`__proto__` is an ordinary key (the walk reads it as the own data property it is; nothing is polluted). The input is not
changed (a deep-frozen workflow works). The function never throws for a JSON-shaped value (own data properties); getters
and proxies are out of scope. An object reached a second time (a cycle, or a shared sub-object in memory) is walked **once**,
so the function ends; a JSON document has neither.

## Rules a port must copy exactly (JavaScript, not Python, defaults)

These are the places where a Python implementation would silently differ; fixtures `sec-port-*` pin the ones a fixture can
express (placeholders `@@FEFF@@`, `@@NEL@@`, `@@FS@@`, `@@E9@@` and `@@EMOJI:n@@` build the characters at run time).

- **Trimming is JavaScript `String.prototype.trim`**, the 25 code points of `WARNINGS.md`. A key with a leading U+FEFF before
  `Authorization` **is** a header-name finding (U+FEFF is trimmed; Python's `strip()` keeps it). A value made of U+0085 or
  U+001C counts as **non-empty** (filled; Python's `strip()` removes them). A value made only of U+FEFF is blank.
- **Whitespace after `Bearer` is JavaScript `\s`**: U+FEFF counts, U+0085 and U+001C do not.
- **The key length limit 40 counts UTF-16 code units**, not code points or bytes (17 emoji after `password` is 42 and is redacted).
- **"Letter" in the left boundary means ASCII letters only** (an `e` with an acute accent before `sk-...` still matches).
- **Key order**: integer-like keys first (the order is only unit-tested; fixtures compare multisets).

## How it fits with lint (T9a) and the UI (T9b)

`lintWorkflow` adds **one warning per kept config finding**, after the five rules of the same node, for every node (a node of
an unknown type is scanned too, because it is exported all the same):

| Code | From | `field` |
|---|---|---|
| `secret-likely` | high findings | the display path |
| `secret-suspected` | medium findings | the display path |

Order inside a node: the five rules, then every `secret-likely`, then every `secret-suspected`, each in the detector's
depth-first traversal order. **Metadata findings are not warnings**: a warning needs a node (`Warning.nodeId` is a required
string). The T9b UI reads `scanSecrets` directly for them and for the omitted counts. Details of the lint function: `WARNINGS.md`.

## The UI (T9b)

Decision D-023 and `docs/PHASE1_1_PLAN.md` section 3.7: detect, warn prominently, **never echo the value**, require an
**explicit confirmation on every export**. **Nothing is blocked**: the user can always confirm, import is never blocked,
editing, dragging and connecting work as before. Medium confidence stays an ordinary muted `secret-suspected` warning: no
indicator and no dialog.

**The view model** is `frontend/src/store/secretReport.ts` (`buildSecretReport`, and `getSecretReport`, cached per workflow
object with the previous report reused while the scan's inputs are unchanged). It is the ONLY thing the dialog and the toolbar
read. It holds `hasHigh`, `hasMedium`, the HIGH findings grouped by node (`name`, `paths`, `omitted`; at most **50 nodes**,
the rest counted in `omittedNodes`), the high metadata paths and `omitted`, and `counts` (kept AND omitted findings per
confidence). `name` is `safeDisplayName(label, else id)` (never the raw label or id; a whitespace-only label falls back to the
id, exactly like the lint messages); `paths` are display paths, each once per node (a header named `Authorization` that holds a
token is two findings at one path, listed once); `omitted` is the omitted HIGH count from `scanSecrets`. `hasHigh` is true for
any high finding, kept or omitted, in a config OR in the metadata. (A node whose high findings were all omitted would still
be listed with no paths; the scanner's per-confidence caps make that impossible today, and the code keeps `hasHigh` exact if
the caps ever change.)

**What the user sees, for a high-confidence finding (`secret-likely` or a high metadata finding):**

| Where | What |
|---|---|
| Node badge | A distinct badge (`ShieldAlert` icon, coloured border, `data-secret-likely`), accessible name "N warnings, possible credential". Its title lists the warning messages of that node; every lint message names the node through `safeDisplayName`, so none can quote a label that is itself a token. |
| Toolbar | The status text "Possible credential in this workflow" (`data-secret-indicator`), present while `hasHigh` (config or metadata). Not `role=alert`, not a live region, not a modal. The toolbar subscribes to the boolean only. |
| Config panel | For the selected node with a `secret-likely` warning: a section "Possible credential in this node" with the display paths and a sentence on removing the value. |
| Export | If `hasHigh` at the moment Export is activated, a native modal `<dialog>` (`app/ConfirmDialog.tsx`) opens BEFORE any file is created, **on every attempt**: nothing is remembered, no "do not ask again", no storage of any kind. It says that anyone who obtains the file can use the credential and that the file may be shared, committed or stored; lists at most 50 nodes and their paths (and the metadata paths) with "and N more" where `omitted > 0` and "and N more nodes" past the 50th node; explains that credential references (an opaque id pointing to a credential stored by the AgentForge backend) are **not available yet**, that they arrive with backend credential management, and that until then the secret should be kept out of the file and provided where the workflow runs. **Cancel** has the focus on open, `Escape` cancels, Tab and Shift+Tab cycle inside, and focus returns to the Export button. The `keydown` of every key except Tab and Escape is stopped inside the dialog (so Delete and Backspace never reach React Flow's document-level handler and cannot delete the selected node behind it; a test records the keys a document listener sees). Only the event is stopped: Enter and Space on a focused button still activate it. **Export anyway** runs the existing export path unchanged (an export error still shows its own panel) on **the workflow object that was current when Export was clicked**, the one the list was built from, so an import that finishes behind the dialog cannot change what is exported. The dialog component takes the report only (no workflow type). |

With no high finding the export is exactly as before (no dialog, no extra step). The dialog opens only from the Export button.

**What the never-echo test proves (`frontend/e2e/secrets.e2e.ts`).** A sentinel credential is built at run time and planted in an
HTTP Request node's Headers field. The test shows that the sentinel, its first 8 and its last 8 characters appear in **no
visible text, no hidden text (the whole `textContent`, which includes `hidden` and `display: none` text that `innerText` skips),
no element attribute (names or values), no form-control value and no console message** (all types, plus page errors) while the
indicators are showing, while the dialog is open, after Cancel, with the warning list open, after Export anyway, in the error
panel of an export that fails after the confirmation, and in the error panel of an import of the planted file that fails. The
one exception is the field the value was typed into (React also mirrors its value into that textarea's text, so that element is
left out of the text scan too); other tests prove that the exception is that narrow (the same scan fails when the sentinel is
planted in the workflow name input, or in a hidden span). Metadata, "55 medium keys before the credential", "60 high
findings in a node", "a credential-shaped key that makes the import fail" and "a duplicate key that straddles the cut" variants
check the same. **Echoed text (T9b second review).** An error message or path of an import or of a JSON setting can repeat a
key, an id, a type or a version of the file. The shared helpers `echoSafe(text, max, kind)` and `echoSafePointer(pointer, max)`
in `secrets.ts` run their test on the **FULL text before any cutting** (a cut can leave a prefix of a token that is no longer
credential-shaped) and return the fixed marker `(hidden: may contain a credential)` when the full text is credential-shaped;
for a KEY also when it is longer than 40 UTF-16 code units or longer than 12 characters with `=`, `:` or whitespace; for a JSON
Pointer when any of its keys is one that display paths redact (credential-shaped, longer than 40, or any `=`, `:` or
whitespace). Otherwise the text is cut as before. `strictJson`, `validate`, `nodeMigrations` and `migrate` route every
untrusted fragment of a message through them (duplicate keys, node and edge ids, types, versions, config setting names); the
import error panel shows messages and paths through them again. **Error codes and the structured `path` stay exact**; only the
DISPLAYED text is replaced. Unit tests check every prefix length 0 to 120 and several separators for "no 8 consecutive
characters of the token in any output". The marker differs on purpose from `[redacted name]`, which is only for node names.
**The file name** of an export (`downloadName`) falls back to `workflow.json` when the workflow name is credential-shaped:
workflow names are not scanned, but they never reach the file name when they look like a credential. Unit tests
(`secretReport.test.ts`) plant the sentinel in a header value, a nested value, an array item, a key, a label, a node id, a
long prompt, metadata and keys with `:` or `=`, and walk every string and key of the report. Source guards check that no UI
file under `app`, `nodes`, `config-panel` or `store` uses `console.`, `localStorage`, `sessionStorage`, `document.cookie` or
`dangerouslySetInnerHTML`.

**What it does not prove.** It does not cover a credential the detector does not recognise (the formats listed below). A node
**label** is shown on the node as the user typed it (labels are not scanned, and a label is the user's own text); only the
secret surfaces use `safeDisplayName`, and since the T9b review so does EVERY lint rule's message (the warning list, the config
panel's "Warnings for this node" and the badge title never quote a raw label or id). Display paths show short plain keys as
written, so a secret typed as a short plain KEY is shown (a documented limit above). The dialog lists at most 50 nodes with at
most 50 paths each; before this cap a 20,000-node import took about 60 seconds just to paint the dialog. Nothing here is a
server-side guarantee: **backend enforcement is separate (Phase 2, decision X10) and not
implemented**, and **no Python parity is claimed**. The file the user exports with "Export anyway" does contain the credential:
that is the user's explicit choice.

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
`@@NAME:n@@` (the length n of the part the shape counts; for `JWT` the length of each of the three parts; for the
special characters, the repeat count). **Anything shaped like `@@...@@` is a placeholder**: an unknown name, a lowercase
name, an empty name or a bad size fails the run, naming only the placeholder. Two keys that become one after
substitution also fail the run (a finding must not be hidden by a collision). The placeholder table:

| Placeholder | Default size | Builds | Matches shape |
|---|---|---|---|
| `@@SK@@` | 24 | `sk-` + n letters | `sk` |
| `@@SKANT@@` | 30 | `sk-ant-api03-` + n letters | `sk` |
| `@@GSK@@` | 24 | `gsk_` + n letters | `gsk` |
| `@@GHP@@`, `@@GHO@@` | 36 | `ghp_` or `gho_` + n letters | `gh` |
| `@@GHPAT@@` | 30 | `github_pat_` + n letters | `github_pat` |
| `@@AKIA@@` | 16 | `AKIA` + n uppercase letters | `akia` |
| `@@XOXA@@`, `@@XOXB@@`, `@@XOXP@@`, `@@XOXR@@`, `@@XOXS@@` | 12 | `xox<letter>-` + n digits | `xox` |
| `@@XOXZ@@` | 12 | `xoxz-` + n digits | none (a letter outside `a b p r s`) |
| `@@JWT@@` | 10 | `eyJ` + n letters, a dot, n letters, a dot, n letters | `jwt` |
| `@@JWT2@@` | 10 | the same with only two parts | none |
| `@@PEM@@` | (none) | the plain PRIVATE KEY header | `pem` |
| `@@PEMRSA@@` | (none) | the RSA PRIVATE KEY header | `pem` |
| `@@PEMPUBLIC@@` | (none) | a PUBLIC KEY header | none |
| `@@BEARER@@` | 24 | `Bearer ` + n letters | `bearer` |
| `@@FEFF@@`, `@@NEL@@`, `@@FS@@` | 1 | U+FEFF, U+0085, U+001C, repeated n times | (a character, not a token) |
| `@@E9@@` | 1 | U+00E9, repeated n times | (a character) |
| `@@EMOJI:n@@` | 1 | U+1F600, repeated n times (2 UTF-16 units each) | (a character) |

(The table above describes the **result**; the table in the runner builds each token by concatenating separate pieces, so
no source file holds a token-shaped literal.) A test checks that every placeholder in the table is used by at least one
fixture and that no fixture uses an unknown one.

**The repository-wide guard.** One test walks every **text file of the working tree** (the repository root; it skips
`node_modules`, `.git`, `dist`, `test-results`, `playwright-report`, `.kilo` and binary files), with a plain file walk and no
git subprocess, and fails on any match of these patterns, **with no boundary on purpose**: `gh[pousr]_` + 20 letters or
digits, `github_pat_` + 20, `gsk_` + 20, `sk-` + 20 token characters, `sk_live_`, `sk_test_` or `rk_live_` + 20, `AKIA` or
`ASIA` + 16 uppercase letters or digits, `xox[baprs]-` + 10, `AIza` + 35, `npm_` + 36, a JWT-like `eyJ` value, a PEM
private key header and `Bearer` + whitespace + 20 token characters. The failure message prints the file path, the line number and the
pattern name, **never the matched text**. A self-test builds a synthetic token for every pattern at run time. **Scope,
honestly:** it checks the files in the tree when the tests run; it does not cover git history, files outside the tree, or the
documents of future commits until they exist and the tests run again.

**Coverage guards** (in the runner): every credential shape is found by at least one positive fixture; every header name
and every medium key word appears in a positive fixture; every reason, both confidences and both locations are expected
somewhere; there are at least 12 negative fixtures; the family has a minimum count (`MIN_COUNTS.secrets`), never lowered.
The fixtures also document the **limits** as cases: a prompt that merely says "use a Bearer token here" (no finding),
`token_count: "5"` (a documented false positive), an unfamiliar header name (`Authorization-like`: a documented false
negative), a lowercase `bearer` (a documented false negative), base64 of a key (no finding), `OPENAI_API_KEY_` followed by
an `sk-` key (a documented false negative), and labels, names and descriptions (not scanned).

## Honest limits, in one place

- Heuristic. False positives: a harmless key such as `token_count`, an example key in a prompt. False negatives: an
  unfamiliar format, an obfuscated or encoded value, a credential under a header name not in the list, a lowercase
  `bearer` scheme, a credential in a JSON **string** that holds a header object as text, a credential typed into a label,
  a node id, a name or a description.
- **Formats that are NOT detected** (the list of shapes above is the whole list, approved by the Product Owner): Stripe
  `sk_live_` and `sk_test_` keys, Google `AIza` keys, npm tokens, SendGrid keys, Slack webhook URLs, AWS secret access
  keys, database URLs with a password, and any other format.
- **Known misses from the strict boundary:** `OPENAI_API_KEY_sk-...` and `key-sk-...` (an `sk-` key glued after an
  underscore or a hyphen) are not found; the distinctive prefixes after `_` or `-` are.
- It reads names and shapes, not meaning, and it never contacts a service to test a credential.
- It protects against **accidents**; it does not stop a determined user and is not a server-side control.
- The display path can show a short plain key that itself describes a secret; only credential-shaped, long and odd keys
  (`=`, `:`, whitespace) are redacted. The marker `[redacted key]` can also be a real key.
- Findings are capped at 50 high and 50 medium per node and for metadata; the rest is only counted. A high finding is never
  hidden by medium ones.
- TypeScript only; the Python runner is planned for Phase 2; backend enforcement is decision X10 and is not implemented.

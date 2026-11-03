# Canonical JSON and export JSON (two profiles)

AgentForge writes Workflow JSON as text in **two separate, deterministic profiles**. They share one
key ordering, one number format and one set of string escapes. They differ only in layout, and they
have different jobs.

| Profile | Function (TypeScript) | Layout | Used for |
|---|---|---|---|
| `canonical-json/1` | `canonicalCompact(value)` in `frontend/src/workflow/canonicalJson.ts` | Compact: no whitespace at all | **Hashing**, ETags, equality and no-op detection. Never shown to a person and never written to a file. |
| `export-json/1` | `exportPretty(value)` in the same file | Pretty, described below | The **only** form written to downloaded files. **Never hashed.** |

**Export is never used for hashing.** Hashing itself is **Phase 2** (SHA-256 of the compact UTF-8 bytes);
Phase 1.1 implements only the two text profiles. Nothing in the repository hashes yet.

## Status: tested in TypeScript only

Both profiles are implemented and tested in TypeScript. A Python implementation and a Python fixture
runner are **planned for Phase 2**. Until they exist and pass, **no parity between TypeScript and
Python is claimed**. The fixtures in `fixtures/serialization/` are written so a second implementation
can run them, nothing more.

## The rules, and where each one comes from

The source of every rule is stated so that an AgentForge policy is never mistaken for a standard.

| # | Rule | Source |
|---|---|---|
| 1 | Object keys are sorted at every level by **UTF-16 code unit order** (the default string comparison in JavaScript). This is not numeric order and not code point order: U+1F600 sorts **before** U+E000. | RFC 8785 (JCS) |
| 2 | Array order is preserved exactly. Objects inside arrays are sorted internally. | JSON semantics; RFC 8785 |
| 3 | Numbers are written with the ECMAScript number-to-string algorithm: shortest round-trip digits, `-0` writes `0`, `1.0` writes `1`, `1e2` writes `100`, `0.000001` stays decimal, `0.0000001` writes `1e-7`, `123e-20` writes `1.23e-18`. | RFC 8785 |
| 4 | Strings and keys escape only: the quote and the backslash (as backslash-quote and backslash-backslash); backspace, tab, line feed, form feed and carriage return as `\b \t \n \f \r`; every other control character below U+0020 as a six-character escape with **lowercase** hex digits. Everything else is written literally as UTF-8: the slash (never escaped), U+007F, U+2028, U+2029, U+FEFF, non-ASCII and astral characters. | RFC 8785 |
| 5 | Object member names must be unique. | I-JSON (RFC 7493), which JCS requires of its input. AgentForge enforces it **at parse time** (`doc.duplicate-key`). |
| 6 | Strings and keys must be valid Unicode: no unpaired surrogate. | I-JSON / JCS. Code `value.invalid-unicode`. |
| 7 | Numbers must be finite. | I-JSON. Code `value.not-finite`. |
| 8 | **The magnitude of every number must be at most 2^53 - 1** (9007199254740991). | **AgentForge policy**, not an RFC 8785 rule: it keeps TypeScript and Python in exact agreement and avoids silent precision loss. Code `value.unsafe-integer`. |
| 9 | **Strings and keys must not contain U+0000.** | **AgentForge / PostgreSQL `jsonb` compatibility rule.** It is **not** an RFC 8785 rule: PostgreSQL cannot store the NUL character. Code `value.nul-character`. |
| 10 | Nesting depth is at most **64**, with the root value at depth 1. | AgentForge policy (stack safety; Python and JavaScript recursion limits differ). Code `doc.too-deep`. |
| 11 | A document is at most **5,000,000 UTF-8 bytes**. | AgentForge policy. Code `doc.too-large`. |
| 12 | **No Unicode normalization.** Strings and keys are preserved exactly, so e-acute and `e` followed by U+0301 are different. | AgentForge policy. |

Rules 5 to 11 are about which values are accepted. The writers enforce the value rules
themselves (6 to 10) and **throw** an `Error` that names the problem and the JSON Pointer when given
a value that breaks them. They also refuse anything that is not JSON data: `undefined`, a function, a
symbol, a bigint, a non-plain object (Map, Set, Date, class instance), and a circular structure.
Only own enumerable string keys are written, and a key named `__proto__` is an ordinary key.

## How the text is written

The writers produce the text directly. They never rebuild an object and call `JSON.stringify` on it,
because a JavaScript object lists integer-like keys first (`10`, `9`, `a` becomes `9`, `10`, `a`), so
it cannot hold the code unit order of rule 1. The key array is sorted explicitly, and
`JSON.stringify` is used on **one string at a time** (a well-formed string produces exactly the
rule 4 escapes).

## Export layout (`export-json/1`)

- 2-space indentation, one level per nesting level.
- `": "` (a colon and one space) after an object key; no space before the colon.
- One array element or object member per line.
- Empty containers are written inline as `[]` and `{}`, also when nested.
- A `,` at the end of a line, never at the start of the next.
- LF (`\n`) line endings on every platform; no CR anywhere.
- **Exactly one** trailing LF at the end of the text; no trailing spaces on any line.

The compact profile is the same data with no layout characters and **no trailing LF**.

Example (a workflow, abbreviated). Note that the top-level keys are alphabetical, so `schemaVersion` is
the **last** member:

```
{
  "description": "",
  "edges": [],
  "id": "wf_1",
  "metadata": {},
  "name": "Empty",
  "nodes": [],
  "schemaVersion": "1.0"
}
```

## Guarantees (tested in TypeScript)

- `exportPretty(parse(exportPretty(x)))` equals `exportPretty(x)`.
- `canonicalCompact(parse(exportPretty(x)))` equals `canonicalCompact(x)`.
- Both outputs re-parse with the strict parser (`strictParse`) to the same data.
- Neither output contains a CR.
- Every valid workflow fixture satisfies the first two when imported and exported twice.

## The one-time export byte change

Phase 1 wrote the top level in a fixed order with `schemaVersion` first. `export-json/1` sorts every
level, so the exported **bytes change once**: the top level is now `description, edges, id,
metadata, name, nodes, schemaVersion` (`schemaVersion` is no longer first), and the keys inside every
node, edge, `config` and `metadata` are sorted too. A Phase 1 export still imports unchanged and is
re-exported in the new order. There is no `schemaVersion` bump: the document model did not change,
only the text layout.

## The export guard

The editor checks a workflow **before** it writes a file (`exportWorkflowText` in
`frontend/src/workflow/serialize.ts`): every string, key and number in the workflow (including the
workflow name and every node label) against rules 6 to 10, and the UTF-8 length of the resulting
text against rule 11. A violation is shown as an error with its code and JSON Pointer, and **no file
is created**. This is what makes the promise hold that a workflow the editor lets you export can
always be imported again.

## PostgreSQL `jsonb` (documentation only; not verified in this repository)

PostgreSQL is not installed here, so this is the expected behaviour that Phase 2 must confirm: key
order is not preserved, duplicate keys collapse, numbers are stored as `numeric` (`1.0` stays `1.0`,
`1e2` becomes `100`), the NUL character is not storable, and arrays keep their order. Database text
is therefore never the canonical form: **canonicalization runs on read.**

## Fixtures

`fixtures/serialization/` holds the cases (format and rules in `README.md`): arbitrary JSON text in,
the exact compact text and the exact export text out, or the single rejection `{ code, path }`. The
expectations are written by hand from the rules above, not generated by running the code.

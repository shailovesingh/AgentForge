import type { Workflow } from './types'

// Secret detector (decisions D-016, D-023; contracts/SECRETS.md). Pure, no React, no dependency.
// It looks for pasted credentials in node `config` and in `metadata`: every string value and every object key, at any depth.
// It is a HEURISTIC: it misses unfamiliar formats and flags harmless text. It reduces accidents; it is not a guarantee.
// NEVER ECHO: a finding carries a display path, never a value, never a piece or hash of a value, and a key that is
// credential-shaped, long, or holds `=`, `:` or whitespace is replaced by REDACTED_KEY in the path. Total for JSON-shaped
// input (own data properties; getters and proxies are out of scope).
// BOUNDED OUTPUT: at most MAX_FINDINGS_PER_SCAN findings are kept per node (and for metadata), each path is at most
// MAX_PATH_LENGTH characters; the rest is only counted (scanSecrets reports the omitted counts).

export type SecretConfidence = 'high' | 'medium'
export type SecretReason = 'header-name' | 'credential-shape' | 'key-name'

export interface SecretFinding {
  confidence: SecretConfidence
  location: 'config' | 'metadata'
  /** Set for location 'config' only. */
  nodeId?: string
  /** Display path inside the config or the metadata, such as `headers.Authorization` or `items[2].token`. Never a value. */
  path: string
  /** Why it matched. Never the matched text. */
  reason: SecretReason
}

/** The findings, and how many more were found but not kept (see MAX_FINDINGS_PER_SCAN). */
export interface SecretScan {
  findings: SecretFinding[]
  omitted: {
    /** Node id to the number of omitted config findings (only nodes with at least one). An upper bound: duplicates of a kept (path, reason) are counted. */
    perNode: Map<string, number>
    metadata: number
  }
}

/** Header names that are credentials by themselves (compared trimmed and lower-cased) when their value is a non-empty string. */
export const HEADER_NAMES: readonly string[] = ['authorization', 'proxy-authorization', 'cookie', 'x-api-key', 'api-key', 'x-auth-token', 'x-access-token']

/** An object key containing one of these (case-insensitive) with a non-empty string value is a medium finding. */
export const KEY_WORDS: readonly string[] = ['secret', 'password', 'passwd', 'token', 'apikey', 'api_key']

/** Shown in a path instead of a key that is credential-shaped, longer than MAX_KEY_LENGTH, or holds `=`, `:` or whitespace. */
export const REDACTED_KEY = '[redacted key]'
export const MAX_KEY_LENGTH = 40
/** Shown instead of a node name (a label or an id) that is credential-shaped. */
export const REDACTED_NAME = '[redacted name]'
export const MAX_NAME_LENGTH = 60
/** At most this many findings are kept per node (and for metadata); the rest are only counted. */
export const MAX_FINDINGS_PER_SCAN = 50
/** A display path is at most this long: a longer one is cut after the last whole step that leaves room for `...`, which is appended. */
export const MAX_PATH_LENGTH = 200

// Well-known credential shapes, searched ANYWHERE in a string (a prompt with a pasted key matches). Every length is an exact
// count, which matches the same strings as "n or more" (only existence matters) and keeps each attempt bounded; the JWT parts
// are the only open-ended runs, and their left boundary lets an attempt start only at the beginning of a run. No nested
// quantifiers: linear time (tested on 5,000,000-character strings).
// Left boundary: the generic shapes (sk-, jwt, Bearer) are not preceded by an ASCII letter, digit, `_` or `-`; the distinctive
// prefixes (gh?_, gsk_, github_pat_, AKIA, xox?-) are only not preceded by an ASCII letter or digit, so `NAME_ghp_...` is found.
export const CREDENTIAL_SHAPES: readonly { name: string; pattern: RegExp }[] = [
  { name: 'sk', pattern: /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20}/ },
  { name: 'gsk', pattern: /(?<![A-Za-z0-9])gsk_[A-Za-z0-9]{20}/ },
  { name: 'gh', pattern: /(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{36}/ },
  { name: 'github_pat', pattern: /(?<![A-Za-z0-9])github_pat_[A-Za-z0-9_]{22}/ },
  { name: 'akia', pattern: /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}/ },
  { name: 'xox', pattern: /(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{10}/ },
  { name: 'jwt', pattern: /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5}/ },
  { name: 'pem', pattern: /-----BEGIN[A-Z ]{0,30}PRIVATE KEY-----/ },
  { name: 'bearer', pattern: /(?<![A-Za-z0-9_-])Bearer\s+[A-Za-z0-9._~+/=-]{20}/ },
]

const HEADER_SET: ReadonlySet<string> = new Set(HEADER_NAMES)
const ODD_KEY = /[=:\s]/ // a secret typed INTO a key (`token: abc`, `password=x`), or text with spaces

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const MIN_SHAPE_LENGTH = 15 // the shortest shape is xox?- plus 10 characters; a shorter text cannot match, so skip the nine regexes
const isCredentialShaped = (text: string): boolean => text.length >= MIN_SHAPE_LENGTH && CREDENTIAL_SHAPES.some(({ pattern }) => pattern.test(text))

/**
 * A node label or id made safe to show next to a secret warning: `[redacted name]` when it is credential-shaped (any shape,
 * anywhere in it), otherwise the text cut to MAX_NAME_LENGTH characters with `...` appended when cut. Labels and ids are
 * not scanned for findings (contracts/SECRETS.md), so every surface that reports a secret must show them through this.
 */
export function safeDisplayName(text: string): string {
  if (isCredentialShaped(text)) return REDACTED_NAME
  if (text.length <= MAX_NAME_LENGTH) return text
  let cut = text.slice(0, MAX_NAME_LENGTH)
  const last = cut.charCodeAt(cut.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1) // never leave half a surrogate pair
  return cut + '...'
}

/** One step of the walk, linked to its parent so that a path is built only for a kept finding (a 200,000-level value stays cheap). */
interface Frame {
  value: unknown
  parent: Frame | null
  /** Display text of this step: the key (or REDACTED_KEY), or "[n]" for an array index. Empty for the root. */
  seg: string
  isIndex: boolean
  /** Set when the step is an object key: the key as written. */
  key?: string
  keyShaped?: boolean
}

/** The steps joined as `a.b[2].c`; cut after the last WHOLE step that fits in MAX_PATH_LENGTH, then `...` (never inside a step). */
function displayPath(frame: Frame): string {
  const parts: string[] = []
  for (let f: Frame | null = frame; f !== null && f.parent !== null; f = f.parent) parts.push(f.isIndex ? f.seg : '.' + f.seg)
  if (parts.length === 0) return ''
  parts.reverse()
  parts[0] = parts[0].slice(1) // the root is always an object, so the first step is a key and carries one leading dot to drop
  let total = 0
  for (const p of parts) total += p.length
  if (total <= MAX_PATH_LENGTH) return parts.join('')
  let out = ''
  for (const p of parts) {
    if (out.length + p.length > MAX_PATH_LENGTH - 3) break // room for the three dots, so the result is at most MAX_PATH_LENGTH
    out += p
  }
  return out + '...'
}

/**
 * Walks one config or metadata object with an explicit stack (no recursion). Findings come out in depth-first order, keys in
 * `Object.keys` order; for one key the reasons come in the order header-name, credential-shape, key-name. Keeps at most
 * MAX_FINDINGS_PER_SCAN findings and returns how many more it found (counted without building their paths).
 */
function scan(root: Record<string, unknown>, location: 'config' | 'metadata', nodeId: string | undefined, out: SecretFinding[]): number {
  const reported = new Set<string>() // one finding per distinct (path, reason) of this scan, over the kept findings
  let found = 0 // findings met so far, kept or not (a duplicate of a kept one counts: two long paths can be cut to the same text)
  let omitted = 0
  const emit = (f: Frame, confidence: SecretConfidence, reason: SecretReason) => {
    if (found >= MAX_FINDINGS_PER_SCAN) {
      omitted++ // no path string, no dedup key: this is what keeps a 120,000-finding file cheap
      return
    }
    found++
    const path = displayPath(f)
    const id = JSON.stringify([path, reason])
    if (reported.has(id)) return
    reported.add(id)
    out.push({ confidence, location, ...(nodeId === undefined ? {} : { nodeId }), path, reason })
  }

  const visited = new Set<object>() // a cycle or a shared sub-object is walked once (JSON-shaped input has neither)
  const stack: Frame[] = [{ value: root, parent: null, seg: '', isIndex: false }]
  while (stack.length > 0) {
    const f = stack.pop() as Frame
    const v = f.value
    const text = typeof v === 'string' ? v : undefined
    const keyed = f.key !== undefined
    const filled = text !== undefined && text.trim() !== ''

    // The medium finding is skipped for a key whose OWN value is already a high finding (not for a whole path).
    let high = false
    if (keyed && filled && HEADER_SET.has((f.key as string).trim().toLowerCase())) {
      emit(f, 'high', 'header-name')
      high = true
    }
    if (f.keyShaped === true || (text !== undefined && isCredentialShaped(text))) {
      emit(f, 'high', 'credential-shape')
      high = true
    }
    if (!high && keyed && filled) {
      const lower = (f.key as string).toLowerCase()
      if (KEY_WORDS.some((w) => lower.includes(w))) emit(f, 'medium', 'key-name')
    }

    if (typeof v !== 'object' || v === null || visited.has(v)) continue
    visited.add(v)
    // pushed in reverse so that they are popped in order
    if (Array.isArray(v)) {
      for (let i = v.length - 1; i >= 0; i--) stack.push({ value: v[i], parent: f, seg: `[${i}]`, isIndex: true })
    } else {
      const keys = Object.keys(v)
      for (let i = keys.length - 1; i >= 0; i--) {
        const key = keys[i]
        const keyShaped = isCredentialShaped(key)
        stack.push({
          value: (v as Record<string, unknown>)[key], // an own `__proto__` key is an own data property: this reads it
          parent: f,
          seg: keyShaped || key.length > MAX_KEY_LENGTH || ODD_KEY.test(key) ? REDACTED_KEY : key,
          isIndex: false,
          key,
          keyShaped,
        })
      }
    }
  }
  return omitted
}

/** The kept findings for ONE node's config (what lintWorkflow calls per node): at most MAX_FINDINGS_PER_SCAN. */
export function detectNodeSecrets(nodeId: string, config: Record<string, unknown>): SecretFinding[] {
  const out: SecretFinding[] = []
  scan(config, 'config', nodeId, out)
  return out
}

/**
 * The findings in `workflow` (at most MAX_FINDINGS_PER_SCAN per node and for metadata) and the counts that were left out:
 * nodes in array order (each node's config), then `metadata`. Not scanned: node labels, ids and types, edges, the workflow
 * id, name and description (contracts/SECRETS.md). Never throws for a JSON-shaped value; does not change its input.
 */
export function scanSecrets(workflow: Workflow): SecretScan {
  const doc: unknown = workflow
  const result: SecretScan = { findings: [], omitted: { perNode: new Map(), metadata: 0 } }
  if (!isRecord(doc)) return result
  if (Array.isArray(doc.nodes)) {
    for (const n of doc.nodes) {
      if (!isRecord(n) || typeof n.id !== 'string' || !isRecord(n.config)) continue
      const omitted = scan(n.config, 'config', n.id, result.findings)
      if (omitted > 0) result.omitted.perNode.set(n.id, (result.omitted.perNode.get(n.id) ?? 0) + omitted)
    }
  }
  if (isRecord(doc.metadata)) result.omitted.metadata = scan(doc.metadata, 'metadata', undefined, result.findings)
  return result
}

/** The kept findings of `scanSecrets`. */
export function detectSecrets(workflow: Workflow): SecretFinding[] {
  return scanSecrets(workflow).findings
}

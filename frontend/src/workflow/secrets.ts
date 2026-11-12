import type { Workflow } from './types'

// Secret detector (decisions D-016, D-023; contracts/SECRETS.md). Pure, no React, no dependency.
// It looks for pasted credentials in node `config` and in `metadata`: every string value and every object key, at any depth.
// It is a HEURISTIC: it misses unfamiliar formats and flags harmless text. It reduces accidents; it is not a guarantee.
// NEVER ECHO: a finding carries a display path, never a value, never a piece or hash of a value, and a credential-shaped key
// is replaced by REDACTED_KEY in the path. Total for JSON-shaped input (own data properties; getters and proxies are out of scope).

export type SecretConfidence = 'high' | 'medium'
export type SecretReason = 'header-name' | 'credential-shape' | 'key-name'

export interface SecretFinding {
  confidence: SecretConfidence
  location: 'config' | 'metadata'
  /** Set for location 'config' only. */
  nodeId?: string
  /** Display path inside config or metadata, such as `headers.Authorization` or `items[2].token`. Never a value. */
  path: string
  /** Why it matched. Never the matched text. */
  reason: SecretReason
}

/** Header names that are credentials by themselves (compared trimmed and lower-cased) when their value is a non-empty string. */
export const HEADER_NAMES: readonly string[] = ['authorization', 'proxy-authorization', 'cookie', 'x-api-key', 'api-key', 'x-auth-token', 'x-access-token']

/** An object key containing one of these (case-insensitive) with a non-empty string value is a medium finding. */
export const KEY_WORDS: readonly string[] = ['secret', 'password', 'passwd', 'token', 'apikey', 'api_key']

/** Shown in a path instead of a key that is credential-shaped or longer than MAX_KEY_LENGTH. */
export const REDACTED_KEY = '[redacted key]'
export const MAX_KEY_LENGTH = 40

// Well-known credential shapes, searched ANYWHERE in a string (a prompt with a pasted key matches). The left boundary keeps
// "task-..." from matching as "sk-...". Every length is an exact count, which matches the same strings as "n or more" (only
// existence matters) and keeps each attempt bounded; the JWT parts are the only open-ended runs, and the left boundary lets
// an attempt start only at the beginning of a run. No nested quantifiers: linear time (tested on 5,000,000-character strings).
export const CREDENTIAL_SHAPES: readonly { name: string; pattern: RegExp }[] = [
  { name: 'sk', pattern: /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20}/ },
  { name: 'gsk', pattern: /(?<![A-Za-z0-9_-])gsk_[A-Za-z0-9]{20}/ },
  { name: 'ghp', pattern: /(?<![A-Za-z0-9_-])ghp_[A-Za-z0-9]{36}/ },
  { name: 'github_pat', pattern: /(?<![A-Za-z0-9_-])github_pat_[A-Za-z0-9_]{22}/ },
  { name: 'akia', pattern: /(?<![A-Za-z0-9_-])AKIA[0-9A-Z]{16}/ },
  { name: 'xox', pattern: /(?<![A-Za-z0-9_-])xox[baprs]-[A-Za-z0-9-]{10}/ },
  { name: 'jwt', pattern: /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5}/ },
  { name: 'pem', pattern: /-----BEGIN[A-Z ]{0,30}PRIVATE KEY-----/ },
  { name: 'bearer', pattern: /(?<![A-Za-z0-9_-])Bearer\s+[A-Za-z0-9._~+/=-]{20}/ },
]

const HEADER_SET: ReadonlySet<string> = new Set(HEADER_NAMES)

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isCredentialShaped = (text: string): boolean => CREDENTIAL_SHAPES.some(({ pattern }) => pattern.test(text))

/** One step of the walk, linked to its parent so that a path is built only for a finding (a 200,000-level value stays cheap). */
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

function displayPath(frame: Frame): string {
  const parts: string[] = []
  for (let f: Frame | null = frame; f !== null && f.parent !== null; f = f.parent) parts.push(f.isIndex ? f.seg : '.' + f.seg)
  // the root is always an object, so the first step is a key and carries one leading dot to drop
  return parts.reverse().join('').slice(1)
}

/**
 * Walks one config or metadata object with an explicit stack (no recursion). Findings come out in depth-first order, keys in
 * `Object.keys` order; for one path the reasons come in the order header-name, credential-shape, key-name.
 */
function scan(root: Record<string, unknown>, location: 'config' | 'metadata', nodeId: string | undefined, out: SecretFinding[]): void {
  const reported = new Set<string>() // one finding per distinct (path, reason) of this scan
  const emit = (f: Frame, confidence: SecretConfidence, reason: SecretReason) => {
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
          seg: keyShaped || key.length > MAX_KEY_LENGTH ? REDACTED_KEY : key,
          isIndex: false,
          key,
          keyShaped,
        })
      }
    }
  }
}

/** The findings for ONE node's config (what lintWorkflow calls per node). */
export function detectNodeSecrets(nodeId: string, config: Record<string, unknown>): SecretFinding[] {
  const out: SecretFinding[] = []
  scan(config, 'config', nodeId, out)
  return out
}

/**
 * Every finding in `workflow`: the nodes in array order (each node's config), then `metadata`. Not scanned: node labels, the
 * workflow name and description (contracts/SECRETS.md). Never throws for a JSON-shaped value; does not change its input.
 */
export function detectSecrets(workflow: Workflow): SecretFinding[] {
  const doc: unknown = workflow
  const out: SecretFinding[] = []
  if (!isRecord(doc)) return out
  if (Array.isArray(doc.nodes)) {
    for (const n of doc.nodes) if (isRecord(n) && typeof n.id === 'string' && isRecord(n.config)) scan(n.config, 'config', n.id, out)
  }
  if (isRecord(doc.metadata)) scan(doc.metadata, 'metadata', undefined, out)
  return out
}

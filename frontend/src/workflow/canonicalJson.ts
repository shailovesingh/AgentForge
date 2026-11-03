// The two deterministic JSON text profiles (docs/PHASE1_1_PLAN.md section 3.5, contracts/CANONICAL_JSON.md).
//
//   canonical-json/1  canonicalCompact(): no whitespace. The ONLY form meant for hashing, ETags and
//                     equality. (Hashing itself is Phase 2; nothing here hashes.)
//   export-json/1     exportPretty(): the same ordering, number text and string escapes, laid out for
//                     people. The only form written to downloaded files. It is NEVER hashed.
//
// Both write the TEXT directly. They never rebuild an object and call JSON.stringify on it, because a
// JavaScript object lists integer-like keys first ("10", "9" become 9, 10) and so cannot hold the
// UTF-16 code unit order that RFC 8785 requires. Tested in TypeScript only: no Python parity is claimed.

import { jsonPointer } from './errors'
import { MAX_DEPTH, MAX_SAFE_MAGNITUDE, POLICY_MESSAGES, stringProblem } from './valuePolicy'

/**
 * Writes `value` as JSON text. Throws an Error that names the problem and the JSON Pointer when the
 * value is not valid JSON data under the AgentForge policy.
 */
function write(value: unknown, pretty: boolean): string {
  const out: string[] = []
  const ancestors = new Set<object>() // containers currently being written: a repeat is a cycle

  const fail = (what: string, path: (string | number)[]): never => {
    throw new Error(`Cannot write JSON: ${what} at ${path.length === 0 ? 'the root value' : jsonPointer(...path)}`)
  }
  // JSON.stringify on a single well-formed string produces exactly the JCS escapes: \" \\ \b \t \n \f \r,
  // other C0 controls as a six-character escape with lowercase hex, everything else (U+007F, U+2028, U+2029, non-ASCII) literal.
  // Lone surrogates and NUL are refused before it is called, so it never sees an ill-formed string.
  const text = (s: string, path: (string | number)[]): string => {
    const problem = stringProblem(s)
    if (problem) fail(`the string ${POLICY_MESSAGES[problem]}`, path)
    return JSON.stringify(s)
  }

  const walk = (v: unknown, parentDepth: number, path: (string | number)[]) => {
    switch (typeof v) {
      case 'string':
        out.push(text(v, path))
        return
      case 'number':
        if (!Number.isFinite(v)) fail(`a number that is not finite (${String(v)})`, path)
        if (Math.abs(v) > MAX_SAFE_MAGNITUDE) fail(`a number ${POLICY_MESSAGES['value.unsafe-integer']}`, path)
        out.push(String(v)) // ECMAScript number-to-string: shortest round trip, and -0 writes 0
        return
      case 'boolean':
        out.push(v ? 'true' : 'false')
        return
      case 'object':
        if (v === null) {
          out.push('null')
          return
        }
        break
      default:
        return fail(`a value of type ${typeof v}, which is not JSON data`, path)
    }

    const isArray = Array.isArray(v)
    if (!isArray) {
      const proto: unknown = Object.getPrototypeOf(v)
      if (proto !== Object.prototype && proto !== null) fail('an object that is not a plain object (a Map, Set, Date or class instance)', path)
    }
    if (ancestors.has(v)) fail('a circular structure', path)
    const depth = parentDepth + 1
    if (depth > MAX_DEPTH) fail(`a value ${POLICY_MESSAGES['doc.too-deep']}`, path)

    const open = isArray ? '[' : '{'
    const close = isArray ? ']' : '}'
    // Own keys, sorted by the default string comparison = UTF-16 code unit order. Not Object.keys order.
    const keys = isArray ? null : Object.keys(v).sort()
    const length = keys ? keys.length : (v as unknown[]).length
    if (length === 0) {
      out.push(open + close) // empty containers are written inline in both profiles
      return
    }
    const inner = pretty ? '\n' + '  '.repeat(depth) : ''
    ancestors.add(v)
    out.push(open)
    for (let i = 0; i < length; i++) {
      out.push(i === 0 ? inner : ',' + inner)
      if (keys) {
        const key = keys[i]
        out.push(text(key, [...path, key]), pretty ? ': ' : ':')
        walk((v as Record<string, unknown>)[key], depth, [...path, key])
      } else {
        walk((v as unknown[])[i], depth, [...path, i])
      }
    }
    ancestors.delete(v)
    out.push((pretty ? '\n' + '  '.repeat(depth - 1) : '') + close)
  }

  walk(value, 0, [])
  return out.join('')
}

/** Profile `canonical-json/1`: compact, sorted, deterministic. For hashing and equality; never for files or display. */
export function canonicalCompact(value: unknown): string {
  return write(value, false)
}

/** Profile `export-json/1`: 2-space indent, LF, exactly one trailing LF. For files; NEVER for hashing. */
export function exportPretty(value: unknown): string {
  return write(value, true) + '\n'
}

// Strict RFC 8259 JSON parser for untrusted import text (docs/PHASE1_1_PLAN.md section 3.5).
// It is used instead of the built-in parser, which silently keeps the last duplicate key and has
// already lost information by the time a number reaches our code. It returns the FIRST problem only.
//
// Beyond the grammar it enforces the AgentForge policy (see valuePolicy.ts): duplicate keys
// (compared after escapes are decoded), nesting depth 64 with the root at depth 1, no U+0000, no
// lone surrogates, and numbers of magnitude at most 2^53 - 1. Those are AgentForge rules, not RFC
// rules. Objects get own data properties via defineProperty, so a key named "__proto__" is an
// ordinary key and never changes a prototype.

import { jsonPointer } from './errors'
import type { ErrorCode, ValidationError } from './errors'
import { MAX_DEPTH, MAX_SAFE_MAGNITUDE, POLICY_MESSAGES, stringProblem } from './valuePolicy'
import type { PolicyCode } from './valuePolicy'

export type StrictParseResult = { ok: true; value: unknown } | { ok: false; error: ValidationError }

// 2^53. Written as text because the whole point is to compare number TOKENS as text.
const TWO_POW_53 = '9007199254740992'

/**
 * Decides, from the number token's text alone, whether the number is allowed. The range check uses
 * digit strings (no JavaScript number conversion). The conversion happens only afterwards: to tell
 * "beyond the double range" from "unsafe integer", and as a backstop for tokens just below 2^53
 * whose nearest double is 2^53 (for example 9007199254740991.7). The token must be valid JSON.
 */
export function classifyNumber(token: string): 'ok' | 'value.unsafe-integer' | 'value.not-finite' {
  const eAt = token.search(/[eE]/)
  const mantissa = eAt < 0 ? token : token.slice(0, eAt)
  const expText = eAt < 0 ? '0' : token.slice(eAt + 1)
  const dot = mantissa.indexOf('.')
  const intPart = (dot < 0 ? mantissa : mantissa.slice(0, dot)).replace('-', '')
  const fracPart = dot < 0 ? '' : mantissa.slice(dot + 1)

  // value = digits * 10^e10, where digits is the integer and fraction digits without the point.
  const digits = intPart + fracPart
  let first = 0
  while (first < digits.length && digits[first] === '0') first++
  if (first === digits.length) return 'ok' // zero in any spelling (0, -0, 0.0e5)

  // An absurd exponent text is capped: it dwarfs any digit count, so the verdict cannot change.
  const expDigits = expText.replace(/^[+-]/, '').replace(/^0+/, '')
  const expAbs = expDigits.length > 9 ? 1e9 : Number(expDigits || '0')
  const e10 = (expText.startsWith('-') ? -expAbs : expAbs) - fracPart.length
  // value is in [10^(mag-1), 10^mag): mag is the number of digits of its integer part.
  const mag = digits.length - first + e10

  let atLeast2Pow53: boolean
  if (mag >= 17) atLeast2Pow53 = true // at least 10^16, which is above 2^53
  else if (mag === 16) atLeast2Pow53 = digits.slice(first, first + 16).padEnd(16, '0') >= TWO_POW_53
  else atLeast2Pow53 = false // below 10^15

  const converted = Number(token)
  if (atLeast2Pow53) return Number.isFinite(converted) ? 'value.unsafe-integer' : 'value.not-finite'
  return Math.abs(converted) > MAX_SAFE_MAGNITUDE ? 'value.unsafe-integer' : 'ok'
}

// Internal: thrown to unwind the recursion on the first problem, always caught in strictParse.
class Stop extends Error {
  problem: ValidationError
  constructor(problem: ValidationError) {
    super(problem.message)
    this.problem = problem
  }
}

const isDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9'
const isHex = (c: string | undefined): boolean => c !== undefined && /^[0-9a-fA-F]$/.test(c)
const ESCAPES: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }

/** Parses JSON text strictly. Never throws: every failure is returned as one ValidationError. */
export function strictParse(text: string): StrictParseResult {
  let pos = 0
  const path: (string | number)[] = []

  const stop = (code: ErrorCode, message: string, at: (string | number)[]): never => {
    throw new Stop({ code, path: jsonPointer(...at), message })
  }
  const syntax = (reason: string, at = pos): never => stop('doc.not-json', `Not valid JSON: ${reason} at position ${at}`, [])
  const policy = (code: PolicyCode): never => stop(code, `Value ${POLICY_MESSAGES[code]}.`, path)
  const describe = (c: string): string => `unexpected character ${JSON.stringify(c)}`

  const skipWhitespace = () => {
    while (pos < text.length) {
      const c = text[pos]
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') pos++
      else break
    }
  }

  // Decodes a string literal. The caller checks the decoded text against the string policy once the
  // path of the string (or of the member, for a key) is known.
  const parseString = (): string => {
    pos++ // opening quote
    let out = ''
    let chunk = pos
    for (;;) {
      if (pos >= text.length) syntax('unterminated string', pos)
      const c = text.charCodeAt(pos)
      if (c === 0x22) {
        out += text.slice(chunk, pos)
        pos++
        return out
      }
      if (c < 0x20) syntax(`raw control character U+${c.toString(16).toUpperCase().padStart(4, '0')} in string`)
      if (c !== 0x5c) {
        pos++
        continue
      }
      out += text.slice(chunk, pos)
      const e = text[pos + 1]
      if (e === 'u') {
        for (let k = 2; k <= 5; k++) if (!isHex(text[pos + k])) syntax('invalid \\u escape', pos)
        out += String.fromCharCode(parseInt(text.slice(pos + 2, pos + 6), 16))
        pos += 6
      } else if (e !== undefined && Object.hasOwn(ESCAPES, e)) {
        out += ESCAPES[e]
        pos += 2
      } else syntax('invalid escape sequence', pos)
      chunk = pos
    }
  }

  const checkString = (s: string) => {
    const problem = stringProblem(s)
    if (problem) policy(problem)
  }

  const parseNumber = (): number => {
    const start = pos
    if (text[pos] === '-') pos++
    if (text[pos] === '0') {
      pos++
      if (isDigit(text[pos])) syntax('leading zeros are not allowed in numbers', start)
    } else if (isDigit(text[pos])) {
      while (isDigit(text[pos])) pos++
    } else syntax('invalid number')
    if (text[pos] === '.') {
      pos++
      if (!isDigit(text[pos])) syntax('digits expected after the decimal point')
      while (isDigit(text[pos])) pos++
    }
    if (text[pos] === 'e' || text[pos] === 'E') {
      pos++
      if (text[pos] === '+' || text[pos] === '-') pos++
      if (!isDigit(text[pos])) syntax('digits expected in the exponent')
      while (isDigit(text[pos])) pos++
    }
    const token = text.slice(start, pos)
    const verdict = classifyNumber(token) // decided from the token text, before any use of the number
    if (verdict !== 'ok') policy(verdict)
    return Number(token)
  }

  const parseValue = (depth: number): unknown => {
    skipWhitespace()
    const c = text[pos]
    if (c === undefined) return syntax('unexpected end of input')
    if (c === '{') return parseObject(depth)
    if (c === '[') return parseArray(depth)
    if (c === '"') {
      const s = parseString()
      checkString(s)
      return s
    }
    if (c === '-' || isDigit(c)) return parseNumber()
    for (const [word, value] of [['true', true], ['false', false], ['null', null]] as const) {
      if (text.startsWith(word, pos)) {
        pos += word.length
        return value
      }
    }
    return syntax(describe(c))
  }

  // A container opening one level deeper than the limit is rejected before anything inside it is read.
  const enter = (depth: number) => {
    if (depth > MAX_DEPTH) policy('doc.too-deep')
  }

  const parseArray = (depth: number): unknown[] => {
    enter(depth)
    pos++ // [
    const out: unknown[] = []
    skipWhitespace()
    if (text[pos] === ']') {
      pos++
      return out
    }
    for (;;) {
      path.push(out.length)
      out.push(parseValue(depth + 1))
      path.pop()
      skipWhitespace()
      const c = text[pos]
      if (c === ',') pos++
      else if (c === ']') {
        pos++
        return out
      } else return syntax(c === undefined ? 'unexpected end of input' : `expected "," or "]" but found ${JSON.stringify(c)}`)
    }
  }

  const parseObject = (depth: number): Record<string, unknown> => {
    enter(depth)
    pos++ // {
    const out: Record<string, unknown> = {}
    const seen = new Set<string>() // keys after escape decoding
    skipWhitespace()
    if (text[pos] === '}') {
      pos++
      return out
    }
    for (;;) {
      skipWhitespace()
      if (text[pos] !== '"') {
        return syntax(text[pos] === undefined ? 'unexpected end of input' : `expected a string key but found ${JSON.stringify(text[pos])}`)
      }
      const key = parseString()
      path.push(key)
      checkString(key)
      if (seen.has(key)) stop('doc.duplicate-key', `Duplicate object key ${JSON.stringify(key)}.`, path)
      seen.add(key)
      skipWhitespace()
      if (text[pos] !== ':') {
        return syntax(text[pos] === undefined ? 'unexpected end of input' : `expected ":" but found ${JSON.stringify(text[pos])}`)
      }
      pos++
      const value = parseValue(depth + 1)
      path.pop()
      Object.defineProperty(out, key, { value, writable: true, enumerable: true, configurable: true })
      skipWhitespace()
      const c = text[pos]
      if (c === ',') pos++
      else if (c === '}') {
        pos++
        return out
      } else return syntax(c === undefined ? 'unexpected end of input' : `expected "," or "}" but found ${JSON.stringify(c)}`)
    }
  }

  try {
    const value = parseValue(1)
    skipWhitespace()
    if (pos < text.length) syntax('unexpected data after the end of the value')
    return { ok: true, value }
  } catch (e) {
    if (e instanceof Stop) return { ok: false, error: e.problem }
    const reason = e instanceof Error ? e.message : String(e)
    return { ok: false, error: { code: 'doc.not-json', path: '', message: `Not valid JSON: ${reason} at position ${pos}` } }
  }
}

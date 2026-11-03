import { describe, expect, test } from 'vitest'
import { ERROR_CODES } from './errors'
import { classifyNumber, strictParse } from './strictJson'

const parse = (text: string) => strictParse(text)
const value = (text: string): unknown => {
  const r = parse(text)
  if (!r.ok) throw new Error(`expected ${JSON.stringify(text)} to parse, got ${r.error.code}: ${r.error.message}`)
  return r.value
}
const error = (text: string) => {
  const r = parse(text)
  if (r.ok) throw new Error(`expected ${JSON.stringify(text)} to fail`)
  return r.error
}

describe('grammar: accepted', () => {
  test.each([
    'null',
    'true',
    'false',
    '0',
    '-0',
    '1E+2',
    '1e-2',
    '-12.5e3',
    '""',
    '"a\\"b\\\\c\\/d\\b\\f\\n\\r\\t"',
    '"\\u00e9\\u00E9"',
    '[]',
    '{}',
    ' \t\r\n [ 1 , 2 ] \n',
    '{"a":[1,{"b":null}],"c":"x"}',
    '{"":1}',
    '"\u2028\u2029\u007f\uffff\ufeff"',
  ])('%s parses like the built-in parser', (text) => {
    expect(value(text)).toEqual(JSON.parse(text))
  })

  test('-0 stays negative zero, like the built-in parser', () => {
    expect(Object.is(value('-0'), -0)).toBe(true)
  })
})

describe('grammar: rejected with doc.not-json, path "" and a position', () => {
  test.each([
    ['NaN', 0],
    ['Infinity', 0],
    ['-Infinity', 1],
    ['undefined', 0],
    ["'a'", 0],
    ['// c\n1', 0],
    ['/* c */ 1', 0],
    ['01', 0],
    ['-01', 0],
    ['+1', 0],
    ['.5', 0],
    ['1.', 2],
    ['1.e3', 2],
    ['1e', 2],
    ['1e+', 3],
    ['0x10', 1],
    ['--1', 1],
    ['-', 1],
    ['[1,]', 3],
    ['{"a":1,}', 7],
    ['[1 2]', 3],
    ['[1', 2],
    ['{"a" 1}', 5],
    ['{"a":1 "b":2}', 7],
    ['{1:2}', 1],
    ['{"a"', 4],
    ['1 2', 2],
    ['{}x', 2],
    ['', 0],
    ['   ', 3],
    ['\u00a01', 0],
    ['tru', 0],
    ['nul', 0],
    ['[', 1],
    ['"abc', 4],
    ['"a\tb"', 2],
    ['"\\x"', 1],
    ['"\\u12"', 1],
    ['"\\u12G4"', 1],
    ['"\\', 1],
  ])('%j', (text, position) => {
    const e = error(text)
    expect(e.code).toBe('doc.not-json')
    expect(e.path).toBe('')
    expect(e.message).toMatch(/^Not valid JSON: /)
    expect(e.message).toMatch(new RegExp(`at position ${position}$`))
  })

  test('a raw NUL character in a string is a grammar error (control character), not value.nul-character', () => {
    expect(error('"a\u0000b"').code).toBe('doc.not-json')
  })
})

describe('duplicate keys', () => {
  test.each([
    ['{"a":1,"a":2}', '/a'],
    ['{"x":{"a":1,"a":2}}', '/x/a'],
    ['[{"a":1},{"a":1,"a":2}]', '/1/a'],
    ['{"a":1,"\\u0061":2}', '/a'],
    ['{"\\u0061":1,"a":2}', '/a'],
    ['{"\\u00e9":1,"\u00e9":2}', '/\u00e9'],
    ['{"__proto__":1,"__proto__":2}', '/__proto__'],
    ['{"k":1,"k":2,"k":3}', '/k'],
    ['{"k":1,"k":"s"}', '/k'],
    ['{"a/b":1,"a/b":2}', '/a~1b'],
    ['{"a~b":1,"a~b":2}', '/a~0b'],
    ['{"n":{"a":{"b":1,"c":2,"b":3}}}', '/n/a/b'],
  ])('%j is doc.duplicate-key at the second occurrence %s', (text, path) => {
    expect(error(text)).toMatchObject({ code: 'doc.duplicate-key', path })
  })

  test('the same key in sibling objects, and keys that differ by case, are fine', () => {
    expect(value('{"a":{"k":1},"b":{"k":2},"k":3,"K":4}')).toEqual({ a: { k: 1 }, b: { k: 2 }, k: 3, K: 4 })
    expect(value('[{"k":1},{"k":2}]')).toEqual([{ k: 1 }, { k: 2 }])
  })

  test('e and e + combining accent are different keys (no normalization)', () => {
    expect(Object.keys(value('{"e\u0301":1,"\u00e9":2}') as object)).toHaveLength(2)
  })
})

describe('depth limit: 64 with the root at depth 1', () => {
  const arrays = (n: number) => '['.repeat(n) + ']'.repeat(n)
  const objects = (n: number) => '{"a":'.repeat(n - 1) + '{}' + '}'.repeat(n - 1)

  test('64 nested arrays and 64 nested objects are accepted', () => {
    expect(parse(arrays(64)).ok).toBe(true)
    expect(parse(objects(64)).ok).toBe(true)
  })

  test('65 nested arrays are rejected at the 65th, with its pointer', () => {
    expect(error(arrays(65))).toMatchObject({ code: 'doc.too-deep', path: '/0'.repeat(64) })
  })

  test('65 nested objects are rejected at the 65th, with its pointer', () => {
    expect(error(objects(65))).toMatchObject({ code: 'doc.too-deep', path: '/a'.repeat(64) })
  })

  test('only containers count: a scalar inside 64 arrays is fine', () => {
    expect(parse('['.repeat(64) + '1' + ']'.repeat(64)).ok).toBe(true)
  })

  test('mixed nesting counts both kinds', () => {
    expect(parse('[{"a":'.repeat(32) + '1' + '}]'.repeat(32)).ok).toBe(true) // 64 containers
    expect(error('[{"a":'.repeat(32) + '[]' + '}]'.repeat(32)).code).toBe('doc.too-deep') // 65
  })

  test('absurd nesting is rejected at the 65th level without recursing (no stack overflow)', () => {
    expect(error('['.repeat(200_000)).code).toBe('doc.too-deep')
  })

  test('an empty array or object at depth 65 is also too deep', () => {
    expect(error('['.repeat(64) + '[]' + ']'.repeat(64)).code).toBe('doc.too-deep')
  })
})

describe('string policy', () => {
  test.each([
    ['"\\u0000"', '', 'value.nul-character'],
    ['"a\\u0000b"', '', 'value.nul-character'],
    ['{"k":"\\u0000"}', '/k', 'value.nul-character'],
    ['{"a\\u0000":1}', '/a\u0000', 'value.nul-character'],
    ['["x","\\ud800"]', '/1', 'value.invalid-unicode'],
    ['["x","\\udc00"]', '/1', 'value.invalid-unicode'],
    ['["x","\\udc00\\ud800"]', '/1', 'value.invalid-unicode'],
    ['["\\ud800a"]', '/0', 'value.invalid-unicode'],
    ['["a\\ud800"]', '/0', 'value.invalid-unicode'],
    ['["\\ud83d\\ud83d\\ude00"]', '/0', 'value.invalid-unicode'],
    ['{"\\ud800":1}', '/\ud800', 'value.invalid-unicode'],
    ['"\ud800"', '', 'value.invalid-unicode'], // a lone surrogate present literally in the text
    ['"\udc00"', '', 'value.invalid-unicode'],
  ])('%j -> %s %s', (text, path, code) => {
    expect(error(text)).toMatchObject({ code, path })
  })

  test('a surrogate pair written as two escapes, or literally, is accepted', () => {
    expect(value('"\\ud83d\\ude00"')).toBe('\u{1f600}')
    expect(value('"\u{1f600}"')).toBe('\u{1f600}')
    expect(value('"\\ud83d\u{de00}"')).toBe('\u{1f600}') // high escape + literal low half joins into a pair
  })

  test('NUL is checked after decoding, whichever way it is spelled', () => {
    expect(error('"\\u0000"').code).toBe('value.nul-character')
    expect(error('"\\u0000\\ud800"').code).toBe('value.nul-character') // first problem in order
    expect(error('"\\ud800\\u0000"').code).toBe('value.invalid-unicode')
  })
})

describe('numbers', () => {
  const accepted: [string, number][] = [
    ['0', 0],
    ['-0', -0],
    ['0.0e5', 0],
    ['1e2', 100],
    ['1E2', 100],
    ['1e+2', 100],
    ['0.1e1', 1],
    ['0.1', 0.1],
    ['100.5', 100.5],
    ['0.30000000000000004', 0.30000000000000004],
    ['0.000001', 0.000001],
    ['0.0000001', 1e-7],
    ['1e-7', 1e-7],
    ['1.5e-7', 1.5e-7],
    ['123e-20', 123e-20],
    ['5e-324', 5e-324],
    ['1e-400', 0],
    ['9007199254740991', 9007199254740991],
    ['-9007199254740991', -9007199254740991],
    ['9007199254740991.0', 9007199254740991],
    ['90071992547409.91e2', 9007199254740991],
    ['9007199254740.991e3', 9007199254740991],
    ['9e15', 9e15],
    ['0.00000000000000000000009007199254740991e38', 9007199254740991],
    ['1e-999999999999999999999', 0],
    ['0e999999999999999999999', 0],
    ['0.' + '0'.repeat(100_000) + '1', 0],
  ]
  for (const [token, expected] of accepted) {
    test(`${token.slice(0, 40)} is accepted`, () => {
      const text = `[${token}]`
      expect(parse(text).ok).toBe(true)
      expect((value(text) as number[])[0]).toBe(expected)
    })
  }

  const rejected: [string, 'value.unsafe-integer' | 'value.not-finite'][] = [
    ['9007199254740992', 'value.unsafe-integer'],
    ['9007199254740993', 'value.unsafe-integer'],
    ['-9007199254740992', 'value.unsafe-integer'],
    ['9007199254740992.0', 'value.unsafe-integer'],
    ['9007199254740991.7', 'value.unsafe-integer'], // below 2^53 as text, but its nearest double is 2^53
    ['9007199254740991.5', 'value.unsafe-integer'], // a tie, which rounds to the even neighbour 2^53
    ['90071992547409920e-1', 'value.unsafe-integer'],
    ['1e16', 'value.unsafe-integer'],
    ['1e21', 'value.unsafe-integer'],
    ['1e22', 'value.unsafe-integer'],
    ['123456789012345680000', 'value.unsafe-integer'],
    ['1.7976931348623157e308', 'value.unsafe-integer'],
    ['1e400', 'value.not-finite'],
    ['-1e400', 'value.not-finite'],
    ['1.8e308', 'value.not-finite'],
    ['1e999999999999999999999', 'value.not-finite'],
    ['1' + '0'.repeat(1_000_000), 'value.not-finite'],
    ['9'.repeat(400), 'value.not-finite'],
  ]
  for (const [token, code] of rejected) {
    test(`${token.slice(0, 40)} is rejected as ${code}`, () => {
      expect(error(`[${token}]`)).toMatchObject({ code, path: '/0' })
    })
  }

  test('classifyNumber verdicts around 2^53, including tokens that only round to it', () => {
    // 2^53 + 1 converts to 2^53; only the digits can tell it from a number that merely rounds there.
    expect(classifyNumber('9007199254740993')).toBe('value.unsafe-integer')
    expect(classifyNumber('9007199254740991.7')).toBe('value.unsafe-integer')
    expect(classifyNumber('9007199254740991.3')).toBe('ok') // rounds to 2^53 - 1: within the limit
    expect(classifyNumber('0.5')).toBe('ok') // fractions are numbers too; isSafeInteger would wrongly refuse this
  })

  test('the path points at the number inside nested containers', () => {
    expect(error('{"nodes":[{"position":{"x":1e21}}]}')).toMatchObject({
      code: 'value.unsafe-integer',
      path: '/nodes/0/position/x',
    })
  })
})

describe('objects are built safely', () => {
  test('__proto__ is an ordinary own property and never changes a prototype', () => {
    const v = value('{"__proto__":{"polluted":true},"a":1}') as Record<string, unknown>
    expect(Object.getPrototypeOf(v)).toBe(Object.prototype)
    expect(Object.hasOwn(v, '__proto__')).toBe(true)
    expect(Object.keys(v)).toEqual(['__proto__', 'a'])
    expect((v as { polluted?: boolean }).polluted).toBeUndefined()
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
    expect(Object.getOwnPropertyDescriptor(v, '__proto__')?.value).toEqual({ polluted: true })
  })

  test('a nested __proto__ and keys named like Object.prototype members are plain keys', () => {
    const v = value('{"a":{"__proto__":[1],"constructor":2,"toString":3,"hasOwnProperty":4}}') as {
      a: Record<string, unknown>
    }
    expect(Object.getPrototypeOf(v.a)).toBe(Object.prototype)
    expect(Object.keys(v.a)).toEqual(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])
  })

  test('integer-like keys are ordered like the built-in parser orders them', () => {
    const text = '{"b":1,"10":2,"9":3,"a":4,"1":5}'
    expect(Object.keys(value(text) as object)).toEqual(Object.keys(JSON.parse(text)))
  })

  test('arrays are plain arrays', () => {
    expect(Array.isArray(value('[1,[2]]'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Differential test against the built-in parser (valid, duplicate-free input with safe numbers)
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const KEY_POOL = ['a', 'b', 'k', '', '0', '7', '10', '__proto__', 'constructor', 'toString', 'a/b', 'a~b', 'é', 'e\u0301', '\u{1f600}', '\ue000', 'quote"', 'back\\slash', 'tab\t', 'line\n', '\u0001', '\u2028']
const STRING_POOL = ['', 'plain', 'é', '\u{1f600}', 'a"b', 'a\\b', 'a/b', 'tab\t', 'nl\n', '\u0001\u001f', '\u007f', '\u2028\u2029', '\ufeff', '\uffff', 'x'.repeat(40)]

function generate(rand: () => number, depth: number): unknown {
  const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)]
  const kind = rand() * (depth >= 5 ? 5 : 7)
  if (kind < 1) return null
  if (kind < 2) return rand() < 0.5
  if (kind < 3) return pick(STRING_POOL)
  if (kind < 4) {
    const shape = Math.floor(rand() * 4)
    if (shape === 0) return Math.floor(rand() * 2 ** 32) - 2 ** 31
    if (shape === 1) return Math.trunc((rand() * 2 - 1) * Number.MAX_SAFE_INTEGER)
    if (shape === 2) return (rand() - 0.5) * 10 ** Math.floor(rand() * 12 - 6)
    return pick([0, -0, 1e-7, 5e-324, 123e-20, 0.1, 1e21 / 1e10, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER])
  }
  if (kind < 5) return pick(STRING_POOL)
  if (kind < 6) return Array.from({ length: Math.floor(rand() * 5) }, () => generate(rand, depth + 1))
  const obj: Record<string, unknown> = {}
  const count = Math.floor(rand() * 6)
  for (let i = 0; i < count; i++) {
    const key = pick(KEY_POOL)
    if (Object.hasOwn(obj, key)) continue // no duplicate keys
    Object.defineProperty(obj, key, { value: generate(rand, depth + 1), writable: true, enumerable: true, configurable: true })
  }
  return obj
}

/** Deep structural equality that distinguishes -0 from 0 and own "__proto__" keys from prototypes. */
function same(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Object.is(a, b)
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return a === b
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every(
    (k, i) =>
      k === kb[i] &&
      same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]) &&
      Object.hasOwn(b, k),
  )
}

describe('differential test against the built-in parser', () => {
  test('400 seeded random documents parse to exactly what JSON.parse returns', () => {
    const rand = mulberry32(20261104)
    for (let i = 0; i < 400; i++) {
      const doc = generate(rand, 0)
      const indent = [undefined, 2, '\t'][i % 3]
      const text = JSON.stringify(doc, null, indent)
      const r = parse(text)
      if (!r.ok) throw new Error(`document ${i} failed: ${r.error.code} ${r.error.message}\n${text}`)
      expect(same(r.value, JSON.parse(text)), `document ${i}: ${text}`).toBe(true)
    }
  })

  test('hand-spelled number tokens give the same numbers as the built-in parser', () => {
    for (const token of ['1E2', '1e+2', '1.50', '0.1e1', '-0.0', '12e-3', '4.35', '1.5e-7', '5e-324', '2.2250738585072014e-308', '9007199254740991']) {
      const r = parse(`[${token}]`)
      expect(r.ok && same(r.value, JSON.parse(`[${token}]`)), token).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Never throws
// ---------------------------------------------------------------------------

describe('never throws', () => {
  const KNOWN = new Set<string>(ERROR_CODES)
  const sample =
    ' {"schemaVersion":"1.0","name":"caf\\u00e9 \\ud83d\\ude80 \u00e9","list":[1,-2.5e-3,true,false,null,{"k":[]}],"o":{"a":{"b":"c"}},"n":0}\n'

  test('every prefix of a valid document either parses or returns a structured error', () => {
    expect(parse(sample).ok).toBe(true)
    for (let i = 0; i < sample.length; i++) {
      const r = parse(sample.slice(0, i))
      if (r.ok) continue
      expect(KNOWN.has(r.error.code), sample.slice(0, i)).toBe(true)
      expect(r.error.message).not.toBe('')
      expect(r.error.path === '' || r.error.path.startsWith('/')).toBe(true)
    }
  })

  test('a truncated object is never accepted', () => {
    const compact = JSON.stringify(JSON.parse(sample))
    for (let i = 0; i < compact.length; i++) expect(parse(compact.slice(0, i)).ok, compact.slice(0, i)).toBe(false)
  })

  test('random garbage built from JSON-ish characters never throws', () => {
    const rand = mulberry32(7)
    const alphabet = ['{', '}', '[', ']', ',', ':', '"', '\\', 'u', '0', '1', '9', '-', '+', '.', 'e', 'E', ' ', 'a', 'n', 't', 'f', '\n', '\u0000', '\ud800', '\u00e9']
    for (let i = 0; i < 2000; i++) {
      const text = Array.from({ length: Math.floor(rand() * 30) }, () => alphabet[Math.floor(rand() * alphabet.length)]).join('')
      const r = parse(text)
      if (!r.ok) expect(KNOWN.has(r.error.code), text).toBe(true)
    }
  })
})

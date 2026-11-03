import { describe, expect, test } from 'vitest'
import { canonicalCompact, exportPretty } from './canonicalJson'
import { strictParse } from './strictJson'
import { MAX_SAFE_MAGNITUDE } from './valuePolicy'

// Special characters are built at run time: this file holds no backslash-u escape and no invisible character.
const BS = String.fromCharCode(92)
const ch = (...codes: number[]) => String.fromCodePoint(...codes)
const EMOJI = ch(0x1f600)
const E000 = ch(0xe000)
const COMB = ch(0x301)

const parse = (text: string): unknown => {
  const r = strictParse(text)
  if (!r.ok) throw new Error(`strictParse failed: ${r.error.message}`)
  return r.value
}
const both = (value: unknown): [string, string] => [canonicalCompact(value), exportPretty(value)]

describe('canonicalCompact: keys', () => {
  test('sorted by UTF-16 code unit order, not numerically and not by code point', () => {
    expect(canonicalCompact(parse('{"10":1,"9":2,"1":3,"01":4,"-1":5,"1.5":6}'))).toBe('{"-1":5,"01":4,"1":3,"1.5":6,"10":1,"9":2}')
    expect(canonicalCompact({ a: 1, B: 2 })).toBe('{"B":2,"a":1}')
    expect(canonicalCompact({ b: 1, ab: 2, a: 3 })).toBe('{"a":3,"ab":2,"b":1}')
    expect(canonicalCompact({ a: 1, '': 0 })).toBe('{"":0,"a":1}')
    // U+1F600 is the surrogate pair D83D DE00, which sorts BEFORE U+E000 in UTF-16 order (and after it by code point).
    expect(canonicalCompact({ [E000]: 1, [EMOJI]: 2 })).toBe(`{"${EMOJI}":2,"${E000}":1}`)
    expect(canonicalCompact({ [ch(0xe9)]: 1, z: 2 })).toBe(`{"z":2,"${ch(0xe9)}":1}`)
  })

  test('arrays keep their order, objects inside them are sorted, at every depth', () => {
    expect(canonicalCompact([{ b: 1, a: 2 }, 3, 1, 2, { d: { z: 1, y: 2 }, c: [{ q: 1, p: 2 }] }])).toBe(
      '[{"a":2,"b":1},3,1,2,{"c":[{"p":2,"q":1}],"d":{"y":2,"z":1}}]',
    )
  })

  test('the written order does not depend on the order the keys were inserted', () => {
    const forward = { a: 1, b: 2, '10': 3, '9': 4 }
    const backward = { '9': 4, '10': 3, b: 2, a: 1 }
    expect(canonicalCompact(forward)).toBe(canonicalCompact(backward))
  })

  test('__proto__, constructor and friends are ordinary keys', () => {
    const value = parse('{"toString":1,"constructor":2,"__proto__":{"b":1,"a":2},"hasOwnProperty":4}')
    expect(canonicalCompact(value)).toBe('{"__proto__":{"a":2,"b":1},"constructor":2,"hasOwnProperty":4,"toString":1}')
  })

  test('no Unicode normalization: e + U+0301 and the precomposed e-acute are two keys and two values', () => {
    const nfd = 'e' + COMB
    const nfc = ch(0xe9)
    expect(canonicalCompact({ [nfc]: 1, [nfd]: 2 })).toBe(`{"${nfd}":2,"${nfc}":1}`)
    expect(canonicalCompact([nfd, nfc])).toBe(`["${nfd}","${nfc}"]`)
  })

  test('only own enumerable string keys are written; Object.create(null) is plain data', () => {
    const sym = Symbol('hidden')
    expect(canonicalCompact({ a: 1, [sym]: 2 })).toBe('{"a":1}')
    const bare = Object.create(null) as Record<string, unknown>
    bare.b = 1
    bare.a = 2
    expect(canonicalCompact(bare)).toBe('{"a":2,"b":1}')
  })
})

describe('canonicalCompact: numbers', () => {
  test.each([
    [0, '0'],
    [-0, '0'],
    [1, '1'],
    [100, '100'],
    [100.5, '100.5'],
    [0.1 + 0.2, '0.30000000000000004'],
    [4.35, '4.35'],
    [0.00001, '0.00001'],
    [0.000001, '0.000001'],
    [0.0000001, '1e-7'],
    [1.5e-7, '1.5e-7'],
    [123e-20, '1.23e-18'],
    [2.5e-5, '0.000025'],
    [5e-324, '5e-324'],
    [-1e-7, '-1e-7'],
    [1e15, '1000000000000000'],
    [MAX_SAFE_MAGNITUDE, '9007199254740991'],
    [-MAX_SAFE_MAGNITUDE, '-9007199254740991'],
  ])('%j is written as %s', (value, text) => {
    expect(canonicalCompact(value)).toBe(text)
    expect(exportPretty(value)).toBe(text + '\n')
  })
})

describe('canonicalCompact: strings and keys', () => {
  test('only the JCS escapes are used', () => {
    const controls = ch(8, 9, 10, 12, 13)
    expect(canonicalCompact(controls)).toBe(`"${BS}b${BS}t${BS}n${BS}f${BS}r"`)
    expect(canonicalCompact('"' + BS)).toBe(`"${BS}"${BS}${BS}"`)
    // other C0 controls: a six-character escape with LOWERCASE hex
    expect(canonicalCompact(ch(1, 0x1f, 0x1b, 0x0b))).toBe(`"${BS}u0001${BS}u001f${BS}u001b${BS}u000b"`)
  })

  test('everything else is literal: slash, DEL, U+2028, U+2029, U+FEFF, non-ASCII, astral characters', () => {
    for (const s of ['a/b', ch(0x7f), ch(0x2028), ch(0x2029), ch(0xfeff), ch(0xffff), ch(0x85), 'caf' + ch(0xe9), EMOJI, ch(0x65e5)]) {
      expect(canonicalCompact(s), JSON.stringify(s)).toBe(`"${s}"`)
    }
    // The same rules apply to keys.
    expect(canonicalCompact({ [ch(0x2028)]: 1, [`a${BS}b`]: 2, 'a"b': 3 })).toBe(`{"a${BS}"b":3,"a${BS}${BS}b":2,"${ch(0x2028)}":1}`)
  })

  test('keys use the same escapes as values and are sorted by code unit', () => {
    expect(canonicalCompact({ 'a"b': 1, [`a${BS}b`]: 2, 'a b': 3, a: 4 })).toBe(`{"a":4,"a b":3,"a${BS}"b":1,"a${BS}${BS}b":2}`)
    expect(canonicalCompact({ ['x' + ch(10) + 'y']: 1 })).toBe(`{"x${BS}ny":1}`)
  })

  test('a surrogate pair is written as the one literal character', () => {
    expect(canonicalCompact(String.fromCharCode(0xd83d, 0xde00))).toBe(`"${EMOJI}"`)
  })
})

describe('exportPretty: layout', () => {
  test('exact text: 2 spaces, ": " after keys, one member per line, trailing comma at line end, one trailing LF', () => {
    expect(exportPretty({ b: [1, 'x', null, true], a: { d: {}, c: [] } })).toBe(
      ['{', '  "a": {', '    "c": [],', '    "d": {}', '  },', '  "b": [', '    1,', '    "x",', '    null,', '    true', '  ]', '}', ''].join('\n'),
    )
  })

  test('empty containers are inline in both profiles', () => {
    expect(exportPretty({})).toBe('{}\n')
    expect(exportPretty([])).toBe('[]\n')
    expect(exportPretty({ a: [[]], b: { c: {} } })).toBe(
      ['{', '  "a": [', '    []', '  ],', '  "b": {', '    "c": {}', '  }', '}', ''].join('\n'),
    )
    expect(canonicalCompact({ a: [[]], b: { c: {} } })).toBe('{"a":[[]],"b":{"c":{}}}')
  })

  test('indentation grows two spaces per level', () => {
    expect(exportPretty([[[1]]])).toBe(['[', '  [', '    [', '      1', '    ]', '  ]', ']', ''].join('\n'))
  })

  test('scalars at the root get exactly one trailing LF', () => {
    expect(exportPretty('x')).toBe('"x"\n')
    expect(exportPretty(null)).toBe('null\n')
    expect(exportPretty(false)).toBe('false\n')
  })

  test('a string containing a newline stays on one line (escaped), so there is no CR and no stray LF', () => {
    const text = exportPretty({ s: 'a\r\nb\nc' })
    expect(text).toBe(`{\n  "s": "a${BS}r${BS}nb${BS}nc"\n}\n`)
    expect(text.includes('\r')).toBe(false)
  })

  test('no trailing spaces on any line, LF only, exactly one trailing LF', () => {
    const text = exportPretty({ a: [1, { b: [], c: {} }, [2]], d: 'x y ' })
    expect(text).not.toMatch(/ \n/)
    expect(text.includes('\r')).toBe(false)
    expect(text.endsWith('\n')).toBe(true)
    expect(text.endsWith('\n\n')).toBe(false)
  })

  test('the compact profile has no whitespace outside strings and no trailing LF', () => {
    const text = canonicalCompact({ a: [1, { b: [], c: {} }, [2]], d: 'x y ' })
    expect(text).toBe('{"a":[1,{"b":[],"c":{}},[2]],"d":"x y "}')
  })
})

describe('the two profiles agree', () => {
  const sample = parse('{"z":[1.0,{"b":1e2,"a":"é"}],"10":{"y":null},"9":true,"m":-0}')

  test('export(parse(export(x))) is export(x), and canonical(parse(export(x))) is canonical(x)', () => {
    const exported = exportPretty(sample)
    expect(exportPretty(parse(exported))).toBe(exported)
    expect(canonicalCompact(parse(exported))).toBe(canonicalCompact(sample))
    expect(canonicalCompact(parse(canonicalCompact(sample)))).toBe(canonicalCompact(sample))
  })

  test('both outputs re-parse with the strict parser to the same data', () => {
    const [compact, pretty] = both(sample)
    expect(parse(compact)).toEqual(parse(pretty))
    expect(compact.includes('\r') || pretty.includes('\r')).toBe(false)
  })

  test('the profiles differ only in whitespace', () => {
    const [compact, pretty] = both(sample)
    expect(pretty.replace(/\n */g, '').replace(': ', ':').replaceAll('": ', '":')).toBe(compact)
  })
})

describe('values that are not valid JSON data are refused, naming the problem and the JSON Pointer', () => {
  const lone = String.fromCharCode(0xd800)
  const nul = ch(0)
  const nested = (levels: number): unknown => {
    let v: unknown = []
    for (let i = 1; i < levels; i++) v = [v]
    return v
  }
  class Thing {
    a = 1
  }
  const cyclic: Record<string, unknown> = { name: 'loop' }
  cyclic.self = cyclic
  const a: Record<string, unknown> = {}
  const b: Record<string, unknown> = { a }
  a.b = b

  const cases: [string, unknown, RegExp][] = [
    ['undefined at the root', undefined, /undefined.*the root value/],
    ['undefined in an object', { x: { y: undefined } }, /undefined.*\/x\/y/],
    ['undefined in an array', [1, undefined], /undefined.*\/1/],
    ['a hole in a sparse array', [1, , 3], /undefined.*\/1/], // eslint-disable-line no-sparse-arrays
    ['a function', { f: () => 1 }, /function.*\/f/],
    ['a symbol', { s: Symbol('x') }, /symbol.*\/s/],
    ['a bigint', [1n], /bigint.*\/0/],
    ['a Map', { m: new Map() }, /not a plain object.*\/m/],
    ['a Set', [new Set()], /not a plain object.*\/0/],
    ['a Date', { d: new Date(0) }, /not a plain object.*\/d/],
    ['a class instance', { t: new Thing() }, /not a plain object.*\/t/],
    ['an object with an inherited prototype', Object.create({ inherited: 1 }), /not a plain object/],
    ['NaN', { n: NaN }, /not finite.*\/n/],
    ['Infinity', [Infinity], /not finite.*\/0/],
    ['-Infinity', [-Infinity], /not finite/],
    ['2^53', { n: 2 ** 53 }, /outside the supported range.*\/n/],
    ['-(2^53)', -(2 ** 53), /outside the supported range/],
    ['1e21', [1e21], /outside the supported range/],
    ['Number.MAX_VALUE', Number.MAX_VALUE, /outside the supported range/],
    ['NUL in a string', { s: 'a' + nul }, /NUL.*\/s/],
    ['NUL in a key', { ['k' + nul]: 1 }, /NUL/],
    ['a lone high surrogate in a string', ['x', lone], /unpaired surrogate.*\/1/],
    ['a lone low surrogate in a key', { [String.fromCharCode(0xdc00)]: 1 }, /unpaired surrogate/],
    ['nesting of 65 levels', nested(65), /nested more than 64 levels/],
    ['a self-referencing object', cyclic, /circular.*\/self/],
    ['a cycle through two objects', a, /circular/],
  ]

  test.each(cases)('%s', (_label, value, message) => {
    expect(() => canonicalCompact(value)).toThrow(message)
    expect(() => exportPretty(value)).toThrow(message)
  })

  test('the error is an Error with a readable prefix', () => {
    expect(() => canonicalCompact({ x: NaN })).toThrow(Error)
    expect(() => canonicalCompact({ x: NaN })).toThrow(/^Cannot write JSON: /)
  })

  test('depth: 64 levels (root = 1) are written, 65 are refused, and absurd nesting is refused without overflowing the stack', () => {
    expect(canonicalCompact(nested(64))).toBe('['.repeat(63) + '[]' + ']'.repeat(63))
    expect(() => canonicalCompact(nested(65))).toThrow(/nested more than 64 levels/)
    expect(() => exportPretty(nested(100_000))).toThrow(/nested more than 64 levels/)
  })

  test('the same object used twice (not a cycle) is fine', () => {
    const shared = { k: 1 }
    expect(canonicalCompact({ a: shared, b: [shared, shared] })).toBe('{"a":{"k":1},"b":[{"k":1},{"k":1}]}')
  })
})

// ---------------------------------------------------------------------------
// A seeded property test against an independent reference writer.
// ---------------------------------------------------------------------------

// mulberry32: a tiny seeded generator, so a failure is reproducible.
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Awkward characters on purpose: integer-like text, quotes, controls, U+2028, an astral character,
// U+E000, U+FFFF, DEL, a combining mark.
const ALPHABET = ['a', 'b', 'B', 'z', '0', '1', '9', '-', '.', ' ', '"', BS, '/', ch(1), ch(0x1f), ch(0x7f), ch(0x2028), ch(0xe9), COMB, ch(0xe000), ch(0xffff), EMOJI, ch(0x65e5)]

function randomString(r: () => number): string {
  const n = Math.floor(r() * 5)
  let s = ''
  for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(r() * ALPHABET.length)]
  return s
}

function randomNumber(r: () => number): number {
  switch (Math.floor(r() * 5)) {
    case 0:
      return Math.floor((r() - 0.5) * 2 * MAX_SAFE_MAGNITUDE)
    case 1:
      return Math.floor(r() * 2000) - 1000
    case 2:
      return (r() - 0.5) * 10 ** (Math.floor(r() * 30) - 15) // spans the 1e-7 exponent threshold and large magnitudes
    case 3:
      return Math.round(r() * 1e6) / 1e3
    default:
      return 0.1 * Math.floor(r() * 30)
  }
}

function randomValue(r: () => number, depth: number): unknown {
  const kind = Math.floor(r() * (depth >= 4 ? 5 : 7))
  switch (kind) {
    case 0:
      return null
    case 1:
      return r() < 0.5
    case 2:
    case 3:
      return randomNumber(r)
    case 4:
      return randomString(r)
    case 5:
      return Array.from({ length: Math.floor(r() * 4) }, () => randomValue(r, depth + 1))
    default: {
      const o: Record<string, unknown> = {}
      const n = Math.floor(r() * 5)
      for (let i = 0; i < n; i++) {
        // defineProperty so a generated key such as "__proto__" is an ordinary own key
        Object.defineProperty(o, randomString(r), { value: randomValue(r, depth + 1), writable: true, enumerable: true, configurable: true })
      }
      return o
    }
  }
}

// The reference orders keys with an explicit loop over UTF-16 code units (a different mechanism from the
// default string comparison used by the implementation) and writes strings with its own escape table.
function compareUnits(x: string, y: string): number {
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x.charCodeAt(i) - y.charCodeAt(i)
    if (d !== 0) return d
  }
  return x.length - y.length
}

function referenceCompact(v: unknown): string {
  if (v === null) return 'null'
  if (typeof v === 'boolean') return String(v)
  if (typeof v === 'number') return Object.is(v, -0) ? '0' : String(v)
  if (typeof v === 'string') return referenceString(v)
  if (Array.isArray(v)) return '[' + v.map(referenceCompact).join(',') + ']'
  const o = v as Record<string, unknown>
  const keys = Object.keys(o).sort(compareUnits)
  return '{' + keys.map((k) => referenceString(k) + ':' + referenceCompact(o[k])).join(',') + '}'
}

function referenceString(s: string): string {
  let out = '"'
  for (const c of s) {
    const code = c.codePointAt(0)!
    if (c === '"') out += BS + '"'
    else if (c === BS) out += BS + BS
    else if (code === 8) out += BS + 'b'
    else if (code === 9) out += BS + 't'
    else if (code === 10) out += BS + 'n'
    else if (code === 12) out += BS + 'f'
    else if (code === 13) out += BS + 'r'
    else if (code < 0x20) out += BS + 'u' + code.toString(16).padStart(4, '0')
    else out += c
  }
  return out + '"'
}

describe('property test over seeded random JSON-like values', () => {
  test('canonicalCompact matches the reference writer, round-trips through the strict parser and is stable', () => {
    const r = rng(20261104)
    let withIntegerLikeKeys = 0
    for (let i = 0; i < 1500; i++) {
      const v = randomValue(r, 0)
      const compact = canonicalCompact(v)
      expect(compact, `case ${i}`).toBe(referenceCompact(v))
      const parsed = parse(compact)
      expect(parsed, `case ${i}`).toEqual(v)
      expect(canonicalCompact(parsed), `case ${i}: not stable`).toBe(compact)
      if (/\{"\d/.test(compact)) withIntegerLikeKeys++
    }
    expect(withIntegerLikeKeys, 'the generator must produce integer-like keys').toBeGreaterThan(20)
  })

  test('exportPretty round-trips, is idempotent and has the same canonical form', () => {
    const r = rng(7)
    for (let i = 0; i < 1500; i++) {
      const v = randomValue(r, 0)
      const pretty = exportPretty(v)
      expect(pretty.includes('\r'), `case ${i}`).toBe(false)
      expect(pretty.endsWith('\n') && !pretty.endsWith('\n\n'), `case ${i}`).toBe(true)
      const parsed = parse(pretty)
      expect(parsed, `case ${i}`).toEqual(v)
      expect(exportPretty(parsed), `case ${i}: not idempotent`).toBe(pretty)
      expect(canonicalCompact(parsed), `case ${i}`).toBe(canonicalCompact(v))
    }
  })
})

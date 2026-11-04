import { describe, expect, test } from 'vitest'
import { ERROR_CODES } from './errors'
import { applyDefaults, checkSchemaSubset, enumEquals, validateAgainstSchema } from './jsonSchema'
import type { JsonSchema, ObjectSchema } from './jsonSchema'

const EMOJI = String.fromCodePoint(0x1f600) // one code point, two UTF-16 units
const codes = (schema: JsonSchema, value: unknown, checkRequired = false) =>
  validateAgainstSchema(schema, value, { checkRequired }).map((e) => `${e.code}@${e.path}`)
const obj = (properties: Record<string, JsonSchema>, extra: Partial<Omit<JsonSchema, 'type'>> = {}): ObjectSchema => ({ type: 'object', properties, ...extra })

// ---------------------------------------------------------------------------
// Deterministic unit tests
// ---------------------------------------------------------------------------

describe('validateAgainstSchema', () => {
  test('the emoji is one code point but two UTF-16 units', () => {
    expect(EMOJI.length).toBe(2)
    expect([...EMOJI].length).toBe(1)
    expect(codes({ type: 'string', maxLength: 1 }, EMOJI)).toEqual([])
    expect(codes({ type: 'string', maxLength: 1 }, EMOJI + EMOJI)).toEqual(['schema.maxLength@'])
  })

  test('integers: 1.0 and -0 are valid; 1.5, 2^53, NaN, Infinity and strings are not', () => {
    const integer: JsonSchema = { type: 'integer' }
    for (const ok of [1.0, -0, 0, -5, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]) expect(codes(integer, ok), String(ok)).toEqual([])
    for (const bad of [1.5, 2 ** 53, -(2 ** 53), NaN, Infinity, '1', null, true]) expect(codes(integer, bad), String(bad)).toEqual(['schema.type@'])
  })

  test('number rejects NaN and Infinity', () => {
    for (const bad of [NaN, Infinity, -Infinity]) expect(codes({ type: 'number' }, bad)).toEqual(['schema.type@'])
  })

  test('a wrong type reports schema.type only', () => {
    expect(codes({ type: 'number', enum: [1], minimum: 5 }, 'x')).toEqual(['schema.type@'])
    expect(codes(obj({ a: { type: 'string' } }, { required: ['a'], additionalProperties: false }), [], true)).toEqual(['schema.type@'])
  })

  test('checkRequired is honored; undefined and non-own keys count as absent', () => {
    const schema = obj({ a: { type: 'string' } }, { required: ['a'] })
    expect(codes(schema, {}, true)).toEqual(['schema.required@/a'])
    expect(codes(schema, {}, false)).toEqual([])
    expect(codes(schema, { a: undefined }, true)).toContain('schema.required@/a')
    expect(codes(schema, Object.create({ a: 'inherited' }), true)).toEqual(['schema.required@/a'])
    expect(codes(schema, { a: 'x' }, true)).toEqual([])
  })

  test('errors come required first, then keys in Object.keys order, then list indexes ascending', () => {
    const schema = obj({ a: { type: 'array', items: { type: 'integer' } }, b: { type: 'string' }, c: { type: 'string' } }, { required: ['c', 'b'], additionalProperties: false })
    expect(codes(schema, { z: 1, a: [1.5, 2, 'x'] }, true)).toEqual([
      'schema.required@/c',
      'schema.required@/b',
      'schema.additionalProperties@/z',
      'schema.type@/a/0',
      'schema.type@/a/2',
    ])
  })

  test('paths escape ~ and /', () => {
    expect(codes(obj({}, { additionalProperties: false }), { 'a/b~c': 1 })).toEqual(['schema.additionalProperties@/a~1b~0c'])
  })

  test('additionalProperties: absent and true accept, false rejects, a schema validates', () => {
    const value = { x: 'text' }
    expect(codes(obj({}), value)).toEqual([])
    expect(codes(obj({}, { additionalProperties: true }), value)).toEqual([])
    expect(codes(obj({}, { additionalProperties: false }), value)).toEqual(['schema.additionalProperties@/x'])
    expect(codes(obj({}, { additionalProperties: { type: 'number' } }), value)).toEqual(['schema.type@/x'])
  })

  test('enum uses strict equality', () => {
    expect(codes({ type: 'number', enum: [1, 2] }, 2)).toEqual([])
    expect(codes({ type: 'number', enum: [1, 2] }, 3)).toEqual(['schema.enum@'])
    expect(codes({ type: 'boolean', enum: [true] }, false)).toEqual(['schema.enum@'])
  })

  test('does not mutate its inputs and does not apply defaults', () => {
    const schema = obj({ a: { type: 'string', default: 'x' } }, { required: ['a'] })
    const value = {}
    codes(schema, value, true)
    expect(value).toEqual({})
    expect(codes(schema, {}, true)).toEqual(['schema.required@/a']) // a default does not satisfy required
  })
})

describe('prototype-like keys are unknown keys (own-property lookups)', () => {
  const strict = obj({ a: { type: 'string' } }, { additionalProperties: false })

  test.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf'])('own key %s', (key) => {
    const value = JSON.parse(`{${JSON.stringify(key)}: 1}`)
    expect(codes(strict, value)).toEqual([`schema.additionalProperties@/${key}`])
    // without additionalProperties: false it is accepted and NOT validated by an inherited member
    expect(codes(obj({ a: { type: 'string' } }), value)).toEqual([])
  })

  test('own __proto__ key (a JSON parser creates it as an own key)', () => {
    const value = JSON.parse('{"__proto__": {"a": 1}}')
    expect(Object.hasOwn(value, '__proto__')).toBe(true)
    expect(codes(strict, value)).toEqual(['schema.additionalProperties@/__proto__'])
    expect(codes(obj({ a: { type: 'string' } }), value)).toEqual([])
  })

  test('a property literally named __proto__ in the schema is a normal property', () => {
    const properties = JSON.parse('{"__proto__": {"type": "string"}}') as Record<string, JsonSchema>
    expect(codes({ type: 'object', properties }, JSON.parse('{"__proto__": 5}'))).toEqual(['schema.type@/__proto__'])
  })

  test('required constructor is absent unless it is an own key', () => {
    const schema = obj(JSON.parse('{"constructor":{"type":"string"}}') as Record<string, JsonSchema>, { required: ['constructor'] })
    expect(codes(schema, {}, true)).toEqual(['schema.required@/constructor'])
    expect(codes(schema, JSON.parse('{"constructor":"x"}'), true)).toEqual([])
  })
})

describe('applyDefaults', () => {
  const deepFreeze = <T>(v: T): T => {
    if (typeof v === 'object' && v !== null) {
      Object.freeze(v)
      for (const child of Object.values(v)) deepFreeze(child)
    }
    return v
  }

  test('puts a copy of each default, in schema order, and nothing else', () => {
    const schema = obj({ z: { type: 'string', default: 'z' }, a: { type: 'integer' }, m: { type: 'boolean', default: false } }, { required: ['a'] })
    const result = applyDefaults(schema)
    expect(result).toEqual({ z: 'z', m: false })
    expect(Object.keys(result)).toEqual(['z', 'm'])
  })

  test('never mutates the schema (works on a frozen schema)', () => {
    const schema = deepFreeze(obj({ o: { type: 'object', default: { k: [1, 2] } } }))
    expect(() => applyDefaults(schema)).not.toThrow()
  })

  test('returns a fresh object whose nested defaults are copies, not the schema objects', () => {
    const inner = { k: [1, 2] }
    const schema = obj({ o: { type: 'object', default: inner } })
    const first = applyDefaults(schema)
    const second = applyDefaults(schema)
    expect(first).not.toBe(second)
    expect(first.o).not.toBe(inner)
    expect(first.o).not.toBe(second.o)
    ;(first.o as { k: number[] }).k.push(3)
    expect(inner).toEqual({ k: [1, 2] })
    expect(applyDefaults(schema).o).toEqual({ k: [1, 2] })
  })

  test('no recursion: a nested default is not applied without an explicit default on its parent', () => {
    expect(applyDefaults(obj({ o: obj({ inner: { type: 'string', default: 'x' } }) }))).toEqual({})
  })

  test('falsy defaults are kept; a property named __proto__ becomes an own key, not a prototype', () => {
    expect(applyDefaults(obj({ n: { type: 'number', default: 0 }, s: { type: 'string', default: '' }, f: { type: 'boolean', default: false } }))).toEqual({ n: 0, s: '', f: false })
    const properties = JSON.parse('{"__proto__": {"type": "string", "default": "x"}}') as Record<string, JsonSchema>
    const result = applyDefaults({ type: 'object', properties })
    expect(Object.hasOwn(result, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
  })

  test('a schema without properties gives an empty object', () => {
    expect(applyDefaults({ type: 'object' })).toEqual({})
  })

  test('validators never call it: validating an empty object against a schema with defaults leaves it empty', () => {
    const schema = obj({ a: { type: 'string', default: 'x' } })
    const value = {}
    validateAgainstSchema(schema, value, { checkRequired: false })
    expect(value).toEqual({})
  })
})

describe('checkSchemaSubset', () => {
  const paths = (schema: unknown) => checkSchemaSubset(schema).map((p) => p.path)

  test('a well-formed schema has no problems; every problem has a message', () => {
    expect(paths(obj({ a: { type: 'string', default: 'x', minLength: 1 } }, { required: ['a'], additionalProperties: false }))).toEqual([])
    expect(checkSchemaSubset({ type: 'nope' })[0].message).not.toBe('')
  })

  test('non-goal keywords are named as deliberate non-goals', () => {
    for (const keyword of ['$ref', '$defs', 'anyOf', 'oneOf', 'allOf', 'not', 'if', 'then', 'else', 'patternProperties', 'format', 'pattern']) {
      const problems = checkSchemaSubset({ type: 'string', [keyword]: 1 })
      expect(problems.map((p) => p.path), keyword).toEqual([`/${keyword}`])
      expect(problems[0].message, keyword).toContain('non-goal')
    }
    expect(checkSchemaSubset({ type: 'string', whatever: 1 })[0].message).toContain('not a supported keyword')
  })

  test('the depth limit is 16 levels and a cyclic schema object terminates', () => {
    const cycle: Record<string, unknown> = { type: 'array' }
    cycle.items = cycle
    expect(paths(cycle)).toEqual(['/items'.repeat(16)])
  })

  test('a default is validated only when its node and everything beneath it is sound (never throws, never reported otherwise)', () => {
    expect(() => checkSchemaSubset({ type: 'object', required: 5, default: {} })).not.toThrow()
    expect(paths({ type: 'object', required: 5, default: {} })).toEqual(['/required'])
    // the reproducers from the T5a review: an enum of the wrong JSON type on a type that has no enum
    expect(paths({ type: 'array', enum: 5, default: [] })).toEqual(['/enum'])
    expect(paths({ type: 'object', enum: null, default: {} })).toEqual(['/enum'])
    expect(paths({ type: 'object', properties: { a: { type: 'array', enum: 1, default: [] } } })).toEqual(['/properties/a/enum'])
    expect(paths({ type: 'object', enum: [{}], default: {} })).toEqual(['/enum'])
    // the node's own problem (an unknown keyword) also hides its bad default; a sound sibling's default is still checked
    expect(paths({ type: 'string', bogus: 1, default: 5 })).toEqual(['/bogus'])
    expect(paths({ type: 'object', properties: { a: { type: 'string', bogus: 1 }, b: { type: 'integer', default: 'x' } } })).toEqual(['/properties/a/bogus', '/properties/b/default'])
    // a problem beneath hides the parent's default too
    expect(paths({ type: 'object', properties: { a: { type: 'integer', minimum: 'x' } }, default: { a: 'y' } })).toEqual(['/properties/a/minimum'])
  })

  test('enum entries must have the schema type; an empty enum is a problem', () => {
    expect(paths({ type: 'string', enum: [1, true] })).toEqual(['/enum/0', '/enum/1'])
    expect(paths({ type: 'integer', enum: [1.5, 2 ** 53, 3] })).toEqual(['/enum/0', '/enum/1'])
    expect(paths({ type: 'number', enum: [1.5, NaN] })).toEqual(['/enum/1'])
    expect(paths({ type: 'boolean', enum: [true, 1] })).toEqual(['/enum/1'])
    expect(paths({ type: 'string', enum: [] })).toEqual(['/enum'])
    expect(paths({ type: 'string', enum: ['a', 'b'], default: 'a' })).toEqual([])
  })

  test('unsatisfiable ranges are problems at the max keyword; equal limits are fine', () => {
    expect(paths({ type: 'string', minLength: 3, maxLength: 2 })).toEqual(['/maxLength'])
    expect(paths({ type: 'integer', minimum: 2, maximum: 1 })).toEqual(['/maximum'])
    expect(paths({ type: 'array', minItems: 2, maxItems: 1 })).toEqual(['/maxItems'])
    expect(paths({ type: 'string', minLength: 2, maxLength: 2 })).toEqual([])
    expect(paths({ type: 'number', minimum: 1, maximum: 1 })).toEqual([])
    expect(paths({ type: 'array', minItems: 0, maxItems: 0 })).toEqual([])
  })

  test('a duplicate required name is a problem at the later occurrence', () => {
    const properties = { a: { type: 'string' as const }, b: { type: 'string' as const } }
    expect(paths({ type: 'object', properties, required: ['a', 'b', 'a', 'a'] })).toEqual(['/required/2', '/required/3'])
    expect(paths({ type: 'object', properties, required: ['a', 'b'] })).toEqual([])
  })
})

describe('validateAgainstSchema options are mandatory at runtime', () => {
  const schema: JsonSchema = { type: 'string' }
  test('a missing or malformed options value throws a TypeError', () => {
    const call = (options: unknown) => () => validateAgainstSchema(schema, 'x', options as { checkRequired: boolean })
    for (const bad of [undefined, null, {}, { checkRequired: 1 }, { checkRequired: 'true' }, { checkRequired: undefined }, 5, 'x', []]) {
      expect(call(bad), JSON.stringify(bad)).toThrow(TypeError)
    }
    expect(call({ checkRequired: true })).not.toThrow()
    expect(call({ checkRequired: false })).not.toThrow()
  })
})

describe('enumEquals', () => {
  test('same JSON type and value; a boolean never equals a number or text (a loose == would accept these)', () => {
    expect(enumEquals(1, 1)).toBe(true)
    expect(enumEquals('a', 'a')).toBe(true)
    expect(enumEquals(true, true)).toBe(true)
    expect(enumEquals(0, -0)).toBe(true)
    for (const [a, b] of [[1, true], [true, 1], [0, false], [0, ''], [0, '0'], [1, '1'], ['1', 1], [false, ''], [false, '0'], [0, null], ['', false]] as const) {
      expect(enumEquals(a, b), `${String(a)} vs ${String(b)}`).toBe(false)
    }
  })
})

describe('error codes', () => {
  test('every schema.* code the validator can emit is a real ERROR_CODES entry', () => {
    const emitted = new Set<string>()
    const probes: [JsonSchema, unknown][] = [
      [{ type: 'string' }, 1], [{ type: 'string', enum: ['a'] }, 'b'], [obj({}, { required: ['a'], additionalProperties: false }), { b: 1 }],
      [{ type: 'number', minimum: 1 }, 0], [{ type: 'number', maximum: 1 }, 2], [{ type: 'string', minLength: 2 }, 'a'],
      [{ type: 'string', maxLength: 1 }, 'ab'], [{ type: 'array', minItems: 1 }, []], [{ type: 'array', maxItems: 1 }, [1, 2]],
    ]
    for (const [schema, value] of probes) for (const e of validateAgainstSchema(schema, value, { checkRequired: true })) emitted.add(e.code)
    expect(emitted.size).toBe(10)
    for (const code of emitted) expect(ERROR_CODES as readonly string[]).toContain(code)
    expect(ERROR_CODES.filter((c) => c.startsWith('schema.')).sort()).toEqual([...emitted].sort())
  })
})

// ---------------------------------------------------------------------------
// Seeded property-style test against an independent reference
// ---------------------------------------------------------------------------

// mulberry32: a tiny seeded generator, so a failure reproduces exactly.
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rand = () => number
const pick = <T>(r: Rand, list: readonly T[]): T => list[Math.floor(r() * list.length)]
const someOf = <T>(r: Rand, list: readonly T[]): T[] => {
  const chosen = list.filter(() => r() < 0.7)
  return chosen.length > 0 ? chosen : [list[0]]
}
const KEYS = ['a', 'b', 'a/b', 'm~n', 'constructor', 'toString'] as const
const STRINGS = ['', 'a', 'ab', EMOJI, EMOJI + EMOJI, 'abc'] as const
const NUMBERS = [-6, -1, 0, 0.5, 1, 3, 5, 6, 1.5] as const

function genSchema(r: Rand, depth: number): JsonSchema {
  const leaf = depth <= 0
  const type = pick(r, leaf ? (['string', 'number', 'integer', 'boolean'] as const) : (['string', 'number', 'integer', 'boolean', 'array', 'object'] as const))
  switch (type) {
    case 'string': {
      if (r() < 0.25) return { type, enum: someOf(r, ['a', 'b', EMOJI]) }
      const s: JsonSchema = { type }
      if (r() < 0.4) s.minLength = pick(r, [0, 1, 2])
      if (r() < 0.4) s.maxLength = pick(r, [2, 3])
      return s
    }
    case 'number':
    case 'integer': {
      if (r() < 0.2) return { type, enum: someOf(r, [0, 1, 3]) }
      const s: JsonSchema = { type }
      if (r() < 0.4) s.minimum = pick(r, [-5, -1, 0])
      if (r() < 0.4) s.maximum = pick(r, [0, 1, 5])
      return s
    }
    case 'boolean':
      return r() < 0.2 ? { type, enum: [true] } : { type }
    case 'array': {
      const s: JsonSchema = { type }
      if (r() < 0.7) s.items = genSchema(r, depth - 1)
      if (r() < 0.4) s.minItems = pick(r, [0, 1, 2])
      if (r() < 0.4) s.maxItems = pick(r, [2, 3])
      return s
    }
    default: {
      const properties: Record<string, JsonSchema> = {}
      for (const key of KEYS) if (r() < 0.35) properties[key] = genSchema(r, depth - 1)
      const s: JsonSchema = { type: 'object', properties }
      const names = Object.keys(properties)
      if (r() < 0.5) s.required = names.filter(() => r() < 0.5)
      const extra = r()
      if (extra < 0.3) s.additionalProperties = false
      else if (extra < 0.5) s.additionalProperties = true
      else if (extra < 0.65) s.additionalProperties = genSchema(r, depth - 1)
      return s
    }
  }
}

const JUNK: readonly unknown[] = [null, 0, -0, 1.5, 2 ** 53, NaN, Infinity, '', 'a', EMOJI + EMOJI, true, [], {}, [1, 'a'], { a: 1 }]

/** A value for the schema; `junk` is the chance that any node is replaced by arbitrary junk. */
function genValue(r: Rand, schema: JsonSchema, junk: number): unknown {
  if (r() < junk) return pick(r, JUNK)
  const wild = junk > 0 && r() < 0.2 // ignore the range and length keywords (only when invalid values are wanted)
  switch (schema.type) {
    case 'string':
      return schema.enum ? (schema.enum.length > 0 ? pick(r, schema.enum) : 'a') : pick(r, wild ? STRINGS : STRINGS.filter((s) => fitsLength(s, schema)).concat(['ab']))
    case 'number':
    case 'integer': {
      if (schema.enum) return schema.enum.length > 0 ? pick(r, schema.enum) : 0
      const ok = NUMBERS.filter((n) => wild || ((schema.type === 'number' || Number.isInteger(n)) && (schema.minimum === undefined || n >= schema.minimum) && (schema.maximum === undefined || n <= schema.maximum)))
      return pick(r, ok.length > 0 ? ok : [0])
    }
    case 'boolean':
      return schema.enum ? true : r() < 0.5
    case 'array': {
      const max = wild ? 4 : Math.min(schema.maxItems ?? 3, 3)
      const length = Math.max(schema.minItems ?? 0, Math.floor(r() * (max + 1)))
      return Array.from({ length }, () => (schema.items ? genValue(r, schema.items, junk) : pick(r, JUNK)))
    }
    default: {
      const out: Record<string, unknown> = {}
      for (const [key, child] of Object.entries(schema.properties ?? {})) {
        if ((schema.required ?? []).includes(key) || r() < 0.7) out[key] = genValue(r, child, junk)
      }
      const extra = pick(r, KEYS)
      if (r() < 0.25 && schema.additionalProperties !== false && !Object.hasOwn(schema.properties ?? {}, extra)) {
        out[extra] = genValue(r, typeof schema.additionalProperties === 'object' ? schema.additionalProperties : { type: 'string' }, junk)
      }
      return out
    }
  }
}
const fitsLength = (s: string, schema: JsonSchema): boolean => {
  const n = Array.from(s).length
  return n >= (schema.minLength ?? 0) && n <= (schema.maxLength ?? Infinity)
}

// The reference: written differently on purpose (a per-type predicate table, violations as plain strings,
// string.split for escaping, Array.from for code points, hasOwnProperty.call for own keys).
const esc = (k: string) => k.split('~').join('~0').split('/').join('~1')
const isObj = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v)
const OK: Record<string, (v: unknown) => boolean> = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: (v) => typeof v === 'number' && Number.isFinite(v) && v % 1 === 0 && Math.abs(v) <= 2 ** 53 - 1,
  boolean: (v) => v === true || v === false,
  array: (v) => Array.isArray(v),
  object: isObj,
}
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)

function reference(s: JsonSchema, v: unknown, checkRequired: boolean, at = ''): string[] {
  if (!OK[s.type](v)) return [`schema.type@${at}`]
  const out: string[] = []
  if (s.enum && !s.enum.includes(v)) out.push(`schema.enum@${at}`)
  if (typeof v === 'string') {
    const n = Array.from(v).length
    if (s.minLength !== undefined && n < s.minLength) out.push(`schema.minLength@${at}`)
    if (s.maxLength !== undefined && n > s.maxLength) out.push(`schema.maxLength@${at}`)
  }
  if (typeof v === 'number') {
    if (s.minimum !== undefined && v < s.minimum) out.push(`schema.minimum@${at}`)
    if (s.maximum !== undefined && v > s.maximum) out.push(`schema.maximum@${at}`)
  }
  if (Array.isArray(v)) {
    if (s.minItems !== undefined && v.length < s.minItems) out.push(`schema.minItems@${at}`)
    if (s.maxItems !== undefined && v.length > s.maxItems) out.push(`schema.maxItems@${at}`)
    if (s.items) out.push(...v.flatMap((item, i) => reference(s.items as JsonSchema, item, checkRequired, `${at}/${i}`)))
  }
  if (isObj(v) && s.type === 'object') {
    const o = v as Record<string, unknown>
    if (checkRequired) out.push(...(s.required ?? []).filter((k) => !own(o, k) || o[k] === undefined).map((k) => `schema.required@${at}/${esc(k)}`))
    for (const [k, child] of Object.entries(o)) {
      const sub = s.properties && own(s.properties, k) ? s.properties[k] : undefined
      if (sub) out.push(...reference(sub, child, checkRequired, `${at}/${esc(k)}`))
      else if (s.additionalProperties === false) out.push(`schema.additionalProperties@${at}/${esc(k)}`)
      else if (isObj(s.additionalProperties)) out.push(...reference(s.additionalProperties as JsonSchema, child, checkRequired, `${at}/${esc(k)}`))
    }
  }
  return out
}

describe('property test: the validator agrees with an independent reference', () => {
  const N = 2000
  test(`${N} seeded schema + value pairs, both checkRequired values`, () => {
    const r = rng(20261104)
    let valid = 0
    let invalid = 0
    const seen = new Set<string>()
    for (let i = 0; i < N; i++) {
      const schema = genSchema(r, 3)
      const value = genValue(r, schema, pick(r, [0, 0.1, 0.3, 0.5]))
      for (const checkRequired of [true, false]) {
        const actual = validateAgainstSchema(schema, value, { checkRequired }).map((e) => `${e.code}@${e.path}`)
        const expected = reference(schema, value, checkRequired)
        expect(actual.sort(), `pair ${i} checkRequired=${checkRequired}: ${JSON.stringify(schema)} <- ${JSON.stringify(value)}`).toEqual(expected.sort())
        if (checkRequired) {
          if (expected.length === 0) valid++
          else invalid++
          for (const e of expected) seen.add(e.split('@')[0])
        }
      }
    }
    // the generator must exercise both outcomes and (nearly) every code, or the agreement proves little
    expect(valid, 'valid pairs').toBeGreaterThan(N * 0.15)
    expect(invalid, 'invalid pairs').toBeGreaterThan(N * 0.2)
    expect([...seen].sort()).toEqual(ERROR_CODES.filter((c) => c.startsWith('schema.')).sort())
  })

  test('applyDefaults(schema) validates with checkRequired false, and generated schemas are inside the subset', () => {
    const r = rng(7)
    let withDefaults = 0
    for (let i = 0; i < 1000; i++) {
      // an object schema whose properties may carry a default that conforms to its own schema
      const properties: Record<string, JsonSchema> = {}
      const root: ObjectSchema = { type: 'object', properties, additionalProperties: false }
      for (const key of KEYS) {
        if (r() < 0.5) {
          const child = genSchema(r, 2)
          if (r() < 0.6) child.default = genValue(r, child, 0)
          properties[key] = child
        }
      }
      expect(checkSchemaSubset(root), `pair ${i}: ${JSON.stringify(root)}`).toEqual([])
      const defaults = applyDefaults(root)
      if (Object.keys(defaults).length > 0) withDefaults++
      expect(validateAgainstSchema(root, defaults, { checkRequired: false }), `pair ${i}: ${JSON.stringify(root)}`).toEqual([])
      expect(Object.keys(defaults).every((k) => properties[k].default !== undefined)).toBe(true)
    }
    expect(withDefaults).toBeGreaterThan(500)
  })
})

// ---------------------------------------------------------------------------
// Totality: checkSchemaSubset never throws, whatever it is given
// ---------------------------------------------------------------------------

const KEYWORDS = ['type', 'title', 'description', 'default', 'enum', 'minLength', 'maxLength', 'minimum', 'maximum', 'items', 'minItems', 'maxItems', 'properties', 'required', 'additionalProperties', '$ref', 'bogus', '__proto__'] as const
const setOwn = (o: Record<string, unknown>, key: string, value: unknown): void => {
  Object.defineProperty(o, key, { value, enumerable: true, writable: true, configurable: true }) // an own __proto__ key too
}

/** A random JSON value of a random type (null, numbers, text, booleans, lists, objects), nested up to `depth`. */
function randJson(r: Rand, depth: number): unknown {
  const kind = Math.floor(r() * (depth > 0 ? 8 : 5))
  switch (kind) {
    case 0: return null
    case 1: return pick(r, [0, -0, 1, -1, 1.5, 2 ** 53, 1e308, -5])
    case 2: return pick(r, ['', 'a', 'string', 'object', 'integer', EMOJI])
    case 3: return r() < 0.5
    case 4: return pick(r, KEYWORDS)
    case 5: return Array.from({ length: Math.floor(r() * 4) }, () => randJson(r, depth - 1))
    default: {
      const out: Record<string, unknown> = {}
      for (let i = Math.floor(r() * 4); i > 0; i--) setOwn(out, pick(r, [...KEYS, ...KEYWORDS]), randJson(r, depth - 1))
      return out
    }
  }
}

/** Corrupts a schema in place: keyword values replaced by random JSON, keywords dropped or added, at every level. */
function corrupt(r: Rand, node: unknown): unknown {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return node
  const out = node as Record<string, unknown>
  for (const key of Object.keys(out)) {
    const roll = r()
    if (roll < 0.1) out[key] = randJson(r, 3)
    else if (roll < 0.13) delete out[key]
    else if (key === 'properties' && typeof out[key] === 'object' && out[key] !== null) {
      for (const k of Object.keys(out[key] as object)) (out[key] as Record<string, unknown>)[k] = corrupt(r, (out[key] as Record<string, unknown>)[k])
    } else if (key === 'items' || key === 'additionalProperties') out[key] = corrupt(r, out[key])
  }
  if (r() < 0.3) setOwn(out, pick(r, KEYWORDS), randJson(r, 3))
  if (r() < 0.2) setOwn(out, 'default', randJson(r, 3))
  return out
}

function anySchemaLikeValue(r: Rand): unknown {
  const roll = r()
  if (roll < 0.1) return randJson(r, 5)
  if (roll < 0.15) {
    // a chain deeper than the 16-level limit
    let node: unknown = { type: 'string' }
    for (let i = 0; i < 18; i++) node = { type: 'array', items: node, default: [] }
    return corrupt(r, node)
  }
  const schema = genSchema(r, 3)
  if (r() < 0.5) schema.default = genValue(r, schema, pick(r, [0, 0.3]))
  return corrupt(r, structuredClone(schema))
}

describe('checkSchemaSubset is total', () => {
  const N = 3000
  test(`${N} seeded random and corrupted schema values never throw; a clean verdict means the validator is safe too`, () => {
    const r = rng(20261105)
    let clean = 0
    let reported = 0
    for (let i = 0; i < N; i++) {
      const schema = anySchemaLikeValue(r)
      let problems: ReturnType<typeof checkSchemaSubset> = []
      try {
        problems = checkSchemaSubset(schema)
      } catch (e) {
        throw new Error(`pair ${i} threw (${String(e)}): ${JSON.stringify(schema)}`)
      }
      if (problems.length > 0) {
        reported++
        for (const p of problems) expect(typeof p.path === 'string' && p.message !== '', `pair ${i}`).toBe(true)
        continue
      }
      clean++
      // soundness corollary: a schema with no problems can be used by the validator on any value without throwing
      for (const checkRequired of [true, false]) {
        expect(() => validateAgainstSchema(schema as JsonSchema, randJson(r, 3), { checkRequired }), `pair ${i}: ${JSON.stringify(schema)}`).not.toThrow()
      }
    }
    expect(reported, 'schemas with problems').toBeGreaterThan(N * 0.3)
    expect(clean, 'schemas with no problems').toBeGreaterThan(N * 0.05)
  })

  test('total on the awkward shapes too: cyclic objects, non-objects, own __proto__, deep nesting', () => {
    const cyclicProps: Record<string, unknown> = { type: 'object' }
    cyclicProps.properties = { self: cyclicProps }
    const proto = JSON.parse('{"type":"object","properties":{"__proto__":{"type":"string","default":5}},"__proto__":{"type":"string"}}')
    for (const value of [undefined, null, 0, '', true, [], [1], {}, cyclicProps, proto, { type: 'array', items: [] }, { type: 'object', properties: [] }, { type: 'object', additionalProperties: null }]) {
      expect(() => checkSchemaSubset(value)).not.toThrow()
    }
    // the own __proto__ keyword is unknown; the sound property named __proto__ still has its bad default reported
    expect(checkSchemaSubset(proto).map((p) => p.path)).toEqual(['/__proto__', '/properties/__proto__/default'])
  })
})

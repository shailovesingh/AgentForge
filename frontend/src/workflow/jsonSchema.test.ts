import { describe, expect, test } from 'vitest'
import { ERROR_CODES } from './errors'
import { applyDefaults, checkSchemaSubset, validateAgainstSchema } from './jsonSchema'
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

  test('a default is validated only when its schema is sound (no throw on a malformed schema)', () => {
    expect(() => checkSchemaSubset({ type: 'object', required: 5, default: {} })).not.toThrow()
    expect(paths({ type: 'object', required: 5, default: {} })).toEqual(['/required'])
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

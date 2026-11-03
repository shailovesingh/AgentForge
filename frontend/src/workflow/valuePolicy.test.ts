import { describe, expect, test } from 'vitest'
import { nodeDefinitions } from '../catalog'
import { parseConfigInput } from './configSchema'
import { importWorkflow, serializeWorkflow } from './serialize'
import type { ConfigProperty, Workflow } from './types'
import { MAX_DEPTH, MAX_SAFE_MAGNITUDE, findPolicyViolations, stringProblem } from './valuePolicy'

const nested = (levels: number): unknown => {
  let v: unknown = {}
  for (let i = 1; i < levels; i++) v = { a: v }
  return v
}
const nestedText = (levels: number): string => '{"a":'.repeat(levels - 1) + '{}' + '}'.repeat(levels - 1)

describe('constants', () => {
  test('the policy numbers are the documented ones', () => {
    expect(MAX_DEPTH).toBe(64)
    expect(MAX_SAFE_MAGNITUDE).toBe(9007199254740991)
    expect(MAX_SAFE_MAGNITUDE).toBe(Number.MAX_SAFE_INTEGER)
  })
})

describe('stringProblem', () => {
  test.each([
    ['', null],
    ['plain é ' + String.fromCodePoint(0x1f600) + ' ' + String.fromCharCode(0x2028, 0xfeff, 0xffff), null], // line separator, BOM and U+FFFF are allowed
    ['a\u0000b', 'value.nul-character'],
    ['\ud800', 'value.invalid-unicode'],
    ['\udc00', 'value.invalid-unicode'],
    ['\udc00\ud800', 'value.invalid-unicode'],
    ['\ud800x', 'value.invalid-unicode'],
    ['x\ud83d', 'value.invalid-unicode'],
  ])('%j', (text, expected) => {
    expect(stringProblem(text)).toBe(expected)
  })
})

describe('findPolicyViolations', () => {
  test('ordinary values have no violations', () => {
    const value = { a: [1, -2.5, 0, -0, 1e-7, 5e-324, MAX_SAFE_MAGNITUDE, -MAX_SAFE_MAGNITUDE], b: 'café \u{1f600}', c: { d: null, e: true } }
    expect(findPolicyViolations(value, 0)).toEqual([])
    expect(findPolicyViolations('text', 4)).toEqual([])
    expect(findPolicyViolations(42, 4)).toEqual([])
  })

  test('non-finite numbers', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(findPolicyViolations({ x: [bad] }, 0).map(({ code, path }) => ({ code, path }))).toEqual([
        { code: 'value.not-finite', path: '/x/0' },
      ])
    }
  })

  test('numbers above the magnitude limit', () => {
    expect(findPolicyViolations(MAX_SAFE_MAGNITUDE + 1, 0).map((v) => v.code)).toEqual(['value.unsafe-integer'])
    expect(findPolicyViolations(-(2 ** 53), 0).map((v) => v.code)).toEqual(['value.unsafe-integer'])
    expect(findPolicyViolations(1e21, 0)[0]).toMatchObject({ code: 'value.unsafe-integer', path: '' })
    expect(findPolicyViolations(Number.MAX_VALUE, 0)[0].code).toBe('value.unsafe-integer')
  })

  test('NUL and lone surrogates in strings and in keys', () => {
    expect(findPolicyViolations({ k: 'a\u0000' }, 0)[0]).toMatchObject({ code: 'value.nul-character', path: '/k' })
    expect(findPolicyViolations({ k: '\ud800' }, 0)[0]).toMatchObject({ code: 'value.invalid-unicode', path: '/k' })
    expect(findPolicyViolations({ 'a\u0000': 1 }, 0)[0]).toMatchObject({ code: 'value.nul-character', path: '/a\u0000' })
    expect(findPolicyViolations({ '\udc00': 1 }, 0)[0]).toMatchObject({ code: 'value.invalid-unicode' })
    expect(findPolicyViolations(['ok', '\u0000'], 0)[0]).toMatchObject({ code: 'value.nul-character', path: '/1' })
  })

  test('depth boundary counted from baseDepth (a container sits at baseDepth + 1)', () => {
    expect(findPolicyViolations(nested(64), 0)).toEqual([])
    expect(findPolicyViolations(nested(65), 0)[0]).toMatchObject({ code: 'doc.too-deep', path: '/a'.repeat(64) })
    // A config value: Workflow(1) > nodes(2) > node(3) > config(4), so an object here is at depth 5.
    expect(findPolicyViolations(nested(60), 4)).toEqual([])
    expect(findPolicyViolations(nested(61), 4)[0].code).toBe('doc.too-deep')
    expect(findPolicyViolations([[1]], 63)[0].code).toBe('doc.too-deep') // the outer array is at depth 64, the inner at 65
    expect(findPolicyViolations([1], 63)).toEqual([])
  })

  test('scalars add no depth', () => {
    expect(findPolicyViolations('x', 64)).toEqual([])
    expect(findPolicyViolations(1, 1000)).toEqual([])
  })

  test('absurd nesting is reported once without walking it', () => {
    let deep: unknown = []
    for (let i = 0; i < 100_000; i++) deep = [deep]
    expect(findPolicyViolations(deep, 0).map((v) => v.code)).toEqual(['doc.too-deep'])
  })

  test('reports at most 20 violations', () => {
    expect(findPolicyViolations(Array.from({ length: 100 }, () => 1e21), 0)).toHaveLength(20)
  })

  test('own "__proto__" keys are walked like any other key', () => {
    const value = JSON.parse('{"__proto__":{"x":1e21}}') as unknown
    expect(findPolicyViolations(value, 0)[0]).toMatchObject({ code: 'value.unsafe-integer', path: '/__proto__/x' })
  })
})

describe('the config panel path (parseConfigInput) never commits a value the importer would reject', () => {
  const payload = nodeDefinitions.find((d) => d.type === 'trigger.manual')!.configSchema.properties.payload
  const unbounded: ConfigProperty = { type: 'number', title: 'Count' }
  const text: ConfigProperty = { type: 'string', title: 'Note' }

  test('a typed number above the magnitude limit is flagged with a clear message', () => {
    for (const raw of ['1e21', '9007199254740992', '-9007199254740993', '9007199254740991.7']) {
      const r = parseConfigInput(unbounded, raw)
      expect(r.ok, raw).toBe(false)
      if (!r.ok) expect(r.error).toMatch(/outside the supported range \(-9007199254740991 to 9007199254740991\)/)
    }
    expect(parseConfigInput(unbounded, '9007199254740991')).toEqual({ ok: true, value: 9007199254740991 })
    expect(parseConfigInput(unbounded, '1e400')).toEqual({ ok: false, error: 'must be a number' }) // existing wording kept
  })

  test('a bounded field keeps its existing message for out-of-range numbers', () => {
    const llm = nodeDefinitions.find((d) => d.type === 'llm.prompt')!.configSchema.properties
    expect(parseConfigInput(llm.temperature, '1e21')).toEqual({ ok: false, error: 'must be at most 2' })
  })

  test('a typed JSON object nested 70 levels deep is flagged and not committed', () => {
    const r = parseConfigInput(payload, nestedText(70))
    expect(r).toEqual({ ok: false, error: 'is nested more than 64 levels deep' })
  })

  test('the depth limit for a typed object is 60 (it sits at depth 5)', () => {
    expect(parseConfigInput(payload, nestedText(60)).ok).toBe(true)
    expect(parseConfigInput(payload, nestedText(61)).ok).toBe(false)
  })

  test('numbers, NUL and surrogates inside a typed JSON object are flagged', () => {
    expect(parseConfigInput(payload, '{"n":1e21}').ok).toBe(false)
    expect(parseConfigInput(payload, '{"n":1e400}').ok).toBe(false)
    expect(parseConfigInput(payload, '{"n":"a\\u0000b"}').ok).toBe(false)
    expect(parseConfigInput(payload, '{"n":"\\ud800"}').ok).toBe(false)
    expect(parseConfigInput(payload, '{"a\\u0000":1}').ok).toBe(false)
    expect(parseConfigInput(payload, '{"n":[1,2,{"m":"café"}]}').ok).toBe(true)
  })

  test('typed strings with NUL are flagged', () => {
    expect(parseConfigInput(text, 'a\u0000b')).toEqual({ ok: false, error: 'contains a NUL character (U+0000), which is not supported' })
    expect(parseConfigInput(text, 'plain é \u{1f600}').ok).toBe(true)
  })

  test('round trip: the deepest value the panel accepts survives export then import', () => {
    const accepted = parseConfigInput(payload, nestedText(60))
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    const wf: Workflow = {
      schemaVersion: '1.0',
      id: 'wf_1',
      name: 'Deep',
      description: '',
      nodes: [
        {
          id: 't',
          type: 'trigger.manual',
          typeVersion: 1,
          label: 'Start',
          config: { payload: accepted.value },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
      metadata: {},
    }
    const imported = importWorkflow(serializeWorkflow(wf), nodeDefinitions)
    expect(imported.ok).toBe(true)
    // One level more would have been rejected by the importer, which is why the panel refuses it.
    wf.nodes[0].config = { payload: JSON.parse(nestedText(61)) as unknown }
    const tooDeep = importWorkflow(serializeWorkflow(wf), nodeDefinitions)
    expect(tooDeep.ok).toBe(false)
    if (!tooDeep.ok) expect(tooDeep.errors[0].code).toBe('doc.too-deep')
  })
})

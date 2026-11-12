import { describe, expect, test } from 'vitest'
import { nodeDefinitions } from '../catalog'
import { lintWorkflow } from './lint'
import { CREDENTIAL_SHAPES, HEADER_NAMES, KEY_WORDS, MAX_KEY_LENGTH, REDACTED_KEY, detectNodeSecrets, detectSecrets } from './secrets'
import type { SecretConfidence, SecretFinding, SecretReason } from './secrets'
import type { Workflow } from './types'

// Every token below is BUILT AT RUN TIME from parts. No token-shaped literal may stand in a source file: the repository is
// pushed to GitHub, whose push protection rejects them (contracts/SECRETS.md, "The placeholder method").
const T = {
  sk: (n: number) => 'sk' + '-' + 'x'.repeat(n),
  gsk: (n: number) => 'gs' + 'k_' + 'x'.repeat(n),
  ghp: (n: number) => 'gh' + 'p_' + 'A'.repeat(n),
  pat: (n: number) => 'github' + '_pat_' + 'A'.repeat(n),
  akia: (n: number) => 'AK' + 'IA' + 'Q'.repeat(n),
  xox: (letter: string, n: number) => 'xo' + 'x' + letter + '-' + '1'.repeat(n),
  jwt: (n: number) => 'ey' + 'J' + 'a'.repeat(n) + '.' + 'b'.repeat(n) + '.' + 'c'.repeat(n),
  pem: (kind = '') => '-----' + 'BEGIN ' + kind + 'PRIVATE KEY' + '-----',
  bearer: (n: number, gap = ' ') => 'Bea' + 'rer' + gap + 't'.repeat(n),
}

const find = (config: Record<string, unknown>): SecretFinding[] => detectNodeSecrets('n', config)
const hit = (path: string, reason: SecretReason, confidence: SecretConfidence = 'high'): SecretFinding => ({ confidence, location: 'config', nodeId: 'n', path, reason })
const shaped = (text: string): boolean => find({ k: text }).some((x) => x.reason === 'credential-shape')

const wf = (nodes: unknown[], metadata: unknown = {}): Workflow =>
  ({ schemaVersion: '1.0', id: 'wf', name: 'n', description: '', nodes, edges: [], metadata }) as unknown as Workflow
const cfgNode = (id: string, config: unknown) => ({ id, type: 'llm.prompt', typeVersion: 1, label: id, config, position: { x: 0, y: 0 } })

const deepFreeze = <T>(v: T): T => {
  if (typeof v === 'object' && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const child of Object.values(v)) deepFreeze(child)
  }
  return v
}

// ---------------------------------------------------------------------------
// Credential shapes: positives, boundaries, negatives
// ---------------------------------------------------------------------------

const SHAPE_CASES: { shape: string; yes: string[]; no: string[] }[] = [
  {
    shape: 'sk',
    yes: [T.sk(20), T.sk(40), 'sk' + '-ant-' + 'api03-' + 'x'.repeat(30), 'sk' + '-' + 'a_b-' + 'c'.repeat(18)],
    no: [T.sk(19), 'task' + '-' + 'x'.repeat(24), 'risk-assessment-of-something-long', 'sk' + ' ' + 'x'.repeat(24), 'sk' + '-' + 'x'.repeat(10) + ' ' + 'x'.repeat(10)],
  },
  { shape: 'gsk', yes: [T.gsk(20), T.gsk(30)], no: [T.gsk(19), 'gs' + 'k_' + 'x'.repeat(10) + '-' + 'x'.repeat(10)] },
  { shape: 'ghp', yes: [T.ghp(36), T.ghp(40)], no: [T.ghp(35), 'gh' + 'p_' + 'A'.repeat(18) + '_' + 'A'.repeat(18)] },
  { shape: 'github_pat', yes: [T.pat(22), 'github' + '_pat_' + 'A_b'.repeat(10)], no: [T.pat(21)] },
  { shape: 'akia', yes: [T.akia(16), T.akia(20)], no: [T.akia(15), 'AK' + 'IA' + 'q'.repeat(16)] },
  { shape: 'xox', yes: ['b', 'a', 'p', 'r', 's'].map((l) => T.xox(l, 10)), no: [T.xox('z', 10), T.xox('b', 9)] },
  {
    shape: 'jwt',
    yes: [T.jwt(5), T.jwt(30)],
    no: [T.jwt(4), 'ey' + 'J' + 'a'.repeat(8) + '.' + 'b'.repeat(8), 'ey' + 'J' + 'a'.repeat(8) + '.' + 'b'.repeat(8) + '.' + 'c'.repeat(4), 'ey' + 'J' + 'a'.repeat(8)],
  },
  {
    shape: 'pem',
    yes: [T.pem(), T.pem('RSA '), T.pem('OPENSSH '), T.pem('ENCRYPTED '), 'x ' + T.pem('EC ') + ' y'],
    no: ['-----' + 'BEGIN ' + 'PUBLIC KEY' + '-----', '-----' + 'BEGIN ' + 'CERTIFICATE' + '-----', 'PRIVATE KEY'],
  },
  {
    shape: 'bearer',
    yes: [T.bearer(20), T.bearer(30), T.bearer(20, '   '), T.bearer(20, '\t'), T.bearer(20, '\n')],
    no: [T.bearer(19), 'use a Bearer token here', 'bearer ' + 't'.repeat(20), 'Bea' + 'rer' + 't'.repeat(20)],
  },
]

describe('credential shapes', () => {
  test('the cases cover every shape exactly once', () => {
    expect(SHAPE_CASES.map((c) => c.shape).sort()).toEqual(CREDENTIAL_SHAPES.map((s) => s.name).sort())
  })

  for (const c of SHAPE_CASES) {
    const pattern = (CREDENTIAL_SHAPES.find((s) => s.name === c.shape) as (typeof CREDENTIAL_SHAPES)[number]).pattern
    test(`${c.shape}: every positive matches its own pattern and is found as a high credential-shape`, () => {
      for (const text of c.yes) {
        expect(pattern.test(text), 'own pattern').toBe(true)
        expect(find({ k: text }), 'finding').toEqual([hit('k', 'credential-shape')])
      }
    })
    test(`${c.shape}: every negative is not found`, () => {
      for (const text of c.no) {
        expect(pattern.test(text), 'own pattern').toBe(false)
        expect(shaped(text), 'detector').toBe(false)
      }
    })
  }

  test('found anywhere inside a longer string, with a boundary on the left', () => {
    const tok = T.sk(24)
    for (const text of [`prefix ${tok} suffix`, `${tok} first`, `last ${tok}`, `key=${tok}`, `"${tok}"`, `line one\n${tok}\nline three`, `${'lorem ipsum '.repeat(2000)}${tok}${' dolor'.repeat(2000)}`]) {
      expect(shaped(text), text.slice(0, 20)).toBe(true)
    }
    // glued to a letter, digit, hyphen or underscore on the left: not the start of a token
    for (const glued of ['a', '9', '-', '_']) expect(shaped(glued + tok), glued).toBe(false)
  })

  test('a shape as an OBJECT KEY is found, at the path of its value, whatever the value', () => {
    for (const value of ['v', '', 5, null, true, {}, [], ['v'], { a: 1 }]) {
      expect(find({ [T.ghp(36)]: value }), JSON.stringify(value)).toEqual([hit(REDACTED_KEY, 'credential-shape')])
    }
  })

  test('a shape inside a key, glued or not, follows the same boundary rule', () => {
    expect(find({ ['id ' + T.akia(16)]: 'v' })).toEqual([hit(REDACTED_KEY, 'credential-shape')])
    expect(find({ ['id' + T.akia(16)]: 'v' })).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Header names (high) and key words (medium)
// ---------------------------------------------------------------------------

describe('header names', () => {
  test('the lists are exactly the specified ones (the test.each below follows the exported lists, so pin them here)', () => {
    expect([...HEADER_NAMES]).toEqual(['authorization', 'proxy-authorization', 'cookie', 'x-api-key', 'api-key', 'x-auth-token', 'x-access-token'])
    expect([...KEY_WORDS]).toEqual(['secret', 'password', 'passwd', 'token', 'apikey', 'api_key'])
  })

  const mixed = (s: string) => s.split('').map((c, i) => (i % 2 ? c.toUpperCase() : c)).join('')

  test.each(HEADER_NAMES)('%s: found in any case and with surrounding spaces, at the path of its value', (name) => {
    for (const key of [name, name.toUpperCase(), mixed(name), '  ' + name + ' ', '\t' + name + '\n']) {
      expect(find({ headers: { [key]: 'v' } }), JSON.stringify(key)).toEqual([hit(`headers.${key}`, 'header-name')])
    }
  })

  test.each(HEADER_NAMES)('%s: no finding for an empty or whitespace-only value, or a value that is not a string', (name) => {
    const bom = String.fromCharCode(0xfeff)
    for (const value of ['', ' ', '   ', '\t', '\n', ' \r\n ', bom, 5, 0, null, true, false, {}, [], ['x'], { a: 'b' }]) {
      expect(find({ headers: { [name]: value } }), JSON.stringify(value)).toEqual([])
    }
  })

  test('only an exact header name counts: a longer name is not one', () => {
    expect(find({ 'Authorization-like': 'v', 'X-Authorization': 'v', 'Cookies': 'v', 'api_key_header': 'v' })).toEqual([hit('api_key_header', 'key-name', 'medium')])
  })

  test('the name is shown (it is not a secret), the value is not', () => {
    const f = find({ headers: { Authorization: 'hunter2-value' } })
    expect(f.map((x) => x.path)).toEqual(['headers.Authorization'])
    expect(JSON.stringify(f)).not.toContain('hunter2')
  })
})

describe('key words (medium)', () => {
  test.each(KEY_WORDS)('%s: a key containing it, in any case, with a non-empty string value', (word) => {
    for (const key of [word, word.toUpperCase(), `my_${word}_value`, `X-${word}`]) {
      expect(find({ [key]: 'v' }), key).toEqual([hit(key, 'key-name', 'medium')])
    }
  })

  test.each(KEY_WORDS)('%s: no finding for an empty or whitespace-only value, or a value that is not a string', (word) => {
    for (const value of ['', ' ', '\t\n', 5, null, true, {}, [], ['x'], { a: 'b' }]) {
      expect(find({ [word]: value }), JSON.stringify(value)).toEqual([])
    }
  })

  test('a high finding at the same path hides the medium one', () => {
    expect(find({ token: T.ghp(36) })).toEqual([hit('token', 'credential-shape')])
    expect(find({ headers: { 'x-auth-token': 'v' } })).toEqual([hit('headers.x-auth-token', 'header-name')])
    expect(find({ [T.sk(24)]: 'v' }).map((x) => x.confidence)).toEqual(['high'])
  })

  test('a medium finding does not hide a high finding at another path', () => {
    expect(find({ password: 'p', note: T.ghp(36) })).toEqual([hit('password', 'key-name', 'medium'), hit('note', 'credential-shape')])
  })

  test('documented false positive: a counter named token_count is a medium finding', () => {
    expect(find({ token_count: '5' })).toEqual([hit('token_count', 'key-name', 'medium')])
  })
})

// ---------------------------------------------------------------------------
// Paths, redaction, dedup, order, locations
// ---------------------------------------------------------------------------

describe('display paths', () => {
  test('dotted keys and bracketed array indexes', () => {
    expect(find({ items: [{ a: 1 }, { b: 2 }, { token: 'x' }] })).toEqual([hit('items[2].token', 'key-name', 'medium')])
    expect(find({ a: { b: [[{ password: 'p' }]] } })).toEqual([hit('a.b[0][0].password', 'key-name', 'medium')])
    expect(find({ list: ['x', T.sk(24)] })).toEqual([hit('list[1]', 'credential-shape')])
  })

  test('a credential-shaped key is replaced by [redacted key], also in the middle of a path', () => {
    expect(find({ headers: { [T.sk(24)]: 'v' } })).toEqual([hit(`headers.${REDACTED_KEY}`, 'credential-shape')])
    expect(find({ [T.ghp(36)]: { password: 'p' } }).map((x) => x.path)).toEqual([REDACTED_KEY, `${REDACTED_KEY}.password`])
  })

  test('a key longer than 40 characters is redacted, one of exactly 40 is shown', () => {
    expect(MAX_KEY_LENGTH).toBe(40)
    const k40 = 'password' + 'x'.repeat(32)
    const k41 = 'password' + 'x'.repeat(33)
    expect(find({ [k40]: 'v' })).toEqual([hit(k40, 'key-name', 'medium')])
    expect(find({ [k41]: 'v' })).toEqual([hit(REDACTED_KEY, 'key-name', 'medium')])
  })

  test('the redacted text never contains the key', () => {
    const key = T.sk(24)
    expect(JSON.stringify(find({ a: { [key]: 'v' } }))).not.toContain(key.slice(0, 8))
  })

  test('one finding per distinct (path, reason): two redacted keys under one parent give one finding', () => {
    expect(find({ h: { [T.sk(24) + 'a']: 'v', [T.sk(24) + 'b']: 'w' } })).toEqual([hit(`h.${REDACTED_KEY}`, 'credential-shape')])
  })

  test('different reasons at one path are different findings: a header name with a credential value', () => {
    expect(find({ headers: { Authorization: T.bearer(24) } })).toEqual([hit('headers.Authorization', 'header-name'), hit('headers.Authorization', 'credential-shape')])
  })

  test('an empty key and unusual keys never throw', () => {
    expect(() => find({ '': 'v', ' ': { token: 'x' }, '.': ['a'], '[0]': 'y' })).not.toThrow()
    expect(find({ '': { password: 'x' } })).toEqual([hit('.password', 'key-name', 'medium')])
  })
})

describe('locations and order', () => {
  test('config findings carry the node id, metadata findings carry no nodeId, nodes in array order then metadata', () => {
    const w = wf([cfgNode('b', { password: 'p' }), cfgNode('a', { Authorization: 'x' })], { token: 't' })
    expect(detectSecrets(w)).toEqual([
      { confidence: 'medium', location: 'config', nodeId: 'b', path: 'password', reason: 'key-name' },
      { confidence: 'high', location: 'config', nodeId: 'a', path: 'Authorization', reason: 'header-name' },
      { confidence: 'medium', location: 'metadata', path: 'token', reason: 'key-name' },
    ])
    expect(Object.hasOwn(detectSecrets(w)[2], 'nodeId')).toBe(false)
  })

  test('within a node: depth first, keys in Object.keys order (integer-like keys first), reasons header-name, credential-shape, key-name', () => {
    const f = find({ z: { password: 'p', Authorization: T.bearer(24) }, a: T.ghp(36), 5: 'x', token: 't' })
    expect(f.map((x) => `${x.path}:${x.reason}`)).toEqual(['z.password:key-name', 'z.Authorization:header-name', 'z.Authorization:credential-shape', 'a:credential-shape', 'token:key-name'])
  })

  test('labels, names and descriptions are not scanned (a documented limit)', () => {
    const w = { ...wf([{ ...cfgNode('a', {}), label: T.sk(24) }]), name: T.sk(24), description: T.sk(24) }
    expect(detectSecrets(w)).toEqual([])
  })

  test('a malformed workflow gives no findings and does not throw', () => {
    for (const w of [null, undefined, 5, 'x', [], {}, { nodes: 'x' }, { nodes: [null, 3, 'x', [], {}, { id: 5, config: { token: 'x' } }, { id: 'a' }, { id: 'a', config: null }, { id: 'a', config: [] }], metadata: 'x' }]) {
      expect(detectSecrets(w as unknown as Workflow), JSON.stringify(w)).toEqual([])
    }
    expect(detectSecrets(wf([], [{ token: 'x' }]))).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Purity, own properties, totality, scale
// ---------------------------------------------------------------------------

describe('purity and own properties', () => {
  test('a deep-frozen workflow is neither changed nor rejected, and the same input gives the same output', () => {
    const w = deepFreeze(wf([cfgNode('a', { headers: { Authorization: 'x', [T.sk(24)]: 'y' }, items: [{ password: 'p' }] })], { token: 't' }))
    const before = JSON.stringify(w)
    const first = detectSecrets(w)
    expect(first.length).toBe(4)
    expect(JSON.stringify(w)).toBe(before)
    expect(detectSecrets(w)).toEqual(first)
  })

  test('an own __proto__ key is an ordinary key, and nothing is polluted', () => {
    const config = JSON.parse('{"__proto__":{"password":"p","polluted":"yes"},"a":{"__proto__":"x"}}') as Record<string, unknown>
    expect(Object.hasOwn(config, '__proto__')).toBe(true)
    expect(find(config)).toEqual([hit('__proto__.password', 'key-name', 'medium')])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(find(JSON.parse('{"__proto__":"x"}') as Record<string, unknown>)).toEqual([])
  })

  test('inherited properties are never read', () => {
    const base = { password: 'inherited' }
    const config = Object.create(base) as Record<string, unknown>
    config.note = 'x'
    expect(find(config)).toEqual([])
  })

  test('a cycle or a shared object is walked once, so the function terminates', () => {
    const a: Record<string, unknown> = { token: 't' }
    a.self = a
    expect(find(a)).toEqual([hit('token', 'key-name', 'medium')])
    const shared = { password: 'p' }
    expect(find({ one: shared, two: shared }).map((x) => x.path)).toEqual(['one.password'])
  })
})

describe('scale and linear time', () => {
  const FIVE_MILLION = 5_000_000
  const timed = <R>(fn: () => R): [R, number] => {
    const start = performance.now()
    const result = fn()
    return [result, performance.now() - start]
  }
  const LIMIT_MS = 2000

  const ADVERSARIAL: { name: string; text: () => string; found: boolean }[] = [
    { name: 'sk plus one long run', text: () => 'sk' + '-' + 'a'.repeat(FIVE_MILLION - 3), found: true },
    { name: 'Bearer plus spaces only', text: () => 'Bea' + 'rer ' + ' '.repeat(FIVE_MILLION - 7), found: false },
    { name: 'Bearer plus spaces then a token', text: () => 'Bea' + 'rer ' + ' '.repeat(FIVE_MILLION - 30) + 't'.repeat(20), found: true },
    { name: 'Bearer repeated', text: () => ('Bea' + 'rer ').repeat(FIVE_MILLION / 7), found: false },
    { name: 'eyJ plus dots', text: () => 'ey' + 'J' + '.'.repeat(FIVE_MILLION - 3), found: false },
    { name: 'eyJ plus one long run', text: () => 'ey' + 'J' + 'a'.repeat(FIVE_MILLION - 3), found: false },
    { name: 'eyJ- repeated (one long run of the token alphabet)', text: () => ('ey' + 'J-').repeat(FIVE_MILLION / 4), found: false },
    { name: 'eyJaaaaa. repeated (a JWT start after every dot)', text: () => ('ey' + 'Jaaaaa.').repeat(FIVE_MILLION / 9), found: true },
    { name: 'eyJaaaa. repeated (parts one character too short)', text: () => ('ey' + 'Jaaaa.').repeat(FIVE_MILLION / 8), found: false },
    { name: '-----BEGIN repeated', text: () => ('-----' + 'BEGIN ').repeat(FIVE_MILLION / 11), found: false },
    { name: 'sk- with 19 characters, repeated', text: () => ('sk' + '-' + 'a'.repeat(19) + ' ').repeat(FIVE_MILLION / 23), found: false },
    { name: 'ghp_ repeated', text: () => ('gh' + 'p_').repeat(FIVE_MILLION / 4), found: false },
    { name: 'AKIA with 15 characters, repeated', text: () => ('AK' + 'IA' + 'Q'.repeat(15) + ' ').repeat(FIVE_MILLION / 20), found: false },
  ]

  test.each(ADVERSARIAL)('$name: a 5,000,000-character string finishes well under two seconds', ({ text, found }) => {
    const value = text()
    expect(value.length).toBeGreaterThan(4_000_000)
    const [findings, ms] = timed(() => find({ k: value }))
    expect(findings.length > 0, 'found').toBe(found)
    expect(ms, `${ms.toFixed(0)} ms`).toBeLessThan(LIMIT_MS)
  }, 30_000)

  test('a 5,000,000-character KEY is handled like a value', () => {
    const [findings, ms] = timed(() => find({ ['sk' + '-' + 'a'.repeat(FIVE_MILLION)]: 'v' }))
    expect(findings).toEqual([hit(REDACTED_KEY, 'credential-shape')])
    expect(ms).toBeLessThan(LIMIT_MS)
  }, 30_000)

  test('an object with 60,000 keys (one of them a finding, then all of them)', () => {
    const wide: Record<string, unknown> = {}
    for (let i = 0; i < 60_000; i++) wide[`key${i}`] = `value${i}`
    wide.password = 'p'
    const [one, ms1] = timed(() => find(wide))
    expect(one).toEqual([hit('password', 'key-name', 'medium')])
    expect(ms1).toBeLessThan(LIMIT_MS)
    const all: Record<string, unknown> = {}
    for (let i = 0; i < 60_000; i++) all[`token${i}`] = 'v'
    const [many, ms2] = timed(() => find(all))
    expect(many.length).toBe(60_000)
    expect(ms2).toBeLessThan(LIMIT_MS)
  }, 30_000)

  test('a 200,000-level deep value (built without recursion) does not overflow the stack', () => {
    let nested: Record<string, unknown> = { password: 'p' }
    for (let i = 0; i < 200_000; i++) nested = { n: nested }
    const [objects, ms1] = timed(() => find(nested))
    expect(objects.length).toBe(1)
    expect(objects[0].path.endsWith('n.n.password')).toBe(true)
    expect(objects[0].path.length).toBe('n.'.length * 200_000 + 'password'.length)
    expect(ms1).toBeLessThan(LIMIT_MS)

    let inArrays: unknown = T.ghp(36)
    for (let i = 0; i < 200_000; i++) inArrays = [inArrays]
    const [arrays, ms2] = timed(() => find({ a: inArrays }))
    expect(arrays.length).toBe(1)
    expect(arrays[0].path.startsWith('a[0][0]')).toBe(true)
    expect(ms2).toBeLessThan(LIMIT_MS)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// Never echo
// ---------------------------------------------------------------------------

// A sentinel token, built at run time. A finding, a warning or an error must not contain it, its first or last 8 characters,
// or a simple hash of it.
const SENTINEL = 'gh' + 'p_' + 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'
const fnv = (s: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}
const NEEDLES = [SENTINEL, SENTINEL.slice(0, 8), SENTINEL.slice(-8), fnv(SENTINEL).toString(16), String(fnv(SENTINEL))]
const leaked = (value: unknown): string[] => {
  const text = JSON.stringify(value)
  return NEEDLES.filter((needle) => text.includes(needle))
}

describe('never echo', () => {
  const PLACEMENTS: { name: string; config: Record<string, unknown> }[] = [
    { name: 'a header value', config: { headers: { Authorization: SENTINEL } } },
    { name: 'a header value with a Bearer scheme', config: { headers: { Authorization: `Bea` + `rer ${SENTINEL}` } } },
    { name: 'a nested value', config: { a: { b: { c: `x ${SENTINEL} y` } } } },
    { name: 'an array item', config: { items: [1, SENTINEL] } },
    { name: 'a key', config: { headers: { [SENTINEL]: 'v' } } },
    { name: 'a key and its value', config: { [SENTINEL]: SENTINEL } },
    { name: 'a key with an object value', config: { [SENTINEL]: { password: 'p' } } },
    { name: 'a long prompt', config: { prompt: 'lorem '.repeat(5000) + SENTINEL + ' ipsum' } },
    { name: 'a key-name finding', config: { password: SENTINEL } },
    { name: 'a key that is too long', config: { ['password' + SENTINEL]: 'v' } },
  ]

  test('the sentinel is detectable by the needles (the check itself works)', () => {
    expect(leaked({ x: SENTINEL })).toEqual(NEEDLES.slice(0, 3))
    expect(leaked({ x: `h ${fnv(SENTINEL).toString(16)} ${fnv(SENTINEL)}` })).toEqual(NEEDLES.slice(3))
    expect(leaked({ x: 'clean' })).toEqual([])
  })

  for (const { name, config } of PLACEMENTS) {
    test(`${name}: found, and not echoed by a finding or a lint warning`, () => {
      const findings = detectSecrets(wf([cfgNode('p', config)], {}))
      expect(findings.length, 'is found').toBeGreaterThan(0)
      expect(leaked(findings), 'findings').toEqual([])
      const warnings = lintWorkflow(wf([cfgNode('p', config)]), nodeDefinitions)
      expect(warnings.some((w) => w.code.startsWith('secret'))).toBe(true)
      expect(leaked(warnings), 'warnings').toEqual([])
    })
  }

  test('in metadata', () => {
    const findings = detectSecrets(wf([], { note: SENTINEL, [SENTINEL]: 'v' }))
    expect(findings.length).toBe(2)
    expect(leaked(findings)).toEqual([])
  })

  test('nothing throws for these inputs, so there is no thrown message to leak', () => {
    for (const { config } of PLACEMENTS) {
      expect(() => detectSecrets(wf([cfgNode('p', config)], config))).not.toThrow()
      expect(() => lintWorkflow(wf([cfgNode('p', config)], config), nodeDefinitions)).not.toThrow()
    }
  })

  test('property run: 1,200 seeded random configs mixing strings, the sentinel and decoys', () => {
    let seed = 20261112
    const rand = (): number => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const pick = <V>(list: readonly V[]): V => list[Math.floor(rand() * list.length)]
    const SAFE_KEYS = ['a', 'name', 'url', 'Content-Type', 'X-Trace', 'items', 'payload', 'nested', 'x1', 'constructor']
    const WORD_KEYS = ['token', 'password', 'Authorization', 'api_key', 'client_secret', 'Cookie']
    const DECOYS = ['', ' ', 'plain text', T.sk(19), T.ghp(35), T.akia(15), 'use a Bea' + 'rer token here', 'task' + '-' + 'x'.repeat(24), '-----BEGIN PUBLIC KEY-----', 'ey' + 'Jaaaaa.bbbbb']
    const PLANTS = [SENTINEL, `use ${SENTINEL} now`, `${SENTINEL} first`, `last ${SENTINEL}`, `a b\n${SENTINEL}\nc`, `Bea` + `rer ${SENTINEL}`]

    let wordKey = false
    const genKey = (): string => {
      const r = rand()
      if (r < 0.06) return rand() < 0.5 ? SENTINEL : `id ${SENTINEL}`
      if (r < 0.2) {
        wordKey = true
        return pick(WORD_KEYS)
      }
      return pick(SAFE_KEYS)
    }
    const genValue = (depth: number): unknown => {
      const r = rand()
      if (r < 0.1) return pick(PLANTS)
      if (r < 0.4) return pick(DECOYS)
      if (r < 0.5) return pick([0, 1, true, false, null])
      if (depth >= 4 || r < 0.65) return 'text ' + Math.floor(rand() * 100)
      if (r < 0.8) return Array.from({ length: Math.floor(rand() * 4) }, () => genValue(depth + 1))
      const o: Record<string, unknown> = {}
      for (let i = Math.floor(rand() * 4); i > 0; i--) o[genKey()] = genValue(depth + 1)
      return o
    }

    let withPlant = 0
    for (let run = 0; run < 1200; run++) {
      wordKey = false
      const config: Record<string, unknown> = {}
      for (let i = Math.floor(rand() * 5); i > 0; i--) config[genKey()] = genValue(0)
      const planted = JSON.stringify(config).includes(SENTINEL) // a later assignment can overwrite an earlier plant, so ask the result
      const findings = detectNodeSecrets('p', config)
      const warnings = lintWorkflow(wf([cfgNode('p', config)]), nodeDefinitions)
      const where = `run ${run}`
      expect(leaked(findings), `${where}: findings`).toEqual([])
      expect(leaked(warnings), `${where}: warnings`).toEqual([])
      if (planted) {
        withPlant++
        expect(findings.length, `${where}: a planted sentinel is found`).toBeGreaterThan(0)
      } else if (!wordKey) {
        expect(findings, `${where}: decoys and safe keys give no finding`).toEqual([])
      }
    }
    expect(withPlant, 'the generator plants the sentinel often enough to prove something').toBeGreaterThan(150)
  })
})

import { describe, expect, test } from 'vitest'
import { nodeDefinitions } from '../catalog'
import { lintWorkflow } from './lint'
import {
  CREDENTIAL_SHAPES,
  HEADER_NAMES,
  HIDDEN_ECHO,
  KEY_WORDS,
  MAX_FINDINGS_PER_SCAN,
  MAX_KEY_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PATH_LENGTH,
  REDACTED_KEY,
  REDACTED_NAME,
  detectNodeSecrets,
  detectSecrets,
  echoSafe,
  echoSafePointer,
  echoValue,
  holdsCredential,
  isCredentialShaped,
  isRedactedKey,
  safeDisplayName,
  scanSecrets,
} from './secrets'
import type { SecretConfidence, SecretFinding, SecretReason } from './secrets'
import type { Workflow } from './types'

// Every token below is BUILT AT RUN TIME from parts. No token-shaped literal may stand in a source file: the repository is
// pushed to GitHub, whose push protection rejects them (contracts/SECRETS.md, "The placeholder method").
const T = {
  sk: (n: number) => 'sk' + '-' + 'x'.repeat(n),
  gsk: (n: number) => 'gs' + 'k_' + 'x'.repeat(n),
  ghp: (n: number) => 'gh' + 'p_' + 'A'.repeat(n),
  gh: (letter: string, n: number) => 'gh' + letter + '_' + 'A'.repeat(n),
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
    no: [T.sk(19), 'task' + '-' + 'x'.repeat(24), 'ri' + 'sk-' + 'assessment-of-something-long', 'sk' + ' ' + 'x'.repeat(24), 'sk' + '-' + 'x'.repeat(10) + ' ' + 'x'.repeat(10)],
  },
  { shape: 'gsk', yes: [T.gsk(20), T.gsk(30)], no: [T.gsk(19), 'gs' + 'k_' + 'x'.repeat(10) + '-' + 'x'.repeat(10)] },
  {
    shape: 'gh',
    yes: [T.ghp(36), T.ghp(40), ...['o', 'u', 's', 'r'].map((l) => T.gh(l, 36))],
    no: [T.ghp(35), T.gh('o', 35), T.gh('x', 36), 'gh' + 'p_' + 'A'.repeat(18) + '_' + 'A'.repeat(18)],
  },
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
    no: [
      '-----' + 'BEGIN ' + 'PUBLIC KEY' + '-----',
      '-----' + 'BEGIN ' + 'CERTIFICATE' + '-----',
      'PRIVATE KEY',
      '-----' + 'BEGIN ' + 'rsa ' + 'PRIVATE KEY' + '-----', // lowercase in the gap: not a match
      '-----' + 'BEGIN ' + 'PRIVATE KEY', // without the trailing dashes: not a match
    ],
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

  test('no shape can match a text shorter than 15 characters (the detector skips the regexes for shorter text)', () => {
    const shortest = Math.min(...SHAPE_CASES.flatMap((c) => c.yes.map((text) => text.length)))
    expect(shortest).toBe(15) // xox?- plus 10: exactly at the limit, so the skip is tight and still finds it
    expect(shaped(T.xox('b', 10))).toBe(true)
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
    const texts = [`prefix ${tok} suffix`, `${tok} first`, `last ${tok}`, `key=${tok}`, `"${tok}"`, `line one\n${tok}\nline three`, `${'lorem ipsum '.repeat(2000)}${tok}${' dolor'.repeat(2000)}`]
    texts.forEach((text, i) => expect(shaped(text), `text ${i}`).toBe(true))
    // glued to a letter, digit, hyphen or underscore on the left: not the start of a token (the generic sk- shape)
    for (const glued of ['a', '9', '-', '_']) expect(shaped(glued + tok), glued).toBe(false)
  })

  test('the boundary is ASCII letters only: a non-ASCII letter before the token does not hide it', () => {
    const eAcute = String.fromCharCode(0xe9)
    expect(shaped(eAcute + T.sk(24))).toBe(true)
    expect(shaped(eAcute + T.akia(16))).toBe(true)
  })

  test('the distinctive prefixes are found after _ or - (NAME_ghp_..., key-ghp_...); only a letter or digit hides them', () => {
    const tokens = { gh: T.ghp(36), gho: T.gh('o', 36), gsk: T.gsk(20), pat: T.pat(22), akia: T.akia(16), xox: T.xox('b', 10) }
    for (const [name, tok] of Object.entries(tokens)) {
      expect(shaped('NAME_' + tok), `_ before ${name}`).toBe(true)
      expect(shaped('key-' + tok), `- before ${name}`).toBe(true)
      expect(shaped('x' + tok), `letter before ${name}`).toBe(false)
      expect(shaped('7' + tok), `digit before ${name}`).toBe(false)
    }
  })

  test('the generic shapes keep the strict boundary: NAME_sk-... and key-sk-... are documented misses', () => {
    expect(shaped('OPENAI_API_KEY_' + T.sk(24))).toBe(false)
    expect(shaped('key-' + T.sk(24))).toBe(false)
    expect(shaped('x' + T.bearer(24))).toBe(false) // a glued Bearer
  })

  test('a dot before a token is allowed: the boundary does not include `.`', () => {
    for (const c of SHAPE_CASES) {
      if (c.shape === 'pem') continue
      expect(shaped('config.' + c.yes[0]), c.shape).toBe(true)
    }
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
    for (const key of [name, name.toUpperCase(), mixed(name)]) {
      expect(find({ headers: { [key]: 'v' } }), JSON.stringify(key)).toEqual([hit(`headers.${key}`, 'header-name')])
    }
    // a key with whitespace is still recognised (trim), but its display path is redacted (whitespace in a key)
    for (const key of ['  ' + name + ' ', '\t' + name + '\n', String.fromCharCode(0xfeff) + name]) {
      expect(find({ headers: { [key]: 'v' } }), JSON.stringify(key)).toEqual([hit(`headers.${REDACTED_KEY}`, 'header-name')])
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

describe('display path: more redaction, the length cap, and the medium rule', () => {
  const NEL = String.fromCharCode(0x85)
  const FS = String.fromCharCode(0x1c)
  const FEFF = String.fromCharCode(0xfeff)

  test('a key holding =, : or whitespace is redacted: a secret typed INTO a key never reaches a path', () => {
    for (const key of ['token: abc123xyz789', 'password=hunter2', 'my password', 'a:b', 'a=b', 'tab\there', 'line\nbreak']) {
      const f = find({ headers: { [key]: { password: 'p' } } })
      expect(f.map((x) => x.path), JSON.stringify(key.length)).toEqual([`headers.${REDACTED_KEY}.password`])
      expect(JSON.stringify(f)).not.toContain('hunter2')
      expect(JSON.stringify(f)).not.toContain('abc123')
    }
    expect(find({ headers: { ['token: abc123xyz789']: 'v' } }).map((x) => x.path)).toEqual([`headers.${REDACTED_KEY}`])
  })

  test('documented limit: a Stripe-style parent key is not credential-shaped, so it is shown (formats outside the list are not detected)', () => {
    const key = 'sk_' + 'live_' + 'x'.repeat(24)
    expect(find({ [key]: { password: 'p' } }).map((x) => x.path)).toEqual([`${key}.password`])
  })

  test('a path of exactly 200 characters is kept whole; a longer one is cut after the last whole step, with ...', () => {
    expect(MAX_PATH_LENGTH).toBe(200)
    const lens = [40, 39, 39, 39, 39] // 40 + 4 * (1 + 39) = 200
    const keys = lens.map((n, i) => (i === lens.length - 1 ? 'token' + 'z'.repeat(n - 5) : String.fromCharCode(97 + i).repeat(n)))
    const nest = (ks: string[]): Record<string, unknown> => ks.reduceRight<Record<string, unknown>>((inner, k, i) => (i === ks.length - 1 ? { [k]: 'v' } : { [k]: inner }), {})
    const whole = find(nest(keys))
    expect(whole.map((x) => x.path.length)).toEqual([200])
    expect(whole[0].path.endsWith('...')).toBe(false)
    const longer = find(nest(['q', ...keys]))
    expect(longer.length).toBe(1)
    expect(longer[0].path.length).toBeLessThanOrEqual(MAX_PATH_LENGTH)
    expect(longer[0].path.endsWith('...')).toBe(true)
    // what is left before the dots is a whole number of steps: q, then the first keys, joined by dots
    const kept = longer[0].path.slice(0, -3)
    const prefix = ['q', ...keys].join('.')
    expect(prefix.startsWith(kept)).toBe(true)
    expect(kept === prefix || prefix[kept.length] === '.').toBe(true)
  })

  test('the cut never shortens a redaction marker: only whole [redacted key] steps remain', () => {
    const long = 'a'.repeat(41)
    let nested: Record<string, unknown> = { token: 'v' }
    for (let i = 0; i < 30; i++) nested = { [long]: nested }
    const f = find(nested)
    expect(f.length).toBe(1)
    expect(f[0].path.length).toBeLessThanOrEqual(MAX_PATH_LENGTH)
    expect(f[0].path.endsWith('...')).toBe(true)
    expect(/^\[redacted key\](\.\[redacted key\])*\.\.\.$/.test(f[0].path), 'whole markers only').toBe(true)
  })

  test('a medium key-name finding is skipped only for a key whose OWN value is already a high finding (per key, not per path)', () => {
    // a redacted credential-shaped key and a redacted over-long key share the display path, yet are different keys
    expect(find({ [T.sk(24)]: 'v', ['password' + 'x'.repeat(40)]: 'v' })).toEqual([hit(REDACTED_KEY, 'credential-shape'), hit(REDACTED_KEY, 'key-name', 'medium')])
    // the key "a.password" and the nested a.password share a display path, and are different keys
    expect(find({ 'a.password': 'x', a: { password: T.bearer(24) } })).toEqual([hit('a.password', 'key-name', 'medium'), hit('a.password', 'credential-shape')])
  })

  test('JavaScript rules a port must copy: trim and \\s, U+0085 and U+001C are not whitespace, U+FEFF is', () => {
    // a key with a leading U+FEFF before Authorization IS a header-name finding (trim removes it); its path is redacted (\s)
    expect(find({ [FEFF + 'Authorization']: 'v' })).toEqual([hit(REDACTED_KEY, 'header-name')])
    // a value made of U+0085 or U+001C is non-empty (JavaScript trim keeps them)
    expect(find({ Authorization: NEL, 'x-api-key': FS })).toEqual([hit('Authorization', 'header-name'), hit('x-api-key', 'header-name')])
    expect(find({ password: NEL })).toEqual([hit('password', 'key-name', 'medium')])
    expect(find({ Authorization: FEFF })).toEqual([])
    // whitespace after Bearer is \s: U+FEFF counts, U+0085 and U+001C do not
    expect(shaped('Bea' + 'rer' + FEFF + 't'.repeat(20))).toBe(true)
    expect(shaped('Bea' + 'rer' + NEL + 't'.repeat(20))).toBe(false)
    expect(shaped('Bea' + 'rer' + FS + 't'.repeat(20))).toBe(false)
  })

  test('the key length limit counts UTF-16 code units: 17 emoji after "password" is 42 and redacted, 16 is 40 and shown', () => {
    const emoji = String.fromCodePoint(0x1f600)
    const k42 = 'password' + emoji.repeat(17)
    const k40 = 'password' + emoji.repeat(16)
    expect(k42.length).toBe(42)
    expect(find({ headers: { [k42]: 'v' } })).toEqual([hit(`headers.${REDACTED_KEY}`, 'key-name', 'medium')])
    expect(find({ headers: { [k40]: 'v' } })).toEqual([hit(`headers.${k40}`, 'key-name', 'medium')])
    expect(find({ headers: { [emoji.repeat(21)]: { password: 'p' } } }).map((x) => x.path)).toEqual([`headers.${REDACTED_KEY}.password`])
  })
})

describe('bounded output: scanSecrets, the per-node cap and the omitted counts', () => {
  const tokens = (n: number): Record<string, unknown> => Object.fromEntries(Array.from({ length: n }, (_, i) => [`token${i}`, 'v']))

  test('at most 50 findings are kept per node, and the rest is counted (an upper bound)', () => {
    expect(MAX_FINDINGS_PER_SCAN).toBe(50)
    const scan = scanSecrets(wf([cfgNode('a', tokens(120)), cfgNode('b', tokens(3)), cfgNode('c', {})], tokens(60)))
    expect(scan.findings.filter((x) => x.nodeId === 'a').length).toBe(50)
    expect(scan.findings.filter((x) => x.nodeId === 'b').length).toBe(3)
    expect(scan.findings.filter((x) => x.location === 'metadata').length).toBe(50)
    expect(scan.omitted.perNode.get('a')).toEqual({ high: 0, medium: 70 })
    expect(scan.omitted.perNode.has('b')).toBe(false) // only nodes with something omitted
    expect(scan.omitted.perNode.has('c')).toBe(false)
    expect(scan.omitted.metadata).toEqual({ high: 0, medium: 10 })
    // the first 50 in walk order are the ones kept
    expect(scan.findings.filter((x) => x.nodeId === 'a').map((x) => x.path)).toEqual(Array.from({ length: 50 }, (_, i) => `token${i}`))
  })

  test('exactly 50 keeps all and omits nothing; 51 omits one', () => {
    expect(scanSecrets(wf([cfgNode('a', tokens(50))])).omitted.perNode.size).toBe(0)
    const s = scanSecrets(wf([cfgNode('a', tokens(51))]))
    expect(s.findings.length).toBe(50)
    expect(s.omitted.perNode.get('a')).toEqual({ high: 0, medium: 1 })
  })

  test('detectSecrets returns exactly the findings of scanSecrets; nodes with one id add up their omitted counts', () => {
    const w = wf([cfgNode('a', tokens(60)), cfgNode('a', tokens(70))])
    expect(detectSecrets(w)).toEqual(scanSecrets(w).findings)
    expect(scanSecrets(w).omitted.perNode.get('a')).toEqual({ high: 0, medium: 10 + 20 })
    expect(scanSecrets(wf([])).omitted.metadata).toEqual({ high: 0, medium: 0 })
  })

  // M1 (T9b review): the caps are SEPARATE per confidence. 50 medium findings placed BEFORE a high one used to push it out of
  // the 50 kept, so no indicator and no dialog appeared and the file left with the credential (D-023 narrowed).
  describe('separate caps per confidence: medium findings never hide a high one', () => {
    const SK = T.sk(24)
    const mediums = (n: number, prefix = 'token'): Record<string, unknown> => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i}`, 'v']))
    const highOf = (s: ReturnType<typeof scanSecrets>) => s.findings.filter((x) => x.confidence === 'high')

    test('50 mediums, then a header named Authorization: the high findings are kept', () => {
      const s = scanSecrets(wf([cfgNode('a', { headers: { ...mediums(50), Authorization: SK } })]))
      expect(highOf(s).map((x) => [x.path, x.reason])).toEqual([['headers.Authorization', 'header-name'], ['headers.Authorization', 'credential-shape']])
      expect(s.findings.filter((x) => x.confidence === 'medium').length).toBe(50)
      expect(s.omitted.perNode.has('a')).toBe(false)
    })

    test('50 max_tokens_N keys, then X-API-Key', () => {
      const s = scanSecrets(wf([cfgNode('a', { headers: { ...mediums(50, 'max_tokens_'), 'X-API-Key': 'abc' } })]))
      expect(highOf(s).map((x) => [x.path, x.reason])).toEqual([['headers.X-API-Key', 'header-name']])
    })

    test('metadata with 50 passwordN keys, then a credential-shaped value', () => {
      const s = scanSecrets(wf([], { ...mediums(50, 'password'), note: SK }))
      expect(highOf(s).map((x) => [x.location, x.path])).toEqual([['metadata', 'note']])
      expect(s.omitted.metadata).toEqual({ high: 0, medium: 0 })
    })

    test('an array of 50 {token: "x"} items before headers', () => {
      const s = scanSecrets(wf([cfgNode('a', { items: Array.from({ length: 50 }, () => ({ token: 'x' })), headers: { Cookie: 'c' } })]))
      expect(highOf(s).map((x) => x.path)).toEqual(['headers.Cookie'])
    })

    test('55 mediums before a high: 50 mediums kept, 5 omitted, the high kept', () => {
      const s = scanSecrets(wf([cfgNode('a', { ...mediums(55), headers: { Authorization: SK } })]))
      expect(highOf(s).length).toBe(2)
      expect(s.findings.filter((x) => x.confidence === 'medium').length).toBe(50)
      expect(s.omitted.perNode.get('a')).toEqual({ high: 0, medium: 5 })
    })

    test('a node with 60 highs keeps 50 and omits 10; metadata the same; mediums are unaffected', () => {
      const highs = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, SK]))
      const s = scanSecrets(wf([cfgNode('a', { ...highs, ...mediums(3) })], highs))
      expect(highOf(s).filter((x) => x.nodeId === 'a').length).toBe(50)
      expect(highOf(s).filter((x) => x.location === 'metadata').length).toBe(50)
      expect(s.findings.filter((x) => x.nodeId === 'a' && x.confidence === 'medium').length).toBe(3)
      expect(s.omitted.perNode.get('a')).toEqual({ high: 10, medium: 0 })
      expect(s.omitted.metadata).toEqual({ high: 10, medium: 0 })
    })

    test('invariant: a node or the metadata that has a high finding anywhere always KEEPS at least one (so "has a high" is exact)', () => {
      for (const n of [1, 49, 50, 51, 200]) {
        const config = { ...mediums(n), headers: { Authorization: SK } }
        const s = scanSecrets(wf([cfgNode('a', config)], config))
        expect(highOf(s).filter((x) => x.location === 'config').length, `${n} mediums first`).toBeGreaterThan(0)
        expect(highOf(s).filter((x) => x.location === 'metadata').length, `${n} mediums first (metadata)`).toBeGreaterThan(0)
      }
    })

    test('lint: the secret-likely warnings are there however many medium findings come first', () => {
      const w = wf([{ ...cfgNode('a', {}), type: 'http.request', config: { method: 'GET', url: 'u', body: '', headers: { ...mediums(60), Authorization: SK } } }])
      const codes = lintWorkflow(w, nodeDefinitions).filter((x) => x.code.startsWith('secret')).map((x) => x.code)
      expect(codes.filter((c) => c === 'secret-likely').length).toBe(2)
      expect(codes.filter((c) => c === 'secret-suspected').length).toBe(50)
    })
  })

  test('a malformed workflow gives an empty scan', () => {
    for (const w of [null, 5, [], { nodes: 3 }]) {
      const s = scanSecrets(w as unknown as Workflow)
      expect(s.findings).toEqual([])
      expect(s.omitted.perNode.size).toBe(0)
    }
  })
})

describe('echoSafe, echoSafePointer and isRedactedKey (T9b second review: the check runs on the FULL text, before any cut)', () => {
  // A token whose 8-character windows cannot occur in a prefix of repeated letters.
  const TOKEN = 'sk' + '-' + ['QwErTyUi', 'OpAsDfGh', 'JkLzXcVb'].join('')
  const windows = (s: string): string[] => Array.from({ length: s.length - 7 }, (_, i) => s.slice(i, i + 8))
  const SEPARATORS = [' ', '=', '.', ':', '/', '\t']

  test.each(['key', 'text'] as const)('kind %s: a token at every offset 0..120 behind any separator never leaks 8 consecutive characters, whatever the cut', (kind) => {
    for (const max of [20, 60, 100]) {
      for (const separator of SEPARATORS) {
        for (let prefix = 0; prefix <= 120; prefix++) {
          const text = 'x'.repeat(prefix) + separator + TOKEN
          const out = echoSafe(text, max, kind)
          expect(windows(TOKEN).filter((w) => out.includes(w)).length, `kind ${kind}, max ${max}, separator ${JSON.stringify(separator)}, prefix ${prefix}`).toBe(0)
          expect(out, `prefix ${prefix}`).toBe(HIDDEN_ECHO) // a credential shape anywhere in the full text hides all of it
        }
      }
    }
  })

  test('a token glued to a letter is not a credential shape (the documented boundary): echoed as any other text', () => {
    expect(echoSafe('x' + TOKEN, 100, 'text')).toBe('x' + TOKEN)
  })

  test('kind text: only the credential test, then the cut (an id, a type, a version)', () => {
    expect(echoSafe('node-1', 100)).toBe('node-1')
    expect(echoSafe('a b = c : d with spaces and more than twelve characters', 100)).toBe('a b = c : d with spaces and more than twelve characters')
    expect(echoSafe('L'.repeat(150), 100)).toBe('L'.repeat(100) + '...')
    expect(echoSafe('L'.repeat(100), 100)).toBe('L'.repeat(100))
    const emoji = String.fromCodePoint(0x1f600)
    expect(echoSafe('a' + emoji.repeat(60), 10)).toBe('a' + emoji.repeat(4) + '...') // the cut would fall inside a pair: never half of one
    expect(echoSafe(`call ${TOKEN} now`, 100)).toBe(HIDDEN_ECHO)
  })

  test('kind key: ONE rule with display paths (isRedactedKey): hidden when longer than 40 units, or with =, : or whitespace at ANY length', () => {
    expect(echoSafe('Content-Type', 100, 'key')).toBe('Content-Type')
    expect(echoSafe('k'.repeat(40), 100, 'key')).toBe('k'.repeat(40))
    expect(echoSafe('k'.repeat(41), 100, 'key')).toBe(HIDDEN_ECHO)
    for (const key of ['a b', 'pw=hunter2', 'a:b', 'password = hunter2', 'token:' + 'x'.repeat(10), 'a'.repeat(6) + ' ' + 'b'.repeat(6)]) {
      expect(echoSafe(key, 100, 'key'), key).toBe(HIDDEN_ECHO)
      expect(echoSafePointer('/' + key, 100), `the path next to the message: ${key}`).toBe(HIDDEN_ECHO) // the message and the path agree
      expect(isRedactedKey(key), key).toBe(true)
    }
    expect(echoSafe('x'.repeat(12), 100, 'key')).toBe('x'.repeat(12))
  })

  describe('the check runs on the RAW value, never on JSON-escaped text (final review B2)', () => {
    const PART = 'QwErTyUiOpAsDfGhJkLzXcVb' // 24 token characters; its 8-character windows occur nowhere else
    // Every character a person could put after "Bearer": JavaScript's \s treats most of them as whitespace, U+0085 is not one.
    const GAPS: [string, string][] = [
      ['tab', String.fromCharCode(9)], ['line feed', String.fromCharCode(10)], ['carriage return', String.fromCharCode(13)],
      ['form feed', String.fromCharCode(12)], ['vertical tab', String.fromCharCode(11)],
      ['U+0085', String.fromCharCode(0x85)], ['U+00A0', String.fromCharCode(0xa0)], ['U+2028', String.fromCharCode(0x2028)],
      ['U+2029', String.fromCharCode(0x2029)], ['U+FEFF', String.fromCharCode(0xfeff)], ['space', ' '],
    ]
    const bearer = (gap: string): string => 'Bea' + 'rer' + gap + PART
    const leaked = (text: string): boolean => windows(PART).some((w) => text.includes(w))

    test('the detector is the oracle: whatever it calls credential-shaped is hidden by every helper, whole or inside a value', () => {
      let shaped = 0
      for (const [name, gap] of GAPS) {
        const raw = bearer(gap)
        if (!isCredentialShaped(raw)) continue // U+0085 is not \s: not a credential for the detector, so not hidden
        shaped++
        for (const value of [raw, { a: raw }, [raw], [[{ deep: raw }]], { [raw]: 1 }, { k: { [raw]: 'v' } }]) {
          expect(holdsCredential(value), `${name}: ${JSON.stringify(value).length} characters of JSON`).toBe(true)
          const shown = echoValue(value, 100)
          expect(shown, name).toBe(HIDDEN_ECHO)
          expect(leaked(shown), name).toBe(false)
        }
        expect(echoSafe(raw, 100)).toBe(HIDDEN_ECHO)
        expect(echoSafe(raw, 100, 'key')).toBe(HIDDEN_ECHO)
        expect(echoSafePointer('/' + raw.replace(/~/g, '~0').replace(/\//g, '~1'), 100), name).toBe(HIDDEN_ECHO)
      }
      expect(shaped, 'all but U+0085 are credential-shaped').toBe(GAPS.length - 1)
    })

    test('the bug itself: after JSON.stringify a tab, line feed, carriage return, form feed or vertical tab is no longer whitespace, so the detector misses the escaped text', () => {
      for (const code of [9, 10, 13, 12, 11]) {
        const raw = bearer(String.fromCharCode(code))
        expect(isCredentialShaped(raw), `raw, code ${code}`).toBe(true)
        expect(isCredentialShaped(JSON.stringify(raw)), `escaped, code ${code}`).toBe(false) // why the check must see the raw text
        expect(echoValue(raw, 100), `code ${code}`).toBe(HIDDEN_ECHO)
      }
    })

    test('a value of another kind is shown as JSON text, cut; a huge value is hidden, not walked forever', () => {
      expect(echoValue('9.9', 100)).toBe('"9.9"')
      expect(echoValue(undefined, 100)).toBe('undefined')
      expect(echoValue(null, 100)).toBe('null')
      expect(echoValue({ a: [1, 2, 'three'] }, 100)).toBe('{"a":[1,2,"three"]}')
      expect(echoValue('L'.repeat(150), 100)).toBe('"' + 'L'.repeat(99) + '...')
      expect(holdsCredential(Array.from({ length: 10_001 }, () => 1))).toBe(true) // over the bound: unverifiable, so hidden
      expect(holdsCredential(Array.from({ length: 9_000 }, () => 1))).toBe(false)
      let deep: unknown = 'x'
      for (let i = 0; i < 100_000; i++) deep = [deep]
      expect(holdsCredential(deep)).toBe(true) // 100,000 levels (built without recursion): hidden, and no stack overflow
    })
  })

  test('isRedactedKey is the display-path rule: credential-shaped, longer than 40, or any = : or whitespace', () => {
    expect(isRedactedKey('a b')).toBe(true)
    expect(isRedactedKey('a=b')).toBe(true)
    expect(isRedactedKey('a:b')).toBe(true)
    expect(isRedactedKey(TOKEN)).toBe(true)
    expect(isRedactedKey('k'.repeat(41))).toBe(true)
    expect(isRedactedKey('k'.repeat(40))).toBe(false)
    expect(isRedactedKey('Authorization')).toBe(false)
    expect(isRedactedKey('')).toBe(false)
  })

  test('echoSafePointer: plain pointers are shown (cut), a pointer with a credential-shaped, long or odd key anywhere is hidden', () => {
    expect(echoSafePointer('/nodes/0/config/headers', 200)).toBe('/nodes/0/config/headers')
    expect(echoSafePointer('', 200)).toBe('')
    expect(echoSafePointer('/nodes/0/config/' + 'k'.repeat(40), 300)).toBe('/nodes/0/config/' + 'k'.repeat(40))
    expect(echoSafePointer('/a/' + 'k'.repeat(41), 300)).toBe(HIDDEN_ECHO)
    expect(echoSafePointer('/a/b c', 200)).toBe(HIDDEN_ECHO)
    expect(echoSafePointer('/a/b=c', 200)).toBe(HIDDEN_ECHO)
    expect(echoSafePointer('/a/' + TOKEN, 200)).toBe(HIDDEN_ECHO)
    expect(echoSafePointer('/a~1b/c~0d', 200)).toBe('/a~1b/c~0d') // escapes are undone for the check, shown as written
    expect(echoSafePointer('/p/' + 'n'.repeat(250), 200)).toBe(HIDDEN_ECHO) // a 250-character key is over 40
    expect(echoSafePointer('/' + Array.from({ length: 80 }, () => 'abcdefghij').join('/'), 200).endsWith('...')).toBe(true) // long, but plain: cut
    for (let prefix = 0; prefix <= 120; prefix++) {
      const out = echoSafePointer('/' + 'x'.repeat(prefix) + ' ' + TOKEN, 100)
      expect(windows(TOKEN).filter((w) => out.includes(w)).length, `prefix ${prefix}`).toBe(0)
    }
  })
})

describe('safeDisplayName', () => {
  test('a credential-shaped name, or one with a token inside, is redacted; any other name is shown', () => {
    expect(safeDisplayName(T.sk(24))).toBe(REDACTED_NAME)
    expect(safeDisplayName(`call with ${T.ghp(36)} now`)).toBe(REDACTED_NAME)
    expect(safeDisplayName(T.pem())).toBe(REDACTED_NAME)
    expect(safeDisplayName(T.bearer(24))).toBe(REDACTED_NAME)
    expect(safeDisplayName('Fetch users')).toBe('Fetch users')
    expect(safeDisplayName('')).toBe('')
    expect(safeDisplayName(T.sk(19))).toBe(T.sk(19)) // one short of the shape
  })

  test('a name is cut to 60 characters with ... appended only when it is cut', () => {
    expect(MAX_NAME_LENGTH).toBe(60)
    expect(safeDisplayName('n'.repeat(60))).toBe('n'.repeat(60))
    expect(safeDisplayName('n'.repeat(61))).toBe('n'.repeat(60) + '...')
    const emoji = String.fromCodePoint(0x1f600)
    expect(safeDisplayName('n'.repeat(59) + emoji + 'tail')).toBe('n'.repeat(59) + '...') // never half a pair
  })

  test('the shape is checked on the whole text first, so a token past the cut is still redacted', () => {
    expect(safeDisplayName('n'.repeat(100) + ' ' + T.sk(24))).toBe(REDACTED_NAME)
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
    expect(many.length, 'kept at most the cap').toBe(MAX_FINDINGS_PER_SCAN)
    expect(ms2).toBeLessThan(LIMIT_MS)
  }, 30_000)

  test('a 120,000-finding file keeps 50 and counts the rest, in time and with small output', () => {
    const [scan, ms] = timed(() => scanSecrets(wf([cfgNode('n', Object.fromEntries(Array.from({ length: 120_000 }, (_, i) => [`token${i}`, 'v'])))])))
    expect(scan.findings.length).toBe(MAX_FINDINGS_PER_SCAN)
    expect(scan.omitted.perNode.get('n')).toEqual({ high: 0, medium: 120_000 - MAX_FINDINGS_PER_SCAN })
    expect(ms).toBeLessThan(LIMIT_MS)
  }, 30_000)

  test('the 2 MB blow-up shape at 20,000 keys: 58 nested levels of 40-character keys over tokenN keys stay small and fast', () => {
    const key40 = (d: number) => 'k'.repeat(36) + String(d).padStart(4, '0')
    let inner: Record<string, unknown> = {}
    for (let i = 0; i < 20_000; i++) inner[`token${i}`] = 'v'
    for (let d = 0; d < 58; d++) inner = { [key40(d)]: inner }
    const w = wf([cfgNode('n', inner)])
    const [scan, scanMs] = timed(() => scanSecrets(w))
    const [warnings, lintMs] = timed(() => lintWorkflow(w, nodeDefinitions))
    expect(scan.findings.length).toBeLessThanOrEqual(MAX_FINDINGS_PER_SCAN)
    expect(scan.omitted.perNode.get('n'), 'every finding past the cap is only counted').toEqual({ high: 0, medium: 20_000 - MAX_FINDINGS_PER_SCAN })
    expect(scan.findings.every((x) => x.path.length <= MAX_PATH_LENGTH)).toBe(true)
    expect(scan.findings.reduce((sum, x) => sum + x.path.length, 0)).toBeLessThan(300_000)
    const secret = warnings.filter((x) => x.code.startsWith('secret'))
    expect(secret.length).toBeLessThanOrEqual(MAX_FINDINGS_PER_SCAN)
    expect(secret.reduce((sum, x) => sum + x.message.length + (x.field?.length ?? 0), 0)).toBeLessThan(300_000)
    expect(scanMs + lintMs, `scan ${scanMs.toFixed(0)} ms, lint ${lintMs.toFixed(0)} ms`).toBeLessThan(1500)
  }, 30_000)

  test.each([2_000, 10_000, 20_000])('a %i-level single-key chain with a finding at every level stays bounded', (levels) => {
    let chain: Record<string, unknown> = { token: 'v' }
    for (let i = 1; i < levels; i++) chain = { token: 'v', n: chain }
    const [scan, ms] = timed(() => scanSecrets(wf([cfgNode('n', chain)])))
    expect(scan.findings.length).toBe(MAX_FINDINGS_PER_SCAN)
    expect(scan.omitted.perNode.get('n')).toEqual({ high: 0, medium: levels - MAX_FINDINGS_PER_SCAN })
    expect(scan.findings.every((x) => x.path.length <= MAX_PATH_LENGTH)).toBe(true)
    expect(ms, `${ms.toFixed(0)} ms`).toBeLessThan(LIMIT_MS)
  }, 30_000)

  test('a 200,000-level deep value (built without recursion) does not overflow the stack', () => {
    let nested: Record<string, unknown> = { password: 'p' }
    for (let i = 0; i < 200_000; i++) nested = { n: nested }
    const [objects, ms1] = timed(() => find(nested))
    expect(objects.length).toBe(1)
    expect(objects[0].path.startsWith('n.n.n.')).toBe(true)
    expect(objects[0].path.length).toBeLessThanOrEqual(MAX_PATH_LENGTH) // the cap: the full path would be 400,008 characters
    expect(objects[0].path.endsWith('...')).toBe(true)
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
// Labelled, so that a failing assertion prints WHICH needle leaked and never the needle itself (a token would reach the log).
const NEEDLES: [string, string][] = [
  ['sentinel', SENTINEL],
  ['first 8 characters', SENTINEL.slice(0, 8)],
  ['last 8 characters', SENTINEL.slice(-8)],
  ['hash (hex)', fnv(SENTINEL).toString(16)],
  ['hash (decimal)', String(fnv(SENTINEL))],
]
const leaked = (value: unknown): string[] => {
  const text = JSON.stringify(value)
  return NEEDLES.filter(([, needle]) => text.includes(needle)).map(([label]) => label)
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
    { name: 'a key with a colon and a space, holding the sentinel', config: { ['token: ' + SENTINEL]: { password: 'p' } } },
    { name: 'a key with an equals sign, glued to the sentinel', config: { headers: { ['password=' + SENTINEL]: 'v' } } },
  ]

  test('the sentinel is detectable by the needles (the check itself works)', () => {
    expect(leaked({ x: SENTINEL })).toEqual(['sentinel', 'first 8 characters', 'last 8 characters'])
    expect(leaked({ x: `h ${fnv(SENTINEL).toString(16)} ${fnv(SENTINEL)}` })).toEqual(['hash (hex)', 'hash (decimal)'])
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

import { describe, expect, test } from 'vitest'
import { nodeDefinitions } from '../catalog'
import { WARNING_CODES, lintWorkflow } from './lint'
import type { Warning, WarningCode } from './lint'
import type { NodeCategory, NodeDefinition, PortDefinition, Workflow, WorkflowEdge, WorkflowNode } from './types'

// ---------------------------------------------------------------------------
// Helpers and a synthetic catalog (every category, mixed branch and plain outputs)
// ---------------------------------------------------------------------------

const port = (name: string, extra: Partial<PortDefinition> = {}): PortDefinition => ({ name, label: name.toUpperCase(), dataType: 'any', ...extra })

const def = (type: string, category: NodeCategory, inputs: PortDefinition[], outputs: PortDefinition[], required: string[] = []): NodeDefinition => ({
  type,
  version: 1,
  category,
  label: type,
  description: type,
  icon: 'Box',
  inputs,
  outputs,
  configSchema: { type: 'object', properties: {}, required },
})

const SYNTHETIC: NodeDefinition[] = [
  def('s.trigger', 'Triggers', [], [port('out')]),
  def('s.trigger2', 'Triggers', [], [port('a'), port('b')]),
  def('s.proc', 'AI', [port('in', { required: true }), port('opt')], [port('out')]),
  def('s.integ', 'Integrations', [port('in')], [port('out')]),
  def('s.sink', 'Output', [port('in', { required: true })], []),
  def('s.branch', 'Logic', [port('in', { required: true })], [port('yes', { branch: true }), port('no', { branch: true })]),
  def('s.mixed', 'Logic', [port('in')], [port('br', { branch: true }), port('plain')]),
  def('s.noout', 'AI', [port('in')], []),
  def('s.sinkout', 'Output', [port('in', { required: true })], [port('out')]), // a sink WITH an output port: still never result-unused
  def('s.cfg', 'AI', [port('in')], [port('out')], ['a', 'b', 'c']),
]

const node = (id: string, type: string, config: Record<string, unknown> = {}, label = id): WorkflowNode => ({
  id,
  type,
  typeVersion: 1,
  label,
  config,
  position: { x: 0, y: 0 },
})
const edge = (id: string, from: string, out: string, to: string, inp: string): WorkflowEdge => ({
  id,
  source: { nodeId: from, port: out },
  target: { nodeId: to, port: inp },
})
const wf = (nodes: WorkflowNode[], edges: WorkflowEdge[] = [], extra: Partial<Workflow> = {}): Workflow => ({
  schemaVersion: '1.0',
  id: 'wf',
  name: 'n',
  description: '',
  nodes,
  edges,
  metadata: {},
  ...extra,
})

const lint = (w: Workflow, catalog: NodeDefinition[] = SYNTHETIC) => lintWorkflow(w, catalog)
const key = (w: Warning) => [w.code, w.nodeId, w.port, w.field].filter((p) => p !== undefined).join('|')
const keys = (ws: Warning[]) => ws.map(key)

const deepFreeze = <T>(v: T): T => {
  if (typeof v === 'object' && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const child of Object.values(v)) deepFreeze(child)
  }
  return v
}

// ---------------------------------------------------------------------------
// The five rules
// ---------------------------------------------------------------------------

describe('lintWorkflow: empty inputs', () => {
  test('an empty workflow and an empty catalog give no warnings', () => {
    expect(lint(wf([]))).toEqual([])
    expect(lint(wf([node('a', 's.proc')]), [])).toEqual([])
  })
  test('the code list has the five T7a codes', () => {
    expect([...WARNING_CODES]).toEqual(['required-input-unconnected', 'required-field-empty', 'trigger-not-connected', 'node-unreachable', 'result-unused'])
  })
})

describe('rule 1: required-input-unconnected', () => {
  test('fires for a required input in any category, names the port, and skips optional inputs', () => {
    const w = wf([node('p', 's.proc'), node('k', 's.sink'), node('b', 's.branch')])
    const found = lint(w).filter((x) => x.code === 'required-input-unconnected')
    expect(found.map((x) => [x.nodeId, x.port])).toEqual([['p', 'in'], ['k', 'in'], ['b', 'in']])
    expect(found.every((x) => x.field === undefined && x.severity === 'warning')).toBe(true)
  })
  test('an incoming edge on that port clears it', () => {
    const w = wf([node('t', 's.trigger'), node('p', 's.proc')], [edge('e', 't', 'out', 'p', 'in')])
    expect(keys(lint(w))).not.toContain('required-input-unconnected|p|in')
  })
  test('an edge on another input port does not clear it', () => {
    const w = wf([node('t', 's.trigger'), node('p', 's.proc')], [edge('e', 't', 'out', 'p', 'opt')])
    expect(keys(lint(w))).toContain('required-input-unconnected|p|in')
  })
  test('an edge to a port the node does not have, or from a missing node, does not clear it', () => {
    const w = wf([node('t', 's.trigger'), node('p', 's.proc')], [edge('e1', 't', 'out', 'p', 'nope'), edge('e2', 'ghost', 'out', 'p', 'in')])
    expect(keys(lint(w))).toContain('required-input-unconnected|p|in')
  })
  test('an edge whose source port is not an output of its node is ignored', () => {
    const w = wf([node('t', 's.trigger'), node('p', 's.proc')], [edge('e', 't', 'in', 'p', 'in')])
    expect(keys(lint(w))).toContain('required-input-unconnected|p|in')
  })
  test('several required inputs warn in catalog order', () => {
    const two = def('s.two', 'AI', [port('z', { required: true }), port('y', { required: true })], [])
    expect(keys(lint(wf([node('n', 's.two')]), [two]))).toEqual(['required-input-unconnected|n|z', 'required-input-unconnected|n|y'])
  })
})

describe('rule 2: required-field-empty', () => {
  // only this rule's warnings: s.cfg also has an unused output
  const only = (w: Workflow) => keys(lint(w).filter((x) => x.code === 'required-field-empty'))
  const CFG = (config: Record<string, unknown>) => only(wf([node('n', 's.cfg', config)]))

  test('absent properties warn in the order of the schema required list, naming the field', () => {
    expect(CFG({})).toEqual(['required-field-empty|n|a', 'required-field-empty|n|b', 'required-field-empty|n|c'])
  })
  test.each([
    ['undefined', undefined],
    ['the empty string', ''],
    ['spaces', '   '],
    ['tab and newline', '\t\n'],
    ['a carriage return and a no-break space', '\r' + String.fromCharCode(0xa0)],
    ['a byte order mark (JavaScript trim removes it)', String.fromCharCode(0xfeff)],
    ['the line separator U+2028', String.fromCharCode(0x2028)],
    ['the paragraph separator U+2029', String.fromCharCode(0x2029)],
    ['the ideographic space U+3000', String.fromCharCode(0x3000)],
    ['the ogham space mark U+1680', String.fromCharCode(0x1680)],
    ['an empty array', []],
  ])('%s counts as empty', (_label, value) => {
    expect(CFG({ a: value, b: 'x', c: 'x' })).toEqual(['required-field-empty|n|a'])
  })
  // Near misses that JavaScript trim does NOT remove (contracts/WARNINGS.md): they are text, so not empty.
  test.each([
    ['the next-line control U+0085', 0x85],
    ['the Mongolian vowel separator U+180E', 0x180e],
    ['the zero width space U+200B', 0x200b],
    ['the control character U+001C', 0x1c],
  ])('%s is not trimmed, so it is not empty', (_label, code) => {
    expect(String.fromCharCode(code).trim(), 'the platform trim must agree with the contract').not.toBe('')
    expect(CFG({ a: String.fromCharCode(code), b: 'x', c: 'x' })).toEqual([])
  })
  test('the contract set is exactly the 25 code points JavaScript trim removes', () => {
    const set = [0x9, 0xa, 0xb, 0xc, 0xd, 0x20, 0xa0, 0x1680, ...Array.from({ length: 11 }, (_v, i) => 0x2000 + i), 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff]
    expect(set.length).toBe(25)
    const trimmed: number[] = []
    for (let c = 0; c <= 0xffff; c++) if (String.fromCharCode(c).trim() === '' && (c < 0xd800 || c > 0xdfff)) trimmed.push(c)
    expect(trimmed).toEqual(set)
  })
  test.each([
    ['the number 0', 0],
    ['false', false],
    ['an empty object', {}],
    ['null', null],
    ['an array with an item', [0]],
    ['text with surrounding spaces', '  x  '],
    ['the string zero', '0'],
  ])('%s is a value, not empty', (_label, value) => {
    expect(CFG({ a: value, b: 'x', c: 'x' })).toEqual([])
  })
  test('an inherited property is absent (own keys only)', () => {
    const inherited = Object.create({ a: 'x', b: 'x', c: 'x' }) as Record<string, unknown>
    expect(CFG(inherited)).toEqual(['required-field-empty|n|a', 'required-field-empty|n|b', 'required-field-empty|n|c'])
  })
  test('a config that is not an object counts as having no properties', () => {
    const w = wf([{ ...node('n', 's.cfg'), config: 'oops' as unknown as Record<string, unknown> }])
    expect(only(w)).toEqual(['required-field-empty|n|a', 'required-field-empty|n|b', 'required-field-empty|n|c'])
  })
  test('a required property named like Object.prototype members is looked up as an own key', () => {
    const proto = def('s.proto', 'AI', [], [], ['__proto__', 'constructor', 'toString'])
    const own = JSON.parse('{"__proto__":"x","constructor":"x","toString":"x"}') as Record<string, unknown>
    expect(keys(lint(wf([node('n', 's.proto', own)]), [proto]))).toEqual([])
    expect(keys(lint(wf([node('n', 's.proto', {})]), [proto]))).toEqual(['required-field-empty|n|__proto__', 'required-field-empty|n|constructor', 'required-field-empty|n|toString'])
  })
  test('the node needs a catalog definition: an unknown type is skipped', () => {
    expect(lint(wf([node('n', 'ghost.type')]))).toEqual([])
  })
})

describe('rule 3: trigger-not-connected', () => {
  test('a trigger with no outgoing edge warns', () => {
    expect(keys(lint(wf([node('t', 's.trigger')])))).toEqual(['trigger-not-connected|t'])
  })
  test('one connected output among several is enough', () => {
    const w = wf([node('t', 's.trigger2'), node('k', 's.sink')], [edge('e', 't', 'b', 'k', 'in')])
    expect(lint(w)).toEqual([])
  })
  test('a trigger with several outputs, none connected, warns once', () => {
    expect(keys(lint(wf([node('t', 's.trigger2')])))).toEqual(['trigger-not-connected|t'])
  })
  test('a trigger without outputs never warns', () => {
    const none = def('s.trigger0', 'Triggers', [], [])
    expect(lint(wf([node('t', 's.trigger0')]), [none])).toEqual([])
  })
  test('other categories never get this code', () => {
    expect(lint(wf([node('x', 's.integ'), node('k', 's.sink')])).some((w) => w.code === 'trigger-not-connected')).toBe(false)
  })
})

describe('rule 4: node-unreachable', () => {
  test('a node not reachable from a trigger warns, a reachable chain does not', () => {
    const w = wf(
      [node('t', 's.trigger'), node('p', 's.proc'), node('k', 's.sink'), node('i', 's.integ'), node('k2', 's.sink')],
      [edge('e1', 't', 'out', 'p', 'in'), edge('e2', 'p', 'out', 'k', 'in'), edge('e3', 'i', 'out', 'k2', 'in')],
    )
    expect(keys(lint(w))).toEqual(['node-unreachable|i', 'node-unreachable|k2'])
  })
  test('is not evaluated when the graph has no trigger', () => {
    const w = wf([node('i', 's.integ'), node('k', 's.sink')], [edge('e', 'i', 'out', 'k', 'in')])
    expect(lint(w)).toEqual([])
  })
  test('a trigger is never unreachable, not even a second one', () => {
    expect(keys(lint(wf([node('t1', 's.trigger'), node('t2', 's.trigger')])))).toEqual(['trigger-not-connected|t1', 'trigger-not-connected|t2'])
  })
  test('reachability follows edges forwards only', () => {
    // the trigger is the TARGET side of nothing: only i -> k2 goes from the orphan; k2 -> ... never reaches t
    const w = wf([node('t', 's.trigger'), node('k', 's.sink'), node('i', 's.integ')], [edge('e1', 't', 'out', 'k', 'in'), edge('e2', 'i', 'out', 'k', 'in')])
    expect(keys(lint(w))).toContain('node-unreachable|i')
  })
  test('reaches a node through an unknown-type node, which itself is not reported', () => {
    const w = wf([node('t', 's.trigger'), node('g', 'ghost.type'), node('k', 's.sink')], [edge('e1', 't', 'out', 'g', 'anything'), edge('e2', 'g', 'whatever', 'k', 'in')])
    expect(lint(w)).toEqual([])
  })
  test('a trigger with two outputs reaches both of its branches', () => {
    const w = wf(
      [node('t', 's.trigger2'), node('a', 's.integ'), node('b', 's.integ'), node('m', 's.mixed')],
      [edge('e1', 't', 'a', 'a', 'in'), edge('e2', 't', 'b', 'b', 'in'), edge('e3', 'a', 'out', 'm', 'in')],
    )
    expect(keys(lint(w))).toEqual(['result-unused|b', 'result-unused|m'])
  })
  test('suppressed for a node with an unconnected required input and no incoming edge at all', () => {
    expect(keys(lint(wf([node('t', 's.trigger'), node('k', 's.sink')])))).toEqual(['trigger-not-connected|t', 'required-input-unconnected|k|in'])
  })
  test('not suppressed when the node has an incoming edge on another port', () => {
    const w = wf([node('t', 's.trigger'), node('x', 's.integ'), node('p', 's.proc'), node('k', 's.sink')], [edge('e1', 'x', 'out', 'p', 'opt'), edge('e2', 'p', 'out', 'k', 'in')])
    expect(keys(lint(w))).toEqual(['trigger-not-connected|t', 'node-unreachable|x', 'required-input-unconnected|p|in', 'node-unreachable|p', 'node-unreachable|k'])
  })
  test('not suppressed when the node has no required input problem', () => {
    expect(keys(lint(wf([node('t', 's.trigger'), node('i', 's.integ')])))).toEqual(['trigger-not-connected|t', 'node-unreachable|i', 'result-unused|i'])
  })
})

describe('rule 5: result-unused', () => {
  test('fires for a processor in any non-Output, non-Trigger category with outputs and none connected', () => {
    for (const type of ['s.proc', 's.integ', 's.branch', 's.mixed', 's.cfg']) {
      expect(keys(lint(wf([node('x', type)]))), type).toContain('result-unused|x')
    }
  })
  test('never for a sink or a trigger, and not for a node without outputs', () => {
    for (const type of ['s.sink', 's.trigger', 's.noout']) {
      expect(lint(wf([node('x', type)])).some((w) => w.code === 'result-unused'), type).toBe(false)
    }
  })
  test('never for an Output-category node, even one that has an unconnected output port', () => {
    const w = wf([node('t', 's.trigger'), node('k', 's.sinkout')], [edge('e', 't', 'out', 'k', 'in')])
    expect(lint(w)).toEqual([])
    expect(keys(lint(wf([node('k', 's.sinkout')])))).toEqual(['required-input-unconnected|k|in'])
  })
  test('one connected output of several is enough, branch or not', () => {
    const one = (o: string) => wf([node('m', 's.mixed'), node('k', 's.sink')], [edge('e', 'm', o, 'k', 'in')])
    expect(lint(one('br')).some((w) => w.code === 'result-unused')).toBe(false)
    expect(lint(one('plain')).some((w) => w.code === 'result-unused')).toBe(false)
    const b = wf([node('b', 's.branch'), node('k', 's.sink')], [edge('e', 'b', 'yes', 'k', 'in')])
    expect(lint(b).some((w) => w.code === 'result-unused')).toBe(false)
  })
  test('a branch node with no branch connected warns', () => {
    expect(keys(lint(wf([node('b', 's.branch')])))).toContain('result-unused|b')
  })
})

describe('messages', () => {
  test('name the label, falling back to the id, and the port or field', () => {
    const w = wf([node('p', 's.proc', {}, 'My step'), node('q', 's.cfg', {}, '   ')])
    const byKey = new Map(lint(w).map((x) => [key(x), x.message]))
    expect(byKey.get('required-input-unconnected|p|in')).toContain('"My step"')
    expect(byKey.get('required-input-unconnected|p|in')).toContain('IN')
    expect(byKey.get('required-field-empty|q|a')).toContain('"q"')
    expect(byKey.get('required-field-empty|q|a')).toContain('"a"')
  })

  test('never contain a config value or a metadata value', () => {
    const SENTINEL = 'SENTINEL_5d41402abc4b2a76'
    const w = wf(
      [
        node('t', 'trigger.manual', { payload: { secret: SENTINEL } }),
        node('l', 'llm.prompt', { provider: 'ollama', model: SENTINEL, systemPrompt: SENTINEL, prompt: '', temperature: 0.5 }),
        node('h', 'http.request', { method: 'GET', url: '', headers: { Authorization: SENTINEL }, body: SENTINEL }),
        node('c', 'logic.condition', { field: SENTINEL, value: SENTINEL }),
        node('a', 'agent.autonomous', { instructions: SENTINEL }),
        node('o', 'output.result', { format: 'text' }),
      ],
      [],
      { name: SENTINEL, description: SENTINEL, metadata: { note: SENTINEL } },
    )
    const warnings = lint(w, nodeDefinitions)
    expect(warnings.length).toBeGreaterThan(5)
    expect(JSON.stringify(warnings)).not.toContain(SENTINEL)
  })
})

// ---------------------------------------------------------------------------
// Purity, totality, determinism, performance
// ---------------------------------------------------------------------------

describe('purity and determinism', () => {
  const sample = () =>
    wf(
      [node('t', 's.trigger'), node('p', 's.proc'), node('k', 's.sink'), node('o', 's.cfg', { a: '' })],
      [edge('e1', 't', 'out', 'p', 'in'), edge('e2', 'p', 'out', 'k', 'in')],
    )
  test('a deep-frozen workflow and catalog are neither changed nor rejected', () => {
    const w = deepFreeze(sample())
    const c = deepFreeze(structuredClone(SYNTHETIC))
    const before = JSON.stringify([w, c])
    const first = lintWorkflow(w, c)
    expect(JSON.stringify([w, c])).toBe(before)
    expect(first.length).toBeGreaterThan(0)
  })
  test('identical input gives identical output, and the edge array order does not matter', () => {
    const w = sample()
    expect(lint(w)).toEqual(lint(w))
    expect(lint({ ...w, edges: [...w.edges].reverse() })).toEqual(lint(w))
  })
  test('the order is node array order, then rule order, then catalog order', () => {
    const w = wf([node('x', 's.cfg', {}), node('t', 's.trigger'), node('b', 's.proc')])
    expect(keys(lint(w))).toEqual([
      'required-field-empty|x|a',
      'required-field-empty|x|b',
      'required-field-empty|x|c',
      'node-unreachable|x',
      'result-unused|x',
      'trigger-not-connected|t',
      'required-input-unconnected|b|in',
      'result-unused|b',
    ])
  })
})

describe('totality', () => {
  const asWorkflow = (v: unknown) => v as Workflow
  const garbage: unknown[] = [
    undefined,
    null,
    0,
    'text',
    [],
    {},
    { nodes: 'x', edges: 5 },
    { nodes: [null, 1, 'x', [], {}, { id: 1 }, { id: 'a' }, { id: 'a', type: 5, typeVersion: '1', config: 5 }], edges: [null, 3, {}, { source: null, target: {} }, { source: { nodeId: 'a' }, target: { nodeId: 'b', port: 'x' } }] },
    { nodes: [{ id: 'a', type: 's.proc', typeVersion: 1, config: null }, { id: 'a', type: 's.sink', typeVersion: 1 }], edges: [{ id: 'e', source: { nodeId: 'a', port: 'out' }, target: { nodeId: 'a', port: 'in' } }] },
    { nodes: [node('t', 's.trigger')], edges: [edge('e', 't', 'out', 'nowhere', 'in'), edge('e2', 'nowhere', 'out', 't', 'in')] },
  ]
  test.each(garbage.map((g, i) => [i, g] as const))('garbage workflow %i does not throw and returns a list', (_i, g) => {
    expect(Array.isArray(lintWorkflow(asWorkflow(g), SYNTHETIC))).toBe(true)
  })
  test('garbage catalogs and a missing catalog do not throw', () => {
    const w = wf([node('a', 'x'), node('t', 's.trigger')])
    const bad: unknown[] = [undefined, null, 'x', [null, 1, { type: 5 }, { type: 'x', version: 1, category: 'AI', inputs: 'x', outputs: null, configSchema: 5 }, { type: 'x', version: 1 }]]
    for (const c of bad) expect(() => lintWorkflow(w, c as NodeDefinition[])).not.toThrow()
  })
  test('duplicate node ids do not crash and are deterministic', () => {
    const w = wf([node('d', 's.trigger'), node('d', 's.sink'), node('d', 's.proc')], [edge('e', 'd', 'out', 'd', 'in')])
    const warnings = lint(w)
    expect(Array.isArray(warnings)).toBe(true)
    expect(lint(w)).toEqual(warnings)
  })
  // Facts are keyed by the node id string, so every node with a duplicated id shares the first node's connections and
  // reachability (validation rejects duplicate ids before import, so the app never gets here; see lint.ts and WARNINGS.md).
  test('duplicate ids: nodes with the same id share the connections and the reachability of that id', () => {
    // an integration `d` and a trigger `d`, one edge out of `d`: the trigger roots reachability for the id, so neither is unreachable
    const shared = wf([node('d', 's.integ'), node('d', 's.trigger'), node('o', 's.sink')], [edge('e', 'd', 'out', 'o', 'in')])
    expect(lint(shared)).toEqual([])
    // the same graph with a separate unconnected trigger shows what the sharing hides: the integration node IS unreachable then
    const apart = wf([node('d', 's.integ'), node('t', 's.trigger'), node('o', 's.sink')], [edge('e', 'd', 'out', 'o', 'in')])
    expect(keys(lint(apart))).toEqual(['node-unreachable|d', 'trigger-not-connected|t', 'node-unreachable|o'])
    // two outputs with the id `o` and one edge into `o`: neither warns about a missing input
    const twoSinks = wf([node('t', 's.trigger'), node('o', 's.sink'), node('o', 's.sink')], [edge('e', 't', 'out', 'o', 'in')])
    expect(lint(twoSinks)).toEqual([])
  })
  test('ids named like Object.prototype members behave like ordinary ids', () => {
    const names = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']
    const build = (ids: string[]) =>
      wf(
        [node(ids[0], 's.trigger'), node(ids[1], 's.proc'), node(ids[2], 's.sink'), node(ids[3], 's.integ'), node(ids[4], 's.sink')],
        [edge('e1', ids[0], 'out', ids[1], 'in'), edge('e2', ids[1], 'out', ids[2], 'in'), edge('e3', ids[3], 'out', ids[4], 'in')],
      )
    const plain = lint(build(['a', 'b', 'c', 'd', 'e']))
    const odd = lint(build(names))
    expect(plain.length).toBeGreaterThan(0)
    const rename = new Map(['a', 'b', 'c', 'd', 'e'].map((id, i) => [id, names[i]]))
    expect(odd.map((x) => [x.code, x.nodeId, x.port, x.field])).toEqual(plain.map((x) => [x.code, rename.get(x.nodeId), x.port, x.field]))
  })
  test('an edge from or to a missing node named like a prototype member is ignored', () => {
    for (const ghost of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      const from = wf([node('t', 's.trigger'), node('p', 's.proc')], [edge('e', ghost, 'out', 'p', 'in')])
      expect(keys(lint(from)), `from ${ghost}`).toEqual(['trigger-not-connected|t', 'required-input-unconnected|p|in', 'result-unused|p'])
      const to = wf([node('t', 's.trigger'), node('p', 's.proc')], [edge('e', 't', 'out', ghost, 'in')])
      expect(keys(lint(to)), `to ${ghost}`).toEqual(['trigger-not-connected|t', 'required-input-unconnected|p|in', 'result-unused|p'])
    }
  })
  test('an inherited name is never treated as a connected port or a reached node', () => {
    const w = wf([node('t', 's.trigger'), node('toString', 's.proc')], [])
    expect(keys(lint(w))).toEqual(['trigger-not-connected|t', 'required-input-unconnected|toString|in', 'result-unused|toString'])
  })
})

describe('performance', () => {
  const chain = (n: number): Workflow => {
    const nodes: WorkflowNode[] = [node('t', 'trigger.manual', { payload: {} })]
    const edges: WorkflowEdge[] = []
    let previous = 't'
    let previousPort = 'data'
    for (let i = 0; i < n; i++) {
      const id = `l${i}`
      nodes.push(node(id, 'llm.prompt', { provider: 'ollama', prompt: 'x' }))
      edges.push(edge(`e${i}`, previous, previousPort, id, 'input'))
      previous = id
      previousPort = 'text'
    }
    nodes.push(node('o', 'output.result', { format: 'text' }))
    edges.push(edge('eo', previous, previousPort, 'o', 'input'))
    return wf(nodes, edges)
  }
  // A trigger fanned out to n processors: the BFS queue grows to n items (a chain keeps it at one), and n warnings are made.
  const star = (n: number): Workflow => {
    const nodes: WorkflowNode[] = [node('t', 'trigger.manual', { payload: {} })]
    const edges: WorkflowEdge[] = []
    for (let i = 0; i < n; i++) {
      nodes.push(node(`l${i}`, 'llm.prompt', { provider: 'ollama', prompt: 'x' }))
      edges.push(edge(`e${i}`, 't', 'data', `l${i}`, 'input'))
    }
    return wf(nodes, edges)
  }
  /** The best of three runs, in milliseconds (the minimum is the least noisy estimate of the cost). */
  const best = (w: Workflow, warningCount: number): number => {
    let min = Infinity
    for (let i = 0; i < 3; i++) {
      const started = performance.now()
      const warnings = lint(w, nodeDefinitions)
      min = Math.min(min, performance.now() - started)
      expect(warnings.length).toBe(warningCount)
    }
    return min
  }

  // A quadratic version (a find per edge endpoint, a shift per queue item) costs about 100 times more for 10 times more
  // nodes; a linear one about 10. The ratio is the signal, the absolute ceiling is only a generous backstop.
  test.each([
    ['chain', chain, () => 0],
    ['star', star, (n: number) => n], // every processor of the star has an unused result
  ] as const)('the cost scales about linearly on a %s: 50,000 nodes cost far less than 100 times 5,000 nodes', (_shape, build, count) => {
    const small = build(5000)
    const large = build(50_000)
    best(small, count(5000)) // warm-up for the JIT, not measured
    const t5 = best(small, count(5000))
    const t50 = best(large, count(50_000))
    expect(t50, `50,000 nodes took ${t50} ms`).toBeLessThan(5000)
    expect(t50 / Math.max(t5, 1), `5,000 nodes took ${t5} ms, 50,000 took ${t50} ms`).toBeLessThan(40)
  }, 120_000)
})

// ---------------------------------------------------------------------------
// Seeded property test against an independent reference
// ---------------------------------------------------------------------------

// A small seeded generator (mulberry32), so a failure is reproducible.
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

type Plain = { code: WarningCode; nodeId: string; port?: string; field?: string }

/**
 * The reference. Deliberately a different shape from lint.ts: plain arrays and predicates instead of Maps, an edge TABLE
 * queried by scanning, reachability by an iterative fixpoint over that table instead of a queue, and one predicate per rule.
 */
function reference(w: Record<string, unknown>, catalog: NodeDefinition[]): Plain[] {
  const nodes = (w.nodes as unknown[]).filter((n): n is Record<string, unknown> => isObj(n) && typeof n.id === 'string')
  const defOf = (n: Record<string, unknown>) => catalog.find((d) => d.type === n.type && d.version === n.typeVersion)
  const firstWithId = (id: string) => nodes.find((n) => n.id === id)
  type Row = { from: string; out: string; to: string; inp: string }
  const table: Row[] = []
  for (const e of w.edges as unknown[]) {
    if (!isObj(e) || !isObj(e.source) || !isObj(e.target)) continue
    const row = { from: e.source.nodeId, out: e.source.port, to: e.target.nodeId, inp: e.target.port }
    if (![row.from, row.out, row.to, row.inp].every((v) => typeof v === 'string')) continue
    const r = row as Row
    const a = firstWithId(r.from)
    const b = firstWithId(r.to)
    if (!a || !b) continue
    const da = defOf(a)
    const db = defOf(b)
    if (da && !da.outputs.some((p) => p.name === r.out)) continue
    if (db && !db.inputs.some((p) => p.name === r.inp)) continue
    table.push(r)
  }
  const isTrigger = (n: Record<string, unknown>) => defOf(n)?.category === 'Triggers'
  const reached = new Set(nodes.filter(isTrigger).map((n) => n.id as string))
  for (let changed = true; changed; ) {
    changed = false
    for (const r of table) {
      if (reached.has(r.from) && !reached.has(r.to)) {
        reached.add(r.to)
        changed = true
      }
    }
  }
  const anyTrigger = nodes.some(isTrigger)
  const blank = (v: unknown) => v === undefined || (typeof v === 'string' && /^\s*$/.test(v)) || (Array.isArray(v) && v.length === 0)

  const out: Plain[] = []
  for (const n of nodes) {
    const d = defOf(n)
    if (!d) continue
    const id = n.id as string
    const cfg = isObj(n.config) ? n.config : {}
    const hasIn = table.some((r) => r.to === id)
    const unconnectedRequired = d.inputs.filter((p) => p.required === true && !table.some((r) => r.to === id && r.inp === p.name))
    const outputsUsed = d.outputs.some((p) => table.some((r) => r.from === id && r.out === p.name))

    for (const p of unconnectedRequired) out.push({ code: 'required-input-unconnected', nodeId: id, port: p.name })
    for (const f of d.configSchema.required ?? []) {
      if (blank(Object.prototype.hasOwnProperty.call(cfg, f) ? cfg[f] : undefined)) out.push({ code: 'required-field-empty', nodeId: id, field: f })
    }
    if (d.category === 'Triggers' && d.outputs.length > 0 && !outputsUsed) out.push({ code: 'trigger-not-connected', nodeId: id })
    if (d.category !== 'Triggers' && anyTrigger && !reached.has(id) && !(unconnectedRequired.length > 0 && !hasIn)) {
      out.push({ code: 'node-unreachable', nodeId: id })
    }
    if (d.category !== 'Output' && d.category !== 'Triggers' && d.outputs.length > 0 && !outputsUsed) out.push({ code: 'result-unused', nodeId: id })
  }
  return out
}

const strip = (ws: Warning[]): Plain[] =>
  ws.map((w) => ({ code: w.code, nodeId: w.nodeId, ...(w.port === undefined ? {} : { port: w.port }), ...(w.field === undefined ? {} : { field: w.field }) }))

describe('property test: lintWorkflow equals an independent reference', () => {
  const IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', '__proto__', 'constructor', 'toString']
  const PORTS = ['data', 'text', 'body', 'status', 'true', 'false', 'output', 'messages', 'input', 'tools', 'nope', '__proto__']
  const KEYS = ['provider', 'prompt', 'method', 'url', 'operator', 'format', 'payload', 'model', 'temperature', 'constructor']
  const VALUES: unknown[] = ['', '  ', '\t', 'x', 'ollama', [], [1], 0, false, {}, null, 'GET']
  const TYPES = nodeDefinitions.map((d) => [d.type, d.version] as const)

  test('1,500 random graphs, six node types, random configs and edges', () => {
    const rand = rng(20261112)
    const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]
    let withWarnings = 0
    const seen = new Set<WarningCode>()
    for (let run = 0; run < 1500; run++) {
      const nodes: unknown[] = []
      const nodeCount = Math.floor(rand() * 9)
      for (let i = 0; i < nodeCount; i++) {
        const [type, version] = rand() < 0.08 ? (['ghost.type', 1] as const) : pick(TYPES)
        const config: Record<string, unknown> = {}
        for (const k of KEYS) if (rand() < 0.4) config[k] = pick(VALUES)
        nodes.push({
          id: rand() < 0.04 ? 7 : pick(IDS),
          type,
          typeVersion: rand() < 0.04 ? '1' : version,
          label: pick(['', 'Label', 'x']),
          config: rand() < 0.04 ? pick([null, 'x', []]) : config,
          position: { x: 0, y: 0 },
        })
      }
      const edges: unknown[] = []
      const edgeCount = Math.floor(rand() * 13)
      for (let i = 0; i < edgeCount; i++) {
        if (rand() < 0.04) {
          edges.push(pick([null, 3, {}, { source: null, target: {} }]))
          continue
        }
        edges.push({ id: `e${i}`, source: { nodeId: rand() < 0.1 ? 'zz' : pick(IDS), port: pick(PORTS) }, target: { nodeId: rand() < 0.1 ? 'zz' : pick(IDS), port: pick(PORTS) } })
      }
      const workflow = { ...wf([]), nodes, edges } as unknown as Workflow
      const actual = lintWorkflow(workflow, nodeDefinitions)
      const expected = reference(workflow as unknown as Record<string, unknown>, nodeDefinitions)
      expect(strip(actual), `run ${run}: ${JSON.stringify(workflow)}`).toEqual(expected)
      if (actual.length > 0) withWarnings++
      for (const w of actual) seen.add(w.code)
    }
    // the generator must actually exercise the rules, or the comparison proves nothing
    expect(withWarnings).toBeGreaterThan(1000)
    expect([...seen].sort()).toEqual([...WARNING_CODES].sort())
  })
})

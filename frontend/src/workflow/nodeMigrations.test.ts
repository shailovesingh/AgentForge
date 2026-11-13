import { describe, expect, test } from 'vitest'
import { getLatestNodeDefinition, nodeDefinitions } from '../catalog'
import { MAX_ERRORS } from './errors'
import { NODE_MIGRATIONS, migrateNodes } from './nodeMigrations'
import type { NodeMigration } from './nodeMigrations'
import { importWorkflow, serializeWorkflow } from './serialize'
import type { NodeDefinition } from './types'
import { validateWorkflow } from './validate'

type Doc = Record<string, unknown>

const agent = (id: string, maxIterations?: unknown, typeVersion = 1) => ({
  id,
  type: 'agent.autonomous',
  typeVersion,
  label: id,
  config: maxIterations === undefined ? { provider: 'ollama' } : { provider: 'ollama', maxIterations },
  position: { x: 0, y: 0 },
})
const doc = (nodes: unknown[], edges: unknown[] = []): Doc => ({
  schemaVersion: '1.0',
  id: 'wf',
  name: 'n',
  description: '',
  nodes,
  edges,
  metadata: {},
})
const migrate = (d: Doc, catalog = nodeDefinitions, registry?: NodeMigration[]) => migrateNodes(d, catalog, registry)

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

// --- a synthetic catalog and registries, so rules the real registry does not exercise (chains, renames) are tested ---
const synth = (type: string, version: number): NodeDefinition => ({ ...nodeDefinitions[0], type, version })
const step = (type: string, from: number, to: number, migrate: NodeMigration['migrate']): NodeMigration => ({ type, from, to, migrate })
const sNode = (id: string, typeVersion: number, type = 'x.node', config: Record<string, unknown> = {}) => ({
  id,
  type,
  typeVersion,
  label: id,
  config,
  position: { x: 0, y: 0 },
})
const addKey = (key: string, note: string) => (n: { config: Record<string, unknown> }) => ({
  config: { ...n.config, [key]: true },
  notes: [note],
})

describe('the real registry', () => {
  test('agent.autonomous 1 -> 2 rounds a fractional maxIterations and reports it', () => {
    const input = doc([agent('a', 2.5)])
    const result = migrate(input)
    expect(result).toEqual({
      ok: true,
      doc: doc([agent('a', 3, 2)]),
      upgrades: [
        { nodeId: 'a', type: 'agent.autonomous', from: 1, to: 2, notes: ['maxIterations 2.5 was not a whole number and was rounded to 3'] },
      ],
    })
  })

  test('registry integrity: ordered by (type, from), no duplicates, steps of one version, and every catalog type has a complete chain', () => {
    const keys = NODE_MIGRATIONS.map((m) => `${m.type}@${m.from}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect([...NODE_MIGRATIONS].sort((a, b) => (a.type === b.type ? a.from - b.from : a.type < b.type ? -1 : 1))).toEqual(NODE_MIGRATIONS)
    for (const m of NODE_MIGRATIONS) {
      expect(m.to, `${m.type}@${m.from}`).toBe(m.from + 1)
      expect(getLatestNodeDefinition(m.type), `${m.type} must exist in the catalog`).toBeDefined()
    }
    // every version below the latest has a step, so an old file can always be brought to the latest
    for (const def of nodeDefinitions) {
      for (let v = 1; v < def.version; v++) expect(keys, `${def.type}@${v}`).toContain(`${def.type}@${v}`)
    }
  })

  test('the catalog serves exactly one definition per type, at its latest version', () => {
    const types = nodeDefinitions.map((d) => d.type)
    expect(new Set(types).size).toBe(types.length)
    expect(getLatestNodeDefinition('agent.autonomous')!.version).toBe(2)
  })

  test('maxIterations is rounded HALF UP: the table, including cases where half to even (Python round) differs', () => {
    const rounded: [number, number][] = [
      [1.4, 1], [1.5, 2], [1.6, 2], [2.4, 2], [2.5, 3], [3.5, 4], [48.5, 49], [49.4, 49], [49.5, 50], [49.9, 50], [1.0000001, 1],
    ]
    for (const [from, to] of rounded) {
      const r = migrate(doc([agent('a', from)]))
      expect(r.ok && (r.doc.nodes as ReturnType<typeof agent>[])[0].config.maxIterations, String(from)).toBe(to)
      expect(r.ok && r.upgrades[0].notes, String(from)).toEqual([`maxIterations ${from} was not a whole number and was rounded to ${to}`])
    }
  })

  test('every other value is left unchanged with no note (validation then says what version 1 would have said)', () => {
    const untouched: unknown[] = [10, 1, 50, 0.5, 0.99, 50.4, 50.0001, 51, 0, -2.5, -1, '2.5', null, true, [], {}, [2.5], NaN, Infinity, -Infinity, 1e300, 2.5e-9]
    for (const value of untouched) {
      const r = migrate(doc([agent('a', value)]))
      expect(r.ok, String(value)).toBe(true)
      if (!r.ok) continue
      const node = (r.doc.nodes as ReturnType<typeof agent>[])[0]
      expect(node.typeVersion).toBe(2)
      expect(Object.is(node.config.maxIterations, value) || JSON.stringify(node.config.maxIterations) === JSON.stringify(value), String(value)).toBe(true)
      expect(r.upgrades[0].notes, String(value)).toEqual([])
    }
    // an absent value stays absent (not added, not set to undefined)
    const absent = migrate(doc([agent('a')]))
    expect(absent.ok && Object.hasOwn((absent.doc.nodes as ReturnType<typeof agent>[])[0].config, 'maxIterations')).toBe(false)
  })

  test('a node already at version 2 is untouched: 2.5 there is a schema.type error, not silently rounded', () => {
    const r = migrate(doc([agent('a', 2.5, 2)]))
    expect(r).toEqual({ ok: true, doc: doc([agent('a', 2.5, 2)]), upgrades: [] })
    const imported = importWorkflow(JSON.stringify(doc([agent('a', 2.5, 2)])), nodeDefinitions)
    expect(imported.ok).toBe(false)
    expect(!imported.ok && imported.errors.map((e) => [e.code, e.path])).toEqual([['schema.type', '/nodes/0/config/maxIterations']])
  })

  test('validateWorkflow on its own: a known type at a bad version is a version error, an unknown TYPE stays node.unknown-type', () => {
    const v1 = validateWorkflow(doc([agent('a', 3)]), nodeDefinitions)
    expect(!v1.ok && v1.errors.map((e) => [e.code, e.path])).toEqual([['node.no-migration-path', '/nodes/0/typeVersion']])
    // the message must not claim there is no migration: there is one, validateWorkflow just was not given a migrated document
    expect(!v1.ok && v1.errors[0].message).toContain('has not been migrated')
    expect(!v1.ok && v1.errors[0].message).not.toMatch(/no migration/)
    const newer = validateWorkflow(doc([agent('a', 3, 3)]), nodeDefinitions)
    expect(!newer.ok && newer.errors.map((e) => [e.code, e.path])).toEqual([['node.version-newer', '/nodes/0/typeVersion']])
    const unknown = validateWorkflow(doc([sNode('m', 99, 'mystery.node')]), nodeDefinitions)
    expect(!unknown.ok && unknown.errors.map((e) => [e.code, e.path])).toEqual([['node.unknown-type', '/nodes/0/type']])
  })
})

describe('migrateNodes with synthetic registries', () => {
  const catalog3 = [synth('x.node', 3)]
  const chain: NodeMigration[] = [step('x.node', 1, 2, addKey('two', 'to two')), step('x.node', 2, 3, addKey('three', 'to three'))]

  test('follows a chain of three steps: one report, from the original version to the latest, notes in step order', () => {
    const r = migrate(doc([sNode('n', 1)]), catalog3, chain)
    expect(r).toEqual({
      ok: true,
      doc: doc([sNode('n', 3, 'x.node', { two: true, three: true })]),
      upgrades: [{ nodeId: 'n', type: 'x.node', from: 1, to: 3, notes: ['to two', 'to three'] }],
    })
    // starting in the middle runs only the remaining step
    const mid = migrate(doc([sNode('n', 2)]), catalog3, chain)
    expect(mid.ok && mid.upgrades).toEqual([{ nodeId: 'n', type: 'x.node', from: 2, to: 3, notes: ['to three'] }])
  })

  test('the loop stops at the latest version: a registered step beyond it is never run', () => {
    const beyond = [...chain, step('x.node', 3, 4, addKey('four', 'to four'))]
    const r = migrate(doc([sNode('n', 1)]), catalog3, beyond)
    expect(r.ok && (r.doc.nodes as ReturnType<typeof sNode>[])[0]).toEqual(sNode('n', 3, 'x.node', { two: true, three: true }))
    // and a step that would jump past the latest is not a path
    const jump = [step('x.node', 1, 5, addKey('five', 'jump'))]
    expect(migrate(doc([sNode('n', 1)]), catalog3, jump)).toMatchObject({ ok: false, errors: [{ code: 'node.no-migration-path', path: '/nodes/0/typeVersion' }] })
  })

  test('a gap, or a version below the first step, is node.no-migration-path (and no migration runs)', () => {
    let ran = false
    const spy = (n: { config: Record<string, unknown> }) => ((ran = true), { config: n.config, notes: [] })
    const gap = [step('x.node', 1, 2, spy)] // nothing from 2 to 3
    expect(migrate(doc([sNode('n', 1)]), catalog3, gap)).toMatchObject({ ok: false, errors: [{ code: 'node.no-migration-path', path: '/nodes/0/typeVersion' }] })
    expect(ran).toBe(false)
    const startsLate = [step('x.node', 2, 3, spy)]
    expect(migrate(doc([sNode('n', 1)]), catalog3, startsLate)).toMatchObject({ ok: false, errors: [{ code: 'node.no-migration-path' }] })
    expect(migrate(doc([sNode('n', 0)]), catalog3, chain)).toMatchObject({ ok: false, errors: [{ code: 'node.no-migration-path' }] })
    expect(migrate(doc([sNode('n', -4)]), catalog3, chain)).toMatchObject({ ok: false, errors: [{ code: 'node.no-migration-path' }] })
    expect(ran).toBe(false)
  })

  test('a version newer than the catalog is node.version-newer, not a gap', () => {
    const r = migrate(doc([sNode('n', 4)]), catalog3, chain)
    expect(r).toMatchObject({ ok: false, errors: [{ code: 'node.version-newer', path: '/nodes/0/typeVersion' }] })
    expect(!r.ok && r.errors[0].message).toContain('newer editor')
  })

  test('the error list is capped at MAX_ERRORS: 25 bad-version nodes give exactly 20 errors, the first 20 in node order', () => {
    const nodes = Array.from({ length: 25 }, (_, i) => sNode(`n${i}`, 9))
    const r = migrate(doc(nodes), catalog3, chain)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.errors).toHaveLength(MAX_ERRORS)
    expect(!r.ok && r.errors.map((e) => e.path)).toEqual(Array.from({ length: MAX_ERRORS }, (_, i) => `/nodes/${i}/typeVersion`))
    // gaps count toward the same cap
    const mixed = migrate(doc(Array.from({ length: 25 }, (_, i) => sNode(`n${i}`, i % 2 === 0 ? 9 : 0))), catalog3, chain)
    expect(!mixed.ok && mixed.errors).toHaveLength(MAX_ERRORS)
  })

  test('errors are collected for every node and then nothing is migrated', () => {
    const r = migrate(doc([sNode('ok', 1), sNode('new', 9), sNode('old', 0)]), catalog3, chain)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.errors.map((e) => [e.code, e.path])).toEqual([
      ['node.version-newer', '/nodes/1/typeVersion'],
      ['node.no-migration-path', '/nodes/2/typeVersion'],
    ])
  })

  test('port renames rewrite the matching edge ends (source via outputs, target via inputs) and leave other edges alone', () => {
    const catalog = [synth('x.node', 2), synth('y.node', 1)]
    const registry = [
      step('x.node', 1, 2, (n) => ({ config: n.config, notes: [], portRenames: { inputs: { in: 'input' }, outputs: { out: 'output' } } })),
    ]
    const edge = (id: string, s: [string, string], t: [string, string]) => ({ id, source: { nodeId: s[0], port: s[1] }, target: { nodeId: t[0], port: t[1] } })
    const input = doc(
      [sNode('x', 1), sNode('y', 1, 'y.node')],
      [
        edge('e1', ['y', 'out'], ['x', 'in']), // target port of the migrated node: renamed
        edge('e2', ['x', 'out'], ['y', 'in']), // source port of the migrated node: renamed; the target (other node) is not
        edge('e3', ['y', 'out'], ['y', 'in']), // not the migrated node: untouched
        edge('e4', ['x', 'in'], ['y', 'out']), // an INPUT name on the source side is not an output name: untouched
        edge('e5', ['x', 'other'], ['x', 'other2']), // not in the rename map: untouched
        'not an edge',
        { id: 'e6' },
      ],
    )
    const r = migrate(input, catalog, registry)
    expect(r.ok && r.doc.edges).toEqual([
      edge('e1', ['y', 'out'], ['x', 'input']),
      edge('e2', ['x', 'output'], ['y', 'in']),
      edge('e3', ['y', 'out'], ['y', 'in']),
      edge('e4', ['x', 'in'], ['y', 'out']),
      edge('e5', ['x', 'other'], ['x', 'other2']),
      'not an edge',
      { id: 'e6' },
    ])
  })

  test('renames of a chain compose in step order', () => {
    const catalog = [synth('x.node', 3)]
    const registry = [
      step('x.node', 1, 2, (n) => ({ config: n.config, notes: [], portRenames: { inputs: { a: 'b' } } })),
      step('x.node', 2, 3, (n) => ({ config: n.config, notes: [], portRenames: { inputs: { b: 'c' } } })),
    ]
    const edges = [{ id: 'e', source: { nodeId: 'z', port: 'p' }, target: { nodeId: 'x', port: 'a' } }]
    const r = migrate(doc([sNode('x', 1)], edges), catalog, registry)
    expect(r.ok && (r.doc.edges as typeof edges)[0].target.port).toBe('c')
  })

  test('prototype-named types, ports and ids are ordinary data (own-property lookups only)', () => {
    const names = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']
    // types that are not in the catalog stay untouched and raise nothing, whatever their version
    for (const type of names) {
      const input = doc([sNode('n', 1, type), sNode('m', 99, type)])
      expect(migrate(input)).toEqual({ ok: true, doc: input, upgrades: [] })
    }
    // a catalog type and a registry step named like a prototype member work as any other
    const catalog = [synth('constructor', 2)]
    const registry = [step('constructor', 1, 2, addKey('migrated', 'ok'))]
    const r = migrate(doc([sNode('n', 1, 'constructor')]), catalog, registry)
    expect(r.ok && r.upgrades).toEqual([{ nodeId: 'n', type: 'constructor', from: 1, to: 2, notes: ['ok'] }])
    // port names such as constructor/__proto__/toString are not looked up through the prototype chain
    const renames = [step('x.node', 1, 2, (n) => ({ config: n.config, notes: [], portRenames: { inputs: { a: 'b' }, outputs: { a: 'b' } } }))]
    const edges = names.map((port, i) => ({ id: `e${i}`, source: { nodeId: 'x', port }, target: { nodeId: 'x', port } }))
    const renamed = migrate(doc([sNode('x', 1)], edges), [synth('x.node', 2)], renames)
    expect(renamed.ok && renamed.doc.edges).toEqual(edges)
    // an id such as __proto__ is an ordinary node id for the edge rewrite
    const protoEdges = [{ id: 'e', source: { nodeId: 'q', port: 'p' }, target: { nodeId: '__proto__', port: 'a' } }]
    const protoRenames = [step('x.node', 1, 2, (n) => ({ config: n.config, notes: [], portRenames: { inputs: { a: 'b' } } }))]
    const p = migrate(doc([sNode('__proto__', 1)], protoEdges), [synth('x.node', 2)], protoRenames)
    expect(p.ok && (p.doc.edges as typeof protoEdges)[0].target.port).toBe('b')
  })

  test('malformed nodes, nodes of unknown types and a non-array nodes value are left for the validator', () => {
    const odd: unknown[] = [
      5,
      null,
      [],
      { id: 1, type: 'agent.autonomous', typeVersion: 1 },
      { id: 'a', type: 7, typeVersion: 1 },
      { id: 'b', type: 'agent.autonomous', typeVersion: 1.5, label: 'b', config: {} },
      { id: 'c', type: 'agent.autonomous', typeVersion: '1', label: 'c', config: {} },
      { id: 'd', type: 'agent.autonomous', typeVersion: 1, config: { maxIterations: 2.5 } }, // no label
      { id: 'e', type: 'agent.autonomous', typeVersion: 1, label: 'e', config: [2.5] }, // config is not an object
      { id: 'f', type: 'agent.autonomous', typeVersion: 1, label: 'f', config: null },
      { id: 'g', type: 'mystery.node', typeVersion: 99, label: 'g', config: {} },
    ]
    const input = doc(odd)
    expect(migrate(input)).toEqual({ ok: true, doc: input, upgrades: [] })
    const noNodes = { schemaVersion: '1.0', nodes: 'x' }
    expect(migrate(noNodes)).toEqual({ ok: true, doc: noNodes, upgrades: [] })
  })

  test('never mutates its input, even when it is deeply frozen, and the result has no hidden link that mutates it', () => {
    const edges = [{ id: 'e', source: { nodeId: 'z', port: 'p' }, target: { nodeId: 'x', port: 'a' } }]
    const registry = [step('x.node', 1, 2, (n) => ({ config: { ...n.config, a: 1 }, notes: ['n'], portRenames: { inputs: { a: 'b' } } }))]
    const input = deepFreeze(doc([sNode('x', 1, 'x.node', { k: { deep: [1] } }), sNode('y', 2)], edges))
    const before = structuredClone(input)
    const r = migrate(input, [synth('x.node', 2)], registry)
    expect(r.ok && r.upgrades).toHaveLength(1)
    expect(input).toEqual(before)
    // the real registry too
    const real = deepFreeze(doc([agent('a', 2.5), agent('b', 7)]))
    const realBefore = structuredClone(real)
    expect(migrate(real).ok).toBe(true)
    expect(real).toEqual(realBefore)
    expect(Object.isFrozen(r.ok && r.doc)).toBe(false) // new objects, not the frozen input handed back
  })

  test('an agent array with 5,000 nodes migrates quickly and keeps the order', () => {
    const nodes = Array.from({ length: 5000 }, (_, i) => agent(`a${i}`, 2.5))
    const r = migrate(doc(nodes))
    expect(r.ok && r.upgrades.map((u) => u.nodeId)).toEqual(nodes.map((n) => n.id))
  })
})

describe('the pipeline: property test over generated agent version 1 configs', () => {
  // mulberry32: a small seeded generator, so a failure is reproducible
  const seeded = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const rand = seeded(20261105)
  const pick = <T,>(list: T[]): T => list[Math.floor(rand() * list.length)]

  // JSON-expressible values only (the pipeline goes through text): absent, whole and fractional numbers, half cases, garbage.
  const GARBAGE: unknown[] = ['10', '', null, true, false, [], [3], {}, { a: 1 }, 'x'.repeat(50)]
  function generate(): unknown {
    const kind = Math.floor(rand() * 8)
    if (kind === 0) return undefined // absent
    if (kind === 1) return Math.floor(rand() * 70) - 10 // whole number around the range
    if (kind === 2) return Math.floor(rand() * 70) - 10 + 0.5 // a half
    if (kind === 3) return Math.round((rand() * 70 - 10) * 1000) / 1000 // a few decimals
    if (kind === 4) return rand() * 70 - 10 // any fraction
    if (kind === 5) return pick([1, 50, 0.5, 49.5, 50.5, 0.999, 50.001, 1.5, 2.5, 3.5, 48.5])
    if (kind === 6) return rand() * 2e6 - 1e6
    return pick(GARBAGE)
  }

  // Independent reference for what version 1 accepted: absent, or a finite number from 1 to 50 inclusive.
  const validAtV1 = (v: unknown) => v === undefined || (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 50)
  // Independent half-up rounding (not Math.round, not Math.floor(x + 0.5)): the nearest whole number, ties up.
  const halfUp = (v: number) => {
    const low = Math.floor(v)
    return v - low >= 0.5 ? low + 1 : low
  }

  test('1,500 generated configs: never throws, deterministic, valid-at-v1 values upgrade and round trip, the rest keep their v1 verdict', () => {
    let upgradedCount = 0
    let rejectedCount = 0
    for (let i = 0; i < 1500; i++) {
      const value = generate()
      const input = doc([agent('a', value)])
      const label = `#${i} ${JSON.stringify(value)}`
      const text = JSON.stringify(input)
      const before = structuredClone(input)

      // direct: total and deterministic
      const first = migrate(input)
      const second = migrate(structuredClone(input))
      expect(first, label).toEqual(second)
      expect(input, label).toEqual(before)

      const result = importWorkflow(text, nodeDefinitions)
      if (validAtV1(value)) {
        expect(result.ok, label).toBe(true)
        if (!result.ok) continue
        upgradedCount++
        const config = result.workflow.nodes[0].config
        const whole = typeof value === 'number' && Number.isInteger(value)
        if (value === undefined) expect(Object.hasOwn(config, 'maxIterations'), label).toBe(false)
        else expect(config.maxIterations, label).toBe(whole ? value : halfUp(value as number))
        expect(result.workflow.nodes[0].typeVersion, label).toBe(2)
        expect(result.upgrades, label).toEqual([
          {
            nodeId: 'a',
            type: 'agent.autonomous',
            from: 1,
            to: 2,
            notes: value === undefined || whole ? [] : [`maxIterations ${value} was not a whole number and was rounded to ${halfUp(value as number)}`],
          },
        ])
        // idempotent through the pipeline: the export imports again with nothing to upgrade, byte-identically
        const exported = serializeWorkflow(result.workflow)
        const again = importWorkflow(exported, nodeDefinitions)
        expect(again.ok && again.upgrades, label).toEqual([])
        expect(again.ok && serializeWorkflow(again.workflow), label).toBe(exported)
      } else {
        rejectedCount++
        // not touched by the migration: the value is exactly what the file said
        expect(first.ok && (first.doc.nodes as ReturnType<typeof agent>[])[0].config.maxIterations, label).toEqual(value)
        expect(result.ok, label).toBe(false)
        if (result.ok) continue
        // Version 1 said schema.type for a non-number, and schema.minimum / schema.maximum for a number out of range. Version 2
        // says the same, EXCEPT a fractional number out of range, which now fails the integer type first (schema.type).
        const whole = typeof value === 'number' && Number.isInteger(value)
        const expected = typeof value !== 'number' || !whole ? 'schema.type' : value < 1 ? 'schema.minimum' : 'schema.maximum'
        expect(result.errors.map((e) => [e.code, e.path]), label).toEqual([[expected, '/nodes/0/config/maxIterations']])
      }
    }
    // the generator really exercises both sides (the test is not vacuous)
    expect(upgradedCount).toBeGreaterThan(300)
    expect(rejectedCount).toBeGreaterThan(300)
  })

  test('the migration never throws on any JavaScript value, including ones JSON cannot carry', () => {
    const wild: unknown[] = [NaN, Infinity, -Infinity, -0, 1e300, 5e-324, Number.MAX_SAFE_INTEGER, 2 ** 53, 'x', Symbol('s'), 10n, () => 1, new Date(0), new Map(), Object.create(null), [NaN]]
    for (const value of wild) {
      const input = doc([agent('a', value)])
      const run = () => migrate(input)
      expect(run).not.toThrow()
      expect(run()).toEqual(run())
    }
    // configs that are not plain objects, and a config with an own __proto__ key
    const own = JSON.parse('{"provider":"ollama","__proto__":{"maxIterations":2.5},"maxIterations":2.5}')
    const r = migrate(doc([{ ...agent('a'), config: own }]))
    expect(r.ok && Object.hasOwn((r.doc.nodes as { config: object }[])[0].config, '__proto__')).toBe(true)
    expect(r.ok && ((r.doc.nodes as { config: Record<string, unknown> }[])[0].config.maxIterations)).toBe(3)
  })
})

describe('source guards: the import path cannot write a file, store anything or call the network', () => {
  const sources = import.meta.glob<string>(
    ['/src/workflow/{nodeMigrations,migrate,serialize,strictJson}.ts', '/src/app/Toolbar.tsx'],
    { query: '?raw', import: 'default', eager: true },
  )
  // The two pure migration files: no I/O of any kind, no clock, no randomness.
  const forbidden = /\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|FileReader|showSaveFilePicker|createWriteStream|writeFile|writeFileSync|appendFile|navigator\.sendBeacon|Math\.random|Date\.now|performance\.now|setTimeout|crypto\.)\b|new Date\b/
  // The whole import path (those two plus serialize, strictJson and the Toolbar): nothing that can write through a file the user
  // picked, and no storage or network call. The Toolbar's EXPORT handler legitimately uses a Blob and a download link
  // (URL.createObjectURL), which only creates a NEW file, so that is NOT forbidden here; neither are setTimeout and Date,
  // which the pure files above exclude but the Toolbar uses (fitView).
  const writeCapable = /\b(showSaveFilePicker|showOpenFilePicker|createWritable|FileSystemFileHandle|localStorage|sessionStorage|indexedDB|XMLHttpRequest)\b|\bfetch\s*\(/
  const importSpecifiers = (text: string) => [...text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1])

  test('the regexes catch the things they name (so the guards are not vacuous) and ignore what is allowed', () => {
    for (const bad of ['fetch(url)', 'localStorage.setItem', 'new Date()', 'Date.now()', 'Math.random()', 'fs.writeFileSync(a)', 'crypto.randomUUID()']) {
      expect(forbidden.test(bad), bad).toBe(true)
    }
    expect(forbidden.test('const rounded = Math.floor(value + 0.5)')).toBe(false)
    for (const bad of [
      'await window.showSaveFilePicker()',
      'window.showOpenFilePicker({})',
      'const w = await handle.createWritable()',
      'let h: FileSystemFileHandle',
      'localStorage.getItem(k)',
      'sessionStorage.x = 1',
      'indexedDB.open(db)',
      'await fetch(url)',
      'await fetch (url)',
      'new XMLHttpRequest()',
    ]) {
      expect(writeCapable.test(bad), bad).toBe(true)
    }
    for (const fine of ['URL.createObjectURL(new Blob([text]))', 'link.download = name', 'setTimeout(() => fitView(), 50)', 'const prefetch = 1', 'file.arrayBuffer()']) {
      expect(writeCapable.test(fine), fine).toBe(false)
    }
  })

  test('all five import-path files are checked, none uses a write-capable, storage or network API', () => {
    expect(Object.keys(sources).sort()).toEqual([
      '/src/app/Toolbar.tsx',
      '/src/workflow/migrate.ts',
      '/src/workflow/nodeMigrations.ts',
      '/src/workflow/serialize.ts',
      '/src/workflow/strictJson.ts',
    ])
    for (const [file, text] of Object.entries(sources)) expect(writeCapable.test(text), file).toBe(false)
  })

  test('the two pure migration files use none of the stricter list and import only ./errors, ./secrets (the pure echoSafe helper) and ./types', () => {
    for (const file of ['/src/workflow/migrate.ts', '/src/workflow/nodeMigrations.ts']) {
      const text = sources[file]
      expect(forbidden.test(text), file).toBe(false)
      for (const spec of importSpecifiers(text)) expect(['./errors', './secrets', './types'], `${file} imports ${spec}`).toContain(spec)
    }
  })
})

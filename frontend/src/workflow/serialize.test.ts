import { describe, expect, test } from 'vitest'
import { nodeDefinitions } from '../catalog'
import { parseConfigInput } from './configSchema'
import { MIGRATIONS, migrate } from './migrate'
import { importWorkflow, serializeWorkflow } from './serialize'
import type { Workflow } from './types'

const node = (id: string, type: string, config: Record<string, unknown> = {}) => ({
  id,
  type,
  typeVersion: 1,
  label: id,
  config,
  position: { x: 10, y: 20 },
})

const sample: Workflow = {
  schemaVersion: '1.0',
  id: 'wf_1',
  name: 'Sample',
  description: 'desc',
  nodes: [
    node('t', 'trigger.manual', { payload: { a: 1 } }),
    node('l', 'llm.prompt', { provider: 'ollama', prompt: 'Summarize', temperature: 0.2 }),
    node('o', 'output.result', { format: 'text' }),
  ],
  edges: [
    { id: 'e1', source: { nodeId: 't', port: 'data' }, target: { nodeId: 'l', port: 'input' } },
    { id: 'e2', source: { nodeId: 'l', port: 'text' }, target: { nodeId: 'o', port: 'input' } },
  ],
  metadata: { note: 'x' },
}

const imp = (text: string) => importWorkflow(text, nodeDefinitions)
const errorsOf = (text: string) => {
  const r = imp(text)
  if (r.ok) throw new Error('expected import to fail')
  return r.errors
}
const withEdit = (edit: (wf: Workflow) => void) => {
  const wf = structuredClone(sample)
  edit(wf)
  return JSON.stringify(wf)
}

describe('export / import round trip', () => {
  test('export -> import -> export is byte-identical', () => {
    const first = serializeWorkflow(sample)
    const imported = imp(first)
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    expect(imported.workflow).toEqual(sample)
    expect(serializeWorkflow(imported.workflow)).toBe(first)
  })

  test('re-ordered keys in a hand-edited file still canonicalize to the same export', () => {
    const reordered = sample.nodes.map(({ position, ...rest }) => ({ position, ...rest }))
    const shuffled = JSON.stringify({ ...sample, nodes: reordered })
    const imported = imp(shuffled)
    expect(imported.ok && serializeWorkflow(imported.workflow)).toBe(serializeWorkflow(sample))
  })
})

describe('import rejects bad files with specific messages', () => {
  test('not JSON / not an object', () => {
    expect(errorsOf('{nope')[0]).toMatch(/Not valid JSON/)
    expect(errorsOf('[]')[0]).toMatch(/JSON object/)
  })

  test('unsupported schemaVersion', () => {
    expect(errorsOf(withEdit((w) => (w.schemaVersion = '9.9')))[0]).toMatch(/Unsupported schemaVersion "9.9"/)
  })

  test('missing top-level fields', () => {
    expect(errorsOf(JSON.stringify({ schemaVersion: '1.0' }))).toEqual(
      expect.arrayContaining(['"id" must be a string.', '"nodes" must be an array.']),
    )
  })

  test('unknown node type and bad config', () => {
    expect(errorsOf(withEdit((w) => (w.nodes[1].type = 'mystery.node')))[0]).toMatch(
      /unknown node type mystery.node@1/,
    )
    expect(errorsOf(withEdit((w) => (w.nodes[1].config.provider = 'nope')))[0]).toMatch(
      /config "provider" must be one of/,
    )
  })

  test('duplicate node ids', () => {
    expect(errorsOf(withEdit((w) => (w.nodes[2].id = 't')))[0]).toMatch(/duplicate node id "t"/)
  })

  test('edges: unknown node, bad port, type mismatch, cycle', () => {
    expect(errorsOf(withEdit((w) => (w.edges[0].target.nodeId = 'ghost')))[0]).toMatch(/does not exist/)
    expect(errorsOf(withEdit((w) => (w.edges[0].source.port = 'nope')))[0]).toMatch(/port that the node does not have/)
    // http.status (number) -> agent.input (text)
    const mismatch = withEdit((w) => {
      w.nodes.push(node('h', 'http.request', { method: 'GET', url: '' }), node('a', 'agent.autonomous', { provider: 'ollama' }))
      w.edges.push({ id: 'e3', source: { nodeId: 'h', port: 'status' }, target: { nodeId: 'a', port: 'input' } })
    })
    expect(errorsOf(mismatch)[0]).toMatch(/incompatible data types/)
    const cycle = withEdit((w) => {
      w.nodes.push(node('h', 'http.request', { method: 'GET', url: '' }))
      w.edges.push(
        { id: 'e3', source: { nodeId: 'l', port: 'text' }, target: { nodeId: 'h', port: 'input' } },
        { id: 'e4', source: { nodeId: 'h', port: 'body' }, target: { nodeId: 'l', port: 'input' } },
      )
    })
    expect(errorsOf(cycle).join('\n')).toMatch(/e4.*(cycle|already has a connection)/)
  })

  test('oversized input', () => {
    expect(errorsOf(' '.repeat(5 * 1024 * 1024 + 1))[0]).toMatch(/too large/)
  })
})

describe('migrate', () => {
  test('passes the current version through', () => {
    expect(migrate({ schemaVersion: '1.0' }).ok).toBe(true)
  })

  test('applies a chain of steps in order', () => {
    const steps = {
      '0.8': (d: Record<string, unknown>) => ({ ...d, schemaVersion: '0.9', a: 1 }),
      '0.9': (d: Record<string, unknown>) => ({ ...d, schemaVersion: '1.0', b: 2 }),
    }
    const r = migrate({ schemaVersion: '0.8' }, steps)
    expect(r).toEqual({ ok: true, doc: { schemaVersion: '1.0', a: 1, b: 2 } })
  })

  test('a step that does not advance the version cannot loop forever', () => {
    const r = migrate({ schemaVersion: '0.8' }, { '0.8': (d) => d })
    expect(r.ok).toBe(false)
  })

  test('there are no registered migrations yet (only 1.0 exists)', () => {
    expect(Object.keys(MIGRATIONS)).toEqual([])
  })
})

describe('parseConfigInput', () => {
  const llm = nodeDefinitions.find((d) => d.type === 'llm.prompt')!.configSchema.properties
  const payload = nodeDefinitions.find((d) => d.type === 'trigger.manual')!.configSchema.properties.payload

  test('numbers: parsed, range-checked, blank rejected', () => {
    expect(parseConfigInput(llm.temperature, '1.5')).toEqual({ ok: true, value: 1.5 })
    expect(parseConfigInput(llm.temperature, '3')).toEqual({ ok: false, error: 'must be at most 2' })
    expect(parseConfigInput(llm.temperature, '')).toEqual({ ok: false, error: 'must be a number' })
    expect(parseConfigInput(llm.temperature, 'abc')).toEqual({ ok: false, error: 'must be a number' })
  })

  test('JSON objects: parsed; invalid JSON and non-objects rejected', () => {
    expect(parseConfigInput(payload, '{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
    expect(parseConfigInput(payload, '{a')).toEqual({ ok: false, error: 'must be valid JSON' })
    expect(parseConfigInput(payload, '[1]')).toEqual({ ok: false, error: 'must be a JSON object' })
  })

  test('strings and enums', () => {
    expect(parseConfigInput(llm.prompt, 'hi')).toEqual({ ok: true, value: 'hi' })
    expect(parseConfigInput(llm.provider, 'openai')).toEqual({ ok: true, value: 'openai' })
    expect(parseConfigInput(llm.provider, 'x').ok).toBe(false)
  })
})

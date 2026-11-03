import { describe, expect, test } from 'vitest'
import { nodeDefinitions } from '../catalog'
import { CONNECTION_ERROR_MESSAGES } from './connections'
import { ERROR_CODES, jsonPointer } from './errors'
import type { ErrorCode } from './errors'
import { MAX_IMPORT_CHARS, importWorkflow } from './serialize'
import type { Workflow } from './types'

const node = (id: string, type: string, config: Record<string, unknown> = {}) => ({
  id,
  type,
  typeVersion: 1,
  label: id,
  config,
  position: { x: 0, y: 0 },
})

const edge = (id: string, from: string, fromPort: string, to: string, toPort: string) => ({
  id,
  source: { nodeId: from, port: fromPort },
  target: { nodeId: to, port: toPort },
})

const base = (): Workflow => ({
  schemaVersion: '1.0',
  id: 'wf_1',
  name: 'Sample',
  description: '',
  nodes: [
    node('t', 'trigger.manual', { payload: {} }),
    node('l', 'llm.prompt', { provider: 'ollama', prompt: 'hi', temperature: 0.2 }),
    node('o', 'output.result', { format: 'text' }),
  ],
  edges: [edge('e1', 't', 'data', 'l', 'input'), edge('e2', 'l', 'text', 'o', 'input')],
  metadata: {},
})

/** Serializes the base workflow after an edit. */
const edited = (edit: (wf: Workflow) => void): string => {
  const wf = base() as Workflow
  edit(wf)
  return JSON.stringify(wf)
}

// One real input per code. Record<ErrorCode, ...> makes the compiler reject a missing entry too.
const CASES: Record<ErrorCode, { path: string; input: () => string }> = {
  'doc.not-json': { path: '', input: () => '{nope' },
  'doc.not-object': { path: '', input: () => '[]' },
  'doc.too-large': { path: '', input: () => ' '.repeat(MAX_IMPORT_CHARS + 1) },
  'doc.unsupported-version': { path: '/schemaVersion', input: () => edited((w) => (w.schemaVersion = '9.9')) },
  'doc.invalid-field': { path: '/id', input: () => edited((w) => delete (w as Partial<Workflow>).id) },
  'node.malformed': { path: '/nodes/1', input: () => edited((w) => (w.nodes[1] = 5 as never)) },
  'node.duplicate-id': { path: '/nodes/2/id', input: () => edited((w) => (w.nodes[2].id = 't')) },
  'node.unknown-type': { path: '/nodes/1/type', input: () => edited((w) => (w.nodes[1].type = 'mystery.node')) },
  'edge.malformed': { path: '/edges/0', input: () => edited((w) => (w.edges[0] = 'x' as never)) },
  'edge.duplicate-id': { path: '/edges/1/id', input: () => edited((w) => (w.edges[1].id = 'e1')) },
  'connection.unknown-node': {
    path: '/edges/0',
    input: () => edited((w) => (w.edges[0].target.nodeId = 'ghost')),
  },
  'connection.unknown-port': {
    path: '/edges/0',
    input: () => edited((w) => (w.edges[0].source.port = 'nope')),
  },
  'connection.self-loop': {
    path: '/edges/2',
    input: () => edited((w) => w.edges.push(edge('e3', 'l', 'text', 'l', 'input'))),
  },
  'connection.duplicate': {
    path: '/edges/2',
    input: () => edited((w) => w.edges.push(edge('e3', 't', 'data', 'l', 'input'))),
  },
  'connection.input-occupied': {
    path: '/edges/2',
    input: () =>
      edited((w) => {
        w.nodes.push(node('t2', 'trigger.manual'))
        w.edges.push(edge('e3', 't2', 'data', 'l', 'input'))
      }),
  },
  'connection.type-mismatch': {
    // http.status (number) -> agent.input (text)
    path: '/edges/2',
    input: () =>
      edited((w) => {
        w.nodes.push(node('h', 'http.request', { method: 'GET', url: '' }), node('a', 'agent.autonomous', { provider: 'ollama' }))
        w.edges.push(edge('e3', 'h', 'status', 'a', 'input'))
      }),
  },
  'connection.cycle': {
    path: '/edges/1',
    input: () =>
      edited((w) => {
        w.nodes = [node('h1', 'http.request', { method: 'GET', url: '' }), node('h2', 'http.request', { method: 'GET', url: '' })]
        w.edges = [edge('e1', 'h1', 'body', 'h2', 'input'), edge('e2', 'h2', 'body', 'h1', 'input')]
      }),
  },
  'schema.type': { path: '/nodes/1/config/prompt', input: () => edited((w) => (w.nodes[1].config.prompt = 3)) },
  'schema.enum': { path: '/nodes/1/config/provider', input: () => edited((w) => (w.nodes[1].config.provider = 'nope')) },
  'schema.required': { path: '/nodes/1/config/provider', input: () => edited((w) => (w.nodes[1].config = { prompt: 'hi' })) },
  'schema.additionalProperties': {
    path: '/nodes/1/config/extra',
    input: () => edited((w) => (w.nodes[1].config.extra = 1)),
  },
  'schema.minimum': { path: '/nodes/1/config/temperature', input: () => edited((w) => (w.nodes[1].config.temperature = -1)) },
  'schema.maximum': { path: '/nodes/1/config/temperature', input: () => edited((w) => (w.nodes[1].config.temperature = 5)) },
}

describe('error codes', () => {
  test('the base workflow is valid, so each case fails only because of its edit', () => {
    expect(importWorkflow(JSON.stringify(base()), nodeDefinitions).ok).toBe(true)
  })

  test.each(ERROR_CODES.map((code) => [code] as const))('%s is produced with its JSON Pointer path', (code) => {
    const result = importWorkflow(CASES[code].input(), nodeDefinitions)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toMatchObject({ code, path: CASES[code].path })
    expect(result.errors[0].message).not.toBe('')
  })

  test('every code in ERROR_CODES has a test case, and every case is a real code', () => {
    expect(Object.keys(CASES).sort()).toEqual([...ERROR_CODES].sort())
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length)
  })

  test('every ConnectionError has a connection.<code> entry', () => {
    for (const key of Object.keys(CONNECTION_ERROR_MESSAGES)) {
      expect(ERROR_CODES).toContain(`connection.${key}`)
    }
    const connectionCodes = ERROR_CODES.filter((c) => c.startsWith('connection.'))
    expect(connectionCodes).toHaveLength(Object.keys(CONNECTION_ERROR_MESSAGES).length)
  })
})

describe('jsonPointer', () => {
  test('no segments is the whole document', () => {
    expect(jsonPointer()).toBe('')
  })

  test('segments, including numbers, are prefixed with a slash', () => {
    expect(jsonPointer('nodes', 2, 'config', 'provider')).toBe('/nodes/2/config/provider')
    expect(jsonPointer(0)).toBe('/0')
  })

  test('~ and / are escaped (RFC 6901), ~ first', () => {
    expect(jsonPointer('a/b')).toBe('/a~1b')
    expect(jsonPointer('m~n')).toBe('/m~0n')
    expect(jsonPointer('~/')).toBe('/~0~1')
    expect(jsonPointer('~1')).toBe('/~01')
  })

  test('an empty-string segment is kept', () => {
    expect(jsonPointer('')).toBe('/')
  })
})

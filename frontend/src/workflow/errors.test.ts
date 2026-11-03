import { describe, expect, test } from 'vitest'
import { nodeDefinitions } from '../catalog'
import { CONNECTION_ERROR_MESSAGES } from './connections'
import { ERROR_CODES, jsonPointer } from './errors'
import type { ErrorCode } from './errors'
import { validateAgainstSchema } from './jsonSchema'
import type { SchemaError } from './jsonSchema'
import { MAX_IMPORT_BYTES, exportWorkflowText, importWorkflow } from './serialize'
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
  const wf = base()
  edit(wf)
  return JSON.stringify(wf)
}

/** The base workflow as text, with the raw text of the first node's position.x replaced. */
const withPosition = (raw: string): string => JSON.stringify(base()).replace('"x":0', `"x":${raw}`)

/** The base workflow as text, with the raw text of "metadata" replaced (for duplicate keys, depth, numbers). */
const withMetadata = (raw: string): string => JSON.stringify(base()).replace('"metadata":{}', `"metadata":${raw}`)

// EXPLICIT EXEMPTION LIST: codes an imported file can never produce (parsed JSON is always data), so no
// import case exists for them. They are produced by the export guard and tested through it below.
// Every other code must keep an import case; do not add a code here to dodge that.
const EXPORT_ONLY_CODES = ['value.not-json-data'] as const
type ExportOnlyCode = (typeof EXPORT_ONLY_CODES)[number]
// SECOND EXPLICIT EXEMPTION LIST (temporary): codes of keywords the JSON Schema subset validator supports
// but no catalog schema uses yet, so no workflow import can produce them. They are tested through
// validateAgainstSchema below. T5b converts the catalog; delete this list then if a catalog schema uses them.
const SCHEMA_ONLY_CODES = ['schema.minLength', 'schema.maxLength', 'schema.minItems', 'schema.maxItems'] as const
type SchemaOnlyCode = (typeof SCHEMA_ONLY_CODES)[number]
type NotImportable = ExportOnlyCode | SchemaOnlyCode
const NOT_IMPORTABLE: readonly string[] = [...EXPORT_ONLY_CODES, ...SCHEMA_ONLY_CODES]
const IMPORT_CODES = ERROR_CODES.filter((c): c is Exclude<ErrorCode, NotImportable> => !NOT_IMPORTABLE.includes(c))

// One real input per import code. Record<..., ...> makes the compiler reject a missing entry too.
const CASES: Record<Exclude<ErrorCode, NotImportable>, { path: string; input: () => string | Uint8Array }> = {
  'doc.not-json': { path: '', input: () => '{nope' },
  'doc.not-object': { path: '', input: () => '[]' },
  'doc.too-large': { path: '', input: () => ' '.repeat(MAX_IMPORT_BYTES + 1) },
  // 63 nested arrays inside metadata: metadata is depth 2, so the 63rd array (depth 65) is the first too deep.
  'doc.too-deep': {
    path: '/metadata' + '/a'.repeat(1) + '/0'.repeat(62),
    input: () => withMetadata(`{"a":${'['.repeat(63)}${']'.repeat(63)}}`),
  },
  'doc.duplicate-key': { path: '/metadata/a', input: () => withMetadata('{"a":1,"a":2}') },
  'doc.invalid-encoding': { path: '', input: () => new Uint8Array([0x7b, 0xff, 0x7d]) },
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
  'value.not-finite': { path: '/nodes/0/position/x', input: () => withPosition('1e400') },
  'value.unsafe-integer': { path: '/nodes/0/position/x', input: () => withPosition('9007199254740993') },
  'value.invalid-unicode': { path: '/metadata/k', input: () => withMetadata('{"k":"\\ud800"}') },
  'value.nul-character': { path: '/metadata/k', input: () => withMetadata('{"k":"a\\u0000b"}') },
}

describe('error codes', () => {
  test('the base workflow is valid, so each case fails only because of its edit', () => {
    expect(importWorkflow(JSON.stringify(base()), nodeDefinitions).ok).toBe(true)
  })

  test.each(IMPORT_CODES.map((code) => [code] as const))('%s is produced with its JSON Pointer path', (code) => {
    const result = importWorkflow(CASES[code].input(), nodeDefinitions)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toMatchObject({ code, path: CASES[code].path })
    expect(result.errors[0].message).not.toBe('')
  })

  test('every code in ERROR_CODES has an import case, except the explicit export-only list; every case is a real code', () => {
    expect(Object.keys(CASES).sort()).toEqual([...IMPORT_CODES].sort())
    expect([...IMPORT_CODES, ...EXPORT_ONLY_CODES, ...SCHEMA_ONLY_CODES].sort()).toEqual([...ERROR_CODES].sort())
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length)
  })

  test('each schema-only code is produced by validateAgainstSchema with its JSON Pointer path', () => {
    const produced: Record<SchemaOnlyCode, SchemaError[]> = {
      'schema.minLength': validateAgainstSchema({ type: 'object', properties: { s: { type: 'string', minLength: 2 } } }, { s: 'a' }, { checkRequired: false }),
      'schema.maxLength': validateAgainstSchema({ type: 'object', properties: { s: { type: 'string', maxLength: 1 } } }, { s: 'ab' }, { checkRequired: false }),
      'schema.minItems': validateAgainstSchema({ type: 'object', properties: { l: { type: 'array', minItems: 1 } } }, { l: [] }, { checkRequired: false }),
      'schema.maxItems': validateAgainstSchema({ type: 'object', properties: { l: { type: 'array', maxItems: 1 } } }, { l: [1, 2] }, { checkRequired: false }),
    }
    expect(Object.keys(produced).sort()).toEqual([...SCHEMA_ONLY_CODES].sort())
    for (const code of SCHEMA_ONLY_CODES) {
      expect(produced[code], code).toEqual([{ code, path: code.endsWith('Length') ? '/s' : '/l', message: expect.any(String) }])
    }
  })

  test('each export-only code is produced by the export guard', () => {
    const wf = base()
    wf.nodes[0].config = { payload: { a: undefined } }
    const exported = exportWorkflowText(wf)
    expect(exported.ok).toBe(false)
    if (!exported.ok) expect(exported.errors).toEqual([{ code: 'value.not-json-data', path: '/nodes/0/config/payload/a', message: expect.any(String) }])
    expect(EXPORT_ONLY_CODES).toEqual(['value.not-json-data']) // one entry, one case above: extend both together
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

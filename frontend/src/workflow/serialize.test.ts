import { describe, expect, test } from 'vitest'
import { nodeDefinitions } from '../catalog'
import { parseConfigInput } from './configSchema'
import { ERROR_CODES } from './errors'
import { MIGRATIONS, migrate } from './migrate'
import { MAX_IMPORT_BYTES, exportWorkflowText, importWorkflow, serializeWorkflow } from './serialize'
import configSchemaSource from './configSchema.ts?raw'
import serializeSource from './serialize.ts?raw'
import strictJsonSource from './strictJson.ts?raw'
import migrateSource from './migrate.ts?raw'
import validateSource from './validate.ts?raw'
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

describe('export key order (export-json/1)', () => {
  test('every level is sorted: the top level is alphabetical and schemaVersion comes last', () => {
    const text = serializeWorkflow(sample)
    expect(Object.keys(JSON.parse(text) as object)).toEqual(['description', 'edges', 'id', 'metadata', 'name', 'nodes', 'schemaVersion'])
    expect(text.startsWith('{\n  "description": "desc",\n  "edges": [')).toBe(true)
    expect(text.endsWith('  "schemaVersion": "1.0"\n}\n')).toBe(true)
    const nodeKeys = Object.keys((JSON.parse(text) as { nodes: object[] }).nodes[0])
    expect(nodeKeys).toEqual(['config', 'id', 'label', 'position', 'type', 'typeVersion'])
  })

  test('a Phase 1 export (schemaVersion first) still imports and is re-exported in the new order', () => {
    const phase1 = JSON.stringify(sample, null, 2) + '\n'
    expect(phase1.startsWith('{\n  "schemaVersion"')).toBe(true)
    const imported = imp(phase1)
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    const exported = serializeWorkflow(imported.workflow)
    expect(exported).not.toBe(phase1)
    expect(exported.startsWith('{\n  "description"')).toBe(true)
    expect(JSON.parse(exported)).toEqual(JSON.parse(phase1))
    const again = imp(exported)
    expect(again.ok && serializeWorkflow(again.workflow)).toBe(exported)
  })

  test('the export is the pretty profile: LF only, one trailing LF, no CR', () => {
    const text = serializeWorkflow({ ...sample, name: 'a\r\nb' })
    expect(text.includes('\r')).toBe(false)
    expect(text.endsWith('}\n') && !text.endsWith('\n\n')).toBe(true)
  })
})

describe('exportWorkflowText (the export guard)', () => {
  const withName = (name: string): Workflow => ({ ...sample, name })
  const toPairs = (r: ReturnType<typeof exportWorkflowText>) => (r.ok ? null : r.errors.map(({ code, path }) => ({ code, path })))
  const NUL = String.fromCharCode(0)

  test('a valid workflow gives exactly the pretty export text', () => {
    expect(exportWorkflowText(sample)).toEqual({ ok: true, text: serializeWorkflow(sample) })
  })

  test('a name containing NUL is refused with a structured error and no text', () => {
    const r = exportWorkflowText(withName('a' + NUL + 'b'))
    expect(r.ok).toBe(false)
    expect(toPairs(r)).toEqual([{ code: 'value.nul-character', path: '/name' }])
    if (!r.ok) expect(r.errors[0].message).toMatch(/NUL/)
  })

  test('a node label with a lone surrogate is refused', () => {
    const wf = structuredClone(sample)
    wf.nodes[1].label = 'Hi ' + String.fromCharCode(0xd800)
    expect(toPairs(exportWorkflowText(wf))).toEqual([{ code: 'value.invalid-unicode', path: '/nodes/1/label' }])
  })

  test('config values, positions and metadata are checked too', () => {
    const wf = structuredClone(sample)
    wf.nodes[1].config = { ...wf.nodes[1].config, temperature: Infinity }
    wf.nodes[0].position = { x: 2 ** 53, y: 0 }
    wf.metadata = { ['k' + NUL]: 1 }
    expect(toPairs(exportWorkflowText(wf))).toEqual([
      { code: 'value.unsafe-integer', path: '/nodes/0/position/x' },
      { code: 'value.not-finite', path: '/nodes/1/config/temperature' },
      { code: 'value.nul-character', path: '/metadata/k' + NUL },
    ])
  })

  test('nesting deeper than the limit is refused (a config object sits at depth 5)', () => {
    const wf = structuredClone(sample)
    const nest = (levels: number): unknown => (levels <= 1 ? {} : { a: nest(levels - 1) })
    wf.nodes[0].config = { payload: nest(60) }
    expect(exportWorkflowText(wf).ok).toBe(true)
    wf.nodes[0].config = { payload: nest(61) }
    const r = exportWorkflowText(wf)
    expect(r.ok).toBe(false)
    expect(toPairs(r)?.[0].code).toBe('doc.too-deep')
  })

  test('the text must not be longer than the import limit, counted in UTF-8 bytes', () => {
    const overhead = serializeWorkflow(withName('')).length // ASCII only, so characters = bytes
    const ok = exportWorkflowText(withName('x'.repeat(MAX_IMPORT_BYTES - overhead)))
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.text.length).toBe(MAX_IMPORT_BYTES)
      // the promise behind the guard: what can be exported can be imported again
      expect(imp(ok.text).ok).toBe(true)
    }
    const over = exportWorkflowText(withName('x'.repeat(MAX_IMPORT_BYTES - overhead + 1)))
    expect(over.ok).toBe(false)
    expect(over.ok ? null : over.errors).toEqual([{ code: 'doc.too-large', path: '', message: expect.stringMatching(/too large to export.*5,000,000 bytes/) }])
  })

  test('bytes are counted, not characters: 2,500,001 two-byte characters are over the limit', () => {
    const name = 'é'.repeat(MAX_IMPORT_BYTES / 2 + 1)
    expect(name.length).toBeLessThan(MAX_IMPORT_BYTES)
    expect(toPairs(exportWorkflowText(withName(name)))).toEqual([{ code: 'doc.too-large', path: '' }])
  })
})

describe('import rejects bad files with specific codes, paths and messages', () => {
  test('not JSON / not an object', () => {
    const notJson = errorsOf('{nope')[0]
    expect(notJson).toMatchObject({ code: 'doc.not-json', path: '' })
    expect(notJson.message).toMatch(/Not valid JSON/)
    expect(errorsOf('[]')[0]).toEqual({
      code: 'doc.not-object',
      path: '',
      message: 'Workflow file must contain a JSON object.',
    })
  })

  test('unsupported schemaVersion', () => {
    const e = errorsOf(withEdit((w) => (w.schemaVersion = '9.9')))[0]
    expect(e).toMatchObject({ code: 'doc.unsupported-version', path: '/schemaVersion' })
    expect(e.message).toMatch(/Unsupported schemaVersion "9.9"/)
  })

  test('missing top-level fields', () => {
    const errors = errorsOf(JSON.stringify({ schemaVersion: '1.0' }))
    expect(errors).toEqual(
      expect.arrayContaining([
        { code: 'doc.invalid-field', path: '/id', message: '"id" must be a string.' },
        { code: 'doc.invalid-field', path: '/nodes', message: '"nodes" must be an array.' },
      ]),
    )
  })

  test('unknown node type and bad config', () => {
    const type = errorsOf(withEdit((w) => (w.nodes[1].type = 'mystery.node')))[0]
    expect(type).toMatchObject({ code: 'node.unknown-type', path: '/nodes/1/type' })
    expect(type.message).toMatch(/unknown node type mystery.node@1/)
    const config = errorsOf(withEdit((w) => (w.nodes[1].config.provider = 'nope')))[0]
    expect(config).toMatchObject({ code: 'schema.enum', path: '/nodes/1/config/provider' })
    expect(config.message).toMatch(/config "provider" must be one of/)
  })

  test('duplicate node ids', () => {
    expect(errorsOf(withEdit((w) => (w.nodes[2].id = 't')))[0]).toEqual({
      code: 'node.duplicate-id',
      path: '/nodes/2/id',
      message: 'nodes[2]: duplicate node id "t".',
    })
  })

  test('config keys that name inherited members are unknown settings, not skipped', () => {
    const llm = sample.nodes[1].config
    const pointers = ['constructor', 'toString', 'hasOwnProperty', 'valueOf'].map((key) => {
      const errors = errorsOf(withEdit((w) => (w.nodes[1].config = { ...llm, [key]: 1 })))
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatchObject({ code: 'schema.additionalProperties' })
      return errors[0].path
    })
    expect(pointers).toEqual(
      ['constructor', 'toString', 'hasOwnProperty', 'valueOf'].map((k) => `/nodes/1/config/${k}`),
    )
    // Raw text, so JSON.parse creates an OWN "__proto__" key (an object literal would set the prototype).
    const raw = JSON.stringify(sample).replace('"provider":"ollama"', '"__proto__":{},"provider":"ollama"')
    expect(raw).toContain('"__proto__"')
    const errors = errorsOf(raw)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({
      code: 'schema.additionalProperties',
      path: '/nodes/1/config/__proto__',
    })
  })

  test('edges: unknown node, bad port, type mismatch, input occupied', () => {
    const ghost = errorsOf(withEdit((w) => (w.edges[0].target.nodeId = 'ghost')))[0]
    expect(ghost).toMatchObject({ code: 'connection.unknown-node', path: '/edges/0' })
    expect(ghost.message).toMatch(/does not exist/)
    const port = errorsOf(withEdit((w) => (w.edges[0].source.port = 'nope')))[0]
    expect(port).toMatchObject({ code: 'connection.unknown-port', path: '/edges/0' })
    expect(port.message).toMatch(/port that the node does not have/)
    // http.status (number) -> agent.input (text)
    const mismatch = withEdit((w) => {
      w.nodes.push(node('h', 'http.request', { method: 'GET', url: '' }), node('a', 'agent.autonomous', { provider: 'ollama' }))
      w.edges.push({ id: 'e3', source: { nodeId: 'h', port: 'status' }, target: { nodeId: 'a', port: 'input' } })
    })
    const typeMismatch = errorsOf(mismatch)[0]
    expect(typeMismatch).toMatchObject({ code: 'connection.type-mismatch', path: '/edges/2' })
    expect(typeMismatch.message).toMatch(/incompatible data types/)
    // e4 targets l.input, which e1 already feeds, so the single-input rule fires before the cycle rule.
    const occupiedInput = withEdit((w) => {
      w.nodes.push(node('h', 'http.request', { method: 'GET', url: '' }))
      w.edges.push(
        { id: 'e3', source: { nodeId: 'l', port: 'text' }, target: { nodeId: 'h', port: 'input' } },
        { id: 'e4', source: { nodeId: 'h', port: 'body' }, target: { nodeId: 'l', port: 'input' } },
      )
    })
    const occupied = errorsOf(occupiedInput)[0]
    expect(occupied).toMatchObject({ code: 'connection.input-occupied', path: '/edges/3' })
    expect(occupied.message).toMatch(/already has a connection/)
  })

  test('oversized input', () => {
    const e = errorsOf(' '.repeat(MAX_IMPORT_BYTES + 1))[0]
    expect(e).toMatchObject({ code: 'doc.too-large', path: '' })
    expect(e.message).toMatch(/too large/)
  })
})

describe('importWorkflow: bytes, size limit and the strict parser', () => {
  const text = JSON.stringify(sample)
  const bytes = (t: string) => new TextEncoder().encode(t)

  test('the import path does not use the built-in JSON parser', () => {
    const sources = { 'serialize.ts': serializeSource, 'strictJson.ts': strictJsonSource, 'migrate.ts': migrateSource, 'validate.ts': validateSource }
    const offenders = Object.entries(sources).filter(([, src]) => src.includes('JSON.parse(')).map(([file]) => file)
    expect(offenders, `JSON.parse( found in: ${offenders.join(', ')}`).toEqual([])
    expect(serializeSource).toContain('strictParse(')
  })

  test('text and the same text as UTF-8 bytes import identically', () => {
    const fromText = imp(text)
    const fromBytes = importWorkflow(bytes(text), nodeDefinitions)
    expect(fromText.ok).toBe(true)
    expect(fromBytes).toEqual(fromText)
  })

  test('a leading byte order mark is tolerated (bytes and text), but only one', () => {
    expect(importWorkflow(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes(text)]), nodeDefinitions).ok).toBe(true)
    expect(imp(String.fromCharCode(0xfeff) + text).ok).toBe(true)
    const twice = importWorkflow(new Uint8Array([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf, ...bytes(text)]), nodeDefinitions)
    expect(twice.ok).toBe(false)
    if (!twice.ok) expect(twice.errors[0]).toMatchObject({ code: 'doc.not-json', path: '' })
  })

  test('invalid UTF-8 is doc.invalid-encoding at the document root', () => {
    for (const raw of [[0xff], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xe2, 0x82]]) {
      const r = importWorkflow(new Uint8Array([0x22, ...raw, 0x22]), nodeDefinitions)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors).toEqual([{ code: 'doc.invalid-encoding', path: '', message: expect.any(String) }])
    }
  })

  test('the size limit counts UTF-8 bytes, not characters, for text and for bytes', () => {
    const atLimit = text + ' '.repeat(MAX_IMPORT_BYTES - text.length)
    expect(imp(atLimit).ok).toBe(true)
    expect(importWorkflow(bytes(atLimit), nodeDefinitions).ok).toBe(true)
    expect(errorsOf(atLimit + ' ')[0].code).toBe('doc.too-large')
    expect(importWorkflow(new Uint8Array(MAX_IMPORT_BYTES + 1), nodeDefinitions)).toMatchObject({ ok: false })
    // 2,500,001 two-byte characters: 5,000,002 bytes, but only 2,500,001 characters.
    const multibyte = 'é'.repeat(MAX_IMPORT_BYTES / 2 + 1)
    expect(multibyte.length).toBeLessThan(MAX_IMPORT_BYTES)
    expect(errorsOf(multibyte)[0].code).toBe('doc.too-large')
    // Exactly at the limit in bytes: not too large (the text is not JSON, which is a different error).
    expect(errorsOf('é'.repeat(MAX_IMPORT_BYTES / 2))[0].code).toBe('doc.not-json')
    // A valid surrogate pair counts as 4 bytes: exactly at the limit is fine, one more is too large.
    expect(errorsOf('😀'.repeat(MAX_IMPORT_BYTES / 4))[0].code).toBe('doc.not-json')
    expect(errorsOf('😀'.repeat(MAX_IMPORT_BYTES / 4 + 1))[0].code).toBe('doc.too-large')
    // A lone surrogate (built at run time: it cannot be stored in a UTF-8 source file) counts as 3 bytes.
    // The at-limit case is the one that tells 3 from 4: 1,666,666 x 3 = 4,999,998 bytes (x 4 would be over).
    const lone = String.fromCharCode(0xd800)
    expect(errorsOf(lone.repeat(Math.floor(MAX_IMPORT_BYTES / 3)))[0].code).toBe('doc.not-json')
    expect(errorsOf(lone.repeat(Math.floor(MAX_IMPORT_BYTES / 3) + 1))[0].code).toBe('doc.too-large')
  })

  test('a duplicate key is reported with its pointer, not silently collapsed', () => {
    const dup = text.replace('"metadata":{"note":"x"}', '"metadata":{"note":"x","note":"y"}')
    expect(dup).not.toBe(text)
    expect(errorsOf(dup)[0]).toMatchObject({ code: 'doc.duplicate-key', path: '/metadata/note' })
  })

  test('truncating the file at every byte never throws and never imports', () => {
    const doc = bytes(JSON.stringify({ ...sample, name: 'café 😀' }))
    for (let i = 0; i < doc.length; i++) {
      const r = importWorkflow(doc.subarray(0, i), nodeDefinitions)
      expect(r.ok).toBe(false)
      if (r.ok) continue
      expect(r.errors).toHaveLength(1)
      expect(ERROR_CODES).toContain(r.errors[0].code)
      expect(typeof r.errors[0].path).toBe('string')
    }
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
    if (!r.ok) expect(r.errors[0]).toMatchObject({ code: 'doc.unsupported-version', path: '/schemaVersion' })
  })

  test('a schemaVersion naming an inherited member is unsupported, not a migration step', () => {
    for (const version of ['constructor', 'toString', '__proto__']) {
      const e = errorsOf(withEdit((w) => (w.schemaVersion = version)))[0]
      expect(e).toMatchObject({ code: 'doc.unsupported-version', path: '/schemaVersion' })
    }
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

  test('a duplicate key typed into a JSON setting is flagged and not committed', () => {
    const r = parseConfigInput(payload, '{"a":1,"a":2}')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('Duplicate object key "a".')
    // also when the two spellings differ only by an escape (backslash, u, 0, 0, 6, 1)
    expect(parseConfigInput(payload, '{"a":1,"' + String.fromCharCode(92) + 'u0061":2}').ok).toBe(false)
    // the same key in sibling objects is fine
    expect(parseConfigInput(payload, '{"x":{"a":1},"y":{"a":2}}').ok).toBe(true)
  })

  test('an unsafe number typed into a JSON setting is flagged by the strict parser', () => {
    const r = parseConfigInput(payload, '{"n":9007199254740993}')
    expect(r).toEqual({ ok: false, error: 'has a number outside the supported range (-9007199254740991 to 9007199254740991)' })
  })

  test('a typed __proto__ key is an ordinary key of the committed value', () => {
    const r = parseConfigInput(payload, '{"__proto__":{"x":1}}')
    expect(r.ok).toBe(true)
    if (r.ok) expect(Object.hasOwn(r.value as object, '__proto__')).toBe(true)
  })

  test('the typed-JSON path no longer uses the built-in parser', () => {
    expect(configSchemaSource.includes('JSON.parse(')).toBe(false)
    expect(configSchemaSource).toContain('strictParse(')
  })

  test('strings and enums', () => {
    expect(parseConfigInput(llm.prompt, 'hi')).toEqual({ ok: true, value: 'hi' })
    expect(parseConfigInput(llm.provider, 'openai')).toEqual({ ok: true, value: 'openai' })
    expect(parseConfigInput(llm.provider, 'x').ok).toBe(false)
  })
})

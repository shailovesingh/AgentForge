// Runs the language-neutral fixtures in /contracts/fixtures against the real TypeScript code.
// Format and rules: contracts/README.md. In Phase 1.1 the fixtures are executed in TypeScript
// only; no other implementation runs them yet.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { describe, expect, test } from 'vitest'
import { getLatestNodeDefinition, nodeDefinitions } from '../catalog'
import { canonicalCompact, exportPretty } from '../workflow/canonicalJson'
import { validateConfig } from '../workflow/configSchema'
import { checkConnection } from '../workflow/connections'
import { ERROR_CODES, jsonPointer } from '../workflow/errors'
import { importWorkflow, serializeWorkflow } from '../workflow/serialize'
import { strictParse } from '../workflow/strictJson'
import type { Workflow } from '../workflow/types'

// ---------------------------------------------------------------------------
// Shape checker (pure; unit-tested below with deliberately bad examples)
// ---------------------------------------------------------------------------

type Family = 'workflow/valid' | 'workflow/invalid' | 'connection' | 'config' | 'serialization'

const FAMILY_FIELDS: Record<Family, readonly string[]> = {
  'workflow/valid': ['input', 'inputText', 'inputRepeat', 'inputBytesBase64', 'expect'],
  'workflow/invalid': ['input', 'inputText', 'inputRepeat', 'inputBytesBase64', 'expect'],
  connection: ['nodes', 'edges', 'source', 'target', 'expect'],
  config: ['nodeType', 'config', 'configText', 'expect'],
  serialization: ['inputText', 'inputBytesBase64', 'expect'],
}

const isBase64 = (b: unknown): boolean => typeof b === 'string' && b.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(b)

const KNOWN_CODES: readonly string[] = ERROR_CODES

// A workflow case gives exactly one of these.
const INPUT_FIELDS = ['input', 'inputText', 'inputRepeat', 'inputBytesBase64']

// A typo in `inputRepeat.times` must not allocate gigabytes.
export const MAX_REPEAT_TIMES = 10_000_000

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v !== ''
const isPointer = (v: unknown): v is string => typeof v === 'string' && (v === '' || v.startsWith('/'))
const hasExactKeys = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k))

function familyOf(file: string): Family | undefined {
  const dir = file.slice(0, Math.max(file.lastIndexOf('/'), 0))
  return (Object.keys(FAMILY_FIELDS) as Family[]).find((f) => f === dir)
}

const isPair = (v: unknown): boolean => Array.isArray(v) && v.length === 2 && v.every(isNonEmptyString)

/**
 * Returns the problems with one fixture file; an empty list means well-formed.
 * `file` is the path relative to contracts/fixtures, with forward slashes.
 */
export function checkShape(file: string, value: unknown): string[] {
  const family = familyOf(file)
  if (!family) {
    return [`${file}: not in a known fixture directory (${Object.keys(FAMILY_FIELDS).join(', ')})`]
  }
  if (!isObject(value)) return [`${file}: must be a JSON object`]

  const problems: string[] = []
  const bad = (message: string) => problems.push(`${file}: ${message}`)

  const allowed = ['name', 'description', ...FAMILY_FIELDS[family]]
  for (const key of Object.keys(value)) if (!allowed.includes(key)) bad(`unknown field "${key}"`)

  const expectation = (v: unknown, where: string) => {
    if (!isObject(v) || !hasExactKeys(v, ['code', 'path'])) return bad(`${where} must be exactly { code, path }`)
    if (typeof v.code !== 'string' || !KNOWN_CODES.includes(v.code)) bad(`${where}.code "${String(v.code)}" is not a known error code`)
    if (!isPointer(v.path)) bad(`${where}.path must be a JSON Pointer ("" or starting with "/")`)
  }
  const expectationList = (v: unknown, allowEmpty: boolean) => {
    if (!Array.isArray(v) || (!allowEmpty && v.length === 0)) {
      return bad(`expect must be a${allowEmpty ? '' : ' non-empty'} array of { code, path }`)
    }
    v.forEach((e, i) => expectation(e, `expect[${i}]`))
  }
  // Exactly one of `<field>` / `<field>Text`.
  const oneOf = (field: string, isValid: (v: unknown) => boolean, kind: string) => {
    const hasValue = Object.hasOwn(value, field)
    const hasText = Object.hasOwn(value, `${field}Text`)
    if (hasValue && hasText) bad(`has both ${field} and ${field}Text; use exactly one`)
    else if (!hasValue && !hasText) bad(`needs ${field} or ${field}Text`)
    if (hasValue && !isValid(value[field])) bad(`${field} must be ${kind}`)
    if (hasText && typeof value[`${field}Text`] !== 'string') bad(`${field}Text must be a string`)
  }

  // Workflow cases: exactly one of `input`, `inputText`, `inputRepeat`, `inputBytesBase64`.
  const workflowInput = () => {
    const present = INPUT_FIELDS.filter((k) => Object.hasOwn(value, k))
    if (present.length === 0) return bad('needs input, inputText, inputRepeat or inputBytesBase64')
    if (present.length > 1) return bad(`has more than one of ${INPUT_FIELDS.join(', ')} (${present.join(', ')}); use exactly one`)
    if (present[0] === 'inputText' && typeof value.inputText !== 'string') bad('inputText must be a string')
    if (present[0] === 'inputBytesBase64') {
      if (!isBase64(value.inputBytesBase64)) bad('inputBytesBase64 must be a base64 string (standard alphabet, padded)')
      return
    }
    if (present[0] !== 'inputRepeat') return
    const r = value.inputRepeat
    if (!isObject(r) || Object.keys(r).some((k) => !['prefix', 'unit', 'times', 'suffix'].includes(k))) {
      return bad('inputRepeat must be an object with only prefix, unit, times, suffix')
    }
    if (typeof r.unit !== 'string') bad('inputRepeat.unit must be a string')
    if (!Number.isInteger(r.times) || (r.times as number) < 0 || (r.times as number) > MAX_REPEAT_TIMES) {
      bad(`inputRepeat.times must be an integer from 0 to ${MAX_REPEAT_TIMES}`)
    }
    for (const k of ['prefix', 'suffix']) {
      if (Object.hasOwn(r, k) && typeof r[k] !== 'string') bad(`inputRepeat.${k} must be a string`)
    }
  }

  if (!isNonEmptyString(value.name)) bad('name must be a non-empty string')
  else if (value.name !== file.slice(file.lastIndexOf('/') + 1).replace(/\.json$/, '')) {
    bad(`name "${value.name}" must equal the file name without .json`)
  }
  if (!isNonEmptyString(value.description)) bad('description must be a non-empty string')

  const expected = value.expect
  switch (family) {
    case 'workflow/valid':
      workflowInput()
      if (!isObject(expected) || !hasExactKeys(expected, ['valid']) || expected.valid !== true) {
        bad('expect must be exactly { "valid": true }')
      }
      break
    case 'workflow/invalid':
      workflowInput()
      if (!isObject(expected) || !hasExactKeys(expected, ['valid', 'errors']) || expected.valid !== false) {
        bad('expect must be { "valid": false, "errors": [...] }')
      } else expectationList(expected.errors, false)
      break
    case 'serialization': {
      // Arbitrary JSON text in, exact text out: exactly one of inputText / inputBytesBase64.
      const present = ['inputText', 'inputBytesBase64'].filter((k) => Object.hasOwn(value, k))
      if (present.length !== 1) bad(`needs exactly one of inputText, inputBytesBase64 (has ${present.length})`)
      else if (present[0] === 'inputText' && typeof value.inputText !== 'string') bad('inputText must be a string')
      else if (present[0] === 'inputBytesBase64' && !isBase64(value.inputBytesBase64)) {
        bad('inputBytesBase64 must be a base64 string (standard alphabet, padded)')
      }
      if (isObject(expected) && expected.valid === true) {
        if (!hasExactKeys(expected, ['valid', 'compact', 'export'])) bad('expect must be exactly { "valid": true, "compact": "...", "export": "..." }')
        else if (typeof expected.compact !== 'string' || typeof expected.export !== 'string') bad('expect.compact and expect.export must be strings')
        else if (!expected.export.endsWith('\n') || expected.export.endsWith('\n\n')) bad('expect.export must end with exactly one LF')
        else if (expected.compact.includes('\n') || expected.export.includes('\r')) bad('expect.compact must contain no LF and expect.export no CR')
      } else if (isObject(expected) && expected.valid === false) {
        if (!hasExactKeys(expected, ['valid', 'errors'])) bad('expect must be { "valid": false, "errors": [ { code, path } ] }')
        else if (!Array.isArray(expected.errors) || expected.errors.length !== 1) bad('expect.errors must be an array with exactly one { code, path } (the parser reports the first problem only)')
        else expectation(expected.errors[0], 'expect.errors[0]')
      } else bad('expect must be { "valid": true, "compact", "export" } or { "valid": false, "errors": [...] }')
      break
    }
    case 'config':
      if (!isNonEmptyString(value.nodeType)) bad('nodeType must be a non-empty string')
      oneOf('config', isObject, 'a JSON object')
      expectationList(expected, true)
      break
    case 'connection': {
      if (!Array.isArray(value.nodes)) bad('nodes must be an array of { id, type }')
      else {
        value.nodes.forEach((n, i) => {
          if (!isObject(n) || !hasExactKeys(n, ['id', 'type']) || !isNonEmptyString(n.id) || !isNonEmptyString(n.type)) {
            bad(`nodes[${i}] must be exactly { id, type } with non-empty strings`)
          }
        })
      }
      if (!Array.isArray(value.edges)) bad('edges must be an array of { source, target }')
      else {
        value.edges.forEach((e, i) => {
          if (!isObject(e) || !hasExactKeys(e, ['source', 'target']) || !isPair(e.source) || !isPair(e.target)) {
            bad(`edges[${i}] must be exactly { source: [nodeId, port], target: [nodeId, port] }`)
          }
        })
      }
      if (!isPair(value.source)) bad('source must be [nodeId, port]')
      if (!isPair(value.target)) bad('target must be [nodeId, port]')
      if (expected !== null && !(typeof expected === 'string' && expected.startsWith('connection.') && KNOWN_CODES.includes(expected))) {
        bad('expect must be null or a connection.<rule> code')
      }
      break
    }
  }
  return problems
}

/** Names must be unique across ALL fixtures. */
export function checkUniqueNames(entries: { file: string; name: unknown }[]): string[] {
  const byName = new Map<string, string[]>()
  for (const { file, name } of entries) {
    if (typeof name !== 'string') continue
    byName.set(name, [...(byName.get(name) ?? []), file])
  }
  return [...byName]
    .filter(([, files]) => files.length > 1)
    .map(([name, files]) => `name "${name}" is used by more than one fixture: ${files.join(', ')}`)
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const FIXTURES_DIR = resolve(import.meta.dirname, '../../../contracts/fixtures')
const FORMAT_FILE = 'format.json'
const CATALOG_FILE = 'catalog/builtin.catalog.json'
const CATALOG_PATH = join(FIXTURES_DIR, CATALOG_FILE)

interface Expected {
  code: string
  path: string
}
interface CaseBase {
  file: string
  name: string
  description: string
}
interface WorkflowCase extends CaseBase {
  input?: unknown
  inputText?: string
  inputRepeat?: { prefix?: string; unit: string; times: number; suffix?: string }
  inputBytesBase64?: string
  expect: { valid: boolean; errors?: Expected[] }
}
interface ConnectionCase extends CaseBase {
  nodes: { id: string; type: string }[]
  edges: { source: [string, string]; target: [string, string] }[]
  source: [string, string]
  target: [string, string]
  expect: string | null
}
interface ConfigCase extends CaseBase {
  nodeType: string
  config?: Record<string, unknown>
  configText?: string
  expect: Expected[]
}

interface SerializationCase extends CaseBase {
  inputText?: string
  inputBytesBase64?: string
  expect: { valid: true; compact: string; export: string } | { valid: false; errors: Expected[] }
}

interface Corpus {
  problems: string[]
  valid: WorkflowCase[]
  invalid: WorkflowCase[]
  connection: ConnectionCase[]
  config: ConfigCase[]
  serialization: SerializationCase[]
}

function loadCorpus(): Corpus {
  const corpus: Corpus = { problems: [], valid: [], invalid: [], connection: [], config: [], serialization: [] }
  if (!existsSync(FIXTURES_DIR)) {
    corpus.problems.push('contracts/fixtures does not exist')
    return corpus
  }
  const files = readdirSync(FIXTURES_DIR, { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile())
    .map((d) => relative(FIXTURES_DIR, join(d.parentPath, d.name)).split(sep).join('/'))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

  const names: { file: string; name: unknown }[] = []
  for (const file of files) {
    // Both are checked by their own tests; they are not cases.
    if (file === FORMAT_FILE || file === CATALOG_FILE) continue
    if (!file.endsWith('.json')) {
      corpus.problems.push(`${file}: fixtures must be .json files`)
      continue
    }
    let value: unknown
    try {
      value = JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf8'))
    } catch (e) {
      corpus.problems.push(`${file}: not valid JSON (${e instanceof Error ? e.message : String(e)})`)
      continue
    }
    const problems = checkShape(file, value)
    corpus.problems.push(...problems)
    if (isObject(value)) names.push({ file, name: value.name })
    if (problems.length > 0) continue // shape-checked above, so the casts below are safe
    const withFile = { ...(value as object), file }
    const family = familyOf(file)
    if (family === 'workflow/valid') corpus.valid.push(withFile as WorkflowCase)
    else if (family === 'workflow/invalid') corpus.invalid.push(withFile as WorkflowCase)
    else if (family === 'connection') corpus.connection.push(withFile as ConnectionCase)
    else if (family === 'serialization') corpus.serialization.push(withFile as SerializationCase)
    else corpus.config.push(withFile as ConfigCase)
  }
  corpus.problems.push(...checkUniqueNames(names))
  return corpus
}

const corpus = loadCorpus()

// ---------------------------------------------------------------------------
// Runners
// ---------------------------------------------------------------------------

/** Order-insensitive comparison form: a sorted list of { code, path } (messages are never compared). */
const asMultiset = (list: Expected[]): Expected[] =>
  list
    .map(({ code, path }) => ({ code, path }))
    .sort((a, b) => {
      const x = `${a.code}\u0000${a.path}`
      const y = `${b.code}\u0000${b.path}`
      return x < y ? -1 : x > y ? 1 : 0
    })

/** What the importer is given: raw bytes for inputBytesBase64, otherwise import text. */
const workflowInput = (c: WorkflowCase): string | Uint8Array => {
  if (c.inputBytesBase64 !== undefined) return new Uint8Array(Buffer.from(c.inputBytesBase64, 'base64'))
  const r = c.inputRepeat
  if (r) return (r.prefix ?? '') + r.unit.repeat(r.times) + (r.suffix ?? '')
  return c.inputText ?? JSON.stringify(c.input)
}

const LEADING_BOM = new RegExp('^' + String.fromCharCode(0xfeff)) // built at run time: no invisible character in source

/** The JSON text behind an input, for comparing a valid result (a BOM is tolerated, so it is dropped). */
const asText = (input: string | Uint8Array): string =>
  typeof input === 'string' ? input.replace(LEADING_BOM, '') : new TextDecoder('utf-8').decode(input) // the decoder drops one leading BOM

function connectionWorkflow(c: ConnectionCase): Workflow {
  return {
    schemaVersion: '1.0',
    id: 'wf_fixture',
    name: c.name,
    description: '',
    nodes: c.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      typeVersion: 1,
      label: n.id,
      config: {}, // checkConnection never reads config, so this format does not depend on catalog defaults
      position: { x: 0, y: 0 },
    })),
    edges: c.edges.map((e, i) => ({
      id: `e${i + 1}`,
      source: { nodeId: e.source[0], port: e.source[1] },
      target: { nodeId: e.target[0], port: e.target[1] },
    })),
    metadata: {},
  }
}

const MIN_COUNTS = { total: 262, valid: 19, invalid: 97, connection: 22, config: 15, serialization: 109, serializationInvalid: 9 }

// What the serialization family must keep covering: the rejection codes an exporter or a hasher could meet.
const SERIALIZATION_REJECTIONS = ['value.unsafe-integer', 'value.not-finite', 'doc.not-json', 'doc.duplicate-key', 'value.invalid-unicode', 'value.nul-character']

describe('fixture corpus', () => {
  test('format.json declares fixtureFormat 1', () => {
    const file = join(FIXTURES_DIR, FORMAT_FILE)
    expect(existsSync(file), `${FORMAT_FILE} is missing`).toBe(true)
    expect(JSON.parse(readFileSync(file, 'utf8')), FORMAT_FILE).toEqual({ fixtureFormat: 1 })
  })

  test('every fixture file is well-formed and names are unique', () => {
    expect(corpus.problems, corpus.problems.join('\n')).toEqual([])
  })

  test('every error code is expected by at least one workflow/invalid fixture', () => {
    const covered = new Set(corpus.invalid.flatMap((c) => c.expect.errors ?? []).map((e) => e.code))
    expect(ERROR_CODES.filter((code) => !covered.has(code)), 'codes with no workflow/invalid fixture').toEqual([])
  })

  test('the serialization family covers its rejection codes and has valid cases', () => {
    const invalid = corpus.serialization.filter((c) => !c.expect.valid)
    const covered = new Set(invalid.flatMap((c) => (c.expect.valid ? [] : c.expect.errors)).map((e) => e.code))
    expect(SERIALIZATION_REJECTIONS.filter((code) => !covered.has(code)), 'rejection codes with no serialization fixture').toEqual([])
    expect(invalid.length, 'serialization invalid cases').toBeGreaterThanOrEqual(MIN_COUNTS.serializationInvalid)
  })

  test('every connection.* code is the expected result of at least one connection fixture', () => {
    const covered = new Set(corpus.connection.map((c) => c.expect))
    const missing = ERROR_CODES.filter((code) => code.startsWith('connection.') && !covered.has(code))
    expect(missing, 'connection codes with no connection fixture').toEqual([])
  })

  // Floors: deleting fixtures must fail the run. Raise them when you add cases; never lower them.
  test('no fixtures have been deleted (minimum counts)', () => {
    const counts = {
      total: corpus.valid.length + corpus.invalid.length + corpus.connection.length + corpus.config.length + corpus.serialization.length,
      valid: corpus.valid.length,
      invalid: corpus.invalid.length,
      connection: corpus.connection.length,
      config: corpus.config.length,
      serialization: corpus.serialization.length,
    }
    expect(counts.total, 'total cases').toBeGreaterThanOrEqual(MIN_COUNTS.total)
    for (const family of ['valid', 'invalid', 'connection', 'config', 'serialization'] as const) {
      expect(counts[family], `${family} cases`).toBeGreaterThanOrEqual(MIN_COUNTS[family])
    }
  })
})

describe('catalog fixture', () => {
  test('builtin.catalog.json equals the catalog in code', () => {
    const current: unknown = JSON.parse(JSON.stringify(nodeDefinitions))
    if (process.env.UPDATE_FIXTURES) {
      mkdirSync(dirname(CATALOG_PATH), { recursive: true })
      writeFileSync(CATALOG_PATH, JSON.stringify(nodeDefinitions, null, 2) + '\n', 'utf8')
      // Regenerating always fails, so a lingering UPDATE_FIXTURES can never make the drift check pass.
      throw new Error('catalog fixture regenerated; unset UPDATE_FIXTURES and run again')
    }
    let stored: unknown
    try {
      stored = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'))
    } catch (e) {
      stored = `unreadable: ${e instanceof Error ? e.message : String(e)}`
    }
    expect(
      stored,
      `contracts/fixtures/${CATALOG_FILE} differs from the catalog in frontend/src/catalog/nodes.ts. ` +
        `If the catalog change is intended, regenerate the file with UPDATE_FIXTURES=1 npm test ` +
        `(PowerShell: $env:UPDATE_FIXTURES='1'; npm test; Remove-Item Env:UPDATE_FIXTURES), then run npm test again, and review the diff.`,
    ).toEqual(current)
  })
})

describe('workflow/valid fixtures', () => {
  for (const c of corpus.valid) {
    test(c.name, () => {
      const input = workflowInput(c)
      const result = importWorkflow(input, nodeDefinitions)
      expect(result.ok, `${c.file}: expected a valid workflow, got ${JSON.stringify(result.ok ? [] : result.errors)}`).toBe(true)
      if (result.ok) expect(result.workflow, `${c.file}: imported workflow differs from the input`).toEqual(JSON.parse(asText(input)))
    })
  }
})

describe('workflow/invalid fixtures', () => {
  for (const c of corpus.invalid) {
    test(c.name, () => {
      const result = importWorkflow(workflowInput(c), nodeDefinitions)
      expect(result.ok, `${c.file}: expected import to fail`).toBe(false)
      if (result.ok) return
      expect(asMultiset(result.errors), `${c.file}: errors ({code, path}, order-insensitive)`).toEqual(asMultiset(c.expect.errors ?? []))
    })
  }
})

/** Bytes become text without dropping a leading BOM: the strict parser, not the decoder, decides about it. */
const serializationText = (c: SerializationCase): string =>
  c.inputBytesBase64 !== undefined
    ? new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.from(c.inputBytesBase64, 'base64'))
    : (c.inputText ?? '')

describe('serialization fixtures (exact text, both profiles)', () => {
  for (const c of corpus.serialization) {
    test(c.name, () => {
      const parsed = strictParse(serializationText(c))
      if (c.expect.valid) {
        expect(parsed.ok, `${c.file}: expected the input to parse, got ${JSON.stringify(parsed.ok ? null : parsed.error)}`).toBe(true)
        if (!parsed.ok) return
        expect(canonicalCompact(parsed.value), `${c.file}: canonical-json/1 text`).toBe(c.expect.compact)
        expect(exportPretty(parsed.value), `${c.file}: export-json/1 text`).toBe(c.expect.export)
      } else {
        expect(parsed.ok, `${c.file}: expected the input to be rejected`).toBe(false)
        if (parsed.ok) return
        expect(asMultiset([parsed.error]), `${c.file}: error ({code, path})`).toEqual(asMultiset(c.expect.errors))
      }
    })
  }
})

describe('workflow/valid fixtures: export round trip', () => {
  for (const c of corpus.valid) {
    test(c.name, () => {
      const first = importWorkflow(workflowInput(c), nodeDefinitions)
      expect(first.ok, `${c.file}: expected a valid workflow`).toBe(true)
      if (!first.ok) return
      const exported = serializeWorkflow(first.workflow)
      // export(import(export(x))) is byte-identical to export(x)
      const second = importWorkflow(exported, nodeDefinitions)
      expect(second.ok, `${c.file}: the export did not import again`).toBe(true)
      if (!second.ok) return
      expect(serializeWorkflow(second.workflow), `${c.file}: second export differs from the first`).toBe(exported)
      // canonical(parse(export(x))) equals canonical(x)
      const reparsed = strictParse(exported)
      expect(reparsed.ok).toBe(true)
      if (reparsed.ok) expect(canonicalCompact(reparsed.value), `${c.file}: canonical form changed by the export`).toBe(canonicalCompact(first.workflow))
      expect(exported.includes('\r'), `${c.file}: export contains a CR`).toBe(false)
      expect(exported.endsWith('\n') && !exported.endsWith('\n\n'), `${c.file}: export must end with exactly one LF`).toBe(true)
    })
  }
})

describe('connection fixtures', () => {
  for (const c of corpus.connection) {
    test(c.name, () => {
      const problem = checkConnection(
        connectionWorkflow(c),
        nodeDefinitions,
        { nodeId: c.source[0], port: c.source[1] },
        { nodeId: c.target[0], port: c.target[1] },
      )
      expect(problem === null ? null : `connection.${problem}`, `${c.file}: connection result`).toBe(c.expect)
    })
  }
})

describe('config fixtures', () => {
  for (const c of corpus.config) {
    test(c.name, () => {
      const def = getLatestNodeDefinition(c.nodeType)
      expect(def, `${c.file}: unknown nodeType ${c.nodeType}`).toBeDefined()
      if (!def) return
      const config = (c.configText !== undefined ? JSON.parse(c.configText) : c.config) as Record<string, unknown>
      const actual = validateConfig(def.configSchema, config).map(({ key, code }) => ({ code, path: jsonPointer(key) }))
      expect(asMultiset(actual), `${c.file}: config errors ({code, path}, order-insensitive)`).toEqual(asMultiset(c.expect))
    })
  }
})

// ---------------------------------------------------------------------------
// The shape checker itself, with deliberately bad examples
// ---------------------------------------------------------------------------

describe('checkShape', () => {
  const good = {
    invalid: {
      name: 'a',
      description: 'd',
      input: [],
      expect: { valid: false, errors: [{ code: 'doc.not-object', path: '' }] },
    },
    valid: { name: 'a', description: 'd', input: {}, expect: { valid: true } },
    connection: {
      name: 'a',
      description: 'd',
      nodes: [{ id: 'x', type: 'llm.prompt' }],
      edges: [{ source: ['x', 'text'], target: ['x', 'input'] }],
      source: ['x', 'text'],
      target: ['x', 'input'],
      expect: 'connection.self-loop',
    },
    config: { name: 'a', description: 'd', nodeType: 'llm.prompt', config: {}, expect: [{ code: 'schema.required', path: '/provider' }] },
    serialization: { name: 'a', description: 'd', inputText: '{"b":1,"a":[]}', expect: { valid: true, compact: '{"a":[],"b":1}', export: '{\n  "a": [],\n  "b": 1\n}\n' } },
  }
  const files = {
    invalid: 'workflow/invalid/a.json',
    valid: 'workflow/valid/a.json',
    connection: 'connection/a.json',
    config: 'config/a.json',
    serialization: 'serialization/a.json',
  }

  test.each(Object.keys(good) as (keyof typeof good)[])('a well-formed %s fixture has no problems', (family) => {
    expect(checkShape(files[family], good[family])).toEqual([])
  })

  const some = (problems: string[], text: string) => expect(problems.some((p) => p.includes(text)), problems.join(' | ')).toBe(true)

  test('missing name', () => {
    const { name: _name, ...noName } = good.invalid
    some(checkShape(files.invalid, noName), 'name must be a non-empty string')
  })

  test('name that differs from the file name', () => {
    some(checkShape('workflow/invalid/other.json', good.invalid), 'must equal the file name')
  })

  test('unknown field', () => {
    some(checkShape(files.invalid, { ...good.invalid, extra: 1 }), 'unknown field "extra"')
    some(checkShape(files.valid, { ...good.valid, expect: { valid: true, canonical: 1 } }), 'expect must be exactly')
  })

  test('both input and inputText', () => {
    some(checkShape(files.invalid, { ...good.invalid, inputText: '[]' }), 'has more than one of input, inputText, inputRepeat, inputBytesBase64')
    some(checkShape(files.config, { ...good.config, configText: '{}' }), 'has both config and configText')
  })

  test('neither input nor inputText', () => {
    const { input: _input, ...noInput } = good.invalid
    some(checkShape(files.invalid, noInput), 'needs input, inputText, inputRepeat or inputBytesBase64')
  })

  describe('inputRepeat', () => {
    const { input: _input, ...base } = good.invalid
    const withRepeat = (inputRepeat: unknown) => ({ ...base, inputRepeat })

    test('a valid inputRepeat (with and without prefix and suffix) has no problems', () => {
      expect(checkShape(files.invalid, withRepeat({ unit: ' ', times: 3 }))).toEqual([])
      expect(checkShape(files.invalid, withRepeat({ prefix: '[', unit: '1,', times: 3, suffix: '1]' }))).toEqual([])
      const { input: _validInput, ...validBase } = good.valid
      expect(checkShape(files.valid, { ...validBase, inputRepeat: { unit: 'x', times: 0 } })).toEqual([])
    })
    test('inputRepeat together with input or inputText', () => {
      some(checkShape(files.invalid, { ...good.invalid, inputRepeat: { unit: ' ', times: 1 } }), 'has more than one of')
      some(checkShape(files.invalid, { ...withRepeat({ unit: ' ', times: 1 }), inputText: '[]' }), 'has more than one of')
    })
    test('times over the cap, negative or not an integer', () => {
      expect(checkShape(files.invalid, withRepeat({ unit: ' ', times: MAX_REPEAT_TIMES }))).toEqual([])
      some(checkShape(files.invalid, withRepeat({ unit: ' ', times: MAX_REPEAT_TIMES + 1 })), 'inputRepeat.times must be an integer')
      some(checkShape(files.invalid, withRepeat({ unit: ' ', times: 1.5 })), 'inputRepeat.times must be an integer')
      some(checkShape(files.invalid, withRepeat({ unit: ' ', times: -1 })), 'inputRepeat.times must be an integer')
      some(checkShape(files.invalid, withRepeat({ unit: ' ', times: '3' })), 'inputRepeat.times must be an integer')
    })
    test('missing or mistyped unit, prefix, suffix, unknown key, non-object', () => {
      some(checkShape(files.invalid, withRepeat({ times: 3 })), 'inputRepeat.unit must be a string')
      some(checkShape(files.invalid, withRepeat({ unit: ' ', times: 3, prefix: 1 })), 'inputRepeat.prefix must be a string')
      some(checkShape(files.invalid, withRepeat({ unit: ' ', times: 3, suffix: null })), 'inputRepeat.suffix must be a string')
      some(checkShape(files.invalid, withRepeat({ unit: ' ', times: 3, extra: 1 })), 'only prefix, unit, times, suffix')
      some(checkShape(files.invalid, withRepeat([])), 'inputRepeat must be an object')
    })
  })

  describe('inputBytesBase64', () => {
    const { input: _input, ...base } = good.invalid
    const withBytes = (inputBytesBase64: unknown) => ({ ...base, inputBytesBase64 })

    test('a valid base64 string (also empty, with padding) has no problems', () => {
      for (const b of ['', '/w==', '77u/e30=', 'e30=', 'AAAA']) expect(checkShape(files.invalid, withBytes(b)), b).toEqual([])
      const { input: _validInput, ...validBase } = good.valid
      expect(checkShape(files.valid, { ...validBase, inputBytesBase64: 'e30=' })).toEqual([])
    })
    test('not base64, wrong padding or length, not a string', () => {
      for (const b of ['e30', '!!!!', '/w=', 'e3 0', 7, null]) {
        some(checkShape(files.invalid, withBytes(b)), 'inputBytesBase64 must be a base64 string')
      }
    })
    test('together with another input field', () => {
      some(checkShape(files.invalid, { ...withBytes('e30='), inputText: '{}' }), 'has more than one of')
      some(checkShape(files.invalid, { ...good.invalid, inputBytesBase64: 'e30=' }), 'has more than one of')
    })
  })

  describe('serialization', () => {
    const file = files.serialization
    const withExpect = (expect: unknown) => ({ ...good.serialization, expect })
    const rejection = { valid: false, errors: [{ code: 'doc.not-json', path: '' }] }

    test('a valid case, an input by bytes and a rejection case have no problems', () => {
      expect(checkShape(file, withExpect(rejection))).toEqual([])
      const { inputText: _text, ...noText } = good.serialization
      expect(checkShape(file, { ...noText, inputBytesBase64: 'e30=' })).toEqual([])
    })
    test('exactly one of inputText and inputBytesBase64', () => {
      const { inputText: _text, ...noText } = good.serialization
      some(checkShape(file, noText), 'needs exactly one of inputText, inputBytesBase64')
      some(checkShape(file, { ...good.serialization, inputBytesBase64: 'e30=' }), 'needs exactly one of inputText, inputBytesBase64')
      some(checkShape(file, { ...noText, inputBytesBase64: 'e30' }), 'inputBytesBase64 must be a base64 string')
      some(checkShape(file, { ...good.serialization, inputText: 5 }), 'inputText must be a string')
    })
    test('the family does not accept the workflow input fields', () => {
      some(checkShape(file, { ...good.serialization, input: {} }), 'unknown field "input"')
      some(checkShape(file, { ...good.serialization, inputRepeat: { unit: 'x', times: 1 } }), 'unknown field "inputRepeat"')
    })
    test('a valid expectation needs compact and export strings with the right line endings', () => {
      const ok = good.serialization.expect
      some(checkShape(file, withExpect({ valid: true, compact: 'x' })), 'expect must be exactly { "valid": true, "compact"')
      some(checkShape(file, withExpect({ ...ok, compact: 1 })), 'must be strings')
      some(checkShape(file, withExpect({ ...ok, export: 'x' })), 'must end with exactly one LF')
      some(checkShape(file, withExpect({ ...ok, export: 'x\n\n' })), 'must end with exactly one LF')
      some(checkShape(file, withExpect({ ...ok, export: 'x\r\n' })), 'no CR')
      some(checkShape(file, withExpect({ ...ok, compact: 'x\n' })), 'no LF')
    })
    test('a rejection needs exactly one { code, path } with a known code', () => {
      some(checkShape(file, withExpect({ valid: false, errors: [] })), 'exactly one { code, path }')
      some(checkShape(file, withExpect({ valid: false, errors: [rejection.errors[0], rejection.errors[0]] })), 'exactly one { code, path }')
      some(checkShape(file, withExpect({ valid: false, errors: [{ code: 'nope', path: '' }] })), 'not a known error code')
      some(checkShape(file, withExpect({ valid: false, errors: [{ code: 'doc.not-json', path: 'x' }] })), 'JSON Pointer')
      some(checkShape(file, withExpect({ valid: false })), 'expect must be { "valid": false')
    })
    test('an expectation that is neither valid nor invalid', () => {
      some(checkShape(file, withExpect(null)), 'expect must be { "valid": true')
      some(checkShape(file, withExpect({ valid: 'yes' })), 'expect must be { "valid": true')
    })
  })

  test('missing description', () => {
    const { description: _description, ...noDescription } = good.invalid
    some(checkShape(files.invalid, noDescription), 'description must be a non-empty string')
  })

  test('workflow/valid with valid:false', () => {
    some(checkShape(files.valid, { ...good.valid, expect: { valid: false } }), 'expect must be exactly { "valid": true }')
  })

  test('a bad nodes or edges entry in a connection case', () => {
    some(checkShape(files.connection, { ...good.connection, nodes: [{ id: 'x' }] }), 'nodes[0] must be exactly { id, type }')
    some(checkShape(files.connection, { ...good.connection, nodes: 'x' }), 'nodes must be an array')
    some(checkShape(files.connection, { ...good.connection, edges: [{ source: ['x', 'text'] }] }), 'edges[0] must be exactly')
    some(checkShape(files.connection, { ...good.connection, edges: 'x' }), 'edges must be an array')
  })

  test('an extra message key inside an expected error entry', () => {
    some(
      checkShape(files.invalid, { ...good.invalid, expect: { valid: false, errors: [{ code: 'doc.not-object', path: '', message: 'm' }] } }),
      'expect[0] must be exactly { code, path }',
    )
    some(checkShape(files.config, { ...good.config, expect: [{ code: 'schema.required', path: '/provider', message: 'm' }] }), 'expect[0] must be exactly')
  })

  test('unknown error code', () => {
    some(checkShape(files.invalid, { ...good.invalid, expect: { valid: false, errors: [{ code: 'nope', path: '' }] } }), 'not a known error code')
    some(checkShape(files.connection, { ...good.connection, expect: 'schema.type' }), 'connection.<rule>')
  })

  test('bad path, empty error list, wrong types', () => {
    some(checkShape(files.invalid, { ...good.invalid, expect: { valid: false, errors: [{ code: 'doc.not-object', path: 'id' }] } }), 'JSON Pointer')
    some(checkShape(files.invalid, { ...good.invalid, expect: { valid: false, errors: [] } }), 'non-empty array')
    some(checkShape(files.connection, { ...good.connection, source: ['x'] }), 'source must be')
    some(checkShape(files.config, { ...good.config, config: [] }), 'config must be a JSON object')
  })

  test('file outside the known directories, or not an object', () => {
    some(checkShape('misc/a.json', good.invalid), 'not in a known fixture directory')
    some(checkShape(files.invalid, []), 'must be a JSON object')
  })

  test('duplicate names across fixtures', () => {
    expect(checkUniqueNames([{ file: 'a.json', name: 'x' }, { file: 'b.json', name: 'y' }])).toEqual([])
    some(checkUniqueNames([{ file: 'a.json', name: 'x' }, { file: 'b.json', name: 'x' }]), 'used by more than one fixture')
  })
})

// Runs the language-neutral fixtures in /contracts/fixtures against the real TypeScript code.
// Format and rules: contracts/README.md. In Phase 1.1 the fixtures are executed in TypeScript
// only; no other implementation runs them yet.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { describe, expect, test } from 'vitest'
import { getLatestNodeDefinition, nodeDefinitions } from '../catalog'
import { canonicalCompact, exportPretty } from '../workflow/canonicalJson'
import { checkConnection } from '../workflow/connections'
import { EXPORT_ONLY_CODES, SCHEMA_ONLY_CODES } from '../workflow/codeExemptions'
import { ERROR_CODES } from '../workflow/errors'
import { applyDefaults, checkSchemaSubset, validateAgainstSchema } from '../workflow/jsonSchema'
import type { JsonSchema, ObjectSchema } from '../workflow/jsonSchema'
import { WARNING_CODES, lintWorkflow } from '../workflow/lint'
import type { WarningCode } from '../workflow/lint'
import type { UpgradeReport } from '../workflow/nodeMigrations'
import { CREDENTIAL_SHAPES, HEADER_NAMES, KEY_WORDS, detectSecrets } from '../workflow/secrets'
import type { SecretFinding } from '../workflow/secrets'
import { importWorkflow, serializeWorkflow } from '../workflow/serialize'
import { strictParse } from '../workflow/strictJson'
import type { NodeDefinition, Workflow } from '../workflow/types'

// ---------------------------------------------------------------------------
// Shape checker (pure; unit-tested below with deliberately bad examples)
// ---------------------------------------------------------------------------

type Family = 'workflow/valid' | 'workflow/invalid' | 'connection' | 'config' | 'serialization' | 'schema' | 'migration' | 'warnings' | 'secrets'

const FAMILY_FIELDS: Record<Family, readonly string[]> = {
  'workflow/valid': ['input', 'inputText', 'inputRepeat', 'inputBytesBase64', 'expect'],
  'workflow/invalid': ['input', 'inputText', 'inputRepeat', 'inputBytesBase64', 'expect'],
  connection: ['nodes', 'edges', 'source', 'target', 'expect'],
  config: ['nodeType', 'config', 'configText', 'checkRequired', 'expect'],
  serialization: ['inputText', 'inputBytesBase64', 'expect'],
  schema: ['schema', 'value', 'options', 'applyDefaults', 'checkSchema', 'expect'],
  migration: ['input', 'expect'],
  warnings: ['workflow', 'expect', 'negativeFor'],
  secrets: ['workflow', 'expect'],
}

// Which warning codes carry a `field` (the config property, or for the secret codes the display path inside the config).
const FIELD_CODES: readonly string[] = ['required-field-empty', 'secret-likely', 'secret-suspected']
const SECRET_REASONS: readonly unknown[] = ['header-name', 'credential-shape', 'key-name']

const isBase64 = (b: unknown): boolean => typeof b === 'string' && b.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(b)

// The two EXPLICIT exemption lists live in workflow/codeExemptions.ts (EXPORT_ONLY_CODES, SCHEMA_ONLY_CODES), shared with
// errors.test.ts. EXPORT-ONLY codes cannot be produced by an import, so no fixture may expect them. SCHEMA-ONLY codes are
// covered by the schema and config families instead of workflow/invalid (guard below). Every other code stays strictly covered.
const EXPORT_ONLY: readonly string[] = EXPORT_ONLY_CODES
const SCHEMA_ONLY: readonly string[] = SCHEMA_ONLY_CODES

// What a fixture may expect: every code except the export-only ones.
const KNOWN_CODES: readonly string[] = ERROR_CODES.filter((c) => !EXPORT_ONLY.includes(c))

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
    case 'schema': {
      // Three case kinds: validation (default), defaults (`applyDefaults: true`), schema check (`checkSchema: true`).
      const kinds = ['applyDefaults', 'checkSchema'].filter((k) => Object.hasOwn(value, k))
      if (kinds.length > 1) {
        bad('has both applyDefaults and checkSchema; use at most one')
        break
      }
      const kind = kinds[0] ?? 'validation'
      if (!Object.hasOwn(value, 'schema')) bad('needs schema')
      else if (kind !== 'checkSchema' && !isObject(value.schema)) bad('schema must be a JSON object')
      const forbid = (...fields: string[]) => {
        for (const f of fields) if (Object.hasOwn(value, f)) bad(`${f} is not allowed in a ${kind} case`)
      }
      if (kind === 'validation') {
        if (!Object.hasOwn(value, 'value')) bad('needs value')
        if (!isObject(value.options) || !hasExactKeys(value.options, ['checkRequired']) || typeof value.options.checkRequired !== 'boolean') {
          bad('options must be exactly { "checkRequired": true|false }')
        }
        expectationList(expected, true)
        if (Array.isArray(expected)) {
          for (const e of expected) if (isObject(e) && typeof e.code === 'string' && !e.code.startsWith('schema.')) bad(`expect code "${e.code}" must be a schema.* code`)
        }
      } else if (kind === 'applyDefaults') {
        forbid('value', 'options')
        if (value.applyDefaults !== true) bad('applyDefaults must be true')
        if (!isObject(expected) || !hasExactKeys(expected, ['value']) || !isObject(expected.value)) bad('expect must be exactly { "value": { ... } }')
      } else {
        forbid('value', 'options')
        if (value.checkSchema !== true) bad('checkSchema must be true')
        if (!Array.isArray(expected) || !expected.every((e) => isObject(e) && hasExactKeys(e, ['path']) && isPointer(e.path))) {
          bad('expect must be an array of exactly { path } (a JSON Pointer into the schema)')
        }
      }
      break
    }
    case 'migration': {
      // A version 1 document in, the upgrade reports and the full migrated workflow out.
      if (!isObject(value.input)) bad('input must be a JSON object (a workflow document)')
      if (!isObject(expected) || !hasExactKeys(expected, ['upgrades', 'workflow'])) {
        bad('expect must be exactly { "upgrades": [...], "workflow": { ... } }')
        break
      }
      if (!isObject(expected.workflow)) bad('expect.workflow must be a JSON object')
      if (!Array.isArray(expected.upgrades)) bad('expect.upgrades must be an array')
      else {
        expected.upgrades.forEach((u, i) => {
          const ok =
            isObject(u) &&
            hasExactKeys(u, ['nodeId', 'type', 'from', 'to', 'notes']) &&
            typeof u.nodeId === 'string' &&
            isNonEmptyString(u.type) &&
            Number.isInteger(u.from) &&
            Number.isInteger(u.to) &&
            (u.from as number) < (u.to as number) &&
            Array.isArray(u.notes) &&
            u.notes.every((n) => typeof n === 'string')
          if (!ok) bad(`expect.upgrades[${i}] must be exactly { nodeId, type, from, to, notes } (from < to, notes a list of strings)`)
        })
      }
      break
    }
    case 'warnings': {
      // A workflow document in, the expected editor warnings out (contracts/WARNINGS.md).
      if (!isObject(value.workflow)) bad('workflow must be a JSON object (a workflow document)')
      if (!Array.isArray(expected)) bad('expect must be an array of { code, nodeId, port?, field? } (empty = no warnings)')
      else {
        expected.forEach((e, i) => {
          const where = `expect[${i}]`
          if (!isObject(e) || Object.keys(e).some((k) => !['code', 'nodeId', 'port', 'field'].includes(k))) {
            return bad(`${where} must be { code, nodeId, port?, field? } and nothing else`)
          }
          if (typeof e.code !== 'string' || !(WARNING_CODES as readonly string[]).includes(e.code)) bad(`${where}.code "${String(e.code)}" is not a known warning code`)
          if (!isNonEmptyString(e.nodeId)) bad(`${where}.nodeId must be a non-empty string`)
          for (const k of ['port', 'field']) if (Object.hasOwn(e, k) && !isNonEmptyString(e[k])) bad(`${where}.${k} must be a non-empty string`)
          // port belongs to required-input-unconnected, field to required-field-empty, and each of those needs its own
          if ((e.code === 'required-input-unconnected') !== Object.hasOwn(e, 'port')) bad(`${where}: port is required for required-input-unconnected and not allowed otherwise`)
          if (FIELD_CODES.includes(e.code as string) !== Object.hasOwn(e, 'field')) bad(`${where}: field is required for ${FIELD_CODES.join(', ')} and not allowed otherwise`)
        })
      }
      if (Object.hasOwn(value, 'negativeFor')) {
        const n = value.negativeFor
        if (!Array.isArray(n) || n.length === 0 || n.some((c) => typeof c !== 'string' || !(WARNING_CODES as readonly string[]).includes(c)) || new Set(n).size !== n.length) {
          bad('negativeFor must be a non-empty array of distinct known warning codes')
        }
      }
      break
    }
    case 'secrets': {
      // A workflow document in (placeholders for tokens, see contracts/SECRETS.md), the expected findings out.
      if (!isObject(value.workflow)) bad('workflow must be a JSON object (a workflow document)')
      if (!Array.isArray(expected)) bad('expect must be an array of { confidence, location, nodeId?, path, reason } (empty = no findings)')
      else {
        expected.forEach((e, i) => {
          const where = `expect[${i}]`
          if (!isObject(e) || Object.keys(e).some((k) => !['confidence', 'location', 'nodeId', 'path', 'reason'].includes(k))) {
            return bad(`${where} must be { confidence, location, nodeId?, path, reason } and nothing else`)
          }
          if (e.confidence !== 'high' && e.confidence !== 'medium') bad(`${where}.confidence must be "high" or "medium"`)
          if (e.location !== 'config' && e.location !== 'metadata') bad(`${where}.location must be "config" or "metadata"`)
          if (typeof e.path !== 'string') bad(`${where}.path must be a string`)
          if (!SECRET_REASONS.includes(e.reason)) bad(`${where}.reason must be one of ${SECRET_REASONS.join(', ')}`)
          if ((e.location === 'config') !== Object.hasOwn(e, 'nodeId')) bad(`${where}: nodeId is required for location "config" and not allowed for "metadata"`)
          else if (Object.hasOwn(e, 'nodeId') && !isNonEmptyString(e.nodeId)) bad(`${where}.nodeId must be a non-empty string`)
          // key-name is the one medium reason; the other two are high
          if ((e.reason === 'key-name') !== (e.confidence === 'medium')) bad(`${where}: reason key-name goes with confidence medium, the other reasons with high`)
        })
      }
      break
    }
    case 'config':
      if (!isNonEmptyString(value.nodeType)) bad('nodeType must be a non-empty string')
      oneOf('config', isObject, 'a JSON object')
      // Mandatory: whether a missing required key counts (true = execution, false = import, decision C1).
      if (typeof value.checkRequired !== 'boolean') bad('checkRequired must be true or false (mandatory)')
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
  checkRequired: boolean
  expect: Expected[]
}

interface SerializationCase extends CaseBase {
  inputText?: string
  inputBytesBase64?: string
  expect: { valid: true; compact: string; export: string } | { valid: false; errors: Expected[] }
}

/** Three kinds, told apart by `applyDefaults` / `checkSchema` (see contracts/README.md). */
interface SchemaCase extends CaseBase {
  schema: unknown
  value?: unknown
  options?: { checkRequired: boolean }
  applyDefaults?: true
  checkSchema?: true
  expect: Expected[] | { value: Record<string, unknown> } | { path: string }[]
}

interface MigrationCase extends CaseBase {
  input: unknown
  expect: { upgrades: UpgradeReport[]; workflow: unknown }
}

/** A workflow in, the editor warnings out; `negativeFor` lists codes whose rule applies to this workflow but must not fire. */
interface WarningCase extends CaseBase {
  workflow: unknown
  expect: { code: WarningCode; nodeId: string; port?: string; field?: string }[]
  negativeFor?: WarningCode[]
}

/** A workflow (with token placeholders) in, the expected secret findings out. */
interface SecretCase extends CaseBase {
  workflow: unknown
  expect: SecretFinding[]
}

interface Corpus {
  problems: string[]
  warnings: WarningCase[]
  secrets: SecretCase[]
  migration: MigrationCase[]
  valid: WorkflowCase[]
  invalid: WorkflowCase[]
  connection: ConnectionCase[]
  config: ConfigCase[]
  serialization: SerializationCase[]
  schema: SchemaCase[]
}

function loadCorpus(): Corpus {
  const corpus: Corpus = { problems: [], warnings: [], secrets: [], migration: [], valid: [], invalid: [], connection: [], config: [], serialization: [], schema: [] }
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
    else if (family === 'schema') corpus.schema.push(withFile as SchemaCase)
    else if (family === 'migration') corpus.migration.push(withFile as MigrationCase)
    else if (family === 'warnings') corpus.warnings.push(withFile as WarningCase)
    else if (family === 'secrets') corpus.secrets.push(withFile as SecretCase)
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
      typeVersion: getLatestNodeDefinition(n.type)?.version ?? 1, // the catalog serves only the latest version of a type
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

const MIN_COUNTS = {
  // T5b (C1): the old schema.required rejection moved from invalid to valid (valid up, invalid down by one), config grew.
  // T6: 9 invalid cases (version errors, v1 maxIterations) and the new migration family (10); T6 review: 2 more invalid (the version phase).
  total: 436, valid: 21, invalid: 107, connection: 22, config: 19, serialization: 109, serializationInvalid: 9,
  schema: 148, schemaValidation: 75, schemaDefaults: 8, schemaCheck: 65, migration: 10,
  // T7a: the warnings family. Not part of `total` (which keeps its earlier meaning); it has its own floor.
  // T7a review: +3 (the pinned whitespace set: U+00A0 U+FEFF U+2028 empty; U+0085 and U+001C not empty).
  // T9a: +5 (the secret-likely and secret-suspected codes: positives, a clean case, a metadata case).
  warnings: 39,
  // T9a: the secrets family (contracts/SECRETS.md). Not part of `total` either; its own floor.
  secrets: 84,
}

// Which kind a schema case is (the three shapes are told apart by `applyDefaults` / `checkSchema`).
const schemaKind = (c: SchemaCase): 'defaults' | 'check' | 'validation' => (c.applyDefaults ? 'defaults' : c.checkSchema ? 'check' : 'validation')
const schemaValidation = corpus.schema.filter((c) => schemaKind(c) === 'validation')

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
    expect(
      ERROR_CODES.filter((code) => !EXPORT_ONLY.includes(code) && !SCHEMA_ONLY.includes(code) && !covered.has(code)),
      'codes with no workflow/invalid fixture',
    ).toEqual([])
  })

  test('every schema.* code is expected by a schema or a config fixture; the schema-only exemption list is honest', () => {
    const covered = new Set([
      ...schemaValidation.flatMap((c) => c.expect as Expected[]).map((e) => e.code),
      ...corpus.config.flatMap((c) => c.expect).map((e) => e.code),
    ])
    expect(
      ERROR_CODES.filter((code) => code.startsWith('schema.') && !covered.has(code)),
      'schema.* codes with no schema or config fixture',
    ).toEqual([])
    // every exempted code is a real schema.* code and is NOT covered by workflow/invalid (otherwise remove it from the list)
    const viaWorkflow = new Set(corpus.invalid.flatMap((c) => c.expect.errors ?? []).map((e) => e.code))
    for (const code of SCHEMA_ONLY_CODES) {
      expect(ERROR_CODES as readonly string[], code).toContain(code)
      expect(code.startsWith('schema.'), code).toBe(true)
      expect(viaWorkflow.has(code), `${code} is now covered by a workflow/invalid fixture: remove it from SCHEMA_ONLY_CODES`).toBe(false)
    }
  })

  test('the export-only exemption list names only real codes, and no fixture expects them', () => {
    for (const code of EXPORT_ONLY_CODES) expect(KNOWN_CODES, code).not.toContain(code)
    expect(ERROR_CODES.filter((c) => EXPORT_ONLY.includes(c)).length).toBe(EXPORT_ONLY_CODES.length)
    // a fixture that expects an export-only code is a shape problem
    const bad = { name: 'a', description: 'd', input: [], expect: { valid: false, errors: [{ code: EXPORT_ONLY_CODES[0], path: '' }] } }
    expect(checkShape('workflow/invalid/a.json', bad).join('|')).toContain('not a known error code')
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
      total: corpus.valid.length + corpus.invalid.length + corpus.connection.length + corpus.config.length + corpus.serialization.length + corpus.schema.length + corpus.migration.length,
      valid: corpus.valid.length,
      invalid: corpus.invalid.length,
      connection: corpus.connection.length,
      config: corpus.config.length,
      serialization: corpus.serialization.length,
      schema: corpus.schema.length,
      schemaValidation: schemaValidation.length,
      schemaDefaults: corpus.schema.filter((c) => schemaKind(c) === 'defaults').length,
      schemaCheck: corpus.schema.filter((c) => schemaKind(c) === 'check').length,
      migration: corpus.migration.length,
      warnings: corpus.warnings.length,
      secrets: corpus.secrets.length,
    }
    expect(counts.total, 'total cases').toBeGreaterThanOrEqual(MIN_COUNTS.total)
    for (const family of ['valid', 'invalid', 'connection', 'config', 'serialization', 'schema', 'schemaValidation', 'schemaDefaults', 'schemaCheck', 'migration', 'warnings', 'secrets'] as const) {
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
      if (!result.ok) return
      expect(result.workflow, `${c.file}: imported workflow differs from the input`).toEqual(JSON.parse(asText(input)))
      expect(result.upgrades, `${c.file}: a valid fixture is already at the latest versions, so nothing is upgraded`).toEqual([])
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

describe('migration fixtures (node upgrades in memory)', () => {
  for (const c of corpus.migration) {
    test(c.name, () => {
      const text = JSON.stringify(c.input)
      const result = importWorkflow(text, nodeDefinitions)
      expect(result.ok, `${c.file}: expected a valid workflow, got ${JSON.stringify(result.ok ? [] : result.errors)}`).toBe(true)
      if (!result.ok) return
      expect(result.upgrades, `${c.file}: upgrade reports`).toEqual(c.expect.upgrades)
      expect(result.workflow, `${c.file}: migrated workflow`).toEqual(c.expect.workflow)
      // The upgraded workflow exports to the new version, and that text imports again with nothing left to upgrade.
      const exported = serializeWorkflow(result.workflow)
      const again = importWorkflow(exported, nodeDefinitions)
      expect(again.ok, `${c.file}: the export did not import again`).toBe(true)
      if (!again.ok) return
      expect(again.upgrades, `${c.file}: a re-import of the export upgrades nothing`).toEqual([])
      expect(serializeWorkflow(again.workflow), `${c.file}: re-export differs`).toBe(exported)
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

// The whole-workflow path (import, then the workflow writer) for every ser-workflow-* serialization fixture.
const WORKFLOW_SERIALIZATION = corpus.serialization.filter((c) => c.name.startsWith('ser-workflow-'))

describe('serialization fixtures: whole-workflow import and export', () => {
  test('the ser-workflow-* fixtures are present (so the loop below is not empty)', () => {
    expect(WORKFLOW_SERIALIZATION.length).toBeGreaterThanOrEqual(12)
  })
  for (const c of WORKFLOW_SERIALIZATION) {
    test(c.name, () => {
      expect(c.expect.valid, `${c.file}: a workflow serialization case must be a valid one`).toBe(true)
      if (!c.expect.valid) return
      const imported = importWorkflow(serializationText(c), nodeDefinitions)
      expect(imported.ok, `${c.file}: expected the input to import, got ${JSON.stringify(imported.ok ? null : imported.errors)}`).toBe(true)
      if (!imported.ok) return
      expect(serializeWorkflow(imported.workflow), `${c.file}: serializeWorkflow(import(input)) differs from expect.export`).toBe(c.expect.export)
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
      const actual = validateAgainstSchema(def.configSchema, config, { checkRequired: c.checkRequired }).map(({ code, path }) => ({ code, path }))
      expect(asMultiset(actual), `${c.file}: config errors ({code, path}, order-insensitive)`).toEqual(asMultiset(c.expect))
    })
  }
})

/** A warning as the family compares it: code, node id and the optional port or field (never the message). */
const warningKey = (w: { code: string; nodeId: string; port?: string; field?: string }): string => JSON.stringify([w.code, w.nodeId, w.port ?? null, w.field ?? null])
const asWarningMultiset = (list: { code: string; nodeId: string; port?: string; field?: string }[]): string[] => list.map(warningKey).sort()

// How a case proves "the rule applies but does not fire": `negativeFor` lists the code, and the runner checks that (1) the case
// does not expect that code and (2) the workflow holds a node the rule is about (what the predicate below says). Because the
// case's whole expectation must equal what lintWorkflow reports, "applies and was not expected" means "applies and did not fire".
// The two secret rules apply when some node config holds a non-empty string (a value or a key's value) there is to scan.
const holdsText = (v: unknown): boolean =>
  typeof v === 'string' ? v.trim() !== '' : Array.isArray(v) ? v.some(holdsText) : isObject(v) && Object.values(v).some(holdsText)

const RULE_APPLIES: Record<WarningCode, (defs: NodeDefinition[], workflow: Workflow) => boolean> = {
  'required-input-unconnected': (defs) => defs.some((d) => d.inputs.some((p) => p.required === true)),
  'required-field-empty': (defs) => defs.some((d) => (d.configSchema.required ?? []).length > 0),
  'trigger-not-connected': (defs) => defs.some((d) => d.category === 'Triggers' && d.outputs.length > 0),
  'node-unreachable': (defs) => defs.some((d) => d.category === 'Triggers') && defs.some((d) => d.category !== 'Triggers'),
  'result-unused': (defs) => defs.some((d) => d.category !== 'Output' && d.category !== 'Triggers' && d.outputs.length > 0),
  'secret-likely': (_defs, workflow) => workflow.nodes.some((n) => holdsText(n.config)),
  'secret-suspected': (_defs, workflow) => workflow.nodes.some((n) => holdsText(n.config)),
}

const definitionsOf = (workflow: Workflow): NodeDefinition[] =>
  workflow.nodes.flatMap((n) => nodeDefinitions.filter((d) => d.type === n.type && d.version === n.typeVersion))

describe('warnings fixtures (editor warnings, contracts/WARNINGS.md)', () => {
  for (const c of corpus.warnings) {
    test(c.name, () => {
      // Warnings are derived from a workflow that imported: incomplete configs import (decision C1).
      const imported = importWorkflow(JSON.stringify(c.workflow), nodeDefinitions)
      expect(imported.ok, `${c.file}: the workflow must import, got ${JSON.stringify(imported.ok ? [] : imported.errors)}`).toBe(true)
      if (!imported.ok) return
      const warnings = lintWorkflow(imported.workflow, nodeDefinitions)
      expect(asWarningMultiset(warnings), `${c.file}: warnings ({code, nodeId, port, field}, order-insensitive)`).toEqual(asWarningMultiset(c.expect))
      for (const w of warnings) {
        expect(w.severity, `${c.file}: severity`).toBe('warning')
        expect(w.message.length, `${c.file}: a warning has a message`).toBeGreaterThan(0)
      }
      for (const code of c.negativeFor ?? []) {
        expect(
          c.expect.some((e) => e.code === code),
          `${c.file}: negativeFor "${code}" but the case expects that warning`,
        ).toBe(false)
        expect(RULE_APPLIES[code](definitionsOf(imported.workflow), imported.workflow), `${c.file}: negativeFor "${code}" but the rule does not apply to this workflow`).toBe(true)
      }
    })
  }

  test('every warning code is expected by at least one fixture and is checked not to fire in at least one other', () => {
    const expected = new Set(corpus.warnings.flatMap((c) => c.expect.map((e) => e.code)))
    const negative = new Set(corpus.warnings.flatMap((c) => c.negativeFor ?? []))
    expect(WARNING_CODES.filter((code) => !expected.has(code)), 'warning codes no fixture expects').toEqual([])
    expect(WARNING_CODES.filter((code) => !negative.has(code)), 'warning codes with no negativeFor fixture').toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Secrets fixtures (contracts/SECRETS.md) and the token placeholders
// ---------------------------------------------------------------------------

// The repository is pushed to GitHub, whose secret scanning and push protection reject token-shaped strings. A fixture
// therefore NEVER holds a token: it holds a placeholder such as @@GHP@@, and this table builds the token at run time, from
// parts, so that no token-shaped literal stands in this source file either. `@@NAME@@` gives the default size, `@@NAME:n@@`
// the size n (the length of the part that the shape counts). The table is documented in contracts/SECRETS.md.
const TOKEN_BUILDERS: Record<string, { size: number; build: (n: number) => string }> = {
  SK: { size: 24, build: (n) => 'sk' + '-' + 'x'.repeat(n) },
  SKANT: { size: 30, build: (n) => 'sk' + '-ant-' + 'api03-' + 'x'.repeat(n) },
  GSK: { size: 24, build: (n) => 'gs' + 'k_' + 'x'.repeat(n) },
  GHP: { size: 36, build: (n) => 'gh' + 'p_' + 'A'.repeat(n) },
  GHO: { size: 36, build: (n) => 'gh' + 'o_' + 'A'.repeat(n) },
  GHPAT: { size: 30, build: (n) => 'github' + '_pat_' + 'A'.repeat(n) },
  AKIA: { size: 16, build: (n) => 'AK' + 'IA' + 'Q'.repeat(n) },
  ...Object.fromEntries(['A', 'B', 'P', 'R', 'S', 'Z'].map((l) => ['XOX' + l, { size: 12, build: (n: number) => 'xo' + 'x' + l.toLowerCase() + '-' + '1'.repeat(n) }])),
  JWT: { size: 10, build: (n) => 'ey' + 'J' + 'a'.repeat(n) + '.' + 'b'.repeat(n) + '.' + 'c'.repeat(n) },
  JWT2: { size: 10, build: (n) => 'ey' + 'J' + 'a'.repeat(n) + '.' + 'b'.repeat(n) },
  PEM: { size: 0, build: () => '-----' + 'BEGIN ' + 'PRIVATE KEY' + '-----' },
  PEMRSA: { size: 0, build: () => '-----' + 'BEGIN ' + 'RSA ' + 'PRIVATE KEY' + '-----' },
  PEMPUBLIC: { size: 0, build: () => '-----' + 'BEGIN ' + 'PUBLIC KEY' + '-----' },
  BEARER: { size: 24, build: (n) => 'Bea' + 'rer ' + 't'.repeat(n) },
  // Special characters, built at run time (a file-writing tool can decode a backslash-u escape, so none is ever written):
  // U+FEFF and U+0085 and U+001C test JavaScript trim and \s; U+00E9 is a non-ASCII letter; the emoji count is UTF-16 units / 2.
  FEFF: { size: 1, build: (n) => String.fromCharCode(0xfeff).repeat(n) },
  NEL: { size: 1, build: (n) => String.fromCharCode(0x85).repeat(n) },
  FS: { size: 1, build: (n) => String.fromCharCode(0x1c).repeat(n) },
  E9: { size: 1, build: (n) => String.fromCharCode(0xe9).repeat(n) },
  EMOJI: { size: 1, build: (n) => String.fromCodePoint(0x1f600).repeat(n) },
}
// ANYTHING shaped like @@...@@ is a placeholder attempt: a lowercase name, an empty name or a bad size fails the run
// (with the name only, cut short), so a typo can never leave text that silently tests nothing.
const PLACEHOLDER = /@@([^@\s:]*)(?::([^@\s]*))?@@/g

export function fillPlaceholders(text: string): string {
  return text.replace(PLACEHOLDER, (_all, name: string, size?: string) => {
    if (!Object.hasOwn(TOKEN_BUILDERS, name) || (size !== undefined && !/^[0-9]+$/.test(size))) {
      throw new Error(`bad placeholder (name "${name.slice(0, 24)}")`)
    }
    const { size: dflt, build } = TOKEN_BUILDERS[name]
    return build(size === undefined ? dflt : Number(size))
  })
}

/** Placeholders replaced in every string AND every object key. Two keys that become one would hide a finding, so that fails. */
function fillDeep(v: unknown): unknown {
  if (typeof v === 'string') return fillPlaceholders(v)
  if (Array.isArray(v)) return v.map(fillDeep)
  if (isObject(v)) {
    const entries = Object.entries(v)
    const filled = Object.fromEntries(entries.map(([k, x]) => [fillPlaceholders(k), fillDeep(x)]))
    const after = Object.keys(filled).length
    if (after !== entries.length) throw new Error(`placeholders made keys collide (${entries.length} keys became ${after})`)
    return filled
  }
  return v
}

/** Every string value and every key in the configs and the metadata of a workflow document. */
function scannedTexts(workflow: unknown): { values: string[]; keys: string[] } {
  const out = { values: [] as string[], keys: [] as string[] }
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.values.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (isObject(v)) {
      for (const [k, x] of Object.entries(v)) {
        out.keys.push(k)
        walk(x)
      }
    }
  }
  if (isObject(workflow)) {
    if (Array.isArray(workflow.nodes)) for (const n of workflow.nodes) if (isObject(n)) walk(n.config)
    walk(workflow.metadata)
  }
  return out
}

const asSecretMultiset = (list: SecretFinding[]): string[] =>
  list.map((f) => JSON.stringify([f.confidence, f.location, f.nodeId ?? null, f.path, f.reason])).sort()

describe('secrets fixtures (secret detector, contracts/SECRETS.md)', () => {
  for (const c of corpus.secrets) {
    test(c.name, () => {
      // Placeholders become tokens here, in memory; the workflow then goes through the real importer like any other.
      const imported = importWorkflow(JSON.stringify(fillDeep(c.workflow)), nodeDefinitions)
      // on failure print the error codes only: an error path or message could hold a synthetic token
      expect(imported.ok, `${c.file}: the workflow must import, error codes: ${imported.ok ? '' : imported.errors.map((e) => e.code).join(', ')}`).toBe(true)
      if (!imported.ok) return
      const findings = detectSecrets(imported.workflow)
      expect(asSecretMultiset(findings), `${c.file}: findings ({confidence, location, nodeId, path, reason}, order-insensitive)`).toEqual(asSecretMultiset(c.expect))
    })
  }

  const positives = corpus.secrets.filter((c) => c.expect.length > 0)
  const texts = (c: SecretCase) => scannedTexts(fillDeep(c.workflow))

  test('every credential shape is found by at least one positive fixture', () => {
    const covered = CREDENTIAL_SHAPES.filter(({ pattern }) =>
      positives.some((c) => {
        const t = texts(c)
        return c.expect.some((e) => e.reason === 'credential-shape') && [...t.values, ...t.keys].some((s) => pattern.test(s))
      }),
    ).map((s) => s.name)
    expect(CREDENTIAL_SHAPES.map((s) => s.name).filter((n) => !covered.includes(n)), 'shapes with no positive fixture').toEqual([])
  })

  test('every header name has a positive fixture', () => {
    const covered = HEADER_NAMES.filter((name) => positives.some((c) => c.expect.some((e) => e.reason === 'header-name') && texts(c).keys.some((k) => k.trim().toLowerCase() === name)))
    expect(HEADER_NAMES.filter((n) => !covered.includes(n)), 'header names with no positive fixture').toEqual([])
  })

  test('every medium key word has a positive fixture', () => {
    const covered = KEY_WORDS.filter((word) => positives.some((c) => c.expect.some((e) => e.reason === 'key-name') && texts(c).keys.some((k) => k.toLowerCase().includes(word))))
    expect(KEY_WORDS.filter((w) => !covered.includes(w)), 'key words with no positive fixture').toEqual([])
  })

  test('every reason, both confidences and both locations are expected somewhere, and there are at least 12 negative fixtures', () => {
    const all = corpus.secrets.flatMap((c) => c.expect)
    for (const reason of SECRET_REASONS) expect(all.some((e) => e.reason === reason), `reason ${String(reason)}`).toBe(true)
    for (const confidence of ['high', 'medium']) expect(all.some((e) => e.confidence === confidence), `confidence ${confidence}`).toBe(true)
    for (const location of ['config', 'metadata']) expect(all.some((e) => e.location === location), `location ${location}`).toBe(true)
    expect(corpus.secrets.filter((c) => c.expect.length === 0).length, 'negative fixtures (no finding expected)').toBeGreaterThanOrEqual(12)
  })

  test('every placeholder in the table is used by at least one fixture, and every placeholder a fixture uses exists', () => {
    const used = new Set<string>()
    for (const c of corpus.secrets) for (const m of JSON.stringify(c.workflow).matchAll(PLACEHOLDER)) used.add(m[1])
    expect([...used].filter((n) => !Object.hasOwn(TOKEN_BUILDERS, n)), 'unknown placeholders').toEqual([])
    expect(Object.keys(TOKEN_BUILDERS).filter((n) => !used.has(n)), 'placeholders no fixture uses').toEqual([])
  })

  test('a malformed or unknown placeholder fails the runner, naming only the placeholder (never more text)', () => {
    for (const bad of ['@@NOPE@@', '@@ghp@@', '@@Sk@@', '@@@@', '@@GHP:@@', '@@GHP:x@@', '@@GHP:-1@@']) {
      expect(() => fillPlaceholders(`before ${bad} after`), bad).toThrow('bad placeholder')
    }
    expect(() => fillPlaceholders('@@' + 'x'.repeat(100) + '@@')).toThrow(/^bad placeholder \(name "x{24}"\)$/) // cut short
    expect(() => fillPlaceholders('plain text, an e-mail like a@@b is not a placeholder, and one @@ is not either')).not.toThrow()
    expect(fillPlaceholders('@@SK:3@@')).toBe('sk' + '-' + 'xxx')
  })

  test('a placeholder that makes two keys collide fails (a hidden finding must not look like a pass)', () => {
    expect(() => fillDeep({ '@@SK@@': 'a', ['sk' + '-' + 'x'.repeat(24)]: 'b' })).toThrow('collide')
    expect(() => fillDeep({ a: { '@@SK:5@@': 1, '@@SK:6@@': 2 } })).not.toThrow()
  })

  test('the placeholders build tokens the detector recognises, and a fixture in memory holds one', () => {
    for (const name of ['SK', 'SKANT', 'GSK', 'GHP', 'GHO', 'GHPAT', 'AKIA', 'XOXB', 'JWT', 'PEM', 'PEMRSA', 'BEARER']) {
      expect(detectSecrets({ nodes: [{ id: 'n', config: { t: fillPlaceholders(`x @@${name}@@ y`) } }], metadata: {} } as unknown as Workflow).length, name).toBe(1)
    }
    for (const name of ['PEMPUBLIC', 'JWT2', 'XOXZ']) {
      expect(detectSecrets({ nodes: [{ id: 'n', config: { t: fillPlaceholders(`x @@${name}@@ y`) } }], metadata: {} } as unknown as Workflow), name).toEqual([])
    }
  })

})

// ---------------------------------------------------------------------------
// Push protection: no text file of the repository holds a literal token
// ---------------------------------------------------------------------------

// The repository is pushed to GitHub, whose secret scanning and push protection reject token-shaped strings. This guard walks
// the TEXT FILES OF THE WORKING TREE (the repository root, with a plain file walk: no git subprocess; it skips node_modules,
// .git, dist, test-results, playwright-report, .kilo and binary files) and fails on any match of the patterns below, which have
// NO boundary on purpose (the detector's own patterns do). SCOPE, honestly: it checks what is in the tree when the tests run.
// It does not cover git history, files outside the tree, or the docs of FUTURE commits until they are written and the tests
// run again. A pattern here is a class with a count, never a literal run, so this file and the detector do not trigger it.
// A failure prints the file path, the line number and the pattern NAME only, never the matched text.
const LITERAL_TOKEN_PATTERNS: [string, RegExp][] = [
  ['github token (gh?_)', /gh[pousr]_[A-Za-z0-9]{20}/g],
  ['github fine-grained token', /github_pat_[A-Za-z0-9_]{20}/g],
  ['groq key', /gsk_[A-Za-z0-9]{20}/g],
  ['sk- key', /sk-[A-Za-z0-9_-]{20}/g],
  ['stripe key', /(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20}/g],
  ['aws access key id', /AKIA[0-9A-Z]{16}/g],
  ['aws temporary key id', /ASIA[0-9A-Z]{16}/g],
  ['slack token', /xox[baprs]-[A-Za-z0-9-]{10}/g],
  ['google api key', /AIza[0-9A-Za-z_-]{35}/g],
  ['npm token', /npm_[A-Za-z0-9]{36}/g],
  ['jwt', /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5}/g],
  ['pem private key header', /-----BEGIN[A-Za-z ]{0,30}PRIVATE KEY-----/g],
  ['bearer token', /Bearer\s+[A-Za-z0-9._~+/=-]{20}/g],
]

/** Where a literal token sits in `text`: line numbers and pattern names, never the text. */
export function findTokenLiterals(text: string): { line: number; pattern: string }[] {
  const hits: { line: number; pattern: string }[] = []
  for (const [pattern, regex] of LITERAL_TOKEN_PATTERNS) {
    regex.lastIndex = 0
    for (let m = regex.exec(text); m !== null; m = regex.exec(text)) {
      hits.push({ line: text.slice(0, m.index).split('\n').length, pattern })
    }
  }
  return hits
}

const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'test-results', 'playwright-report', '.kilo'])
const BINARY_EXTENSIONS = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|otf|eot|pdf|zip|gz|mp4|webm|mp3|wasm)$/i

/** Every text file under `root`, as [relative path, content]. */
function textFilesOf(root: string): [string, string][] {
  const found: [string, string][] = []
  const pending = [root]
  while (pending.length > 0) {
    const dir = pending.pop() as string
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) pending.push(path)
      } else if (entry.isFile() && !BINARY_EXTENSIONS.test(entry.name)) {
        const bytes = readFileSync(path)
        if (!bytes.subarray(0, 8000).includes(0)) found.push([relative(root, path).split(sep).join('/'), bytes.toString('utf8')])
      }
    }
  }
  return found
}

describe('push protection: no text file of the repository holds a literal token', () => {
  test('no file in the working tree matches a token pattern (use a placeholder, see contracts/SECRETS.md)', () => {
    const files = textFilesOf(REPO_ROOT)
    expect(files.length, 'the walk found the repository').toBeGreaterThan(200)
    for (const must of ['CLAUDE.md', 'contracts/SECRETS.md', 'frontend/src/workflow/secrets.ts', 'frontend/e2e', 'docs/DECISIONS.md']) {
      expect(files.some(([p]) => p.startsWith(must)), `${must} is in the walk`).toBe(true)
    }
    expect(files.some(([p]) => p.startsWith('node_modules') || p.includes('/node_modules/') || p.startsWith('.git/')), 'skipped directories are skipped').toBe(false)
    const offenders = files.flatMap(([path, text]) => findTokenLiterals(text).map((h) => `${path}:${h.line} (${h.pattern})`))
    expect(offenders, 'literal tokens: file:line (pattern); the text is never printed').toEqual([])
  })

  test('the scanner flags a synthetic token of every pattern, built at run time, and reports no token text', () => {
    const synthetic: Record<string, string> = {
      'github token (gh?_)': 'gh' + 'o_' + 'A'.repeat(36),
      'github fine-grained token': 'github' + '_pat_' + 'A'.repeat(30),
      'groq key': 'gs' + 'k_' + 'x'.repeat(24),
      'sk- key': 'sk' + '-' + 'x'.repeat(24),
      'stripe key': 'sk' + '_live_' + 'x'.repeat(24),
      'aws access key id': 'AK' + 'IA' + 'Q'.repeat(16),
      'aws temporary key id': 'AS' + 'IA' + 'Q'.repeat(16),
      'slack token': 'xo' + 'xb-' + '1'.repeat(12),
      'google api key': 'AI' + 'za' + 'x'.repeat(35),
      'npm token': 'npm' + '_' + 'A'.repeat(36),
      jwt: 'ey' + 'J' + 'a'.repeat(8) + '.' + 'b'.repeat(8) + '.' + 'c'.repeat(8),
      'pem private key header': '-----' + 'BEGIN ' + 'RSA ' + 'PRIVATE KEY' + '-----',
      'bearer token': 'Bea' + 'rer ' + 't'.repeat(24),
    }
    expect(Object.keys(synthetic).sort(), 'one synthetic token per pattern').toEqual(LITERAL_TOKEN_PATTERNS.map(([name]) => name).sort())
    for (const [name, token] of Object.entries(synthetic)) {
      const hits = findTokenLiterals(`line one\nkey = ${token}\n`)
      expect(hits.map((h) => h.pattern), name).toContain(name)
      expect(hits.every((h) => h.line === 2), name).toBe(true)
      expect(JSON.stringify(hits).includes(token.slice(0, 8)), `${name}: the report holds token text`).toBe(false)
    }
    expect(findTokenLiterals('nothing here, just sk- and ghp_ and @@GHP@@ and Bearer token')).toEqual([])
  })
})

describe('schema fixtures (JSON Schema subset validator, explicit applyDefaults, schema check)', () => {
  for (const c of corpus.schema) {
    test(c.name, () => {
      switch (schemaKind(c)) {
        case 'defaults': {
          // the schema must be inside the subset and the result must be a valid (possibly incomplete) config
          expect(checkSchemaSubset(c.schema), `${c.file}: the fixture's own schema is outside the subset`).toEqual([])
          const actual = applyDefaults(c.schema as ObjectSchema)
          expect(validateAgainstSchema(c.schema as JsonSchema, actual, { checkRequired: false }), `${c.file}: applyDefaults result must validate with checkRequired false`).toEqual([])
          // compared as text so the order of the keys counts too
          expect(JSON.stringify(actual), `${c.file}: applyDefaults result (key order counts)`).toBe(JSON.stringify((c.expect as { value: unknown }).value))
          return
        }
        case 'check': {
          const actual = checkSchemaSubset(c.schema).map((p) => p.path)
          expect([...actual].sort(), `${c.file}: schema problem paths (order-insensitive)`).toEqual(
            (c.expect as { path: string }[]).map((e) => e.path).sort(),
          )
          return
        }
        case 'validation': {
          // a fixture schema must itself be inside the subset, or its expectation would prove nothing
          expect(checkSchemaSubset(c.schema), `${c.file}: the fixture's own schema is outside the subset`).toEqual([])
          const actual = validateAgainstSchema(c.schema as JsonSchema, c.value, c.options as { checkRequired: boolean }).map(({ code, path }) => ({ code, path }))
          expect(asMultiset(actual), `${c.file}: schema errors ({code, path}, order-insensitive)`).toEqual(asMultiset(c.expect as Expected[]))
        }
      }
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
    config: { name: 'a', description: 'd', nodeType: 'llm.prompt', config: {}, checkRequired: true, expect: [{ code: 'schema.required', path: '/provider' }] },
    serialization: { name: 'a', description: 'd', inputText: '{"b":1,"a":[]}', expect: { valid: true, compact: '{"a":[],"b":1}', export: '{\n  "a": [],\n  "b": 1\n}\n' } },
    schema: {
      name: 'a',
      description: 'd',
      schema: { type: 'string', minLength: 1 },
      value: '',
      options: { checkRequired: false },
      expect: [{ code: 'schema.minLength', path: '' }],
    },
  }
  const files = {
    invalid: 'workflow/invalid/a.json',
    valid: 'workflow/valid/a.json',
    connection: 'connection/a.json',
    config: 'config/a.json',
    serialization: 'serialization/a.json',
    schema: 'schema/a.json',
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

  describe('schema', () => {
    const file = files.schema
    const defaults = { name: 'a', description: 'd', schema: { type: 'object', properties: {} }, applyDefaults: true, expect: { value: {} } }
    const check = { name: 'a', description: 'd', schema: 5, checkSchema: true, expect: [{ path: '' }] }

    test('a null value, a defaults case and a check case have no problems', () => {
      expect(checkShape(file, { ...good.schema, value: null, expect: [] })).toEqual([])
      expect(checkShape(file, defaults)).toEqual([])
      expect(checkShape(file, check)).toEqual([])
      expect(checkShape(file, { ...check, expect: [] })).toEqual([])
    })
    test('a validation case needs schema, value and exactly { checkRequired }', () => {
      const { value: _value, ...noValue } = good.schema
      const { schema: _schema, ...noSchema } = good.schema
      some(checkShape(file, noValue), 'needs value')
      some(checkShape(file, noSchema), 'needs schema')
      some(checkShape(file, { ...good.schema, schema: 5 }), 'schema must be a JSON object')
      some(checkShape(file, { ...good.schema, options: {} }), 'options must be exactly')
      some(checkShape(file, { ...good.schema, options: { checkRequired: 1 } }), 'options must be exactly')
      some(checkShape(file, { ...good.schema, options: { checkRequired: true, extra: 1 } }), 'options must be exactly')
    })
    test('a validation case expects schema.* codes only, as { code, path }', () => {
      some(checkShape(file, { ...good.schema, expect: [{ code: 'doc.not-json', path: '' }] }), 'must be a schema.* code')
      some(checkShape(file, { ...good.schema, expect: [{ code: 'nope', path: '' }] }), 'not a known error code')
      some(checkShape(file, { ...good.schema, expect: [{ code: 'schema.type', path: 'x' }] }), 'JSON Pointer')
      some(checkShape(file, { ...good.schema, expect: [{ code: 'schema.type', path: '', message: 'm' }] }), 'exactly { code, path }')
      some(checkShape(file, { ...good.schema, expect: {} }), 'array of { code, path }')
    })
    test('a defaults case expects exactly { value: {...} } and takes no value or options', () => {
      some(checkShape(file, { ...defaults, expect: [] }), 'expect must be exactly { "value"')
      some(checkShape(file, { ...defaults, expect: { value: [] } }), 'expect must be exactly { "value"')
      some(checkShape(file, { ...defaults, expect: { value: {}, extra: 1 } }), 'expect must be exactly { "value"')
      some(checkShape(file, { ...defaults, value: {} }), 'value is not allowed in a applyDefaults case')
      some(checkShape(file, { ...defaults, options: { checkRequired: true } }), 'options is not allowed')
      some(checkShape(file, { ...defaults, applyDefaults: false }), 'applyDefaults must be true')
    })
    test('a check case expects an array of exactly { path } and takes no value or options', () => {
      some(checkShape(file, { ...check, expect: [{ path: 'x' }] }), 'array of exactly { path }')
      some(checkShape(file, { ...check, expect: [{ path: '', code: 'schema.type' }] }), 'array of exactly { path }')
      some(checkShape(file, { ...check, expect: { path: '' } }), 'array of exactly { path }')
      some(checkShape(file, { ...check, value: 1 }), 'value is not allowed in a checkSchema case')
      some(checkShape(file, { ...check, checkSchema: false }), 'checkSchema must be true')
    })
    test('applyDefaults and checkSchema together; an unknown field; a family field of another family', () => {
      some(checkShape(file, { ...check, applyDefaults: true }), 'use at most one')
      some(checkShape(file, { ...good.schema, extra: 1 }), 'unknown field "extra"')
      some(checkShape(file, { ...good.schema, nodeType: 'x' }), 'unknown field "nodeType"')
    })
  })

  describe('warnings', () => {
    const file = 'warnings/a.json'
    const ok = { name: 'a', description: 'd', workflow: {}, expect: [{ code: 'result-unused', nodeId: 'n' }] }
    const withExpect = (e: unknown) => ({ ...ok, expect: e })

    test('well-formed cases have no problems (empty expectation, port, field, negativeFor)', () => {
      expect(checkShape(file, ok)).toEqual([])
      expect(checkShape(file, withExpect([]))).toEqual([])
      expect(checkShape(file, withExpect([{ code: 'required-input-unconnected', nodeId: 'n', port: 'input' }, { code: 'required-field-empty', nodeId: 'n', field: 'prompt' }]))).toEqual([])
      expect(checkShape(file, { ...ok, negativeFor: ['node-unreachable', 'result-unused'] })).toEqual([])
    })
    test('workflow must be an object and expect an array of known, well-formed entries', () => {
      some(checkShape(file, { ...ok, workflow: [] }), 'workflow must be a JSON object')
      some(checkShape(file, withExpect({})), 'expect must be an array')
      some(checkShape(file, withExpect([{ code: 'nope', nodeId: 'n' }])), 'not a known warning code')
      some(checkShape(file, withExpect([{ code: 'result-unused', nodeId: '' }])), 'nodeId must be a non-empty string')
      some(checkShape(file, withExpect([{ code: 'result-unused', nodeId: 'n', message: 'm' }])), 'and nothing else')
    })
    test('port belongs to required-input-unconnected and field to required-field-empty', () => {
      some(checkShape(file, withExpect([{ code: 'required-input-unconnected', nodeId: 'n' }])), 'port is required')
      some(checkShape(file, withExpect([{ code: 'result-unused', nodeId: 'n', port: 'input' }])), 'port is required for required-input-unconnected and not allowed otherwise')
      some(checkShape(file, withExpect([{ code: 'required-field-empty', nodeId: 'n' }])), 'field is required')
      some(checkShape(file, withExpect([{ code: 'result-unused', nodeId: 'n', field: 'x' }])), 'not allowed otherwise')
    })
    test('negativeFor must be a non-empty list of distinct known codes', () => {
      for (const n of [[], ['nope'], ['result-unused', 'result-unused'], 'result-unused']) some(checkShape(file, { ...ok, negativeFor: n }), 'negativeFor must be')
    })
    test('the family does not accept another family field', () => {
      some(checkShape(file, { ...ok, input: {} }), 'unknown field "input"')
    })
    test('the secret codes carry a field (the display path) and no port', () => {
      expect(checkShape(file, withExpect([{ code: 'secret-likely', nodeId: 'n', field: 'headers.Authorization' }, { code: 'secret-suspected', nodeId: 'n', field: 'token' }]))).toEqual([])
      some(checkShape(file, withExpect([{ code: 'secret-likely', nodeId: 'n' }])), 'field is required')
      some(checkShape(file, withExpect([{ code: 'secret-suspected', nodeId: 'n', port: 'p', field: 'x' }])), 'port is required for required-input-unconnected and not allowed otherwise')
    })
  })

  describe('secrets', () => {
    const file = 'secrets/a.json'
    const finding = { confidence: 'high', location: 'config', nodeId: 'n', path: 'headers.Authorization', reason: 'header-name' }
    const ok = { name: 'a', description: 'd', workflow: {}, expect: [finding] }
    const withExpect = (e: unknown) => ({ ...ok, expect: e })

    test('well-formed cases have no problems (a finding, a metadata finding, a medium finding, an empty expectation)', () => {
      expect(checkShape(file, ok)).toEqual([])
      expect(checkShape(file, withExpect([]))).toEqual([])
      expect(checkShape(file, withExpect([{ confidence: 'high', location: 'metadata', path: 'note', reason: 'credential-shape' }]))).toEqual([])
      expect(checkShape(file, withExpect([{ confidence: 'medium', location: 'config', nodeId: 'n', path: 'token', reason: 'key-name' }]))).toEqual([])
    })
    test('workflow must be an object and expect an array of exact, known entries', () => {
      some(checkShape(file, { ...ok, workflow: [] }), 'workflow must be a JSON object')
      some(checkShape(file, withExpect({})), 'expect must be an array')
      some(checkShape(file, withExpect([{ ...finding, message: 'm' }])), 'and nothing else')
      some(checkShape(file, withExpect([{ ...finding, confidence: 'low' }])), 'confidence must be')
      some(checkShape(file, withExpect([{ ...finding, location: 'label' }])), 'location must be')
      some(checkShape(file, withExpect([{ ...finding, path: 3 }])), 'path must be a string')
      some(checkShape(file, withExpect([{ ...finding, reason: 'nope' }])), 'reason must be one of')
    })
    test('nodeId goes with location config only, and key-name goes with medium only', () => {
      const { nodeId: _nodeId, ...noNode } = finding
      some(checkShape(file, withExpect([noNode])), 'nodeId is required for location "config"')
      some(checkShape(file, withExpect([{ ...finding, location: 'metadata' }])), 'not allowed for "metadata"')
      some(checkShape(file, withExpect([{ ...finding, nodeId: '' }])), 'nodeId must be a non-empty string')
      some(checkShape(file, withExpect([{ ...finding, reason: 'key-name' }])), 'key-name goes with confidence medium')
      some(checkShape(file, withExpect([{ ...finding, confidence: 'medium' }])), 'key-name goes with confidence medium')
    })
    test('the family does not accept another family field', () => {
      some(checkShape(file, { ...ok, negativeFor: ['secret-likely'] }), 'unknown field "negativeFor"')
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

  test('a config fixture needs a boolean checkRequired', () => {
    const { checkRequired: _checkRequired, ...without } = good.config
    some(checkShape(files.config, without), 'checkRequired must be true or false')
    some(checkShape(files.config, { ...good.config, checkRequired: 'yes' }), 'checkRequired must be true or false')
    some(checkShape(files.config, { ...good.config, checkRequired: 1 }), 'checkRequired must be true or false')
    expect(checkShape(files.config, { ...good.config, checkRequired: false })).toEqual([])
    // the field belongs to the config family only
    some(checkShape(files.schema, { ...good.schema, checkRequired: true }), 'unknown field "checkRequired"')
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

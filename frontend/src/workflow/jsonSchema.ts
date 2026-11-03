// A small, pure validator for the AgentForge JSON Schema subset (plan section 3.1, contracts/CONFIG_SCHEMA.md).
// No React, no dependency. Nothing imports this module yet: T5b switches the catalog, the store, the
// config panel and the importer over to it.
//
// Rules this module keeps on purpose:
//  - every lookup keyed by untrusted data (a value's keys) is an own-property lookup (Object.hasOwn);
//  - a wrong type reports `schema.type` and skips every other keyword for that node;
//  - validators NEVER apply defaults; applyDefaults is a separate, explicit function.
import { jsonPointer } from './errors'
import type { ErrorCode } from './errors'

export type JsonSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'

export interface JsonSchema {
  type: JsonSchemaType
  title?: string
  description?: string
  default?: unknown
  enum?: unknown[]
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  items?: JsonSchema
  minItems?: number
  maxItems?: number
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: boolean | JsonSchema
}

export type ObjectSchema = JsonSchema & { type: 'object' }

export type SchemaErrorCode = Extract<ErrorCode, `schema.${string}`>

/** `path` is an RFC 6901 JSON Pointer relative to the validated value ("" is the value itself). */
export interface SchemaError {
  code: SchemaErrorCode
  path: string
  message: string
}

// ---------------------------------------------------------------------------
// validateAgainstSchema
// ---------------------------------------------------------------------------

/** Returns the reason a value is not of the type, or null. Integers must be safe (AgentForge policy, H5). */
function typeProblem(type: string, value: unknown): string | null {
  switch (type) {
    case 'string':
      return typeof value === 'string' ? null : 'must be text'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : 'must be a number'
    case 'integer':
      return Number.isSafeInteger(value) ? null : 'must be an integer'
    case 'boolean':
      return typeof value === 'boolean' ? null : 'must be true or false'
    case 'array':
      return Array.isArray(value) ? null : 'must be a list'
    case 'object':
      return isPlainObject(value) ? null : 'must be a JSON object'
    default:
      return 'has a schema with an unsupported type'
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function validate(schema: JsonSchema, value: unknown, path: string, checkRequired: boolean, errors: SchemaError[]): void {
  const add = (code: SchemaErrorCode, message: string): void => {
    errors.push({ code, path, message })
  }

  const wrongType = typeProblem(schema.type, value)
  if (wrongType) return add('schema.type', wrongType) // every other keyword is skipped for this node

  if (schema.enum !== undefined && !schema.enum.some((option) => option === value)) {
    add('schema.enum', 'must be one of the allowed values')
  }

  switch (schema.type) {
    case 'string': {
      const text = value as string
      // Length counts code points (Python len() agrees); text.length would count UTF-16 units.
      const length = schema.minLength !== undefined || schema.maxLength !== undefined ? [...text].length : 0
      if (schema.minLength !== undefined && length < schema.minLength) add('schema.minLength', `must have at least ${schema.minLength} characters`)
      if (schema.maxLength !== undefined && length > schema.maxLength) add('schema.maxLength', `must have at most ${schema.maxLength} characters`)
      return
    }
    case 'number':
    case 'integer': {
      const n = value as number
      if (schema.minimum !== undefined && n < schema.minimum) add('schema.minimum', `must be at least ${schema.minimum}`)
      if (schema.maximum !== undefined && n > schema.maximum) add('schema.maximum', `must be at most ${schema.maximum}`)
      return
    }
    case 'array': {
      const list = value as unknown[]
      if (schema.minItems !== undefined && list.length < schema.minItems) add('schema.minItems', `must have at least ${schema.minItems} items`)
      if (schema.maxItems !== undefined && list.length > schema.maxItems) add('schema.maxItems', `must have at most ${schema.maxItems} items`)
      const items = schema.items
      if (items) list.forEach((item, i) => validate(items, item, path + jsonPointer(i), checkRequired, errors))
      return
    }
    case 'object': {
      const object = value as Record<string, unknown>
      const properties = schema.properties ?? {}
      if (checkRequired) {
        for (const key of schema.required ?? []) {
          // absent = not an own property, or an own property whose value is undefined
          if (!Object.hasOwn(object, key) || object[key] === undefined) {
            errors.push({ code: 'schema.required', path: path + jsonPointer(key), message: 'is required' })
          }
        }
      }
      for (const key of Object.keys(object)) {
        const child = path + jsonPointer(key)
        if (Object.hasOwn(properties, key)) {
          validate(properties[key], object[key], child, checkRequired, errors)
        } else if (schema.additionalProperties === false) {
          errors.push({ code: 'schema.additionalProperties', path: child, message: 'is not a known setting' })
        } else if (typeof schema.additionalProperties === 'object' && schema.additionalProperties !== null) {
          validate(schema.additionalProperties, object[key], child, checkRequired, errors)
        }
      }
      return
    }
    default:
      return // boolean has no further keywords
  }
}

/**
 * Validates `value` against `schema`. `checkRequired` is mandatory so no caller applies it by accident:
 * importing a document uses `false` (decision C1: an absent required key is not a structural error),
 * execution uses `true`. Defaults are never applied here.
 */
export function validateAgainstSchema(schema: JsonSchema, value: unknown, options: { checkRequired: boolean }): SchemaError[] {
  const errors: SchemaError[] = []
  validate(schema, value, '', options.checkRequired, errors)
  return errors
}

// ---------------------------------------------------------------------------
// applyDefaults
// ---------------------------------------------------------------------------

/**
 * The initial config for a new node: for each property, in schema order, that has a `default`, a deep
 * copy of it. No recursion and no synthesized nested objects; a required property without a default stays
 * absent. Pure: never mutates the schema, returns a fresh object. Called explicitly (node creation, a
 * migration that adds a property); NO validator calls it.
 */
export function applyDefaults(schema: ObjectSchema): Record<string, unknown> {
  // Object.fromEntries defines own properties, so a property named __proto__ cannot reach the prototype.
  return Object.fromEntries(
    Object.entries(schema.properties ?? {})
      .filter(([, property]) => property.default !== undefined)
      .map(([key, property]) => [key, structuredClone(property.default)]),
  )
}

// ---------------------------------------------------------------------------
// checkSchemaSubset (is the schema itself inside the subset?)
// ---------------------------------------------------------------------------

export interface SchemaProblem {
  path: string
  message: string
}

export const MAX_SCHEMA_DEPTH = 16

const TYPES: readonly string[] = ['string', 'number', 'integer', 'boolean', 'array', 'object']
const COMMON_KEYWORDS = ['type', 'title', 'description', 'default']
const KEYWORDS_BY_TYPE: Record<JsonSchemaType, readonly string[]> = {
  string: ['enum', 'minLength', 'maxLength'],
  number: ['enum', 'minimum', 'maximum'],
  integer: ['enum', 'minimum', 'maximum'],
  boolean: ['enum'],
  array: ['items', 'minItems', 'maxItems'],
  object: ['properties', 'required', 'additionalProperties'],
}
const SUPPORTED_KEYWORDS: readonly string[] = [...COMMON_KEYWORDS, ...Object.values(KEYWORDS_BY_TYPE).flat()]
/** Standard keywords the subset leaves out on purpose (see contracts/CONFIG_SCHEMA.md for why). */
export const NON_GOAL_KEYWORDS: readonly string[] = [
  '$ref', '$defs', 'anyOf', 'oneOf', 'allOf', 'not', 'if', 'then', 'else', 'patternProperties', 'format', 'pattern',
]

const isCount = (v: unknown): boolean => Number.isSafeInteger(v) && (v as number) >= 0

/** Reports every way `schema` falls outside the subset; an empty list means it is well-formed. */
export function checkSchemaSubset(schema: unknown): SchemaProblem[] {
  const problems: SchemaProblem[] = []
  checkNode(schema, '', 1, problems)
  return problems
}

function checkNode(node: unknown, path: string, depth: number, problems: SchemaProblem[]): void {
  const bad = (at: string, message: string): void => {
    problems.push({ path: at, message })
  }
  if (depth > MAX_SCHEMA_DEPTH) return bad(path, `schemas may be nested at most ${MAX_SCHEMA_DEPTH} levels deep`)
  if (!isPlainObject(node)) return bad(path, 'a schema must be an object')
  const get = (key: string): unknown => (Object.hasOwn(node, key) ? node[key] : undefined)
  const has = (key: string): boolean => Object.hasOwn(node, key)

  for (const key of Object.keys(node)) {
    if (SUPPORTED_KEYWORDS.includes(key)) continue
    bad(path + jsonPointer(key), NON_GOAL_KEYWORDS.includes(key) ? `"${key}" is a deliberate non-goal of the subset` : `"${key}" is not a supported keyword`)
  }

  const type = get('type')
  if (typeof type !== 'string' || !TYPES.includes(type)) {
    return bad(path + '/type', `"type" must be one of: ${TYPES.join(', ')}`)
  }
  const allowed = [...COMMON_KEYWORDS, ...KEYWORDS_BY_TYPE[type as JsonSchemaType]]
  for (const key of Object.keys(node)) {
    if (SUPPORTED_KEYWORDS.includes(key) && !allowed.includes(key)) bad(path + jsonPointer(key), `"${key}" is not allowed on type "${type}"`)
  }

  const before = problems.length
  for (const key of ['title', 'description']) {
    if (has(key) && typeof get(key) !== 'string') bad(path + jsonPointer(key), `"${key}" must be a string`)
  }
  for (const key of ['minLength', 'maxLength', 'minItems', 'maxItems']) {
    if (allowed.includes(key) && has(key) && !isCount(get(key))) bad(path + jsonPointer(key), `"${key}" must be a non-negative integer`)
  }
  for (const key of ['minimum', 'maximum']) {
    if (allowed.includes(key) && has(key) && !(typeof get(key) === 'number' && Number.isFinite(get(key)))) bad(path + jsonPointer(key), `"${key}" must be a finite number`)
  }

  const options = get('enum')
  if (allowed.includes('enum') && has('enum')) {
    if (!Array.isArray(options)) bad(path + '/enum', '"enum" must be a list')
    else {
      options.forEach((option, i) => {
        const primitive = typeof option === 'string' || typeof option === 'boolean' || (typeof option === 'number' && Number.isFinite(option))
        if (!primitive) bad(path + jsonPointer('enum', i), 'enum values must be strings, numbers or booleans')
      })
    }
  }

  if (type === 'array' && has('items')) checkNode(get('items'), path + '/items', depth + 1, problems)

  if (type === 'object') {
    const properties = get('properties')
    if (has('properties')) {
      if (!isPlainObject(properties)) bad(path + '/properties', '"properties" must be an object')
      else for (const key of Object.keys(properties)) checkNode(properties[key], path + jsonPointer('properties', key), depth + 1, problems)
    }
    if (has('required')) {
      const required = get('required')
      if (!Array.isArray(required)) bad(path + '/required', '"required" must be a list of property names')
      else {
        required.forEach((name, i) => {
          if (typeof name !== 'string' || !isPlainObject(properties) || !Object.hasOwn(properties, name)) {
            bad(path + jsonPointer('required', i), 'every required name must be a key of "properties"')
          }
        })
      }
    }
    if (has('additionalProperties')) {
      const extra = get('additionalProperties')
      if (typeof extra === 'boolean') {
        // fine
      } else checkNode(extra, path + '/additionalProperties', depth + 1, problems)
    }
  }

  // A default must be a valid value of its own schema. Only checked when the schema below it is sound,
  // so the validator never runs on a malformed schema.
  if (has('default') && get('default') !== undefined && problems.length === before) {
    for (const error of validateAgainstSchema(node as unknown as JsonSchema, get('default'), { checkRequired: false })) {
      bad(path + '/default' + error.path, `the default ${error.message}`)
    }
  }
}

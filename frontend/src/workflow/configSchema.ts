import type { ErrorCode } from './errors'
import type { ConfigProperty, ConfigSchema } from './types'
import { INTERNAL_PARSER_ERROR, strictParse } from './strictJson'
import { POLICY_MESSAGES, findPolicyViolations } from './valuePolicy'
import type { PolicyCode } from './valuePolicy'

const CONFIG_PARENT_DEPTH = 4

export type ConfigErrorCode = Extract<ErrorCode, `schema.${string}`>
export interface ConfigError {
  key: string
  code: ConfigErrorCode
  message: string
}

type ValueProblem = { code: ConfigErrorCode; message: string }

/** The single check behind validateConfigValue and validateConfig. */
function checkValue(prop: ConfigProperty, value: unknown): ValueProblem | null {
  const bad = (code: ConfigErrorCode, message: string): ValueProblem => ({ code, message })
  switch (prop.type) {
    case 'string':
      if (typeof value !== 'string') return bad('schema.type', 'must be text')
      if (prop.enum && !prop.enum.includes(value)) {
        return bad('schema.enum', `must be one of: ${prop.enum.join(', ')}`)
      }
      return null
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return bad('schema.type', 'must be a number')
      if (prop.minimum !== undefined && value < prop.minimum) {
        return bad('schema.minimum', `must be at least ${prop.minimum}`)
      }
      if (prop.maximum !== undefined && value > prop.maximum) {
        return bad('schema.maximum', `must be at most ${prop.maximum}`)
      }
      return null
    case 'boolean':
      return typeof value === 'boolean' ? null : bad('schema.type', 'must be true or false')
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? null
        : bad('schema.type', 'must be a JSON object')
  }
}

/** Returns an error message, or null when the value is valid for the property. */
export function validateConfigValue(prop: ConfigProperty, value: unknown): string | null {
  return checkValue(prop, value)?.message ?? null
}

/**
 * Parses raw form text into a config value for the property and validates it.
 * Used by the config panel so invalid input is flagged and never committed.
 */
export function parseConfigInput(
  prop: ConfigProperty,
  raw: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  let value: unknown = raw
  if (prop.type === 'number') {
    value = raw.trim() === '' ? NaN : Number(raw)
  } else if (prop.type === 'object') {
    // The strict parser (not the built-in one): a duplicate key, an unsafe number or NUL typed here
    // is flagged instead of being silently collapsed or rounded.
    const parsed = strictParse(raw)
    if (!parsed.ok) {
      const { code, message } = parsed.error
      // A typo in the text is "must be valid JSON"; an internal parser failure must not look like a typo.
      if (code === 'doc.not-json') return { ok: false, error: message === INTERNAL_PARSER_ERROR ? message : 'must be valid JSON' }
      // Policy problems keep the wording used for typed values; a duplicate key shows the parser's bounded message.
      return { ok: false, error: Object.hasOwn(POLICY_MESSAGES, code) ? POLICY_MESSAGES[code as PolicyCode] : message }
    }
    value = parsed.value
  }
  const error = validateConfigValue(prop, value)
  if (error) return { ok: false, error }
  // Round-trip integrity: a value the importer would reject must never be committed. The value
  // sits under Workflow(1) > nodes(2) > node(3) > config(4), so an object here is at depth 5.
  const violation = findPolicyViolations(value, CONFIG_PARENT_DEPTH)[0]
  return violation ? { ok: false, error: violation.message } : { ok: true, value }
}

/**
 * Validates a node config against its schema: missing required keys first, then each config
 * key in Object.entries order (integer-like keys sort first in JS objects).
 * Config keys are untrusted, so schema lookups use own-property checks: a key such as
 * "constructor" or "__proto__" must not resolve to an inherited member.
 */
export function validateConfig(schema: ConfigSchema, config: Record<string, unknown>): ConfigError[] {
  const errors: ConfigError[] = []
  for (const key of schema.required ?? []) {
    if (config[key] === undefined) errors.push({ key, code: 'schema.required', message: 'is required' })
  }
  for (const [key, value] of Object.entries(config)) {
    const prop = Object.hasOwn(schema.properties, key) ? schema.properties[key] : undefined
    if (!prop) {
      errors.push({ key, code: 'schema.additionalProperties', message: 'is not a known setting' })
      continue
    }
    const problem = checkValue(prop, value)
    if (problem) errors.push({ key, ...problem })
  }
  return errors
}

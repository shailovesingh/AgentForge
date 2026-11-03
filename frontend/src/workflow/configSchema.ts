import type { ErrorCode } from './errors'
import type { ConfigProperty, ConfigSchema } from './types'

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
    try {
      value = JSON.parse(raw)
    } catch {
      return { ok: false, error: 'must be valid JSON' }
    }
  }
  const error = validateConfigValue(prop, value)
  return error ? { ok: false, error } : { ok: true, value }
}

/** Validates a node config against its schema: missing required keys first, then each config key in order. */
export function validateConfig(schema: ConfigSchema, config: Record<string, unknown>): ConfigError[] {
  const errors: ConfigError[] = []
  for (const key of schema.required ?? []) {
    if (config[key] === undefined) errors.push({ key, code: 'schema.required', message: 'is required' })
  }
  for (const [key, value] of Object.entries(config)) {
    const prop = schema.properties[key]
    if (!prop) {
      errors.push({ key, code: 'schema.additionalProperties', message: 'is not a known setting' })
      continue
    }
    const problem = checkValue(prop, value)
    if (problem) errors.push({ key, ...problem })
  }
  return errors
}

import type { ConfigProperty, ConfigSchema } from './types'

/** Returns an error message, or null when the value is valid for the property. */
export function validateConfigValue(prop: ConfigProperty, value: unknown): string | null {
  switch (prop.type) {
    case 'string':
      if (typeof value !== 'string') return 'must be text'
      if (prop.enum && !prop.enum.includes(value)) return `must be one of: ${prop.enum.join(', ')}`
      return null
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'must be a number'
      if (prop.minimum !== undefined && value < prop.minimum) return `must be at least ${prop.minimum}`
      if (prop.maximum !== undefined && value > prop.maximum) return `must be at most ${prop.maximum}`
      return null
    case 'boolean':
      return typeof value === 'boolean' ? null : 'must be true or false'
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? null
        : 'must be a JSON object'
  }
}

/** Validates a node config against its schema. Returns errors keyed by property name. */
export function validateConfig(
  schema: ConfigSchema,
  config: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const key of schema.required ?? []) {
    if (config[key] === undefined) errors[key] = 'is required'
  }
  for (const [key, value] of Object.entries(config)) {
    const prop = schema.properties[key]
    if (!prop) {
      errors[key] = 'is not a known setting'
      continue
    }
    const error = validateConfigValue(prop, value)
    if (error) errors[key] = error
  }
  return errors
}

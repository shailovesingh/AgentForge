import type { JsonSchema } from './jsonSchema'
import { validateAgainstSchema } from './jsonSchema'
import { INTERNAL_PARSER_ERROR, strictParse } from './strictJson'
import { POLICY_MESSAGES, findPolicyViolations } from './valuePolicy'
import type { PolicyCode } from './valuePolicy'

const CONFIG_PARENT_DEPTH = 4

/**
 * Parses raw form text into a config value for one property schema and validates it.
 * Used by the config panel so invalid input is flagged and never committed.
 * Object and array properties are typed as JSON text; number and integer properties as a number.
 */
export function parseConfigInput(
  prop: JsonSchema,
  raw: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  let value: unknown = raw
  if (prop.type === 'number' || prop.type === 'integer') {
    value = raw.trim() === '' ? NaN : Number(raw)
  } else if (prop.type === 'object' || prop.type === 'array') {
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
  // checkRequired: false: a single property has nothing to be "required" of; nested required keys are an execution concern (C1).
  const error = validateAgainstSchema(prop, value, { checkRequired: false })[0]?.message
  if (error) return { ok: false, error }
  // Round-trip integrity: a value the importer would reject must never be committed. The value
  // sits under Workflow(1) > nodes(2) > node(3) > config(4), so an object here is at depth 5.
  const violation = findPolicyViolations(value, CONFIG_PARENT_DEPTH)[0]
  return violation ? { ok: false, error: violation.message } : { ok: true, value }
}

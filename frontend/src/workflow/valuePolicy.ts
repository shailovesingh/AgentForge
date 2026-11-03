// AgentForge value policy for Workflow JSON (docs/PHASE1_1_PLAN.md section 3.5, rules 6 to 10).
// These are AgentForge rules, not RFC 8785 rules. The strict import parser enforces them on text;
// `findPolicyViolations` enforces the same rules on a value the user typed in the editor, so that
// nothing the editor accepts can be rejected when the exported file is imported again.

import { jsonPointer } from './errors'
import type { ValidationError } from './errors'

/** Maximum nesting depth, with the root value at depth 1 (AgentForge policy, decision C2). */
export const MAX_DEPTH = 64

/** Every number must have a magnitude of at most 2^53 - 1 (AgentForge policy). */
export const MAX_SAFE_MAGNITUDE = 2 ** 53 - 1

export type PolicyCode =
  | 'doc.too-deep'
  | 'value.not-finite'
  | 'value.unsafe-integer'
  | 'value.invalid-unicode'
  | 'value.nul-character'

export const POLICY_MESSAGES: Record<PolicyCode, string> = {
  'doc.too-deep': `is nested more than ${MAX_DEPTH} levels deep`,
  'value.not-finite': 'has a number that is not finite',
  'value.unsafe-integer': `has a number outside the supported range (-${MAX_SAFE_MAGNITUDE} to ${MAX_SAFE_MAGNITUDE})`,
  'value.invalid-unicode': 'contains invalid Unicode (an unpaired surrogate)',
  // AgentForge / PostgreSQL jsonb rule, NOT an RFC 8785 rule: PostgreSQL cannot store U+0000.
  'value.nul-character': 'contains a NUL character (U+0000), which is not supported',
}

/** The first string problem in code unit order, or null. A valid surrogate pair is fine. */
export function stringProblem(s: string): 'value.nul-character' | 'value.invalid-unicode' | null {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c === 0) return 'value.nul-character'
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1) // NaN at the end of the string
      if (next >= 0xdc00 && next <= 0xdfff) i++
      else return 'value.invalid-unicode'
    } else if (c >= 0xdc00 && c <= 0xdfff) return 'value.invalid-unicode'
  }
  return null
}

const MAX_VIOLATIONS = 20

/**
 * Walks an already-parsed value and reports every policy violation (at most 20). Paths are JSON
 * Pointers relative to `value`. `baseDepth` is the depth of the value's parent in the document, so a
 * container passed in sits at `baseDepth + 1` (a config object: Workflow 1 > nodes 2 > node 3 >
 * config 4, so baseDepth is 4). Scalars do not add depth. Never descends past the depth limit.
 */
export function findPolicyViolations(value: unknown, baseDepth: number): ValidationError[] {
  const out: ValidationError[] = []
  const add = (code: PolicyCode, path: (string | number)[]) => {
    if (out.length < MAX_VIOLATIONS) out.push({ code, path: jsonPointer(...path), message: POLICY_MESSAGES[code] })
  }
  const walk = (v: unknown, parentDepth: number, path: (string | number)[]) => {
    if (out.length >= MAX_VIOLATIONS) return
    if (typeof v === 'string') {
      const problem = stringProblem(v)
      if (problem) add(problem, path)
    } else if (typeof v === 'number') {
      if (!Number.isFinite(v)) add('value.not-finite', path)
      else if (Math.abs(v) > MAX_SAFE_MAGNITUDE) add('value.unsafe-integer', path)
    } else if (typeof v === 'object' && v !== null) {
      const depth = parentDepth + 1
      if (depth > MAX_DEPTH) return add('doc.too-deep', path)
      if (Array.isArray(v)) {
        v.forEach((item, i) => walk(item, depth, [...path, i]))
      } else {
        for (const key of Object.keys(v)) {
          const problem = stringProblem(key)
          if (problem) add(problem, [...path, key])
          walk((v as Record<string, unknown>)[key], depth, [...path, key])
        }
      }
    }
  }
  walk(value, baseDepth, [])
  return out
}

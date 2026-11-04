// Structured validation errors for import and export, plus the execution-time code `schema.required` and the export-only code
// `value.not-json-data`. Codes are stable and namespaced; the
// message is the human-readable text shown to the user. See docs/PHASE1_1_PLAN.md section 3.2.
// Only codes that are actually produced belong here (by import, export, or the schema validator); later tasks add their own.

export const ERROR_CODES = [
  'doc.not-json',
  'doc.not-object',
  'doc.too-large',
  'doc.too-deep',
  'doc.duplicate-key',
  'doc.invalid-encoding',
  'doc.unsupported-version',
  'doc.invalid-field',
  'node.malformed',
  'node.duplicate-id',
  'node.unknown-type',
  'edge.malformed',
  'edge.duplicate-id',
  'connection.unknown-node',
  'connection.unknown-port',
  'connection.self-loop',
  'connection.duplicate',
  'connection.input-occupied',
  'connection.type-mismatch',
  'connection.cycle',
  'schema.type',
  'schema.enum',
  // EXECUTION-ONLY: produced by validateAgainstSchema with checkRequired: true (Phase 3 execution). Import
  // validates with checkRequired: false (decision C1, D-025), so an imported file never produces it.
  'schema.required',
  'schema.additionalProperties',
  'schema.minimum',
  'schema.maximum',
  // The next four are produced by the JSON Schema subset validator (jsonSchema.ts), but no catalog schema uses
  // those keywords yet, so no workflow import can produce them either.
  'schema.minLength',
  'schema.maxLength',
  'schema.minItems',
  'schema.maxItems',
  'value.not-finite',
  'value.unsafe-integer',
  'value.invalid-unicode',
  'value.nul-character',
  // EXPORT-ONLY: produced by exportWorkflowText for a value that is not JSON data (undefined, a Date,
  // a function, a bigint ...). An imported file can never produce it, because parsed JSON is always data.
  'value.not-json-data',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/** `path` is an RFC 6901 JSON Pointer into the imported document ("" is the whole document). */
export interface ValidationError {
  code: ErrorCode
  path: string
  message: string
}

/** Builds an RFC 6901 JSON Pointer: each segment is escaped (`~` -> `~0`, `/` -> `~1`) and prefixed with `/`. */
export function jsonPointer(...segments: (string | number)[]): string {
  return segments.map((s) => '/' + String(s).replace(/~/g, '~0').replace(/\//g, '~1')).join('')
}

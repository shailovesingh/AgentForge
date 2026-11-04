// Imported by tests only (errors.test.ts and contracts/fixtures.test.ts). Production code never imports it.
// The one home of the two EXPLICIT exemption lists from the "every error code is covered" guards. Every
// code NOT listed here must keep a workflow/invalid fixture and an import case; do not add a code to
// dodge that.

/**
 * Codes only the export guard produces: an imported file is parsed JSON, which is always data, so it can
 * never produce them. Tested through exportWorkflowText (errors.test.ts, serialize.test.ts); no fixture may expect one.
 */
export const EXPORT_ONLY_CODES = ['value.not-json-data'] as const

/**
 * Codes that validateAgainstSchema can produce but that no imported workflow can. They are covered by the
 * `schema` fixture family and by the `config` family (guards in fixtures.test.ts), and no workflow/invalid
 * fixture may expect them (the guard fails if one does: then remove the code from this list).
 */
export const SCHEMA_ONLY_CODES = [
  // Execution-only: import validates with checkRequired: false (decision C1, D-025); Phase 3 execution uses true.
  'schema.required',
  // No catalog schema uses these keywords yet. Remove an entry when a catalog schema does and a workflow/invalid fixture covers it.
  'schema.minLength',
  'schema.maxLength',
  'schema.minItems',
  'schema.maxItems',
] as const

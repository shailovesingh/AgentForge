import { exportPretty } from './canonicalJson'
import type { ValidationError } from './errors'
import { migrate } from './migrate'
import { strictParse } from './strictJson'
import type { NodeDefinition, Workflow } from './types'
import { validateWorkflow } from './validate'
import type { ValidateResult } from './validate'
import { findPolicyViolations } from './valuePolicy'

// Imported files are untrusted input. AgentForge policy (decision C2): at most 5,000,000 UTF-8
// BYTES (not characters), checked before parsing.
export const MAX_IMPORT_BYTES = 5_000_000

/** The error for an import over the size limit (shared with the file picker, which checks `file.size`). */
export const importTooLarge = (): ValidationError => ({
  code: 'doc.too-large',
  path: '',
  message: `File is too large to import (the limit is ${MAX_IMPORT_BYTES.toLocaleString('en-US')} bytes).`,
})

/**
 * The error for an export over the size limit. The limit is the import limit: a workflow the editor
 * lets you export must always be importable again (decision D-031).
 */
export const exportTooLarge = (): ValidationError => ({
  code: 'doc.too-large',
  path: '',
  message: `Workflow is too large to export (the limit is ${MAX_IMPORT_BYTES.toLocaleString('en-US')} bytes, the same as for import, so the file could not be imported again).`,
})

/**
 * Serializes a workflow to the exported JSON text (profile `export-json/1`: keys sorted at every level,
 * so the top level is alphabetical). Throws for values that are not valid JSON data; the UI calls
 * `exportWorkflowText`, which checks first and returns structured errors instead.
 */
export function serializeWorkflow(workflow: Workflow): string {
  return exportPretty(workflow)
}

/** UTF-8 byte length of a string without encoding it; stops counting once the limit is passed. */
function utf8Length(text: string, limit: number): number {
  let bytes = 0
  for (let i = 0; i < text.length && bytes <= limit; i++) {
    const c = text.charCodeAt(i)
    if (c < 0x80) bytes += 1
    else if (c < 0x800) bytes += 2
    else if (c >= 0xd800 && c <= 0xdbff && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) {
      bytes += 4
      i++
    } else bytes += 3 // a lone surrogate encodes as U+FFFD (3 bytes)
  }
  return bytes
}

/**
 * The export guard: checks the whole workflow against the value policy (name, labels, config values,
 * metadata) and the size limit BEFORE a file is written, and returns structured errors instead of
 * throwing. A workflow that passes can always be imported again.
 */
export function exportWorkflowText(workflow: Workflow): { ok: true; text: string } | { ok: false; errors: ValidationError[] } {
  const violations = findPolicyViolations(workflow, 0)
  if (violations.length > 0) return { ok: false, errors: violations }
  const text = exportPretty(workflow)
  if (utf8Length(text, MAX_IMPORT_BYTES) > MAX_IMPORT_BYTES) return { ok: false, errors: [exportTooLarge()] }
  return { ok: true, text }
}

const BOM = String.fromCharCode(0xfeff) // built at run time so the source holds no invisible character
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }) // ignoreBOM: keep a BOM (we strip exactly one by hand)

/**
 * Parses, migrates and validates imported text or bytes. Never throws; returns readable errors.
 * The size limit counts UTF-8 bytes and is checked before anything is decoded or parsed. One
 * leading byte order mark is tolerated and dropped (it is never written).
 */
export function importWorkflow(input: string | Uint8Array, catalog: NodeDefinition[]): ValidateResult {
  let text: string
  if (typeof input === 'string') {
    if (utf8Length(input, MAX_IMPORT_BYTES) > MAX_IMPORT_BYTES) return { ok: false, errors: [importTooLarge()] }
    text = input.startsWith(BOM) ? input.slice(1) : input
  } else {
    if (input.byteLength > MAX_IMPORT_BYTES) return { ok: false, errors: [importTooLarge()] }
    const hasBom = input.byteLength >= 3 && input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf
    try {
      text = decoder.decode(hasBom ? input.subarray(3) : input)
    } catch {
      return {
        ok: false,
        errors: [{ code: 'doc.invalid-encoding', path: '', message: 'File is not valid UTF-8 text.' }],
      }
    }
  }
  const parsed = strictParse(text)
  if (!parsed.ok) return { ok: false, errors: [parsed.error] }
  const migrated = migrate(parsed.value)
  if (!migrated.ok) return migrated
  return validateWorkflow(migrated.doc, catalog)
}

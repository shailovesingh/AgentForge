import type { ValidationError } from './errors'
import { migrate } from './migrate'
import { strictParse } from './strictJson'
import type { NodeDefinition, Workflow } from './types'
import { validateWorkflow } from './validate'
import type { ValidateResult } from './validate'

// Imported files are untrusted input. AgentForge policy (decision C2): at most 5,000,000 UTF-8
// BYTES (not characters), checked before parsing.
export const MAX_IMPORT_BYTES = 5_000_000

/** The error for an import over the size limit (shared with the file picker, which checks `file.size`). */
export const importTooLarge = (): ValidationError => ({
  code: 'doc.too-large',
  path: '',
  message: `File is too large to import (the limit is ${MAX_IMPORT_BYTES.toLocaleString('en-US')} bytes).`,
})

/** Serializes a workflow to the exported JSON text. Key order is fixed by the Workflow shape. */
export function serializeWorkflow(workflow: Workflow): string {
  const { schemaVersion, id, name, description, nodes, edges, metadata } = workflow
  const canonical: Workflow = {
    schemaVersion,
    id,
    name,
    description,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      typeVersion: n.typeVersion,
      label: n.label,
      config: n.config,
      position: { x: n.position.x, y: n.position.y },
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: { nodeId: e.source.nodeId, port: e.source.port },
      target: { nodeId: e.target.nodeId, port: e.target.port },
    })),
    metadata,
  }
  return JSON.stringify(canonical, null, 2) + '\n'
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

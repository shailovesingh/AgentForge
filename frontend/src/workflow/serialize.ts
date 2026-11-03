import { migrate } from './migrate'
import type { NodeDefinition, Workflow } from './types'
import { validateWorkflow } from './validate'
import type { ValidateResult } from './validate'

// Imported files are untrusted input; refuse absurd sizes before parsing.
export const MAX_IMPORT_CHARS = 5 * 1024 * 1024

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

/** Parses, migrates and validates imported text. Never throws; returns readable errors. */
export function importWorkflow(text: string, catalog: NodeDefinition[]): ValidateResult {
  if (text.length > MAX_IMPORT_CHARS) {
    return { ok: false, errors: ['File is too large to import.'] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return { ok: false, errors: [`Not valid JSON: ${e instanceof Error ? e.message : String(e)}`] }
  }
  const migrated = migrate(parsed)
  if (!migrated.ok) return migrated
  return validateWorkflow(migrated.doc, catalog)
}

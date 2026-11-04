import { CONNECTION_ERROR_MESSAGES, checkConnection } from './connections'
import { jsonPointer } from './errors'
import type { ErrorCode, ValidationError } from './errors'
import { validateAgainstSchema } from './jsonSchema'
import type { NodeDefinition, Workflow, WorkflowEdge, WorkflowNode } from './types'

export type ValidateResult = { ok: true; workflow: Workflow } | { ok: false; errors: ValidationError[] }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string'
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const MAX_ERRORS = 20

/**
 * Validates a (migrated) parsed document: shape, node types and configs, and every edge
 * against the same connection rules the editor enforces. Returns a Workflow holding only the known
 * fields (unknown extra keys dropped). Key order is not decided here: the export writer sorts keys,
 * which is what keeps export -> import -> export stable.
 */
export function validateWorkflow(doc: Record<string, unknown>, catalog: NodeDefinition[]): ValidateResult {
  const errors: ValidationError[] = []
  const err = (code: ErrorCode, path: string, message: string) => {
    if (errors.length < MAX_ERRORS) errors.push({ code, path, message })
  }

  for (const key of ['id', 'name', 'description'] as const) {
    if (!isString(doc[key])) err('doc.invalid-field', jsonPointer(key), `"${key}" must be a string.`)
  }
  if (!isRecord(doc.metadata)) err('doc.invalid-field', jsonPointer('metadata'), '"metadata" must be an object.')
  if (!Array.isArray(doc.nodes)) err('doc.invalid-field', jsonPointer('nodes'), '"nodes" must be an array.')
  if (!Array.isArray(doc.edges)) err('doc.invalid-field', jsonPointer('edges'), '"edges" must be an array.')
  if (errors.length > 0) return { ok: false, errors }

  // --- nodes ---
  const nodes: WorkflowNode[] = []
  const nodeIds = new Set<string>()
  ;(doc.nodes as unknown[]).forEach((raw, i) => {
    const at = `nodes[${i}]`
    const ptr = jsonPointer('nodes', i)
    if (!isRecord(raw)) return err('node.malformed', ptr, `${at} must be an object.`)
    const pos = raw.position
    if (
      !isString(raw.id) ||
      !isString(raw.type) ||
      !Number.isInteger(raw.typeVersion) ||
      !isString(raw.label) ||
      !isRecord(raw.config) ||
      !isRecord(pos) ||
      !isNumber(pos.x) ||
      !isNumber(pos.y)
    ) {
      return err('node.malformed', ptr, `${at} is malformed (needs id, type, typeVersion, label, config, position {x,y}).`)
    }
    if (nodeIds.has(raw.id)) {
      return err('node.duplicate-id', jsonPointer('nodes', i, 'id'), `${at}: duplicate node id "${raw.id}".`)
    }
    nodeIds.add(raw.id)

    const def = catalog.find((d) => d.type === raw.type && d.version === raw.typeVersion)
    if (!def) {
      return err(
        'node.unknown-type',
        jsonPointer('nodes', i, 'type'),
        `${at} ("${raw.id}"): unknown node type ${raw.type}@${String(raw.typeVersion)}.`,
      )
    }
    // Decision C1: an absent required key is NOT a structural error, so an incomplete draft imports.
    // Execution (Phase 3) will validate with checkRequired: true.
    for (const { code, path, message } of validateAgainstSchema(def.configSchema, raw.config, { checkRequired: false })) {
      // `path` is relative to the config object ("/provider"); the message names the setting without the leading slash,
      // with the JSON Pointer escapes undone (`~1` first, then `~0`, per RFC 6901) so a key "a/b" reads "a/b", not "a~1b".
      const setting = path.slice(1).replace(/~1/g, '/').replace(/~0/g, '~')
      err(code, jsonPointer('nodes', i, 'config') + path, `${at} ("${raw.id}"): config "${setting}" ${message}.`)
    }
    nodes.push({
      id: raw.id,
      type: raw.type,
      typeVersion: raw.typeVersion as number,
      label: raw.label,
      config: raw.config,
      position: { x: pos.x, y: pos.y },
    })
  })

  // --- edges ---
  // Each edge is checked as if being added to the edges accepted so far, which reuses the
  // editor's connection rules (ports, types, single-input, no self-loop, no cycles).
  const edges: WorkflowEdge[] = []
  const edgeIds = new Set<string>()
  ;(doc.edges as unknown[]).forEach((raw, i) => {
    const at = `edges[${i}]`
    const ptr = jsonPointer('edges', i)
    const malformed = `${at} is malformed (needs id, source {nodeId,port}, target {nodeId,port}).`
    if (!isRecord(raw) || !isRecord(raw.source) || !isRecord(raw.target)) {
      return err('edge.malformed', ptr, malformed)
    }
    const { source, target } = raw
    if (
      !isString(raw.id) ||
      !isString(source.nodeId) ||
      !isString(source.port) ||
      !isString(target.nodeId) ||
      !isString(target.port)
    ) {
      return err('edge.malformed', ptr, malformed)
    }
    if (edgeIds.has(raw.id)) {
      return err('edge.duplicate-id', jsonPointer('edges', i, 'id'), `${at}: duplicate edge id "${raw.id}".`)
    }
    edgeIds.add(raw.id)

    const edge: WorkflowEdge = {
      id: raw.id,
      source: { nodeId: source.nodeId, port: source.port },
      target: { nodeId: target.nodeId, port: target.port },
    }
    const partial = { ...(doc as object), nodes, edges } as Workflow
    const problem = checkConnection(partial, catalog, edge.source, edge.target)
    if (problem) {
      // `as const` makes this a template-literal type, so a ConnectionError without a code fails to compile.
      return err(`connection.${problem}` as const, ptr, `${at} ("${raw.id}") ${CONNECTION_ERROR_MESSAGES[problem]}.`)
    }
    edges.push(edge)
  })

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    workflow: {
      schemaVersion: doc.schemaVersion as string,
      id: doc.id as string,
      name: doc.name as string,
      description: doc.description as string,
      nodes,
      edges,
      metadata: doc.metadata as Record<string, unknown>,
    },
  }
}

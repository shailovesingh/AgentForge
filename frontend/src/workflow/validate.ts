import { validateConfig } from './configSchema'
import { CONNECTION_ERROR_MESSAGES, checkConnection } from './connections'
import type { NodeDefinition, Workflow, WorkflowEdge, WorkflowNode } from './types'

export type ValidateResult = { ok: true; workflow: Workflow } | { ok: false; errors: string[] }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string'
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const MAX_ERRORS = 20

/**
 * Validates a (migrated) parsed document: shape, node types and configs, and every edge
 * against the same connection rules the editor enforces. Returns a canonical Workflow
 * (fixed key order, unknown extra keys dropped) so export -> import -> export is stable.
 */
export function validateWorkflow(doc: Record<string, unknown>, catalog: NodeDefinition[]): ValidateResult {
  const errors: string[] = []
  const err = (message: string) => {
    if (errors.length < MAX_ERRORS) errors.push(message)
  }

  for (const key of ['id', 'name', 'description'] as const) {
    if (!isString(doc[key])) err(`"${key}" must be a string.`)
  }
  if (!isRecord(doc.metadata)) err('"metadata" must be an object.')
  if (!Array.isArray(doc.nodes)) err('"nodes" must be an array.')
  if (!Array.isArray(doc.edges)) err('"edges" must be an array.')
  if (errors.length > 0) return { ok: false, errors }

  // --- nodes ---
  const nodes: WorkflowNode[] = []
  const nodeIds = new Set<string>()
  ;(doc.nodes as unknown[]).forEach((raw, i) => {
    const at = `nodes[${i}]`
    if (!isRecord(raw)) return err(`${at} must be an object.`)
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
      return err(`${at} is malformed (needs id, type, typeVersion, label, config, position {x,y}).`)
    }
    if (nodeIds.has(raw.id)) return err(`${at}: duplicate node id "${raw.id}".`)
    nodeIds.add(raw.id)

    const def = catalog.find((d) => d.type === raw.type && d.version === raw.typeVersion)
    if (!def) return err(`${at} ("${raw.id}"): unknown node type ${raw.type}@${String(raw.typeVersion)}.`)
    for (const [key, message] of Object.entries(validateConfig(def.configSchema, raw.config))) {
      err(`${at} ("${raw.id}"): config "${key}" ${message}.`)
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
    if (!isRecord(raw) || !isRecord(raw.source) || !isRecord(raw.target)) {
      return err(`${at} is malformed (needs id, source {nodeId,port}, target {nodeId,port}).`)
    }
    const { source, target } = raw
    if (
      !isString(raw.id) ||
      !isString(source.nodeId) ||
      !isString(source.port) ||
      !isString(target.nodeId) ||
      !isString(target.port)
    ) {
      return err(`${at} is malformed (needs id, source {nodeId,port}, target {nodeId,port}).`)
    }
    if (edgeIds.has(raw.id)) return err(`${at}: duplicate edge id "${raw.id}".`)
    edgeIds.add(raw.id)

    const edge: WorkflowEdge = {
      id: raw.id,
      source: { nodeId: source.nodeId, port: source.port },
      target: { nodeId: target.nodeId, port: target.port },
    }
    const partial = { ...(doc as object), nodes, edges } as Workflow
    const problem = checkConnection(partial, catalog, edge.source, edge.target)
    if (problem) return err(`${at} ("${raw.id}") ${CONNECTION_ERROR_MESSAGES[problem]}.`)
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

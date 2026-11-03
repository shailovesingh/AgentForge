import type { NodeDefinition, PortDefinition, PortRef, Workflow } from './types'

// Pure connection rules. Used by the canvas (live drag feedback), the store (last gate) and
// the importer (each edge is checked as if it were being added), so there is one rule set.

export type ConnectionError =
  | 'unknown-node'
  | 'unknown-port'
  | 'self-loop'
  | 'duplicate'
  | 'input-occupied'
  | 'type-mismatch'
  | 'cycle'

export const CONNECTION_ERROR_MESSAGES: Record<ConnectionError, string> = {
  'unknown-node': 'references a node that does not exist or is not in the catalog',
  'unknown-port': 'references a port that the node does not have',
  'self-loop': 'connects a node to itself',
  duplicate: 'duplicates an existing connection',
  'input-occupied': 'targets an input that already has a connection',
  'type-mismatch': 'connects incompatible data types',
  cycle: 'would create a cycle (workflows must be acyclic)',
}

function isCompatible(from: PortDefinition, to: PortDefinition): boolean {
  return from.dataType === 'any' || to.dataType === 'any' || from.dataType === to.dataType
}

/** True if `to` is reachable from `from` by following edges. */
function isReachable(workflow: Workflow, from: string, to: string): boolean {
  const next = new Map<string, string[]>()
  for (const e of workflow.edges) {
    next.set(e.source.nodeId, [...(next.get(e.source.nodeId) ?? []), e.target.nodeId])
  }
  const seen = new Set<string>()
  const stack = [from]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (id === to) return true
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...(next.get(id) ?? []))
  }
  return false
}

/**
 * Checks whether `source` (an output port) can be connected to `target` (an input port)
 * in `workflow`. Returns null when allowed, otherwise the first rule that fails.
 */
export function checkConnection(
  workflow: Workflow,
  catalog: NodeDefinition[],
  source: PortRef,
  target: PortRef,
): ConnectionError | null {
  const find = (nodeId: string) => {
    const node = workflow.nodes.find((n) => n.id === nodeId)
    return node && catalog.find((d) => d.type === node.type && d.version === node.typeVersion)
  }
  const sourceDef = find(source.nodeId)
  const targetDef = find(target.nodeId)
  if (!sourceDef || !targetDef) return 'unknown-node'

  const out = sourceDef.outputs.find((p) => p.name === source.port)
  const input = targetDef.inputs.find((p) => p.name === target.port)
  if (!out || !input) return 'unknown-port'

  if (source.nodeId === target.nodeId) return 'self-loop'

  const edges = workflow.edges
  if (
    edges.some(
      (e) =>
        e.source.nodeId === source.nodeId &&
        e.source.port === source.port &&
        e.target.nodeId === target.nodeId &&
        e.target.port === target.port,
    )
  ) {
    return 'duplicate'
  }

  if (
    !input.multiple &&
    edges.some((e) => e.target.nodeId === target.nodeId && e.target.port === target.port)
  ) {
    return 'input-occupied'
  }

  if (!isCompatible(out, input)) return 'type-mismatch'

  // The new edge closes a cycle iff the source is already reachable from the target.
  if (isReachable(workflow, target.nodeId, source.nodeId)) return 'cycle'

  return null
}

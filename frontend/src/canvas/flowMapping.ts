import type { Connection, Edge, Node } from '@xyflow/react'
import type { PortRef, WorkflowEdge, WorkflowNode } from '../workflow/types'

// The only place that converts between the Workflow document and React Flow objects (D-003).
// React Flow types stay inside canvas/ and nodes/.

export type FlowNode = Node<{ node: WorkflowNode }, 'workflow'>
export type Measured = Record<string, { width: number; height: number }>

export function toFlowNodes(nodes: WorkflowNode[], selectedIds: string[], measured: Measured): FlowNode[] {
  const selected = new Set(selectedIds)
  return nodes.map((node) => ({
    id: node.id,
    type: 'workflow',
    position: node.position,
    data: { node },
    selected: selected.has(node.id),
    // Controlled flows must hand measured sizes back, or moved nodes lose them and flicker.
    measured: measured[node.id],
  }))
}

export function toFlowEdges(edges: WorkflowEdge[], selectedIds: string[]): Edge[] {
  const selected = new Set(selectedIds)
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source.nodeId,
    sourceHandle: edge.source.port,
    target: edge.target.nodeId,
    targetHandle: edge.target.port,
    selected: selected.has(edge.id),
  }))
}

/** Handle ids equal port names, so a Connection maps straight to port references. */
export function fromConnection(
  c: Partial<Pick<Connection, 'source' | 'sourceHandle' | 'target' | 'targetHandle'>>,
): { source: PortRef; target: PortRef } | null {
  if (!c.source || !c.sourceHandle || !c.target || !c.targetHandle) return null
  return {
    source: { nodeId: c.source, port: c.sourceHandle },
    target: { nodeId: c.target, port: c.targetHandle },
  }
}

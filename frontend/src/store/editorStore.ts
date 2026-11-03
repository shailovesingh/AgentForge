import { create } from 'zustand'
import { getLatestNodeDefinition, nodeDefinitions } from '../catalog'
import { checkConnection } from '../workflow/connections'
import { SCHEMA_VERSION } from '../workflow/types'
import type { PortRef, Position, Workflow, WorkflowEdge } from '../workflow/types'

// Editor state (D-005). The store holds the canonical Workflow document plus selection;
// React Flow is rendered from it and never owns graph state.

export interface EditorState {
  workflow: Workflow
  selectedNodeIds: string[]
  selectedEdgeIds: string[]

  /** Creates a node from the latest catalog definition and selects it. Returns its id. */
  addNode: (type: string, position: Position) => string
  updateNodeConfig: (nodeId: string, patch: Record<string, unknown>) => void
  updateNodeLabel: (nodeId: string, label: string) => void
  moveNode: (nodeId: string, position: Position) => void
  removeNodes: (nodeIds: string[]) => void
  /** Adds an edge if it passes the connection rules. Returns the new edge, or null if rejected. */
  connect: (source: PortRef, target: PortRef) => WorkflowEdge | null
  removeEdges: (edgeIds: string[]) => void
  setSelection: (nodeIds: string[], edgeIds: string[]) => void
  setWorkflowName: (name: string) => void
  loadWorkflow: (workflow: Workflow) => void
  reset: () => void
}

// ponytail: short random ids; collisions are negligible for editor-sized graphs.
const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`

export function createEmptyWorkflow(): Workflow {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('wf'),
    name: 'Untitled workflow',
    description: '',
    nodes: [],
    edges: [],
    metadata: {},
  }
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  workflow: createEmptyWorkflow(),
  selectedNodeIds: [],
  selectedEdgeIds: [],

  addNode: (type, position) => {
    const def = getLatestNodeDefinition(type)
    if (!def) throw new Error(`Unknown node type: ${type}`)
    const id = newId('n')
    set(({ workflow }) => ({
      workflow: {
        ...workflow,
        nodes: [
          ...workflow.nodes,
          {
            id,
            type: def.type,
            typeVersion: def.version,
            label: def.label,
            config: structuredClone(def.defaults),
            position,
          },
        ],
      },
      selectedNodeIds: [id],
      selectedEdgeIds: [],
    }))
    return id
  },

  updateNodeConfig: (nodeId, patch) =>
    set(({ workflow }) => ({
      workflow: {
        ...workflow,
        nodes: workflow.nodes.map((n) =>
          n.id === nodeId ? { ...n, config: { ...n.config, ...patch } } : n,
        ),
      },
    })),

  updateNodeLabel: (nodeId, label) =>
    set(({ workflow }) => ({
      workflow: {
        ...workflow,
        nodes: workflow.nodes.map((n) => (n.id === nodeId ? { ...n, label } : n)),
      },
    })),

  moveNode: (nodeId, position) =>
    set(({ workflow }) => ({
      workflow: {
        ...workflow,
        nodes: workflow.nodes.map((n) => (n.id === nodeId ? { ...n, position } : n)),
      },
    })),

  removeNodes: (nodeIds) => {
    const removed = new Set(nodeIds)
    set(({ workflow, selectedNodeIds, selectedEdgeIds }) => {
      const edges = workflow.edges.filter(
        (e) => !removed.has(e.source.nodeId) && !removed.has(e.target.nodeId),
      )
      const keptEdgeIds = new Set(edges.map((e) => e.id))
      return {
        workflow: { ...workflow, nodes: workflow.nodes.filter((n) => !removed.has(n.id)), edges },
        selectedNodeIds: selectedNodeIds.filter((id) => !removed.has(id)),
        selectedEdgeIds: selectedEdgeIds.filter((id) => keptEdgeIds.has(id)),
      }
    })
  },

  connect: (source, target) => {
    const { workflow } = get()
    // The canvas already filters live drags with the same rules; this is the last gate.
    if (checkConnection(workflow, nodeDefinitions, source, target)) return null
    const edge: WorkflowEdge = { id: newId('e'), source, target }
    set({ workflow: { ...workflow, edges: [...workflow.edges, edge] } })
    return edge
  },

  removeEdges: (edgeIds) => {
    const removed = new Set(edgeIds)
    set(({ workflow, selectedEdgeIds }) => ({
      workflow: { ...workflow, edges: workflow.edges.filter((e) => !removed.has(e.id)) },
      selectedEdgeIds: selectedEdgeIds.filter((id) => !removed.has(id)),
    }))
  },

  setSelection: (nodeIds, edgeIds) => set({ selectedNodeIds: nodeIds, selectedEdgeIds: edgeIds }),

  setWorkflowName: (name) => set(({ workflow }) => ({ workflow: { ...workflow, name } })),

  loadWorkflow: (workflow) => set({ workflow, selectedNodeIds: [], selectedEdgeIds: [] }),

  reset: () =>
    set({ workflow: createEmptyWorkflow(), selectedNodeIds: [], selectedEdgeIds: [] }),
}))

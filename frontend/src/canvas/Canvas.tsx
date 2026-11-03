import { Background, Controls, MiniMap, ReactFlow, useReactFlow } from '@xyflow/react'
import type { Connection, Edge, EdgeChange, NodeChange } from '@xyflow/react'
import { useCallback, useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import '@xyflow/react/dist/style.css'
import { getLatestNodeDefinition, nodeDefinitions } from '../catalog'
import { WorkflowNodeView } from '../nodes/WorkflowNode'
import { useEditorStore } from '../store/editorStore'
import { checkConnection } from '../workflow/connections'
import styles from './Canvas.module.css'
import { fromConnection, toFlowEdges, toFlowNodes } from './flowMapping'
import type { FlowNode, Measured } from './flowMapping'

export const NODE_DRAG_MIME = 'application/x-agentforge-node'

// Defined outside the component so React Flow gets a stable reference.
const nodeTypes = { workflow: WorkflowNodeView }
const DELETE_KEYS = ['Backspace', 'Delete']

export function Canvas() {
  const nodes = useEditorStore((s) => s.workflow.nodes)
  const edges = useEditorStore((s) => s.workflow.edges)
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds)
  const selectedEdgeIds = useEditorStore((s) => s.selectedEdgeIds)
  const { screenToFlowPosition } = useReactFlow()
  const [measured, setMeasured] = useState<Measured>({})

  const flowNodes = useMemo(
    () => toFlowNodes(nodes, selectedNodeIds, measured),
    [nodes, selectedNodeIds, measured],
  )
  const flowEdges = useMemo(() => toFlowEdges(edges, selectedEdgeIds), [edges, selectedEdgeIds])

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    const store = useEditorStore.getState()
    const selection = new Set(store.selectedNodeIds)
    let selectionChanged = false
    const removed: string[] = []
    const sizes: Measured = {}

    for (const change of changes) {
      switch (change.type) {
        case 'position':
          if (change.position) store.moveNode(change.id, change.position)
          break
        case 'select':
          selectionChanged = true
          if (change.selected) selection.add(change.id)
          else selection.delete(change.id)
          break
        case 'remove':
          removed.push(change.id)
          break
        case 'dimensions':
          if (change.dimensions) sizes[change.id] = change.dimensions
          break
      }
    }

    if (removed.length > 0) store.removeNodes(removed)
    if (selectionChanged) {
      const live = useEditorStore.getState()
      live.setSelection(
        [...selection].filter((id) => live.workflow.nodes.some((n) => n.id === id)),
        live.selectedEdgeIds,
      )
    }
    if (Object.keys(sizes).length > 0) setMeasured((prev) => ({ ...prev, ...sizes }))
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const store = useEditorStore.getState()
    const selection = new Set(store.selectedEdgeIds)
    let selectionChanged = false
    const removed: string[] = []

    for (const change of changes) {
      if (change.type === 'select') {
        selectionChanged = true
        if (change.selected) selection.add(change.id)
        else selection.delete(change.id)
      } else if (change.type === 'remove') {
        removed.push(change.id)
      }
    }

    if (removed.length > 0) store.removeEdges(removed)
    if (selectionChanged) {
      const live = useEditorStore.getState()
      live.setSelection(
        live.selectedNodeIds,
        [...selection].filter((id) => live.workflow.edges.some((e) => e.id === id)),
      )
    }
  }, [])

  const isValidConnection = useCallback((c: Connection | Edge) => {
    const ports = fromConnection(c)
    if (!ports) return false
    const { workflow } = useEditorStore.getState()
    return checkConnection(workflow, nodeDefinitions, ports.source, ports.target) === null
  }, [])

  const onConnect = useCallback((c: Connection) => {
    const ports = fromConnection(c)
    if (ports) useEditorStore.getState().connect(ports.source, ports.target)
  }, [])

  const onDragOver = useCallback((e: DragEvent) => {
    if (!e.dataTransfer.types.includes(NODE_DRAG_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e: DragEvent) => {
      const type = e.dataTransfer.getData(NODE_DRAG_MIME)
      // Drag data is untrusted: only create nodes for types that exist in the catalog.
      if (!type || !getLatestNodeDefinition(type)) return
      e.preventDefault()
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      useEditorStore.getState().addNode(type, position)
    },
    [screenToFlowPosition],
  )

  return (
    <div className={styles.canvas}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onDragOver={onDragOver}
        onDrop={onDrop}
        deleteKeyCode={DELETE_KEYS}
        colorMode="system"
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  )
}

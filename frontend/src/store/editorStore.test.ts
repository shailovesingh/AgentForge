import { beforeEach, describe, expect, test } from 'vitest'
import { createEmptyWorkflow, useEditorStore } from './editorStore'

const store = () => useEditorStore.getState()
const wf = () => store().workflow

beforeEach(() => store().reset())

describe('editor store', () => {
  test('addNode uses catalog defaults, copies them, and selects the node', () => {
    const id = store().addNode('llm.prompt', { x: 10, y: 20 })
    const node = wf().nodes[0]
    expect(node).toMatchObject({
      id,
      type: 'llm.prompt',
      typeVersion: 1,
      label: 'LLM Prompt',
      position: { x: 10, y: 20 },
    })
    expect(node.config).toMatchObject({ provider: 'ollama', temperature: 0.7 })
    expect(store().selectedNodeIds).toEqual([id])

    // Mutating one node's config must not leak into the catalog defaults.
    store().updateNodeConfig(id, { prompt: 'hi' })
    const id2 = store().addNode('llm.prompt', { x: 0, y: 0 })
    expect(wf().nodes.find((n) => n.id === id2)!.config.prompt).toBe('')
  })

  test('addNode rejects unknown types', () => {
    expect(() => store().addNode('nope', { x: 0, y: 0 })).toThrow('Unknown node type')
  })

  test('updateNodeConfig merges, updateNodeLabel and moveNode only touch their node', () => {
    const a = store().addNode('http.request', { x: 0, y: 0 })
    const b = store().addNode('output.result', { x: 0, y: 0 })
    store().updateNodeConfig(a, { url: 'https://example.com' })
    store().updateNodeLabel(a, 'Fetch')
    store().moveNode(a, { x: 5, y: 6 })
    const [na, nb] = wf().nodes
    expect(na).toMatchObject({ id: a, label: 'Fetch', position: { x: 5, y: 6 } })
    expect(na.config).toMatchObject({ method: 'GET', url: 'https://example.com' })
    expect(nb).toMatchObject({ id: b, label: 'Output', position: { x: 0, y: 0 } })
  })

  test('connect adds valid edges and rejects ones that break the connection rules', () => {
    const a = store().addNode('trigger.manual', { x: 0, y: 0 })
    const b = store().addNode('output.result', { x: 0, y: 0 })
    const src = { nodeId: a, port: 'data' }
    const dst = { nodeId: b, port: 'input' }
    expect(store().connect(src, dst)).not.toBeNull()
    expect(store().connect(src, dst)).toBeNull() // duplicate
    expect(store().connect(src, { nodeId: a, port: 'nope' })).toBeNull() // unknown port
    expect(wf().edges).toHaveLength(1)
  })

  test('removeNodes also removes attached edges and clears their selection', () => {
    const a = store().addNode('trigger.manual', { x: 0, y: 0 })
    const b = store().addNode('llm.prompt', { x: 0, y: 0 })
    const c = store().addNode('output.result', { x: 0, y: 0 })
    const e1 = store().connect({ nodeId: a, port: 'data' }, { nodeId: b, port: 'input' })!
    store().connect({ nodeId: b, port: 'text' }, { nodeId: c, port: 'input' })
    store().setSelection([b], [e1.id])

    store().removeNodes([b])

    expect(wf().nodes.map((n) => n.id)).toEqual([a, c])
    expect(wf().edges).toEqual([])
    expect(store().selectedNodeIds).toEqual([])
    expect(store().selectedEdgeIds).toEqual([])
  })

  test('removeEdges removes only the given edges', () => {
    const a = store().addNode('trigger.manual', { x: 0, y: 0 })
    const b = store().addNode('output.result', { x: 0, y: 0 })
    const e = store().connect({ nodeId: a, port: 'data' }, { nodeId: b, port: 'input' })!
    store().removeEdges([e.id])
    expect(wf().edges).toEqual([])
    expect(wf().nodes).toHaveLength(2)
  })

  test('loadWorkflow replaces the document and clears selection; reset starts fresh', () => {
    store().addNode('trigger.manual', { x: 0, y: 0 })
    const loaded = { ...createEmptyWorkflow(), id: 'wf_loaded', name: 'Loaded' }
    store().loadWorkflow(loaded)
    expect(wf()).toBe(loaded)
    expect(store().selectedNodeIds).toEqual([])

    store().reset()
    expect(wf().id).not.toBe('wf_loaded')
    expect(wf().nodes).toEqual([])
  })

  test('setWorkflowName', () => {
    store().setWorkflowName('My flow')
    expect(wf().name).toBe('My flow')
  })
})

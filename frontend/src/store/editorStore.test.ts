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

  test('applyDefaults is called by production code in exactly one place: addNode', () => {
    // Source-text check over every non-test source file (eager ?raw glob, so no Node APIs are needed).
    const sources = import.meta.glob<string>('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
    const call = /\bapplyDefaults\s*\(/
    const callers = Object.entries(sources)
      .filter(([file]) => !/\.test\.tsx?$/.test(file) && !file.endsWith('/src/workflow/jsonSchema.ts'))
      .flatMap(([file, text]) => (call.test(text) ? [file] : []))
    expect(callers).toEqual(['/src/store/editorStore.ts'])
    expect(sources['/src/store/editorStore.ts'].match(new RegExp(call, 'g'))).toHaveLength(1)
  })

  test('codeExemptions is imported by tests only, never by production code', () => {
    // Matches a module specifier ending in codeExemptions (static import, re-export or dynamic import()).
    const specifier = /['"][^'"\n]*\/codeExemptions(\.ts)?['"]/
    // Self-test of the regex: it must catch the real forms and ignore unrelated text.
    expect(specifier.test(`import { X } from './codeExemptions'`)).toBe(true)
    expect(specifier.test(`export * from "../workflow/codeExemptions.ts"`)).toBe(true)
    expect(specifier.test(`const m = await import('./codeExemptions')`)).toBe(true)
    expect(specifier.test(`import { X } from './codeExemptionsOther'`)).toBe(false)
    expect(specifier.test(`// see codeExemptions.ts for the lists`)).toBe(false)

    const sources = import.meta.glob<string>('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
    const isTest = (file: string) => /\.test\.tsx?$/.test(file)
    const importers = Object.entries(sources)
      .filter(([file]) => !file.endsWith('/src/workflow/codeExemptions.ts') && specifier.test(sources[file]))
      .map(([file]) => file)
    // Tests do import it (the guard is not vacuous), and nothing else does.
    expect(importers.some(isTest)).toBe(true)
    expect(importers.filter((file) => !isTest(file))).toEqual([])
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

  test('upgrades: stored by loadWorkflow, dismissed, cleared by reset and replaced by any later load', () => {
    const report = { nodeId: 'a', type: 'agent.autonomous', from: 1, to: 2, notes: ['n'] }
    expect(store().upgrades).toEqual([])
    store().loadWorkflow(createEmptyWorkflow(), [report])
    expect(store().upgrades).toEqual([report])
    store().dismissUpgrades()
    expect(store().upgrades).toEqual([])

    store().loadWorkflow(createEmptyWorkflow(), [report])
    store().reset()
    expect(store().upgrades).toEqual([])

    store().loadWorkflow(createEmptyWorkflow(), [report])
    store().loadWorkflow(createEmptyWorkflow()) // a later load without upgrades clears the banner
    expect(store().upgrades).toEqual([])
    store().loadWorkflow(createEmptyWorkflow(), [report])
    store().loadWorkflow(createEmptyWorkflow(), [{ ...report, nodeId: 'b' }])
    expect(store().upgrades.map((u) => u.nodeId)).toEqual(['b'])
  })

  test('setWorkflowName', () => {
    store().setWorkflowName('My flow')
    expect(wf().name).toBe('My flow')
  })
})

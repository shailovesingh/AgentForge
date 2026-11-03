import { describe, expect, test } from 'vitest'
import { nodeDefinitions } from '../catalog'
import { checkConnection } from './connections'
import type { Workflow, WorkflowEdge } from './types'

const node = (id: string, type: string) => ({
  id,
  type,
  typeVersion: 1,
  label: id,
  config: {},
  position: { x: 0, y: 0 },
})
const edge = (id: string, from: [string, string], to: [string, string]): WorkflowEdge => ({
  id,
  source: { nodeId: from[0], port: from[1] },
  target: { nodeId: to[0], port: to[1] },
})

// trigger.data -> llm1.input ; llm1.text -> out.input ; plus an unconnected llm2, http, agent, cond
const workflow: Workflow = {
  schemaVersion: '1.0',
  id: 'wf',
  name: 't',
  description: '',
  nodes: [
    node('trigger', 'trigger.manual'),
    node('llm1', 'llm.prompt'),
    node('llm2', 'llm.prompt'),
    node('out', 'output.result'),
    node('http', 'http.request'),
    node('agent', 'agent.autonomous'),
    node('cond', 'logic.condition'),
  ],
  edges: [edge('e1', ['trigger', 'data'], ['llm1', 'input']), edge('e2', ['llm1', 'text'], ['out', 'input'])],
  metadata: {},
}

const check = (from: [string, string], to: [string, string], wf = workflow) =>
  checkConnection(wf, nodeDefinitions, { nodeId: from[0], port: from[1] }, { nodeId: to[0], port: to[1] })

describe('checkConnection', () => {
  test('allows a valid connection', () => {
    expect(check(['llm2', 'text'], ['http', 'input'])).toBeNull()
  })

  test('unknown node', () => {
    expect(check(['ghost', 'text'], ['out', 'input'])).toBe('unknown-node')
    expect(check(['llm2', 'text'], ['ghost', 'input'])).toBe('unknown-node')
  })

  test('unknown port, including wrong direction', () => {
    expect(check(['llm2', 'nope'], ['out', 'input'])).toBe('unknown-port')
    // `input` is an input port, not an output.
    expect(check(['llm2', 'input'], ['http', 'input'])).toBe('unknown-port')
  })

  test('self-loop', () => {
    expect(check(['llm1', 'text'], ['llm1', 'input'])).toBe('self-loop')
  })

  test('duplicate', () => {
    expect(check(['trigger', 'data'], ['llm1', 'input'])).toBe('duplicate')
  })

  test('input already connected (single-connection input)', () => {
    expect(check(['trigger', 'data'], ['out', 'input'])).toBe('input-occupied')
  })

  test('multiple-connection inputs accept more than one edge', () => {
    // agent.tools is `multiple`. Nothing outputs `tool` yet, so use `any` outputs from cond.
    const wf: Workflow = {
      ...workflow,
      edges: [...workflow.edges, edge('e3', ['cond', 'true'], ['agent', 'tools'])],
    }
    expect(check(['cond', 'false'], ['agent', 'tools'], wf)).toBeNull()
  })

  test('type mismatch, with `any` compatible with everything', () => {
    // http.status (number) -> agent.input (text)
    expect(check(['http', 'status'], ['agent', 'input'])).toBe('type-mismatch')
    // http.status (number) -> cond.input (any)
    expect(check(['http', 'status'], ['cond', 'input'])).toBeNull()
    // cond.true (any) -> agent.input (text)
    expect(check(['cond', 'true'], ['agent', 'input'])).toBeNull()
  })

  test('cycle: direct and transitive', () => {
    // llm1 -> out exists; out has no outputs, so build a chain llm1 -> http -> llm2 first.
    const chain: Workflow = {
      ...workflow,
      edges: [
        edge('a', ['llm1', 'text'], ['http', 'input']),
        edge('b', ['http', 'body'], ['llm2', 'input']),
      ],
    }
    // llm2 -> llm1 would close llm1 -> http -> llm2 -> llm1
    expect(check(['llm2', 'text'], ['llm1', 'input'], chain)).toBe('cycle')
    // llm2 -> cond is fine (nothing leads back)
    expect(check(['llm2', 'text'], ['cond', 'input'], chain)).toBeNull()
  })
})

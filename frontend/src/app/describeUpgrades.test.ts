import { describe, expect, test } from 'vitest'
import { describeUpgrades } from './describeUpgrades'

const up = (nodeId: string, type = 'agent.autonomous', from = 1, to = 2) => ({ nodeId, type, from, to, notes: [] })

describe('describeUpgrades', () => {
  test('one node', () => {
    expect(describeUpgrades([up('a')])).toBe('Upgraded 1 node (Agent v1 to v2). Review the changes. Your original file was not modified.')
  })

  test('several nodes of one kind: plural, the kind listed once', () => {
    expect(describeUpgrades([up('a'), up('b')])).toBe('Upgraded 2 nodes (Agent v1 to v2). Review the changes. Your original file was not modified.')
  })

  test('several kinds are each listed; a type missing from the catalog falls back to its type name', () => {
    expect(describeUpgrades([up('a'), up('b', 'llm.prompt', 1, 3), up('c', 'x.gone', 2, 4)])).toBe(
      'Upgraded 3 nodes (Agent v1 to v2, LLM Prompt v1 to v3, x.gone v2 to v4). Review the changes. Your original file was not modified.',
    )
  })
})

import { expect, test } from 'vitest'
import { nodeDefinitions } from '../catalog'
import { matchesQuery } from './search'

const matching = (q: string) => nodeDefinitions.filter((d) => matchesQuery(d, q)).map((d) => d.type)

test('blank query matches every node', () => {
  expect(matching('  ')).toHaveLength(nodeDefinitions.length)
})

test('matches label, case-insensitively', () => {
  expect(matching('HTTP')).toContain('http.request')
})

test('matches description text', () => {
  expect(matching('language model')).toEqual(['llm.prompt'])
})

test('no match returns nothing', () => {
  expect(matching('zzzz')).toEqual([])
})

import { describe, expect, test } from 'vitest'
import { nodeDefinitions } from '../catalog'
import type { ObjectSchema } from '../workflow/jsonSchema'
import { propertyOrder } from './propertyOrder'

const schema = (...names: string[]): ObjectSchema => ({
  type: 'object',
  properties: Object.fromEntries(names.map((n) => [n, { type: 'string' as const }])),
})

describe('propertyOrder', () => {
  test('no ui: schema order', () => {
    expect(propertyOrder({ configSchema: schema('a', 'b', 'c') })).toEqual(['a', 'b', 'c'])
  })

  test('ui.order first, then the remaining properties in schema order', () => {
    expect(propertyOrder({ configSchema: schema('a', 'b', 'c', 'd'), ui: { order: ['c', 'a'] } })).toEqual(['c', 'a', 'b', 'd'])
  })

  test('an unknown name in ui.order is ignored', () => {
    expect(propertyOrder({ configSchema: schema('a', 'b'), ui: { order: ['ghost', 'b'] } })).toEqual(['b', 'a'])
  })

  test('a name listed twice appears once', () => {
    expect(propertyOrder({ configSchema: schema('a', 'b', 'c'), ui: { order: ['b', 'b', 'a'] } })).toEqual(['b', 'a', 'c'])
  })

  test('a schema without properties has no fields', () => {
    expect(propertyOrder({ configSchema: { type: 'object' } })).toEqual([])
  })

  test('every catalog node lists each of its properties exactly once', () => {
    for (const def of nodeDefinitions) {
      expect([...propertyOrder(def)].sort(), def.type).toEqual(Object.keys(def.configSchema.properties ?? {}).sort())
    }
  })
})

import { describe, expect, test } from 'vitest'
import type { WorkflowNode } from '../workflow/types'
import { toFlowNodes } from './flowMapping'
import type { Measured } from './flowMapping'

const node = (id: string): WorkflowNode => ({
  id,
  type: 'trigger.manual',
  typeVersion: 1,
  label: id,
  config: {},
  position: { x: 0, y: 0 },
})

const size = { width: 120, height: 40 }
// Ids are untrusted (they come from imported files); these names exist on Object.prototype.
const hostileIds = ['constructor', '__proto__', 'toString', 'hasOwnProperty']

describe('toFlowNodes measured sizes', () => {
  test('a normal id receives its measured size, an unmeasured one does not', () => {
    const flow = toFlowNodes([node('a'), node('b')], [], new Map([['a', size]]))
    expect(flow[0].measured).toEqual(size)
    expect(flow[1].measured).toBeUndefined()
  })

  test('ids that match Object.prototype members are not measured when the map is empty', () => {
    const flow = toFlowNodes([...hostileIds, 'normal'].map(node), [], new Map() as Measured)
    expect(flow.map((n) => n.measured)).toEqual([undefined, undefined, undefined, undefined, undefined])
  })

  test('only the node that has a size gets one', () => {
    const flow = toFlowNodes([...hostileIds, 'normal'].map(node), [], new Map([['constructor', size]]))
    expect(flow.map((n) => n.id)).toEqual([...hostileIds, 'normal'])
    expect(flow.map((n) => n.measured)).toEqual([size, undefined, undefined, undefined, undefined])
  })
})

import { expect, test } from 'vitest'
import { nodeDefinitions } from '../catalog'
import { getIcon, icons } from './icons'

test('every catalog node has a registered icon', () => {
  for (const def of nodeDefinitions) {
    expect(icons[def.icon], `${def.type} uses unregistered icon "${def.icon}"`).toBeDefined()
  }
})

test('unknown icon names fall back instead of crashing', () => {
  expect(getIcon('DoesNotExist')).toBeDefined()
})

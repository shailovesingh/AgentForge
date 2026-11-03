import type { NodeDefinition } from '../workflow/types'
import { nodeDefinitions } from './nodes'

export { nodeDefinitions }

/** Looks up a catalog definition by exact type and version. */
export function getNodeDefinition(type: string, version: number): NodeDefinition | undefined {
  return nodeDefinitions.find((d) => d.type === type && d.version === version)
}

/** Latest catalog definition for a type, used when creating new nodes. */
export function getLatestNodeDefinition(type: string): NodeDefinition | undefined {
  return nodeDefinitions
    .filter((d) => d.type === type)
    .sort((a, b) => b.version - a.version)[0]
}

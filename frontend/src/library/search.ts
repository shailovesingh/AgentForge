import type { NodeDefinition } from '../workflow/types'

/** Case-insensitive match on a node's label or description. A blank query matches everything. */
export function matchesQuery(def: NodeDefinition, query: string): boolean {
  const q = query.trim().toLowerCase()
  return q === '' || `${def.label} ${def.description}`.toLowerCase().includes(q)
}

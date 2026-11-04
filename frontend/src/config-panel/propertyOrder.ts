import type { NodeDefinition } from '../workflow/types'

/** Property names in display order: `ui.order` first (existing names only, each once), then every other property in schema order. */
export function propertyOrder(def: Pick<NodeDefinition, 'configSchema' | 'ui'>): string[] {
  const keys = Object.keys(def.configSchema.properties ?? {})
  const ordered = (def.ui?.order ?? []).filter((key) => keys.includes(key))
  return [...new Set([...ordered, ...keys])]
}

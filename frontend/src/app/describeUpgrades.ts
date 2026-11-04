import { getLatestNodeDefinition } from '../catalog'
import type { UpgradeReport } from '../workflow/nodeMigrations'

/** "Upgraded 2 nodes (Agent v1 to v2). Review the changes. Your original file was not modified." */
export function describeUpgrades(upgrades: UpgradeReport[]): string {
  const kinds: string[] = []
  for (const u of upgrades) {
    const kind = `${getLatestNodeDefinition(u.type)?.label ?? u.type} v${u.from} to v${u.to}`
    if (!kinds.includes(kind)) kinds.push(kind)
  }
  const count = upgrades.length
  return `Upgraded ${count} ${count === 1 ? 'node' : 'nodes'} (${kinds.join(', ')}). Review the changes. Your original file was not modified.`
}

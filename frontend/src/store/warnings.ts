import { nodeDefinitions } from '../catalog'
import { lintWorkflow } from '../workflow/lint'
import type { Warning } from '../workflow/lint'
import type { Workflow } from '../workflow/types'

// Editor warnings as derived data (D-017, D-018). Pure, no React: never stored in the document, never blocking.

/** The warnings grouped by node id. A Map, because node ids come from imported files ("constructor", "__proto__"). */
export function groupByNode(warnings: Warning[]): Map<string, Warning[]> {
  const byNode = new Map<string, Warning[]>()
  for (const w of warnings) {
    const list = byNode.get(w.nodeId)
    if (list) list.push(w)
    else byNode.set(w.nodeId, [w])
  }
  return byNode
}

/** "1 warning", "2 warnings" (also "0 warnings"). */
export const warningCountText = (n: number): string => `${n} warning${n === 1 ? '' : 's'}`

export interface WarningsView {
  warnings: Warning[]
  byNode: Map<string, Warning[]>
}

// One lint per workflow object: N node components share the result. The store replaces the workflow object on every edit,
// so a new object means a recompute and the cache entry is collected together with the old object.
const cache = new WeakMap<Workflow, WarningsView>()

export function getWarnings(workflow: Workflow): WarningsView {
  let view = cache.get(workflow)
  if (!view) {
    const warnings = lintWorkflow(workflow, nodeDefinitions)
    view = { warnings, byNode: groupByNode(warnings) }
    cache.set(workflow, view)
  }
  return view
}

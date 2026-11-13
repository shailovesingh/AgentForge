import { nodeDefinitions } from '../catalog'
import { lintWorkflow } from '../workflow/lint'
import type { Warning } from '../workflow/lint'
import type { Workflow } from '../workflow/types'

// Editor warnings as derived data (D-017, D-018). Pure, no React: never stored in the document, never blocking.
// This is the ONLY module outside src/workflow that calls lintWorkflow (guarded in warnings.test.ts).

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

/** One shared, frozen array for "this node has no warnings", so a selector returns the same reference every time. */
export const NO_WARNINGS: readonly Warning[] = Object.freeze([])

/** A stable React key per warning: `${nodeId}:${code}:${port or field}`, with a counter if two warnings would collide. */
export function warningKeys(warnings: readonly Warning[]): string[] {
  const seen = new Map<string, number>()
  return warnings.map((w) => {
    const base = `${w.nodeId}:${w.code}:${w.port ?? w.field ?? ''}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return n === 0 ? base : `${base}#${n}`
  })
}

export interface WarningsView {
  warnings: readonly Warning[]
  byNode: ReadonlyMap<string, readonly Warning[]>
}

const sameWarning = (a: Warning, b: Warning): boolean =>
  a.code === b.code && a.nodeId === b.nodeId && a.port === b.port && a.field === b.field && a.message === b.message

const sameList = (a: readonly Warning[], b: readonly Warning[]): boolean =>
  a.length === b.length && a.every((w, i) => sameWarning(w, b[i]))

// One lint per workflow object: every caller shares the result. The store replaces the workflow object on every edit
// (a drag frame, a keystroke in the name), so the WeakMap alone would give a new result each time and re-render everything.
const cache = new WeakMap<Workflow, WarningsView>()
// ponytail: ONE previous result, so an edit that leaves the warnings unchanged keeps the same references (no re-render).
let previous: WarningsView | undefined

function toView(warnings: Warning[]): WarningsView {
  const before = previous
  if (before && sameList(before.warnings, warnings)) return before
  const byNode = groupByNode(warnings)
  if (before) {
    // A node whose own warnings did not change keeps its array, even when other nodes' warnings did.
    for (const [id, list] of byNode) {
      const old = before.byNode.get(id)
      if (old && sameList(old, list)) byNode.set(id, old as Warning[])
    }
  }
  return { warnings, byNode }
}

export function getWarnings(workflow: Workflow): WarningsView {
  let view = cache.get(workflow)
  if (!view) {
    view = toView(lintWorkflow(workflow, nodeDefinitions))
    cache.set(workflow, view)
    previous = view
  }
  return view
}

/** The warnings of one node (the shared empty array when there are none, or the id is null or unknown). */
export function getNodeWarnings(workflow: Workflow, nodeId: string | null): readonly Warning[] {
  return (nodeId === null ? undefined : getWarnings(workflow).byNode.get(nodeId)) ?? NO_WARNINGS
}

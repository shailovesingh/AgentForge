import { safeDisplayName, scanSecrets } from '../workflow/secrets'
import type { Workflow } from '../workflow/types'

// The secret report: the ONLY view of the secret scan that the UI may render (T9b, contracts/SECRETS.md, D-023).
// Pure, no React. It holds node NAMES (through safeDisplayName, never a raw label or id), display PATHS and counts: never a
// value, never a piece or hash of one, never a credential-shaped key (a path redacts those). The dialog takes this object
// and nothing else, so it cannot reach a Workflow.

export interface SecretReportNode {
  /** `safeDisplayName(label || id)`. */
  name: string
  /** Display paths of the HIGH findings, each once, in walk order. */
  paths: string[]
  /** Findings of this node that were found but not kept (the cap of 50); an upper bound, medium ones included. */
  omitted: number
}

export interface SecretReport {
  hasHigh: boolean
  hasMedium: boolean
  high: {
    nodes: SecretReportNode[]
    metadata: { paths: string[]; omitted: number }
  }
  /** Kept findings by confidence (a header named Authorization that holds a Bearer token is two findings). */
  counts: { high: number; medium: number }
}

export function buildSecretReport(workflow: Workflow): SecretReport {
  const { findings, omitted } = scanSecrets(workflow)
  let nodeById: Map<string, { label: string }> | undefined // built only when a high config finding needs a name
  const byId = new Map<string, { node: SecretReportNode; seen: Set<string> }>()
  const metadata = { paths: [] as string[], omitted: omitted.metadata }
  const seenMetadata = new Set<string>()
  const counts = { high: 0, medium: 0 }

  for (const f of findings) {
    if (f.confidence === 'medium') {
      counts.medium++
      continue
    }
    counts.high++
    if (f.location === 'metadata') {
      if (!seenMetadata.has(f.path)) {
        seenMetadata.add(f.path)
        metadata.paths.push(f.path)
      }
      continue
    }
    const id = f.nodeId as string // set for every config finding
    let entry = byId.get(id)
    if (!entry) {
      if (!nodeById) {
        nodeById = new Map()
        for (const n of workflow.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n)
      }
      const label = nodeById.get(id)?.label
      const text = typeof label === 'string' && label !== '' ? label : id
      entry = { node: { name: safeDisplayName(text), paths: [], omitted: omitted.perNode.get(id) ?? 0 }, seen: new Set() }
      byId.set(id, entry)
    }
    if (!entry.seen.has(f.path)) {
      entry.seen.add(f.path)
      entry.node.paths.push(f.path)
    }
  }

  const nodes = [...byId.values()].map((e) => e.node)
  return {
    hasHigh: counts.high > 0,
    hasMedium: counts.medium > 0,
    high: { nodes, metadata },
    counts,
  }
}

// One report per workflow object, and the previous report is reused when nothing the report depends on changed, so a drag
// frame (new workflow object, same configs) or a name edit does not give subscribers a new object (T7b performance lesson).
const cache = new WeakMap<Workflow, SecretReport>()
// ponytail: ONE previous result; the inputs are what the scan reads plus the names it shows (metadata, and each node's id, label, config).
let previous: { inputs: readonly unknown[]; report: SecretReport } | undefined

const inputsOf = (w: Workflow): unknown[] => [w.metadata, ...w.nodes.flatMap((n) => [n.id, n.label, n.config])]
const sameInputs = (a: readonly unknown[], b: readonly unknown[]): boolean => a.length === b.length && a.every((x, i) => x === b[i])

export function getSecretReport(workflow: Workflow): SecretReport {
  let report = cache.get(workflow)
  if (report) return report
  const inputs = inputsOf(workflow)
  if (previous && sameInputs(previous.inputs, inputs)) {
    report = previous.report
  } else {
    report = buildSecretReport(workflow)
    // An edit that changes the scan's inputs but not its result keeps the same object (structural equality, the report is small).
    if (previous && JSON.stringify(previous.report) === JSON.stringify(report)) report = previous.report
  }
  previous = { inputs, report }
  cache.set(workflow, report)
  return report
}

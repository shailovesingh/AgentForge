import { safeDisplayName, scanSecrets } from '../workflow/secrets'
import type { Workflow } from '../workflow/types'

// The secret report: the ONLY view of the secret scan that the UI may render (T9b, contracts/SECRETS.md, D-023).
// Pure, no React. It holds node NAMES (through safeDisplayName, never a raw label or id), display PATHS and counts: never a
// value, never a piece or hash of one, never a credential-shaped key (a path redacts those). The dialog takes this object
// and nothing else, so it cannot reach a Workflow.

/** At most this many nodes are listed in the report (and so in the dialog); the rest are counted in `omittedNodes`. */
export const MAX_REPORT_NODES = 50

export interface SecretReportNode {
  /** `safeDisplayName(label, else id)`, the same fallback as the lint messages. */
  name: string
  /** Display paths of the HIGH findings kept by the scan, each once, in walk order. */
  paths: string[]
  /** HIGH findings of this node that were found but not kept (the cap of 50 per confidence); an upper bound. */
  omitted: number
}

export interface SecretReport {
  /** True when there is any high finding, kept or omitted, in a node config or in the metadata. */
  hasHigh: boolean
  hasMedium: boolean
  high: {
    /** At most MAX_REPORT_NODES nodes, in node array order. */
    nodes: SecretReportNode[]
    /** Nodes with high findings that are not in `nodes` (past MAX_REPORT_NODES). */
    omittedNodes: number
    metadata: { paths: string[]; omitted: number }
  }
  /** Findings by confidence, KEPT AND OMITTED (a header named Authorization that holds a token is two findings). */
  counts: { high: number; medium: number }
}

export function buildSecretReport(workflow: Workflow): SecretReport {
  const { findings, omitted } = scanSecrets(workflow)
  let nodeById: Map<string, { label: string }> | undefined // built only when a high config finding needs a name
  const byId = new Map<string, { node: SecretReportNode; seen: Set<string> }>() // the listed nodes, in first-seen order
  const beyond = new Set<string>() // ids of nodes with a high finding that are past MAX_REPORT_NODES
  const metadata = { paths: [] as string[], omitted: omitted.metadata.high }
  const seenMetadata = new Set<string>()
  const counts = { high: omitted.metadata.high, medium: omitted.metadata.medium }
  for (const o of omitted.perNode.values()) {
    counts.high += o.high
    counts.medium += o.medium
  }

  const nameOf = (id: string): string => {
    if (!nodeById) {
      nodeById = new Map()
      for (const n of workflow.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n)
    }
    const label = nodeById.get(id)?.label
    return safeDisplayName(typeof label === 'string' && label.trim() !== '' ? label : id) // the same fallback as lint
  }
  const entryOf = (id: string) => {
    let entry = byId.get(id)
    if (!entry && byId.size < MAX_REPORT_NODES) {
      entry = { node: { name: nameOf(id), paths: [], omitted: omitted.perNode.get(id)?.high ?? 0 }, seen: new Set() }
      byId.set(id, entry)
    }
    if (!entry) beyond.add(id)
    return entry
  }

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
    const entry = entryOf(f.nodeId as string) // nodeId is set for every config finding
    if (entry && !entry.seen.has(f.path)) {
      entry.seen.add(f.path)
      entry.node.paths.push(f.path)
    }
  }
  // Defensive: a node whose high findings were ALL omitted is still listed (with no paths). The scanner keeps the first 50
  // highs of every node, so this cannot happen today; it keeps hasHigh exact if the caps ever change.
  for (const [id, o] of omitted.perNode) if (o.high > 0) entryOf(id)

  return {
    hasHigh: counts.high > 0,
    hasMedium: counts.medium > 0,
    high: { nodes: [...byId.values()].map((e) => e.node), omittedNodes: beyond.size, metadata },
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

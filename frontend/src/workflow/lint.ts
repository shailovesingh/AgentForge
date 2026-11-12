import { detectNodeSecrets } from './secrets'
import type { NodeDefinition, PortDefinition, Workflow } from './types'

// Editor warnings (decisions D-017, D-018; contracts/WARNINGS.md). Pure and total: derived from a workflow
// and a catalog, never stored in the document, never blocking. `validateWorkflow` stays errors-only.
// Everything keyed by an untrusted id, type, port or config key goes through a Map or Object.hasOwn.
// Total for JSON-shaped input (own data properties): getters and proxies on the workflow are out of scope.

export const WARNING_CODES = [
  'required-input-unconnected',
  'required-field-empty',
  'trigger-not-connected',
  'node-unreachable',
  'result-unused',
  'secret-likely',
  'secret-suspected',
] as const

export type WarningCode = (typeof WARNING_CODES)[number]

export interface Warning {
  code: WarningCode
  severity: 'warning'
  nodeId: string
  /** The input port, for `required-input-unconnected`. */
  port?: string
  /** The config property for `required-field-empty`; the display path inside the config for `secret-likely` and `secret-suspected`. */
  field?: string
  /** Human text. It names the node label (or id) and the port or field, and never a config or metadata value. */
  message: string
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

function portsOf(def: NodeDefinition, direction: 'inputs' | 'outputs'): PortDefinition[] {
  return list(def[direction]).filter((p): p is PortDefinition => isRecord(p) && typeof p.name === 'string')
}

const portText = (p: PortDefinition): string => (typeof p.label === 'string' && p.label !== '' ? p.label : p.name)

/** The config properties a node must have, in catalog order. */
function requiredFields(def: NodeDefinition): string[] {
  const schema: unknown = def.configSchema
  return isRecord(schema) ? list(schema.required).filter((f): f is string => typeof f === 'string') : []
}

/** Absent, a blank string (JavaScript trim, see contracts/WARNINGS.md) or an empty array. 0, false, null and {} are values. */
function isEmptyValue(value: unknown): boolean {
  if (value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  return Array.isArray(value) && value.length === 0
}

interface Item {
  id: string
  /** What messages call the node: its label, else its id. */
  name: string
  /** Undefined for an unknown type or version: such a node only counts for reachability. */
  def?: NodeDefinition
  config: Record<string, unknown>
}

const add = (m: Map<string, Set<string>>, key: string, value: string) => {
  const set = m.get(key)
  if (set) set.add(value)
  else m.set(key, new Set([value]))
}

/**
 * The editor warnings for `workflow`, in a fixed order: node array order, then the rule order of
 * contracts/WARNINGS.md, then port or field in catalog order. It never throws for any JSON-shaped value (own data
 * properties only; getters and proxies are out of scope and are not guarded against).
 *
 * Facts about a node (its connections, its reachability) are keyed by the node id STRING. With duplicate ids, every node
 * with that id therefore shares the first node's connections and reachability. Validation rejects duplicate ids before an
 * import, so this cannot happen in the app; it is only defined so that the function stays deterministic.
 */
export function lintWorkflow(workflow: Workflow, catalog: NodeDefinition[]): Warning[] {
  const doc: unknown = workflow
  const rawNodes = isRecord(doc) ? list(doc.nodes) : []
  const rawEdges = isRecord(doc) ? list(doc.edges) : []

  const byType = new Map<string, NodeDefinition[]>()
  for (const d of list(catalog)) {
    if (!isRecord(d) || typeof d.type !== 'string') continue
    const same = byType.get(d.type)
    if (same) same.push(d as unknown as NodeDefinition)
    else byType.set(d.type, [d as unknown as NodeDefinition])
  }

  const items: Item[] = []
  const firstById = new Map<string, Item>() // with a duplicate id, the first node's definition decides which ports an edge may use
  for (const n of rawNodes) {
    if (!isRecord(n) || typeof n.id !== 'string') continue
    const def =
      typeof n.type === 'string' && typeof n.typeVersion === 'number'
        ? byType.get(n.type)?.find((d) => d.version === n.typeVersion) // exact (type, version), like connections.ts
        : undefined
    const item: Item = {
      id: n.id,
      name: typeof n.label === 'string' && n.label.trim() !== '' ? n.label : n.id,
      def,
      config: isRecord(n.config) ? n.config : {},
    }
    items.push(item)
    if (!firstById.has(item.id)) firstById.set(item.id, item)
  }

  // The edge table. An edge to or from a missing node, or (when the node is known) a missing port, is ignored.
  const incoming = new Map<string, Set<string>>() // node id -> input ports that have an incoming edge
  const outgoing = new Map<string, Set<string>>() // node id -> output ports that have an outgoing edge
  const next = new Map<string, string[]>() // node id -> target node ids
  for (const e of rawEdges) {
    if (!isRecord(e) || !isRecord(e.source) || !isRecord(e.target)) continue
    const { nodeId: from, port: out } = e.source
    const { nodeId: to, port: inp } = e.target
    if (typeof from !== 'string' || typeof out !== 'string' || typeof to !== 'string' || typeof inp !== 'string') continue
    const a = firstById.get(from)
    const b = firstById.get(to)
    if (!a || !b) continue
    if (a.def && !portsOf(a.def, 'outputs').some((p) => p.name === out)) continue
    if (b.def && !portsOf(b.def, 'inputs').some((p) => p.name === inp)) continue
    add(outgoing, from, out)
    add(incoming, to, inp)
    const targets = next.get(from)
    if (targets) targets.push(to)
    else next.set(from, [to])
  }

  // Reachability from every Trigger, only when the graph has one.
  const isTrigger = (i: Item) => i.def?.category === 'Triggers'
  const reached = new Set<string>()
  const queue: string[] = []
  for (const i of items) {
    if (isTrigger(i) && !reached.has(i.id)) {
      reached.add(i.id)
      queue.push(i.id)
    }
  }
  const hasTrigger = queue.length > 0
  for (let head = 0; head < queue.length; head++) {
    for (const t of next.get(queue[head]) ?? []) {
      if (!reached.has(t)) {
        reached.add(t)
        queue.push(t)
      }
    }
  }

  const warnings: Warning[] = []
  const warn = (code: WarningCode, item: Item, message: string, extra: { port?: string; field?: string } = {}) =>
    warnings.push({ code, severity: 'warning', nodeId: item.id, ...extra, message: `"${item.name}" ${message}` })

  for (const item of items) {
    const def = item.def
    if (def) {
      const inputs = portsOf(def, 'inputs')
      const outputs = portsOf(def, 'outputs')
      const connectedIn = incoming.get(item.id)
      const connectedOut = outgoing.get(item.id)

      // 1. a required input without an incoming edge
      let missingInput = false
      for (const p of inputs) {
        if (p.required === true && !connectedIn?.has(p.name)) {
          missingInput = true
          warn('required-input-unconnected', item, `needs a connection on its "${portText(p)}" input.`, { port: p.name })
        }
      }

      // 2. a required config property that is absent or blank
      for (const field of requiredFields(def)) {
        if (isEmptyValue(Object.hasOwn(item.config, field) ? item.config[field] : undefined)) {
          warn('required-field-empty', item, `needs a value for "${field}".`, { field })
        }
      }

      // 3. a Trigger none of whose outputs is connected
      if (def.category === 'Triggers' && outputs.length > 0 && !outputs.some((p) => connectedOut?.has(p.name))) {
        warn('trigger-not-connected', item, 'is a trigger but its output is not connected to anything.')
      }

      // 4. not reachable from any Trigger (one cause, one warning: an unconnected required input that has no edge at all is enough)
      if (def.category !== 'Triggers' && hasTrigger && !reached.has(item.id) && !(missingInput && !connectedIn)) {
        warn('node-unreachable', item, 'is not reachable from any trigger.')
      }

      // 5. a result nobody uses (Condition branches are outputs too, so wiring one of two is enough)
      if (def.category !== 'Output' && def.category !== 'Triggers' && outputs.length > 0 && !outputs.some((p) => connectedOut?.has(p.name))) {
        warn('result-unused', item, 'produces a result that no other node uses.')
      }
    }

    // 6 and 7. a credential in the config (contracts/SECRETS.md): every node counts, known type or not, because it is exported
    // either way. The message names the display path, which never holds a value or a credential-shaped key. Metadata findings
    // are not warnings (no node): the UI reads detectSecrets for them.
    const found = detectNodeSecrets(item.id, item.config)
    for (const f of found.filter((s) => s.confidence === 'high')) {
      warn('secret-likely', item, `may hold a credential at "${f.path}". Remove it from the workflow: anyone with the exported file could use it.`, { field: f.path })
    }
    for (const f of found.filter((s) => s.confidence === 'medium')) {
      warn('secret-suspected', item, `has a setting at "${f.path}" that may hold a credential.`, { field: f.path })
    }
  }
  return warnings
}

import { MAX_ERRORS, jsonPointer } from './errors'
import type { ErrorCode, ValidationError } from './errors'
import { echoSafe } from './secrets'
import type { NodeDefinition } from './types'

const MAX_ECHO = 100 // an untrusted id or type echoed in a message is cut to this many characters (after the credential test)

// Versioned node migrations (H3, contracts/MIGRATIONS.md). Pure: no React, no I/O, no clock, no randomness.
// The catalog serves only the LATEST definition of each node type; the history of how to get there lives in
// the registry below. Migration happens in memory on the parsed document. Nothing here can write a file.

export interface PortRenames {
  inputs?: Record<string, string>
  outputs?: Record<string, string>
}

export interface NodeMigration {
  type: string
  from: number
  to: number
  /** Must be pure, deterministic and total: it must not throw for ANY config (wrong types, absent keys, garbage). */
  migrate(node: { label: string; config: Record<string, unknown> }): {
    config: Record<string, unknown>
    notes: string[]
    portRenames?: PortRenames
  }
}

/** One migrated node: `from` is the version in the file, `to` the version now in memory. */
export interface UpgradeReport {
  nodeId: string
  type: string
  from: number
  to: number
  notes: string[]
}

/**
 * The registry, ordered by (type, from).
 *
 * agent.autonomous 1 -> 2: `maxIterations` became an `integer`. A value that was valid at version 1 (a finite
 * number from 1 to 50) and has a fractional part is rounded HALF UP, Math.floor(x + 0.5) (2.5 -> 3, 3.5 -> 4,
 * 49.5 -> 50). Python's built-in round() rounds half to even (round(2.5) == 2), so a Python port must NOT use it.
 * Every other value (absent, text, out of the version 1 range, already whole) is left exactly as it is, so
 * validation reports what version 1 would have reported.
 */
export const NODE_MIGRATIONS: NodeMigration[] = [
  {
    type: 'agent.autonomous',
    from: 1,
    to: 2,
    migrate: ({ config }) => {
      const value = Object.hasOwn(config, 'maxIterations') ? config.maxIterations : undefined
      if (typeof value !== 'number' || !Number.isFinite(value) || Number.isInteger(value) || value < 1 || value > 50) {
        return { config, notes: [] }
      }
      const rounded = Math.floor(value + 0.5)
      return {
        config: { ...config, maxIterations: rounded },
        notes: [`maxIterations ${value} was not a whole number and was rounded to ${rounded}`],
      }
    },
  },
]

export type MigrateNodesResult =
  | { ok: true; doc: Record<string, unknown>; upgrades: UpgradeReport[] }
  | { ok: false; errors: ValidationError[] }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * The error for a node of a KNOWN type whose version the catalog does not have: newer than the latest, or
 * older with no migration path. Shared with validateWorkflow. `unmigrated` is for a caller that never ran migrateNodes
 * (validateWorkflow on its own): there an older node may well HAVE a migration, it just was not run, so the message
 * must not claim there is none.
 */
export function nodeVersionProblem(
  index: number,
  id: string,
  type: string,
  version: number,
  latest: number,
  unmigrated = false,
): ValidationError {
  // id and type come from the file: shown only through echoSafe (the credential test runs on the full text, then the cut)
  const at = `nodes[${index}] ("${echoSafe(id, MAX_ECHO)}")`
  const t = echoSafe(type, MAX_ECHO)
  const code: ErrorCode = version > latest ? 'node.version-newer' : 'node.no-migration-path'
  const message =
    version > latest
      ? `${at}: ${t}@${version} was created by a newer editor (this editor has ${t}@${latest}).`
      : unmigrated
        ? `${at}: ${t}@${version} is older than this editor's ${t}@${latest} and has not been migrated (migrateNodes must run before validateWorkflow).`
        : `${at}: ${t}@${version} is too old and has no migration to ${t}@${latest}.`
  return { code, path: jsonPointer('nodes', index, 'typeVersion'), message }
}

/**
 * Upgrades every node of the RAW parsed document to the catalog's latest version of its type, following
 * registered `from -> to` steps. Never mutates its input: the result is new objects. Only a node that is an
 * object with a string `id`, a string `type` and an integer `typeVersion` is looked at; anything else is left
 * for the validator (`node.malformed`), as is a node of a type the catalog does not have (`node.unknown-type`).
 * A node newer than the catalog, or older with no complete chain, is an error; all such errors are collected
 * and nothing is migrated (the caller keeps the open workflow untouched).
 */
export function migrateNodes(
  doc: Record<string, unknown>,
  catalog: NodeDefinition[],
  registry: NodeMigration[] = NODE_MIGRATIONS,
): MigrateNodesResult {
  if (!Array.isArray(doc.nodes)) return { ok: true, doc, upgrades: [] }

  // Maps, not objects: `type` comes from the file, and "constructor" or "__proto__" must not match anything.
  const latest = new Map<string, number>()
  for (const d of catalog) latest.set(d.type, Math.max(latest.get(d.type) ?? d.version, d.version))
  const steps = new Map<string, Map<number, NodeMigration>>()
  for (const m of registry) {
    const byFrom = steps.get(m.type) ?? new Map<number, NodeMigration>()
    if (!byFrom.has(m.from)) byFrom.set(m.from, m)
    steps.set(m.type, byFrom)
  }

  const errors: ValidationError[] = []
  const upgrades: UpgradeReport[] = []
  const renamesByNode = new Map<string, PortRenames[]>()

  const nodes = (doc.nodes as unknown[]).map((raw, i) => {
    if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.type !== 'string' || !Number.isInteger(raw.typeVersion)) return raw
    const newest = latest.get(raw.type)
    const version = raw.typeVersion as number
    if (newest === undefined || version === newest) return raw
    if (version > newest) {
      if (errors.length < MAX_ERRORS) errors.push(nodeVersionProblem(i, raw.id, raw.type, version, newest))
      return raw
    }

    // Find the whole chain first, so a gap rejects the file before any migration runs.
    const chain: NodeMigration[] = []
    for (let at = version; at < newest; ) {
      const step = steps.get(raw.type)?.get(at)
      if (!step || step.to <= at || step.to > newest) break // a gap, or a step that cannot make progress
      chain.push(step)
      at = step.to
    }
    if (chain.length === 0 || chain[chain.length - 1].to !== newest) {
      if (errors.length < MAX_ERRORS) errors.push(nodeVersionProblem(i, raw.id, raw.type, version, newest))
      return raw
    }

    // A node that is malformed in another way is left for the validator; its version is not touched.
    if (typeof raw.label !== 'string' || !isRecord(raw.config)) return raw
    let config = raw.config
    const notes: string[] = []
    for (const step of chain) {
      const result = step.migrate({ label: raw.label, config })
      config = result.config
      notes.push(...result.notes)
      if (result.portRenames) {
        const list = renamesByNode.get(raw.id) ?? []
        list.push(result.portRenames)
        renamesByNode.set(raw.id, list)
      }
    }
    upgrades.push({ nodeId: raw.id, type: raw.type, from: version, to: newest, notes })
    return { ...raw, typeVersion: newest, config }
  })

  if (errors.length > 0) return { ok: false, errors }
  if (upgrades.length === 0) return { ok: true, doc, upgrades }

  // A renamed port must not orphan an edge: rewrite the edges of a migrated node in the same step.
  const rewrite = (end: unknown, side: 'inputs' | 'outputs'): unknown => {
    if (!isRecord(end) || typeof end.nodeId !== 'string' || typeof end.port !== 'string') return end
    let port = end.port
    for (const renames of renamesByNode.get(end.nodeId) ?? []) {
      const map = renames[side]
      if (map && Object.hasOwn(map, port)) port = map[port]
    }
    return port === end.port ? end : { ...end, port }
  }
  const rewriteEdge = (e: unknown): unknown => {
    if (!isRecord(e)) return e
    const source = rewrite(e.source, 'outputs')
    const target = rewrite(e.target, 'inputs')
    return source === e.source && target === e.target ? e : { ...e, source, target }
  }
  const migrated: Record<string, unknown> = { ...doc, nodes }
  if (renamesByNode.size > 0 && Array.isArray(doc.edges)) migrated.edges = (doc.edges as unknown[]).map(rewriteEdge)
  return { ok: true, doc: migrated, upgrades }
}

import { jsonPointer } from './errors'
import type { ValidationError } from './errors'
import { SCHEMA_VERSION } from './types'

// Each step upgrades a document from the version it is keyed by to the next version.
// Old documents must keep loading (architecture rule: backward compatibility), so when
// SCHEMA_VERSION is bumped, add the step here instead of rejecting old versions.
export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>
export const MIGRATIONS: Record<string, Migration> = {}

export type MigrateResult =
  | { ok: true; doc: Record<string, unknown> }
  | { ok: false; errors: ValidationError[] }

/** Upgrades an unknown parsed document to the current schemaVersion, or explains why not. */
export function migrate(input: unknown, migrations: Record<string, Migration> = MIGRATIONS): MigrateResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {
      ok: false,
      errors: [{ code: 'doc.not-object', path: '', message: 'Workflow file must contain a JSON object.' }],
    }
  }
  let doc = input as Record<string, unknown>
  const seen = new Set<string>()
  while (doc.schemaVersion !== SCHEMA_VERSION) {
    const version = doc.schemaVersion
    // schemaVersion is untrusted: only own keys are migration steps ("constructor" must not match).
    const step =typeof version === 'string' && Object.hasOwn(migrations, version) ? migrations[version] : undefined
    if (typeof version !== 'string' || !step || seen.has(version)) {
      return {
        ok: false,
        errors: [
          {
            code: 'doc.unsupported-version',
            path: jsonPointer('schemaVersion'),
            message: `Unsupported schemaVersion ${JSON.stringify(version)}; this editor supports ${SCHEMA_VERSION}.`,
          },
        ],
      }
    }
    seen.add(version)
    doc = step(doc)
  }
  return { ok: true, doc }
}

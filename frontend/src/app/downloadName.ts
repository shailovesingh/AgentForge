import { REDACTED_NAME, safeDisplayName } from '../workflow/secrets'

/**
 * The file name of an export, from the workflow name. Workflow names are not scanned for credentials, but a name that is
 * credential-shaped never reaches the file name (a file name is shown by the browser, the file manager and downloads lists):
 * it falls back to "workflow".
 */
export function downloadName(name: string): string {
  const slug = safeDisplayName(name) === REDACTED_NAME ? '' : name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${slug || 'workflow'}.json`
}

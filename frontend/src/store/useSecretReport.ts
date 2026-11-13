import { useEditorStore } from './editorStore'
import { getSecretReport } from './secretReport'
import type { SecretReport } from './secretReport'

// Like useWarnings: the references stay the same while the report is unchanged, so a drag or a name edit re-renders nobody.

/** The whole report. Use the smaller hook when a boolean is enough. */
export function useSecretReport(): SecretReport {
  return useEditorStore((s) => getSecretReport(s.workflow))
}

/** Only "is there a high-confidence finding (config or metadata)": the component re-renders only when this flips. */
export function useHasHighSecret(): boolean {
  return useEditorStore((s) => getSecretReport(s.workflow).hasHigh)
}

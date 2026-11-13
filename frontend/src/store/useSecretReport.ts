import { useEditorStore } from './editorStore'
import { getSecretReport } from './secretReport'

// Like useWarnings: the value stays the same while nothing the report shows changes, so a drag or a name edit re-renders nobody.

/** Only "is there a high-confidence finding (config or metadata)": the component re-renders only when this flips. */
export function useHasHighSecret(): boolean {
  return useEditorStore((s) => getSecretReport(s.workflow).hasHigh)
}

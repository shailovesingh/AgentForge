import { useEditorStore } from './editorStore'
import { getWarnings } from './warnings'
import type { WarningsView } from './warnings'

/** The warnings of the current workflow, linted once per workflow object and shared by every caller. */
export function useWarnings(): WarningsView {
  return getWarnings(useEditorStore((s) => s.workflow))
}

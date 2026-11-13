import { useEditorStore } from './editorStore'
import { getNodeWarnings, getWarnings } from './warnings'
import type { WarningsView } from './warnings'
import type { Warning } from '../workflow/lint'

// The selectors return references that stay the same while the warnings are unchanged (see getWarnings), so a drag frame
// or a keystroke in the workflow name does not re-render a component that only cares about warnings.

/** All warnings of the current workflow (the toolbar). */
export function useWarnings(): WarningsView {
  return useEditorStore((s) => getWarnings(s.workflow))
}

/** Only one node's warnings: the component re-renders only when THAT node's warnings change. */
export function useNodeWarnings(nodeId: string | null): readonly Warning[] {
  return useEditorStore((s) => getNodeWarnings(s.workflow, nodeId))
}

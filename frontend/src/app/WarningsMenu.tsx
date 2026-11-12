import { TriangleAlert } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useEditorStore } from '../store/editorStore'
import { useWarnings } from '../store/useWarnings'
import { warningCountText } from '../store/warnings'
import styles from './WarningsMenu.module.css'

/**
 * The toolbar's warning count and a non-modal list (disclosure pattern). Nothing here is a live region: the count changes
 * silently (Q6). Shown only when there is at least one warning. An entry selects its node; it opens nothing and moves no focus
 * beyond the click itself.
 */
export function WarningsMenu() {
  const { warnings } = useWarnings()
  const setSelection = useEditorStore((s) => s.setSelection)
  const [open, setOpen] = useState(false)
  const listId = useId()
  const toggle = useRef<HTMLButtonElement>(null)
  const total = warnings.length

  if (total === 0) {
    // The button is gone: close the list, so it does not pop open again when a warning comes back.
    if (open) setOpen(false)
    return null
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      setOpen(false)
      toggle.current?.focus() // the focused entry is about to disappear
    }
  }

  return (
    <div className={styles.wrap} onKeyDown={onKeyDown}>
      <button
        ref={toggle}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        <TriangleAlert size={14} aria-hidden="true" /> {warningCountText(total)}
      </button>
      <ul id={listId} className={styles.list} aria-label="Editor warnings" hidden={!open}>
        {warnings.map((w, i) => (
          <li key={i}>
            <button type="button" className={styles.entry} onClick={() => setSelection([w.nodeId], [])}>
              {w.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

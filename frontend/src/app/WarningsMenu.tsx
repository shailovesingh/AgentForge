import { TriangleAlert } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useEditorStore } from '../store/editorStore'
import { useWarnings } from '../store/useWarnings'
import { warningCountText, warningKeys } from '../store/warnings'
import styles from './WarningsMenu.module.css'

/**
 * The toolbar's warning count and a non-modal list (disclosure pattern). Nothing here is a live region: the count changes
 * silently (Q6). Shown only when there is at least one warning. An entry selects its node; it opens nothing and moves no focus
 * beyond the click itself. The list element stays mounted (so `aria-controls` always points at something) and has its
 * entries only while it is open.
 */
export function WarningsMenu() {
  const { warnings } = useWarnings()
  const setSelection = useEditorStore((s) => s.setSelection)
  const [open, setOpen] = useState(false)
  const listId = useId()
  const toggle = useRef<HTMLButtonElement>(null)
  const focusedKey = useRef<string | null>(null) // the entry that has focus, if any
  const total = warnings.length
  const keys = warningKeys(warnings)

  // A focused entry whose warning was fixed is removed, and focus would fall to the page: move it to the toggle instead.
  // Only when focus really was lost (never steal it from a field the user moved to).
  useEffect(() => {
    const key = focusedKey.current
    if (key !== null && !keys.includes(key)) {
      focusedKey.current = null
      if (document.activeElement === null || document.activeElement === document.body) toggle.current?.focus()
    }
  })

  if (total === 0) {
    // The button is gone: close the list, so it does not pop open again when a warning comes back.
    if (open) setOpen(false)
    return null
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      setOpen(false)
      focusedKey.current = null
      toggle.current?.focus() // the focused entry is about to disappear
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      // Not for the canvas: with a node selected, these keys would delete it.
      e.stopPropagation()
    }
  }

  return (
    <div className={styles.wrap} onKeyDown={onKeyDown}>
      <button
        ref={toggle}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          focusedKey.current = null
          setOpen((o) => !o)
        }}
      >
        <TriangleAlert size={14} aria-hidden="true" /> {warningCountText(total)}
      </button>
      <ul id={listId} className={styles.list} aria-label="Editor warnings" hidden={!open}>
        {open &&
          warnings.map((w, i) => (
            <li key={keys[i]}>
              <button
                type="button"
                className={styles.entry}
                onClick={() => setSelection([w.nodeId], [])}
                onFocus={() => {
                  focusedKey.current = keys[i]
                }}
                onBlur={(e) => {
                  // A removed element is not connected any more; that is not a real blur, so the key is kept for the effect.
                  const el = e.currentTarget
                  queueMicrotask(() => {
                    if (el.isConnected && focusedKey.current === keys[i]) focusedKey.current = null
                  })
                }}
              >
                {w.message}
              </button>
            </li>
          ))}
      </ul>
    </div>
  )
}

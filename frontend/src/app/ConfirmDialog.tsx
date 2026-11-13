import { ShieldAlert } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type { SecretReport } from '../store/secretReport'
import styles from './ConfirmDialog.module.css'

export interface ConfirmDialogProps {
  /** The ONLY data the dialog gets: node names, display paths and counts. No workflow, so no raw label, id or value. */
  report: SecretReport
  onCancel: () => void
  onConfirm: () => void
}

const FOCUSABLE = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * The export confirmation (D-023): shown on EVERY export while the workflow has a high-confidence secret finding. It is
 * mounted only while open (a closed one would be a stray `<dialog>` in the page) and uses the native `<dialog>` with
 * `showModal()`, which makes the rest of the page inert and handles Escape. Cancel gets the focus. Nothing is remembered.
 * Lists nodes and display paths only; never a value.
 */
export function ConfirmDialog({ report, onCancel, onConfirm }: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const closedByUs = useRef(false)
  const titleId = useId()
  const descId = useId()
  const { nodes, omittedNodes, metadata } = report.high

  useEffect(() => {
    const el = dialog.current
    closedByUs.current = false // (a development double-mount runs the cleanup first)
    if (el && !el.open) el.showModal()
    cancel.current?.focus() // the safe choice is the default
    return () => {
      closedByUs.current = true // our own close() below must not count as the browser closing the dialog
      if (el?.open) el.close() // the browser gives focus back to the element that had it before showModal
    }
  }, [])

  // Escape: keep the cancel on our own path (the parent unmounts the dialog).
  const onCancelEvent = (e: { preventDefault: () => void }) => {
    e.preventDefault()
    onCancel()
  }

  // A close that did not come from our own cleanup and had no cancel event first: the parent must forget the dialog, or
  // Export would stay dead (the state would say "open" with no dialog on screen).
  // (A development double-mount closes and re-opens it: that `close` event arrives while the dialog is open again, so the
  // open check ignores it.)
  const onClose = (e: { currentTarget: { open: boolean } }) => {
    if (!closedByUs.current && !e.currentTarget.open) onCancel()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    // Only Tab (cycled below) and Escape (the native cancel) are the dialog's business. Every other key is stopped HERE:
    // React Flow listens on the document for Delete and Backspace, and a node deleted while the dialog is open would make the
    // export differ from the list the person is reading.
    if (e.key !== 'Tab') {
      if (e.key !== 'Escape') e.stopPropagation()
      return
    }
    // Tab and Shift+Tab cycle inside the dialog (the browser would let focus leave a modal dialog for its own toolbar).
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={descId}
      onCancel={onCancelEvent}
      onClose={onClose}
      onKeyDown={onKeyDown}
    >
      <h2 id={titleId} className={styles.title}>
        <ShieldAlert size={18} aria-hidden="true" /> Export a workflow with a possible credential?
      </h2>
      <p id={descId}>
        This workflow may contain a credential. Anyone who obtains the exported file can use it, and the file may be shared,
        committed or stored.
      </p>

      {/* Focusable so that a long list can be scrolled with the keyboard. */}
      <div className={styles.list} tabIndex={0} role="group" aria-label="Where a possible credential was found">
        <ul>
          {nodes.map((n, i) => (
            <li key={i}>
              <strong>{n.name}</strong>
              <ul>
                {n.paths.map((p, j) => (
                  <li key={j}>
                    <code>{p}</code>
                  </li>
                ))}
                {n.omitted > 0 && <li>and {n.omitted} more</li>}
              </ul>
            </li>
          ))}
          {omittedNodes > 0 && <li>and {omittedNodes} more nodes</li>}
          {(metadata.paths.length > 0 || metadata.omitted > 0) && (
            <li>
              <strong>Workflow metadata</strong>
              <ul>
                {metadata.paths.map((p, j) => (
                  <li key={j}>
                    <code>{p}</code>
                  </li>
                ))}
                {metadata.omitted > 0 && <li>and {metadata.omitted} more</li>}
              </ul>
            </li>
          )}
        </ul>
      </div>

      <p className={styles.how}>
        <strong>How to replace it.</strong> Remove the value from the workflow. Credential references (an opaque id pointing to
        a credential stored by the AgentForge backend) are not available yet: they arrive with backend credential management.
        Until then, keep the secret out of the file and provide it where the workflow runs. When references exist, replace the
        value with one.
      </p>

      <div className={styles.buttons}>
        <button ref={cancel} type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={styles.danger} onClick={onConfirm}>
          Export anyway
        </button>
      </div>
    </dialog>
  )
}

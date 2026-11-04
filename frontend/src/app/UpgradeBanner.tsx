import { useEditorStore } from '../store/editorStore'
import { describeUpgrades } from './describeUpgrades'
import { IMPORT_BUTTON_ID } from './importButton'
import { shorten } from './shorten'
import styles from './UpgradeBanner.module.css'

// A note or id longer than this is cut when shown, so a huge value cannot flood the banner.
const MAX_SHOWN = 200

/**
 * Shown after an import that upgraded nodes in memory. Never silent, and never touches the file.
 * The `role="status"` container is ALWAYS mounted (empty when there is nothing to say): a live region that is added to
 * the page together with its content is often not announced by screen readers, one that is already there is.
 */
export function UpgradeBanner() {
  const upgrades = useEditorStore((s) => s.upgrades)
  const dismissUpgrades = useEditorStore((s) => s.dismissUpgrades)
  const notes = upgrades.flatMap((u) => u.notes.map((note) => ({ nodeId: u.nodeId, note })))
  const dismiss = () => {
    dismissUpgrades()
    // The Dismiss button is about to disappear, and focus would fall back to the page. The Import button is the stable
    // element the user was working with when the banner appeared (the banner is the result of an import), so focus
    // returns there. It is always in the page; if it somehow were not, focus simply stays where the browser puts it.
    document.getElementById(IMPORT_BUTTON_ID)?.focus()
  }
  return (
    <div role="status" className={upgrades.length > 0 ? styles.banner : undefined}>
      {upgrades.length > 0 && (
        <>
          <div className={styles.header}>
            <strong>{describeUpgrades(upgrades)}</strong>
            <button type="button" onClick={dismiss}>
              Dismiss
            </button>
          </div>
          {notes.length > 0 && (
            <ul>
              {notes.map(({ nodeId, note }, i) => (
                <li key={i}>
                  <code>{shorten(nodeId, 40)}</code> {shorten(note, MAX_SHOWN)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

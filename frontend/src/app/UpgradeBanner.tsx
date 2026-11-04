import { useEditorStore } from '../store/editorStore'
import { describeUpgrades } from './describeUpgrades'
import { shorten } from './shorten'
import styles from './UpgradeBanner.module.css'

// A note or id longer than this is cut when shown, so a huge value cannot flood the banner.
const MAX_SHOWN = 200

/** Shown after an import that upgraded nodes in memory. Never silent, and never touches the file. */
export function UpgradeBanner() {
  const upgrades = useEditorStore((s) => s.upgrades)
  const dismissUpgrades = useEditorStore((s) => s.dismissUpgrades)
  if (upgrades.length === 0) return null
  const notes = upgrades.flatMap((u) => u.notes.map((note) => ({ nodeId: u.nodeId, note })))
  return (
    <div className={styles.banner} role="status">
      <div className={styles.header}>
        <strong>{describeUpgrades(upgrades)}</strong>
        <button type="button" onClick={dismissUpgrades}>
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
    </div>
  )
}

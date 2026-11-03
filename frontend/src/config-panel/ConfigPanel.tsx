import { useId, useState } from 'react'
import { getNodeDefinition } from '../catalog'
import { useEditorStore } from '../store/editorStore'
import { parseConfigInput } from '../workflow/configSchema'
import type { ConfigProperty } from '../workflow/types'
import styles from './ConfigPanel.module.css'

export function ConfigPanel() {
  const selectedId = useEditorStore((s) => (s.selectedNodeIds.length === 1 ? s.selectedNodeIds[0] : null))
  const node = useEditorStore((s) => s.workflow.nodes.find((n) => n.id === selectedId))
  const selectedCount = useEditorStore((s) => s.selectedNodeIds.length)
  const updateNodeLabel = useEditorStore((s) => s.updateNodeLabel)

  if (!node) {
    return (
      <aside className={styles.panel} aria-label="Node settings">
        <p className={styles.empty}>
          {selectedCount > 1 ? `${selectedCount} nodes selected.` : 'Select a node to edit its settings.'}
        </p>
      </aside>
    )
  }

  const def = getNodeDefinition(node.type, node.typeVersion)
  return (
    // Keyed by node id so field drafts reset when the selection changes.
    <aside className={styles.panel} aria-label="Node settings" key={node.id}>
      <h2 className={styles.title}>{def?.label ?? node.type}</h2>
      {def && <p className={styles.desc}>{def.description}</p>}

      <TextField
        label="Label"
        value={node.label}
        onCommit={(v) => updateNodeLabel(node.id, v)}
      />

      {def &&
        Object.entries(def.configSchema.properties).map(([key, prop]) => (
          <ConfigField key={key} nodeId={node.id} name={key} prop={prop} value={node.config[key]} />
        ))}
    </aside>
  )
}

function TextField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const id = useId()
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" value={value} onChange={(e) => onCommit(e.target.value)} />
    </div>
  )
}

function ConfigField({ nodeId, name, prop, value }: { nodeId: string; name: string; prop: ConfigProperty; value: unknown }) {
  const id = useId()
  const errorId = `${id}-error`
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig)

  // The draft is the text in the control. It is committed to the store only when it parses
  // and validates; otherwise the error is shown and the last valid value stays in the store.
  const [draft, setDraft] = useState(() => toDraft(prop, value))
  const [error, setError] = useState<string | null>(null)

  const onText = (raw: string) => {
    setDraft(raw)
    const result = parseConfigInput(prop, raw)
    if (result.ok) {
      setError(null)
      updateNodeConfig(nodeId, { [name]: result.value })
    } else {
      setError(result.error)
    }
  }

  const common = {
    id,
    'aria-invalid': error !== null,
    'aria-describedby': error ? errorId : undefined,
  }

  let control
  if (prop.type === 'boolean') {
    control = (
      <input
        {...common}
        type="checkbox"
        checked={value === true}
        onChange={(e) => updateNodeConfig(nodeId, { [name]: e.target.checked })}
      />
    )
  } else if (prop.type === 'string' && prop.enum) {
    control = (
      <select {...common} value={draft} onChange={(e) => onText(e.target.value)}>
        {prop.enum.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    )
  } else if (prop.type === 'object' || prop.format === 'multiline') {
    control = (
      <textarea
        {...common}
        rows={prop.type === 'object' ? 5 : 4}
        spellCheck={prop.type !== 'object'}
        value={draft}
        onChange={(e) => onText(e.target.value)}
      />
    )
  } else {
    control = (
      <input
        {...common}
        type="text"
        inputMode={prop.type === 'number' ? 'decimal' : undefined}
        value={draft}
        onChange={(e) => onText(e.target.value)}
      />
    )
  }

  return (
    <div className={styles.field}>
      <label htmlFor={id}>{prop.title}</label>
      {control}
      {prop.description && <small className={styles.hint}>{prop.description}</small>}
      {error && (
        <small id={errorId} className={styles.error} role="alert">
          {prop.title} {error}
        </small>
      )}
    </div>
  )
}

function toDraft(prop: ConfigProperty, value: unknown): string {
  if (prop.type === 'object') return JSON.stringify(value ?? {}, null, 2)
  if (prop.type === 'number') return value === undefined ? '' : String(value)
  return typeof value === 'string' ? value : ''
}

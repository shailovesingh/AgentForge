import { useId, useState } from 'react'
import { getNodeDefinition } from '../catalog'
import { useEditorStore } from '../store/editorStore'
import { parseConfigInput } from '../workflow/configSchema'
import type { JsonSchema } from '../workflow/jsonSchema'
import type { NodeDefinition, NodeUi } from '../workflow/types'
import styles from './ConfigPanel.module.css'

/** Property names in display order: `ui.order` first (existing names only), then every other property in schema order. */
function propertyOrder(def: NodeDefinition): string[] {
  const keys = Object.keys(def.configSchema.properties ?? {})
  const ordered = (def.ui?.order ?? []).filter((key) => keys.includes(key))
  return [...new Set([...ordered, ...keys])]
}

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
        propertyOrder(def).map((key) => (
          <ConfigField
            key={key}
            nodeId={node.id}
            name={key}
            prop={def.configSchema.properties![key]}
            ui={def.ui?.fields?.[key]}
            value={node.config[key]}
          />
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

type FieldUi = NonNullable<NodeUi['fields']>[string]

function ConfigField({
  nodeId,
  name,
  prop,
  ui,
  value,
}: {
  nodeId: string
  name: string
  prop: JsonSchema
  ui: FieldUi | undefined
  value: unknown
}) {
  const id = useId()
  const errorId = `${id}-error`
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig)
  const title = prop.title ?? name

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

  const isJson = prop.type === 'object' || prop.type === 'array'
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
          <option key={String(option)} value={String(option)}>
            {String(option)}
          </option>
        ))}
      </select>
    )
  } else if (isJson || (prop.type === 'string' && ui?.widget === 'textarea')) {
    control = (
      <textarea
        {...common}
        rows={ui?.rows ?? (isJson ? 5 : 4)}
        placeholder={ui?.placeholder}
        spellCheck={!isJson}
        value={draft}
        onChange={(e) => onText(e.target.value)}
      />
    )
  } else {
    control = (
      <input
        {...common}
        type="text"
        inputMode={prop.type === 'number' ? 'decimal' : prop.type === 'integer' ? 'numeric' : undefined}
        placeholder={ui?.placeholder}
        value={draft}
        onChange={(e) => onText(e.target.value)}
      />
    )
  }

  return (
    <div className={styles.field}>
      <label htmlFor={id}>{title}</label>
      {control}
      {prop.description && <small className={styles.hint}>{prop.description}</small>}
      {error && (
        <small id={errorId} className={styles.error} role="alert">
          {title} {error}
        </small>
      )}
    </div>
  )
}

function toDraft(prop: JsonSchema, value: unknown): string {
  if (prop.type === 'object') return JSON.stringify(value ?? {}, null, 2)
  if (prop.type === 'array') return JSON.stringify(value ?? [], null, 2)
  if (prop.type === 'number' || prop.type === 'integer') return value === undefined ? '' : String(value)
  return typeof value === 'string' ? value : ''
}

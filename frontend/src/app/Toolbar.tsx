import { useReactFlow } from '@xyflow/react'
import { Download, FilePlus, Upload } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { nodeDefinitions } from '../catalog'
import { useEditorStore } from '../store/editorStore'
import { importWorkflow, serializeWorkflow } from '../workflow/serialize'
import styles from './Toolbar.module.css'

function downloadName(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${slug || 'workflow'}.json`
}

export function Toolbar() {
  const name = useEditorStore((s) => s.workflow.name)
  const setWorkflowName = useEditorStore((s) => s.setWorkflowName)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const nameId = useId()
  const { fitView } = useReactFlow()

  const onExport = () => {
    const { workflow } = useEditorStore.getState()
    const url = URL.createObjectURL(new Blob([serializeWorkflow(workflow)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = downloadName(workflow.name)
    link.click()
    URL.revokeObjectURL(url)
  }

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-importing the same file
    if (!file) return
    const result = importWorkflow(await file.text(), nodeDefinitions)
    if (result.ok) {
      // Only a fully valid file replaces the current graph.
      useEditorStore.getState().loadWorkflow(result.workflow)
      setImportErrors([])
      // Fit after React Flow has rendered and measured the new nodes.
      setTimeout(() => void fitView({ padding: 0.2, maxZoom: 1 }), 50)
    } else {
      setImportErrors(result.errors)
    }
  }

  return (
    <header className={styles.toolbar}>
      <strong className={styles.brand}>AgentForge</strong>
      <label htmlFor={nameId} className={styles.srOnly}>
        Workflow name
      </label>
      <input
        id={nameId}
        className={styles.name}
        type="text"
        value={name}
        onChange={(e) => setWorkflowName(e.target.value)}
      />
      <div className={styles.actions}>
        <button type="button" onClick={() => useEditorStore.getState().reset()}>
          <FilePlus size={14} aria-hidden="true" /> New
        </button>
        <button type="button" onClick={() => fileInput.current?.click()}>
          <Upload size={14} aria-hidden="true" /> Import
        </button>
        <button type="button" onClick={onExport}>
          <Download size={14} aria-hidden="true" /> Export
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="Import workflow file"
          onChange={onImport}
        />
      </div>

      {importErrors.length > 0 && (
        <div className={styles.errors} role="alert">
          <div className={styles.errorsHeader}>
            <strong>Import failed. The current workflow was not changed.</strong>
            <button type="button" onClick={() => setImportErrors([])}>
              Dismiss
            </button>
          </div>
          <ul>
            {importErrors.map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ul>
        </div>
      )}
    </header>
  )
}

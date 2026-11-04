import { useReactFlow } from '@xyflow/react'
import { Download, FilePlus, Upload } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { nodeDefinitions } from '../catalog'
import { useEditorStore } from '../store/editorStore'
import type { ValidationError } from '../workflow/errors'
import { MAX_IMPORT_BYTES, exportWorkflowText, importTooLarge, importWorkflow } from '../workflow/serialize'
import { shorten } from './shorten'
import { IMPORT_BUTTON_ID } from './importButton'
import styles from './Toolbar.module.css'

// A path or message longer than this is cut when shown, so a huge key cannot flood the alert panel.
const MAX_SHOWN = 200

function downloadName(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${slug || 'workflow'}.json`
}

export function Toolbar() {
  const name = useEditorStore((s) => s.workflow.name)
  const setWorkflowName = useEditorStore((s) => s.setWorkflowName)
  const [problem, setProblem] = useState<{ heading: string; errors: ValidationError[] } | null>(null)
  const setImportErrors = (errors: ValidationError[]) =>
    setProblem(errors.length > 0 ? { heading: 'Import failed. The current workflow was not changed.', errors } : null)
  const fileInput = useRef<HTMLInputElement>(null)
  const nameId = useId()
  const { fitView } = useReactFlow()

  const onExport = () => {
    const { workflow } = useEditorStore.getState()
    const exported = exportWorkflowText(workflow)
    if (!exported.ok) {
      // Refused before anything is written, so no file is created.
      setProblem({ heading: 'Export failed. No file was created.', errors: exported.errors })
      return
    }
    setProblem(null)
    const url = URL.createObjectURL(new Blob([exported.text], { type: 'application/json' }))
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
    if (file.size > MAX_IMPORT_BYTES) {
      // Refused before the file is read into memory.
      setImportErrors([importTooLarge()])
      return
    }
    const result = importWorkflow(new Uint8Array(await file.arrayBuffer()), nodeDefinitions)
    if (result.ok) {
      // Only a fully valid file replaces the current graph.
      useEditorStore.getState().loadWorkflow(result.workflow, result.upgrades)
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
        <button id={IMPORT_BUTTON_ID} type="button" onClick={() => fileInput.current?.click()}>
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

      {problem && (
        <div className={styles.errors} role="alert">
          <div className={styles.errorsHeader}>
            <strong>{problem.heading}</strong>
            <button type="button" onClick={() => setProblem(null)}>
              Dismiss
            </button>
          </div>
          <ul>
            {problem.errors.map((error, i) => (
              <li key={i}>
                <code>{error.code}</code> {shorten(error.message, MAX_SHOWN)}{' '}
                <span className={styles.path}>
                  {error.path === '' ? '(whole document)' : `at ${shorten(error.path, MAX_SHOWN)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  )
}

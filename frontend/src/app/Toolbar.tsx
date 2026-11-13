import { useReactFlow } from '@xyflow/react'
import { Download, FilePlus, ShieldAlert, Upload } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { nodeDefinitions } from '../catalog'
import { useEditorStore } from '../store/editorStore'
import { getSecretReport } from '../store/secretReport'
import type { SecretReport } from '../store/secretReport'
import { useHasHighSecret } from '../store/useSecretReport'
import type { ValidationError } from '../workflow/errors'
import { echoSafe, echoSafePointer } from '../workflow/secrets'
import { MAX_IMPORT_BYTES, exportWorkflowText, importTooLarge, importWorkflow } from '../workflow/serialize'
import type { Workflow } from '../workflow/types'
import { ConfirmDialog } from './ConfirmDialog'
import { downloadName } from './downloadName'
import { IMPORT_BUTTON_ID } from './importButton'
import styles from './Toolbar.module.css'
import { WarningsMenu } from './WarningsMenu'

// A path or message longer than this is cut when shown, so a huge key cannot flood the alert panel.
const MAX_SHOWN = 200

// An error message or path is shown through these (contracts/SECRETS.md, never echo). A validation error can name the offending
// KEY (`/nodes/0/config/<key>`), and a key could itself be a pasted token. The checks run on the FULL text before the cut; the
// error object keeps its exact path, only the displayed text is replaced by "(hidden: may contain a credential)".
const shownMessage = (text: string): string => echoSafe(text, MAX_SHOWN)
const shownPath = (pointer: string): string => echoSafePointer(pointer, MAX_SHOWN)

export function Toolbar() {
  const name = useEditorStore((s) => s.workflow.name)
  const setWorkflowName = useEditorStore((s) => s.setWorkflowName)
  const [problem, setProblem] = useState<{ heading: string; errors: ValidationError[] } | null>(null)
  const setImportErrors = (errors: ValidationError[]) =>
    setProblem(errors.length > 0 ? { heading: 'Import failed. The current workflow was not changed.', errors } : null)
  const fileInput = useRef<HTMLInputElement>(null)
  const exportButton = useRef<HTMLButtonElement>(null)
  const nameId = useId()
  const { fitView } = useReactFlow()
  const hasHighSecret = useHasHighSecret() // a boolean: a drag or a keystroke elsewhere does not re-render the toolbar
  // The export that is waiting for a confirmation (null: no dialog): the workflow OBJECT that was current when Export was
  // clicked and the report built from it. "Export anyway" exports that very object, so the file is what the dialog listed,
  // whatever happens to the editor meanwhile (an import that finishes behind the dialog, a key that reaches the canvas).
  // Never remembered: every export asks again.
  const [confirming, setConfirming] = useState<{ report: SecretReport; workflow: Workflow } | null>(null)
  const wasConfirming = useRef(false)

  // After the dialog is gone (its cleanup has closed it), focus goes back to the Export button.
  useEffect(() => {
    if (wasConfirming.current && confirming === null) exportButton.current?.focus()
    wasConfirming.current = confirming !== null
  }, [confirming])

  const onExportClick = () => {
    const { workflow } = useEditorStore.getState() // read at click time, never earlier
    const report = getSecretReport(workflow)
    if (report.hasHigh) setConfirming({ report, workflow })
    else exportNow(workflow)
  }

  const exportNow = (workflow: Workflow) => {
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
    <>
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
        {hasHighSecret && (
          // A status TEXT, not an alert and not a live region: it stays until the credential is removed. Never names a value.
          <span className={styles.secretNotice} data-secret-indicator>
            <ShieldAlert size={14} aria-hidden="true" /> Possible credential in this workflow
          </span>
        )}
        <div className={styles.actions}>
          <WarningsMenu />
          <button type="button" onClick={() => useEditorStore.getState().reset()}>
            <FilePlus size={14} aria-hidden="true" /> New
          </button>
          <button id={IMPORT_BUTTON_ID} type="button" onClick={() => fileInput.current?.click()}>
            <Upload size={14} aria-hidden="true" /> Import
          </button>
          <button ref={exportButton} type="button" onClick={onExportClick}>
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
                  <code>{error.code}</code> {shownMessage(error.message)}{' '}
                  <span className={styles.path}>
                    {error.path === '' ? '(whole document)' : `at ${shownPath(error.path)}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </header>
      {confirming && (
        <ConfirmDialog
          report={confirming.report}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const { workflow } = confirming
            setConfirming(null)
            exportNow(workflow) // the existing export path, on the workflow the dialog listed (an export error still shows its panel)
          }}
        />
      )}
    </>
  )
}

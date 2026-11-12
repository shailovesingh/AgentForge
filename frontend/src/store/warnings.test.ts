import { describe, expect, test } from 'vitest'
import { createEmptyWorkflow } from './editorStore'
import { getWarnings, groupByNode, warningCountText } from './warnings'
import type { Warning } from '../workflow/lint'
import type { Workflow } from '../workflow/types'

const w = (nodeId: string, message: string): Warning => ({ code: 'result-unused', severity: 'warning', nodeId, message })

/** A workflow with one LLM Prompt node (empty prompt, unconnected output): two warnings. */
function oneNode(): Workflow {
  return {
    ...createEmptyWorkflow(),
    nodes: [
      {
        id: 'n1',
        type: 'llm.prompt',
        typeVersion: 1,
        label: 'Ask',
        config: { provider: 'ollama', prompt: '' },
        position: { x: 0, y: 0 },
      },
    ],
  }
}

describe('groupByNode', () => {
  test('groups by node id, keeps order, and is safe for ids like "constructor" and "__proto__"', () => {
    const a = w('constructor', 'a')
    const b = w('__proto__', 'b')
    const c = w('constructor', 'c')
    const grouped = groupByNode([a, b, c])
    expect([...grouped.keys()]).toEqual(['constructor', '__proto__'])
    expect(grouped.get('constructor')).toEqual([a, c])
    expect(grouped.get('__proto__')).toEqual([b])
    expect(grouped.get('missing')).toBeUndefined()
  })

  test('an empty list gives an empty map', () => {
    expect(groupByNode([]).size).toBe(0)
  })
})

describe('warningCountText', () => {
  test('singular and plural', () => {
    expect(warningCountText(1)).toBe('1 warning')
    expect(warningCountText(2)).toBe('2 warnings')
    expect(warningCountText(0)).toBe('0 warnings')
    expect(warningCountText(12)).toBe('12 warnings')
  })
})

describe('getWarnings (one lint per workflow object)', () => {
  test('the same workflow object gives the very same result object', () => {
    const wf = oneNode()
    const first = getWarnings(wf)
    expect(getWarnings(wf)).toBe(first)
    expect(getWarnings(wf).warnings).toBe(first.warnings)
    expect(getWarnings(wf).byNode).toBe(first.byNode)
  })

  test('a new workflow object is linted again, and the old object keeps its result', () => {
    const wf = oneNode()
    const first = getWarnings(wf)
    const edited: Workflow = { ...wf, nodes: wf.nodes.map((n) => ({ ...n, config: { ...n.config, prompt: 'Hi' } })) }
    const second = getWarnings(edited)
    expect(second).not.toBe(first)
    expect(first.warnings.map((x) => x.code)).toEqual(['required-field-empty', 'result-unused'])
    expect(second.warnings.map((x) => x.code)).toEqual(['result-unused'])
    expect(getWarnings(wf)).toBe(first)
  })

  test('groups the result by node and leaves the document untouched', () => {
    const wf = oneNode()
    const before = JSON.stringify(wf)
    const view = getWarnings(wf)
    expect(view.byNode.get('n1')).toEqual(view.warnings)
    expect(JSON.stringify(wf)).toBe(before)
    expect(before.includes('warning')).toBe(false)
  })
})

describe('source-text guards', () => {
  const sources = import.meta.glob<string>('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
  const text = (file: string) => {
    const t = sources[file]
    expect(t, file).toBeTypeOf('string')
    return t
  }
  const reactImport = /from\s+['"]react(-dom)?(\/[^'"]*)?['"]/

  test('lint.ts and the pure warning helpers import no React', () => {
    expect(reactImport.test(`import { useId } from 'react'`)).toBe(true) // self-test of the regex
    for (const file of ['/src/workflow/lint.ts', '/src/store/warnings.ts']) {
      expect(reactImport.test(text(file)), file).toBe(false)
    }
  })

  test('no warning UI renders HTML or uses a live region or an alert/status role', () => {
    const warningUi = ['/src/app/WarningsMenu.tsx', '/src/store/useWarnings.ts', '/src/store/warnings.ts']
    const forbidden = /dangerouslySetInnerHTML|aria-live|role\s*=\s*["'{]\s*["']?(alert|status)|aria-atomic/
    expect(forbidden.test(`<div aria-live="polite" />`)).toBe(true) // self-test of the regex
    for (const file of warningUi) expect(forbidden.test(text(file)), file).toBe(false)
    // The components that also show warnings (a badge, a section) must not render HTML or open a live region either.
    for (const file of ['/src/nodes/WorkflowNode.tsx', '/src/config-panel/ConfigPanel.tsx', '/src/app/Toolbar.tsx']) {
      expect(/dangerouslySetInnerHTML|aria-live/.test(text(file)), file).toBe(false)
    }
  })

  test('nothing in the editor sources mentions warnings in what is exported', () => {
    // The export path reads the store document only; it must not know the warnings.
    for (const file of ['/src/workflow/serialize.ts', '/src/workflow/canonicalJson.ts']) {
      expect(/getWarnings|useWarnings|lintWorkflow/.test(text(file)), file).toBe(false)
    }
  })
})

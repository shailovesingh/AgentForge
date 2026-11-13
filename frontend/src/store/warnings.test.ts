import { describe, expect, test } from 'vitest'
import type { Warning } from '../workflow/lint'
import type { Workflow, WorkflowNode } from '../workflow/types'
import { createEmptyWorkflow } from './editorStore'
import { NO_WARNINGS, getNodeWarnings, getWarnings, groupByNode, warningCountText, warningKeys } from './warnings'

const w = (nodeId: string, message: string): Warning => ({ code: 'result-unused', severity: 'warning', nodeId, message })

const llm = (id: string, prompt = ''): WorkflowNode => ({
  id,
  type: 'llm.prompt',
  typeVersion: 1,
  label: 'Ask ' + id,
  config: { provider: 'ollama', prompt },
  position: { x: 0, y: 0 },
})

/** Fresh workflow objects every time, so the cache is never hit by accident. */
const workflowOf = (...nodes: WorkflowNode[]): Workflow => ({ ...createEmptyWorkflow(), nodes })

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

describe('warningKeys', () => {
  test('are node:code:port-or-field, and stay unique even for identical warnings', () => {
    const a: Warning = { code: 'required-input-unconnected', severity: 'warning', nodeId: 'n1', port: 'input', message: 'x' }
    const b: Warning = { code: 'required-field-empty', severity: 'warning', nodeId: 'n1', field: 'prompt', message: 'y' }
    const c: Warning = { code: 'node-unreachable', severity: 'warning', nodeId: 'n2', message: 'z' }
    expect(warningKeys([a, b, c])).toEqual(['n1:required-input-unconnected:input', 'n1:required-field-empty:prompt', 'n2:node-unreachable:'])
    const keys = warningKeys([c, c, c])
    expect(keys).toEqual(['n2:node-unreachable:', 'n2:node-unreachable:#1', 'n2:node-unreachable:#2'])
    expect(new Set(keys).size).toBe(3)
  })
})

describe('getWarnings (one lint per workflow object)', () => {
  test('the same workflow object gives the very same result object', () => {
    const wf = workflowOf(llm('n1'))
    const first = getWarnings(wf)
    expect(getWarnings(wf)).toBe(first)
    expect(getWarnings(wf).warnings).toBe(first.warnings)
    expect(getWarnings(wf).byNode).toBe(first.byNode)
  })

  test('a real warning change gives a new result, and the old object keeps its own', () => {
    const wf = workflowOf(llm('n1'))
    const first = getWarnings(wf)
    const edited = workflowOf(llm('n1', 'Hi'))
    const second = getWarnings(edited)
    expect(second).not.toBe(first)
    expect(second.warnings).not.toBe(first.warnings)
    expect(first.warnings.map((x) => x.code)).toEqual(['required-field-empty', 'result-unused'])
    expect(second.warnings.map((x) => x.code)).toEqual(['result-unused'])
    expect(getWarnings(wf)).toBe(first)
  })

  test('groups the result by node and leaves the document untouched', () => {
    const wf = workflowOf(llm('n1'))
    const before = JSON.stringify(wf)
    const view = getWarnings(wf)
    expect(view.byNode.get('n1')).toEqual(view.warnings)
    expect(JSON.stringify(wf)).toBe(before)
    expect(before.includes('warning')).toBe(false)
  })
})

describe('stable identity (a drag frame or a name edit must not re-render anything)', () => {
  test('a position-only change returns the same view, the same arrays and the same per-node arrays', () => {
    const wf = workflowOf(llm('n1'), llm('n2', 'x'))
    const first = getWarnings(wf)
    const moved: Workflow = { ...wf, nodes: wf.nodes.map((n) => ({ ...n, position: { x: 99, y: 7 } })) }
    expect(moved).not.toBe(wf)
    const second = getWarnings(moved)
    expect(Object.is(second, first)).toBe(true)
    expect(Object.is(second.warnings, first.warnings)).toBe(true)
    expect(Object.is(second.byNode, first.byNode)).toBe(true)
    expect(Object.is(getNodeWarnings(moved, 'n1'), getNodeWarnings(wf, 'n1'))).toBe(true)
    expect(getNodeWarnings(moved, 'n1').length).toBeGreaterThan(0)
  })

  test('a name-only change returns the same view', () => {
    const wf = workflowOf(llm('n1'))
    const first = getWarnings(wf)
    const renamed: Workflow = { ...wf, name: 'Another name', description: 'changed' }
    expect(Object.is(getWarnings(renamed), first)).toBe(true)
  })

  test('a node keeps its own array when only ANOTHER node\'s warnings change', () => {
    const wf = workflowOf(llm('n1', 'filled'), llm('n2'))
    const first = getWarnings(wf)
    const n1 = getNodeWarnings(wf, 'n1')
    const n2 = getNodeWarnings(wf, 'n2')
    expect(n1.length).toBe(1)
    expect(n2.length).toBe(2)

    const edited = workflowOf(llm('n1', 'filled'), llm('n2', 'now filled'))
    const second = getWarnings(edited)
    expect(second).not.toBe(first)
    expect(second.warnings).not.toBe(first.warnings)
    expect(Object.is(getNodeWarnings(edited, 'n1'), n1)).toBe(true) // unchanged: same array
    expect(getNodeWarnings(edited, 'n2')).not.toBe(n2) // changed: a new array
    expect(getNodeWarnings(edited, 'n2').length).toBe(1)
  })

  test('an unknown id, a null id and a node without warnings share one frozen empty array', () => {
    const wf = workflowOf(llm('n1', 'x'))
    // n1 still has "result unused", so use ids that really have none
    expect(getNodeWarnings(wf, 'nope')).toBe(NO_WARNINGS)
    expect(getNodeWarnings(wf, null)).toBe(NO_WARNINGS)
    expect(getNodeWarnings(workflowOf(), 'n1')).toBe(NO_WARNINGS)
    expect(NO_WARNINGS.length).toBe(0)
    expect(Object.isFrozen(NO_WARNINGS)).toBe(true)
  })
})

describe('source-text guards', () => {
  const sources = import.meta.glob<string>('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
  const text = (file: string) => {
    const t = sources[file]
    expect(t, file).toBeTypeOf('string')
    return t
  }
  const isTest = (file: string) => /\.test\.tsx?$/.test(file)
  const reactImport = /from\s+['"]react(-dom)?(\/[^'"]*)?['"]/
  // The linter function itself (importing the Warning TYPE from workflow/lint is fine).
  const lintImport = /\blintWorkflow\b/

  test('lint.ts and the pure warning helpers import no React', () => {
    expect(reactImport.test(`import { useId } from 'react'`)).toBe(true) // self-test of the regex
    for (const file of ['/src/workflow/lint.ts', '/src/store/warnings.ts']) {
      expect(reactImport.test(text(file)), file).toBe(false)
    }
  })

  test('only store/warnings.ts runs the linter: no component lints on its own (once per workflow, not once per component)', () => {
    expect(lintImport.test(`import { lintWorkflow } from '../workflow/lint'`)).toBe(true) // self-test of the regex
    const components = Object.keys(sources).filter(
      (f) => !isTest(f) && /^\/src\/(nodes|app|config-panel)\//.test(f) && f.endsWith('.tsx'),
    )
    expect(components).toContain('/src/nodes/WorkflowNode.tsx') // the guard is not vacuous
    for (const file of components) expect(lintImport.test(text(file)), file).toBe(false)

    // Outside src/workflow, the one production importer of the linter is the shared cache.
    const importers = Object.keys(sources).filter((f) => !isTest(f) && !f.startsWith('/src/workflow/') && lintImport.test(text(f)))
    expect(importers).toEqual(['/src/store/warnings.ts'])
  })

  test('a node and the config panel subscribe to ONE node\'s warnings, not to the whole list (no re-render on every drag frame)', () => {
    for (const file of ['/src/nodes/WorkflowNode.tsx', '/src/config-panel/ConfigPanel.tsx']) {
      expect(/\buseNodeWarnings\(/.test(text(file)), file).toBe(true)
      expect(/\buseWarnings\(/.test(text(file)), file).toBe(false) // a call (the module is called useWarnings.ts too)
    }
    expect(/\buseWarnings\(/.test(text('/src/app/WarningsMenu.tsx'))).toBe(true) // the toolbar list needs the total
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

  test('the export path (serialize, canonicalJson and the toolbar that exports) does not know the warnings', () => {
    const warningApi = /getWarnings|getNodeWarnings|useWarnings|useNodeWarnings|lintWorkflow/
    expect(warningApi.test(`const x = getWarnings(workflow)`)).toBe(true) // self-test of the regex
    for (const file of ['/src/workflow/serialize.ts', '/src/workflow/canonicalJson.ts', '/src/app/Toolbar.tsx']) {
      expect(warningApi.test(text(file)), file).toBe(false)
    }
  })
})

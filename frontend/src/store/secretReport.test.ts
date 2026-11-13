import { describe, expect, test } from 'vitest'
import type { Workflow, WorkflowNode } from '../workflow/types'
import { createEmptyWorkflow } from './editorStore'
import { buildSecretReport, getSecretReport } from './secretReport'
import type { SecretReport } from './secretReport'

// The sentinel is built at run time from parts, so no token-shaped literal exists in this file (the repository-wide guard in
// fixtures.test.ts scans every source file, and the repository is pushed to GitHub, whose push protection rejects tokens).
const SENTINEL = ['s', 'k', '-'].join('') + ['QwErTyUi', 'OpAsDfGh', 'JkLzXcVb'].join('')
const PIECES = [SENTINEL, SENTINEL.slice(0, 8), SENTINEL.slice(-8)]

const node = (id: string, config: Record<string, unknown>, label = 'Node ' + id): WorkflowNode => ({
  id,
  type: 'http.request',
  typeVersion: 1,
  label,
  config,
  position: { x: 0, y: 0 },
})
const workflowOf = (nodes: WorkflowNode[], metadata: Record<string, unknown> = {}): Workflow => ({ ...createEmptyWorkflow(), nodes, metadata })

/** Every string AND every object key anywhere in a value (the report is plain data). */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out)
  else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      out.push(k)
      allStrings(v, out)
    }
  }
  return out
}

describe('buildSecretReport', () => {
  test('a header holding a token: one node, one path (two findings at it are listed once), no value', () => {
    const report = buildSecretReport(workflowOf([node('a', { headers: { Authorization: SENTINEL } }, 'Fetch')]))
    expect(report).toEqual({
      hasHigh: true,
      hasMedium: false,
      high: { nodes: [{ name: 'Fetch', paths: ['headers.Authorization'], omitted: 0 }], metadata: { paths: [], omitted: 0 } },
      counts: { high: 2, medium: 0 },
    } satisfies SecretReport)
  })

  test('no secret: nothing is reported', () => {
    const report = buildSecretReport(workflowOf([node('a', { url: 'https://example.com', headers: { Accept: 'text/plain' } })]))
    expect(report.hasHigh).toBe(false)
    expect(report.hasMedium).toBe(false)
    expect(report.high.nodes).toEqual([])
    expect(report.counts).toEqual({ high: 0, medium: 0 })
  })

  test('a medium-only workflow has no high finding and an empty dialog list', () => {
    const report = buildSecretReport(workflowOf([node('a', { token_count: '5' })]))
    expect(report.hasHigh).toBe(false)
    expect(report.hasMedium).toBe(true)
    expect(report.high.nodes).toEqual([])
    expect(report.high.metadata.paths).toEqual([])
    expect(report.counts).toEqual({ high: 0, medium: 1 })
  })

  test('a medium finding next to a high one in the same node is counted but not listed', () => {
    const report = buildSecretReport(workflowOf([node('a', { token_count: '5', headers: { Cookie: 'x' } })]))
    expect(report.hasHigh).toBe(true)
    expect(report.hasMedium).toBe(true)
    expect(report.high.nodes[0].paths).toEqual(['headers.Cookie'])
    expect(report.counts).toEqual({ high: 1, medium: 1 })
  })

  test('a metadata-only high finding counts (hasHigh) and is listed under metadata', () => {
    const report = buildSecretReport(workflowOf([node('a', {})], { note: SENTINEL }))
    expect(report.hasHigh).toBe(true)
    expect(report.high.nodes).toEqual([])
    expect(report.high.metadata).toEqual({ paths: ['note'], omitted: 0 })
  })

  test('nodes come in array order, with the paths of each in walk order', () => {
    const report = buildSecretReport(
      workflowOf([node('x', { headers: { Cookie: 'c' } }, 'First'), node('y', { n: 1 }), node('z', { a: SENTINEL, b: SENTINEL }, 'Third')]),
    )
    expect(report.high.nodes.map((n) => n.name)).toEqual(['First', 'Third'])
    expect(report.high.nodes[1].paths).toEqual(['a', 'b'])
  })

  test('a name is the label, else the id, through safeDisplayName: a credential-shaped label or id is redacted, a long one cut', () => {
    const long = 'L'.repeat(80)
    const report = buildSecretReport(
      workflowOf([
        node('plain-id', { h: SENTINEL }, ''),
        node(SENTINEL, { h: SENTINEL }, ''),
        node('b', { h: SENTINEL }, SENTINEL),
        node('c', { h: SENTINEL }, long),
      ]),
    )
    expect(report.high.nodes.map((n) => n.name)).toEqual(['plain-id', '[redacted name]', '[redacted name]', 'L'.repeat(60) + '...'])
  })

  test('the cap: 50 findings are kept per node, the rest is "omitted"; metadata too', () => {
    const many = (): Record<string, string> => Object.fromEntries(Array.from({ length: 60 }, (_, i) => ['k' + i, SENTINEL]))
    const report = buildSecretReport(workflowOf([node('a', many(), 'Big')], many()))
    expect(report.high.nodes[0].paths).toHaveLength(50)
    expect(report.high.nodes[0].omitted).toBe(10)
    expect(report.high.metadata.paths).toHaveLength(50)
    expect(report.high.metadata.omitted).toBe(10)
    expect(report.counts.high).toBe(100)
  })

  test('the sentinel, its first and last 8 characters appear in NO string and NO key of the report (every place it can be planted)', () => {
    const planted = workflowOf(
      [
        node('a', { headers: { Authorization: SENTINEL } }, 'Header'),
        node('b', { nested: { deeper: { value: SENTINEL } } }, 'Nested'),
        node('c', { list: ['ok', SENTINEL, { inner: SENTINEL }] }, 'Array'),
        node('d', { [SENTINEL]: 'as a key', plain: { [SENTINEL]: { x: 1 } } }, 'Key'),
        node('e', { h: SENTINEL }, SENTINEL), // in the label
        node(SENTINEL, { h: SENTINEL }, ''), // in the id (no label)
        node('f', { prompt: 'Use this: ' + SENTINEL + ' now, thanks' }, 'Prompt'),
        node('g', { ['password: ' + SENTINEL]: 'x', ['token=' + SENTINEL]: 'y' }, 'Typed into a key'),
      ],
      { meta: SENTINEL, [SENTINEL]: 'k', deep: [{ more: SENTINEL }] },
    )
    const report = buildSecretReport(planted)
    expect(report.hasHigh).toBe(true)
    expect(report.high.nodes.length).toBeGreaterThanOrEqual(8)
    const strings = allStrings(report)
    expect(strings.length).toBeGreaterThan(20) // the walk is not vacuous
    for (const piece of PIECES) {
      const hits = strings.filter((s) => s.includes(piece))
      expect(hits.length, `strings of the report that contain a ${piece.length}-character piece of the sentinel`).toBe(0)
    }
    // the walker really sees every string and key: a planted piece IS found if it is there (so the check above can fail)
    expect(allStrings({ [SENTINEL]: 1 }).some((s) => s.includes(SENTINEL.slice(0, 8)))).toBe(true)
    expect(allStrings({ a: [SENTINEL] }).some((s) => s.includes(SENTINEL.slice(-8)))).toBe(true)
  })
})

describe('getSecretReport (identity stays while nothing the report shows changes)', () => {
  test('the same workflow object gives the very same report', () => {
    const wf = workflowOf([node('a', { h: SENTINEL })])
    expect(getSecretReport(wf)).toBe(getSecretReport(wf))
  })

  test('a position change (a drag frame) and a name change give the same report object', () => {
    const wf = workflowOf([node('a', { h: SENTINEL }), node('b', { url: 'x' })])
    const first = getSecretReport(wf)
    const moved: Workflow = { ...wf, nodes: wf.nodes.map((n) => ({ ...n, position: { x: 50, y: 60 } })) }
    expect(getSecretReport(moved)).toBe(first)
    expect(getSecretReport({ ...moved, name: 'Renamed', description: 'changed' })).toBe(first)
  })

  test('a label edit that changes no name in the report gives the same report object', () => {
    const wf = workflowOf([node('a', { h: SENTINEL }), node('b', { url: 'x' })])
    const first = getSecretReport(wf)
    const relabelled: Workflow = { ...wf, nodes: wf.nodes.map((n) => (n.id === 'b' ? { ...n, label: 'Other' } : n)) }
    expect(getSecretReport(relabelled)).toBe(first)
  })

  test('a real change gives a new report, and the old one is untouched', () => {
    const wf = workflowOf([node('a', { h: SENTINEL }, 'One')])
    const first = getSecretReport(wf)
    const renamed: Workflow = { ...wf, nodes: [{ ...wf.nodes[0], label: 'Two' }] }
    const second = getSecretReport(renamed)
    expect(second).not.toBe(first)
    expect(first.high.nodes[0].name).toBe('One')
    expect(second.high.nodes[0].name).toBe('Two')
    const cleared: Workflow = { ...wf, nodes: [{ ...wf.nodes[0], config: { h: 'fine' } }] }
    expect(getSecretReport(cleared).hasHigh).toBe(false)
  })
})

describe('source-text guards for the secret UI', () => {
  const sources = import.meta.glob<string>('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
  const isTest = (file: string) => /\.test\.tsx?$/.test(file)
  const text = (file: string) => {
    const t = sources[file]
    expect(t, file).toBeTypeOf('string')
    return t
  }
  const ui = Object.keys(sources).filter((f) => !isTest(f) && /^\/src\/(app|nodes|config-panel|store)\//.test(f))
  const forbidden = /console\.|localStorage|sessionStorage|document\.cookie|dangerouslySetInnerHTML/

  test('no UI file logs, stores anything in the browser, or renders HTML', () => {
    expect(forbidden.test('console.log(1)')).toBe(true) // self-test of the regex
    expect(forbidden.test('window.localStorage')).toBe(true)
    expect(ui).toContain('/src/app/ConfirmDialog.tsx') // the guard is not vacuous
    expect(ui).toContain('/src/store/secretReport.ts')
    for (const file of ui) expect(forbidden.test(text(file)), file).toBe(false)
  })

  test('the dialog takes the report only: no Workflow type, no workflow import, no raw label or id', () => {
    const source = text('/src/app/ConfirmDialog.tsx')
    const props = /export interface ConfirmDialogProps \{([\s\S]*?)\n\}/.exec(source)
    expect(props, 'the props interface is found').not.toBeNull()
    expect(/\bWorkflow(Node)?\b/.test(props![1])).toBe(false)
    expect(/\bSecretReport\b/.test(props![1])).toBe(true)
    expect(/workflow\/|editorStore/.test(source)).toBe(false)
    expect(/\.(label|id)\b/.test(source)).toBe(false)
  })

  test('the toolbar subscribes to the boolean, not the whole report; the node and the panel read their own warnings', () => {
    expect(/\buseHasHighSecret\(/.test(text('/src/app/Toolbar.tsx'))).toBe(true)
    expect(/\buseSecretReport\(/.test(text('/src/app/Toolbar.tsx'))).toBe(false)
    for (const file of ['/src/nodes/WorkflowNode.tsx', '/src/config-panel/ConfigPanel.tsx']) {
      expect(/\b(useSecretReport|getSecretReport|scanSecrets|detectSecrets)\(/.test(text(file)), file).toBe(false)
    }
  })

  test('the secret indicator is a status text, not an alert or a live region', () => {
    for (const file of ['/src/app/ConfirmDialog.tsx', '/src/nodes/WorkflowNode.tsx']) {
      expect(/aria-live|role\s*=\s*["']?(alert|status)/.test(text(file)), file).toBe(false)
    }
    expect(text('/src/config-panel/ConfigPanel.tsx').includes('aria-live')).toBe(false) // its field errors keep their own role="alert"
    const toolbar = text('/src/app/Toolbar.tsx')
    expect(toolbar.includes('aria-live')).toBe(false)
    expect((toolbar.match(/role="alert"/g) ?? []).length).toBe(1) // only the pre-existing import/export error panel
  })
})

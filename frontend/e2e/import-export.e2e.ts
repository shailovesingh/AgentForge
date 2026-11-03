import { expect, test } from './fixtures.ts'

interface ExportedWorkflow {
  schemaVersion: string
  name: string
  nodes: { type: string; config: Record<string, unknown> }[]
  edges: unknown[]
}

test.describe('export', () => {
  test('exports a versioned workflow with the edited configuration', async ({ editor }) => {
    await editor.buildPipeline()
    await editor.page.getByLabel('Workflow name').fill('My Test Flow')

    await editor.node('llm.prompt').click({ position: { x: 30, y: 10 } })
    await editor.settings.getByLabel('Prompt', { exact: true }).fill('Summarize the input')
    await editor.node('trigger.manual').click({ position: { x: 30, y: 10 } })
    await editor.settings.getByLabel('Initial payload').fill('{"city":"Paris"}')

    const { filename, text } = await editor.exportWorkflow()
    const workflow = JSON.parse(text) as ExportedWorkflow

    expect(filename).toBe('my-test-flow.json')
    expect(workflow.schemaVersion).toBe('1.0')
    expect(workflow.nodes).toHaveLength(3)
    expect(workflow.edges).toHaveLength(2)
    expect(workflow.nodes.find((n) => n.type === 'llm.prompt')!.config.prompt).toBe('Summarize the input')
    expect(workflow.nodes.find((n) => n.type === 'trigger.manual')!.config.payload).toEqual({ city: 'Paris' })
  })

  test('writes the top-level keys in alphabetical order (export-json/1), schemaVersion last', async ({ editor }) => {
    await editor.buildPipeline()
    const { text } = await editor.exportWorkflow()
    const keys = Object.keys(JSON.parse(text) as object)
    expect(keys[0]).toBe('description')
    expect(keys[keys.length - 1]).toBe('schemaVersion')
    expect(keys).toEqual(['description', 'edges', 'id', 'metadata', 'name', 'nodes', 'schemaVersion'])
    expect(text.endsWith('}\n') && !text.endsWith('\n\n')).toBe(true)
    expect(text.includes('\r')).toBe(false)
  })

  test('refuses to export a name with a NUL character: error panel, no file', async ({ editor }) => {
    await editor.buildPipeline()
    const NUL = String.fromCharCode(0) // built at run time: a NUL cannot be stored in a source file
    await editor.page.getByLabel('Workflow name').fill('a' + NUL + 'b')

    let downloads = 0
    editor.page.on('download', () => downloads++)
    await editor.page.getByRole('button', { name: 'Export' }).click()

    const alert = editor.toolbar.getByRole('alert')
    await expect(alert.getByText('Export failed. No file was created.', { exact: true })).toBeVisible()
    await expect(alert.getByText('value.nul-character', { exact: true })).toBeVisible()
    await expect(alert.getByText('at /name', { exact: true })).toBeVisible()
    // A download would be reported shortly after the click; give it a moment, then require silence.
    await editor.page.waitForTimeout(1000)
    expect(downloads).toBe(0)
  })

  test('contains no React Flow fields', async ({ editor }) => {
    await editor.buildPipeline()
    const { text } = await editor.exportWorkflow()
    expect(text).not.toMatch(/"measured"|"selected"|"sourceHandle"|"handleBounds"/)
  })
})

test.describe('import', () => {
  test('restores the graph and name, and re-exports byte-identically', async ({ editor }) => {
    await editor.buildPipeline()
    await editor.page.getByLabel('Workflow name').fill('My Test Flow')
    const first = (await editor.exportWorkflow()).text

    await editor.page.reload()
    await expect(editor.libraryItems).toHaveCount(6) // the app has rendered again
    await expect(editor.nodes).toHaveCount(0) // a fresh load starts empty

    await editor.importText(first)
    await expect(editor.nodes).toHaveCount(3)
    await expect(editor.edges).toHaveCount(2)
    await expect(editor.page.getByLabel('Workflow name')).toHaveValue('My Test Flow')

    expect((await editor.exportWorkflow()).text).toBe(first)
  })

  test('imports a workflow whose node and edge ids match Object.prototype members', async ({ editor }) => {
    const workflow = {
      schemaVersion: '1.0',
      id: 'wf_proto',
      name: 'Prototype ids',
      description: '',
      nodes: [
        { id: 'constructor', type: 'trigger.manual', typeVersion: 1, label: 'Start', config: { payload: {} }, position: { x: 80, y: 120 } },
        { id: '__proto__', type: 'output.result', typeVersion: 1, label: 'Result', config: { format: 'text' }, position: { x: 420, y: 120 } },
      ],
      edges: [
        { id: 'toString', source: { nodeId: 'constructor', port: 'data' }, target: { nodeId: '__proto__', port: 'input' } },
      ],
      metadata: {},
    }

    await editor.importText(JSON.stringify(workflow))
    await expect(editor.nodes).toHaveCount(2)
    await expect(editor.nodes.first()).toBeVisible()
    await expect(editor.nodes.last()).toBeVisible()
    await expect(editor.edges).toHaveCount(1)

    const exported = JSON.parse((await editor.exportWorkflow()).text) as {
      nodes: { id: string }[]
      edges: { id: string }[]
    }
    expect(exported.nodes.map((n) => n.id)).toEqual(['constructor', '__proto__'])
    expect(exported.edges.map((e) => e.id)).toEqual(['toString'])
  })

  test('rejects malformed JSON and leaves the current graph untouched', async ({ editor }) => {
    await editor.buildPipeline()

    await editor.importText('{ not json')
    const alert = editor.toolbar.getByRole('alert')
    await expect(alert.getByText(/Not valid JSON/)).toBeVisible()
    const code = alert.getByText('doc.not-json', { exact: true })
    await expect(code).toBeVisible()
    await expect(alert.getByText('(whole document)', { exact: true })).toBeVisible()
    await expect(editor.nodes).toHaveCount(3)
  })

  test('rejects a duplicate key with its code and path and leaves the graph untouched', async ({ editor }) => {
    await editor.buildPipeline()
    const exported = (await editor.exportWorkflow()).text
    const withDuplicate = exported.replace('"metadata": {}', '"metadata": { "k": 1, "k": 2 }')
    expect(withDuplicate).not.toBe(exported)

    await editor.importText(withDuplicate)
    const alert = editor.toolbar.getByRole('alert')
    await expect(alert.getByText('doc.duplicate-key', { exact: true })).toBeVisible()
    await expect(alert.getByText('at /metadata/k', { exact: true })).toBeVisible()
    await expect(editor.nodes).toHaveCount(3)
    await expect(editor.edges).toHaveCount(2)
  })

  test('reports an unknown node type specifically and leaves the graph untouched', async ({ editor }) => {
    await editor.buildPipeline()
    const workflow = JSON.parse((await editor.exportWorkflow()).text) as ExportedWorkflow
    workflow.nodes[0].type = 'mystery.node'

    await editor.importText(JSON.stringify(workflow))
    const alert = editor.toolbar.getByRole('alert')
    await expect(alert.getByText(/unknown node type mystery\.node@1/)).toBeVisible()
    const code = alert.getByText('node.unknown-type', { exact: true })
    await expect(code).toBeVisible()
    await expect(alert.getByText('at /nodes/0/type', { exact: true })).toBeVisible()
    await expect(editor.nodes).toHaveCount(3)
    await expect(editor.edges).toHaveCount(2)
  })
})

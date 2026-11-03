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
    await expect(editor.nodes).toHaveCount(0) // a fresh load starts empty

    await editor.importText(first)
    await expect(editor.nodes).toHaveCount(3)
    await expect(editor.edges).toHaveCount(2)
    await expect(editor.page.getByLabel('Workflow name')).toHaveValue('My Test Flow')

    expect((await editor.exportWorkflow()).text).toBe(first)
  })

  test('rejects malformed JSON and leaves the current graph untouched', async ({ editor }) => {
    await editor.buildPipeline()

    await editor.importText('{ not json')
    await expect(editor.toolbar.getByRole('alert').getByText(/Not valid JSON/)).toBeVisible()
    await expect(editor.nodes).toHaveCount(3)
  })

  test('reports an unknown node type specifically and leaves the graph untouched', async ({ editor }) => {
    await editor.buildPipeline()
    const workflow = JSON.parse((await editor.exportWorkflow()).text) as ExportedWorkflow
    workflow.nodes[0].type = 'mystery.node'

    await editor.importText(JSON.stringify(workflow))
    await expect(editor.toolbar.getByRole('alert').getByText(/unknown node type mystery\.node@1/)).toBeVisible()
    await expect(editor.nodes).toHaveCount(3)
    await expect(editor.edges).toHaveCount(2)
  })
})

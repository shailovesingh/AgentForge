import { expect, test } from './fixtures.ts'

interface ExportedNode {
  type: string
  label: string
  config: Record<string, unknown>
}
const nodesOf = (text: string) => (JSON.parse(text) as { nodes: ExportedNode[] }).nodes

test.describe('config panel', () => {
  test('asks for a selection when nothing is selected', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200)
    await editor.clickEmptyCanvas()
    await expect(editor.page.getByText('Select a node to edit its settings.')).toBeVisible()
  })

  test('shows the selected node and edits its label', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200) // a new node is selected
    await expect(editor.settings.getByRole('heading', { name: 'LLM Prompt' })).toBeVisible()

    await editor.settings.getByLabel('Label').fill('Summarizer')
    await expect(editor.node('llm.prompt').getByText('Summarizer')).toBeVisible()
  })

  test('flags an invalid number and clears the error once it is valid', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200)
    const temperature = editor.settings.getByLabel('Temperature')

    await temperature.fill('5')
    await expect(editor.settings.getByRole('alert').getByText(/must be at most 2/)).toBeVisible()

    await temperature.fill('1.2')
    await expect(editor.settings.getByRole('alert')).toHaveCount(0)
  })

  test('flags invalid JSON and accepts valid JSON', async ({ editor }) => {
    await editor.drop('Manual Trigger', 100, 200)
    const payload = editor.settings.getByLabel('Initial payload')

    await payload.fill('{bad')
    await expect(editor.settings.getByRole('alert').getByText(/valid JSON/)).toBeVisible()

    await payload.fill('{"city":"Paris"}')
    await expect(editor.settings.getByRole('alert')).toHaveCount(0)
  })

  test('commits valid edits and never commits invalid input', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200)
    await editor.settings.getByLabel('Prompt', { exact: true }).fill('Summarize the input')
    await editor.settings.getByLabel('Provider').selectOption('openai')

    const temperature = editor.settings.getByLabel('Temperature')
    await temperature.fill('1.2')
    await temperature.fill('9') // invalid: flagged, and must not replace 1.2

    const llm = nodesOf((await editor.exportWorkflow()).text).find((n) => n.type === 'llm.prompt')!
    expect(llm.config.prompt).toBe('Summarize the input')
    expect(llm.config.provider).toBe('openai')
    expect(llm.config.temperature).toBe(1.2)
  })
})

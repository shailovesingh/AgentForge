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

  test('the provider select of an LLM Prompt node offers groq', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200)
    const options = editor.settings.getByLabel('Provider').locator('option')
    await expect(options).toHaveText(['ollama', 'openai', 'anthropic', 'groq'])
    await editor.settings.getByLabel('Provider').selectOption('groq')
    const llm = nodesOf((await editor.exportWorkflow()).text).find((n) => n.type === 'llm.prompt')!
    expect(llm.config.provider).toBe('groq')
  })

  test('a new LLM Prompt node starts with the default provider and temperature', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200)
    await expect(editor.settings.getByLabel('Provider')).toHaveValue('ollama')
    await expect(editor.settings.getByLabel('Temperature')).toHaveValue('0.7')
    // The displayed value alone could come from the browser showing the first option; the config must really hold it.
    const llm = nodesOf((await editor.exportWorkflow()).text).find((n) => n.type === 'llm.prompt')!
    expect(llm.config.provider).toBe('ollama')
    expect(llm.config.temperature).toBe(0.7)
  })

  test('an imported node without a provider shows "(not set)" and exports no provider until one is picked', async ({ editor }) => {
    const workflow = {
      schemaVersion: '1.0',
      id: 'wf_empty_config',
      name: 'Empty config',
      description: '',
      nodes: [{ id: 'l', type: 'llm.prompt', typeVersion: 1, label: 'LLM', config: {}, position: { x: 100, y: 100 } }],
      edges: [],
      metadata: {},
    }
    await editor.importText(JSON.stringify(workflow))
    await editor.node('llm.prompt').click({ position: { x: 30, y: 10 } })

    const provider = editor.settings.getByLabel('Provider')
    await expect(provider).toHaveValue('')
    await expect(provider.locator('option:checked')).toHaveText('(not set)')
    // The placeholder cannot be picked again, and the four real providers follow it.
    await expect(provider.locator('option')).toHaveText(['(not set)', 'ollama', 'openai', 'anthropic', 'groq'])
    await expect(provider.locator('option').first()).toBeDisabled()

    // Only viewing the node changed nothing: the config still has no provider.
    const before = nodesOf((await editor.exportWorkflow()).text).find((n) => n.type === 'llm.prompt')!
    expect(Object.hasOwn(before.config, 'provider')).toBe(false)

    // Picking ollama (the first real option) commits it; the placeholder disappears.
    await provider.selectOption('ollama')
    await expect(provider).toHaveValue('ollama')
    await expect(provider.locator('option')).toHaveText(['ollama', 'openai', 'anthropic', 'groq'])
    const after = nodesOf((await editor.exportWorkflow()).text).find((n) => n.type === 'llm.prompt')!
    expect(after.config.provider).toBe('ollama')
  })

  test('a multiline setting (System prompt) is still a textarea, with the rows the catalog asks for', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200)
    await expect(editor.settings.getByLabel('System prompt')).toHaveJSProperty('tagName', 'TEXTAREA')
    await expect(editor.settings.getByLabel('System prompt')).toHaveAttribute('rows', '4') // ui.rows from the catalog
    await expect(editor.settings.getByLabel('Model')).toHaveJSProperty('tagName', 'INPUT')
  })

  test('a JSON setting is a textarea with the default 5 rows (no ui.rows)', async ({ editor }) => {
    await editor.drop('Manual Trigger', 100, 200)
    await expect(editor.settings.getByLabel('Initial payload')).toHaveAttribute('rows', '5')
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

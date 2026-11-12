import { expect, test } from './fixtures.ts'
import type { Editor } from './editor.ts'

// Editor warnings (T7b): a badge on the node, a count and list in the toolbar, a section in the config panel.
// They are derived and never block anything. Counts below follow contracts/WARNINGS.md for the catalog.

const countButton = (editor: Editor) => editor.page.getByRole('button', { name: /^\d+ warnings?$/ })
const badge = (editor: Editor, type: string, name: string) => editor.node(type).getByRole('img', { name, exact: true })
const warningList = (editor: Editor) => editor.page.getByRole('list', { name: 'Editor warnings' })
const promptField = (editor: Editor) => editor.settings.getByLabel('Prompt', { exact: true })

function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf)
  if (typeof value === 'object' && value !== null) return Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)])
  return []
}

test.describe('node badge', () => {
  test('a new LLM Prompt node warns at once (empty prompt, unused result); filling the prompt clears one warning', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200)
    const two = badge(editor, 'llm.prompt', '2 warnings')
    await expect(two).toBeVisible()
    await expect(two).toHaveAttribute('title', /needs a value for "prompt"/)
    await expect(two).toHaveAttribute('title', /produces a result that no other node uses/)

    await promptField(editor).fill('Summarize the input')
    await expect(badge(editor, 'llm.prompt', '1 warning')).toBeVisible()
    await expect(two).toHaveCount(0)
  })

  test('connecting the result to an Output removes the last warning: no badge at all', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200)
    await promptField(editor).fill('Summarize the input')
    await editor.drop('Output', 700, 200)
    await expect(editor.node('output.result').getByRole('img')).toHaveCount(1) // its required input is unconnected
    await editor.connect({ node: editor.node('llm.prompt'), port: 'text' }, { node: editor.node('output.result'), port: 'input' })
    await expect(editor.edges).toHaveCount(1)
    await expect(editor.nodes.getByRole('img')).toHaveCount(0)
    await expect(countButton(editor)).toHaveCount(0)
  })
})

test.describe('toolbar count and list', () => {
  test('the count is the sum, and the list opens and closes with the button and with Escape', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200) // 2 warnings
    await editor.drop('Output', 700, 200) // 1 warning
    const button = countButton(editor)
    await expect(button).toHaveText('3 warnings')
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    await expect(warningList(editor)).toBeHidden()

    await button.click()
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    await expect(warningList(editor)).toBeVisible()
    await expect(warningList(editor).getByRole('button')).toHaveCount(3)
    const id = await button.getAttribute('aria-controls')
    expect(id).toBeTruthy()
    await expect(editor.page.locator(`ul[id="${id}"]`)).toHaveAttribute('aria-label', 'Editor warnings')

    await button.click()
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    await expect(warningList(editor)).toBeHidden()

    // Escape with focus inside the list closes it and puts focus back on the button.
    await button.click()
    await warningList(editor).getByRole('button').first().focus()
    await editor.page.keyboard.press('Escape')
    await expect(warningList(editor)).toBeHidden()
    await expect(button).toBeFocused()
  })

  test('activating an entry selects that node; the config panel shows its warnings', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200)
    await editor.drop('Output', 700, 200) // the last dropped node is selected
    await expect(editor.node('output.result')).toHaveClass(/\bselected\b/)

    await countButton(editor).click()
    await warningList(editor).getByRole('button', { name: /"LLM Prompt" needs a value for "prompt"/ }).click()

    await expect(editor.node('llm.prompt')).toHaveClass(/\bselected\b/)
    await expect(editor.node('output.result')).not.toHaveClass(/\bselected\b/)
    await expect(editor.settings.getByRole('heading', { name: 'LLM Prompt' })).toBeVisible()
    const section = editor.settings.getByRole('region', { name: 'Warnings for this node' })
    await expect(section.getByRole('heading', { name: 'Warnings for this node' })).toBeVisible()
    await expect(section.getByRole('listitem')).toHaveText([
      '"LLM Prompt" needs a value for "prompt".',
      '"LLM Prompt" produces a result that no other node uses.',
    ])
    // the list is non-modal: still open, nothing else opened
    await expect(warningList(editor)).toBeVisible()
    await expect(editor.page.getByRole('dialog')).toHaveCount(0)
  })

  test('the config panel has no warnings section for a node without warnings', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200)
    await promptField(editor).fill('x')
    await editor.drop('Output', 700, 200)
    await editor.connect({ node: editor.node('llm.prompt'), port: 'text' }, { node: editor.node('output.result'), port: 'input' })
    await editor.node('llm.prompt').click({ position: { x: 30, y: 10 } })
    await expect(editor.settings.getByRole('heading', { name: 'LLM Prompt' })).toBeVisible()
    await expect(editor.settings.getByRole('heading', { name: 'Warnings for this node' })).toHaveCount(0)
  })

  test('is keyboard operable: Tab reaches the button, Enter opens it, Tab reaches an entry, Enter selects the node', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200)
    await editor.drop('Output', 700, 200)
    await editor.page.getByLabel('Workflow name').focus()
    await editor.page.keyboard.press('Tab')
    const button = countButton(editor)
    await expect(button).toBeFocused()
    await editor.page.keyboard.press('Enter')
    await expect(button).toHaveAttribute('aria-expanded', 'true')

    await editor.page.keyboard.press('Tab')
    const first = warningList(editor).getByRole('button').first()
    await expect(first).toBeFocused() // list order: node array order, so the LLM Prompt warning
    await editor.page.keyboard.press('Enter')
    await expect(editor.node('llm.prompt')).toHaveClass(/\bselected\b/)
    await editor.page.keyboard.press('Escape')
    await expect(warningList(editor)).toBeHidden()
    await expect(button).toBeFocused()
  })
})

test.describe('an orphan chain', () => {
  test('warns, and the count follows each fix', async ({ editor }) => {
    await editor.drop('Manual Trigger', 100, 200)
    await editor.drop('LLM Prompt', 400, 200)
    await editor.drop('Output', 700, 200)
    // Trigger: not connected. LLM: empty prompt, unreachable, unused result. Output: unconnected required input.
    await expect(countButton(editor)).toHaveText('5 warnings')
    await countButton(editor).click()
    const list = warningList(editor)
    await expect(list.getByText('is a trigger but its output is not connected to anything.')).toBeVisible()
    await expect(list.getByText('"LLM Prompt" is not reachable from any trigger.')).toBeVisible()
    await expect(list.getByText('"Output" needs a connection on its "Result" input.')).toBeVisible()
    await countButton(editor).click()

    await editor.connect({ node: editor.node('trigger.manual'), port: 'data' }, { node: editor.node('llm.prompt'), port: 'input' })
    await expect(countButton(editor)).toHaveText('3 warnings') // trigger and unreachable fixed

    await editor.connect({ node: editor.node('llm.prompt'), port: 'text' }, { node: editor.node('output.result'), port: 'input' })
    await expect(countButton(editor)).toHaveText('1 warning') // only the empty prompt is left

    await editor.node('llm.prompt').click({ position: { x: 30, y: 10 } })
    await promptField(editor).fill('Summarize the input')
    await expect(countButton(editor)).toHaveCount(0)
    await expect(editor.nodes.getByRole('img')).toHaveCount(0)
  })
})

test.describe('warnings never get in the way', () => {
  test('no alert, live region or dialog appears because of warnings, and the status region stays empty', async ({ editor }) => {
    await editor.drop('Manual Trigger', 100, 200)
    await editor.drop('LLM Prompt', 400, 200)
    await expect(countButton(editor)).toBeVisible()
    await countButton(editor).click()
    await expect(warningList(editor)).toBeVisible()

    await expect(editor.page.locator('[role="alert"]')).toHaveCount(0)
    await expect(editor.toolbar.locator('[aria-live]')).toHaveCount(0)
    await expect(editor.nodes.locator('[aria-live]')).toHaveCount(0)
    await expect(editor.settings.locator('[aria-live]')).toHaveCount(0)
    await expect(editor.page.getByRole('dialog')).toHaveCount(0)
    await expect(editor.page.locator('dialog')).toHaveCount(0)
    await expect(editor.page.getByRole('status')).toHaveCount(1)
    await expect(editor.page.getByRole('status')).toBeEmpty()
  })

  test('typing keeps focus in the field while the warning appears and disappears', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200)
    const field = promptField(editor)
    await field.click()
    await expect(field).toBeFocused()
    await expect(badge(editor, 'llm.prompt', '2 warnings')).toBeVisible()

    await field.pressSequentially('abc')
    await expect(badge(editor, 'llm.prompt', '1 warning')).toBeVisible()
    await expect(field).toBeFocused()
    await expect(field).toHaveValue('abc')

    await field.fill('')
    await expect(badge(editor, 'llm.prompt', '2 warnings')).toBeVisible() // warning is back
    await expect(field).toBeFocused()
    await field.pressSequentially('x')
    await expect(field).toBeFocused()
    await expect(field).toHaveValue('x')
  })

  test('export and import still work with warnings; the file has no warning data', async ({ editor }) => {
    await editor.buildPipeline() // the LLM prompt is empty: a warning is present while connecting and exporting
    await expect(badge(editor, 'llm.prompt', '1 warning')).toBeVisible()

    const first = await editor.exportWorkflow()
    expect(first.text).not.toMatch(/warning/i)
    expect(keysOf(JSON.parse(first.text)).filter((k) => /warn/i.test(k))).toEqual([])
    expect((await editor.exportWorkflow()).text).toBe(first.text) // linting changed nothing in the document

    await editor.page.getByRole('button', { name: 'New' }).click()
    await expect(editor.nodes).toHaveCount(0)
    await expect(countButton(editor)).toHaveCount(0)
    await editor.importText(first.text)
    await expect(editor.nodes).toHaveCount(3)
    await expect(editor.edges).toHaveCount(2)
    await expect(badge(editor, 'llm.prompt', '1 warning')).toBeVisible()
    await expect(countButton(editor)).toHaveText('1 warning')
    expect((await editor.exportWorkflow()).text).toBe(first.text)
  })

  test('dragging a node and editing still work with warnings present', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200)
    await expect(badge(editor, 'llm.prompt', '2 warnings')).toBeVisible()
    const before = (await editor.node('llm.prompt').boundingBox())!
    await editor.page.mouse.move(before.x + 30, before.y + 15)
    await editor.page.mouse.down()
    await editor.page.mouse.move(before.x + 30 + 40, before.y + 15 + 120, { steps: 10 })
    await editor.page.mouse.up()
    const after = (await editor.node('llm.prompt').boundingBox())!
    expect(after.y - before.y).toBeGreaterThan(80)
    expect(after.x - before.x).toBeGreaterThan(20)

    await editor.settings.getByLabel('Label').fill('Ask')
    await expect(editor.node('llm.prompt').getByText('Ask', { exact: true })).toBeVisible()
    await expect(badge(editor, 'llm.prompt', '2 warnings')).toBeVisible()
  })

  test('every toolbar button stays enabled with warnings present', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200)
    await expect(countButton(editor)).toBeVisible()
    for (const name of ['New', 'Import', 'Export']) {
      await expect(editor.toolbar.getByRole('button', { name })).toBeEnabled()
    }
    await expect(countButton(editor)).toBeEnabled()
  })
})

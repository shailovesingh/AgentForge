import { expect, test } from './fixtures.ts'
import type { Editor } from './editor.ts'

// Editor warnings (T7b): a badge on the node, a count and list in the toolbar, a section in the config panel.
// They are derived and never block anything. Exact COUNTS follow the rule contract (contracts/WARNINGS.md); the message
// WORDING may be reworded freely, so tests match the node label plus nothing more specific than that.

const countText = (n: number) => `${n} warning${n === 1 ? '' : 's'}`
const countButton = (editor: Editor) => editor.page.getByRole('button', { name: /^\d+ warnings?$/ })
const warningList = (editor: Editor) => editor.page.getByRole('list', { name: 'Editor warnings' })
const promptField = (editor: Editor) => editor.settings.getByLabel('Prompt', { exact: true })
const selected = /\bselected\b/

/** The node's badge: its accessible name AND its visible number both say `n`. */
async function expectBadge(editor: Editor, type: string, n: number) {
  const badge = editor.node(type).getByRole('img', { name: countText(n), exact: true })
  await expect(badge).toBeVisible()
  await expect(badge).toHaveText(String(n))
  return badge
}

/** Changes a field's value without focusing it, like an edit that does not come from the keyboard focus. */
async function setValueWithoutFocus(field: ReturnType<typeof promptField>, value: string) {
  // The native setter (not the element's own, which React tracks) makes React see a real change.
  await field.evaluate((el, v) => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

function keysOf(value: unknown): string[] {
  return typeof value === 'object' && value !== null ? Object.keys(value).sort() : []
}

test.describe('node badge', () => {
  test('a new LLM Prompt node warns at once (empty prompt, unused result); filling the prompt clears one warning', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200)
    const two = await expectBadge(editor, 'llm.prompt', 2)
    const lines = ((await two.getAttribute('title')) ?? '').split('\n')
    expect(lines).toHaveLength(2) // one line per warning, each naming the node
    for (const line of lines) expect(line).toContain('LLM Prompt')

    await promptField(editor).fill('Summarize the input')
    await expectBadge(editor, 'llm.prompt', 1)
    await expect(editor.node('llm.prompt').getByRole('img', { name: countText(2), exact: true })).toHaveCount(0)
  })

  test('connecting the result to an Output removes the last warning: no badge at all', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200)
    await promptField(editor).fill('Summarize the input')
    await editor.drop('Output', 700, 200)
    await expectBadge(editor, 'output.result', 1) // its required input is unconnected
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
    await expect(button).toHaveText(countText(3))
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
    // closed: the list element is still the target of aria-controls, but it has no entries
    await expect(editor.page.locator(`ul[id="${id}"]`)).toHaveCount(1)
    await expect(editor.page.locator(`ul[id="${id}"] button`)).toHaveCount(0)

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
    await expect(editor.node('output.result')).toHaveClass(selected)

    await countButton(editor).click()
    await warningList(editor).getByRole('button', { name: /LLM Prompt/ }).first().click()

    await expect(editor.node('llm.prompt')).toHaveClass(selected)
    await expect(editor.node('output.result')).not.toHaveClass(selected)
    await expect(editor.settings.getByRole('heading', { name: 'LLM Prompt' })).toBeVisible()
    const section = editor.settings.getByRole('region', { name: 'Warnings for this node' })
    await expect(section.getByRole('heading', { name: 'Warnings for this node' })).toBeVisible()
    await expect(section.getByRole('listitem')).toHaveCount(2)
    for (const item of await section.getByRole('listitem').all()) await expect(item).toContainText('LLM Prompt')
    // the list is non-modal: still open, nothing else opened
    await expect(warningList(editor)).toBeVisible()
    await expect(editor.page.getByRole('dialog')).toHaveCount(0)
  })

  test('activating a NON-first entry selects THAT node, and the config panel shows that node\'s warnings only', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200)
    await editor.drop('Output', 700, 200)
    await editor.node('llm.prompt').click({ position: { x: 30, y: 10 } }) // select the node of the FIRST entries
    await expect(editor.node('llm.prompt')).toHaveClass(selected)

    await countButton(editor).click()
    const entry = warningList(editor).getByRole('button', { name: /\bOutput\b/ }) // the last entry
    await expect(entry).toHaveCount(1)
    await entry.click()

    await expect(editor.node('output.result')).toHaveClass(selected)
    await expect(editor.node('llm.prompt')).not.toHaveClass(selected)
    await expect(editor.settings.getByRole('heading', { name: 'Output', exact: true })).toBeVisible()
    const section = editor.settings.getByRole('region', { name: 'Warnings for this node' })
    await expect(section.getByRole('listitem')).toHaveCount(1)
    await expect(section).toContainText('Output')
    await expect(section).not.toContainText('LLM Prompt')
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
    await expect(first).toBeFocused() // list order: node array order, so an LLM Prompt warning
    await editor.page.keyboard.press('Enter')
    await expect(editor.node('llm.prompt')).toHaveClass(selected)
    await editor.page.keyboard.press('Escape')
    await expect(warningList(editor)).toBeHidden()
    await expect(button).toBeFocused()
  })

  test('the list is collapsed again when warnings come back after the count reached zero', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200)
    await editor.drop('Output', 700, 200)
    await countButton(editor).click()
    await expect(countButton(editor)).toHaveAttribute('aria-expanded', 'true')

    // fix everything while the list is open: the button (and with it the list) goes away
    await editor.node('llm.prompt').click({ position: { x: 30, y: 10 } })
    await promptField(editor).fill('Summarize the input')
    await editor.connect({ node: editor.node('llm.prompt'), port: 'text' }, { node: editor.node('output.result'), port: 'input' })
    await expect(countButton(editor)).toHaveCount(0)

    // a new warning: the button is back and the list is NOT open
    await editor.drop('LLM Prompt', 400, 450)
    await expect(countButton(editor)).toBeVisible()
    await expect(countButton(editor)).toHaveAttribute('aria-expanded', 'false')
    await expect(warningList(editor)).toBeHidden()
  })

  test('Delete and Backspace inside the list do not reach the canvas: the selected node stays', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200)
    await editor.drop('Output', 700, 200)
    await countButton(editor).click()
    await warningList(editor).getByRole('button', { name: /\bOutput\b/ }).click() // Output is selected, focus is on the entry
    await expect(editor.node('output.result')).toHaveClass(selected)

    await editor.page.keyboard.press('Delete')
    await editor.page.keyboard.press('Backspace')
    await expect(editor.nodes).toHaveCount(2)
    await expect(editor.node('output.result')).toHaveClass(selected)
    await expect(warningList(editor).getByRole('button', { name: /\bOutput\b/ })).toBeFocused()

    // the same key on the canvas still deletes (the guard is not a general block)
    await editor.node('output.result').click({ position: { x: 30, y: 10 } })
    await editor.page.keyboard.press('Delete')
    await expect(editor.nodes).toHaveCount(1)
  })

  test('when the focused entry is fixed, focus moves to the toggle button instead of falling to the page', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200) // entries: empty prompt, unused result
    await countButton(editor).click()
    const entries = warningList(editor).getByRole('button')
    await expect(entries).toHaveCount(2)
    await entries.first().focus() // the empty-prompt entry
    await expect(entries.first()).toBeFocused()

    await setValueWithoutFocus(promptField(editor), 'Summarize the input') // fixes it; the entry disappears
    await expect(entries).toHaveCount(1)
    await expect(countButton(editor)).toBeFocused()
    await expect(countButton(editor)).toHaveAttribute('aria-expanded', 'true')
  })

  test('focus is NOT moved when it is somewhere else and an entry disappears', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200)
    await countButton(editor).click()
    await warningList(editor).getByRole('button').first().focus()
    const field = promptField(editor)
    await field.focus() // the user moved on to the field
    await field.pressSequentially('abc')
    await expect(warningList(editor).getByRole('button')).toHaveCount(1)
    await expect(field).toBeFocused()
  })
})

test.describe('an orphan chain', () => {
  test('warns, and the count follows each fix', async ({ editor }) => {
    await editor.drop('Manual Trigger', 100, 200)
    await editor.drop('LLM Prompt', 400, 200)
    await editor.drop('Output', 700, 200)
    // Trigger: not connected. LLM: empty prompt, unreachable, unused result. Output: unconnected required input.
    await expect(countButton(editor)).toHaveText(countText(5))
    await countButton(editor).click()
    const list = warningList(editor)
    await expect(list.getByRole('button', { name: /Manual Trigger/ })).toHaveCount(1)
    await expect(list.getByRole('button', { name: /LLM Prompt/ })).toHaveCount(3)
    await expect(list.getByRole('button', { name: /\bOutput\b/ })).toHaveCount(1)
    await countButton(editor).click()

    await editor.connect({ node: editor.node('trigger.manual'), port: 'data' }, { node: editor.node('llm.prompt'), port: 'input' })
    await expect(countButton(editor)).toHaveText(countText(3)) // trigger and unreachable fixed

    await editor.connect({ node: editor.node('llm.prompt'), port: 'text' }, { node: editor.node('output.result'), port: 'input' })
    await expect(countButton(editor)).toHaveText(countText(1)) // only the empty prompt is left

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
    await expectBadge(editor, 'llm.prompt', 2)

    await field.pressSequentially('abc')
    await expectBadge(editor, 'llm.prompt', 1)
    await expect(field).toBeFocused()
    await expect(field).toHaveValue('abc')

    await field.fill('')
    await expectBadge(editor, 'llm.prompt', 2) // warning is back
    await expect(field).toBeFocused()
    await field.pressSequentially('x')
    await expect(field).toBeFocused()
    await expect(field).toHaveValue('x')
  })

  test('export and import still work with warnings; the file has no warning data', async ({ editor }) => {
    await editor.buildPipeline() // the LLM prompt is empty: a warning is present while connecting and exporting
    await expectBadge(editor, 'llm.prompt', 1)

    const first = await editor.exportWorkflow()
    const doc = JSON.parse(first.text) as {
      metadata: unknown
      nodes: unknown[]
      edges: unknown[]
    }
    // The document is exactly the workflow: no extra keys at any level, nothing in metadata.
    expect(doc.metadata).toEqual({})
    expect(keysOf(doc)).toEqual(['description', 'edges', 'id', 'metadata', 'name', 'nodes', 'schemaVersion'])
    expect(doc.nodes).toHaveLength(3)
    for (const node of doc.nodes) expect(keysOf(node)).toEqual(['config', 'id', 'label', 'position', 'type', 'typeVersion'])
    expect(doc.edges).toHaveLength(2)
    for (const edge of doc.edges) expect(keysOf(edge)).toEqual(['id', 'source', 'target'])
    expect((await editor.exportWorkflow()).text).toBe(first.text) // linting changed nothing in the document

    await editor.page.getByRole('button', { name: 'New' }).click()
    await expect(editor.nodes).toHaveCount(0)
    await expect(countButton(editor)).toHaveCount(0)
    await editor.importText(first.text)
    await expect(editor.nodes).toHaveCount(3)
    await expect(editor.edges).toHaveCount(2)
    await expectBadge(editor, 'llm.prompt', 1)
    await expect(countButton(editor)).toHaveText(countText(1))
    expect((await editor.exportWorkflow()).text).toBe(first.text)
  })

  test('dragging a node and editing still work with warnings present', async ({ editor }) => {
    await editor.drop('LLM Prompt', 400, 200)
    await expectBadge(editor, 'llm.prompt', 2)
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
    await expectBadge(editor, 'llm.prompt', 2)
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

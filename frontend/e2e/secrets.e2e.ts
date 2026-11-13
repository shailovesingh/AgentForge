import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'
import type { Editor } from './editor.ts'

// Secret warnings and the export confirmation (T9b, D-023, contracts/SECRETS.md). The detector is covered by unit tests and
// fixtures; these tests check what a person SEES and DOES: the prominent indicators, the dialog on every export, the focus
// behaviour, that nothing is blocked, and that the secret value is never echoed.

// The sentinel token is built at RUN TIME from parts (an `sk` shape: the prefix, a hyphen and 24 random hex characters), so no
// token-shaped literal exists in any source file: the repository-wide guard in fixtures.test.ts scans this folder too, and
// GitHub push protection rejects token-shaped literals.
const makeSentinel = (): string => ['s', 'k'].join('') + '-' + randomBytes(12).toString('hex')
const piecesOf = (s: string): string[] => [s, s.slice(0, 8), s.slice(-8)]

// The page is read inside page.evaluate. This project's e2e type setup has no DOM types, so the few members used are declared.
interface PageElement {
  tagName: string
  value?: unknown
  getAttributeNames(): string[]
  getAttribute(name: string): string | null
}
declare const document: {
  body: { innerText: string }
  title: string
  activeElement: unknown
  querySelectorAll(selector: string): ArrayLike<PageElement>
}

const exportButton = (editor: Editor) => editor.page.getByRole('button', { name: 'Export', exact: true })
const dialogOf = (editor: Editor) => editor.page.getByRole('dialog')
const headersField = (editor: Editor) => editor.settings.getByLabel('Headers', { exact: true })
const INDICATOR = 'Possible credential in this workflow'

/** Console messages and uncaught page errors, all kinds, for the whole test. */
function watchConsole(page: Page): string[] {
  const seen: string[] = []
  page.on('console', (message) => seen.push(message.text()))
  page.on('pageerror', (error) => seen.push(String(error)))
  return seen
}

/** Counts downloads from now on. */
function countDownloads(page: Page): () => number {
  let n = 0
  page.on('download', () => n++)
  return () => n
}

/** Adds an HTTP Request node (it becomes the selected node) and types a credential into its Headers field. */
async function plantHeader(editor: Editor, sentinel: string) {
  await editor.libraryItem('HTTP Request').click()
  await headersField(editor).fill(JSON.stringify({ Authorization: sentinel }))
  await expect(editor.toolbar.getByText(INDICATOR)).toBeVisible()
}

/**
 * Where the pieces of the sentinel appear in the page, as short descriptions that never contain the value: the visible text,
 * the title, every attribute NAME and VALUE of every element, and the value of every form control. The one element left out is
 * the field the user typed it into (its id is given): its value is the user's own input.
 */
async function leaksIn(page: Page, pieces: string[], skipId: string | null): Promise<string[]> {
  return page.evaluate(
    ({ pieces, skipId }) => {
      const found: string[] = []
      const has = (text: string) => pieces.some((p) => text.includes(p))
      if (has(document.body.innerText)) found.push('visible text')
      if (has(document.title)) found.push('title')
      for (const el of Array.from(document.querySelectorAll('*'))) {
        const tag = el.tagName.toLowerCase()
        if (skipId !== null && el.getAttribute('id') === skipId) continue
        for (const name of el.getAttributeNames()) {
          if (has(name) || has(el.getAttribute(name) ?? '')) found.push(`attribute ${name} of ${tag}`)
        }
        if (typeof el.value === 'string' && has(el.value)) found.push(`value of ${tag}`)
      }
      return found
    },
    { pieces, skipId },
  )
}

test.describe('prominent indicators for a possible credential', () => {
  test('a pasted credential gives the prominent node badge, the toolbar text and the config panel notice; a plain warning stays muted', async ({ editor }) => {
    const sentinel = makeSentinel()
    await editor.libraryItem('HTTP Request').click()
    const node = editor.node('http.request')
    // before: an ordinary (muted) badge, no indicator, no notice
    await expect(node.getByRole('img', { name: /^\d+ warnings?$/ })).toBeVisible()
    await expect(node.locator('[data-secret-likely]')).toHaveCount(0)
    await expect(editor.toolbar.getByText(INDICATOR)).toHaveCount(0)
    await expect(editor.settings.getByRole('region', { name: 'Possible credential in this node' })).toHaveCount(0)

    await headersField(editor).fill(JSON.stringify({ Authorization: sentinel }))

    const badge = node.locator('[data-secret-likely]')
    await expect(badge).toBeVisible()
    await expect(badge).toHaveAttribute('aria-label', /^\d+ warnings?, possible credential$/)
    await expect(node.getByRole('img', { name: /possible credential/ })).toHaveCount(1)
    await expect(node.getByRole('img', { name: /^\d+ warnings?$/ })).toHaveCount(0) // the muted kind is gone: one badge, the prominent one
    await expect(editor.toolbar.getByText(INDICATOR)).toBeVisible()
    const notice = editor.settings.getByRole('region', { name: 'Possible credential in this node' })
    await expect(notice).toBeVisible()
    await expect(notice.getByText('headers.Authorization', { exact: true })).toBeVisible()
    await expect(notice).toContainText('not available yet')

    // removing the value takes every indicator away again
    await headersField(editor).fill('{}')
    await expect(node.locator('[data-secret-likely]')).toHaveCount(0)
    await expect(editor.toolbar.getByText(INDICATOR)).toHaveCount(0)
    await expect(editor.settings.getByRole('region', { name: 'Possible credential in this node' })).toHaveCount(0)
  })

  test('the indicator is a status text only: no alert, no live region, no dialog, and the existing status region stays empty', async ({ editor }) => {
    await plantHeader(editor, makeSentinel())
    const indicator = editor.toolbar.locator('[data-secret-indicator]')
    await expect(indicator).toHaveText(INDICATOR)
    await expect(indicator).not.toHaveAttribute('role', /.*/)
    await expect(indicator).not.toHaveAttribute('aria-live', /.*/)

    await expect(editor.page.locator('[role="alert"]')).toHaveCount(0)
    // (React Flow has its own live region for canvas help: only the parts this task touches are checked, like warnings.e2e.ts)
    await expect(editor.toolbar.locator('[aria-live]')).toHaveCount(0)
    await expect(editor.nodes.locator('[aria-live]')).toHaveCount(0)
    await expect(editor.settings.locator('[aria-live]')).toHaveCount(0)
    await expect(editor.page.locator('dialog')).toHaveCount(0) // nothing opens by itself
    await expect(editor.page.getByRole('status')).toHaveCount(1) // the pre-existing upgrade-banner region only
    await expect(editor.page.getByRole('status')).toBeEmpty()
  })

  test('a medium-only workflow (token_count) keeps the muted warning: no indicator, no prominent badge, no dialog, Export downloads at once', async ({ editor }) => {
    await editor.libraryItem('HTTP Request').click()
    await headersField(editor).fill(JSON.stringify({ token_count: '5' }))
    const node = editor.node('http.request')
    const badge = node.getByRole('img', { name: /^\d+ warnings?$/ })
    await expect(badge).toBeVisible()
    await expect(badge).toHaveAttribute('title', /token_count/) // the muted secret-suspected warning is there
    await expect(node.locator('[data-secret-likely]')).toHaveCount(0)
    await expect(editor.toolbar.getByText(INDICATOR)).toHaveCount(0)
    await expect(editor.settings.getByRole('region', { name: 'Possible credential in this node' })).toHaveCount(0)

    const { text } = await editor.exportWorkflow() // waits for the download: it only resolves if there is no dialog in the way
    expect(text).toContain('token_count')
    await expect(editor.page.locator('dialog')).toHaveCount(0)
  })
})

test.describe('export confirmation', () => {
  test('Export opens a modal dialog with the node and path, focus on Cancel; Cancel creates no file and focus returns to Export', async ({ editor }) => {
    const sentinel = makeSentinel()
    const downloads = countDownloads(editor.page)
    await plantHeader(editor, sentinel)

    await exportButton(editor).click()
    const dialog = dialogOf(editor)
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAccessibleName(/possible credential/i)
    await expect(dialog).toHaveAccessibleDescription(/Anyone who obtains the exported file can use it/)
    await expect(dialog).toContainText('shared, committed or stored')
    await expect(dialog).toContainText('HTTP Request')
    await expect(dialog.getByText('headers.Authorization', { exact: true })).toBeVisible()
    await expect(dialog).toContainText('are not available yet')
    await expect(dialog).toContainText('keep the secret out of the file')
    expect(await dialog.evaluate((d: { matches(selector: string): boolean }) => d.matches(':modal'))).toBe(true)
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused() // the safe choice is the default
    await expect(dialog.getByRole('button', { name: 'Export anyway' })).toBeVisible()
    expect(await dialog.innerText()).not.toContain(sentinel)
    expect(await dialog.innerText()).not.toMatch(/don.t ask again|remember/i)

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(editor.page.locator('dialog')).toHaveCount(0)
    await expect(exportButton(editor)).toBeFocused()
    await editor.page.waitForTimeout(1000) // a download would be reported shortly after the click; give it a moment, then require silence
    expect(downloads()).toBe(0)
  })

  test('nothing is remembered: the second export asks again; Escape cancels without a file and returns focus to Export', async ({ editor }) => {
    const downloads = countDownloads(editor.page)
    await plantHeader(editor, makeSentinel())

    await exportButton(editor).click()
    await expect(dialogOf(editor)).toBeVisible()
    await dialogOf(editor).getByRole('button', { name: 'Cancel' }).click()
    await expect(editor.page.locator('dialog')).toHaveCount(0)

    await exportButton(editor).click() // again
    await expect(dialogOf(editor)).toBeVisible()
    await expect(dialogOf(editor).getByRole('button', { name: 'Cancel' })).toBeFocused()
    await editor.page.keyboard.press('Escape')
    await expect(editor.page.locator('dialog')).toHaveCount(0)
    await expect(exportButton(editor)).toBeFocused()

    await exportButton(editor).click() // and a third time
    await expect(dialogOf(editor)).toBeVisible()
    await dialogOf(editor).getByRole('button', { name: 'Cancel' }).click()

    await editor.page.waitForTimeout(1000)
    expect(downloads()).toBe(0)
  })

  test('after one confirmed export the next export asks again', async ({ editor }) => {
    await plantHeader(editor, makeSentinel())
    await exportButton(editor).click()
    await Promise.all([editor.page.waitForEvent('download'), dialogOf(editor).getByRole('button', { name: 'Export anyway' }).click()])
    await expect(editor.page.locator('dialog')).toHaveCount(0)
    await expect(exportButton(editor)).toBeFocused()
    await exportButton(editor).click()
    await expect(dialogOf(editor)).toBeVisible()
    await dialogOf(editor).getByRole('button', { name: 'Cancel' }).click()
  })

  test('focus stays inside while open: Tab and Shift+Tab many times never leave the dialog', async ({ editor }) => {
    await plantHeader(editor, makeSentinel())
    await exportButton(editor).click()
    const dialog = dialogOf(editor)
    await expect(dialog).toBeVisible()
    const inside = () => dialog.evaluate((d: { contains(node: unknown): boolean }) => d.contains(document.activeElement))

    for (let i = 0; i < 12; i++) {
      await editor.page.keyboard.press('Tab')
      expect(await inside(), `after Tab ${i + 1}`).toBe(true)
    }
    for (let i = 0; i < 12; i++) {
      await editor.page.keyboard.press('Shift+Tab')
      expect(await inside(), `after Shift+Tab ${i + 1}`).toBe(true)
    }
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('keyboard only: Enter on Export opens it, Tab reaches Export anyway, Enter gives exactly one download', async ({ editor }) => {
    const downloads = countDownloads(editor.page)
    await plantHeader(editor, makeSentinel())
    await exportButton(editor).focus()
    await editor.page.keyboard.press('Enter')
    const dialog = dialogOf(editor)
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
    await editor.page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Export anyway' })).toBeFocused()
    await Promise.all([editor.page.waitForEvent('download'), editor.page.keyboard.press('Enter')])
    await expect(editor.page.locator('dialog')).toHaveCount(0)
    await editor.page.waitForTimeout(1000)
    expect(downloads()).toBe(1)
  })

  test('Export anyway runs the normal export: the file holds the credential (the user\'s explicit choice)', async ({ editor }) => {
    const sentinel = makeSentinel()
    await plantHeader(editor, sentinel)
    await exportButton(editor).click()
    const [download] = await Promise.all([
      editor.page.waitForEvent('download'),
      dialogOf(editor).getByRole('button', { name: 'Export anyway' }).click(),
    ])
    const text = readFileSync(await download.path(), 'utf8')
    // The file DOES contain the secret: the person was warned, read the dialog and confirmed. Export is never blocked (D-023).
    expect(text).toContain(sentinel)
    const doc = JSON.parse(text) as { nodes: { config: { headers: Record<string, string> } }[] }
    expect(doc.nodes[0].config.headers.Authorization).toBe(sentinel)
  })

  test('if the export itself fails, the normal error panel appears after the confirmation (and no file)', async ({ editor }) => {
    const downloads = countDownloads(editor.page)
    await plantHeader(editor, makeSentinel())
    const NUL = String.fromCharCode(0) // built at run time: a NUL cannot be stored in a source file
    await editor.page.getByLabel('Workflow name').fill('a' + NUL + 'b')

    await exportButton(editor).click()
    await expect(dialogOf(editor)).toBeVisible()
    await dialogOf(editor).getByRole('button', { name: 'Export anyway' }).click()
    const alert = editor.toolbar.getByRole('alert')
    await expect(alert.getByText('Export failed. No file was created.', { exact: true })).toBeVisible()
    await expect(alert.getByText('value.nul-character', { exact: true })).toBeVisible()
    await editor.page.waitForTimeout(1000)
    expect(downloads()).toBe(0)
  })

  test('a workflow without a credential exports at once: no dialog, no extra step', async ({ editor }) => {
    await editor.buildPipeline()
    await expect(editor.toolbar.getByText(INDICATOR)).toHaveCount(0)
    const { filename } = await editor.exportWorkflow()
    expect(filename).toMatch(/\.json$/)
    await expect(editor.page.locator('dialog')).toHaveCount(0)
  })
})

test.describe('never echo the value', () => {
  test('the sentinel appears nowhere in the page, its attributes or the console (except the field it was typed into)', async ({ editor }) => {
    const sentinel = makeSentinel()
    const pieces = piecesOf(sentinel)
    const messages = watchConsole(editor.page)
    await plantHeader(editor, sentinel)
    const skipId = await headersField(editor).getAttribute('id')
    expect(skipId).toBeTruthy()

    // 1. planted: badge, toolbar indicator and config panel notice are showing
    expect(await leaksIn(editor.page, pieces, skipId)).toEqual([])
    // 2. the dialog is open
    await exportButton(editor).click()
    await expect(dialogOf(editor)).toBeVisible()
    expect(await leaksIn(editor.page, pieces, skipId)).toEqual([])
    // 3. cancelled; then the warning list is open too
    await dialogOf(editor).getByRole('button', { name: 'Cancel' }).click()
    await editor.page.getByRole('button', { name: /^\d+ warnings?$/ }).click()
    expect(await leaksIn(editor.page, pieces, skipId)).toEqual([])
    // 4. confirmed: the export ran (the file has the value, the page does not)
    await editor.page.getByRole('button', { name: /^\d+ warnings?$/ }).click()
    await exportButton(editor).click()
    await Promise.all([editor.page.waitForEvent('download'), dialogOf(editor).getByRole('button', { name: 'Export anyway' }).click()])
    expect(await leaksIn(editor.page, pieces, skipId)).toEqual([])

    // the field it was typed into really holds it (so the exclusion is a real one), and the console never saw it
    await expect(headersField(editor)).toHaveValue(new RegExp(sentinel))
    for (const piece of pieces) expect(messages.filter((m) => m.includes(piece)).length, `console messages with a ${piece.length}-character piece`).toBe(0)
  })

  test('the scan itself works: it FAILS if the sentinel is planted anywhere except the excluded field (toolbar name input)', async ({ editor }) => {
    const sentinel = makeSentinel()
    const pieces = piecesOf(sentinel)
    await plantHeader(editor, sentinel)
    const skipId = await headersField(editor).getAttribute('id')
    expect(await leaksIn(editor.page, pieces, skipId)).toEqual([])

    // mutation: the user's value ends up in the workflow NAME input, which is not the excluded field
    await editor.page.getByLabel('Workflow name').fill(sentinel)
    const leaks = await leaksIn(editor.page, pieces, skipId)
    expect(leaks).toContain('value of input')
    // and without the exclusion the typed-into field is itself reported (the exclusion is that narrow and no wider)
    await editor.page.getByLabel('Workflow name').fill('Clean name')
    expect(await leaksIn(editor.page, pieces, skipId)).toEqual([])
    expect(await leaksIn(editor.page, pieces, null)).toContain('value of textarea')
  })
})

test.describe('import, nothing blocked', () => {
  const fileWith = (overrides: object): string =>
    JSON.stringify(
      {
        schemaVersion: '1.0',
        id: 'wf_secret',
        name: 'Imported',
        description: '',
        nodes: [{ id: 'n1', type: 'trigger.manual', typeVersion: 1, label: 'Start', config: { payload: {} }, position: { x: 80, y: 120 } }],
        edges: [],
        metadata: {},
        ...overrides,
      },
      null,
      2,
    ) + '\n'

  test('a credential in metadata: the toolbar indicator, a dialog on Export that lists the metadata path, no value anywhere', async ({ editor }) => {
    const sentinel = makeSentinel()
    const pieces = piecesOf(sentinel)
    const messages = watchConsole(editor.page)
    const downloads = countDownloads(editor.page)
    const dir = mkdtempSync(join(tmpdir(), 'agentforge-e2e-'))
    try {
      const file = join(dir, 'with-metadata-secret.json')
      writeFileSync(file, fileWith({ metadata: { notes: { reference: sentinel } } }))
      await editor.page.getByLabel('Import workflow file').setInputFiles(file)

      await expect(editor.nodes).toHaveCount(1) // imported normally
      await expect(editor.toolbar.getByText(INDICATOR)).toBeVisible()
      await expect(editor.page.locator('[data-secret-likely]')).toHaveCount(0) // metadata has no node: no node badge
      await expect(editor.page.locator('dialog')).toHaveCount(0) // import opens nothing

      await exportButton(editor).click()
      const dialog = dialogOf(editor)
      await expect(dialog).toBeVisible()
      await expect(dialog).toContainText('Workflow metadata')
      await expect(dialog.getByText('notes.reference', { exact: true })).toBeVisible()
      expect(await leaksIn(editor.page, pieces, null)).toEqual([])
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await editor.page.waitForTimeout(1000)
      expect(downloads()).toBe(0)
      expect(await leaksIn(editor.page, pieces, null)).toEqual([])
      for (const piece of pieces) expect(messages.filter((m) => m.includes(piece)).length).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a file with a credential in a node imports without any dialog, and nothing is blocked (editing, dragging, connecting, buttons)', async ({ editor }) => {
    const sentinel = makeSentinel()
    const http = { id: 'h1', type: 'http.request', typeVersion: 1, label: 'Fetch', config: { method: 'GET', url: 'https://example.com', headers: { Authorization: sentinel }, body: '' }, position: { x: 300, y: 120 } }
    await editor.importText(fileWith({ nodes: [http] }))

    await expect(editor.nodes).toHaveCount(1)
    await expect(editor.toolbar.getByText(INDICATOR)).toBeVisible()
    await expect(editor.node('http.request').locator('[data-secret-likely]')).toBeVisible()
    await expect(editor.page.locator('dialog')).toHaveCount(0)
    for (const name of ['New', 'Import']) await expect(editor.toolbar.getByRole('button', { name })).toBeEnabled()
    await expect(exportButton(editor)).toBeEnabled()

    // editing
    await editor.node('http.request').click({ position: { x: 30, y: 10 } })
    await editor.settings.getByLabel('Label').fill('Fetch data')
    await expect(editor.node('http.request').getByText('Fetch data', { exact: true })).toBeVisible()
    // dragging
    const before = (await editor.node('http.request').boundingBox())!
    await editor.page.mouse.move(before.x + 30, before.y + 15)
    await editor.page.mouse.down()
    await editor.page.mouse.move(before.x + 30 + 40, before.y + 15 + 120, { steps: 10 })
    await editor.page.mouse.up()
    const after = (await editor.node('http.request').boundingBox())!
    expect(after.y - before.y).toBeGreaterThan(80)
    // connecting
    await editor.drop('LLM Prompt', 700, 200)
    await editor.connect({ node: editor.node('http.request'), port: 'body' }, { node: editor.node('llm.prompt'), port: 'input' })
    await expect(editor.edges).toHaveCount(1)
    // the indicator survived all of it, and no dialog opened by itself
    await expect(editor.toolbar.getByText(INDICATOR)).toBeVisible()
    await expect(editor.page.locator('dialog')).toHaveCount(0)
    await expect(editor.page.locator('[role="alert"]')).toHaveCount(0)
  })
})

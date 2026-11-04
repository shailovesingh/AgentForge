import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

// A version 1 agent file, as an older editor wrote it (maxIterations was a plain number).
const agentFile = (typeVersion: number, maxIterations: number) =>
  JSON.stringify(
    {
      schemaVersion: '1.0',
      id: 'wf_old',
      name: 'Old agent',
      description: '',
      nodes: [
        { id: 'a', type: 'agent.autonomous', typeVersion, label: 'Agent', config: { provider: 'ollama', maxIterations }, position: { x: 100, y: 100 } },
      ],
      edges: [],
      metadata: {},
    },
    null,
    2,
  ) + '\n'

const UPGRADE_TEXT = 'Upgraded 1 node (Agent v1 to v2). Review the changes. Your original file was not modified.'

test.describe('node upgrades (H3)', () => {
  // The "file on disk unchanged" checks below DOCUMENT the guarantee; they cannot fail because of the app: the page has no write
  // access to a file chosen in a file input, and the export goes to Playwright's separate download path. The real guarantees are
  // in contracts/MIGRATIONS.md rule 8 (the importer only gets the content; the source-text guard in nodeMigrations.test.ts).
  test('a version 1 agent file is upgraded in memory: banner with the note, field shows 3 (and the picked file is, as always, untouched)', async ({ editor }) => {
    const dir = mkdtempSync(join(tmpdir(), 'agentforge-e2e-'))
    try {
      const file = join(dir, 'old-agent.json')
      writeFileSync(file, agentFile(1, 2.5))
      const before = readFileSync(file)
      // the live region exists, and is empty, before anything is imported
      const region = editor.page.getByRole('status')
      await expect(region).toHaveCount(1)
      await expect(region).toBeEmpty()

      await editor.page.getByLabel('Import workflow file').setInputFiles(file)

      const banner = editor.page.getByRole('status').filter({ hasText: 'Upgraded' })
      await expect(banner.getByText(UPGRADE_TEXT, { exact: true })).toBeVisible()
      await expect(banner.getByText('maxIterations 2.5 was not a whole number and was rounded to 3')).toBeVisible()
      await expect(editor.nodes).toHaveCount(1)
      await editor.node('agent.autonomous').click({ position: { x: 30, y: 10 } })
      await expect(editor.settings.getByLabel('Max iterations')).toHaveValue('3')

      // The importer only reads: the bytes on disk are exactly what they were.
      expect(readFileSync(file).equals(before)).toBe(true)

      // Exporting is a separate, explicit action that writes a NEW file at the new version.
      const exported = JSON.parse((await editor.exportWorkflow()).text) as { nodes: { typeVersion: number; config: { maxIterations: number } }[] }
      expect(exported.nodes[0].typeVersion).toBe(2)
      expect(exported.nodes[0].config.maxIterations).toBe(3)
      expect(readFileSync(file).equals(before)).toBe(true)

      await banner.getByRole('button', { name: 'Dismiss' }).click()
      await expect(banner).toHaveCount(0)
      await expect(region).toHaveCount(1) // the container stays mounted (empty), so the next banner is announced
      await expect(region).toBeEmpty()
      await expect(editor.page.getByRole('button', { name: 'Import' })).toBeFocused() // focus moved to a stable element
      await expect(editor.nodes).toHaveCount(1) // dismissing the banner changes nothing else
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a file newer than this editor is rejected with node.version-newer: error panel, graph untouched, no banner', async ({ editor }) => {
    await editor.buildPipeline()
    await editor.importText(agentFile(3, 5))

    const alert = editor.toolbar.getByRole('alert')
    await expect(alert.getByText('node.version-newer', { exact: true })).toBeVisible()
    await expect(alert.getByText('at /nodes/0/typeVersion', { exact: true })).toBeVisible()
    await expect(alert.getByText(/created by a newer editor/)).toBeVisible()
    await expect(editor.nodes).toHaveCount(3)
    await expect(editor.edges).toHaveCount(2)
    await expect(editor.page.getByRole('status').filter({ hasText: 'Upgraded' })).toHaveCount(0)
  })

  test('New clears a visible banner', async ({ editor }) => {
    await editor.importText(agentFile(1, 7))
    const banner = editor.page.getByRole('status').filter({ hasText: 'Upgraded' })
    await expect(banner.getByText(UPGRADE_TEXT, { exact: true })).toBeVisible()
    await editor.page.getByRole('button', { name: 'New' }).click()
    await expect(banner).toHaveCount(0)
    await expect(editor.nodes).toHaveCount(0)
  })
})

test.describe('a failed import after an upgrade', () => {
  test('leaves the previous banner, graph and settings untouched', async ({ editor }) => {
    await editor.importText(agentFile(1, 2.5))
    const banner = editor.page.getByRole('status').filter({ hasText: 'Upgraded' })
    await expect(banner.getByText(UPGRADE_TEXT, { exact: true })).toBeVisible()
    await expect(editor.nodes).toHaveCount(1)

    await editor.importText(agentFile(3, 5)) // newer than this editor: rejected
    const alert = editor.toolbar.getByRole('alert')
    await expect(alert.getByText('node.version-newer', { exact: true })).toBeVisible()

    // the banner of the previous (successful) import is still there, with its note, and the graph is the one that was loaded
    await expect(banner.getByText(UPGRADE_TEXT, { exact: true })).toBeVisible()
    await expect(banner.getByText('maxIterations 2.5 was not a whole number and was rounded to 3')).toBeVisible()
    await expect(editor.nodes).toHaveCount(1)
    await editor.node('agent.autonomous').click({ position: { x: 30, y: 10 } })
    await expect(editor.settings.getByLabel('Max iterations')).toHaveValue('3')
  })
})

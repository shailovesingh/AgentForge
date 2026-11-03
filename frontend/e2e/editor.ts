import { readFileSync } from 'node:fs'
import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

// Helpers for driving the workflow editor. Selectors use roles, labels and the catalog node
// type (`data-node-type`), never the random node ids.

export interface PortRef {
  node: Locator
  port: string
}

export interface Point {
  x: number
  y: number
}

async function centerOf(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Element has no bounding box (is it visible?)')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

export function editor(page: Page) {
  const pane = page.locator('.react-flow__pane')
  const nodes = page.locator('.react-flow__node')
  const edges = page.locator('.react-flow__edge')
  const libraryItems = page.locator('aside[aria-label="Node library"] [role="button"]')
  const settings = page.locator('aside[aria-label="Node settings"]')
  const toolbar = page.locator('header')

  const node = (type: string) => page.locator(`.react-flow__node:has([data-node-type="${type}"])`)
  const libraryItem = (label: string) => page.getByRole('button', { name: `Add ${label} node` })
  const handle = (ref: PortRef, kind: 'source' | 'target') =>
    ref.node.locator(`.react-flow__handle.${kind}[data-handleid="${ref.port}"]`)

  /** Drags a library item onto the canvas; x and y are relative to the canvas pane. */
  async function drop(label: string, x: number, y: number) {
    await libraryItem(label).dragTo(pane, { targetPosition: { x, y } })
  }

  async function startConnection(from: PortRef) {
    const a = await centerOf(handle(from, 'source'))
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    return a
  }

  async function moveTo(from: Point, to: Point) {
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 })
    await page.mouse.move(to.x, to.y, { steps: 6 })
  }

  /** Drags from an output port to an input port. The editor decides whether to accept it. */
  async function connect(from: PortRef, to: PortRef) {
    const a = await startConnection(from)
    await moveTo(a, await centerOf(handle(to, 'target')))
    await page.mouse.up()
  }

  /** Drops trigger -> LLM -> output at fixed positions and wires them (2 edges). */
  async function buildPipeline() {
    await drop('Manual Trigger', 100, 200)
    await drop('LLM Prompt', 400, 200)
    await drop('Output', 700, 200)
    await expect(nodes).toHaveCount(3)
    await connect(
      { node: node('trigger.manual'), port: 'data' },
      { node: node('llm.prompt'), port: 'input' },
    )
    await connect(
      { node: node('llm.prompt'), port: 'text' },
      { node: node('output.result'), port: 'input' },
    )
    await expect(edges).toHaveCount(2)
  }

  /** Clicks Export and returns the downloaded file name and text. */
  async function exportWorkflow(): Promise<{ filename: string; text: string }> {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export' }).click(),
    ])
    return { filename: download.suggestedFilename(), text: readFileSync(await download.path(), 'utf8') }
  }

  async function importText(text: string, name = 'workflow.json') {
    await page
      .getByLabel('Import workflow file')
      .setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) })
  }

  /** Clicks an empty part of the canvas, which deselects everything. */
  async function clickEmptyCanvas() {
    await pane.click({ position: { x: 30, y: 400 } })
  }

  return {
    page,
    pane,
    nodes,
    edges,
    libraryItems,
    settings,
    toolbar,
    node,
    libraryItem,
    handle,
    drop,
    startConnection,
    moveTo,
    connect,
    buildPipeline,
    exportWorkflow,
    importText,
    clickEmptyCanvas,
    centerOf,
  }
}

export type Editor = ReturnType<typeof editor>

import { expect, test } from './fixtures.ts'

interface ExportedNode {
  type: string
  position: { x: number; y: number }
}

const positionOf = (text: string, type: string) =>
  (JSON.parse(text) as { nodes: ExportedNode[] }).nodes.find((n) => n.type === type)!.position

test.describe('adding nodes', () => {
  test('dropping from the library creates catalog nodes at the cursor', async ({ editor }) => {
    const paneBox = await editor.pane.boundingBox()
    await editor.drop('Manual Trigger', 100, 200)
    await editor.drop('LLM Prompt', 400, 200)
    await editor.drop('Output', 700, 200)

    await expect(editor.nodes).toHaveCount(3)
    await expect(editor.node('llm.prompt').getByText('LLM Prompt')).toBeVisible()

    const box = await editor.node('trigger.manual').boundingBox()
    expect(Math.abs(box!.x - (paneBox!.x + 100))).toBeLessThan(40)
  })

  test('clicking or pressing Enter on a library item adds a node', async ({ editor }) => {
    await editor.libraryItem('HTTP Request').click()
    await expect(editor.nodes).toHaveCount(1)

    await editor.libraryItem('Condition').focus()
    await editor.page.keyboard.press('Enter')
    await expect(editor.nodes).toHaveCount(2)
  })
})

test.describe('removing and moving', () => {
  test('Delete removes the selected node', async ({ editor }) => {
    await editor.libraryItem('HTTP Request').click() // a new node is selected
    await expect(editor.nodes).toHaveCount(1)
    await editor.page.keyboard.press('Delete')
    await expect(editor.nodes).toHaveCount(0)
  })

  test('Backspace removes the selected node', async ({ editor }) => {
    await editor.libraryItem('HTTP Request').click()
    await editor.node('http.request').click({ position: { x: 20, y: 10 } })
    await editor.page.keyboard.press('Backspace')
    await expect(editor.nodes).toHaveCount(0)
  })

  test('deleting a node removes its attached edges', async ({ editor }) => {
    await editor.buildPipeline()
    await editor.node('llm.prompt').click({ position: { x: 30, y: 10 } })
    await editor.page.keyboard.press('Delete')
    await expect(editor.nodes).toHaveCount(2)
    await expect(editor.edges).toHaveCount(0)
  })

  test('a selected edge is deleted with Delete and its nodes stay', async ({ editor }) => {
    await editor.buildPipeline()
    await editor.edges.first().click({ force: true })
    await editor.page.keyboard.press('Delete')
    await expect(editor.edges).toHaveCount(1)
    await expect(editor.nodes).toHaveCount(3)
  })

  test('dragging a node updates its exported position and keeps its edges', async ({ editor }) => {
    await editor.buildPipeline()
    // Drag a node that is well inside the canvas: near the edge React Flow auto-pans the viewport.
    const before = positionOf((await editor.exportWorkflow()).text, 'llm.prompt')

    const box = (await editor.node('llm.prompt').boundingBox())!
    await editor.page.mouse.move(box.x + 30, box.y + 15)
    await editor.page.mouse.down()
    await editor.page.mouse.move(box.x + 30 + 40, box.y + 15 + 120, { steps: 10 })
    await editor.page.mouse.up()

    const moved = (await editor.node('llm.prompt').boundingBox())!
    const after = positionOf((await editor.exportWorkflow()).text, 'llm.prompt')

    // React Flow consumes the first mouse step to start the drag, so the node travels slightly
    // less than the pointer did. What matters: it moved a lot, and the exported position
    // matches where the node actually is (the viewport is at zoom 1, so pixels equal flow units).
    expect(moved.y - box.y).toBeGreaterThan(80)
    expect(moved.x - box.x).toBeGreaterThan(20)
    expect(Math.abs(after.x - before.x - (moved.x - box.x))).toBeLessThan(1.5)
    expect(Math.abs(after.y - before.y - (moved.y - box.y))).toBeLessThan(1.5)
    await expect(editor.edges).toHaveCount(2)
  })

  test('New clears the canvas', async ({ editor }) => {
    await editor.buildPipeline()
    await editor.page.getByRole('button', { name: 'New' }).click()
    await expect(editor.nodes).toHaveCount(0)
    await expect(editor.edges).toHaveCount(0)
  })
})

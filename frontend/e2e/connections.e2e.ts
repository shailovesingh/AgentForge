import { expect, test } from './fixtures.ts'

test.describe('connection rules', () => {
  test('valid drags create edges', async ({ editor }) => {
    await editor.buildPipeline() // asserts both edges exist
  })

  test('an occupied single-connection input rejects a second edge', async ({ editor }) => {
    await editor.buildPipeline()
    await editor.connect(
      { node: editor.node('trigger.manual'), port: 'data' },
      { node: editor.node('output.result'), port: 'input' },
    )
    await expect(editor.edges).toHaveCount(2)
  })

  test('a duplicate connection is rejected', async ({ editor }) => {
    await editor.buildPipeline()
    await editor.connect(
      { node: editor.node('trigger.manual'), port: 'data' },
      { node: editor.node('llm.prompt'), port: 'input' },
    )
    await expect(editor.edges).toHaveCount(2)
  })

  test('incompatible data types are rejected', async ({ editor }) => {
    await editor.drop('HTTP Request', 100, 500)
    await editor.drop('Agent', 500, 500)
    // http.status is a number; agent.input is text.
    await editor.connect(
      { node: editor.node('http.request'), port: 'status' },
      { node: editor.node('agent.autonomous'), port: 'input' },
    )
    await expect(editor.edges).toHaveCount(0)
  })

  test('a connection that would create a cycle is rejected', async ({ editor }) => {
    await editor.drop('LLM Prompt', 80, 150)
    await editor.drop('LLM Prompt', 450, 150)
    const first = editor.nodes.nth(0)
    const second = editor.nodes.nth(1)

    await editor.connect({ node: first, port: 'text' }, { node: second, port: 'input' })
    await expect(editor.edges).toHaveCount(1)

    await editor.connect({ node: second, port: 'text' }, { node: first, port: 'input' })
    await expect(editor.edges).toHaveCount(1)
  })

  test('gives live feedback while dragging a connection', async ({ editor }) => {
    await editor.drop('LLM Prompt', 80, 150)
    await editor.drop('LLM Prompt', 450, 150)
    await editor.drop('Output', 450, 400)
    const first = editor.nodes.nth(0)
    const second = editor.nodes.nth(1)
    const output = editor.node('output.result')

    await editor.connect({ node: first, port: 'text' }, { node: second, port: 'input' })
    await expect(editor.edges).toHaveCount(1)

    // Start a new drag from the first node; hover the already-occupied input: rejected.
    const start = await editor.startConnection({ node: first, port: 'text' })
    const occupied = editor.handle({ node: second, port: 'input' }, 'target')
    await editor.moveTo(start, await editor.centerOf(occupied))
    await expect(occupied).toHaveClass(/\bconnectingto\b/)
    await expect(occupied).not.toHaveClass(/\bvalid\b/)

    // Hover a free, compatible input: accepted, and releasing creates the edge.
    const free = editor.handle({ node: output, port: 'input' }, 'target')
    await editor.moveTo(await editor.centerOf(occupied), await editor.centerOf(free))
    await expect(free).toHaveClass(/\bvalid\b/)
    await editor.page.mouse.up()
    await expect(editor.edges).toHaveCount(2)
  })
})

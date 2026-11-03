import { expect, test } from './fixtures.ts'

test.describe('node library', () => {
  test('lists the six catalog nodes', async ({ editor }) => {
    await expect(editor.libraryItems).toHaveCount(6)
  })

  test('search filters the list and shows an empty state', async ({ editor }) => {
    const search = editor.page.getByLabel('Search nodes')

    await search.fill('http')
    await expect(editor.libraryItems).toHaveCount(1)

    await search.fill('zzzz')
    await expect(editor.page.getByText('No nodes match')).toBeVisible()

    await search.fill('')
    await expect(editor.libraryItems).toHaveCount(6)
  })
})

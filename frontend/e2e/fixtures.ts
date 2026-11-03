import { test as base, expect } from '@playwright/test'
import { editor } from './editor.ts'
import type { Editor } from './editor.ts'

// Every test gets a fresh editor page, and fails if the page logs a console error or throws.
export const test = base.extend<{ editor: Editor }>({
  editor: async ({ page }, provide) => {
    const problems: string[] = []
    page.on('pageerror', (error) => problems.push(String(error)))
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text())
    })
    await page.goto('/')
    await provide(editor(page))
    expect(problems, 'console errors and uncaught page errors').toEqual([])
  },
})

export { expect }

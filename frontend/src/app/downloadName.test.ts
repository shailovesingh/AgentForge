import { describe, expect, test } from 'vitest'
import { downloadName } from './downloadName'

// Built at run time from parts: no token-shaped literal in a source file.
const TOKEN = 'sk' + '-' + ['QwErTyUi', 'OpAsDfGh', 'JkLzXcVb'].join('')

describe('downloadName', () => {
  test('an ordinary name becomes a slug', () => {
    expect(downloadName('My Test Flow')).toBe('my-test-flow.json')
    expect(downloadName('  Weekly / Report #2  ')).toBe('weekly-report-2.json')
  })

  test('an empty or symbol-only name falls back to "workflow"', () => {
    expect(downloadName('')).toBe('workflow.json')
    expect(downloadName('***')).toBe('workflow.json')
  })

  test('a credential-shaped name never reaches the file name', () => {
    for (const name of [TOKEN, `deploy ${TOKEN} now`, 'x'.repeat(80) + ' ' + TOKEN]) {
      const file = downloadName(name)
      expect(file).toBe('workflow.json')
      expect(file.includes(TOKEN.slice(0, 8))).toBe(false)
      expect(file.includes(TOKEN.slice(-8).toLowerCase())).toBe(false)
    }
  })
})

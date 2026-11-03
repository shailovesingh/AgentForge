import { describe, expect, test } from 'vitest'
import { shorten } from './shorten'

describe('shorten', () => {
  test('text up to the limit is unchanged', () => {
    expect(shorten('', 5)).toBe('')
    expect(shorten('abcde', 5)).toBe('abcde')
  })

  test('longer text is cut to the limit plus an ellipsis', () => {
    expect(shorten('abcdef', 5)).toBe('abcde...')
    expect(shorten('x'.repeat(2_000_000), 200)).toBe('x'.repeat(200) + '...')
  })

  test('a surrogate pair is never split', () => {
    const grin = String.fromCodePoint(0x1f600)
    expect(shorten('ab' + grin + 'cd', 3)).toBe('ab...') // the cut would fall inside the pair
    expect(shorten('ab' + grin + 'cd', 4)).toBe('ab' + grin + '...')
  })
})

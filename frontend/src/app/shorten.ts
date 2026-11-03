/** Cuts text to `max` characters plus "...", never leaving half of a surrogate pair behind. For display only. */
export function shorten(text: string, max: number): string {
  if (text.length <= max) return text
  const half = text.charCodeAt(max - 1) >= 0xd800 && text.charCodeAt(max - 1) <= 0xdbff
  return text.slice(0, half ? max - 1 : max) + '...'
}

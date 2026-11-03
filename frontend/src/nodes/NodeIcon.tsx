import { createElement } from 'react'
import { getIcon } from './icons'

/** Renders a catalog icon by its Lucide name. */
export function NodeIcon({ name, size = 16 }: { name: string; size?: number }) {
  return createElement(getIcon(name), { size, 'aria-hidden': true })
}

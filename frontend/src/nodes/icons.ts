import { Bot, Box, Flag, GitBranch, Globe, Play, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Catalog definitions refer to icons by Lucide name; this maps names to components.
// An explicit map keeps the bundle small (no dynamic import of the whole icon set).
// Adding a catalog node with a new icon means adding it here; icons.test.ts enforces this.
export const icons: Record<string, LucideIcon> = { Bot, Flag, GitBranch, Globe, Play, Sparkles }

export function getIcon(name: string): LucideIcon {
  return icons[name] ?? Box
}

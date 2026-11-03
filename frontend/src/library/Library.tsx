import { useReactFlow, useStore } from '@xyflow/react'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { DragEvent, KeyboardEvent } from 'react'
import { NODE_DRAG_MIME } from '../canvas/Canvas'
import { nodeDefinitions } from '../catalog'
import { NodeIcon } from '../nodes/NodeIcon'
import { useEditorStore } from '../store/editorStore'
import type { NodeCategory } from '../workflow/types'
import styles from './Library.module.css'
import { matchesQuery } from './search'

const CATEGORY_ORDER: NodeCategory[] = ['Triggers', 'AI', 'Integrations', 'Logic', 'Output']

export function Library() {
  const [query, setQuery] = useState('')
  const { getViewport } = useReactFlow()
  const paneWidth = useStore((s) => s.width)
  const paneHeight = useStore((s) => s.height)

  const groups = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        defs: nodeDefinitions.filter((d) => d.category === category && matchesQuery(d, query)),
      })).filter((g) => g.defs.length > 0),
    [query],
  )

  // Keyboard/click alternative to dragging: add at the centre of the visible canvas,
  // nudged per existing node so repeated adds don't stack exactly.
  const addAtCenter = (type: string) => {
    const { x, y, zoom } = getViewport()
    const count = useEditorStore.getState().workflow.nodes.length
    const nudge = (count % 8) * 24
    useEditorStore.getState().addNode(type, {
      x: (paneWidth / 2 - x) / zoom - 95 + nudge,
      y: (paneHeight / 2 - y) / zoom - 40 + nudge,
    })
  }

  const onDragStart = (e: DragEvent, type: string) => {
    e.dataTransfer.setData(NODE_DRAG_MIME, type)
    e.dataTransfer.effectAllowed = 'move'
  }

  const onKeyDown = (e: KeyboardEvent, type: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      addAtCenter(type)
    }
  }

  return (
    <aside className={styles.library} aria-label="Node library">
      <label className={styles.search}>
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          placeholder="Search nodes"
          aria-label="Search nodes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      {groups.length === 0 && <p className={styles.empty}>No nodes match "{query}".</p>}

      {groups.map(({ category, defs }) => (
        <section key={category} aria-label={category}>
          <h2 className={styles.category}>{category}</h2>
          {defs.map((def) => (
            // A div (not a button) so HTML5 drag works in every browser, with button semantics added.
            <div
              key={def.type}
              className={styles.item}
              role="button"
              tabIndex={0}
              draggable
              aria-label={`Add ${def.label} node`}
              title={def.description}
              onClick={() => addAtCenter(def.type)}
              onKeyDown={(e) => onKeyDown(e, def.type)}
              onDragStart={(e) => onDragStart(e, def.type)}
            >
              <NodeIcon name={def.icon} />
              <div>
                <div className={styles.name}>{def.label}</div>
                <div className={styles.desc}>{def.description}</div>
              </div>
            </div>
          ))}
        </section>
      ))}
    </aside>
  )
}

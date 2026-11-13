import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { ShieldAlert, TriangleAlert } from 'lucide-react'
import { shorten } from '../app/shorten'
import { getNodeDefinition } from '../catalog'
import type { FlowNode } from '../canvas/flowMapping'
import { useNodeWarnings } from '../store/useWarnings'
import { warningCountText } from '../store/warnings'
import type { Warning } from '../workflow/lint'
import { NodeIcon } from './NodeIcon'
import styles from './WorkflowNode.module.css'

// A message longer than this is cut in the badge's tooltip, so a huge node label cannot flood it.
const MAX_TITLE = 200

// The badge's tooltip: one line per warning. Every lint message names the node through safeDisplayName (contracts/SECRETS.md),
// so none of them can quote a label that is itself a pasted token.
const titleOf = (warnings: readonly Warning[]): string => warnings.map((w) => shorten(w.message, MAX_TITLE)).join('\n')

/** The single node component for every catalog type. Ports and icon come from the catalog. */
export function WorkflowNodeView({ data, selected }: NodeProps<FlowNode>) {
  const { node } = data
  const def = getNodeDefinition(node.type, node.typeVersion)
  const warnings = useNodeWarnings(node.id) // only this node's warnings: a drag of another node does not re-render this one

  const likelySecret = warnings.some((w) => w.code === 'secret-likely')

  if (!def) {
    return (
      <div className={`${styles.node} ${styles.unknown}`}>
        <div className={styles.header}>Unknown node: {node.type}@{node.typeVersion}</div>
      </div>
    )
  }

  return (
    <div className={`${styles.node} ${selected ? styles.selected : ''}`} data-node-type={node.type}>
      <div className={styles.header}>
        <NodeIcon name={def.icon} />
        <span className={styles.label}>{node.label}</span>
        {warnings.length > 0 && (
          // Subdued on purpose: a new node warns at once. Not a live region; the title lists the messages as plain text.
          // A possible credential (secret-likely) gets a distinct, more prominent badge; the messages in its title only
          // name the node (through safeDisplayName) and a display path, never a value.
          <span
            className={likelySecret ? `${styles.warning} ${styles.secret}` : styles.warning}
            role="img"
            aria-label={likelySecret ? `${warningCountText(warnings.length)}, possible credential` : warningCountText(warnings.length)}
            title={titleOf(warnings)}
            data-secret-likely={likelySecret ? '' : undefined}
          >
            {likelySecret ? <ShieldAlert size={12} aria-hidden="true" /> : <TriangleAlert size={12} aria-hidden="true" />}
            {warnings.length}
          </span>
        )}
      </div>
      <div className={styles.ports}>
        <ul className={styles.column}>
          {def.inputs.map((port) => (
            <li key={port.name} className={styles.port}>
              <Handle type="target" position={Position.Left} id={port.name} />
              <span title={`${port.dataType}${port.multiple ? ' (multiple)' : ''}`}>{port.label}</span>
            </li>
          ))}
        </ul>
        <ul className={`${styles.column} ${styles.outputs}`}>
          {def.outputs.map((port) => (
            <li key={port.name} className={styles.port}>
              <span title={port.dataType}>{port.label}</span>
              <Handle type="source" position={Position.Right} id={port.name} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

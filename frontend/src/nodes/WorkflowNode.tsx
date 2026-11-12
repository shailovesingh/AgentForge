import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { getNodeDefinition } from '../catalog'
import type { FlowNode } from '../canvas/flowMapping'
import { TriangleAlert } from 'lucide-react'
import { useWarnings } from '../store/useWarnings'
import { warningCountText } from '../store/warnings'
import { NodeIcon } from './NodeIcon'
import styles from './WorkflowNode.module.css'

/** The single node component for every catalog type. Ports and icon come from the catalog. */
export function WorkflowNodeView({ data, selected }: NodeProps<FlowNode>) {
  const { node } = data
  const def = getNodeDefinition(node.type, node.typeVersion)
  const warnings = useWarnings().byNode.get(node.id) ?? []

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
          <span
            className={styles.warning}
            role="img"
            aria-label={warningCountText(warnings.length)}
            title={warnings.map((w) => w.message).join('\n')}
          >
            <TriangleAlert size={12} aria-hidden="true" />
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

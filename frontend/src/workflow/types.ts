// Workflow JSON v1 and node catalog types (D-003, D-004).
// Hand-written in Phase 1; from Phase 2 these are generated from the backend's Pydantic models.
// No React or React Flow imports here: this is the canonical, UI-independent contract.

import type { ObjectSchema } from './jsonSchema'

export const SCHEMA_VERSION = '1.0'

export type DataType = 'any' | 'text' | 'json' | 'number' | 'boolean' | 'messages' | 'tool'

export interface PortDefinition {
  /** Port name; also used as the React Flow handle id. Unique within a node (inputs + outputs). */
  name: string
  label: string
  dataType: DataType
  required?: boolean
  /** Input only: accepts more than one incoming edge. */
  multiple?: boolean
  /** Output only (never on inputs): this node may leave this port unselected. See docs/ARCHITECTURE.md section 6.1. */
  branch?: boolean
}

/**
 * Presentation hints for the config panel. They never affect validity (that is the schema's job): a
 * validator ignores them, and a property without a hint is rendered from its schema type alone.
 */
export interface NodeUi {
  /** Property names in display order; a property not listed still renders, after the listed ones, in schema order. */
  order?: string[]
  fields?: Record<string, { widget?: 'text' | 'textarea' | 'select' | 'json' | 'checkbox'; rows?: number; placeholder?: string }>
}

export type NodeCategory = 'Triggers' | 'AI' | 'Integrations' | 'Logic' | 'Output'

export interface NodeDefinition {
  /** Stable identifier, e.g. "llm.prompt". */
  type: string
  /** Version of this node type's config and ports. Independent of schemaVersion. */
  version: number
  category: NodeCategory
  label: string
  /** Also used in natural-language generation prompts. */
  description: string
  /** Lucide icon name. */
  icon: string
  inputs: PortDefinition[]
  outputs: PortDefinition[]
  /** JSON Schema subset (contracts/CONFIG_SCHEMA.md). Initial values are the schema `default`s. */
  configSchema: ObjectSchema
  /** Presentation only; see NodeUi. */
  ui?: NodeUi
}

export interface Position {
  x: number
  y: number
}

export interface WorkflowNode {
  id: string
  type: string
  typeVersion: number
  label: string
  config: Record<string, unknown>
  /** The only UI data in the document; the engine ignores it. */
  position: Position
}

export interface PortRef {
  nodeId: string
  port: string
}

export interface WorkflowEdge {
  id: string
  source: PortRef
  target: PortRef
}

export interface Workflow {
  schemaVersion: string
  id: string
  name: string
  description: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  metadata: Record<string, unknown>
}

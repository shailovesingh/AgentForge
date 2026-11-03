// Workflow JSON v1 and node catalog types (D-003, D-004).
// Hand-written in Phase 1; from Phase 2 these are generated from the backend's Pydantic models.
// No React or React Flow imports here: this is the canonical, UI-independent contract.

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
}

/** Subset of JSON Schema that the config panel can render. */
export interface ConfigProperty {
  type: 'string' | 'number' | 'boolean' | 'object'
  title: string
  description?: string
  /** string + enum renders a select. */
  enum?: string[]
  /** string + 'multiline' renders a textarea. */
  format?: 'multiline'
  minimum?: number
  maximum?: number
}

export interface ConfigSchema {
  type: 'object'
  properties: Record<string, ConfigProperty>
  required?: string[]
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
  configSchema: ConfigSchema
  defaults: Record<string, unknown>
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

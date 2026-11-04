import type { NodeDefinition } from '../workflow/types'

// Static node catalog (Phase 1). Shaped exactly like the future GET /api/catalog response,
// so switching to the API later only changes where this array comes from.
//
// configSchema is the JSON Schema subset of contracts/CONFIG_SCHEMA.md. A property's initial value is its
// schema `default`, applied only by applyDefaults when a node is created. `ui` holds presentation hints.
//
// ponytail: no credentialRef settings yet; they arrive with backend credential management.

/** The one list of LLM providers; both AI nodes derive their enum from it. */
export const PROVIDERS = ['ollama', 'openai', 'anthropic', 'groq']

export const nodeDefinitions: NodeDefinition[] = [
  {
    type: 'trigger.manual',
    version: 1,
    category: 'Triggers',
    label: 'Manual Trigger',
    description: 'Starts the workflow when a user runs it, optionally with an initial JSON payload.',
    icon: 'Play',
    inputs: [],
    outputs: [{ name: 'data', label: 'Data', dataType: 'json' }],
    configSchema: {
      type: 'object',
      properties: {
        payload: { type: 'object', title: 'Initial payload', description: 'JSON passed to the next node.', default: {} },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'llm.prompt',
    version: 1,
    category: 'AI',
    label: 'LLM Prompt',
    description: 'Sends a prompt to a language model and returns its text response.',
    icon: 'Sparkles',
    inputs: [{ name: 'input', label: 'Input', dataType: 'any' }],
    outputs: [{ name: 'text', label: 'Text', dataType: 'text' }],
    configSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', title: 'Provider', enum: PROVIDERS, default: 'ollama' },
        model: { type: 'string', title: 'Model', default: '' },
        systemPrompt: { type: 'string', title: 'System prompt', default: '' },
        prompt: { type: 'string', title: 'Prompt', default: '' },
        temperature: { type: 'number', title: 'Temperature', minimum: 0, maximum: 2, default: 0.7 },
      },
      required: ['provider', 'prompt'],
      additionalProperties: false,
    },
    ui: {
      fields: {
        systemPrompt: { widget: 'textarea', rows: 4 },
        prompt: { widget: 'textarea', rows: 4 },
      },
    },
  },
  {
    type: 'http.request',
    version: 1,
    category: 'Integrations',
    label: 'HTTP Request',
    description: 'Calls an HTTP endpoint and returns the response body and status code.',
    icon: 'Globe',
    inputs: [{ name: 'input', label: 'Input', dataType: 'any' }],
    outputs: [
      { name: 'body', label: 'Body', dataType: 'json' },
      { name: 'status', label: 'Status', dataType: 'number' },
    ],
    configSchema: {
      type: 'object',
      properties: {
        method: { type: 'string', title: 'Method', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'GET' },
        url: { type: 'string', title: 'URL', default: '' },
        headers: { type: 'object', title: 'Headers', description: 'Do not put secrets here.', default: {} },
        body: { type: 'string', title: 'Body', default: '' },
      },
      required: ['method', 'url'],
      additionalProperties: false,
    },
    ui: { fields: { body: { widget: 'textarea', rows: 4 } } },
  },
  {
    type: 'logic.condition',
    version: 1,
    category: 'Logic',
    label: 'Condition',
    description: 'Routes data to the "true" or "false" branch depending on a comparison.',
    icon: 'GitBranch',
    inputs: [{ name: 'input', label: 'Input', dataType: 'any', required: true }],
    outputs: [
      { name: 'true', label: 'True', dataType: 'any' },
      { name: 'false', label: 'False', dataType: 'any' },
    ],
    configSchema: {
      type: 'object',
      properties: {
        field: { type: 'string', title: 'Field path', description: 'Path into the input, e.g. "status".', default: '' },
        operator: {
          type: 'string',
          title: 'Operator',
          enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'is_empty'],
          default: 'equals',
        },
        value: { type: 'string', title: 'Compare to', default: '' },
      },
      required: ['operator'],
      additionalProperties: false,
    },
  },
  {
    type: 'agent.autonomous',
    version: 2,
    category: 'AI',
    label: 'Agent',
    description: 'An autonomous AI agent that reasons in a loop and can call connected tools.',
    icon: 'Bot',
    inputs: [
      { name: 'input', label: 'Task', dataType: 'text', required: true },
      { name: 'tools', label: 'Tools', dataType: 'tool', multiple: true },
    ],
    outputs: [
      { name: 'output', label: 'Output', dataType: 'text' },
      { name: 'messages', label: 'Messages', dataType: 'messages' },
    ],
    configSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', title: 'Provider', enum: PROVIDERS, default: 'ollama' },
        model: { type: 'string', title: 'Model', default: '' },
        instructions: { type: 'string', title: 'Instructions', default: '' },
        // Version 2: an integer. Version 1 documents (a plain number) are upgraded by the node migration in workflow/nodeMigrations.ts.
        maxIterations: { type: 'integer', title: 'Max iterations', minimum: 1, maximum: 50, default: 10 },
      },
      required: ['provider'],
      additionalProperties: false,
    },
    ui: { fields: { instructions: { widget: 'textarea', rows: 4 } } },
  },
  {
    type: 'output.result',
    version: 1,
    category: 'Output',
    label: 'Output',
    description: 'Marks the final result of the workflow.',
    icon: 'Flag',
    inputs: [{ name: 'input', label: 'Result', dataType: 'any', required: true }],
    outputs: [],
    configSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', title: 'Format', enum: ['text', 'json'], default: 'text' },
      },
      additionalProperties: false,
    },
  },
]

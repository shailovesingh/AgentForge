import type { NodeDefinition } from '../workflow/types'

// Static node catalog (Phase 1). Shaped exactly like the future GET /api/catalog response,
// so switching to the API later only changes where this array comes from.
//
// ponytail: no credentialRef settings yet; they arrive with backend credential management.
// ponytail: provider list is a placeholder pending the PO's decision on first-class LLM providers.

const PROVIDERS = ['ollama', 'openai', 'anthropic']

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
        payload: { type: 'object', title: 'Initial payload', description: 'JSON passed to the next node.' },
      },
    },
    defaults: { payload: {} },
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
        provider: { type: 'string', title: 'Provider', enum: PROVIDERS },
        model: { type: 'string', title: 'Model' },
        systemPrompt: { type: 'string', title: 'System prompt', format: 'multiline' },
        prompt: { type: 'string', title: 'Prompt', format: 'multiline' },
        temperature: { type: 'number', title: 'Temperature', minimum: 0, maximum: 2 },
      },
      required: ['provider', 'prompt'],
    },
    defaults: { provider: 'ollama', model: '', systemPrompt: '', prompt: '', temperature: 0.7 },
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
        method: { type: 'string', title: 'Method', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
        url: { type: 'string', title: 'URL' },
        headers: { type: 'object', title: 'Headers', description: 'Do not put secrets here.' },
        body: { type: 'string', title: 'Body', format: 'multiline' },
      },
      required: ['method', 'url'],
    },
    defaults: { method: 'GET', url: '', headers: {}, body: '' },
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
        field: { type: 'string', title: 'Field path', description: 'Path into the input, e.g. "status".' },
        operator: {
          type: 'string',
          title: 'Operator',
          enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'is_empty'],
        },
        value: { type: 'string', title: 'Compare to' },
      },
      required: ['operator'],
    },
    defaults: { field: '', operator: 'equals', value: '' },
  },
  {
    type: 'agent.autonomous',
    version: 1,
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
        provider: { type: 'string', title: 'Provider', enum: PROVIDERS },
        model: { type: 'string', title: 'Model' },
        instructions: { type: 'string', title: 'Instructions', format: 'multiline' },
        maxIterations: { type: 'number', title: 'Max iterations', minimum: 1, maximum: 50 },
      },
      required: ['provider'],
    },
    defaults: { provider: 'ollama', model: '', instructions: '', maxIterations: 10 },
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
        format: { type: 'string', title: 'Format', enum: ['text', 'json'] },
      },
    },
    defaults: { format: 'text' },
  },
]

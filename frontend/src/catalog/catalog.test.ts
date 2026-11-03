import { describe, expect, test } from 'vitest'
import { validateConfig } from '../workflow/configSchema'
import { getLatestNodeDefinition, getNodeDefinition, nodeDefinitions } from './index'

describe('node catalog', () => {
  test('type@version pairs are unique', () => {
    const keys = nodeDefinitions.map((d) => `${d.type}@${d.version}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  test.each(nodeDefinitions.map((d) => [d.type, d] as const))(
    '%s has valid ports and defaults',
    (_type, def) => {
      // Handle ids equal port names, so names must be unique across inputs and outputs.
      const names = [...def.inputs, ...def.outputs].map((p) => p.name)
      expect(new Set(names).size).toBe(names.length)

      // `multiple` only makes sense on inputs.
      expect(def.outputs.every((p) => p.multiple === undefined)).toBe(true)

      // Defaults satisfy the config schema, including required properties.
      expect(validateConfig(def.configSchema, def.defaults)).toEqual({})

      // Every required property must have a default so new nodes start valid-shaped.
      for (const key of def.configSchema.required ?? []) {
        expect(def.defaults).toHaveProperty(key)
      }
    },
  )

  test('lookups', () => {
    expect(getNodeDefinition('llm.prompt', 1)?.label).toBe('LLM Prompt')
    expect(getNodeDefinition('llm.prompt', 99)).toBeUndefined()
    expect(getLatestNodeDefinition('nope')).toBeUndefined()
  })
})

describe('validateConfig', () => {
  const schema = nodeDefinitions.find((d) => d.type === 'llm.prompt')!.configSchema

  test('flags wrong types, bad enums, out-of-range numbers, unknown and missing keys', () => {
    expect(
      validateConfig(schema, { provider: 'nope', temperature: 5, extra: 1, prompt: 3 }),
    ).toEqual({
      provider: 'must be one of: ollama, openai, anthropic',
      temperature: 'must be at most 2',
      extra: 'is not a known setting',
      prompt: 'must be text',
    })
    expect(validateConfig(schema, {})).toEqual({
      provider: 'is required',
      prompt: 'is required',
    })
  })
})

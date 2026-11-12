import { beforeEach, describe, expect, test } from 'vitest'
import { useEditorStore } from '../store/editorStore'
import { checkSchemaSubset, validateAgainstSchema } from '../workflow/jsonSchema'
import { exportWorkflowText } from '../workflow/serialize'
import { PROVIDERS, getLatestNodeDefinition, getNodeDefinition, nodeDefinitions } from './index'

describe('node catalog', () => {
  test('type@version pairs are unique', () => {
    const keys = nodeDefinitions.map((d) => `${d.type}@${d.version}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  test.each(nodeDefinitions.map((d) => [d.type, d] as const))(
    '%s has valid ports and a configSchema inside the JSON Schema subset',
    (_type, def) => {
      // Handle ids equal port names, so names must be unique across inputs and outputs.
      const names = [...def.inputs, ...def.outputs].map((p) => p.name)
      expect(new Set(names).size).toBe(names.length)

      // `multiple` only makes sense on inputs.
      expect(def.outputs.every((p) => p.multiple === undefined)).toBe(true)

      // No problems means the schema is well-formed AND every `default` is valid against its own schema.
      expect(checkSchemaSubset(def.configSchema)).toEqual([])
      // Catalog schemas are strict: an unknown setting is an error.
      expect(def.configSchema.additionalProperties).toBe(false)
    },
  )

  describe('the branch marker (T8, ARCHITECTURE 6.1)', () => {
    const branchOutputs = nodeDefinitions.flatMap((d) => d.outputs.filter((p) => Object.hasOwn(p, 'branch')).map((p) => `${d.type}.${p.name}`))

    test('branch appears only on output ports: no input port has a branch key at all', () => {
      for (const def of nodeDefinitions) {
        for (const port of def.inputs) expect(Object.hasOwn(port, 'branch'), `${def.type}.${port.name}`).toBe(false)
      }
    })

    test('logic.condition has exactly two outputs, true and false, both branch: true', () => {
      const outputs = getLatestNodeDefinition('logic.condition')!.outputs
      expect(outputs.map((p) => [p.name, p.branch])).toEqual([['true', true], ['false', true]])
    })

    test('no other catalog node declares a branch output today (adding one must update this test and the spec)', () => {
      expect(branchOutputs).toEqual(['logic.condition.true', 'logic.condition.false'])
    })

    test('a branch value, when present, is the boolean true', () => {
      for (const def of nodeDefinitions) {
        for (const port of [...def.inputs, ...def.outputs]) {
          if (Object.hasOwn(port, 'branch')) expect(port.branch, `${def.type}.${port.name}`).toBe(true)
        }
      }
    })

    test('a document and its export never contain branch (it is catalog metadata only)', () => {
      const store = useEditorStore.getState()
      store.reset()
      store.addNode('logic.condition', { x: 0, y: 0 })
      const exported = exportWorkflowText(useEditorStore.getState().workflow)
      expect(exported.ok).toBe(true)
      if (exported.ok) {
        expect(exported.text).toContain('logic.condition')
        expect(exported.text).not.toContain('branch')
      }
    })
  })

  test('the old presentation and defaults fields are gone', () => {
    for (const def of nodeDefinitions) {
      expect(Object.hasOwn(def, 'defaults'), `${def.type}.defaults`).toBe(false)
      for (const property of Object.values(def.configSchema.properties ?? {})) {
        expect(Object.hasOwn(property, 'format'), `${def.type} format`).toBe(false)
      }
    }
  })

  test('both AI nodes take their provider enum from PROVIDERS, which includes groq', () => {
    expect(PROVIDERS).toEqual(['ollama', 'openai', 'anthropic', 'groq'])
    for (const type of ['llm.prompt', 'agent.autonomous']) {
      const providers = getLatestNodeDefinition(type)!.configSchema.properties!.provider.enum
      expect(providers, type).toEqual(PROVIDERS)
      expect(providers, `${type}: derived from PROVIDERS itself, not a second copy of the list`).toBe(PROVIDERS)
    }
  })

  describe('the ui block', () => {
    // Only what the config panel really renders: `widget: 'textarea'` on a string property. Every other widget
    // value is accepted by the type but RESERVED (see contracts/CONFIG_SCHEMA.md), so a catalog definition must not use it.
    const WIDGETS: Record<string, readonly string[]> = {
      textarea: ['string'],
    }

    test.each(nodeDefinitions.map((d) => [d.type, d] as const))('%s: order and fields name existing properties; widgets fit their type', (_type, def) => {
      const properties = def.configSchema.properties ?? {}
      const order = def.ui?.order ?? []
      for (const key of order) expect(Object.hasOwn(properties, key), `ui.order "${key}"`).toBe(true)
      expect(new Set(order).size, 'ui.order lists a property twice').toBe(order.length)
      for (const [key, field] of Object.entries(def.ui?.fields ?? {})) {
        expect(Object.hasOwn(properties, key), `ui.fields "${key}"`).toBe(true)
        if (field.widget === undefined) continue
        const property = properties[key]
        expect(Object.hasOwn(WIDGETS, field.widget), `${key}: widget ${field.widget} is reserved, not rendered by the panel`).toBe(true)
        expect(WIDGETS[field.widget], `${key}: widget ${field.widget} on type ${property.type}`).toContain(property.type)
      }
    })

    test('the four multiline strings are textareas with 4 rows', () => {
      for (const [type, key] of [['llm.prompt', 'systemPrompt'], ['llm.prompt', 'prompt'], ['http.request', 'body'], ['agent.autonomous', 'instructions']] as const) {
        expect(getLatestNodeDefinition(type)!.ui?.fields?.[key], `${type}.${key}`).toEqual({ widget: 'textarea', rows: 4 })
      }
    })
  })

  test('lookups', () => {
    expect(getNodeDefinition('llm.prompt', 1)?.label).toBe('LLM Prompt')
    expect(getNodeDefinition('llm.prompt', 99)).toBeUndefined()
    expect(getLatestNodeDefinition('nope')).toBeUndefined()
  })
})

describe('catalog config schemas validate configs', () => {
  const schema = nodeDefinitions.find((d) => d.type === 'llm.prompt')!.configSchema

  test('flags wrong types, bad enums, out-of-range numbers and unknown keys; required only when asked', () => {
    const config = { provider: 'nope', temperature: 5, extra: 1, prompt: 3 }
    const codes = (checkRequired: boolean) =>
      validateAgainstSchema(schema, config, { checkRequired }).map(({ code, path }) => ({ code, path }))
    expect(codes(false)).toEqual([
      { code: 'schema.enum', path: '/provider' },
      { code: 'schema.maximum', path: '/temperature' },
      { code: 'schema.additionalProperties', path: '/extra' },
      { code: 'schema.type', path: '/prompt' },
    ])
    expect(validateAgainstSchema(schema, {}, { checkRequired: false })).toEqual([])
    expect(validateAgainstSchema(schema, {}, { checkRequired: true }).map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'schema.required', path: '/provider' },
      { code: 'schema.required', path: '/prompt' },
    ])
  })

  test('the user-visible enum message lists the allowed values', () => {
    expect(validateAgainstSchema(schema, { provider: 'nope' }, { checkRequired: false })[0].message).toBe(
      'must be one of: ollama, openai, anthropic, groq',
    )
  })
})

describe('initial values of a new node', () => {
  beforeEach(() => useEditorStore.getState().reset())
  const create = (type: string) => {
    const id = useEditorStore.getState().addNode(type, { x: 0, y: 0 })
    return useEditorStore.getState().workflow.nodes.find((n) => n.id === id)!.config
  }

  // Literal values (copied from the T5b brief, NOT computed from the catalog): any change here is a user-visible change.
  test('addNode produces exactly the documented initial config for each of the six types', () => {
    expect(create('trigger.manual')).toEqual({ payload: {} })
    expect(create('llm.prompt')).toEqual({ provider: 'ollama', model: '', systemPrompt: '', prompt: '', temperature: 0.7 })
    expect(create('http.request')).toEqual({ method: 'GET', url: '', headers: {}, body: '' })
    expect(create('logic.condition')).toEqual({ field: '', operator: 'equals', value: '' })
    expect(create('agent.autonomous')).toEqual({ provider: 'ollama', model: '', instructions: '', maxIterations: 10 })
    expect(create('output.result')).toEqual({ format: 'text' })
    expect(nodeDefinitions.map((d) => d.type).sort()).toEqual(
      ['agent.autonomous', 'http.request', 'llm.prompt', 'logic.condition', 'output.result', 'trigger.manual'],
    )
  })

  test('two nodes of the same type never share a nested object, and the catalog default is not touched', () => {
    const a = create('http.request')
    const b = create('http.request')
    expect(a.headers).not.toBe(b.headers)
    ;(a.headers as Record<string, unknown>).Accept = 'x'
    expect(b.headers).toEqual({})
    const catalogDefault = getLatestNodeDefinition('http.request')!.configSchema.properties!.headers.default
    expect(catalogDefault).toEqual({})
    expect(create('http.request').headers).toEqual({})

    const t1 = create('trigger.manual')
    const t2 = create('trigger.manual')
    ;(t1.payload as Record<string, unknown>).k = 1
    expect(t2.payload).toEqual({})
    expect(getLatestNodeDefinition('trigger.manual')!.configSchema.properties!.payload.default).toEqual({})
  })
})

describe('agent.autonomous version 2 (T6)', () => {
  beforeEach(() => useEditorStore.getState().reset())

  test('a NEW agent node is created at typeVersion 2 with maxIterations 10 (literal values, not read from the catalog)', () => {
    const id = useEditorStore.getState().addNode('agent.autonomous', { x: 0, y: 0 })
    const node = useEditorStore.getState().workflow.nodes.find((n) => n.id === id)!
    expect(node.typeVersion).toBe(2)
    expect(node.config.maxIterations).toBe(10)
  })

  test('maxIterations is an integer from 1 to 50 in the catalog', () => {
    const prop = getLatestNodeDefinition('agent.autonomous')!.configSchema.properties!.maxIterations
    expect(prop).toMatchObject({ type: 'integer', minimum: 1, maximum: 50, default: 10 })
  })

  test('every other node type is still at version 1', () => {
    expect(nodeDefinitions.filter((d) => d.type !== 'agent.autonomous').map((d) => d.version)).toEqual([1, 1, 1, 1, 1])
  })
})

export function isClaudeSonnet55(model: string): boolean {
  return /^claude-sonnet-5-5(?:-|$)/.test(model)
}

export function getModelRequestConfig(
  model: string,
  maxTokens: number,
): {
  max_tokens: number
  thinking?: { type: 'between_tools' }
  output_config?: { effort: 'medium' }
} {
  if (!isClaudeSonnet55(model)) return { max_tokens: maxTokens }

  return {
    // The Sonnet 5 tokenizer uses about 30% more tokens than Sonnet 4.6.
    max_tokens: Math.ceil(maxTokens * 1.3),
    // Preserve the previous no-up-front-thinking behavior of Sonnet 4.6.
    thinking: { type: 'between_tools' },
    output_config: { effort: 'medium' },
  }
}

type ToolDefinition = {
  name: string
  description: string
  input_schema: Record<string, unknown>
  [key: string]: unknown
}

function makeStrictSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(makeStrictSchema)
  if (!value || typeof value !== 'object') return value

  const schema = value as Record<string, unknown>
  const result: Record<string, unknown> = {}

  for (const [key, child] of Object.entries(schema)) {
    if (key === 'additionalProperties') continue
    result[key] = makeStrictSchema(child)
  }

  const properties = schema.properties
  if (schema.type === 'object' && properties && typeof properties === 'object' && !Array.isArray(properties)) {
    const propertyNames = Object.keys(properties as Record<string, unknown>)
    result.properties = makeStrictSchema(properties)
    result.required = propertyNames
    result.additionalProperties = false
  }

  return result
}

export function makeStrictTool<T extends ToolDefinition>(tool: T): T & { strict: true } {
  return {
    ...tool,
    strict: true,
    input_schema: makeStrictSchema(tool.input_schema) as Record<string, unknown>,
  }
}

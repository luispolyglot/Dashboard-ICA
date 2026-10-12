import { describe, expect, it } from 'vitest'
import {
  getModelRequestConfig,
  isClaudeSonnet55,
  makeStrictTool,
} from '../../../../supabase/functions/_shared/anthropic-model'
import { createAnthropicToolCaller } from '../../../../supabase/functions/_shared/coaching-focus-exercise'

describe('Anthropic Sonnet 5.5 request compatibility', () => {
  it('recognizes the Sonnet 5.5 alias and dated model IDs', () => {
    expect(isClaudeSonnet55('claude-sonnet-5-5')).toBe(true)
    expect(isClaudeSonnet55('claude-sonnet-5-5-20261001')).toBe(true)
    expect(isClaudeSonnet55('claude-sonnet-4-6')).toBe(false)
    expect(isClaudeSonnet55('claude-haiku-4-5-20251001')).toBe(false)
  })

  it('uses Sonnet 5.5 thinking settings and leaves older model limits unchanged', () => {
    expect(getModelRequestConfig('claude-sonnet-5-5', 1000)).toEqual({
      max_tokens: 1300,
      thinking: { type: 'between_tools' },
      output_config: { effort: 'medium' },
    })
    expect(getModelRequestConfig('claude-sonnet-4-6', 1000)).toEqual({ max_tokens: 1000 })
  })

  it('converts nested tool schemas to strict-compatible object schemas', () => {
    const tool = makeStrictTool({
      name: 'report',
      description: 'Return a nested result',
      input_schema: {
        type: 'object',
        properties: {
          result: {
            type: 'object',
            properties: { value: { type: 'string' } },
          },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['result'],
      },
    })

    expect(tool.strict).toBe(true)
    expect(tool.input_schema).toEqual({
      type: 'object',
      properties: {
        result: {
          type: 'object',
          properties: { value: { type: 'string' } },
          required: ['value'],
          additionalProperties: false,
        },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['result', 'tags'],
      additionalProperties: false,
    })
  })

  it('sends Sonnet 5.5 compatible parameters for tool calls', async () => {
    let requestBody: Record<string, unknown> | null = null
    const caller = createAnthropicToolCaller({
      apiKey: 'test-key',
      model: 'claude-sonnet-5-5',
      fetchImpl: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body))
        return new Response(JSON.stringify({
          content: [{ type: 'tool_use', name: 'report', input: { value: 'ok' } }],
        }), { status: 200 })
      },
    })

    const result = await caller({
      system: 'system',
      prompt: 'prompt',
      tool: {
        name: 'report',
        description: 'Return a result',
        input_schema: {
          type: 'object',
          properties: { value: { type: 'string' } },
          required: ['value'],
        },
      },
      maxTokens: 1000,
      temperature: 0.4,
    })

    expect(result).toEqual({ value: 'ok' })
    expect(requestBody).toMatchObject({
      model: 'claude-sonnet-5-5',
      max_tokens: 1300,
      thinking: { type: 'between_tools' },
      output_config: { effort: 'medium' },
      tool_choice: { type: 'auto' },
      tools: [{
        strict: true,
        input_schema: {
          required: ['value'],
          additionalProperties: false,
        },
      }],
    })
    expect(requestBody).not.toHaveProperty('temperature')
  })

  it('keeps Haiku request settings unchanged', async () => {
    let requestBody: Record<string, unknown> | null = null
    const caller = createAnthropicToolCaller({
      apiKey: 'test-key',
      model: 'claude-haiku-4-5-20251001',
      fetchImpl: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body))
        return new Response(JSON.stringify({
          content: [{ type: 'tool_use', name: 'report', input: { value: 'ok' } }],
        }), { status: 200 })
      },
    })

    await caller({
      system: 'system',
      prompt: 'prompt',
      tool: {
        name: 'report',
        description: 'Return a result',
        input_schema: {
          type: 'object',
          properties: { value: { type: 'string' } },
          required: ['value'],
        },
      },
      maxTokens: 1000,
      temperature: 0.4,
    })

    expect(requestBody).toMatchObject({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      temperature: 0.4,
      tool_choice: { type: 'tool', name: 'report' },
    })
    expect(requestBody).not.toHaveProperty('thinking')
    expect(requestBody).not.toHaveProperty('output_config')
  })
})

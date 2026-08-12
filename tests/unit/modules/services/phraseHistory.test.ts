import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(),
  },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: mockSupabase,
}))

import {
  fetchPhraseHistoryByIds,
  fetchPhraseHistoryPage,
} from '@/modules/services/phraseHistory'

type QueryResult = {
  data: Array<Record<string, unknown>> | null
  error: Error | null
}

function makeQuery(result: QueryResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    in: vi.fn(),
  }

  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.order.mockReturnValue(query)
  query.in.mockResolvedValue(result)
  query.range.mockResolvedValue(result)

  return query
}

describe('phraseHistory service', () => {
  beforeEach(() => {
    mockSupabase.from.mockReset()
  })

  it('returns paginated scoped phrase history with hasMore', async () => {
    const query = makeQuery({
      data: [
        {
          id: 'p1',
          generated_phrase: 'Hello',
          translation: 'Hola',
          source_words: ['hello'],
          created_at: new Date().toISOString(),
        },
      ],
      error: null,
    })
    mockSupabase.from.mockReturnValue(query)

    const result = await fetchPhraseHistoryPage({
      limit: 1,
      offset: 0,
      targetLang: 'Inglés',
    })

    expect(result.items).toHaveLength(1)
    expect(result.hasMore).toBe(true)
    expect(query.range).toHaveBeenCalledWith(0, 0)
  })

  it('falls back when scoped query fails and keeps script filtering', async () => {
    const scopedQuery = makeQuery({
      data: null,
      error: new Error('column target_lang does not exist'),
    })
    const fallbackQuery = makeQuery({
      data: [
        {
          id: 'jp',
          generated_phrase: 'こんにちは',
          translation: 'hola',
          source_words: [],
          created_at: new Date().toISOString(),
        },
        {
          id: 'latin',
          generated_phrase: 'hello',
          translation: 'hola',
          source_words: [],
          created_at: new Date().toISOString(),
        },
      ],
      error: null,
    })

    mockSupabase.from
      .mockReturnValueOnce(scopedQuery)
      .mockReturnValueOnce(fallbackQuery)

    const result = await fetchPhraseHistoryPage({
      limit: 10,
      offset: 0,
      targetLang: 'Japonés',
    })

    expect(result.items.map((item) => item.id)).toEqual(['jp'])
    expect(result.hasMore).toBe(false)
  })

  it('fetches phrase rows by ids in batches', async () => {
    const firstQuery = makeQuery({
      data: Array.from({ length: 200 }, (_, index) => ({
        id: `p-${index + 1}`,
        generated_phrase: `phrase-${index + 1}`,
        translation: `tr-${index + 1}`,
        source_words: [],
        created_at: new Date().toISOString(),
      })),
      error: null,
    })
    const secondQuery = makeQuery({
      data: Array.from({ length: 3 }, (_, index) => ({
        id: `p-${index + 201}`,
        generated_phrase: `phrase-${index + 201}`,
        translation: `tr-${index + 201}`,
        source_words: [],
        created_at: new Date().toISOString(),
      })),
      error: null,
    })

    mockSupabase.from
      .mockReturnValueOnce(firstQuery)
      .mockReturnValueOnce(secondQuery)

    const ids = Array.from({ length: 203 }, (_, index) => `p-${index + 1}`)
    const rows = await fetchPhraseHistoryByIds(ids)

    expect(rows).toHaveLength(203)
    expect(firstQuery.in).toHaveBeenCalledTimes(1)
    expect(secondQuery.in).toHaveBeenCalledTimes(1)
  })
})

import { act, renderHook, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Lexicard } from '@/modules/types'

const { mockSupabase, toastMock } = vi.hoisted(() => ({
  mockSupabase: { rpc: vi.fn() },
  toastMock: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/supabase', () => ({ supabase: mockSupabase }))
vi.mock('sonner', () => ({ toast: toastMock }))

import { useLexicardBoost } from '@/modules/hooks/useLexicardBoost'

const config = { targetLang: 'pl', nativeLang: 'es' }

function card(id: string, target: string, extra: Partial<Lexicard> = {}): Lexicard {
  return {
    id,
    target,
    native: target,
    targetLang: 'pl',
    nativeLang: 'es',
    importance: 'frequent',
    interval: 1,
    easeFactor: 2.5,
    streak: 0,
    lastReviewed: null,
    createdAt: 0,
    ...extra,
  }
}

function renderBoost(initial: Lexicard[], source: 'challenge' | 'preguntica' = 'challenge') {
  return renderHook(() => {
    const [cards, setCards] = useState(initial)
    return { cards, boost: useLexicardBoost({ cards, setCards, config, source }) }
  })
}

describe('useLexicardBoost (Potenciar, máximo 3 al día)', () => {
  beforeEach(() => {
    mockSupabase.rpc.mockReset()
    toastMock.success.mockReset()
    toastMock.error.mockReset()
  })

  it('distingue palabras fuera del baúl, disponibles y ya potenciadas', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: { used: 0, remaining: 3, limit: 3 }, error: null })
    const { result } = renderBoost([card('a', 'Dom'), card('b', 'kot', { boostDuel: 1 })])
    await waitFor(() => expect(result.current.boost.remaining).toBe(3))
    expect(result.current.boost.stateOf('  dom ')).toBe('available')
    expect(result.current.boost.stateOf('kot')).toBe('boosted')
    expect(result.current.boost.stateOf('pies')).toBe('none')
  })

  it('potencia la palabra, la marca como Vital y actualiza las que quedan', async () => {
    mockSupabase.rpc.mockImplementation((name: string) =>
      Promise.resolve(
        name === 'get_my_lexicard_boost_usage'
          ? { data: { used: 1, remaining: 2, limit: 3 }, error: null }
          : { data: { used: 2, remaining: 1, limit: 3 }, error: null },
      ),
    )
    const { result } = renderBoost([card('a', 'dom')], 'preguntica')
    await waitFor(() => expect(result.current.boost.remaining).toBe(2))

    let done = false
    await act(async () => {
      done = await result.current.boost.boost('dom')
    })

    expect(done).toBe(true)
    expect(mockSupabase.rpc).toHaveBeenCalledWith('boost_lexicard', { p_id: 'a', p_source: 'preguntica' })
    expect(result.current.cards[0]).toMatchObject({ importance: 'vital', boostFlash: 2, boostDaily: 2, boostDuel: 2 })
    expect(result.current.boost.remaining).toBe(1)
    expect(result.current.boost.stateOf('dom')).toBe('boosted')
    expect(toastMock.success).toHaveBeenCalledTimes(1)
  })

  it('cuando el servidor dice que ya van 3, no cambia la palabra y avisa', async () => {
    mockSupabase.rpc.mockImplementation((name: string) =>
      Promise.resolve(
        name === 'get_my_lexicard_boost_usage'
          ? { data: { used: 2, remaining: 1, limit: 3 }, error: null }
          : { data: null, error: { message: 'BOOST_DAILY_LIMIT' } },
      ),
    )
    const { result } = renderBoost([card('a', 'dom'), card('b', 'kot')])
    await waitFor(() => expect(result.current.boost.remaining).toBe(1))

    let done = true
    await act(async () => {
      done = await result.current.boost.boost('dom')
    })

    expect(done).toBe(false)
    expect(result.current.cards[0].boostFlash).toBeUndefined()
    expect(result.current.boost.remaining).toBe(0)
    expect(result.current.boost.stateOf('kot')).toBe('limit')
    expect(toastMock.error).toHaveBeenCalledTimes(1)
  })

  it('con las 3 usadas ni siquiera llama al servidor', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: { used: 3, remaining: 0, limit: 3 }, error: null })
    const { result } = renderBoost([card('a', 'dom')])
    await waitFor(() => expect(result.current.boost.remaining).toBe(0))
    mockSupabase.rpc.mockClear()

    await act(async () => {
      await result.current.boost.boost('dom')
    })

    expect(mockSupabase.rpc).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledTimes(1)
  })

  it('si la base de datos aún no tiene la versión nueva, potencia igual (sin límite que mostrar)', async () => {
    mockSupabase.rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
      if (name === 'get_my_lexicard_boost_usage') {
        return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'not found' } })
      }
      return Promise.resolve(
        'p_source' in args
          ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
          : { data: null, error: null },
      )
    })
    const { result } = renderBoost([card('a', 'dom')])

    let done = false
    await act(async () => {
      done = await result.current.boost.boost('dom')
    })

    expect(done).toBe(true)
    expect(mockSupabase.rpc).toHaveBeenLastCalledWith('boost_lexicard', { p_id: 'a' })
    expect(result.current.boost.remaining).toBeNull()
    expect(result.current.boost.stateOf('dom')).toBe('boosted')
  })
})

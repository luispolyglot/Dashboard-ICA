import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }))

const NOTE = 'note-1'
const USER = 'user-1'
const DURATION_MS = 200_000

async function load() {
  vi.resetModules()
  return import('@/modules/services/challengeUnlocks')
}

function bumpCalls() {
  return rpc.mock.calls.filter(([name]) => name === 'bump_master_note_challenge_listening')
}

describe('Nota desafiante: lo escuchado llega al servidor (Luis, 13 Oct)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    rpc.mockReset()
    window.localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('mientras se escucha, envía cada 10 s (antes no enviaba nada hasta parar)', async () => {
    rpc.mockResolvedValue({ data: [{ listened_seconds: 0, unlocked: false, accepted_seconds: 2 }], error: null })
    const { addChallengeListening } = await load()
    // 30 s escuchando: un aviso cada 2 s.
    for (let i = 0; i < 15; i += 1) {
      addChallengeListening({ userId: USER, noteId: NOTE, noteDurationMs: DURATION_MS, seconds: 2 })
      await vi.advanceTimersByTimeAsync(2_000)
    }
    expect(bumpCalls().length).toBeGreaterThanOrEqual(2)
  })

  it('lo que el servidor no cuenta se vuelve a enviar, no se pierde', async () => {
    const { addChallengeListening, getChallengeListenedSeconds } = await load()
    // El servidor solo acepta 20 s de 100 la primera vez, y el resto después.
    rpc
      .mockResolvedValueOnce({ data: [{ listened_seconds: 20, unlocked: false, accepted_seconds: 20 }], error: null })
      .mockResolvedValueOnce({ data: [{ listened_seconds: 100, unlocked: false, accepted_seconds: 80 }], error: null })
    addChallengeListening({ userId: USER, noteId: NOTE, noteDurationMs: DURATION_MS, seconds: 100 })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(bumpCalls()).toHaveLength(1)
    expect(bumpCalls()[0][1]).toMatchObject({ p_note_id: NOTE, p_delta_seconds: 100 })

    await vi.advanceTimersByTimeAsync(5_000)
    expect(bumpCalls()).toHaveLength(2)
    expect(bumpCalls()[1][1]).toMatchObject({ p_delta_seconds: 80 })
    expect(getChallengeListenedSeconds(USER, NOTE)).toBe(100)

    // Ya no queda nada pendiente.
    await vi.advanceTimersByTimeAsync(20_000)
    expect(bumpCalls()).toHaveLength(2)
  })

  it('un servidor antiguo (sin accepted_seconds) se comporta como antes', async () => {
    const { addChallengeListening } = await load()
    rpc.mockResolvedValue({ data: [{ listened_seconds: 50, unlocked: false }], error: null })
    addChallengeListening({ userId: USER, noteId: NOTE, noteDurationMs: DURATION_MS, seconds: 50 })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(bumpCalls()).toHaveLength(1)
  })
})

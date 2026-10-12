import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parsePronunciationReply } from '../../../../supabase/functions/_shared/pronunciation-prompt'

const invoke = vi.fn()
vi.mock('../../../../src/lib/supabase', () => ({ supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } } }))

describe('parsePronunciationReply', () => {
  const words = ['beaucoup', 'wyznaczać termin', 'merci']

  it('lee la lista en el mismo orden', () => {
    expect(parsePronunciationReply('["bocú","vyznáchach términ","/merssí/"]', words)).toEqual({
      beaucoup: 'bocú',
      'wyznaczać termin': 'vyznáchach términ',
      merci: 'merssí',
    })
  })

  it('aprovecha una respuesta cortada', () => {
    expect(parsePronunciationReply('["bocú","vyznáchach términ","mer', words)).toEqual({
      beaucoup: 'bocú',
      'wyznaczać termin': 'vyznáchach términ',
    })
  })

  it('acepta un objeto con las claves algo cambiadas', () => {
    expect(parsePronunciationReply('{"Beaucoup":"bocú","wyznaczać  termin":"x","merci":"merssí"}', words)).toEqual({
      beaucoup: 'bocú',
      'wyznaczać termin': 'x',
      merci: 'merssí',
    })
  })
})

describe('PronunciationHint', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
    invoke.mockReset()
    vi.resetModules()
  })

  it('reintenta sola si la primera petición falla', async () => {
    invoke
      .mockResolvedValueOnce({ data: null, error: new Error('502') })
      .mockResolvedValueOnce({ data: { result: { beaucoup: 'bocú' } }, error: null })
    const { PronunciationHint } = await import('../../../../src/modules/pronunciation/PronunciationHint')

    render(<PronunciationHint word='beaucoup' targetLang='Francés' nativeLang='Español' showLoading />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls[0][0]).toBe('anthropic-proxy')
    expect(screen.getByText('/ · · · /')).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(screen.getByText('/bocú/')).toBeTruthy()
  })
})

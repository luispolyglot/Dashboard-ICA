import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OPEN_CYCLE_CHEST_EVENT,
  hasOpenCycleChestRequest,
  requestOpenCycleChest,
  takeOpenCycleChestRequest,
} from '@/modules/game/chestRequest'

// Luis, 17 Oct: «Abrir» en el aviso del ciclo deja pedido abrir el cofre en Inicio.
describe('pedir abrir el cofre', () => {
  afterEach(() => {
    vi.useRealTimers()
    takeOpenCycleChestRequest()
  })

  it('queda pedido, avisa y solo se usa una vez', () => {
    const listener = vi.fn()
    window.addEventListener(OPEN_CYCLE_CHEST_EVENT, listener)
    requestOpenCycleChest()
    window.removeEventListener(OPEN_CYCLE_CHEST_EVENT, listener)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(hasOpenCycleChestRequest()).toBe(true)
    expect(takeOpenCycleChestRequest()).toBe(true)
    expect(takeOpenCycleChestRequest()).toBe(false)
  })

  it('caduca al minuto', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-17T12:00:00Z'))
    requestOpenCycleChest()
    vi.setSystemTime(new Date('2026-10-17T12:01:01Z'))
    expect(hasOpenCycleChestRequest()).toBe(false)
    expect(takeOpenCycleChestRequest()).toBe(false)
  })
})

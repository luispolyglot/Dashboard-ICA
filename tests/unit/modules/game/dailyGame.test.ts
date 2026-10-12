import { describe, expect, it } from 'vitest'
import { DAILY_GAME_MODES, DAILY_GAME_PASS, isDailyGamePassed } from '@/modules/game/dailyGame'

describe('reto del día', () => {
  it('tiene los modos de Desafíos ICA, Habla incluido', () => {
    expect(DAILY_GAME_MODES.map((mode) => mode.kind)).toEqual(['pairs', 'choice', 'write', 'listen', 'speak'])
  })

  it('solo cuenta como hecho con 5 aciertos o más', () => {
    expect(DAILY_GAME_PASS).toBe(5)
    expect(isDailyGamePassed(null)).toBe(false)
    expect(isDailyGamePassed({ correct: 4 })).toBe(false)
    expect(isDailyGamePassed({ correct: 5 })).toBe(true)
    expect(isDailyGamePassed({ correct: 10 })).toBe(true)
  })
})

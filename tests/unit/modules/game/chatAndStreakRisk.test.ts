import { describe, expect, it } from 'vitest'
import {
  CHAT_MESSAGES,
  CHAT_TIME_OPTIONS,
  mustWaitForOthers,
  nextQuarter,
  timeInViewerZone,
  zoneCity,
} from '../../../../src/modules/game/icademerChat'
import { getStreakRisk, msUntilMidnight } from '../../../../src/modules/game/streakRisk'

describe('chat de icademers', () => {
  it('tiene 8 mensajes cerrados con las claves que acepta el servidor', () => {
    expect(CHAT_MESSAGES.map((item) => item.kind)).toEqual([
      'club',
      'hola',
      'me_apunto',
      'hora',
      'genial',
      'nos_vemos',
      'no_puedo',
      'animo',
    ])
  })

  it('las horas van de 15 en 15 minutos', () => {
    expect(CHAT_TIME_OPTIONS).toHaveLength(96)
    expect(CHAT_TIME_OPTIONS[0]).toBe('00:00')
    expect(CHAT_TIME_OPTIONS[75]).toBe('18:45')
    expect(nextQuarter(new Date('2026-10-03T18:31:00'))).toBe('18:45')
    expect(nextQuarter(new Date('2026-10-03T18:45:00'))).toBe('19:00')
    expect(nextQuarter(new Date('2026-10-03T23:50:00'))).toBe('00:00')
  })

  it('como mucho 3 mensajes seguidos', () => {
    expect(mustWaitForOthers([{ isMe: true }, { isMe: true }])).toBe(false)
    expect(mustWaitForOthers([{ isMe: false }, { isMe: true }, { isMe: true }, { isMe: true }])).toBe(true)
    expect(mustWaitForOthers([{ isMe: true }, { isMe: true }, { isMe: false }, { isMe: true }])).toBe(false)
  })

  it('la hora se pasa a la zona de quien lee', () => {
    const at = new Date('2026-10-03T12:00:00Z')
    // Madrid (UTC+2 en octubre) → Ciudad de México (UTC-6): 8 horas menos, mismo día.
    expect(timeInViewerZone('18:45', 'Europe/Madrid', 'America/Mexico_City', at)).toEqual({ time: '10:45', dayShift: 0 })
    // Madrid → Varsovia: misma hora.
    expect(timeInViewerZone('18:45', 'Europe/Madrid', 'Europe/Warsaw', at)).toBe(null)
    expect(timeInViewerZone('18:45', null, 'Europe/Madrid', at)).toBe(null)
    // Madrid → Canarias: una hora menos y es el día anterior.
    expect(timeInViewerZone('00:15', 'Europe/Madrid', 'Atlantic/Canary', at)).toEqual({ time: '23:15', dayShift: -1 })
    // Ciudad de México 21:00 → Madrid: 05:00 del día siguiente.
    expect(timeInViewerZone('21:00', 'America/Mexico_City', 'Europe/Madrid', at)).toEqual({ time: '05:00', dayShift: 1 })
    expect(zoneCity('America/Mexico_City')).toBe('Ciudad de México')
    expect(zoneCity('Asia/Tokyo')).toBe('Tokyo')
  })
})

describe('racha en peligro', () => {
  it('avisa cuando quedan 5 horas o menos y hay racha que perder', () => {
    expect(msUntilMidnight(new Date('2026-10-03T19:00:00'))).toBe(5 * 3600000)
    expect(getStreakRisk({ streak: 12, cycleDoneToday: false, now: new Date('2026-10-03T18:59:00') }).atRisk).toBe(false)
    const risk = getStreakRisk({ streak: 12, cycleDoneToday: false, now: new Date('2026-10-03T19:28:00') })
    expect(risk).toEqual({ atRisk: true, hours: 4, minutes: 32 })
    expect(getStreakRisk({ streak: 12, cycleDoneToday: true, now: new Date('2026-10-03T21:00:00') }).atRisk).toBe(false)
    expect(getStreakRisk({ streak: 0, cycleDoneToday: false, now: new Date('2026-10-03T21:00:00') }).atRisk).toBe(false)
  })
})

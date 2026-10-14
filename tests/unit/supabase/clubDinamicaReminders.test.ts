import { describe, expect, it } from 'vitest'
import { goingText, inHowLong, othersText } from '../../../supabase/functions/calendar-push-reminders/club-dinamica'

describe('Club de DinámICA reminder texts', () => {
  it('says «En 2 horas» in the usual case', () => {
    expect(inHowLong(118)).toBe('En 2 horas')
    expect(inHowLong(106)).toBe('En 2 horas')
  })

  it('gives the real time left when the reminder went out late', () => {
    expect(inHowLong(100)).toBe('En 1 h 40 min')
    expect(inHowLong(60)).toBe('En 1 hora')
    expect(inHowLong(25)).toBe('En 25 minutos')
  })

  it('writes one text for those going and another for the rest of the chat', () => {
    expect(goingText('En 2 horas', '19:30')).toBe(
      'En 2 horas tienes el Club de DinámICA (a las 19:30). Recuerda unirte desde el chat de icademers.',
    )
    expect(othersText('En 2 horas', '19:30', 3)).toBe(
      'En 2 horas se hará el Club de DinámICA (a las 19:30): ya se han apuntado 3 icademers. ¡Únete desde el chat!',
    )
  })
})

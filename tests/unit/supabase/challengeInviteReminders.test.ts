import { describe, expect, it } from 'vitest'
import { inviteReminderText, timeLeftText } from '../../../supabase/functions/calendar-push-reminders/challenge-invite-reminders'

describe('Reminder before a challenge invitation expires', () => {
  it('says «3 horas» in the usual case and the real time when it went out late', () => {
    expect(timeLeftText(178)).toBe('3 horas')
    expect(timeLeftText(165)).toBe('3 horas')
    expect(timeLeftText(150)).toBe('2 h 30 min')
    expect(timeLeftText(120)).toBe('2 horas')
    expect(timeLeftText(60)).toBe('1 hora')
    expect(timeLeftText(25)).toBe('25 minutos')
  })

  it('names who challenged you, or says it without a name', () => {
    expect(inviteReminderText('Ana', '3 horas')).toEqual({
      title: 'Tu desafío ICA caduca pronto',
      body: 'Ana te retó a un desafío ICA. Te quedan 3 horas para aceptarlo.',
    })
    expect(inviteReminderText('', '3 horas').body).toBe('Tienes un desafío ICA sin aceptar. Te quedan 3 horas para aceptarlo.')
  })
})

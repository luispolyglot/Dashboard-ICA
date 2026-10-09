import { describe, expect, it } from 'vitest'
import {
  buildCalendarChangePush,
  isInQuietHours,
  madridClassStart,
  mergeCalendarChanges,
  type CalendarChangeRow,
} from '../../../../supabase/functions/_shared/calendar-change-notices'

function row(partial: Partial<CalendarChangeRow>): CalendarChangeRow {
  return {
    id: 1,
    calendar_entry_id: 'entry-1',
    user_id: 'user-1',
    role: 'student',
    class_key: 'polaco',
    class_name: 'Polaco',
    old_date: '2026-10-15',
    old_time: '18:00:00',
    new_date: '2026-10-15',
    new_time: '19:00:00',
    ...partial,
  }
}

describe('calendar change notices', () => {
  it('reads class times in Madrid time, summer and winter', () => {
    expect(madridClassStart('2026-10-15', '18:00:00')?.toISOString()).toBe('2026-10-15T16:00:00.000Z')
    expect(madridClassStart('2026-11-05', '18:30')?.toISOString()).toBe('2026-11-05T17:30:00.000Z')
  })

  it('says the new time when only the time changes', () => {
    const [notice] = mergeCalendarChanges([row({})])
    const push = buildCalendarChangePush(notice, 'Europe/Madrid')
    expect(push?.title).toBe('Cambio en la clase de Polaco')
    expect(push?.body).toBe('La clase del jueves 15 de octubre pasa a las 19h (antes a las 18h).')
    expect(push?.url).toBe('/calendar-icademy')
  })

  it('says the new day and time when the day changes', () => {
    const [notice] = mergeCalendarChanges([row({ new_date: '2026-10-16', new_time: '18:30:00' })])
    expect(buildCalendarChangePush(notice, 'Europe/Madrid')?.body).toBe(
      'La clase del jueves 15 de octubre pasa al viernes 16 de octubre a las 18h30.',
    )
  })

  it('uses the person own time zone', () => {
    const [notice] = mergeCalendarChanges([row({})])
    expect(buildCalendarChangePush(notice, 'America/Bogota')?.body).toBe(
      'La clase del jueves 15 de octubre pasa a las 12h, hora de tu zona (antes a las 11h).',
    )
  })

  it('joins several changes of the same class into one notice', () => {
    const notices = mergeCalendarChanges([
      row({ id: 2, old_time: '19:00:00', new_time: '20:00:00' }),
      row({ id: 1 }),
      row({ id: 3, user_id: 'user-2' }),
    ])
    expect(notices).toHaveLength(2)
    const first = notices.find((notice) => notice.userId === 'user-1')!
    expect(first.ids).toEqual([1, 2])
    expect(first.oldTime).toBe('18:00:00')
    expect(first.newTime).toBe('20:00:00')
  })

  it('sends nothing when the class is moved back to where it was', () => {
    const [notice] = mergeCalendarChanges([
      row({ id: 1 }),
      row({ id: 2, old_time: '19:00:00', new_time: '18:00:00' }),
    ])
    expect(buildCalendarChangePush(notice, 'Europe/Madrid')).toBeNull()
  })

  it('gives the teacher their own title', () => {
    const [notice] = mergeCalendarChanges([row({ role: 'teacher' })])
    expect(buildCalendarChangePush(notice, 'Europe/Madrid')?.title).toBe('Cambio en tu clase de Polaco')
  })

  it('respects quiet hours, also across midnight', () => {
    const night = new Date('2026-10-15T22:30:00Z') // 00:30 in Madrid
    expect(isInQuietHours(night, 'Europe/Madrid', '23:00', '08:00')).toBe(true)
    expect(isInQuietHours(night, 'Europe/Madrid', null, null)).toBe(false)
    const day = new Date('2026-10-15T10:00:00Z') // 12:00 in Madrid
    expect(isInQuietHours(day, 'Europe/Madrid', '23:00', '08:00')).toBe(false)
  })
})

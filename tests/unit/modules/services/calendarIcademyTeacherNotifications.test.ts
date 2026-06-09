import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: mockSupabase,
}))

import {
  fetchMyCalendarIcademyTeacherNotificationPreference,
  upsertMyCalendarIcademyTeacherNotificationPreference,
} from '@/modules/services/calendarIcademyTeacherNotifications'

describe('calendarIcademyTeacherNotifications service', () => {
  beforeEach(() => {
    mockSupabase.auth.getUser.mockReset()
    mockSupabase.from.mockReset()
  })

  it('returns null when current user is not a teacher', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })

    const teacherMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const teacherEq = vi.fn().mockReturnValue({ maybeSingle: teacherMaybeSingle })
    const teacherSelect = vi.fn().mockReturnValue({ eq: teacherEq })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'icademy_teachers') return { select: teacherSelect }
      throw new Error(`Unexpected table ${table}`)
    })

    const result = await fetchMyCalendarIcademyTeacherNotificationPreference()

    expect(result).toBeNull()
  })

  it('upserts teacher preferences with normalized minutes', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-2' } },
      error: null,
    })

    const teacherMaybeSingle = vi.fn().mockResolvedValue({
      data: { user_id: 'user-2' },
      error: null,
    })
    const teacherEq = vi.fn().mockReturnValue({ maybeSingle: teacherMaybeSingle })
    const teacherSelect = vi.fn().mockReturnValue({ eq: teacherEq })

    const preferenceSingle = vi.fn().mockResolvedValue({
      data: {
        user_id: 'user-2',
        notifications_enabled: true,
        minutes_before: 30,
        quiet_hours_start: null,
        quiet_hours_end: null,
        last_notified_for_session_id: null,
        last_notified_at: null,
        created_at: '2026-06-09T00:00:00.000Z',
        updated_at: '2026-06-09T00:00:00.000Z',
      },
      error: null,
    })
    const preferenceSelect = vi.fn().mockReturnValue({ single: preferenceSingle })
    const preferenceUpsert = vi.fn().mockReturnValue({ select: preferenceSelect })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'icademy_teachers') return { select: teacherSelect }
      if (table === 'users_calendar_icademy_teacher_notifications') {
        return { upsert: preferenceUpsert }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    const result = await upsertMyCalendarIcademyTeacherNotificationPreference({
      notificationsEnabled: true,
      minutesBefore: 44,
    })

    expect(preferenceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-2',
        notifications_enabled: true,
        minutes_before: 30,
      }),
      { onConflict: 'user_id' },
    )
    expect(result.minutesBefore).toBe(30)
  })
})

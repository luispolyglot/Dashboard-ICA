import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(),
  },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: mockSupabase,
}))

import {
  createCalendarIcademyEntry,
  fetchCalendarIcademyEntries,
} from '@/modules/services/calendarIcademy'

describe('calendarIcademy service', () => {
  beforeEach(() => {
    mockSupabase.from.mockReset()
  })

  it('maps teacher from related teacher table when available', async () => {
    const order3 = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'entry-1',
          class_key: 'en_basico',
          class_name: 'Ingles Basico',
          language_code: 'en',
          session_date: '2026-06-10',
          session_time: '18:00:00',
          teacher_id: 'a839646b-049f-4f9f-82cb-12cd7a3e4334',
          teacher: 'Legacy Name',
          group_name: null,
          note: null,
          created_at: '2026-06-09T10:00:00.000Z',
          updated_at: '2026-06-09T10:00:00.000Z',
          teacher_ref: { display_name: 'Profesor Real' },
        },
      ],
      error: null,
    })
    const order2 = vi.fn().mockReturnValue({ order: order3 })
    const order1 = vi.fn().mockReturnValue({ order: order2 })
    const select = vi.fn().mockReturnValue({ order: order1 })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'calendar_icademy') return { select }
      throw new Error(`Unexpected table ${table}`)
    })

    const rows = await fetchCalendarIcademyEntries()

    expect(rows).toHaveLength(1)
    expect(rows[0].teacher).toBe('Profesor Real')
    expect(rows[0].teacherId).toBe('a839646b-049f-4f9f-82cb-12cd7a3e4334')
  })

  it('sends teacher_id when creating a class', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'entry-1',
        class_key: 'en_basico',
        class_name: 'Ingles Basico',
        language_code: 'en',
        session_date: '2026-06-10',
        session_time: '18:00:00',
        teacher_id: 'a839646b-049f-4f9f-82cb-12cd7a3e4334',
        teacher: 'Profesor Real',
        group_name: null,
        note: null,
        created_at: '2026-06-09T10:00:00.000Z',
        updated_at: '2026-06-09T10:00:00.000Z',
        teacher_ref: { display_name: 'Profesor Real' },
      },
      error: null,
    })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'calendar_icademy') return { insert }
      throw new Error(`Unexpected table ${table}`)
    })

    await createCalendarIcademyEntry({
      classKey: 'en_basico',
      className: 'ignored',
      languageCode: 'ignored',
      sessionDate: '2026-06-10',
      sessionTime: '18:00',
      teacherId: 'a839646b-049f-4f9f-82cb-12cd7a3e4334',
      groupName: '',
      note: '',
    })

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        teacher_id: 'a839646b-049f-4f9f-82cb-12cd7a3e4334',
      }),
    )
    expect(insert).not.toHaveBeenCalledWith(
      expect.objectContaining({ teacher: expect.any(String) }),
    )
  })
})

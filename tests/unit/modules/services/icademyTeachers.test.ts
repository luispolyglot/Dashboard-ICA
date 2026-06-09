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
  createIcademyTeacher,
  fetchIcademyTeacherAssignableUsers,
} from '@/modules/services/icademyTeachers'

describe('icademyTeachers service', () => {
  beforeEach(() => {
    mockSupabase.from.mockReset()
  })

  it('marks users already assigned as teachers', async () => {
    const profilesLimit = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'user-1',
          display_name: 'Ana',
          username: 'ana',
          created_at: '2026-06-01T00:00:00.000Z',
        },
        {
          id: 'user-2',
          display_name: null,
          username: 'pedro',
          created_at: '2026-06-02T00:00:00.000Z',
        },
      ],
      error: null,
    })
    const profilesOrder = vi.fn().mockReturnValue({ limit: profilesLimit })
    const profilesSelect = vi.fn().mockReturnValue({ order: profilesOrder })

    const teachersSelect = vi.fn().mockResolvedValue({
      data: [{ user_id: 'user-2' }],
      error: null,
    })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'profiles') return { select: profilesSelect }
      if (table === 'icademy_teachers') return { select: teachersSelect }
      throw new Error(`Unexpected table ${table}`)
    })

    const rows = await fetchIcademyTeacherAssignableUsers()

    expect(rows).toEqual([
      expect.objectContaining({
        userId: 'user-1',
        displayName: 'Ana',
        isTeacher: false,
      }),
      expect.objectContaining({
        userId: 'user-2',
        displayName: 'pedro',
        isTeacher: true,
      }),
    ])
  })

  it('creates teacher row with normalized fields', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'icademy_teachers') return { insert }
      throw new Error(`Unexpected table ${table}`)
    })

    await createIcademyTeacher({
      userId: 'user-9',
      displayName: '  ',
      username: 'marta',
    })

    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-9',
      display_name: 'marta',
      username: 'marta',
    })
  })
})

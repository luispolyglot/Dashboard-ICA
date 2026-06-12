import { describe, expect, it } from 'vitest'
import { canManageSession } from '../../../../../supabase/functions/coaching-center/access-control'

describe('canManageSession', () => {
  it('allows super admin on any session', () => {
    expect(
      canManageSession(
        { adminRole: 'super_admin', userId: 'admin-1' },
        null,
      ),
    ).toBe(true)

    expect(
      canManageSession(
        { adminRole: 'super_admin', userId: 'admin-1' },
        'coach-5',
      ),
    ).toBe(true)
  })

  it('restricts coach admin to own sessions', () => {
    expect(
      canManageSession(
        { adminRole: 'coach_admin', userId: 'coach-1' },
        'coach-1',
      ),
    ).toBe(true)

    expect(
      canManageSession(
        { adminRole: 'coach_admin', userId: 'coach-1' },
        'coach-2',
      ),
    ).toBe(false)

    expect(
      canManageSession(
        { adminRole: 'coach_admin', userId: 'coach-1' },
        null,
      ),
    ).toBe(false)
  })
})

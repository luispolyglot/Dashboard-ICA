import { describe, expect, it } from 'vitest'
import { committedChallengeCount } from '@/modules/services/icaChallenges'

const ME = 'me'
const row = (id: string, status: string, challenger: string, challenged: string) => ({
  id,
  status: status as 'created' | 'in_progress' | 'completed',
  challengerUserId: challenger,
  challengedUserId: challenged,
})

describe('committedChallengeCount (desafío extra al aceptar)', () => {
  it('counts games in progress and invitations I sent, not invitations I received', () => {
    const rows = [
      row('a', 'in_progress', 'x', ME),
      row('b', 'in_progress', ME, 'y'),
      row('c', 'created', ME, 'z'),
      row('d', 'created', 'w', ME),
      row('e', 'completed', ME, 'v'),
    ]
    expect(committedChallengeCount(rows, ME)).toBe(3)
  })

  it('leaves out the invitation being accepted', () => {
    const rows = [row('a', 'in_progress', 'x', ME), row('d', 'created', 'w', ME)]
    expect(committedChallengeCount(rows, ME, 'd')).toBe(1)
  })

  it('is 0 without a user', () => {
    expect(committedChallengeCount([row('a', 'in_progress', 'x', ME)], null)).toBe(0)
  })
})

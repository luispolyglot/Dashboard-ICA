import { describe, expect, it, vi } from 'vitest'
import {
  buildChallengeJobPush,
  firstNameOf,
  sendIcaChallengeJobNotices,
  type ChallengeJobNoticeRow,
} from '../../../../supabase/functions/_shared/ica-challenge-job-notices'

const row = (patch: Partial<ChallengeJobNoticeRow>): ChallengeJobNoticeRow => ({
  id: 1,
  challenge_id: 'c1',
  user_id: 'u1',
  rival_user_id: 'u2',
  kind: 'finished',
  outcome: null,
  timed_out: false,
  ...patch,
})

describe('challenge notices sent after the expiration job', () => {
  it('uses the first name of the rival', () => {
    expect(firstNameOf('Sofía García', 'sofi')).toBe('Sofía')
    expect(firstNameOf('  ', 'sofi')).toBe('sofi')
    expect(firstNameOf(null, null)).toBe('')
  })

  it('says who did not answer an invitation, with a fallback without name', () => {
    expect(buildChallengeJobPush(row({ kind: 'invite_expired' }), 'Sofía', false)).toMatchObject({
      userId: 'u1',
      title: 'Desafío sin respuesta',
      body: 'Sofía no respondió a tiempo a tu desafío ICA. Puedes volver a retarle cuando quieras.',
      url: '/desafios-ica',
    })
    expect(buildChallengeJobPush(row({ kind: 'invite_missed' }), '', false)?.body).toBe(
      'Se acabó el plazo para responder al desafío de tu rival.',
    )
  })

  it('tells both players about a lost turn', () => {
    expect(buildChallengeJobPush(row({ kind: 'turn_lost' }), 'Sofía', false)).toMatchObject({
      title: 'Se te pasó el turno',
      body: 'No jugaste tu ronda a tiempo. Ahora le toca a Sofía.',
      url: '/desafios-ica/c1',
    })
    expect(buildChallengeJobPush(row({ kind: 'your_turn' }), 'Sofía', false)).toMatchObject({
      title: 'Te toca jugar',
      tag: 'ica-challenge-turn-c1',
    })
  })

  it('invites the winner to collect the coin only when it was credited', () => {
    expect(buildChallengeJobPush(row({ outcome: 'won' }), 'Sofía', true)?.body).toBe(
      '¡Has ganado el desafío ICA! Recoge tu recompensa.',
    )
    expect(buildChallengeJobPush(row({ outcome: 'won' }), 'Sofía', false)?.body).toBe(
      '¡Has ganado el desafío ICA! Mira tus resultados.',
    )
    expect(buildChallengeJobPush(row({ outcome: 'lost', timed_out: true }), 'Sofía', false)?.body).toBe(
      'Se te pasó el turno y Sofía ha ganado esta vez.',
    )
  })

  it('never throws when the queue cannot be read', async () => {
    const adminClient = { rpc: vi.fn().mockRejectedValue(new Error('down')) }
    const webpush = { sendNotification: vi.fn() }
    await expect(sendIcaChallengeJobNotices({ adminClient, webpush })).resolves.toEqual({ notices: 0, sent: 0 })
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })
})

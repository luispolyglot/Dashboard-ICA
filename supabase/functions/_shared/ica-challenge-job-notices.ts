// Push notices for challenge changes made by the pg_cron job (run_ica_challenges_expiration_job):
// invitation not answered in time, challenge expired, turn lost, and a challenge closed by a turn
// timeout (Luis, 6 Oct). The job cannot send web push, so a trigger queues one row per player in
// public.ica_challenge_push_outbox and the scheduled reminder functions
// (calendar-push-reminders, streak-push-reminders) send them on their next run.

export type ChallengeJobNoticeKind =
  | 'invite_expired'
  | 'invite_missed'
  | 'challenge_expired'
  | 'turn_lost'
  | 'your_turn'
  | 'finished'

export type ChallengeJobNoticeRow = {
  id: number
  challenge_id: string
  user_id: string
  rival_user_id: string | null
  kind: ChallengeJobNoticeKind
  outcome: 'won' | 'lost' | 'draw' | null
  timed_out: boolean
}

export type ChallengeJobPush = {
  userId: string
  title: string
  body: string
  tag: string
  url: string
}

export function firstNameOf(displayName: string | null | undefined, username?: string | null): string {
  const name = (displayName || '').trim() || (username || '').trim()
  return name.split(/\s+/)[0] || ''
}

/** Text of each notice. `rivalName` may be empty; `winnerGotCoins` only matters for a win. */
export function buildChallengeJobPush(
  row: ChallengeJobNoticeRow,
  rivalName: string,
  winnerGotCoins: boolean,
): ChallengeJobPush | null {
  const rival = rivalName || 'Tu rival'
  const rivalLower = rivalName || 'tu rival'
  const challengeUrl = `/desafios-ica/${row.challenge_id}`
  const base = { userId: row.user_id }

  switch (row.kind) {
    case 'invite_expired':
      return {
        ...base,
        title: 'Desafío sin respuesta',
        body: `${rival} no respondió a tiempo a tu desafío ICA. Puedes volver a retarle cuando quieras.`,
        tag: `ica-challenge-invite-expired-${row.challenge_id}`,
        url: '/desafios-ica',
      }
    case 'invite_missed':
      return {
        ...base,
        title: 'Desafío caducado',
        body: `Se acabó el plazo para responder al desafío de ${rivalLower}.`,
        tag: `ica-challenge-invite-expired-${row.challenge_id}`,
        url: '/desafios-ica',
      }
    case 'challenge_expired':
      return {
        ...base,
        title: 'Desafío caducado',
        body: `Se acabó el tiempo del desafío con ${rivalLower}.`,
        tag: `ica-challenge-expired-${row.challenge_id}`,
        url: challengeUrl,
      }
    case 'turn_lost':
      return {
        ...base,
        title: 'Se te pasó el turno',
        body: `No jugaste tu ronda a tiempo. Ahora le toca a ${rivalLower}.`,
        tag: `ica-challenge-turn-lost-${row.challenge_id}`,
        url: challengeUrl,
      }
    case 'your_turn':
      return {
        ...base,
        title: 'Te toca jugar',
        body: `A ${rivalLower} se le pasó el turno. Continúa el desafío ICA.`,
        tag: `ica-challenge-turn-${row.challenge_id}`,
        url: challengeUrl,
      }
    case 'finished': {
      const body =
        row.outcome === 'won'
          ? winnerGotCoins
            ? '¡Has ganado el desafío ICA! Recoge tu recompensa.'
            : '¡Has ganado el desafío ICA! Mira tus resultados.'
          : row.outcome === 'lost'
            ? row.timed_out
              ? `Se te pasó el turno y ${rivalLower} ha ganado esta vez.`
              : 'Tu rival ha ganado esta vez. Mira tus palabras en Desafíos ICA.'
            : 'Empate en el desafío ICA. ¡Revisa las palabras!'
      return {
        ...base,
        title: 'Desafío terminado',
        body,
        tag: `ica-challenge-finished-${row.challenge_id}`,
        url: challengeUrl,
      }
    }
    default:
      return null
  }
}

type PushSubscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }

type WebPushLike = {
  sendNotification: (
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ) => Promise<unknown>
}

// deno-lint-ignore no-explicit-any
type AdminClientLike = any

/**
 * Claims the queued notices and sends them. Never throws: a failure here must not stop the
 * reminders of the function that calls it. Returns how many pushes were delivered.
 */
export async function sendIcaChallengeJobNotices(input: {
  adminClient: AdminClientLike
  webpush: WebPushLike
}): Promise<{ notices: number; sent: number }> {
  const { adminClient, webpush } = input
  try {
    const { data, error } = await adminClient.rpc('claim_ica_challenge_push_outbox', { p_limit: 200 })
    if (error) return { notices: 0, sent: 0 }
    const rows = (data || []) as ChallengeJobNoticeRow[]
    if (rows.length === 0) return { notices: 0, sent: 0 }

    const userIds = [...new Set(rows.map((row) => row.user_id))]
    const rivalIds = [...new Set(rows.map((row) => row.rival_user_id).filter((id): id is string => Boolean(id)))]
    const wonChallengeIds = [...new Set(rows.filter((row) => row.outcome === 'won').map((row) => row.challenge_id))]

    const [subscriptionsResult, profilesResult, ledgerResult] = await Promise.all([
      adminClient
        .from('user_push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth')
        .in('user_id', userIds)
        .eq('is_active', true),
      rivalIds.length > 0
        ? adminClient.from('profiles').select('id, display_name, username').in('id', rivalIds)
        : Promise.resolve({ data: [], error: null }),
      wonChallengeIds.length > 0
        ? adminClient
            .from('preguntica_token_ledger')
            .select('user_id, reference_key, tokens_delta')
            .eq('entry_type', 'challenge_win')
            .in('reference_key', wonChallengeIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    const subscriptionsByUser = new Map<string, PushSubscription[]>()
    for (const subscription of (subscriptionsResult.data || []) as PushSubscription[]) {
      const list = subscriptionsByUser.get(subscription.user_id) || []
      list.push(subscription)
      subscriptionsByUser.set(subscription.user_id, list)
    }
    const rivalNames = new Map<string, string>()
    for (const profile of (profilesResult.data || []) as Array<{
      id: string
      display_name: string | null
      username: string | null
    }>) {
      rivalNames.set(profile.id, firstNameOf(profile.display_name, profile.username))
    }
    const coinWins = new Set<string>()
    for (const entry of (ledgerResult.data || []) as Array<{
      user_id: string
      reference_key: string
      tokens_delta: number | string
    }>) {
      if (Number(entry.tokens_delta || 0) > 0) coinWins.add(`${entry.user_id}:${entry.reference_key}`)
    }

    let sent = 0
    for (const row of rows) {
      const push = buildChallengeJobPush(
        row,
        row.rival_user_id ? rivalNames.get(row.rival_user_id) || '' : '',
        coinWins.has(`${row.user_id}:${row.challenge_id}`),
      )
      if (!push) continue
      const payload = JSON.stringify({ title: push.title, body: push.body, tag: push.tag, url: push.url })
      for (const subscription of subscriptionsByUser.get(row.user_id) || []) {
        try {
          await webpush.sendNotification(
            { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
            payload,
          )
          sent += 1
        } catch (err) {
          const statusCode = Number((err as { statusCode?: number }).statusCode || 0)
          if (statusCode === 404 || statusCode === 410) {
            await adminClient
              .from('user_push_subscriptions')
              .update({ is_active: false, last_seen_at: new Date().toISOString() })
              .eq('id', subscription.id)
          }
        }
      }
    }
    return { notices: rows.length, sent }
  } catch {
    return { notices: 0, sent: 0 }
  }
}

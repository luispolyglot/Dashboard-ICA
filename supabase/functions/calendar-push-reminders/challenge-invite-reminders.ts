// DESAFÍOS ICA: AVISO ANTES DE QUE CADUQUE UN RETO (Luis, 16 Oct).
// A challenge not accepted expires 12 hours after it was sent. With 3 hours left, whoever was
// challenged gets «Ana te retó a un desafío ICA. Te quedan 3 horas para aceptarlo.»
// (claim_ica_challenge_invite_reminders, migration 20261016100200; each challenge only once).
// Never throws: a failure here must not stop the class reminders.

type AdminClient = {
  // deno-lint-ignore no-explicit-any
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>
  // deno-lint-ignore no-explicit-any
  from: (table: string) => any
}

type WebPush = {
  sendNotification: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>
}

type DueInvite = {
  challenge_id: string
  challenged_user_id: string
  challenger_user_id: string | null
  accept_until: string
}

/** «3 horas» (the usual case), or the real time left if the reminder went out late. */
export function timeLeftText(minutes: number): string {
  if (minutes >= 165) return '3 horas'
  const hours = Math.floor(minutes / 60)
  const rest = Math.max(0, Math.round((minutes % 60) / 5) * 5)
  if (hours === 0) return `${Math.max(10, rest)} minutos`
  if (rest === 0) return `${hours} hora${hours > 1 ? 's' : ''}`
  return `${hours} h ${rest} min`
}

export function inviteReminderText(challengerName: string, left: string): { title: string; body: string } {
  return {
    title: 'Tu desafío ICA caduca pronto',
    body: challengerName
      ? `${challengerName} te retó a un desafío ICA. Te quedan ${left} para aceptarlo.`
      : `Tienes un desafío ICA sin aceptar. Te quedan ${left} para aceptarlo.`,
  }
}

function firstName(displayName: string | null | undefined, username: string | null | undefined): string {
  const name = (displayName || '').trim() || (username || '').trim()
  return name.split(/\s+/)[0] || ''
}

export async function sendIcaChallengeInviteReminders({
  adminClient,
  webpush,
}: {
  adminClient: AdminClient
  webpush: WebPush
}): Promise<{ reminders: number; sent: number }> {
  let sent = 0
  try {
    const { data, error } = await adminClient.rpc('claim_ica_challenge_invite_reminders', { p_limit: 200 })
    if (error) {
      console.warn('challenge-invite-reminders: claim failed', error.message)
      return { reminders: 0, sent }
    }
    const invites = (data || []) as DueInvite[]
    if (invites.length === 0) return { reminders: 0, sent }

    const userIds = [...new Set(invites.map((row) => row.challenged_user_id))]
    const challengerIds = [...new Set(invites.map((row) => row.challenger_user_id).filter((id): id is string => Boolean(id)))]
    const [subscriptionsResult, profilesResult] = await Promise.all([
      adminClient.from('user_push_subscriptions').select('id, user_id, endpoint, p256dh, auth').eq('is_active', true).in('user_id', userIds),
      challengerIds.length > 0
        ? adminClient.from('profiles').select('id, display_name, username').in('id', challengerIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (subscriptionsResult.error) {
      console.warn('challenge-invite-reminders: subscriptions failed', subscriptionsResult.error.message)
      return { reminders: invites.length, sent }
    }
    const names = new Map<string, string>()
    for (const row of (profilesResult.data || []) as Array<{ id: string; display_name: string | null; username: string | null }>) {
      names.set(row.id, firstName(row.display_name, row.username))
    }
    const subscriptionsByUser = new Map<string, Array<{ id: string; endpoint: string; p256dh: string; auth: string }>>()
    for (const row of (subscriptionsResult.data || []) as Array<{ id: string; user_id: string; endpoint: string; p256dh: string; auth: string }>) {
      const list = subscriptionsByUser.get(row.user_id) || []
      list.push(row)
      subscriptionsByUser.set(row.user_id, list)
    }

    const now = Date.now()
    for (const invite of invites) {
      const minutesLeft = Math.round((new Date(invite.accept_until).getTime() - now) / 60000)
      const text = inviteReminderText(
        invite.challenger_user_id ? names.get(invite.challenger_user_id) || '' : '',
        timeLeftText(minutesLeft),
      )
      const payload = JSON.stringify({
        title: text.title,
        body: text.body,
        url: '/desafios-ica?tab=pending',
        tag: `ica-challenge-invite-reminder-${invite.challenge_id}`,
      })
      for (const subscription of subscriptionsByUser.get(invite.challenged_user_id) || []) {
        try {
          await webpush.sendNotification(
            { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
            payload,
          )
          sent += 1
        } catch (err) {
          const statusCode = Number((err as { statusCode?: number })?.statusCode || 0)
          if (statusCode === 404 || statusCode === 410) {
            await adminClient
              .from('user_push_subscriptions')
              .update({ is_active: false, last_seen_at: new Date().toISOString() })
              .eq('id', subscription.id)
          }
        }
      }
    }
    return { reminders: invites.length, sent }
  } catch (error) {
    console.warn('challenge-invite-reminders: failed', error instanceof Error ? error.message : String(error))
    return { reminders: 0, sent }
  }
}

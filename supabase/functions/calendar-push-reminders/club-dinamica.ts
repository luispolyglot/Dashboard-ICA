// CLUB DE DINÁMICA: AVISO 2 HORAS ANTES (Luis, 14 Oct).
// For each «Proponer día y hora» of the icademers chat that starts in 2 hours
// (claim_club_dinamica_reminders, migration 20261014100000):
//  - whoever tapped «Me apunto»: «En 2 horas tienes el Club de DinámICA (a las 19:30)…»;
//  - if 2 or more are going, everyone else in that chat with its notifications on:
//    «En 2 horas se hará el Club de DinámICA: ya se han apuntado 3 icademers…».
// The time is shown in each person's own time zone (profiles.timezone). Never throws: a failure
// here must not stop the class reminders.

type AdminClient = {
  // deno-lint-ignore no-explicit-any
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>
  // deno-lint-ignore no-explicit-any
  from: (table: string) => any
}

type WebPush = {
  sendNotification: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>
}

type DueProposal = {
  message_id: string
  target_lang: string
  starts_at: string
  going_user_ids: string[] | null
  others_user_ids: string[] | null
}

function validZone(zone: string | null | undefined): string | null {
  if (!zone) return null
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date())
    return zone
  } catch {
    return null
  }
}

/** «19:30» in the person's zone. */
function timeIn(at: Date, zone: string | null): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: zone || 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at)
}

/** «En 2 horas» (the usual case) or «En 1 h 40 min» if the reminder went out late. */
export function inHowLong(minutes: number): string {
  if (minutes >= 105) return 'En 2 horas'
  const hours = Math.floor(minutes / 60)
  const rest = Math.max(0, Math.round((minutes % 60) / 5) * 5)
  if (hours === 0) return `En ${Math.max(5, rest)} minutos`
  return rest === 0 ? `En ${hours} hora${hours > 1 ? 's' : ''}` : `En ${hours} h ${rest} min`
}

export function goingText(when: string, time: string): string {
  return `${when} tienes el Club de DinámICA (a las ${time}). Recuerda unirte desde el chat de icademers.`
}

export function othersText(when: string, time: string, going: number): string {
  return `${when} se hará el Club de DinámICA (a las ${time}): ya se han apuntado ${going} icademers. ¡Únete desde el chat!`
}

export async function sendClubDinamicaReminders({
  adminClient,
  webpush,
}: {
  adminClient: AdminClient
  webpush: WebPush
}): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0
  try {
    const { data, error } = await adminClient.rpc('claim_club_dinamica_reminders')
    if (error) {
      console.warn('club-dinamica: claim failed', error.message)
      return { sent, failed }
    }
    const proposals = (data || []) as DueProposal[]
    if (proposals.length === 0) return { sent, failed }

    const userIds = Array.from(
      new Set(proposals.flatMap((row) => [...(row.going_user_ids || []), ...(row.others_user_ids || [])])),
    )
    if (userIds.length === 0) return { sent, failed }

    const [subscriptionsResult, profilesResult] = await Promise.all([
      adminClient.from('user_push_subscriptions').select('id, user_id, endpoint, p256dh, auth').eq('is_active', true).in('user_id', userIds),
      adminClient.from('profiles').select('id, timezone').in('id', userIds),
    ])
    if (subscriptionsResult.error) {
      console.warn('club-dinamica: subscriptions failed', subscriptionsResult.error.message)
      return { sent, failed }
    }
    const zoneByUser = new Map<string, string | null>(
      ((profilesResult.data || []) as Array<{ id: string; timezone: string | null }>).map((row) => [row.id, validZone(row.timezone)]),
    )
    const subscriptionsByUser = new Map<string, Array<{ id: string; endpoint: string; p256dh: string; auth: string }>>()
    for (const row of (subscriptionsResult.data || []) as Array<{ id: string; user_id: string; endpoint: string; p256dh: string; auth: string }>) {
      const list = subscriptionsByUser.get(row.user_id) || []
      list.push(row)
      subscriptionsByUser.set(row.user_id, list)
    }

    const now = Date.now()
    for (const proposal of proposals) {
      const startsAt = new Date(proposal.starts_at)
      const when = inHowLong(Math.round((startsAt.getTime() - now) / 60000))
      const going = proposal.going_user_ids || []
      const language = String(proposal.target_lang || '').toLowerCase()
      const recipients: Array<{ userId: string; body: string }> = [
        ...going.map((userId) => ({ userId, body: goingText(when, timeIn(startsAt, zoneByUser.get(userId) ?? null)) })),
        ...(proposal.others_user_ids || []).map((userId) => ({
          userId,
          body: othersText(when, timeIn(startsAt, zoneByUser.get(userId) ?? null), going.length),
        })),
      ]
      for (const recipient of recipients) {
        for (const subscription of subscriptionsByUser.get(recipient.userId) || []) {
          try {
            await webpush.sendNotification(
              { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
              JSON.stringify({
                title: `Icademers de ${language}`,
                body: recipient.body,
                url: '/chat-icademers',
                tag: `club-dinamica-${proposal.message_id}`,
                icon: '/push-chat-192.png',
              }),
            )
            sent += 1
          } catch (error) {
            failed += 1
            const statusCode = Number((error as { statusCode?: number })?.statusCode || 0)
            if (statusCode === 404 || statusCode === 410) {
              await adminClient
                .from('user_push_subscriptions')
                .update({ is_active: false, last_seen_at: new Date().toISOString() })
                .eq('id', subscription.id)
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn('club-dinamica: reminders failed', error instanceof Error ? error.message : String(error))
  }
  return { sent, failed }
}

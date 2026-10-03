import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

// CHAT DE ICADEMERS: notificación al llegar un mensaje.
// La llama la app de quien escribe, justo después de enviar (`{ messageId }`). La función:
//  - comprueba que el mensaje es de quien llama, es de hace menos de 2 minutos y aún no avisó
//    (push_sent_at: cada mensaje avisa una sola vez);
//  - avisa a los miembros del chat con las notificaciones activadas que no lo han leído y a los
//    que no se avisó en los últimos 10 minutos (si hay mucha conversación, un solo aviso);
//  - la hora de «¿A las…?» llega en la hora local de cada uno (profiles.timezone).

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const RECENT_MS = 2 * 60 * 1000
const THROTTLE_MS = 10 * 60 * 1000

const MESSAGE_TEXT: Record<string, string> = {
  club: '¿Alguien se apunta al Club de DinámICA?',
  hola: '¡Hola!',
  me_apunto: '¡Yo me apunto!',
  hora: '¿A las {time}?',
  genial: '¡Genial!',
  nos_vemos: '¡Nos vemos allí!',
  no_puedo: 'Hoy no puedo',
  animo: '¡Ánimo con la racha ICA!',
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
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

/** Minutos que una zona va por delante de UTC en un momento dado. */
function offsetMinutes(zone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'))
  return Math.round((asUtc - at.getTime()) / 60000)
}

/** «18:45» de la zona de quien escribe, pasada a la zona de quien recibe. */
function convertTime(time: string, fromZone: string | null, toZone: string | null, at: Date): string {
  if (!fromZone || !toZone || fromZone === toZone) return time
  const [hours, minutes] = time.split(':').map(Number)
  const local = (((hours * 60 + minutes - offsetMinutes(fromZone, at) + offsetMinutes(toZone, at)) % 1440) + 1440) % 1440
  return `${String(Math.floor(local / 60)).padStart(2, '0')}:${String(local % 60).padStart(2, '0')}`
}

function shortName(displayName: string | null | undefined): string {
  const parts = String(displayName || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Icademer'
  return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse(401, { error: 'Missing authorization header' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return jsonResponse(500, { error: 'Function environment is not configured' })
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser()
  if (authError || !user) return jsonResponse(401, { error: 'Unauthorized' })

  const { messageId } = (await req.json().catch(() => ({ messageId: null }))) as { messageId: string | null }
  if (!messageId) return jsonResponse(400, { error: 'messageId es obligatorio' })

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const now = new Date()

  // Marca el mensaje como avisado (solo una vez, solo el autor y solo si es reciente).
  const { data: message, error: messageError } = await adminClient
    .from('icademer_chat_messages')
    .update({ push_sent_at: now.toISOString() })
    .eq('id', messageId)
    .eq('user_id', user.id)
    .is('push_sent_at', null)
    .gte('created_at', new Date(now.getTime() - RECENT_MS).toISOString())
    .select('id, target_lang, user_id, kind, time_value, time_zone, created_at')
    .maybeSingle()
  if (messageError) return jsonResponse(500, { error: messageError.message })
  if (!message) return jsonResponse(200, { ok: true, sent: 0, reason: 'Nothing to notify' })

  const createdAt = new Date(message.created_at)
  const throttleLimit = new Date(now.getTime() - THROTTLE_MS).toISOString()
  const { data: members, error: membersError } = await adminClient
    .from('icademer_chat_members')
    .select('user_id, last_read_at, last_notified_at')
    .eq('target_lang', message.target_lang)
    .eq('notifications_enabled', true)
    .neq('user_id', user.id)
    .lt('last_read_at', createdAt.toISOString())
    .or(`last_notified_at.is.null,last_notified_at.lt.${throttleLimit}`)
  if (membersError) return jsonResponse(500, { error: membersError.message })
  const recipientIds = (members || []).map((row) => row.user_id as string)
  if (recipientIds.length === 0) return jsonResponse(200, { ok: true, sent: 0 })

  const [subscriptionsResult, profilesResult, senderResult] = await Promise.all([
    adminClient
      .from('user_push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth')
      .eq('is_active', true)
      .in('user_id', recipientIds),
    adminClient.from('profiles').select('id, timezone').in('id', recipientIds),
    adminClient.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
  ])
  if (subscriptionsResult.error) return jsonResponse(500, { error: subscriptionsResult.error.message })

  const zoneByUser = new Map<string, string | null>(
    (profilesResult.data || []).map((row) => [row.id as string, validZone(row.timezone as string | null)]),
  )
  const sender = shortName((senderResult.data as { display_name?: string } | null)?.display_name)
  const language = String(message.target_lang || '').toLowerCase()
  const template = MESSAGE_TEXT[String(message.kind)] || ''

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
  const notified = new Set<string>()
  let sent = 0
  let failed = 0

  for (const subscription of subscriptionsResult.data || []) {
    const recipientId = subscription.user_id as string
    const text =
      message.kind === 'hora' && message.time_value
        ? template.replace(
            '{time}',
            convertTime(String(message.time_value), validZone(message.time_zone), zoneByUser.get(recipientId) ?? null, createdAt),
          )
        : template
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify({
          title: `Icademers de ${language}`,
          body: `${sender}: ${text}`,
          url: '/chat-icademers',
          tag: `icademer-chat-${language}`,
          icon: '/push-chat-192.png',
        }),
      )
      sent += 1
      notified.add(recipientId)
    } catch (error) {
      failed += 1
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 0)
      if (statusCode === 404 || statusCode === 410) {
        await adminClient
          .from('user_push_subscriptions')
          .update({ is_active: false, last_seen_at: now.toISOString() })
          .eq('id', subscription.id)
      }
    }
  }

  if (notified.size > 0) {
    await adminClient
      .from('icademer_chat_members')
      .update({ last_notified_at: now.toISOString() })
      .eq('target_lang', message.target_lang)
      .in('user_id', Array.from(notified))
  }

  return jsonResponse(200, { ok: true, sent, failed })
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MIN_DURATION_MS = 3 * 60 * 1000
const LEVEL_KEYS = ['A1', 'A1+', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1'] as const
type LevelKey = (typeof LEVEL_KEYS)[number]

const LEVEL_THRESHOLDS_BY_FAMILY: Record<string, Record<LevelKey, number>> = {
  germanic_romance_easy: {
    A1: 90,
    'A1+': 170,
    A2: 230,
    'A2+': 340,
    B1: 500,
    'B1+': 610,
    B2: 770,
    'B2+': 980,
    C1: 1600,
  },
  french_romanian: {
    A1: 110,
    'A1+': 270,
    A2: 330,
    'A2+': 440,
    B1: 650,
    'B1+': 810,
    B2: 970,
    'B2+': 1280,
    C1: 1850,
  },
  germanic_hard: {
    A1: 130,
    'A1+': 270,
    A2: 410,
    'A2+': 590,
    B1: 770,
    'B1+': 960,
    B2: 1270,
    'B2+': 1580,
    C1: 2100,
  },
  slavic_thai: {
    A1: 210,
    'A1+': 420,
    A2: 580,
    'A2+': 760,
    B1: 950,
    'B1+': 1260,
    B2: 1570,
    'B2+': 2230,
    C1: 2800,
  },
  distant: {
    A1: 270,
    'A1+': 430,
    A2: 760,
    'A2+': 950,
    B1: 1260,
    'B1+': 1570,
    B2: 2080,
    'B2+': 2590,
    C1: 3300,
  },
}

const LANG_TO_FAMILY: Record<string, string> = {
  'Inglés': 'germanic_romance_easy',
  Portugués: 'germanic_romance_easy',
  Italiano: 'germanic_romance_easy',
  Francés: 'french_romanian',
  Rumano: 'french_romanian',
  Alemán: 'germanic_hard',
  Holandés: 'germanic_hard',
  Ruso: 'slavic_thai',
  Tailandés: 'slavic_thai',
  Polaco: 'slavic_thai',
  Ucraniano: 'slavic_thai',
  Checo: 'slavic_thai',
  Hindi: 'distant',
  Chino: 'distant',
  Japonés: 'distant',
  Coreano: 'distant',
  Árabe: 'distant',
  Español: 'germanic_romance_easy',
  Catalán: 'germanic_romance_easy',
  Sueco: 'germanic_hard',
  Noruego: 'germanic_hard',
  Danés: 'germanic_hard',
  Finés: 'germanic_hard',
  Húngaro: 'distant',
  Griego: 'distant',
  Turco: 'distant',
  Hebreo: 'distant',
  Vietnamita: 'distant',
}

function getLevelThresholds(language: string): Record<LevelKey, number> {
  const family = LANG_TO_FAMILY[language] || 'germanic_romance_easy'
  return LEVEL_THRESHOLDS_BY_FAMILY[family]
}

function getCurrentLevelKey(total: number, thresholds: Record<LevelKey, number>): string {
  const stops = [0, ...LEVEL_KEYS.map((key) => thresholds[key])]
  const max = stops[stops.length - 1]
  const safeTotal = Math.max(0, total)
  const clamped = Math.max(0, Math.min(safeTotal, max))

  if (safeTotal >= max) return 'C1'

  let idx = 0
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (clamped >= stops[i] && clamped < stops[i + 1]) {
      idx = i
      break
    }
    if (clamped >= stops[stops.length - 1]) idx = stops.length - 2
  }

  return idx === 0 ? 'Pre-A1' : LEVEL_KEYS[idx - 1]
}

function asFiniteNumber(value: unknown): number {
  const numberValue = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  })
}

type CoachingSessionRow = {
  id: string
  coach_user_id: string | null
}

type WeekActivationRow = {
  week_number: number
  activated_at: string
  ended_at: string | null
}

type PushSubscriptionRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  is_active: boolean
}

function toDate(value: string | null): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getWeekFromActivations(
  closedAt: string,
  activations: WeekActivationRow[],
): number | null {
  const closedDate = toDate(closedAt)
  if (!closedDate) return null

  for (const row of activations) {
    const start = toDate(row.activated_at)
    if (!start) continue
    const explicitEnd = row.ended_at ? toDate(row.ended_at) : null
    const end = explicitEnd || new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
    if (closedDate.getTime() >= start.getTime() && closedDate.getTime() < end.getTime()) {
      return Math.min(12, Math.max(1, row.week_number))
    }
  }

  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse(401, { error: 'Missing authorization header' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse(500, {
      error: 'Supabase function environment is not configured',
    })
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser()

  if (authError || !user) {
    return jsonResponse(401, { error: 'Unauthorized' })
  }

  const { noteId } = (await req.json().catch(() => ({ noteId: null }))) as {
    noteId: string | null
  }

  if (!noteId) {
    return jsonResponse(400, { error: 'noteId es obligatorio' })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: note, error: noteError } = await adminClient
    .from('master_notes')
    .select('id, user_id, state, total_duration_ms, target_lang, native_lang')
    .eq('id', noteId)
    .maybeSingle()

  if (noteError) {
    return jsonResponse(500, { error: noteError.message })
  }

  if (!note || note.user_id !== user.id) {
    return jsonResponse(404, { error: 'Nota maestra no encontrada' })
  }

  if (note.state !== 'open') {
    return jsonResponse(400, { error: 'La nota maestra ya está cerrada' })
  }

  if (note.total_duration_ms < MIN_DURATION_MS) {
    return jsonResponse(400, {
      error: 'La nota maestra debe durar al menos 3:00 para cerrarse',
    })
  }

  let closedLevel: string | null = null
  const targetLang = typeof note.target_lang === 'string' ? note.target_lang.trim() : ''
  const nativeLang = typeof note.native_lang === 'string' ? note.native_lang.trim() : ''

  if (targetLang && nativeLang) {
    const { data: tracker } = await adminClient
      .from('user_meta_tracker')
      .select('start_level, prior_ica_words, activation_words_total')
      .eq('user_id', user.id)
      .eq('target_lang', targetLang)
      .eq('native_lang', nativeLang)
      .maybeSingle()

    if (tracker) {
      const thresholds = getLevelThresholds(targetLang)
      const startLevel = typeof tracker.start_level === 'string' ? tracker.start_level : '0'
      const baseWords = startLevel === '0' ? 0 : (thresholds[startLevel as LevelKey] || 0)
      const priorWords = asFiniteNumber(tracker.prior_ica_words)
      const activationWords = asFiniteNumber(tracker.activation_words_total)
      const totalWords = baseWords + priorWords + activationWords
      closedLevel = getCurrentLevelKey(totalWords, thresholds)
    }
  }

  const closedAt = new Date().toISOString()

  const { error: closeError } = await adminClient
    .from('master_notes')
    .update({
      state: 'closed',
      close_type: 'temporal',
      closed_at: closedAt,
      closed_level: closedLevel,
      final_audio_path: null,
    })
    .eq('id', noteId)

  if (closeError) {
    return jsonResponse(500, { error: closeError.message })
  }

  let coachingNotificationStatus: 'sent' | 'failed' | 'skipped' = 'skipped'
  let coachingNotificationReason: string | null = null

  try {
    const { data: sessionRow, error: sessionError } = await adminClient
      .from('coaching_sessions')
      .select('id, coach_user_id')
      .eq('user_id', user.id)
      .eq('target_lang', targetLang)
      .eq('is_active', true)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle<CoachingSessionRow>()

    if (sessionError) throw new Error(sessionError.message)
    if (!sessionRow?.coach_user_id) {
      coachingNotificationReason = 'session_or_coach_missing'
    } else {
      const { data: existingNotification } = await adminClient
        .from('coaching_note_close_notifications')
        .select('id')
        .eq('note_id', noteId)
        .eq('coach_user_id', sessionRow.coach_user_id)
        .maybeSingle<{ id: number }>()

      if (existingNotification?.id) {
        coachingNotificationReason = 'already_notified'
      } else {
        const { data: activations, error: activationsError } = await adminClient
          .from('coaching_session_week_activations')
          .select('week_number, activated_at, ended_at')
          .eq('session_id', sessionRow.id)
          .order('week_number', { ascending: true })

        if (activationsError) throw new Error(activationsError.message)

        const weekNumber = getWeekFromActivations(
          closedAt,
          (activations || []) as WeekActivationRow[],
        )

        if (!weekNumber) {
          coachingNotificationReason = 'outside_activated_week'
          await adminClient.from('coaching_note_close_notifications').insert({
            note_id: noteId,
            session_id: sessionRow.id,
            coach_user_id: sessionRow.coach_user_id,
            status: 'skipped',
            week_number: null,
            error_message: coachingNotificationReason,
            notified_at: null,
          })
        } else {
          const { data: preference } = await adminClient
            .from('user_coaching_notification_preferences')
            .select('master_note_closed_enabled')
            .eq('user_id', sessionRow.coach_user_id)
            .maybeSingle<{ master_note_closed_enabled: boolean }>()

          if (preference && !preference.master_note_closed_enabled) {
            coachingNotificationReason = 'coach_notifications_disabled'
            await adminClient.from('coaching_note_close_notifications').insert({
              note_id: noteId,
              session_id: sessionRow.id,
              coach_user_id: sessionRow.coach_user_id,
              status: 'skipped',
              week_number: weekNumber,
              error_message: coachingNotificationReason,
              notified_at: null,
            })
          } else {
            const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
            const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
            const vapidSubject = Deno.env.get('VAPID_SUBJECT')

            if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
              coachingNotificationReason = 'vapid_not_configured'
              await adminClient.from('coaching_note_close_notifications').insert({
                note_id: noteId,
                session_id: sessionRow.id,
                coach_user_id: sessionRow.coach_user_id,
                status: 'failed',
                week_number: weekNumber,
                error_message: coachingNotificationReason,
                notified_at: null,
              })
              coachingNotificationStatus = 'failed'
            } else {
              webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

              const { data: coachProfile } = await adminClient
                .from('profiles')
                .select('display_name, username')
                .eq('id', user.id)
                .maybeSingle<{ display_name: string | null; username: string | null }>()

              const userLabel =
                coachProfile?.display_name?.trim() ||
                coachProfile?.username?.trim() ||
                'Tu alumno'

              const { data: subscriptions, error: subscriptionsError } = await adminClient
                .from('user_push_subscriptions')
                .select('id, endpoint, p256dh, auth, is_active')
                .eq('user_id', sessionRow.coach_user_id)
                .eq('is_active', true)

              if (subscriptionsError) throw new Error(subscriptionsError.message)

              const activeSubscriptions = (subscriptions || []) as PushSubscriptionRow[]
              if (activeSubscriptions.length === 0) {
                coachingNotificationReason = 'coach_without_active_push_subscriptions'
                await adminClient.from('coaching_note_close_notifications').insert({
                  note_id: noteId,
                  session_id: sessionRow.id,
                  coach_user_id: sessionRow.coach_user_id,
                  status: 'skipped',
                  week_number: weekNumber,
                  error_message: coachingNotificationReason,
                  notified_at: null,
                })
              } else {
                const payload = JSON.stringify({
                  title: 'Coaching ICA',
                  body: `${userLabel} cerró una nota maestra en Semana ${weekNumber}.`,
                  data: {
                    type: 'coaching-master-note-closed',
                    noteId,
                    sessionId: sessionRow.id,
                    userId: user.id,
                    weekNumber,
                  },
                })

                let sentCount = 0
                let failedCount = 0

                for (const subscription of activeSubscriptions) {
                  try {
                    await webpush.sendNotification(
                      {
                        endpoint: subscription.endpoint,
                        keys: {
                          p256dh: subscription.p256dh,
                          auth: subscription.auth,
                        },
                      },
                      payload,
                    )
                    sentCount += 1
                  } catch {
                    failedCount += 1
                    await adminClient
                      .from('user_push_subscriptions')
                      .update({ is_active: false, last_seen_at: new Date().toISOString() })
                      .eq('id', subscription.id)
                  }
                }

                coachingNotificationStatus = sentCount > 0 ? 'sent' : 'failed'
                coachingNotificationReason =
                  sentCount > 0
                    ? failedCount > 0
                      ? `partial_delivery:${sentCount}/${activeSubscriptions.length}`
                      : null
                    : 'all_push_deliveries_failed'

                await adminClient.from('coaching_note_close_notifications').insert({
                  note_id: noteId,
                  session_id: sessionRow.id,
                  coach_user_id: sessionRow.coach_user_id,
                  status: coachingNotificationStatus,
                  week_number: weekNumber,
                  error_message: coachingNotificationReason,
                  notified_at:
                    coachingNotificationStatus === 'sent'
                      ? new Date().toISOString()
                      : null,
                })
              }
            }
          }
        }
      }
    }
  } catch (notificationError) {
    coachingNotificationStatus = 'failed'
    coachingNotificationReason =
      notificationError instanceof Error
        ? notificationError.message
        : 'unknown_notification_error'
  }

  return jsonResponse(200, {
    ok: true,
    closeType: 'temporal',
    closedAt,
    closedLevel,
    coachingNotificationStatus,
    coachingNotificationReason,
  })
})

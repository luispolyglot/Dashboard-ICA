import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { CORS_HEADERS, jsonResponse } from '../_shared/http.ts'
import { ensureAuthenticated } from '../_shared/coaching-auth.ts'

type ChallengeScope = 'global' | 'language'
type ChallengeStatus =
  | 'created'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'not_accepted'

type PushSubscriptionRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toScope(value: unknown): ChallengeScope {
  return value === 'language' ? 'language' : 'global'
}

function toRounds(value: unknown): 3 | 5 | 10 {
  const numberValue = Number(value)
  if (numberValue === 3 || numberValue === 5) return numberValue
  return 10
}

function toResponseSeconds(value: unknown): number {
  const numberValue = Math.round(Number(value))
  if (Number.isNaN(numberValue)) return 5
  if (numberValue < 3) return 3
  if (numberValue > 8) return 8
  return numberValue
}

function toDurationSecondsDaysRange(value: unknown): number {
  const parsed = Math.round(Number(value))
  const oneDay = 24 * 60 * 60
  const minValue = oneDay
  const maxValue = 3 * oneDay
  if (!Number.isFinite(parsed)) return oneDay
  if (parsed < minValue) return minValue
  if (parsed > maxValue) return maxValue
  return parsed
}

async function sendPushToUser(input: {
  adminClient: ReturnType<typeof createClient>
  userId: string
  title: string
  body: string
  tag: string
  url: string
}): Promise<void> {
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) return

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  const { data, error } = await input.adminClient
    .from('user_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', input.userId)
    .eq('is_active', true)

  if (error) return

  const subscriptions = (data || []) as PushSubscriptionRow[]
  if (subscriptions.length === 0) return

  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    tag: input.tag,
    url: input.url,
  })

  for (const subscription of subscriptions) {
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
    } catch (err) {
      const statusCode = Number((err as { statusCode?: number }).statusCode || 0)
      if (statusCode === 404 || statusCode === 410) {
        await input.adminClient
          .from('user_push_subscriptions')
          .update({ is_active: false, last_seen_at: new Date().toISOString() })
          .eq('id', subscription.id)
      }
    }
  }
}

async function countActiveChallenges(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
): Promise<number> {
  const { count, error } = await adminClient
    .from('ica_challenges')
    .select('id', { count: 'exact', head: true })
    .in('status', ['created', 'in_progress'] as ChallengeStatus[])
    .or(`challenger_user_id.eq.${userId},challenged_user_id.eq.${userId}`)

  if (error) throw new Error(error.message)
  return count || 0
}

async function hasActivePairChallenge(
  adminClient: ReturnType<typeof createClient>,
  challengerUserId: string,
  challengedUserId: string,
): Promise<boolean> {
  const firstPair = `and(challenger_user_id.eq.${challengerUserId},challenged_user_id.eq.${challengedUserId})`
  const secondPair = `and(challenger_user_id.eq.${challengedUserId},challenged_user_id.eq.${challengerUserId})`

  const { count, error } = await adminClient
    .from('ica_challenges')
    .select('id', { count: 'exact', head: true })
    .in('status', ['created', 'in_progress'] as ChallengeStatus[])
    .or(`${firstPair},${secondPair}`)

  if (error) throw new Error(error.message)
  return (count || 0) > 0
}

async function listAvailableUsers(input: {
  adminClient: ReturnType<typeof createClient>
  userId: string
  targetLang: string
  nativeLang: string
  scope: ChallengeScope
}) {
  const activeCount = await countActiveChallenges(input.adminClient, input.userId)

  const enrollmentQuery = input.adminClient
    .from('users_ica_challenges')
    .select('user_id')
    .eq('is_active', true)

  if (input.scope === 'language') {
    enrollmentQuery
      .eq('target_lang', input.targetLang)
      .eq('native_lang', input.nativeLang)
  }

  const { data: enrollmentRows, error: enrollmentError } = await enrollmentQuery
  if (enrollmentError) return jsonResponse(500, { error: enrollmentError.message })

  const candidateIds = Array.from(
    new Set(
      (enrollmentRows || [])
        .map((row) => toText((row as { user_id?: string }).user_id))
        .filter((id) => id && id !== input.userId),
    ),
  )

  if (candidateIds.length === 0) {
    return jsonResponse(200, { rows: [], myActiveChallengesCount: activeCount })
  }

  const { data: profilesRows, error: profilesError } = await input.adminClient
    .from('profiles')
    .select('id, display_name, username')
    .in('id', candidateIds)

  if (profilesError) return jsonResponse(500, { error: profilesError.message })

  const rows = await Promise.all(
    (profilesRows || []).map(async (row) => {
      const userId = toText((row as { id?: string }).id)
      const userActiveCount = await countActiveChallenges(input.adminClient, userId)
      const activePair = await hasActivePairChallenge(input.adminClient, input.userId, userId)

      let blockedReason: string | null = null
      if (activeCount >= 3) blockedReason = 'Tu máximo de desafíos activos es 3.'
      else if (userActiveCount >= 3)
        blockedReason = 'Este usuario ya tiene 3 desafíos activos.'
      else if (activePair)
        blockedReason = 'Ya tienen un desafío activo entre ustedes.'

      return {
        userId,
        displayName: toText((row as { display_name?: string }).display_name) || 'Usuario',
        username: toText((row as { username?: string }).username) || null,
        activeChallengesCount: userActiveCount,
        canChallenge: blockedReason === null,
        blockedReason,
      }
    }),
  )

  rows.sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'))
  return jsonResponse(200, { rows, myActiveChallengesCount: activeCount })
}

async function createOwnWordsChallenge(input: {
  adminClient: ReturnType<typeof createClient>
  userId: string
  body: Record<string, unknown>
}) {
  const challengedUserId = toText(input.body.challengedUserId)
  const scope = toScope(input.body.scope)
  const targetLang = toText(input.body.targetLang)
  const nativeLang = toText(input.body.nativeLang)
  const rounds = toRounds(input.body.rounds)
  const responseSeconds = toResponseSeconds(input.body.responseSeconds)
  const durationSeconds = toDurationSecondsDaysRange(input.body.durationSeconds)

  if (!challengedUserId) return jsonResponse(400, { error: 'Rival inválido.' })
  if (challengedUserId === input.userId) {
    return jsonResponse(400, { error: 'No puedes desafiarte a ti mismo.' })
  }

  if (scope === 'language' && (!targetLang || !nativeLang)) {
    return jsonResponse(400, { error: 'Faltan idiomas para el desafío por idioma.' })
  }

  const myActiveCount = await countActiveChallenges(input.adminClient, input.userId)
  if (myActiveCount >= 3) {
    return jsonResponse(400, { error: 'ICA_CHALLENGE_ACTIVE_LIMIT_REACHED' })
  }

  const rivalActiveCount = await countActiveChallenges(input.adminClient, challengedUserId)
  if (rivalActiveCount >= 3) {
    return jsonResponse(400, { error: 'ICA_CHALLENGE_OPPONENT_ACTIVE_LIMIT_REACHED' })
  }

  const activePair = await hasActivePairChallenge(
    input.adminClient,
    input.userId,
    challengedUserId,
  )
  if (activePair) {
    return jsonResponse(400, { error: 'ICA_CHALLENGE_ACTIVE_PAIR_EXISTS' })
  }

  const myEnrollmentQuery = input.adminClient
    .from('users_ica_challenges')
    .select('id')
    .eq('user_id', input.userId)
    .eq('is_active', true)

  if (scope === 'language') {
    myEnrollmentQuery.eq('target_lang', targetLang).eq('native_lang', nativeLang)
  }

  const rivalEnrollmentQuery = input.adminClient
    .from('users_ica_challenges')
    .select('id')
    .eq('user_id', challengedUserId)
    .eq('is_active', true)

  if (scope === 'language') {
    rivalEnrollmentQuery.eq('target_lang', targetLang).eq('native_lang', nativeLang)
  }

  const [myEnrollmentResult, rivalEnrollmentResult] = await Promise.all([
    myEnrollmentQuery.limit(1),
    rivalEnrollmentQuery.limit(1),
  ])

  if (myEnrollmentResult.error || rivalEnrollmentResult.error) {
    return jsonResponse(500, {
      error:
        myEnrollmentResult.error?.message ||
        rivalEnrollmentResult.error?.message ||
        'No se pudo validar la inscripción.',
    })
  }

  if ((myEnrollmentResult.data || []).length === 0) {
    return jsonResponse(400, { error: 'Debes activar tu inscripción a desafíos.' })
  }

  if ((rivalEnrollmentResult.data || []).length === 0) {
    return jsonResponse(400, { error: 'El rival no está inscrito para este modo.' })
  }

  const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString()

  const { data: challenge, error: challengeError } = await input.adminClient
    .from('ica_challenges')
    .insert({
      challenge_slug: 'ica-own-words',
      status: 'created',
      result_type: 'pending',
      scope,
      target_lang: scope === 'language' ? targetLang : null,
      native_lang: scope === 'language' ? nativeLang : null,
      challenger_user_id: input.userId,
      challenged_user_id: challengedUserId,
      duration_seconds: durationSeconds,
      expires_at: expiresAt,
      game_metadata: {
        mode: 'own_words_quiz',
        rounds,
        responseSeconds,
        questionsPerRound: 10,
      },
      phases_json: [
        { key: 'invitation', status: 'pending' },
        { key: 'duel', status: 'locked' },
      ],
    })
    .select('id')
    .single()

  if (challengeError || !challenge) {
    const message = challengeError?.message || 'No se pudo crear el desafío.'
    return jsonResponse(400, { error: message })
  }

  const challengeId = challenge.id as string
  const { error: competitorsError } = await input.adminClient
    .from('ica_challenge_competitors')
    .insert([
      {
        challenge_id: challengeId,
        user_id: input.userId,
        competitor_order: 1,
        invitation_status: 'accepted',
        accepted_at: new Date().toISOString(),
      },
      {
        challenge_id: challengeId,
        user_id: challengedUserId,
        competitor_order: 2,
        invitation_status: 'pending',
      },
    ])

  if (competitorsError) {
    return jsonResponse(400, { error: competitorsError.message })
  }

  await sendPushToUser({
    adminClient: input.adminClient,
    userId: challengedUserId,
    title: 'Nuevo desafío ICA',
    body: 'Te retaron a un desafío. Respóndelo para comenzar.',
    tag: `ica-challenge-created-${challengeId}`,
    url: '/desafios-ica',
  })

  return jsonResponse(200, { ok: true, challengeId })
}

async function respondInvitation(input: {
  adminClient: ReturnType<typeof createClient>
  userId: string
  body: Record<string, unknown>
}) {
  const challengeId = toText(input.body.challengeId)
  const accept = Boolean(input.body.accept)
  if (!challengeId) return jsonResponse(400, { error: 'challengeId inválido.' })

  const { data: existing, error: existingError } = await input.adminClient
    .from('ica_challenges')
    .select('id, challenger_user_id, challenged_user_id, status')
    .eq('id', challengeId)
    .eq('challenged_user_id', input.userId)
    .maybeSingle()

  if (existingError) return jsonResponse(500, { error: existingError.message })
  if (!existing) return jsonResponse(404, { error: 'Desafío no encontrado.' })
  if (existing.status !== 'created') {
    return jsonResponse(400, { error: 'El desafío ya fue respondido.' })
  }

  const nowIso = new Date().toISOString()
  const { error: competitorError } = await input.adminClient
    .from('ica_challenge_competitors')
    .update({
      invitation_status: accept ? 'accepted' : 'rejected',
      accepted_at: accept ? nowIso : null,
      rejected_at: accept ? null : nowIso,
    })
    .eq('challenge_id', challengeId)
    .eq('user_id', input.userId)

  if (competitorError) return jsonResponse(500, { error: competitorError.message })

  const { error: challengeError } = await input.adminClient
    .from('ica_challenges')
    .update({
      status: accept ? 'in_progress' : 'not_accepted',
      result_type: accept ? 'pending' : 'not_accepted',
      started_at: accept ? nowIso : null,
      finalized_at: accept ? null : nowIso,
      winner_user_id: null,
    })
    .eq('id', challengeId)

  if (challengeError) return jsonResponse(500, { error: challengeError.message })

  await sendPushToUser({
    adminClient: input.adminClient,
    userId: toText(existing.challenger_user_id),
    title: accept ? 'Desafío aceptado' : 'Desafío rechazado',
    body: accept
      ? 'Tu rival aceptó el desafío. Ya está en curso.'
      : 'Tu rival no aceptó el desafío.',
    tag: `ica-challenge-response-${challengeId}`,
    url: '/desafios-ica',
  })

  return jsonResponse(200, { ok: true, challengeId, status: accept ? 'in_progress' : 'not_accepted' })
}

async function submitOwnWordsResult(input: {
  adminClient: ReturnType<typeof createClient>
  userId: string
  body: Record<string, unknown>
}) {
  const challengeId = toText(input.body.challengeId)
  const score = Math.max(0, Math.round(Number(input.body.score || 0)))
  const totalQuestions = Math.max(
    1,
    Math.round(Number(input.body.totalQuestions || 1)),
  )
  const rounds = toRounds(input.body.rounds)
  const responseSeconds = toResponseSeconds(input.body.responseSeconds)
  const answers = Array.isArray(input.body.answers) ? input.body.answers : []

  if (!challengeId) return jsonResponse(400, { error: 'challengeId inválido.' })

  const { data: challenge, error: challengeError } = await input.adminClient
    .from('ica_challenges')
    .select('id, status, challenger_user_id, challenged_user_id, challenge_slug')
    .eq('id', challengeId)
    .maybeSingle()

  if (challengeError) return jsonResponse(500, { error: challengeError.message })
  if (!challenge) return jsonResponse(404, { error: 'Desafío no encontrado.' })
  if (challenge.challenge_slug !== 'ica-own-words') {
    return jsonResponse(400, { error: 'Solo soportamos este desafío por ahora.' })
  }

  if (challenge.status !== 'in_progress') {
    return jsonResponse(400, { error: 'El desafío no está en curso.' })
  }

  if (
    input.userId !== challenge.challenger_user_id &&
    input.userId !== challenge.challenged_user_id
  ) {
    return jsonResponse(403, { error: 'No participas en este desafío.' })
  }

  const nowIso = new Date().toISOString()
  const { data: competitorRow, error: competitorReadError } = await input.adminClient
    .from('ica_challenge_competitors')
    .select('payload, invitation_status')
    .eq('challenge_id', challengeId)
    .eq('user_id', input.userId)
    .maybeSingle()

  if (competitorReadError) {
    return jsonResponse(500, { error: competitorReadError.message })
  }

  if (!competitorRow || competitorRow.invitation_status !== 'accepted') {
    return jsonResponse(400, { error: 'No puedes jugar este desafío.' })
  }

  const currentPayload =
    competitorRow.payload && typeof competitorRow.payload === 'object'
      ? (competitorRow.payload as Record<string, unknown>)
      : {}
  const currentOwnWords =
    currentPayload.ownWords && typeof currentPayload.ownWords === 'object'
      ? (currentPayload.ownWords as Record<string, unknown>)
      : null

  if (currentOwnWords?.completedAt) {
    return jsonResponse(400, { error: 'Ya enviaste tu resultado.' })
  }

  const nextPayload = {
    ...currentPayload,
    ownWords: {
      completedAt: nowIso,
      score,
      totalQuestions,
      rounds,
      responseSeconds,
      answers,
    },
  }

  const { error: updateCompetitorError } = await input.adminClient
    .from('ica_challenge_competitors')
    .update({
      score,
      payload: nextPayload,
    })
    .eq('challenge_id', challengeId)
    .eq('user_id', input.userId)

  if (updateCompetitorError) {
    return jsonResponse(500, { error: updateCompetitorError.message })
  }

  const { data: competitors, error: competitorsError } = await input.adminClient
    .from('ica_challenge_competitors')
    .select('user_id, score')
    .eq('challenge_id', challengeId)

  if (competitorsError) return jsonResponse(500, { error: competitorsError.message })

  const rows = (competitors || []) as Array<{ user_id: string; score: number | null }>
  const challengerScore =
    rows.find((row) => row.user_id === challenge.challenger_user_id)?.score ?? null
  const challengedScore =
    rows.find((row) => row.user_id === challenge.challenged_user_id)?.score ?? null

  if (challengerScore === null || challengedScore === null) {
    return jsonResponse(200, { ok: true, challengeId })
  }

  const resultType =
    challengerScore > challengedScore
      ? 'challenger_win'
      : challengedScore > challengerScore
        ? 'challenged_win'
        : 'draw'

  const winnerUserId =
    resultType === 'challenger_win'
      ? challenge.challenger_user_id
      : resultType === 'challenged_win'
        ? challenge.challenged_user_id
        : null

  const { error: finishError } = await input.adminClient
    .from('ica_challenges')
    .update({
      status: 'completed',
      result_type: resultType,
      winner_user_id: winnerUserId,
      finalized_at: nowIso,
    })
    .eq('id', challengeId)

  if (finishError) return jsonResponse(500, { error: finishError.message })

  return jsonResponse(200, { ok: true, challengeId })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const auth = await ensureAuthenticated(req)
  if (!auth.ok) return auth.response

  let payload: Record<string, unknown>
  try {
    payload = (await req.json()) as Record<string, unknown>
  } catch {
    return jsonResponse(400, { error: 'JSON inválido.' })
  }

  const action = toText(payload.action)

  if (action === 'list-available-users') {
    return listAvailableUsers({
      adminClient: auth.adminClient,
      userId: auth.userId,
      targetLang: toText(payload.targetLang),
      nativeLang: toText(payload.nativeLang),
      scope: toScope(payload.scope),
    })
  }

  if (action === 'create-own-words') {
    return createOwnWordsChallenge({
      adminClient: auth.adminClient,
      userId: auth.userId,
      body: payload,
    })
  }

  if (action === 'respond-invitation') {
    return respondInvitation({
      adminClient: auth.adminClient,
      userId: auth.userId,
      body: payload,
    })
  }

  if (action === 'submit-own-words-result') {
    return submitOwnWordsResult({
      adminClient: auth.adminClient,
      userId: auth.userId,
      body: payload,
    })
  }

  return jsonResponse(400, { error: 'Acción no soportada.' })
})

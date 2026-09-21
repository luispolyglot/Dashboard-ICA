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

type OwnWordsAnswerRow = {
  questionIndex: number
  selectedOptionIndex: number | null
  isCorrect: boolean
  timedOut: boolean
  responseMs: number | null
}

const INVITATION_WINDOW_SECONDS = 12 * 60 * 60
const TURN_WINDOW_SECONDS = 10 * 60 * 60

type ChallengeTypeRow = {
  id: string
  nombre: string
  icono: string
  activo: boolean
  orden: number
  ambitos: string[]
  config: Record<string, unknown>
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toScope(value: unknown): ChallengeScope {
  return value === 'language' ? 'language' : 'global'
}

const OWN_WORDS_TOTAL_QUESTIONS = 10

function toRounds(value: unknown): 1 | 2 | 5 | 10 {
  const numberValue = Number(value)
  if (numberValue === 1 || numberValue === 2 || numberValue === 5 || numberValue === 10) {
    return numberValue
  }
  return 2
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

function addSecondsToNow(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString()
}

function normalizeOwnWordsAnswers(value: unknown): OwnWordsAnswerRow[] {
  if (!Array.isArray(value)) return []

  return value
    .map((raw): OwnWordsAnswerRow | null => {
      if (!raw || typeof raw !== 'object') return null
      const answer = raw as Record<string, unknown>
      const questionIndex = Math.max(0, Math.round(Number(answer.questionIndex || 0)))
      const selectedOptionRaw = answer.selectedOptionIndex
      const selectedOptionIndex =
        selectedOptionRaw === null || selectedOptionRaw === undefined
          ? null
          : Math.max(0, Math.round(Number(selectedOptionRaw)))
      const isCorrect = Boolean(answer.isCorrect)
      const timedOut = Boolean(answer.timedOut)
      const responseMsRaw = Number(answer.responseMs)
      const responseMs = Number.isFinite(responseMsRaw)
        ? Math.max(0, Math.round(responseMsRaw))
        : null

      return {
        questionIndex,
        selectedOptionIndex,
        isCorrect,
        timedOut,
        responseMs,
      }
    })
    .filter((item): item is OwnWordsAnswerRow => item !== null)
    .sort((a, b) => a.questionIndex - b.questionIndex)
}

function normalizeChallengeTypeScopes(value: unknown): ChallengeScope[] {
  if (!Array.isArray(value)) return ['global']

  const next = value
    .map((item) => (item === 'language' ? 'language' : item === 'global' ? 'global' : null))
    .filter((item): item is ChallengeScope => item !== null)

  return next.length > 0 ? Array.from(new Set(next)) : ['global']
}

function toChallengeTypeRow(raw: Record<string, unknown>): ChallengeTypeRow {
  const config =
    raw.config && typeof raw.config === 'object' && !Array.isArray(raw.config)
      ? (raw.config as Record<string, unknown>)
      : {}

  return {
    id: toText(raw.id),
    nombre: toText(raw.nombre),
    icono: toText(raw.icono),
    activo: Boolean(raw.activo),
    orden: Number(raw.orden || 0),
    ambitos: normalizeChallengeTypeScopes(raw.ambitos),
    config,
  }
}

async function getChallengeTypeById(input: {
  adminClient: ReturnType<typeof createClient>
  challengeTypeId: string
}): Promise<{ row: ChallengeTypeRow | null; error: string | null }> {
  const { data, error } = await input.adminClient
    .from('desafio_tipos')
    .select('id, nombre, icono, activo, orden, ambitos, config')
    .eq('id', input.challengeTypeId)
    .maybeSingle()

  if (error) return { row: null, error: error.message }
  if (!data || typeof data !== 'object') return { row: null, error: null }
  return { row: toChallengeTypeRow(data as Record<string, unknown>), error: null }
}

async function listChallengeTypes(input: {
  adminClient: ReturnType<typeof createClient>
}) {
  const { data, error } = await input.adminClient
    .from('desafio_tipos')
    .select('id, nombre, icono, activo, orden, ambitos, config')
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true })

  if (error) return jsonResponse(500, { error: error.message })

  const rows = (data || [])
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row) => {
      const item = toChallengeTypeRow(row)
      return {
        id: item.id,
        name: item.nombre,
        iconKey: item.icono,
        isActive: item.activo,
        order: item.orden,
        scopes: item.ambitos,
        config: item.config,
        isPlayable: item.id === 'ica-own-words',
      }
    })

  return jsonResponse(200, { rows })
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
    .select('user_id, target_lang, native_lang, updated_at')
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

  const latestEnrollmentByUser = new Map<
    string,
    { targetLang: string | null; nativeLang: string | null; updatedAt: string | null }
  >()

  for (const row of enrollmentRows || []) {
    const rawRow = row as {
      user_id?: string
      target_lang?: string
      native_lang?: string
      updated_at?: string
    }
    const userId = toText(rawRow.user_id)
    if (!userId || userId === input.userId) continue

    const previous = latestEnrollmentByUser.get(userId)
    const currentUpdatedAt = toText(rawRow.updated_at) || null
    const previousUpdatedAt = previous?.updatedAt || null

    const shouldReplace =
      !previous ||
      (currentUpdatedAt !== null &&
        (previousUpdatedAt === null || currentUpdatedAt > previousUpdatedAt))

    if (!shouldReplace) continue

    latestEnrollmentByUser.set(userId, {
      targetLang: toText(rawRow.target_lang) || null,
      nativeLang: toText(rawRow.native_lang) || null,
      updatedAt: currentUpdatedAt,
    })
  }

  if (candidateIds.length === 0) {
    return jsonResponse(200, { rows: [], myActiveChallengesCount: activeCount })
  }

  const { data: profilesRows, error: profilesError } = await input.adminClient
    .from('profiles')
    .select('id, display_name, username')
    .in('id', candidateIds)

  if (profilesError) return jsonResponse(500, { error: profilesError.message })

  const { data: settingsRows, error: settingsError } = await input.adminClient
    .from('user_settings')
    .select('user_id, target_lang, native_lang, cefr_level')
    .in('user_id', candidateIds)

  if (settingsError) return jsonResponse(500, { error: settingsError.message })

  const settingsByUser = new Map<
    string,
    { targetLang: string | null; nativeLang: string | null; cefrLevel: string | null }
  >()

  for (const row of settingsRows || []) {
    const rawRow = row as {
      user_id?: string
      target_lang?: string
      native_lang?: string
      cefr_level?: string
    }
    const userId = toText(rawRow.user_id)
    if (!userId) continue

    settingsByUser.set(userId, {
      targetLang: toText(rawRow.target_lang) || null,
      nativeLang: toText(rawRow.native_lang) || null,
      cefrLevel: toText(rawRow.cefr_level) || null,
    })
  }

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

      const setting = settingsByUser.get(userId)
      const enrollment = latestEnrollmentByUser.get(userId)

      return {
        userId,
        displayName: toText((row as { display_name?: string }).display_name) || 'Usuario',
        username: toText((row as { username?: string }).username) || null,
        nativeLang: setting?.nativeLang || enrollment?.nativeLang || null,
        targetLang: setting?.targetLang || enrollment?.targetLang || null,
        cefrLevel: setting?.cefrLevel || null,
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
  const challengeTypeId = toText(input.body.challengeTypeId) || 'ica-own-words'
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

  const challengeTypeResult = await getChallengeTypeById({
    adminClient: input.adminClient,
    challengeTypeId,
  })
  if (challengeTypeResult.error) {
    return jsonResponse(500, { error: challengeTypeResult.error })
  }

  if (!challengeTypeResult.row) {
    return jsonResponse(400, { error: 'ICA_CHALLENGE_TYPE_NOT_FOUND' })
  }

  if (!challengeTypeResult.row.activo) {
    return jsonResponse(400, { error: 'ICA_CHALLENGE_TYPE_NOT_ACTIVE' })
  }

  if (!challengeTypeResult.row.ambitos.includes(scope)) {
    return jsonResponse(400, { error: 'ICA_CHALLENGE_SCOPE_NOT_SUPPORTED' })
  }

  if (challengeTypeId !== 'ica-own-words') {
    return jsonResponse(400, { error: 'ICA_CHALLENGE_TYPE_NOT_PLAYABLE_YET' })
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
  const acceptUntil = addSecondsToNow(INVITATION_WINDOW_SECONDS)

  const { data: challenge, error: challengeError } = await input.adminClient
    .from('ica_challenges')
    .insert({
      challenge_slug: challengeTypeId,
      status: 'created',
      result_type: 'pending',
      scope,
      target_lang: scope === 'language' ? targetLang : null,
      native_lang: scope === 'language' ? nativeLang : null,
      challenger_user_id: input.userId,
      challenged_user_id: challengedUserId,
      duration_seconds: durationSeconds,
      expires_at: expiresAt,
      accept_until: acceptUntil,
      game_metadata: {
        mode: 'own_words_quiz',
        rounds,
        responseSeconds,
        totalQuestions: OWN_WORDS_TOTAL_QUESTIONS,
        questionsPerRound: OWN_WORDS_TOTAL_QUESTIONS / rounds,
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
    .select('id, challenger_user_id, challenged_user_id, status, accept_until')
    .eq('id', challengeId)
    .eq('challenged_user_id', input.userId)
    .maybeSingle()

  if (existingError) return jsonResponse(500, { error: existingError.message })
  if (!existing) return jsonResponse(404, { error: 'Desafío no encontrado.' })
  if (existing.status !== 'created') {
    return jsonResponse(400, { error: 'El desafío ya fue respondido.' })
  }

  const nowTs = Date.now()
  const acceptUntilTs = existing.accept_until ? Date.parse(existing.accept_until) : NaN
  if (Number.isFinite(acceptUntilTs) && acceptUntilTs <= nowTs) {
    await input.adminClient
      .from('ica_challenges')
      .update({
        status: 'not_accepted',
        result_type: 'not_accepted',
        finalized_at: new Date().toISOString(),
        winner_user_id: null,
        turn_user_id: null,
        turn_expires_at: null,
      })
      .eq('id', challengeId)

    return jsonResponse(400, { error: 'El reto ya caducó.' })
  }

  const nowIso = new Date().toISOString()
  const firstTurnExpiresAt = addSecondsToNow(TURN_WINDOW_SECONDS)
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
      turn_user_id: accept ? toText(existing.challenger_user_id) : null,
      turn_expires_at: accept ? firstTurnExpiresAt : null,
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

async function cancelInvitation(input: {
  adminClient: ReturnType<typeof createClient>
  userId: string
  body: Record<string, unknown>
}) {
  const challengeId = toText(input.body.challengeId)
  if (!challengeId) return jsonResponse(400, { error: 'challengeId inválido.' })

  const { data: challenge, error: readError } = await input.adminClient
    .from('ica_challenges')
    .select('id, status, challenger_user_id, challenged_user_id')
    .eq('id', challengeId)
    .eq('challenger_user_id', input.userId)
    .maybeSingle()

  if (readError) return jsonResponse(500, { error: readError.message })
  if (!challenge) return jsonResponse(404, { error: 'Desafío no encontrado.' })

  if (challenge.status !== 'created') {
    return jsonResponse(400, { error: 'El desafío ya no está pendiente.' })
  }

  const nowIso = new Date().toISOString()
  const { error: updateError } = await input.adminClient
    .from('ica_challenges')
    .update({
      status: 'cancelled',
      result_type: 'cancelled',
      finalized_at: nowIso,
      winner_user_id: null,
      turn_user_id: null,
      turn_expires_at: null,
    })
    .eq('id', challengeId)
    .eq('status', 'created')

  if (updateError) return jsonResponse(500, { error: updateError.message })

  await sendPushToUser({
    adminClient: input.adminClient,
    userId: toText(challenge.challenged_user_id),
    title: 'Reto cancelado',
    body: 'El retador canceló el desafío antes de que respondieras.',
    tag: `ica-challenge-cancelled-${challengeId}`,
    url: '/desafios-ica',
  })

  return jsonResponse(200, { ok: true, challengeId, status: 'cancelled' })
}

async function submitOwnWordsResult(input: {
  adminClient: ReturnType<typeof createClient>
  userId: string
  body: Record<string, unknown>
}) {
  const challengeId = toText(input.body.challengeId)
  const answers = normalizeOwnWordsAnswers(input.body.answers)

  if (!challengeId) return jsonResponse(400, { error: 'challengeId inválido.' })

  const { data: challenge, error: challengeError } = await input.adminClient
    .from('ica_challenges')
    .select('id, status, challenger_user_id, challenged_user_id, challenge_slug, turn_user_id, turn_expires_at, game_metadata')
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

  const turnUserId = toText(challenge.turn_user_id)
  if (turnUserId && input.userId !== turnUserId) {
    return jsonResponse(400, { error: 'No es tu turno para jugar.' })
  }

  if (challenge.turn_expires_at) {
    const turnExpiresTs = Date.parse(challenge.turn_expires_at)
    if (Number.isFinite(turnExpiresTs) && turnExpiresTs <= Date.now()) {
      return jsonResponse(400, { error: 'Tu turno ya venció.' })
    }
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

  const gameMetadata =
    challenge.game_metadata && typeof challenge.game_metadata === 'object'
      ? (challenge.game_metadata as Record<string, unknown>)
      : {}
  const rounds = toRounds(gameMetadata.rounds)
  const responseSeconds = toResponseSeconds(gameMetadata.responseSeconds)
  const questionsPerRound = OWN_WORDS_TOTAL_QUESTIONS / rounds

  const { data: existingPlays, error: existingPlaysError } = await input.adminClient
    .from('desafio_jugadas')
    .select('indice')
    .eq('desafio_id', challengeId)
    .eq('usuario_id', input.userId)
    .order('indice', { ascending: true })

  if (existingPlaysError) {
    return jsonResponse(500, { error: existingPlaysError.message })
  }

  const answeredBefore = (existingPlays || []).length
  const expectedBatchSize = Math.min(
    questionsPerRound,
    OWN_WORDS_TOTAL_QUESTIONS - answeredBefore,
  )

  if (answeredBefore >= OWN_WORDS_TOTAL_QUESTIONS) {
    return jsonResponse(400, { error: 'Ya completaste tus 10 preguntas.' })
  }

  if (answers.length !== expectedBatchSize) {
    return jsonResponse(400, { error: 'Debes completar todas las preguntas de esta ronda.' })
  }

  const hasExpectedIndexes = answers.every(
    (answer, index) => answer.questionIndex === answeredBefore + index,
  )
  if (!hasExpectedIndexes) {
    return jsonResponse(400, { error: 'Las respuestas no corresponden a la ronda actual.' })
  }

  const currentPayload =
    competitorRow.payload && typeof competitorRow.payload === 'object'
      ? (competitorRow.payload as Record<string, unknown>)
      : {}
  const answerRows = answers.map((answer) => ({
    desafio_id: challengeId,
    usuario_id: input.userId,
    indice: answer.questionIndex,
    acierto: answer.isCorrect,
    ms: answer.responseMs,
    payload: {
      selectedOptionIndex: answer.selectedOptionIndex,
      timedOut: answer.timedOut,
    },
  }))

  if (answerRows.length > 0) {
    const { error: upsertAnswerRowsError } = await input.adminClient
      .from('desafio_jugadas')
      .upsert(answerRows, { onConflict: 'desafio_id,usuario_id,indice' })

    if (upsertAnswerRowsError) {
      return jsonResponse(500, { error: upsertAnswerRowsError.message })
    }
  }

  const { data: allPlays, error: allPlaysError } = await input.adminClient
    .from('desafio_jugadas')
    .select('usuario_id, acierto')
    .eq('desafio_id', challengeId)

  if (allPlaysError) return jsonResponse(500, { error: allPlaysError.message })

  const challengePlays = (allPlays || []) as Array<{ usuario_id: string; acierto: boolean }>
  const getProgress = (userId: string) => {
    const userPlays = challengePlays.filter((play) => play.usuario_id === userId)
    return {
      answered: userPlays.length,
      score: userPlays.reduce((total, play) => total + Number(play.acierto), 0),
    }
  }

  const myProgress = getProgress(input.userId)
  const challengerProgress = getProgress(challenge.challenger_user_id)
  const challengedProgress = getProgress(challenge.challenged_user_id)
  const hasCompletedOwnQuestions = myProgress.answered >= OWN_WORDS_TOTAL_QUESTIONS

  const nextPayload = {
    ...currentPayload,
    ownWords: {
      completedAt: hasCompletedOwnQuestions ? nowIso : null,
      score: myProgress.score,
      totalQuestions: OWN_WORDS_TOTAL_QUESTIONS,
      rounds,
      questionsPerRound,
      responseSeconds,
      answeredQuestions: myProgress.answered,
    },
  }

  const { error: updateCompetitorError } = await input.adminClient
    .from('ica_challenge_competitors')
    .update({
      score: myProgress.score,
      payload: nextPayload,
    })
    .eq('challenge_id', challengeId)
    .eq('user_id', input.userId)

  if (updateCompetitorError) {
    return jsonResponse(500, { error: updateCompetitorError.message })
  }

  const challengerCompleted = challengerProgress.answered >= OWN_WORDS_TOTAL_QUESTIONS
  const challengedCompleted = challengedProgress.answered >= OWN_WORDS_TOTAL_QUESTIONS

  if (!challengerCompleted || !challengedCompleted) {
    const otherUserId =
      input.userId === challenge.challenger_user_id
        ? challenge.challenged_user_id
        : challenge.challenger_user_id
    const otherProgress = getProgress(otherUserId)
    const nextTurnUserId =
      otherProgress.answered >= OWN_WORDS_TOTAL_QUESTIONS ? input.userId : otherUserId

    const { error: setTurnError } = await input.adminClient
      .from('ica_challenges')
      .update({
        turn_user_id: nextTurnUserId,
        turn_expires_at: addSecondsToNow(TURN_WINDOW_SECONDS),
      })
      .eq('id', challengeId)
      .eq('status', 'in_progress')

    if (setTurnError) return jsonResponse(500, { error: setTurnError.message })

    return jsonResponse(200, { ok: true, challengeId })
  }

  const resultType =
    challengerProgress.score > challengedProgress.score
      ? 'challenger_win'
      : challengedProgress.score > challengerProgress.score
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
      turn_user_id: null,
      turn_expires_at: null,
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

  if (action === 'list-challenge-types') {
    return listChallengeTypes({
      adminClient: auth.adminClient,
    })
  }

  if (action === 'respond-invitation') {
    return respondInvitation({
      adminClient: auth.adminClient,
      userId: auth.userId,
      body: payload,
    })
  }

  if (action === 'cancel-invitation') {
    return cancelInvitation({
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

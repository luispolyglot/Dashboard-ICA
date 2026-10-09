import { jsonResponse } from '../_shared/http.ts'
import { buildChallengeJobPush, firstNameOf } from '../_shared/ica-challenge-job-notices.ts'
import type { AdminClient, ChallengeScope, LanguagePair } from './types.ts'
import {
  buildModeSettings,
  checkMixedAllowed,
  DEFAULT_MAX_LEVEL_GAP,
  MIN_WORDS_TO_JOIN,
  countEligible,
  minWordsForKind,
  readModeSettings,
  settingsToMetadata,
  wordsMissingToJoin,
  type WordSource,
  type EngineCard,
  type ModeSettings,
  type QuestionKind,
} from './engine.ts'

type ChallengeTypeRow = {
  id: string
  nombre: string
  icono: string
  activo: boolean
  orden: number
  ambitos: string[]
  config: Record<string, unknown>
}

type InvitationDependencies = {
  turnWindowSeconds: number
  invitationWindowSeconds: number
  maxActiveChallenges: number
  toText: (value: unknown) => string
  toScope: (value: unknown) => ChallengeScope
  toWordSource: (value: unknown) => WordSource
  toDurationSecondsDaysRange: (value: unknown) => number
  addSecondsToNow: (seconds: number) => string
  getChallengeTypeById: (input: {
    adminClient: AdminClient
    challengeTypeId: string
  }) => Promise<{ row: ChallengeTypeRow | null; error: string | null }>
  maxLevelGapFor: (config: Record<string, unknown>) => number
  countActiveChallenges: (adminClient: AdminClient, userId: string) => Promise<number>
  hasActivePairChallenge: (adminClient: AdminClient, firstId: string, secondId: string) => Promise<boolean>
  fetchLevelsForPair: (input: {
    adminClient: AdminClient
    userIds: string[]
    targetLang: string
    nativeLang: string
  }) => Promise<Map<string, string | null>>
  resolvePlayerPair: (
    adminClient: AdminClient,
    challenge: { scope: ChallengeScope; target_lang: string | null; native_lang: string | null },
    userId: string,
  ) => Promise<LanguagePair | null>
  countWordsForPair: (adminClient: AdminClient, userId: string, pair: LanguagePair) => Promise<number>
  fetchCards: (adminClient: AdminClient, userId: string, pair: LanguagePair) => Promise<EngineCard[]>
  hasPlayableQuestionSet: (input: { settings: ModeSettings; pools: EngineCard[][]; language: string }) => boolean
  notEnoughWordsToJoinMessage: (wordCount: number, action: 'retar' | 'aceptar') => string
  kindRequirement: Record<QuestionKind, string>
  sendPushToUser: (input: {
    adminClient: AdminClient
    userId: string
    title: string
    body: string
    tag: string
    url: string
  }) => Promise<void>
}

/** Crea una invitación y valida participantes, idiomas y palabras del modo. */
export async function createChallenge(
  input: { adminClient: AdminClient; userId: string; body: Record<string, unknown> },
  deps: InvitationDependencies,
): Promise<Response> {
  const { adminClient, userId, body } = input
  const challengeTypeId = deps.toText(body.challengeTypeId) || 'ica-own-words'
  const challengedUserId = deps.toText(body.challengedUserId)
  const scope = deps.toScope(body.scope)
  const targetLang = deps.toText(body.targetLang)
  const nativeLang = deps.toText(body.nativeLang)
  const wordSource = deps.toWordSource(body.wordSource)
  const durationSeconds = deps.toDurationSecondsDaysRange(body.durationSeconds)

  if (!challengedUserId) return jsonResponse(400, { error: 'Rival inválido.' })
  if (challengedUserId === userId) return jsonResponse(400, { error: 'No puedes desafiarte a ti mismo.' })
  if (scope === 'language' && (!targetLang || !nativeLang)) {
    return jsonResponse(400, { error: 'Faltan idiomas para el desafío por idioma.' })
  }
  if (wordSource === 'mixed' && scope !== 'language') {
    return jsonResponse(400, {
      code: 'ICA_CHALLENGE_MIXED_NEEDS_LANGUAGE',
      error: 'La mezcla de baúles ICA solo se puede jugar con alguien de tu mismo idioma.',
    })
  }

  const challengeTypeResult = await deps.getChallengeTypeById({ adminClient, challengeTypeId })
  if (challengeTypeResult.error) return jsonResponse(500, { error: challengeTypeResult.error })
  const challengeType = challengeTypeResult.row
  if (!challengeType) {
    return jsonResponse(400, { code: 'ICA_CHALLENGE_TYPE_NOT_FOUND', error: 'Ese modo de desafío no existe.' })
  }
  if (!challengeType.activo) {
    return jsonResponse(400, { code: 'ICA_CHALLENGE_TYPE_NOT_ACTIVE', error: 'Ese modo aún no está disponible.' })
  }
  if (!challengeType.ambitos.includes(scope)) {
    return jsonResponse(400, {
      code: 'ICA_CHALLENGE_SCOPE_NOT_SUPPORTED',
      error: 'Este modo no se puede jugar con este icademer.',
    })
  }

  const settings = buildModeSettings({
    typeId: challengeTypeId,
    typeConfig: challengeType.config,
    rounds: body.rounds,
    responseSeconds: body.responseSeconds,
    wordSource,
  })
  if (!settings) {
    return jsonResponse(400, {
      code: 'ICA_CHALLENGE_TYPE_NOT_PLAYABLE_YET',
      error: 'Este modo todavía no se puede jugar.',
    })
  }

  const myActiveCount = await deps.countActiveChallenges(adminClient, userId)
  const useExtraSlot = body.useExtraSlot === true
  if (myActiveCount >= deps.maxActiveChallenges && !(myActiveCount === deps.maxActiveChallenges && useExtraSlot)) {
    return jsonResponse(400, {
      code: 'ICA_CHALLENGE_ACTIVE_LIMIT_REACHED',
      error: 'Ya tienes 3 desafíos activos. Termina uno para retar de nuevo.',
    })
  }
  const rivalActiveCount = await deps.countActiveChallenges(adminClient, challengedUserId)
  if (rivalActiveCount >= deps.maxActiveChallenges) {
    return jsonResponse(400, {
      code: 'ICA_CHALLENGE_OPPONENT_ACTIVE_LIMIT_REACHED',
      error: 'Ese icademer ya tiene 3 desafíos activos.',
    })
  }
  if (await deps.hasActivePairChallenge(adminClient, userId, challengedUserId)) {
    return jsonResponse(400, {
      code: 'ICA_CHALLENGE_ACTIVE_PAIR_EXISTS',
      error: 'Ya tienen un desafío activo entre ustedes.',
    })
  }

  const myEnrollmentQuery = adminClient
    .from('users_ica_challenges')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
  if (scope === 'language') myEnrollmentQuery.eq('target_lang', targetLang).eq('native_lang', nativeLang)

  const rivalEnrollmentQuery = adminClient
    .from('users_ica_challenges')
    .select('id')
    .eq('user_id', challengedUserId)
    .eq('is_active', true)
  if (scope === 'language') rivalEnrollmentQuery.eq('target_lang', targetLang).eq('native_lang', nativeLang)

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

  let levelsMetadata: Record<string, string | null> | null = null
  if (wordSource === 'mixed') {
    const levels = await deps.fetchLevelsForPair({
      adminClient,
      userIds: [userId, challengedUserId],
      targetLang,
      nativeLang,
    })
    const myLevel = levels.get(userId) ?? null
    const rivalLevel = levels.get(challengedUserId) ?? null
    const mixed = checkMixedAllowed({ myLevel, rivalLevel, maxGap: deps.maxLevelGapFor(challengeType.config) })
    if (!mixed.allowed) return jsonResponse(400, { code: 'ICA_CHALLENGE_LEVEL_GAP', error: mixed.reason })
    levelsMetadata = { challenger: myLevel, challenged: rivalLevel }
  }

  const myPair: LanguagePair | null =
    targetLang && nativeLang
      ? { targetLang, nativeLang }
      : await deps.resolvePlayerPair(adminClient, { scope, target_lang: null, native_lang: null }, userId)
  const rivalPair: LanguagePair | null =
    scope === 'language'
      ? { targetLang, nativeLang }
      : await deps.resolvePlayerPair(adminClient, { scope, target_lang: null, native_lang: null }, challengedUserId)
  if (!myPair || !rivalPair) {
    return jsonResponse(400, { error: 'No encontramos el idioma de alguno de los dos.' })
  }

  const [myWordCount, rivalWordCount] = await Promise.all([
    deps.countWordsForPair(adminClient, userId, myPair),
    deps.countWordsForPair(adminClient, challengedUserId, rivalPair),
  ])
  if (wordsMissingToJoin(myWordCount) > 0) {
    return jsonResponse(400, {
      code: 'ICA_CHALLENGE_MIN_WORDS',
      error: deps.notEnoughWordsToJoinMessage(myWordCount, 'retar'),
    })
  }
  if (wordsMissingToJoin(rivalWordCount) > 0) {
    return jsonResponse(400, {
      code: 'ICA_CHALLENGE_RIVAL_MIN_WORDS',
      error: `Este icademer aún no tiene ${MIN_WORDS_TO_JOIN} palabras en su Baúl ICA.`,
    })
  }

  const [myCards, rivalCards] = await Promise.all([
    deps.fetchCards(adminClient, userId, myPair),
    deps.fetchCards(adminClient, challengedUserId, rivalPair),
  ])
  const minWords = minWordsForKind(settings.kind)
  const myEligible = countEligible(settings.kind, myCards, myPair.targetLang)
  const rivalEligible = countEligible(settings.kind, rivalCards, rivalPair.targetLang)

  if (wordSource === 'mixed') {
    const combinedEligible = countEligible(settings.kind, [...myCards, ...rivalCards], targetLang)
    if (
      combinedEligible < minWords ||
      !deps.hasPlayableQuestionSet({ settings, pools: [myCards, rivalCards], language: targetLang })
    ) {
      return jsonResponse(400, {
        code: 'ICA_CHALLENGE_NOT_ENOUGH_WORDS',
        error: `Entre los dos necesitan al menos ${minWords} palabras ICA${deps.kindRequirement[settings.kind]} para «${challengeType.nombre}».`,
      })
    }
  } else {
    if (
      myEligible < minWords ||
      !deps.hasPlayableQuestionSet({ settings, pools: [myCards], language: myPair.targetLang })
    ) {
      return jsonResponse(400, {
        code: 'ICA_CHALLENGE_NOT_ENOUGH_WORDS',
        error: `Necesitas al menos ${minWords} palabras ICA${deps.kindRequirement[settings.kind]} para «${challengeType.nombre}».`,
      })
    }
    if (
      rivalEligible < minWords ||
      !deps.hasPlayableQuestionSet({ settings, pools: [rivalCards], language: rivalPair.targetLang })
    ) {
      return jsonResponse(400, {
        code: 'ICA_CHALLENGE_RIVAL_NOT_ENOUGH_WORDS',
        error: `Tu rival aún no tiene ${minWords} palabras ICA${deps.kindRequirement[settings.kind]} para «${challengeType.nombre}».`,
      })
    }
  }

  const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString()
  const acceptUntil = deps.addSecondsToNow(deps.invitationWindowSeconds)
  // Capacidad, consumo del pase y creación de ambas filas se confirman en una transacción SQL.
  // Las comprobaciones previas de modo/palabras son informativas; esta RPC repite los límites
  // bajo locks para cerrar carreras entre dos solicitudes.
  const { data: challengeIdValue, error: challengeError } = await adminClient.rpc(
    'create_ica_challenge_with_pass',
    {
      p_user_id: userId,
      p_challenged_user_id: challengedUserId,
      p_challenge_slug: challengeTypeId,
      p_scope: scope,
      p_target_lang: targetLang,
      p_native_lang: nativeLang,
      p_duration_seconds: durationSeconds,
      p_expires_at: expiresAt,
      p_accept_until: acceptUntil,
      p_game_metadata: settingsToMetadata(settings, levelsMetadata ? { levels: levelsMetadata } : {}),
      p_phases_json: [
        { key: 'invitation', status: 'pending' },
        { key: 'duel', status: 'locked' },
      ],
      p_use_extra_slot: useExtraSlot,
    },
  )

  if (challengeError || !challengeIdValue) {
    const message = challengeError?.message || 'No se pudo crear el desafío.'
    return jsonResponse(400, { error: message })
  }

  const challengeId = deps.toText(challengeIdValue)

  // The invite names who sent it: «Sofía te retó a ...» (Luis, 6 Oct).
  const { data: challengerProfile } = await adminClient
    .from('profiles')
    .select('display_name, username')
    .eq('id', userId)
    .maybeSingle()
  const challengerName = firstNameOf(
    deps.toText(challengerProfile?.display_name),
    deps.toText(challengerProfile?.username),
  )

  await deps.sendPushToUser({
    adminClient,
    userId: challengedUserId,
    title: 'Nuevo desafío ICA',
    body: challengerName
      ? `${challengerName} te retó a «${challengeType.nombre}». Respóndelo para empezar.`
      : `Te retaron a «${challengeType.nombre}». Respóndelo para empezar.`,
    tag: `ica-challenge-created-${challengeId}`,
    url: '/desafios-ica',
  })
  return jsonResponse(200, { ok: true, challengeId })
}

/** Responde una invitación pendiente y valida los baúles actuales antes de aceptar. */
export async function respondInvitation(
  input: { adminClient: AdminClient; userId: string; body: Record<string, unknown> },
  deps: InvitationDependencies,
): Promise<Response> {
  const { adminClient, userId, body } = input
  const challengeId = deps.toText(body.challengeId)
  const accept = Boolean(body.accept)
  if (!challengeId) return jsonResponse(400, { error: 'challengeId inválido.' })

  const { data: existing, error: existingError } = await adminClient
    .from('ica_challenges')
    .select('id, challenger_user_id, challenged_user_id, status, accept_until, scope, target_lang, native_lang, challenge_slug, game_metadata')
    .eq('id', challengeId)
    .eq('challenged_user_id', userId)
    .maybeSingle()

  if (existingError) return jsonResponse(500, { error: existingError.message })
  if (!existing) return jsonResponse(404, { error: 'Desafío no encontrado.' })
  if (existing.status !== 'created') return jsonResponse(400, { error: 'El desafío ya fue respondido.' })

  const nowTs = Date.now()
  const acceptUntilTs = existing.accept_until ? Date.parse(existing.accept_until) : NaN
  if (Number.isFinite(acceptUntilTs) && acceptUntilTs <= nowTs) {
    const { data: expiredRows } = await adminClient
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
      .eq('status', 'created')
      .select('id')
    if (((expiredRows || []) as unknown[]).length === 0) {
      return jsonResponse(400, { error: 'El reto ya caducó.' })
    }
    // Same notice the expiration job would have sent to the challenger.
    const { data: lateProfile } = await adminClient
      .from('profiles')
      .select('display_name, username')
      .eq('id', userId)
      .maybeSingle()
    const notice = buildChallengeJobPush(
      {
        id: 0,
        challenge_id: challengeId,
        user_id: deps.toText(existing.challenger_user_id),
        rival_user_id: userId,
        kind: 'invite_expired',
        outcome: null,
        timed_out: false,
      },
      firstNameOf(deps.toText(lateProfile?.display_name), deps.toText(lateProfile?.username)),
      false,
    )
    if (notice) await deps.sendPushToUser({ adminClient, ...notice })
    return jsonResponse(400, { error: 'El reto ya caducó.' })
  }

  // Para aceptar se vuelven a validar las 20 palabras y las palabras elegibles del modo;
  // el baúl de cualquiera puede haber cambiado desde que se envió la invitación.
  if (accept) {
    const challengePair = {
      scope: deps.toScope(existing.scope),
      target_lang: deps.toText(existing.target_lang) || null,
      native_lang: deps.toText(existing.native_lang) || null,
    }
    const [challengerPair, challengedPair] = await Promise.all([
      deps.resolvePlayerPair(adminClient, challengePair, deps.toText(existing.challenger_user_id)),
      deps.resolvePlayerPair(adminClient, challengePair, deps.toText(existing.challenged_user_id)),
    ])
    const [challengerCount, challengedCount] = await Promise.all([
      challengerPair
        ? deps.countWordsForPair(adminClient, deps.toText(existing.challenger_user_id), challengerPair)
        : Promise.resolve(0),
      challengedPair
        ? deps.countWordsForPair(adminClient, deps.toText(existing.challenged_user_id), challengedPair)
        : Promise.resolve(0),
    ])
    if (challengedCount < MIN_WORDS_TO_JOIN) {
      return jsonResponse(400, {
        code: 'ICA_CHALLENGE_MIN_WORDS',
        error: deps.notEnoughWordsToJoinMessage(challengedCount, 'aceptar'),
      })
    }
    if (challengerCount < MIN_WORDS_TO_JOIN) {
      return jsonResponse(400, {
        code: 'ICA_CHALLENGE_RIVAL_MIN_WORDS',
        error: `El retador necesita al menos ${MIN_WORDS_TO_JOIN} palabras en su Baúl ICA.`,
      })
    }

    const settings = readModeSettings(deps.toText(existing.challenge_slug), existing.game_metadata)
    if (!settings || !challengerPair || !challengedPair) {
      return jsonResponse(400, { error: 'No se pudo validar el modo o los idiomas del desafío.' })
    }
    const [challengerCards, challengedCards] = await Promise.all([
      deps.fetchCards(adminClient, deps.toText(existing.challenger_user_id), challengerPair),
      deps.fetchCards(adminClient, deps.toText(existing.challenged_user_id), challengedPair),
    ])
    const minWords = minWordsForKind(settings.kind)
    if (settings.wordSource === 'mixed') {
      const language = challengePair.target_lang || challengedPair.targetLang
      const combinedEligible = countEligible(settings.kind, [...challengerCards, ...challengedCards], language)
      if (
        combinedEligible < minWords ||
        !deps.hasPlayableQuestionSet({ settings, pools: [challengerCards, challengedCards], language })
      ) {
        return jsonResponse(400, {
          code: 'ICA_CHALLENGE_NOT_ENOUGH_WORDS',
          error: `Entre los dos necesitan al menos ${minWords} palabras ICA${deps.kindRequirement[settings.kind]} para este modo.`,
        })
      }
    } else {
      const challengerEligible = countEligible(settings.kind, challengerCards, challengerPair.targetLang)
      const challengedEligible = countEligible(settings.kind, challengedCards, challengedPair.targetLang)
      if (
        challengerEligible < minWords ||
        challengedEligible < minWords ||
        !deps.hasPlayableQuestionSet({ settings, pools: [challengerCards], language: challengerPair.targetLang }) ||
        !deps.hasPlayableQuestionSet({ settings, pools: [challengedCards], language: challengedPair.targetLang })
      ) {
        return jsonResponse(400, {
          code: 'ICA_CHALLENGE_NOT_ENOUGH_WORDS',
          error: `Ambos necesitan al menos ${minWords} palabras ICA${deps.kindRequirement[settings.kind]} válidas para este modo.`,
        })
      }
    }
  }

  const nowIso = new Date().toISOString()
  const firstTurnExpiresAt = deps.addSecondsToNow(deps.turnWindowSeconds)
  const { error: competitorError } = await adminClient
    .from('ica_challenge_competitors')
    .update({
      invitation_status: accept ? 'accepted' : 'rejected',
      accepted_at: accept ? nowIso : null,
      rejected_at: accept ? null : nowIso,
    })
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)

  if (competitorError) return jsonResponse(500, { error: competitorError.message })

  const { error: challengeError } = await adminClient
    .from('ica_challenges')
    .update({
      status: accept ? 'in_progress' : 'not_accepted',
      result_type: accept ? 'pending' : 'not_accepted',
      started_at: accept ? nowIso : null,
      finalized_at: accept ? null : nowIso,
      winner_user_id: null,
      turn_user_id: accept ? userId : null,
      turn_expires_at: accept ? firstTurnExpiresAt : null,
    })
    .eq('id', challengeId)

  if (challengeError) return jsonResponse(500, { error: challengeError.message })

  await deps.sendPushToUser({
    adminClient,
    userId: deps.toText(existing.challenger_user_id),
    title: accept ? 'Desafío aceptado' : 'Desafío rechazado',
    body: accept
      ? 'Tu rival aceptó el desafío. Empieza su primer turno.'
      : 'Tu rival no aceptó el desafío.',
    tag: `ica-challenge-response-${challengeId}`,
    url: '/desafios-ica',
  })

  return jsonResponse(200, { ok: true, challengeId, status: accept ? 'in_progress' : 'not_accepted' })
}

/** Cancela una invitación pendiente creada por el usuario autenticado. */
export async function cancelInvitation(
  input: { adminClient: AdminClient; userId: string; body: Record<string, unknown> },
  deps: Pick<InvitationDependencies, 'toText' | 'sendPushToUser'>,
): Promise<Response> {
  const { adminClient, userId, body } = input
  const challengeId = deps.toText(body.challengeId)
  if (!challengeId) return jsonResponse(400, { error: 'challengeId inválido.' })

  const { data: challenge, error: readError } = await adminClient
    .from('ica_challenges')
    .select('id, status, challenger_user_id, challenged_user_id')
    .eq('id', challengeId)
    .eq('challenger_user_id', userId)
    .maybeSingle()

  if (readError) return jsonResponse(500, { error: readError.message })
  if (!challenge) return jsonResponse(404, { error: 'Desafío no encontrado.' })
  if (challenge.status !== 'created') return jsonResponse(400, { error: 'El desafío ya no está pendiente.' })

  const nowIso = new Date().toISOString()
  const { error: updateError } = await adminClient
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

  await deps.sendPushToUser({
    adminClient,
    userId: deps.toText(challenge.challenged_user_id),
    title: 'Reto cancelado',
    body: 'El retador canceló el desafío antes de que respondieras.',
    tag: `ica-challenge-cancelled-${challengeId}`,
    url: '/desafios-ica',
  })

  return jsonResponse(200, { ok: true, challengeId, status: 'cancelled' })
}

import webpush from 'npm:web-push@3.6.7'
import { CORS_HEADERS, jsonResponse } from '../_shared/http.ts'
import { ensureAuthenticated } from '../_shared/coaching-auth.ts'
import { listAvailableUsers } from './directory.ts'
import { getPublicProfile } from './profile.ts'
import { cancelInvitation, createChallenge, respondInvitation } from './invitations.ts'
import type { AdminClient, ChallengeScope, ChallengeStatus, LanguagePair } from './types.ts'
import {
  boardIndices,
  boardStart,
  decideResult,
  DEFAULT_MAX_LEVEL_GAP,
  evaluatePairsBoard,
  evaluateResponse,
  generateQuestions,
  isAnswerInTime,
  isCompetitorDone,
  isLightningSessionOver,
  LIGHTNING_GRACE_MS,
  isPendingQuestionStale,
  isPlayableTypeId,
  isRoundFinished,
  levelFromTracker,
  MIN_WORDS_TO_JOIN,
  MODE_DEFAULTS,
  nextTurnUserId,
  normalizeLevel,
  readGameState,
  readModeSettings,
  readPairMatches,
  remainingQuestionMs,
  roundInfo,
  usesTimeTiebreak,
  wordsMissingToJoin,
  type CompetitorGameState,
  type EngineCard,
  type ModeSettings,
  type PlayerResponse,
  type PublicQuestion,
  type QuestionKind,
  type SecretAnswer,
  type WordSource,
} from './engine.ts'

type PushSubscriptionRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

const INVITATION_WINDOW_SECONDS = 12 * 60 * 60
const TURN_WINDOW_SECONDS = 10 * 60 * 60
const MAX_ACTIVE_CHALLENGES = 3
const MAX_CARDS_PER_PLAYER = 3000

type ChallengeTypeRow = {
  id: string
  nombre: string
  icono: string
  activo: boolean
  orden: number
  ambitos: ChallengeScope[]
  config: Record<string, unknown>
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toScope(value: unknown): ChallengeScope {
  return value === 'language' ? 'language' : 'global'
}

function toWordSource(value: unknown): WordSource {
  return value === 'mixed' ? 'mixed' : 'own'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

function maxLevelGapFor(config: Record<string, unknown>): number {
  const parsed = Math.round(Number(config.maxLevelGap))
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MAX_LEVEL_GAP
  return Math.min(9, parsed)
}

async function getChallengeTypeById(input: {
  adminClient: AdminClient
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
  adminClient: AdminClient
}) {
  const { data, error } = await input.adminClient
    .from('desafio_tipos')
    .select('id, nombre, icono, activo, orden, ambitos, config')
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true })

  if (error) return jsonResponse(500, { error: error.message })

  const rows = ((data || []) as unknown[])
    .filter((row): row is Record<string, unknown> => isRecord(row))
    .map((row) => {
      const item = toChallengeTypeRow(row)
      const defaults = MODE_DEFAULTS[item.id]
      return {
        id: item.id,
        name: item.nombre,
        iconKey: item.icono,
        isActive: item.activo,
        order: item.orden,
        scopes: item.ambitos,
        config: item.config,
        isPlayable: isPlayableTypeId(item.id),
        kind: defaults?.kind ?? null,
        format: defaults?.format ?? null,
        maxLevelGap: maxLevelGapFor(item.config),
      }
    })

  return jsonResponse(200, { rows })
}

async function sendPushToUser(input: {
  adminClient: AdminClient
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
  adminClient: AdminClient,
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
  adminClient: AdminClient,
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

// ---------------------------------------------------------------------------
// Nivel real (el de la barra de progreso)
// ---------------------------------------------------------------------------

type SettingsInfo = { targetLang: string | null; nativeLang: string | null; cefrLevel: string | null }

async function fetchSettingsByUser(
  adminClient: AdminClient,
  userIds: string[],
): Promise<Map<string, SettingsInfo>> {
  const map = new Map<string, SettingsInfo>()
  if (userIds.length === 0) return map

  const { data, error } = await adminClient
    .from('user_settings')
    .select('user_id, target_lang, native_lang, cefr_level')
    .in('user_id', userIds)

  if (error) throw new Error(error.message)

  for (const row of (data || []) as Array<Record<string, unknown>>) {
    const userId = toText(row.user_id)
    if (!userId) continue
    map.set(userId, {
      targetLang: toText(row.target_lang) || null,
      nativeLang: toText(row.native_lang) || null,
      cefrLevel: toText(row.cefr_level) || null,
    })
  }
  return map
}

/**
 * Nivel de cada alumno para un par de idiomas: el de su barra de progreso
 * (user_meta_tracker). Si no la ha configurado, el nivel de sus ajustes (como PregúntICA).
 */
async function fetchLevelsForPair(input: {
  adminClient: AdminClient
  userIds: string[]
  targetLang: string
  nativeLang: string
  settingsByUser?: Map<string, SettingsInfo>
}): Promise<Map<string, string | null>> {
  const levels = new Map<string, string | null>()
  const userIds = Array.from(new Set(input.userIds.filter(Boolean)))
  if (userIds.length === 0 || !input.targetLang || !input.nativeLang) return levels

  const { data, error } = await input.adminClient
    .from('user_meta_tracker')
    .select('user_id, start_level, prior_ica_words, activation_words_total, confirmed_at')
    .in('user_id', userIds)
    .eq('target_lang', input.targetLang)
    .eq('native_lang', input.nativeLang)

  if (error) throw new Error(error.message)

  const trackerByUser = new Map<string, Record<string, unknown>>()
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    const userId = toText(row.user_id)
    if (userId) trackerByUser.set(userId, row)
  }

  const settingsByUser =
    input.settingsByUser || (await fetchSettingsByUser(input.adminClient, userIds))

  for (const userId of userIds) {
    const fromTracker = levelFromTracker(trackerByUser.get(userId) || null, input.targetLang)
    if (fromTracker) {
      levels.set(userId, fromTracker)
      continue
    }
    const setting = settingsByUser.get(userId)
    const fromSettings =
      setting && setting.targetLang === input.targetLang ? normalizeLevel(setting.cefrLevel) : null
    levels.set(userId, fromSettings)
  }

  return levels
}

// ---------------------------------------------------------------------------
// Palabras ICA de cada alumno
// ---------------------------------------------------------------------------

async function fetchCards(
  adminClient: AdminClient,
  userId: string,
  pair: LanguagePair,
): Promise<EngineCard[]> {
  const selection = 'id, target, native, example_phrase, example_translation'

  const scoped = await adminClient
    .from('lexicards')
    .select(selection)
    .eq('user_id', userId)
    .eq('target_lang', pair.targetLang)
    .eq('native_lang', pair.nativeLang)
    .limit(MAX_CARDS_PER_PLAYER)

  if (scoped.error) throw new Error(scoped.error.message)
  let rows = (scoped.data || []) as Array<Record<string, unknown>>

  if (rows.length === 0) {
    // Palabras antiguas sin idioma guardado (igual que hace la app al cargar el baúl).
    const legacy = await adminClient
      .from('lexicards')
      .select(selection)
      .eq('user_id', userId)
      .is('target_lang', null)
      .is('native_lang', null)
      .limit(MAX_CARDS_PER_PLAYER)
    if (legacy.error) throw new Error(legacy.error.message)
    rows = (legacy.data || []) as Array<Record<string, unknown>>
  }

  return rows
    .map((row) => ({
      id: toText(row.id),
      ownerUserId: userId,
      target: toText(row.target),
      native: toText(row.native),
      examplePhrase: toText(row.example_phrase) || null,
      exampleTranslation: toText(row.example_translation) || null,
    }))
    .filter((card) => card.id && card.target && card.native)
}

/** Idiomas con los que juega cada alumno: los del desafío (por idioma) o los suyos (global). */
async function resolvePlayerPair(
  adminClient: AdminClient,
  challenge: { scope: ChallengeScope; target_lang: string | null; native_lang: string | null },
  userId: string,
): Promise<LanguagePair | null> {
  if (challenge.scope === 'language' && challenge.target_lang && challenge.native_lang) {
    return { targetLang: challenge.target_lang, nativeLang: challenge.native_lang }
  }

  const settings = await fetchSettingsByUser(adminClient, [userId])
  const setting = settings.get(userId)
  if (setting?.targetLang && setting.nativeLang) {
    return { targetLang: setting.targetLang, nativeLang: setting.nativeLang }
  }

  const { data } = await adminClient
    .from('users_ica_challenges')
    .select('target_lang, native_lang, updated_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)

  const row = ((data || []) as Array<Record<string, unknown>>)[0]
  if (row && toText(row.target_lang) && toText(row.native_lang)) {
    return { targetLang: toText(row.target_lang), nativeLang: toText(row.native_lang) }
  }
  return null
}

const KIND_REQUIREMENT: Record<QuestionKind, string> = {
  choice: '',
  listen: '',
  write: ' de una sola palabra',
  speak: ' de hasta 4 palabras',
  cloze: ' con frase de ejemplo',
  pairs: ' cortas',
}

function hasPlayableQuestionSet(input: {
  settings: ModeSettings
  pools: EngineCard[][]
  language: string
}): boolean {
  return generateQuestions({
    kind: input.settings.kind,
    pools: input.pools,
    count: input.settings.totalQuestions,
    language: input.language,
  }).ok
}

// ---------------------------------------------------------------------------
// Mínimo de palabras para entrar en los retos
// ---------------------------------------------------------------------------

/** Palabras del Baúl ICA de alguien en un par de idiomas (como las cuenta la app). */
async function countWordsForPair(
  adminClient: AdminClient,
  userId: string,
  pair: LanguagePair,
): Promise<number> {
  const scoped = await adminClient
    .from('lexicards')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('target_lang', pair.targetLang)
    .eq('native_lang', pair.nativeLang)
  if (scoped.error) throw new Error(scoped.error.message)
  if ((scoped.count || 0) > 0) return scoped.count || 0

  // Palabras antiguas sin idioma guardado (igual que fetchCards).
  const legacy = await adminClient
    .from('lexicards')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('target_lang', null)
    .is('native_lang', null)
  if (legacy.error) throw new Error(legacy.error.message)
  return legacy.count || 0
}

function notEnoughWordsToJoinMessage(wordCount: number, action: 'retar' | 'aceptar'): string {
  const missing = wordsMissingToJoin(wordCount)
  const verb = action === 'retar' ? 'retar' : 'aceptar retos'
  return `Necesitas ${MIN_WORDS_TO_JOIN} palabras en tu Baúl ICA para ${verb}. Tienes ${wordCount}: te faltan ${missing}.`
}

// ---------------------------------------------------------------------------
// Partida: el servidor da las preguntas de una en una y corrige
// ---------------------------------------------------------------------------

type ChallengeRow = {
  id: string
  status: ChallengeStatus
  challenge_slug: string
  scope: ChallengeScope
  target_lang: string | null
  native_lang: string | null
  challenger_user_id: string
  challenged_user_id: string
  turn_user_id: string | null
  turn_expires_at: string | null
  result_type: string
  winner_user_id: string | null
  game_metadata: unknown
}

type CompetitorRow = {
  user_id: string
  invitation_status: string
  score: number | null
  payload: Record<string, unknown>
}

type PlayRow = { usuario_id: string; indice: number; acierto: boolean; ms: number | null }

type StoredAnswer = SecretAnswer & { language?: string; nativeLanguage?: string }

type QuestionRow = {
  id: string
  indice: number
  tipo: QuestionKind
  pregunta: PublicQuestion
  respuesta: StoredAnswer
  respuestas: Record<string, unknown>
}

type GameContext = {
  adminClient: AdminClient
  userId: string
  rivalId: string
  challenge: ChallengeRow
  settings: ModeSettings
  me: CompetitorRow
  rival: CompetitorRow | null
  myState: CompetitorGameState
  rivalState: CompetitorGameState
  myPlays: PlayRow[]
  rivalPlays: PlayRow[]
}

class GameError extends Error {
  status: number
  code: string | null

  constructor(status: number, message: string, code: string | null = null) {
    super(message)
    this.status = status
    this.code = code
  }
}

function toCompetitorRow(raw: Record<string, unknown>): CompetitorRow {
  return {
    user_id: toText(raw.user_id),
    invitation_status: toText(raw.invitation_status),
    score: raw.score === null || raw.score === undefined ? null : Number(raw.score),
    payload: isRecord(raw.payload) ? raw.payload : {},
  }
}

async function loadGame(adminClient: AdminClient, challengeId: string, userId: string): Promise<GameContext> {
  if (!challengeId) throw new GameError(400, 'challengeId inválido.')

  const { data: challengeData, error: challengeError } = await adminClient
    .from('ica_challenges')
    .select(
      'id, status, challenge_slug, scope, target_lang, native_lang, challenger_user_id, challenged_user_id, turn_user_id, turn_expires_at, result_type, winner_user_id, game_metadata',
    )
    .eq('id', challengeId)
    .maybeSingle()

  if (challengeError) throw new GameError(500, challengeError.message)
  if (!challengeData) throw new GameError(404, 'Desafío no encontrado.')
  const challenge = challengeData as unknown as ChallengeRow

  if (userId !== challenge.challenger_user_id && userId !== challenge.challenged_user_id) {
    throw new GameError(403, 'No participas en este desafío.')
  }

  const settings = readModeSettings(challenge.challenge_slug, challenge.game_metadata)
  if (!settings) throw new GameError(400, 'Este modo todavía no se puede jugar.', 'ICA_CHALLENGE_TYPE_NOT_PLAYABLE_YET')

  const [competitorsResult, playsResult] = await Promise.all([
    adminClient
      .from('ica_challenge_competitors')
      .select('user_id, invitation_status, score, payload')
      .eq('challenge_id', challengeId),
    adminClient
      .from('desafio_jugadas')
      .select('usuario_id, indice, acierto, ms')
      .eq('desafio_id', challengeId)
      .order('indice', { ascending: true }),
  ])

  if (competitorsResult.error) throw new GameError(500, competitorsResult.error.message)
  if (playsResult.error) throw new GameError(500, playsResult.error.message)

  const competitors = ((competitorsResult.data || []) as Array<Record<string, unknown>>).map(toCompetitorRow)
  const me = competitors.find((row) => row.user_id === userId)
  if (!me) throw new GameError(403, 'No participas en este desafío.')

  const rivalId =
    userId === challenge.challenger_user_id ? challenge.challenged_user_id : challenge.challenger_user_id
  const rival = competitors.find((row) => row.user_id === rivalId) || null
  const plays = ((playsResult.data || []) as Array<Record<string, unknown>>).map((row) => ({
    usuario_id: toText(row.usuario_id),
    indice: Number(row.indice),
    acierto: Boolean(row.acierto),
    ms: row.ms === null || row.ms === undefined || !Number.isFinite(Number(row.ms)) ? null : Number(row.ms),
  }))

  return {
    adminClient,
    userId,
    rivalId,
    challenge,
    settings,
    me,
    rival,
    myState: readGameState(me.payload),
    rivalState: readGameState(rival?.payload),
    myPlays: plays.filter((play) => play.usuario_id === userId),
    rivalPlays: plays.filter((play) => play.usuario_id === rivalId),
  }
}

function scoreOf(plays: PlayRow[]): number {
  return plays.reduce((total, play) => total + Number(play.acierto), 0)
}

/** Tiempo total jugado (desempate de Parejas). */
function totalMsOf(plays: PlayRow[]): number {
  return plays.reduce((total, play) => total + (play.ms ?? 0), 0)
}

function isMeDone(ctx: GameContext, nowMs = Date.now()): boolean {
  return isCompetitorDone({
    settings: ctx.settings,
    state: ctx.myState,
    answeredCount: ctx.myPlays.length,
    nowMs,
  })
}

function isRivalDone(ctx: GameContext, nowMs = Date.now()): boolean {
  return isCompetitorDone({
    settings: ctx.settings,
    state: ctx.rivalState,
    answeredCount: ctx.rivalPlays.length,
    nowMs,
  })
}

function assertCanPlay(ctx: GameContext) {
  if (ctx.me.invitation_status !== 'accepted') {
    throw new GameError(400, 'No puedes jugar este desafío.')
  }
  if (ctx.challenge.status !== 'in_progress') {
    throw new GameError(400, 'El desafío no está en curso.', 'ICA_CHALLENGE_NOT_IN_PROGRESS')
  }
  if (ctx.challenge.turn_user_id && ctx.challenge.turn_user_id !== ctx.userId) {
    throw new GameError(409, 'Aún no es tu turno.', 'ICA_CHALLENGE_NOT_YOUR_TURN')
  }
  if (ctx.challenge.turn_expires_at) {
    const turnExpiresTs = Date.parse(ctx.challenge.turn_expires_at)
    if (Number.isFinite(turnExpiresTs) && turnExpiresTs <= Date.now()) {
      throw new GameError(400, 'Tu turno ya venció.', 'ICA_CHALLENGE_TURN_EXPIRED')
    }
  }
}

async function saveMyState(ctx: GameContext, state: CompetitorGameState) {
  const score = scoreOf(ctx.myPlays)
  const payload = {
    ...ctx.me.payload,
    game: {
      answered: ctx.myPlays.length,
      correct: score,
      completedAt: state.completedAt,
      current: state.current,
      sessionStartedAt: state.sessionStartedAt,
      sessionEndsAt: state.sessionEndsAt,
    },
  }

  const { error } = await ctx.adminClient
    .from('ica_challenge_competitors')
    .update({ score: ctx.myPlays.length > 0 || state.completedAt ? score : ctx.me.score, payload })
    .eq('challenge_id', ctx.challenge.id)
    .eq('user_id', ctx.userId)

  if (error) throw new GameError(500, error.message)
  ctx.myState = state
  ctx.me = { ...ctx.me, payload, score }
}

/** Preguntas del jugador (las genera la primera vez). */
async function ensureQuestions(ctx: GameContext): Promise<QuestionRow[]> {
  const ownerKey = ctx.settings.wordSource === 'mixed' ? null : ctx.userId

  const readRows = async (): Promise<QuestionRow[]> => {
    let query = ctx.adminClient
      .from('desafio_preguntas')
      .select('id, indice, tipo, pregunta, respuesta, respuestas')
      .eq('desafio_id', ctx.challenge.id)
      .order('indice', { ascending: true })
    query = ownerKey ? query.eq('usuario_id', ownerKey) : query.is('usuario_id', null)
    const { data, error } = await query
    if (error) throw new GameError(500, error.message)
    return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: toText(row.id),
      indice: Number(row.indice),
      tipo: toText(row.tipo) as QuestionKind,
      pregunta: row.pregunta as PublicQuestion,
      respuesta: row.respuesta as StoredAnswer,
      respuestas: isRecord(row.respuestas) ? row.respuestas : {},
    }))
  }

  const existing = await readRows()
  if (existing.length > 0) return existing

  let pools: EngineCard[][]
  let pair: LanguagePair | null

  if (ctx.settings.wordSource === 'mixed') {
    pair =
      ctx.challenge.target_lang && ctx.challenge.native_lang
        ? { targetLang: ctx.challenge.target_lang, nativeLang: ctx.challenge.native_lang }
        : null
    if (!pair) throw new GameError(400, 'Faltan los idiomas del desafío.')
    pools = await Promise.all([
      fetchCards(ctx.adminClient, ctx.challenge.challenger_user_id, pair),
      fetchCards(ctx.adminClient, ctx.challenge.challenged_user_id, pair),
    ])
  } else {
    pair = await resolvePlayerPair(ctx.adminClient, ctx.challenge, ctx.userId)
    if (!pair) throw new GameError(400, 'No encontramos tu idioma objetivo.')
    pools = [await fetchCards(ctx.adminClient, ctx.userId, pair)]
  }

  const generated = generateQuestions({
    kind: ctx.settings.kind,
    pools,
    count: ctx.settings.totalQuestions,
    language: pair.targetLang,
  })

  if (!generated.ok) {
    throw new GameError(
      400,
      `No hay suficientes palabras ICA${KIND_REQUIREMENT[ctx.settings.kind]} para este modo.`,
      'ICA_CHALLENGE_NOT_ENOUGH_WORDS',
    )
  }

  const rows = generated.questions.map((item, index) => ({
    desafio_id: ctx.challenge.id,
    usuario_id: ownerKey,
    indice: index,
    tipo: item.kind,
    pregunta: item.question,
    respuesta: { ...item.answer, language: pair!.targetLang, nativeLanguage: pair!.nativeLang },
  }))

  const { error } = await ctx.adminClient.from('desafio_preguntas').insert(rows)
  // Si justo las ha creado el rival (mezcla de baúles), se usan las suyas.
  if (error && (error as { code?: string }).code !== '23505') throw new GameError(500, error.message)

  return readRows()
}

function questionPayload(ctx: GameContext, row: QuestionRow, servedAtMs: number, nowMs: number) {
  const settings = ctx.settings
  const info = roundInfo(settings, row.indice)
  return {
    index: row.indice,
    kind: row.tipo,
    data: row.pregunta,
    language: {
      target: toText(row.respuesta.language) || ctx.challenge.target_lang || '',
      native: toText(row.respuesta.nativeLanguage) || ctx.challenge.native_lang || '',
    },
    limitMs:
      settings.format === 'turns'
        ? remainingQuestionMs({ settings, servedAtMs, nowMs })
        : null,
    round: settings.format === 'turns' ? info : null,
  }
}

function progressPayload(ctx: GameContext) {
  return {
    answered: ctx.myPlays.length,
    correct: scoreOf(ctx.myPlays),
    total: ctx.settings.format === 'turns' ? ctx.settings.totalQuestions : null,
    rivalAnswered: ctx.rivalPlays.length,
    rivalCorrect: scoreOf(ctx.rivalPlays),
  }
}

function sessionPayload(ctx: GameContext, nowMs: number) {
  if (ctx.settings.format !== 'lightning' || !ctx.myState.sessionEndsAt) return null
  const endsAt = Date.parse(ctx.myState.sessionEndsAt)
  return {
    endsAt: ctx.myState.sessionEndsAt,
    remainingMs: Number.isFinite(endsAt) ? Math.max(0, endsAt - nowMs) : 0,
    totalMs: (ctx.settings.sessionSeconds || 60) * 1000,
  }
}

async function finalizeChallenge(ctx: GameContext) {
  const challengerPlays =
    ctx.userId === ctx.challenge.challenger_user_id ? ctx.myPlays : ctx.rivalPlays
  const challengedPlays =
    ctx.userId === ctx.challenge.challenged_user_id ? ctx.myPlays : ctx.rivalPlays

  const resultType = decideResult(
    scoreOf(challengerPlays),
    scoreOf(challengedPlays),
    usesTimeTiebreak(ctx.settings.kind)
      ? { challengerMs: totalMsOf(challengerPlays), challengedMs: totalMsOf(challengedPlays) }
      : null,
  )
  const winnerUserId =
    resultType === 'challenger_win'
      ? ctx.challenge.challenger_user_id
      : resultType === 'challenged_win'
        ? ctx.challenge.challenged_user_id
        : null

  const { data, error } = await ctx.adminClient
    .from('ica_challenges')
    .update({
      status: 'completed',
      result_type: resultType,
      winner_user_id: winnerUserId,
      finalized_at: new Date().toISOString(),
      turn_user_id: null,
      turn_expires_at: null,
    })
    .eq('id', ctx.challenge.id)
    .eq('status', 'in_progress')
    .select('id')

  if (error) throw new GameError(500, error.message)
  ctx.challenge = { ...ctx.challenge, status: 'completed', result_type: resultType, winner_user_id: winnerUserId, turn_user_id: null }

  // Solo avisa quien cierra de verdad el desafío (evita avisos dobles).
  if (((data || []) as unknown[]).length === 0) return

  for (const userId of [ctx.challenge.challenger_user_id, ctx.challenge.challenged_user_id]) {
    const body =
      winnerUserId === null
        ? 'Empate en el desafío ICA. ¡Revisa las palabras!'
        : winnerUserId === userId
          ? '¡Has ganado el desafío ICA! Mira tus resultados.'
          : 'Tu rival ha ganado esta vez. Mira tus palabras en Desafíos ICA.'
    await sendPushToUser({
      adminClient: ctx.adminClient,
      userId,
      title: 'Desafío terminado',
      body,
      tag: `ica-challenge-finished-${ctx.challenge.id}`,
      url: `/desafios-ica/${ctx.challenge.id}`,
    })
  }
}

/** Al terminar una ronda (o la partida relámpago): pasa el turno o cierra el desafío. */
async function afterMyRound(ctx: GameContext) {
  const nowMs = Date.now()
  const meDone = isMeDone(ctx, nowMs)
  const rivalDone = isRivalDone(ctx, nowMs)
  const nextTurn = nextTurnUserId({ me: ctx.userId, rival: ctx.rivalId, meDone, rivalDone })

  if (nextTurn === null) {
    await finalizeChallenge(ctx)
    return
  }

  const { error } = await ctx.adminClient
    .from('ica_challenges')
    .update({
      turn_user_id: nextTurn,
      turn_expires_at: addSecondsToNow(TURN_WINDOW_SECONDS),
    })
    .eq('id', ctx.challenge.id)
    .eq('status', 'in_progress')

  if (error) throw new GameError(500, error.message)
  ctx.challenge = { ...ctx.challenge, turn_user_id: nextTurn }

  if (nextTurn !== ctx.userId) {
    await sendPushToUser({
      adminClient: ctx.adminClient,
      userId: nextTurn,
      title: 'Te toca jugar',
      body: 'Tu rival terminó su ronda. Continúa el desafío ICA.',
      tag: `ica-challenge-turn-${ctx.challenge.id}`,
      url: `/desafios-ica/${ctx.challenge.id}`,
    })
  }
}

async function finishLightningSession(ctx: GameContext) {
  if (ctx.myState.completedAt) return
  await saveMyState(ctx, { ...ctx.myState, current: null, completedAt: new Date().toISOString() })
  await afterMyRound(ctx)
}

async function recordPlay(
  ctx: GameContext,
  input: { index: number; isCorrect: boolean; clientMs: number | null; timedOut: boolean },
) {
  const { error } = await ctx.adminClient.from('desafio_jugadas').insert({
    desafio_id: ctx.challenge.id,
    usuario_id: ctx.userId,
    indice: input.index,
    acierto: input.isCorrect,
    ms: input.clientMs,
    payload: { timedOut: input.timedOut, kind: ctx.settings.kind },
  })

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new GameError(409, 'Esta respuesta ya estaba guardada.', 'ICA_CHALLENGE_ALREADY_ANSWERED')
    }
    throw new GameError(500, error.message)
  }

  ctx.myPlays = [
    ...ctx.myPlays,
    { usuario_id: ctx.userId, indice: input.index, acierto: input.isCorrect, ms: input.clientMs },
  ]
}

/** Parejas: guarda las 5 jugadas de un tablero de una vez. */
async function recordBoardPlays(
  ctx: GameContext,
  plays: Array<{ index: number; isCorrect: boolean; ms: number | null; timedOut: boolean }>,
) {
  const { error } = await ctx.adminClient.from('desafio_jugadas').insert(
    plays.map((play) => ({
      desafio_id: ctx.challenge.id,
      usuario_id: ctx.userId,
      indice: play.index,
      acierto: play.isCorrect,
      ms: play.ms,
      payload: { timedOut: play.timedOut, kind: ctx.settings.kind },
    })),
  )

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new GameError(409, 'Esta respuesta ya estaba guardada.', 'ICA_CHALLENGE_ALREADY_ANSWERED')
    }
    throw new GameError(500, error.message)
  }

  ctx.myPlays = [
    ...ctx.myPlays,
    ...plays.map((play) => ({ usuario_id: ctx.userId, indice: play.index, acierto: play.isCorrect, ms: play.ms })),
  ]
}

/** Guarda lo que respondió (solo lo ve el servidor; sirve para la pantalla de resultados). */
async function saveResponse(ctx: GameContext, row: QuestionRow, record: Record<string, unknown>) {
  const { error } = await ctx.adminClient
    .from('desafio_preguntas')
    .update({ respuestas: { ...row.respuestas, [ctx.userId]: record } })
    .eq('id', row.id)
  if (error) throw new GameError(500, error.message)
  row.respuestas = { ...row.respuestas, [ctx.userId]: record }
}

/** Sirve la pregunta que toca (o la que quedó abierta) y apunta la hora. */
async function serveQuestion(ctx: GameContext, questions?: QuestionRow[]) {
  const nowMs = Date.now()
  const rows = questions || (await ensureQuestions(ctx))
  const nextIndex = ctx.myPlays.length
  const row = rows.find((item) => item.indice === nextIndex)

  if (!row) {
    if (ctx.settings.format === 'lightning') {
      await finishLightningSession(ctx)
    } else {
      await saveMyState(ctx, { ...ctx.myState, current: null, completedAt: new Date().toISOString() })
      await afterMyRound(ctx)
    }
    return { status: 'done' as const }
  }

  await saveMyState(ctx, {
    ...ctx.myState,
    current: { index: row.indice, servedAt: new Date(nowMs).toISOString() },
  })

  return { status: 'question' as const, question: questionPayload(ctx, row, nowMs, nowMs) }
}

async function nextQuestion(ctx: GameContext) {
  const nowMs = Date.now()
  assertCanPlay(ctx)

  if (ctx.settings.format === 'lightning') {
    if (ctx.myState.completedAt) {
      return { status: 'done' as const }
    }
    if (!ctx.myState.sessionEndsAt) {
      const sessionMs = (ctx.settings.sessionSeconds || 60) * 1000
      await ensureQuestions(ctx)
      const startedAt = new Date()
      await saveMyState(ctx, {
        ...ctx.myState,
        sessionStartedAt: startedAt.toISOString(),
        sessionEndsAt: new Date(startedAt.getTime() + sessionMs).toISOString(),
      })
    } else if (isLightningSessionOver(ctx.myState, nowMs)) {
      await finishLightningSession(ctx)
      return { status: 'done' as const }
    }
  } else if (isMeDone(ctx, nowMs)) {
    return { status: 'done' as const }
  }

  const rows = await ensureQuestions(ctx)
  const current = ctx.myState.current

  if (current && !ctx.myPlays.some((play) => play.indice === current.index)) {
    const servedAtMs = Date.parse(current.servedAt)
    const row = rows.find((item) => item.indice === current.index)
    const stale =
      !Number.isFinite(servedAtMs) || isPendingQuestionStale({ settings: ctx.settings, servedAtMs, nowMs })

    if (row && !stale) {
      // Se retoma la pregunta abierta con el tiempo que le quedaba.
      return { status: 'question' as const, question: questionPayload(ctx, row, servedAtMs, nowMs) }
    }

    if (row) {
      // Cerró la app con la pregunta abierta: cuenta como fallo (en Parejas, todo el tablero).
      const staleIndices =
        ctx.settings.kind === 'pairs'
          ? boardIndices(current.index, ctx.settings.totalQuestions)
          : [current.index]
      for (const index of staleIndices) {
        const staleRow = rows.find((item) => item.indice === index)
        if (!staleRow || ctx.myPlays.some((play) => play.indice === index)) continue
        await recordPlay(ctx, { index, isCorrect: false, clientMs: null, timedOut: true })
        await saveResponse(ctx, staleRow, {
          optionIndex: null,
          text: null,
          transcript: null,
          correct: false,
          timedOut: true,
          at: new Date(nowMs).toISOString(),
        })
      }
      await saveMyState(ctx, { ...ctx.myState, current: null })
      if (isRoundFinished(ctx.settings, ctx.myPlays.length)) {
        if (ctx.myPlays.length >= ctx.settings.totalQuestions) {
          await saveMyState(ctx, { ...ctx.myState, completedAt: new Date().toISOString() })
        }
        await afterMyRound(ctx)
        return { status: ctx.myState.completedAt ? ('done' as const) : ('round_finished' as const) }
      }
    }
  }

  return serveQuestion(ctx, rows)
}

function readResponse(body: Record<string, unknown>): PlayerResponse {
  const raw = isRecord(body.response) ? body.response : {}
  const optionIndexRaw = raw.optionIndex
  return {
    optionIndex:
      optionIndexRaw === null || optionIndexRaw === undefined || optionIndexRaw === ''
        ? null
        : Math.round(Number(optionIndexRaw)),
    text: typeof raw.text === 'string' ? raw.text.slice(0, 120) : null,
    transcripts: Array.isArray(raw.transcripts)
      ? raw.transcripts.filter((item): item is string => typeof item === 'string').slice(0, 6)
      : null,
  }
}

function revealPayload(row: QuestionRow) {
  return {
    target: row.respuesta.target,
    native: row.respuesta.native,
    correctOptionIndex: row.respuesta.correctOptionIndex,
    phrase: row.respuesta.phrase,
    phraseTranslation: row.respuesta.phraseTranslation,
  }
}

async function answerQuestion(ctx: GameContext, body: Record<string, unknown>) {
  const nowMs = Date.now()
  const questionIndex = Math.round(Number(body.questionIndex))
  if (!Number.isInteger(questionIndex) || questionIndex < 0) {
    throw new GameError(400, 'Pregunta inválida.')
  }

  const rows = await ensureQuestions(ctx)
  const row = rows.find((item) => item.indice === questionIndex)
  if (!row) throw new GameError(400, 'Pregunta inválida.')

  if (ctx.settings.kind === 'pairs') return answerPairsBoard(ctx, body, rows, questionIndex, nowMs)

  // Reintento (se cortó la conexión justo al responder): se devuelve lo guardado.
  const alreadyPlayed = ctx.myPlays.find((play) => play.indice === questionIndex)
  if (alreadyPlayed) {
    return {
      status: 'answered' as const,
      duplicate: true,
      result: { isCorrect: alreadyPlayed.acierto, timedOut: false, reveal: revealPayload(row) },
      progress: progressPayload(ctx),
    }
  }

  assertCanPlay(ctx)

  const current = ctx.myState.current
  if (!current || current.index !== questionIndex) {
    throw new GameError(409, 'Esta pregunta ya no está activa.', 'ICA_CHALLENGE_QUESTION_NOT_ACTIVE')
  }

  const servedAtMs = Date.parse(current.servedAt)
  const clientMsRaw = Number(body.clientMs)
  const clientMs = Number.isFinite(clientMsRaw) ? Math.max(0, Math.min(600000, Math.round(clientMsRaw))) : null
  const sessionEndsAtMs = ctx.myState.sessionEndsAt ? Date.parse(ctx.myState.sessionEndsAt) : null
  const inTime = isAnswerInTime({
    settings: ctx.settings,
    servedAtMs: Number.isFinite(servedAtMs) ? servedAtMs : 0,
    nowMs,
    clientMs,
    sessionEndsAtMs,
  })

  if (ctx.settings.format === 'lightning' && !inTime) {
    // Se acabó el minuto: la respuesta ya no cuenta.
    await finishLightningSession(ctx)
    return {
      status: 'done' as const,
      late: true,
      progress: progressPayload(ctx),
    }
  }

  const timedOut = Boolean(body.timedOut) || !inTime
  const response = readResponse(body)
  const language = toText(row.respuesta.language) || ctx.challenge.target_lang || ''
  const isCorrect =
    !timedOut &&
    evaluateResponse({ kind: row.tipo, answer: row.respuesta, response, language })

  await recordPlay(ctx, { index: questionIndex, isCorrect, clientMs, timedOut })

  await saveResponse(ctx, row, {
    optionIndex: response.optionIndex,
    text: response.text,
    transcript: response.transcripts?.[0] ?? null,
    correct: isCorrect,
    timedOut,
    at: new Date(nowMs).toISOString(),
  })

  const result = { isCorrect, timedOut, reveal: revealPayload(row) }

  if (ctx.settings.format === 'lightning') {
    // serveQuestion guarda el progreso y apunta la siguiente palabra.
    const served = await serveQuestion(ctx, rows)
    return {
      status: served.status === 'question' ? ('answered' as const) : ('done' as const),
      result,
      next: served.status === 'question' ? served.question : null,
      progress: progressPayload(ctx),
      session: sessionPayload(ctx, Date.now()),
    }
  }

  const answered = ctx.myPlays.length
  if (isRoundFinished(ctx.settings, answered)) {
    const done = answered >= ctx.settings.totalQuestions
    await saveMyState(ctx, {
      ...ctx.myState,
      current: null,
      completedAt: done ? new Date().toISOString() : ctx.myState.completedAt,
    })
    await afterMyRound(ctx)
    return {
      status: done ? ('done' as const) : ('round_finished' as const),
      result,
      next: null,
      progress: progressPayload(ctx),
      challengeStatus: ctx.challenge.status,
      isMyTurn: ctx.challenge.turn_user_id === ctx.userId,
    }
  }

  const served = await serveQuestion(ctx, rows)
  return {
    status: 'answered' as const,
    result,
    next: served.status === 'question' ? served.question : null,
    progress: progressPayload(ctx),
  }
}

function storedBoardResult(ctx: GameContext, boardRows: QuestionRow[]) {
  const chosen = boardRows.map((row) => {
    const mine = row.respuestas[ctx.userId]
    return isRecord(mine) && typeof mine.optionIndex === 'number' ? mine.optionIndex : null
  })
  const correct = boardRows.map(
    (row) => ctx.myPlays.find((play) => play.indice === row.indice)?.acierto ?? false,
  )
  const solution = boardRows.map((row) => row.respuesta.correctOptionIndex ?? -1)
  return { correct, solution, chosen }
}

/**
 * Parejas: el móvil manda el tablero entero (qué significado ha unido a cada palabra).
 * Se corrigen las 5 parejas a la vez y se guardan como 5 jugadas. La siguiente pregunta
 * no va incluida: el móvil la pide al terminar de enseñar el resultado (así el reloj del
 * siguiente tablero empieza entero).
 */
async function answerPairsBoard(
  ctx: GameContext,
  body: Record<string, unknown>,
  rows: QuestionRow[],
  questionIndex: number,
  nowMs: number,
) {
  const start = boardStart(questionIndex)
  const indices = boardIndices(start, ctx.settings.totalQuestions)
  const boardRows = indices
    .map((index) => rows.find((item) => item.indice === index))
    .filter((item): item is QuestionRow => Boolean(item))
  if (questionIndex !== start || boardRows.length !== indices.length) {
    throw new GameError(400, 'Tablero inválido.')
  }

  // Reintento: se devuelve lo guardado.
  if (ctx.myPlays.some((play) => indices.includes(play.indice))) {
    const pairs = storedBoardResult(ctx, boardRows)
    return {
      status: 'answered' as const,
      duplicate: true,
      result: { isCorrect: pairs.correct.every(Boolean), timedOut: false, reveal: revealPayload(boardRows[0]) },
      pairs,
      next: null,
      progress: progressPayload(ctx),
    }
  }

  assertCanPlay(ctx)

  const current = ctx.myState.current
  if (!current || current.index !== start) {
    throw new GameError(409, 'Este tablero ya no está activo.', 'ICA_CHALLENGE_QUESTION_NOT_ACTIVE')
  }

  const servedAtMs = Date.parse(current.servedAt)
  const clientMsRaw = Number(body.clientMs)
  const clientMs = Number.isFinite(clientMsRaw) ? Math.max(0, Math.min(600000, Math.round(clientMsRaw))) : null
  const inTime = isAnswerInTime({
    settings: ctx.settings,
    servedAtMs: Number.isFinite(servedAtMs) ? servedAtMs : 0,
    nowMs,
    clientMs,
    sessionEndsAtMs: null,
  })
  // Tiempo medido en el servidor (el desempate no se fía del reloj del móvil).
  const elapsedMs = Number.isFinite(servedAtMs) ? Math.max(0, Math.min(600000, nowMs - servedAtMs)) : clientMs
  const response = isRecord(body.response) ? body.response : {}
  const board = evaluatePairsBoard({
    answers: boardRows.map((row) => row.respuesta),
    matches: readPairMatches(response.matches),
    inTime,
  })
  const timedOut = !inTime || Boolean(body.timedOut)
  const at = new Date(nowMs).toISOString()

  await recordBoardPlays(
    ctx,
    boardRows.map((row, position) => ({
      index: row.indice,
      isCorrect: board.correct[position],
      ms: elapsedMs,
      timedOut,
    })),
  )
  await Promise.all(
    boardRows.map((row, position) =>
      saveResponse(ctx, row, {
        optionIndex: board.chosen[position],
        text: null,
        transcript: null,
        correct: board.correct[position],
        timedOut,
        at,
      }),
    ),
  )

  const result = { isCorrect: board.correct.every(Boolean), timedOut, reveal: revealPayload(boardRows[0]) }
  const answered = ctx.myPlays.length

  if (isRoundFinished(ctx.settings, answered)) {
    const done = answered >= ctx.settings.totalQuestions
    await saveMyState(ctx, {
      ...ctx.myState,
      current: null,
      completedAt: done ? new Date().toISOString() : ctx.myState.completedAt,
    })
    await afterMyRound(ctx)
    return {
      status: done ? ('done' as const) : ('round_finished' as const),
      result,
      pairs: board,
      next: null,
      progress: progressPayload(ctx),
      challengeStatus: ctx.challenge.status,
      isMyTurn: ctx.challenge.turn_user_id === ctx.userId,
    }
  }

  await saveMyState(ctx, { ...ctx.myState, current: null })
  return { status: 'answered' as const, result, pairs: board, next: null, progress: progressPayload(ctx) }
}

async function endSession(ctx: GameContext) {
  if (ctx.settings.format !== 'lightning') {
    throw new GameError(400, 'Solo el Modo Relámpago tiene partida por tiempo.')
  }
  if (ctx.myState.completedAt) return { status: 'done' as const }
  assertCanPlay(ctx)
  const sessionEndsAt = ctx.myState.sessionEndsAt ? Date.parse(ctx.myState.sessionEndsAt) : NaN
  if (!Number.isFinite(sessionEndsAt)) {
    throw new GameError(409, 'La cuenta atrás todavía no ha empezado.', 'ICA_CHALLENGE_SESSION_NOT_STARTED')
  }
  if (Date.now() < sessionEndsAt + LIGHTNING_GRACE_MS) {
    throw new GameError(409, 'La cuenta atrás aún no ha terminado.', 'ICA_CHALLENGE_SESSION_NOT_OVER')
  }
  await finishLightningSession(ctx)
  return { status: 'done' as const, progress: progressPayload(ctx) }
}

async function playState(ctx: GameContext) {
  const nowMs = Date.now()

  // Si la partida relámpago se quedó a medias (cerró la app), se cierra aquí.
  if (
    ctx.challenge.status === 'in_progress' &&
    ctx.settings.format === 'lightning' &&
    ctx.myState.sessionEndsAt &&
    !ctx.myState.completedAt &&
    isLightningSessionOver(ctx.myState, nowMs)
  ) {
    await finishLightningSession(ctx)
  }

  const meDone = isMeDone(ctx, nowMs)
  const rivalDone = isRivalDone(ctx, nowMs)
  const metadata = isRecord(ctx.challenge.game_metadata) ? ctx.challenge.game_metadata : {}

  return {
    challenge: {
      id: ctx.challenge.id,
      status: ctx.challenge.status,
      typeId: ctx.settings.typeId,
      kind: ctx.settings.kind,
      format: ctx.settings.format,
      wordSource: ctx.settings.wordSource,
      rounds: ctx.settings.rounds,
      questionsPerRound: ctx.settings.questionsPerRound,
      totalQuestions: ctx.settings.format === 'turns' ? ctx.settings.totalQuestions : null,
      secondsPerQuestion: ctx.settings.secondsPerQuestion,
      sessionSeconds: ctx.settings.sessionSeconds,
      isMyTurn:
        ctx.challenge.status === 'in_progress' &&
        (!ctx.challenge.turn_user_id || ctx.challenge.turn_user_id === ctx.userId),
      turnExpiresAt: ctx.challenge.turn_expires_at,
      resultType: ctx.challenge.result_type,
      winnerUserId: ctx.challenge.winner_user_id,
      levels: isRecord(metadata.levels) ? metadata.levels : null,
    },
    me: {
      userId: ctx.userId,
      answered: ctx.myPlays.length,
      correct: scoreOf(ctx.myPlays),
      done: meDone,
      hasOpenQuestion: Boolean(
        ctx.myState.current && !ctx.myPlays.some((play) => play.indice === ctx.myState.current?.index),
      ),
      sessionStarted: Boolean(ctx.myState.sessionStartedAt),
      round: ctx.settings.format === 'turns' ? roundInfo(ctx.settings, ctx.myPlays.length) : null,
    },
    rival: {
      userId: ctx.rivalId,
      answered: ctx.rivalPlays.length,
      correct: scoreOf(ctx.rivalPlays),
      done: rivalDone,
    },
    session: sessionPayload(ctx, nowMs),
  }
}

async function reviewGame(ctx: GameContext) {
  const finished = ['completed', 'expired', 'cancelled', 'not_accepted'].includes(ctx.challenge.status)
  if (!isMeDone(ctx) && !finished) {
    throw new GameError(400, 'Termina tus palabras para ver los resultados.', 'ICA_CHALLENGE_REVIEW_LOCKED')
  }

  const ownerKey = ctx.settings.wordSource === 'mixed' ? null : ctx.userId
  let query = ctx.adminClient
    .from('desafio_preguntas')
    .select('indice, tipo, pregunta, respuesta, respuestas')
    .eq('desafio_id', ctx.challenge.id)
    .order('indice', { ascending: true })
  query = ownerKey ? query.eq('usuario_id', ownerKey) : query.is('usuario_id', null)
  const { data, error } = await query
  if (error) throw new GameError(500, error.message)

  const rowsByIndex = new Map<number, Record<string, unknown>>()
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    rowsByIndex.set(Number(row.indice), row)
  }

  const items = ctx.myPlays
    .slice()
    .sort((a, b) => a.indice - b.indice)
    .map((play) => {
      const row = rowsByIndex.get(play.indice)
      if (!row) return null
      const answer = (isRecord(row.respuesta) ? row.respuesta : {}) as Partial<StoredAnswer>
      const question = (isRecord(row.pregunta) ? row.pregunta : {}) as Record<string, unknown>
      const responses = isRecord(row.respuestas) ? row.respuestas : {}
      // Jugadas de antes de este cambio (las preguntas las hacía el móvil): no se pueden enseñar.
      if (!isRecord(responses[ctx.userId])) return null
      const mine = responses[ctx.userId] as Record<string, unknown>
      const options = Array.isArray(question.options) ? (question.options as unknown[]).map((item) => toText(item)) : []
      const optionIndex = typeof mine.optionIndex === 'number' ? mine.optionIndex : null

      return {
        index: play.indice,
        kind: toText(row.tipo),
        target: toText(answer.target),
        native: toText(answer.native),
        phrase: toText(answer.phrase) || null,
        phraseTranslation: toText(answer.phraseTranslation) || null,
        isCorrect: play.acierto,
        timedOut: Boolean(mine.timedOut),
        myAnswer:
          toText(mine.text) ||
          toText(mine.transcript) ||
          (optionIndex !== null && options[optionIndex] ? options[optionIndex] : null),
        fromRival: toText(answer.ownerUserId) !== ctx.userId,
        targetLang: toText(answer.language) || ctx.challenge.target_lang || null,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  // Con el desafío terminado, las palabras del baúl del rival (para poder añadirlas al tuyo).
  let rivalWords: Array<Record<string, unknown>> = []
  if (finished && ctx.settings.wordSource !== 'mixed') {
    const { data: rivalRows } = await ctx.adminClient
      .from('desafio_preguntas')
      .select('respuesta')
      .eq('desafio_id', ctx.challenge.id)
      .eq('usuario_id', ctx.rivalId)
    const seen = new Set<string>()
    rivalWords = ((rivalRows || []) as Array<Record<string, unknown>>)
      .map((row) => (isRecord(row.respuesta) ? row.respuesta : {}) as Partial<StoredAnswer>)
      .filter((answer) => {
        const key = toText(answer.target).trim().toLowerCase()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map((answer) => ({
        target: toText(answer.target),
        native: toText(answer.native),
        phrase: toText(answer.phrase) || null,
        phraseTranslation: toText(answer.phraseTranslation) || null,
        targetLang: toText(answer.language) || null,
      }))
  }

  return {
    items,
    rivalWords,
    me: { correct: scoreOf(ctx.myPlays), answered: ctx.myPlays.length },
    rival: { correct: scoreOf(ctx.rivalPlays), answered: ctx.rivalPlays.length, done: isRivalDone(ctx) },
    wordSource: ctx.settings.wordSource,
  }
}

async function runGameAction(
  input: { adminClient: AdminClient; userId: string; body: Record<string, unknown> },
  handler: (ctx: GameContext) => Promise<Record<string, unknown>>,
) {
  try {
    const ctx = await loadGame(input.adminClient, toText(input.body.challengeId), input.userId)
    const result = await handler(ctx)
    return jsonResponse(200, { ok: true, ...result })
  } catch (error) {
    if (error instanceof GameError) {
      return jsonResponse(error.status, { ok: false, error: error.message, code: error.code })
    }
    const message = error instanceof Error ? error.message : 'Error inesperado.'
    return jsonResponse(500, { ok: false, error: message })
  }
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
  const baseInput = { adminClient: auth.adminClient, userId: auth.userId, body: payload }

  if (action === 'list-available-users') {
    return listAvailableUsers({
      adminClient: auth.adminClient,
      userId: auth.userId,
      targetLang: toText(payload.targetLang),
      nativeLang: toText(payload.nativeLang),
      scope: toScope(payload.scope),
      maxActiveChallenges: MAX_ACTIVE_CHALLENGES,
      countActiveChallenges,
      fetchSettingsByUser,
      fetchLevelsForPair,
      countWordsForPair,
      toText,
    })
  }

  if (action === 'public-profile') {
    return getPublicProfile({
      adminClient: auth.adminClient,
      userId: auth.userId,
      profileUserId: toText(payload.profileUserId),
      maxActiveChallenges: MAX_ACTIVE_CHALLENGES,
      countActiveChallenges,
      hasActivePairChallenge,
      fetchSettingsByUser,
      fetchLevelsForPair,
      resolvePlayerPair,
      countWordsForPair,
      notEnoughWordsToJoinMessage,
      toText,
    })
  }

  const invitationDependencies = {
    turnWindowSeconds: TURN_WINDOW_SECONDS,
    invitationWindowSeconds: INVITATION_WINDOW_SECONDS,
    maxActiveChallenges: MAX_ACTIVE_CHALLENGES,
    toText,
    toScope,
    toWordSource,
    toDurationSecondsDaysRange,
    addSecondsToNow,
    getChallengeTypeById,
    maxLevelGapFor,
    countActiveChallenges,
    hasActivePairChallenge,
    fetchLevelsForPair,
    resolvePlayerPair,
    countWordsForPair,
    fetchCards,
    hasPlayableQuestionSet,
    notEnoughWordsToJoinMessage,
    kindRequirement: KIND_REQUIREMENT,
    sendPushToUser,
  }

  if (action === 'create-challenge' || action === 'create-own-words') {
    return createChallenge(baseInput, invitationDependencies)
  }

  if (action === 'list-challenge-types') {
    return listChallengeTypes({
      adminClient: auth.adminClient,
    })
  }

  if (action === 'respond-invitation') {
    return respondInvitation(baseInput, invitationDependencies)
  }

  if (action === 'cancel-invitation') {
    return cancelInvitation(baseInput, invitationDependencies)
  }

  if (action === 'play-state') {
    return runGameAction(baseInput, playState)
  }

  if (action === 'next-question') {
    return runGameAction(baseInput, async (ctx) => {
      const step = await nextQuestion(ctx)
      return { ...step, progress: progressPayload(ctx), session: sessionPayload(ctx, Date.now()) }
    })
  }

  if (action === 'answer-question') {
    return runGameAction(baseInput, (ctx) => answerQuestion(ctx, payload))
  }

  if (action === 'end-session') {
    return runGameAction(baseInput, endSession)
  }

  if (action === 'review') {
    return runGameAction(baseInput, reviewGame)
  }

  if (action === 'submit-own-words-result') {
    // La corrección ahora la hace el servidor pregunta a pregunta.
    return jsonResponse(410, {
      error: 'Actualiza la app para seguir jugando este desafío.',
      code: 'ICA_CHALLENGE_UPDATE_APP',
    })
  }

  return jsonResponse(400, { error: 'Acción no soportada.' })
})

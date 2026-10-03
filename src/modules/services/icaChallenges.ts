import { getUiLang, t } from '@/i18n'
import { supabase } from '@/lib/supabase'
import { runInBatches } from '@/lib/utils'
import { ICA_CHALLENGES_LOCAL } from './icaChallengesLocalMode'
import type {
  IcaChallengeAvailableUser,
  IcaChallengeCompetitor,
  IcaChallengeCompetitorInvitationStatus,
  IcaChallengeEnrollment,
  IcaChallengePlayRecord,
  IcaChallengeRecord,
  IcaChallengeResultType,
  IcaChallengeScope,
  IcaChallengeStats,
  IcaChallengeStatus,
  IcaChallengeTypeRecord,
  IcaChallengeFormat,
  IcaChallengePlayState,
  IcaChallengeQuestionKind,
  IcaChallengeReview,
  IcaChallengeServedQuestion,
  IcaChallengeStep,
  IcaChallengeStepStatus,
  IcaChallengeWordSource,
  IcaOwnWordsChallengeConfig,
} from '../types'

export const ICA_CHALLENGE_SLUG_OWN_WORDS = 'ica-own-words'
export const ICA_CHALLENGE_ALLOWED_ROUNDS = [1, 2, 5, 10] as const
export const ICA_CHALLENGE_OWN_WORDS_TOTAL_QUESTIONS = 10
export const ICA_CHALLENGE_MIN_RESPONSE_SECONDS = 3
export const ICA_CHALLENGE_MAX_RESPONSE_SECONDS = 8
/** Palabras que hay que tener en el Baúl ICA para entrar en los retos (lo manda el servidor). */
export const ICA_CHALLENGE_MIN_WORDS_TO_JOIN = 20
export const ICA_CHALLENGE_PAIRS_TYPE_ID = 'ica-pairs'
export const ICA_CHALLENGE_PAIRS_PER_BOARD = 5

const loadLocalChallenges = () => import('./icaChallengesLocal')

type IcaChallengeCompetitorRow = {
  challenge_id: string
  user_id: string
  competitor_order: number
  invitation_status: IcaChallengeCompetitorInvitationStatus
  score: number | null
  payload: unknown
  accepted_at: string | null
  rejected_at: string | null
  created_at: string
  updated_at: string
}

type IcaChallengeRow = {
  id: string
  challenge_slug: string
  status: IcaChallengeStatus
  result_type: IcaChallengeResultType
  scope: IcaChallengeScope
  target_lang: string | null
  native_lang: string | null
  challenger_user_id: string
  challenged_user_id: string
  winner_user_id: string | null
  duration_seconds: number | null
  expires_at: string | null
  accept_until: string | null
  turn_user_id: string | null
  turn_expires_at: string | null
  started_at: string | null
  finalized_at: string | null
  game_metadata: unknown
  phases_json: unknown
  created_at: string
  updated_at: string
  ica_challenge_competitors?: unknown
}

type IcaChallengeEnrollmentRow = {
  id: string
  user_id: string
  target_lang: string
  native_lang: string
  is_active: boolean
  created_at: string
  updated_at: string
}

type IcaChallengePlayRow = {
  id: string
  desafio_id: string
  usuario_id: string
  indice: number
  acierto: boolean
  ms: number | null
  payload: unknown
  creado_at: string
}

type AvailableUsersResponse = {
  rows?: Array<{
    userId: string
    displayName: string
    username: string | null
    nativeLang: string | null
    targetLang: string | null
    cefrLevel: string | null
    level?: string | null
    samePair?: boolean
    mixedAllowed?: boolean
    mixedBlockedReason?: string | null
    activeChallengesCount: number
    canChallenge: boolean
    blockedReason: string | null
    winStreak?: number
    recentChallenges?: number
  }>
  myActiveChallengesCount?: number
  myLevel?: string | null
  myWordCount?: number | null
  minWordsToJoin?: number
  error?: string
}

type ChallengeTypesResponse = {
  rows?: Array<{
    id: string
    name: string
    iconKey: string
    isActive: boolean
    isPlayable: boolean
    order: number
    scopes: IcaChallengeScope[]
    config?: Record<string, unknown>
    kind?: IcaChallengeQuestionKind | null
    format?: IcaChallengeFormat | null
    maxLevelGap?: number
  }>
  error?: string
}

export type IcaChallengeProfileMap = Record<
  string,
  { displayName: string; username: string | null; avatarUrl: string | null }
>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toCompetitor(row: IcaChallengeCompetitorRow): IcaChallengeCompetitor {
  return {
    challengeId: row.challenge_id,
    userId: row.user_id,
    competitorOrder: Number(row.competitor_order ?? 1),
    invitationStatus:
      row.invitation_status === 'accepted' || row.invitation_status === 'rejected'
        ? row.invitation_status
        : 'pending',
    score: row.score === null ? null : Number(row.score),
    payload: isRecord(row.payload) ? row.payload : {},
    acceptedAt: row.accepted_at,
    rejectedAt: row.rejected_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toChallengeRecord(row: IcaChallengeRow): IcaChallengeRecord {
  const competitors = Array.isArray(row.ica_challenge_competitors)
    ? row.ica_challenge_competitors
        .filter((item): item is IcaChallengeCompetitorRow => isRecord(item))
        .map((item) => toCompetitor(item))
        .sort((a, b) => a.competitorOrder - b.competitorOrder)
    : []

  const phases = Array.isArray(row.phases_json)
    ? row.phases_json.filter((item): item is Record<string, unknown> => isRecord(item))
    : []

  return {
    id: row.id,
    challengeSlug: row.challenge_slug,
    status:
      row.status === 'in_progress' ||
      row.status === 'completed' ||
      row.status === 'cancelled' ||
      row.status === 'expired' ||
      row.status === 'not_accepted'
        ? row.status
        : 'created',
    resultType:
      row.result_type === 'challenger_win' ||
      row.result_type === 'challenged_win' ||
      row.result_type === 'draw' ||
      row.result_type === 'cancelled' ||
      row.result_type === 'expired' ||
      row.result_type === 'not_accepted'
        ? row.result_type
        : 'pending',
    scope: row.scope === 'language' ? 'language' : 'global',
    targetLang: row.target_lang,
    nativeLang: row.native_lang,
    challengerUserId: row.challenger_user_id,
    challengedUserId: row.challenged_user_id,
    winnerUserId: row.winner_user_id,
    durationSeconds:
      row.duration_seconds === null ? null : Number(row.duration_seconds),
    expiresAt: row.expires_at,
    acceptUntil: row.accept_until,
    turnUserId: row.turn_user_id,
    turnExpiresAt: row.turn_expires_at,
    startedAt: row.started_at,
    finalizedAt: row.finalized_at,
    gameMetadata: isRecord(row.game_metadata) ? row.game_metadata : {},
    phases,
    competitors,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toEnrollment(row: IcaChallengeEnrollmentRow): IcaChallengeEnrollment {
  return {
    id: row.id,
    userId: row.user_id,
    targetLang: row.target_lang,
    nativeLang: row.native_lang,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toChallengePlayRecord(row: IcaChallengePlayRow): IcaChallengePlayRecord {
  return {
    id: row.id,
    challengeId: row.desafio_id,
    userId: row.usuario_id,
    index: Number(row.indice || 0),
    isCorrect: Boolean(row.acierto),
    responseMs: row.ms === null ? null : Number(row.ms),
    payload: isRecord(row.payload) ? row.payload : {},
    createdAt: row.creado_at,
  }
}

function sanitizeOwnWordsConfig(config: IcaOwnWordsChallengeConfig): IcaOwnWordsChallengeConfig {
  const rounds = ICA_CHALLENGE_ALLOWED_ROUNDS.includes(config.rounds)
    ? config.rounds
    : 2

  const responseSeconds = Math.max(
    ICA_CHALLENGE_MIN_RESPONSE_SECONDS,
    Math.min(ICA_CHALLENGE_MAX_RESPONSE_SECONDS, Math.round(config.responseSeconds)),
  )

  return {
    rounds,
    responseSeconds,
  }
}

async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

export const ICA_CHALLENGE_LIGHTNING_TYPE_ID = 'ica-lightning'

export function getOwnWordsChallengeConfig(
  metadata: Record<string, unknown>,
): IcaOwnWordsChallengeConfig {
  const roundsValue = Number(metadata.rounds ?? 10)
  const rounds = ICA_CHALLENGE_ALLOWED_ROUNDS.includes(roundsValue as 1 | 2 | 5 | 10)
    ? (roundsValue as 1 | 2 | 5 | 10)
    : 2

  const responseSeconds = Math.max(
    ICA_CHALLENGE_MIN_RESPONSE_SECONDS,
    Math.min(
      120,
      Math.round(Number(metadata.secondsPerQuestion ?? metadata.responseSeconds ?? 5)),
    ),
  )

  return {
    rounds,
    responseSeconds,
    wordSource: metadata.wordSource === 'mixed' ? 'mixed' : 'own',
  }
}

export function isLightningChallenge(challenge: Pick<IcaChallengeRecord, 'challengeSlug' | 'gameMetadata'>): boolean {
  return (
    challenge.gameMetadata.format === 'lightning' ||
    challenge.challengeSlug === ICA_CHALLENGE_LIGHTNING_TYPE_ID
  )
}

export function isPairsChallenge(challenge: Pick<IcaChallengeRecord, 'challengeSlug' | 'gameMetadata'>): boolean {
  return challenge.gameMetadata.kind === 'pairs' || challenge.challengeSlug === ICA_CHALLENGE_PAIRS_TYPE_ID
}

export function getChallengeWordSource(challenge: Pick<IcaChallengeRecord, 'gameMetadata'>): IcaChallengeWordSource {
  return challenge.gameMetadata.wordSource === 'mixed' ? 'mixed' : 'own'
}

export const ICA_CHALLENGE_WORD_SOURCE_LABEL: Record<IcaChallengeWordSource, string> = {
  own: 'Global · cada uno con sus palabras',
  mixed: 'Por idioma · mezcla de baúles ICA',
}

/** Resumen de la configuración que se ve en cada desafío. */
export function getIcaChallengeConfigLabel(
  challenge: Pick<IcaChallengeRecord, 'challengeSlug' | 'gameMetadata'>,
): string {
  // Se traduce al pintar (las etiquetas de arriba son constantes en español).
  const source = t(ICA_CHALLENGE_WORD_SOURCE_LABEL[getChallengeWordSource(challenge)])
  if (isLightningChallenge(challenge)) {
    const seconds = Math.round(Number(challenge.gameMetadata.sessionSeconds)) || 60
    return `${t('{n} segundos por jugador', { n: seconds })} · ${source}`
  }
  const config = getOwnWordsChallengeConfig(challenge.gameMetadata)
  if (isPairsChallenge(challenge)) {
    const roundsLabel = config.rounds === 1 ? t('los 2 seguidos') : t('1 por ronda')
    return `${t('2 tableros de 5 parejas')} · ${roundsLabel} · ${t('{n}s por tablero', { n: config.responseSeconds })} · ${source}`
  }
  const perRound = ICA_CHALLENGE_OWN_WORDS_TOTAL_QUESTIONS / config.rounds
  const roundsLabel =
    config.rounds === 1 ? t('1 ronda') : t('{n} rondas de {per}', { n: config.rounds, per: perRound })
  return `${t('10 palabras')} · ${roundsLabel} · ${t('{n}s por palabra', { n: config.responseSeconds })} · ${source}`
}

/**
 * Mensajes del servidor (y del modo local) para enseñarlos en pantalla.
 * Llegan en español y a veces se comparan tal cual: aquí solo se traducen al mostrarlos.
 * Los que llevan números o nombres dentro se reconocen por su forma.
 */
const CHALLENGE_MESSAGE_PATTERNS: Array<{ pattern: RegExp; key: string; vars: string[] }> = [
  { pattern: /^Nivel demasiado distinto \((.+) y (.+)\)\.$/, key: 'Nivel demasiado distinto ({a} y {b}).', vars: ['a', 'b'] },
  {
    pattern: /^Necesitas (\d+) palabras en tu Baúl ICA para retar\. Tienes (\d+): te faltan (\d+)\.$/,
    key: 'Necesitas {min} palabras en tu Baúl ICA para retar. Tienes {n}: te faltan {missing}.',
    vars: ['min', 'n', 'missing'],
  },
  {
    pattern: /^Necesitas (\d+) palabras en tu Baúl ICA para aceptar retos\. Tienes (\d+): te faltan (\d+)\.$/,
    key: 'Necesitas {min} palabras en tu Baúl ICA para aceptar retos. Tienes {n}: te faltan {missing}.',
    vars: ['min', 'n', 'missing'],
  },
  {
    pattern: /^Este icademer aún no tiene (\d+) palabras en su Baúl ICA\.$/,
    key: 'Este icademer aún no tiene {n} palabras en su Baúl ICA.',
    vars: ['n'],
  },
  { pattern: /^No hay suficientes palabras ICA(.*) para este modo\.$/, key: 'No hay suficientes palabras ICA{req} para este modo.', vars: ['req'] },
  {
    pattern: /^Necesitas al menos (\d+) palabras ICA(.*) para «(.+)»\.$/,
    key: 'Necesitas al menos {n} palabras ICA{req} para «{mode}».',
    vars: ['n', 'req', 'mode'],
  },
  {
    pattern: /^Entre los dos necesitan al menos (\d+) palabras ICA(.*) para «(.+)»\.$/,
    key: 'Entre los dos necesitan al menos {n} palabras ICA{req} para «{mode}».',
    vars: ['n', 'req', 'mode'],
  },
  {
    pattern: /^Tu rival aún no tiene (\d+) palabras ICA(.*) para «(.+)»\.$/,
    key: 'Tu rival aún no tiene {n} palabras ICA{req} para «{mode}».',
    vars: ['n', 'req', 'mode'],
  },
  // Mensajes de invitations.ts al aceptar un reto (develop, 1 oct).
  {
    pattern: /^El retador necesita al menos (\d+) palabras en su Baúl ICA\.$/,
    key: 'El retador necesita al menos {n} palabras en su Baúl ICA.',
    vars: ['n'],
  },
  {
    pattern: /^Entre los dos necesitan al menos (\d+) palabras ICA(.*) para este modo\.$/,
    key: 'Entre los dos necesitan al menos {n} palabras ICA{req} para este modo.',
    vars: ['n', 'req'],
  },
  {
    pattern: /^Ambos necesitan al menos (\d+) palabras ICA(.*) válidas para este modo\.$/,
    key: 'Ambos necesitan al menos {n} palabras ICA{req} válidas para este modo.',
    vars: ['n', 'req'],
  },
]

export function translateChallengeMessage(message: string): string {
  if (getUiLang() === 'es' || !message) return message
  const direct = t(message)
  if (direct !== message) return direct
  for (const item of CHALLENGE_MESSAGE_PATTERNS) {
    const match = item.pattern.exec(message)
    if (!match) continue
    const vars: Record<string, string> = {}
    item.vars.forEach((name, index) => {
      const value = match[index + 1] ?? ''
      // «req» es un trozo como « de una sola palabra»; «mode», el nombre del modo.
      vars[name] = name === 'req' || name === 'mode' ? t(value) : value
    })
    return t(item.key, vars)
  }
  return message
}

export async function fetchMyIcaChallengeEnrollment(
  targetLang: string,
  nativeLang: string,
): Promise<IcaChallengeEnrollment> {
  if (ICA_CHALLENGES_LOCAL) return (await loadLocalChallenges()).localFetchEnrollment(targetLang, nativeLang)
  const userId = await getCurrentUserId()
  if (!supabase || !userId) {
    return {
      id: null,
      userId: null,
      targetLang,
      nativeLang,
      isActive: false,
      createdAt: null,
      updatedAt: null,
    }
  }

  const { data, error } = await supabase
    .from('users_ica_challenges')
    .select('id, user_id, target_lang, native_lang, is_active, created_at, updated_at')
    .eq('user_id', userId)
    .eq('target_lang', targetLang)
    .eq('native_lang', nativeLang)
    .maybeSingle()

  if (error) throw error
  if (!data) {
    return {
      id: null,
      userId,
      targetLang,
      nativeLang,
      isActive: false,
      createdAt: null,
      updatedAt: null,
    }
  }

  return toEnrollment(data as IcaChallengeEnrollmentRow)
}

export async function upsertMyIcaChallengeEnrollment(input: {
  targetLang: string
  nativeLang: string
  isActive: boolean
}): Promise<IcaChallengeEnrollment> {
  if (ICA_CHALLENGES_LOCAL) return (await loadLocalChallenges()).localSetEnrollment(input)
  if (!supabase) throw new Error('Falta configurar Supabase')
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Necesitas iniciar sesión para gestionar desafíos.')

  const { data, error } = await supabase
    .from('users_ica_challenges')
    .upsert(
      {
        user_id: userId,
        target_lang: input.targetLang,
        native_lang: input.nativeLang,
        is_active: input.isActive,
      },
      { onConflict: 'user_id,target_lang,native_lang' },
    )
    .select('id, user_id, target_lang, native_lang, is_active, created_at, updated_at')
    .single()

  if (error || !data) throw error || new Error('No se pudo guardar la inscripción.')
  return toEnrollment(data as IcaChallengeEnrollmentRow)
}

export async function listMyIcaChallenges(
  targetLang: string,
  nativeLang: string,
  limit = 20,
): Promise<IcaChallengeRecord[]> {
  if (ICA_CHALLENGES_LOCAL) {
    // Igual que con el servidor: los «por idioma» solo salen en su idioma.
    return (await (await loadLocalChallenges()).localListChallenges())
      .filter(
        (challenge) =>
          challenge.scope === 'global' ||
          (challenge.targetLang === targetLang && challenge.nativeLang === nativeLang),
      )
      .slice(0, limit)
  }
  if (!supabase) return []
  const userId = await getCurrentUserId()
  if (!userId) return []

  const { data, error } = await supabase
    .from('ica_challenges')
    .select(
      'id, challenge_slug, status, result_type, scope, target_lang, native_lang, challenger_user_id, challenged_user_id, winner_user_id, duration_seconds, expires_at, accept_until, turn_user_id, turn_expires_at, started_at, finalized_at, game_metadata, phases_json, created_at, updated_at, ica_challenge_competitors(challenge_id, user_id, competitor_order, invitation_status, score, payload, accepted_at, rejected_at, created_at, updated_at)',
    )
    .or(`challenger_user_id.eq.${userId},challenged_user_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(100, Math.round(limit))))

  if (error) throw error

  return (data || [])
    .map((row) => toChallengeRecord(row as IcaChallengeRow))
    .filter(
      (challenge) =>
        challenge.scope === 'global' ||
        (challenge.targetLang === targetLang && challenge.nativeLang === nativeLang),
    )
}

type StatsRow = {
  status: string
  resultType: string
  winnerUserId: string | null
  finalizedAt: string | null
  createdAt: string | null
}

/**
 * Victorias, derrotas, empates y racha de victorias seguidas.
 * Solo cuentan los desafíos terminados (no los cancelados, vencidos o no aceptados).
 */
export function computeIcaChallengeStats(rows: StatsRow[], userId: string | null): IcaChallengeStats {
  const finished = rows
    .filter(
      (row) =>
        row.status === 'completed' &&
        (row.resultType === 'challenger_win' || row.resultType === 'challenged_win' || row.resultType === 'draw'),
    )
    .sort((a, b) => (a.finalizedAt || a.createdAt || '').localeCompare(b.finalizedAt || b.createdAt || ''))

  const stats: IcaChallengeStats = { played: 0, wins: 0, losses: 0, draws: 0, currentStreak: 0, bestStreak: 0 }
  for (const row of finished) {
    stats.played += 1
    if (row.resultType === 'draw') {
      stats.draws += 1
      stats.currentStreak = 0
    } else if (userId && row.winnerUserId === userId) {
      stats.wins += 1
      stats.currentStreak += 1
      stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak)
    } else {
      stats.losses += 1
      stats.currentStreak = 0
    }
  }
  return stats
}

export async function fetchMyIcaChallengeStats(): Promise<IcaChallengeStats> {
  const empty: IcaChallengeStats = { played: 0, wins: 0, losses: 0, draws: 0, currentStreak: 0, bestStreak: 0 }
  if (ICA_CHALLENGES_LOCAL) {
    const local = await loadLocalChallenges()
    const [records, userId] = await Promise.all([local.localListChallenges(), getCurrentUserId().catch(() => null)])
    const me = userId || 'local-me'
    return computeIcaChallengeStats(
      records.map((record) => ({
        status: record.status,
        resultType: record.resultType,
        winnerUserId: record.winnerUserId,
        finalizedAt: record.finalizedAt,
        createdAt: record.createdAt,
      })),
      me,
    )
  }
  if (!supabase) return empty
  const userId = await getCurrentUserId()
  if (!userId) return empty

  const { data, error } = await supabase
    .from('ica_challenges')
    .select('status, result_type, winner_user_id, finalized_at, created_at')
    .eq('status', 'completed')
    .or(`challenger_user_id.eq.${userId},challenged_user_id.eq.${userId}`)
    .order('finalized_at', { ascending: false })
    .limit(500)

  if (error) throw error
  return computeIcaChallengeStats(
    ((data || []) as Array<Record<string, unknown>>).map((row) => ({
      status: String(row.status || ''),
      resultType: String(row.result_type || ''),
      winnerUserId: typeof row.winner_user_id === 'string' ? row.winner_user_id : null,
      finalizedAt: typeof row.finalized_at === 'string' ? row.finalized_at : null,
      createdAt: typeof row.created_at === 'string' ? row.created_at : null,
    })),
    userId,
  )
}

export type IcaChallengeAlerts = {
  /** Retos que te han mandado y aún puedes aceptar. */
  invites: number
  /** Desafíos en curso en los que te toca jugar. */
  myTurn: number
}

type AlertRow = {
  status: string
  challengedUserId: string
  turnUserId: string | null
  acceptUntil: string | null
  turnExpiresAt: string | null
}

/** Cuenta lo que necesita al alumno: retos nuevos y turnos pendientes. */
export function countIcaChallengeAlerts(rows: AlertRow[], userId: string | null, nowMs = Date.now()): IcaChallengeAlerts {
  if (!userId) return { invites: 0, myTurn: 0 }
  const notExpired = (value: string | null) => !value || !Number.isFinite(Date.parse(value)) || Date.parse(value) > nowMs
  return {
    invites: rows.filter(
      (row) => row.status === 'created' && row.challengedUserId === userId && notExpired(row.acceptUntil),
    ).length,
    myTurn: rows.filter(
      (row) => row.status === 'in_progress' && row.turnUserId === userId && notExpired(row.turnExpiresAt),
    ).length,
  }
}

export async function fetchMyIcaChallengeAlerts(): Promise<IcaChallengeAlerts> {
  if (ICA_CHALLENGES_LOCAL) {
    const local = await loadLocalChallenges()
    const [records, userId] = await Promise.all([local.localListChallenges(), getCurrentUserId().catch(() => null)])
    return countIcaChallengeAlerts(
      records.map((record) => ({
        status: record.status,
        challengedUserId: record.challengedUserId,
        turnUserId: record.turnUserId,
        acceptUntil: record.acceptUntil,
        turnExpiresAt: record.turnExpiresAt,
      })),
      userId || 'local-me',
    )
  }
  if (!supabase) return { invites: 0, myTurn: 0 }
  const userId = await getCurrentUserId()
  if (!userId) return { invites: 0, myTurn: 0 }

  const { data, error } = await supabase
    .from('ica_challenges')
    .select('status, challenged_user_id, turn_user_id, accept_until, turn_expires_at')
    .in('status', ['created', 'in_progress'])
    .or(`challenger_user_id.eq.${userId},challenged_user_id.eq.${userId}`)
    .limit(20)

  if (error) throw error
  return countIcaChallengeAlerts(
    ((data || []) as Array<Record<string, unknown>>).map((row) => ({
      status: String(row.status || ''),
      challengedUserId: String(row.challenged_user_id || ''),
      turnUserId: typeof row.turn_user_id === 'string' ? row.turn_user_id : null,
      acceptUntil: typeof row.accept_until === 'string' ? row.accept_until : null,
      turnExpiresAt: typeof row.turn_expires_at === 'string' ? row.turn_expires_at : null,
    })),
    userId,
  )
}

export async function getIcaChallengeById(
  challengeId: string,
): Promise<IcaChallengeRecord | null> {
  if (ICA_CHALLENGES_LOCAL) return (await loadLocalChallenges()).localGetChallenge(challengeId)
  if (!supabase) return null

  const { data, error } = await supabase
    .from('ica_challenges')
    .select(
      'id, challenge_slug, status, result_type, scope, target_lang, native_lang, challenger_user_id, challenged_user_id, winner_user_id, duration_seconds, expires_at, accept_until, turn_user_id, turn_expires_at, started_at, finalized_at, game_metadata, phases_json, created_at, updated_at, ica_challenge_competitors(challenge_id, user_id, competitor_order, invitation_status, score, payload, accepted_at, rejected_at, created_at, updated_at)',
    )
    .eq('id', challengeId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return toChallengeRecord(data as IcaChallengeRow)
}

type FunctionResponse = {
  ok?: boolean
  error?: string
  code?: string | null
} & Record<string, unknown>

export class IcaChallengeRequestError extends Error {
  code: string | null
  status: number | null

  constructor(message: string, code: string | null = null, status: number | null = null) {
    super(message)
    this.name = 'IcaChallengeRequestError'
    this.code = code
    this.status = status
  }
}

/**
 * Llama a la función del servidor y, si falla, devuelve el mensaje que manda el
 * servidor ("Aún no es tu turno", "Nivel demasiado distinto"…) en vez del genérico
 * "Edge Function returned a non-2xx status code".
 */
async function invokeChallenges<T>(
  body: Record<string, unknown>,
  fallbackMessage: string,
): Promise<T> {
  if (ICA_CHALLENGES_LOCAL) {
    // Modo local de prueba: el "servidor" funciona dentro del navegador.
    const localData = await (await loadLocalChallenges()).localInvoke(body)
    if (!localData.ok) {
      throw new IcaChallengeRequestError(
        typeof localData.error === 'string' ? localData.error : fallbackMessage,
        typeof localData.code === 'string' ? localData.code : null,
      )
    }
    return localData as T
  }
  if (!supabase) throw new IcaChallengeRequestError('Falta configurar Supabase')

  const { data, error } = await supabase.functions.invoke<FunctionResponse>(
    'ica-challenges-center',
    { body },
  )

  if (error) {
    let message = fallbackMessage
    let code: string | null = null
    let status: number | null = null
    const context = (error as { context?: unknown }).context
    if (typeof Response !== 'undefined' && context instanceof Response) {
      status = context.status
      try {
        const json = (await context.clone().json()) as FunctionResponse
        if (typeof json?.error === 'string' && json.error.trim()) message = json.error
        if (typeof json?.code === 'string') code = json.code
      } catch {
        // cuerpo vacío: se queda el mensaje por defecto
      }
    } else if ((error as { name?: string }).name === 'FunctionsFetchError') {
      message = 'Sin conexión. Revisa tu internet e inténtalo de nuevo.'
    }
    throw new IcaChallengeRequestError(message, code, status)
  }

  if (!data || data.ok === false) {
    throw new IcaChallengeRequestError(data?.error || fallbackMessage, data?.code ?? null)
  }

  return data as T
}

export type IcaChallengeReactionRow = {
  id: string
  challenge_id: string
  sender_user_id: string
  kind: 'face' | 'phrase'
  value: string
  created_at: string
}

export async function listIcaChallengeReactions(challengeId: string): Promise<IcaChallengeReactionRow[]> {
  const result = await invokeChallenges<{ rows?: IcaChallengeReactionRow[] }>(
    { action: 'list-reactions', challengeId },
    'No se pudieron cargar las reacciones.',
  )
  return Array.isArray(result.rows) ? result.rows : []
}

export async function sendIcaChallengeReaction(input: {
  challengeId: string
  kind: 'face' | 'phrase'
  value: string
}): Promise<IcaChallengeReactionRow> {
  const result = await invokeChallenges<{ row?: IcaChallengeReactionRow }>(
    { action: 'send-reaction', ...input },
    'No se pudo enviar la reacción.',
  )
  if (!result.row?.id) throw new IcaChallengeRequestError('No se pudo enviar la reacción.')
  return result.row
}

export async function createIcaChallenge(input: {
  challengeTypeId: string
  challengedUserId: string
  scope: IcaChallengeScope
  targetLang?: string
  nativeLang?: string
  durationSeconds?: number
  config: IcaOwnWordsChallengeConfig
  /** 4.º desafío activo con un «desafío extra» (EXTRA_CHALLENGE_COST ICA Coins). El servidor aún no lo acepta (ver MODO_JUEGO_NOTAS.md). */
  extraSlot?: boolean
}): Promise<void> {
  const cleanConfig = sanitizeOwnWordsConfig(input.config)
  const durationSeconds = input.durationSeconds
    ? Math.max(1, Math.round(input.durationSeconds))
    : undefined

  await invokeChallenges<FunctionResponse>(
    {
      action: 'create-challenge',
      challengeTypeId: input.challengeTypeId || ICA_CHALLENGE_SLUG_OWN_WORDS,
      challengedUserId: input.challengedUserId,
      scope: input.scope,
      targetLang: input.targetLang,
      nativeLang: input.nativeLang,
      rounds: cleanConfig.rounds,
      responseSeconds: cleanConfig.responseSeconds,
      wordSource: input.config.wordSource === 'mixed' ? 'mixed' : 'own',
      durationSeconds,
      ...(input.extraSlot ? { useExtraSlot: true } : {}),
    },
    'No se pudo crear el desafío.',
  )
}

export async function respondIcaChallengeInvitation(
  challengeId: string,
  accept: boolean,
): Promise<void> {
  await invokeChallenges<FunctionResponse>(
    { action: 'respond-invitation', challengeId, accept },
    'No se pudo actualizar el desafío.',
  )
}

export async function cancelIcaChallengeInvitation(challengeId: string): Promise<void> {
  await invokeChallenges<FunctionResponse>(
    { action: 'cancel-invitation', challengeId },
    'No se pudo cancelar el desafío.',
  )
}

export async function listAvailableIcaChallengeUsers(input: {
  targetLang: string
  nativeLang: string
  scope: IcaChallengeScope
}): Promise<{
  rows: IcaChallengeAvailableUser[]
  myActiveChallengesCount: number
  myLevel: string | null
  /** Palabras de tu Baúl ICA en este idioma y las que hacen falta para entrar (20). */
  myWordCount: number | null
  minWordsToJoin: number
}> {
  if (!supabase && !ICA_CHALLENGES_LOCAL) {
    return { rows: [], myActiveChallengesCount: 0, myLevel: null, myWordCount: null, minWordsToJoin: ICA_CHALLENGE_MIN_WORDS_TO_JOIN }
  }

  const body = {
    action: 'list-available-users',
    targetLang: input.targetLang,
    nativeLang: input.nativeLang,
    scope: input.scope,
  }
  const { data, error } = ICA_CHALLENGES_LOCAL
    ? { data: (await (await loadLocalChallenges()).localInvoke(body)) as AvailableUsersResponse, error: null }
    : await supabase!.functions.invoke<AvailableUsersResponse>('ica-challenges-center', { body })

  if (error) throw error
  if (data?.error) throw new Error(data.error)

  return {
    rows:
      data?.rows?.map((row) => ({
        userId: row.userId,
        displayName: row.displayName,
        username: row.username,
        nativeLang: row.nativeLang || null,
        targetLang: row.targetLang || null,
        cefrLevel: row.level ?? row.cefrLevel ?? null,
        level: row.level ?? null,
        samePair: Boolean(row.samePair),
        mixedAllowed: Boolean(row.mixedAllowed),
        mixedBlockedReason: row.mixedBlockedReason || null,
        activeChallengesCount: Number(row.activeChallengesCount || 0),
        canChallenge: Boolean(row.canChallenge),
        blockedReason: row.blockedReason || null,
        winStreak: Math.max(0, Number(row.winStreak) || 0),
        recentChallenges: Math.max(0, Number(row.recentChallenges) || 0),
      })) || [],
    myActiveChallengesCount: Number(data?.myActiveChallengesCount || 0),
    myLevel: data?.myLevel || null,
    // null = el servidor aún no lo manda (función antigua): no se bloquea nada en la app.
    myWordCount: Number.isFinite(Number(data?.myWordCount)) && data?.myWordCount !== undefined && data?.myWordCount !== null
      ? Number(data.myWordCount)
      : null,
    minWordsToJoin: Number(data?.minWordsToJoin) > 0 ? Number(data?.minWordsToJoin) : ICA_CHALLENGE_MIN_WORDS_TO_JOIN,
  }
}

export async function listIcaChallengeTypes(): Promise<IcaChallengeTypeRecord[]> {
  if (!supabase && !ICA_CHALLENGES_LOCAL) return []

  const body = { action: 'list-challenge-types' }
  const { data, error } = ICA_CHALLENGES_LOCAL
    ? { data: (await (await loadLocalChallenges()).localInvoke(body)) as ChallengeTypesResponse, error: null }
    : await supabase!.functions.invoke<ChallengeTypesResponse>('ica-challenges-center', { body })

  if (error) throw error
  if (data?.error) throw new Error(data.error)

  return (data?.rows || [])
    .map((row) => {
      const scopes: IcaChallengeScope[] = Array.isArray(row.scopes)
        ? row.scopes.filter(
            (scope): scope is IcaChallengeScope => scope === 'global' || scope === 'language',
          )
        : ['global']

      return {
        id: row.id,
        name: row.name,
        iconKey: row.iconKey,
        isActive: Boolean(row.isActive),
        isPlayable: Boolean(row.isPlayable),
        order: Number(row.order || 0),
        scopes,
        config: isRecord(row.config) ? row.config : {},
        kind: row.kind ?? null,
        format: row.format ?? null,
        maxLevelGap: Number.isFinite(Number(row.maxLevelGap)) ? Number(row.maxLevelGap) : 3,
      }
    })
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'es'))
}

/** ¿Ya ha jugado el usuario todas sus palabras (o su minuto del Modo Relámpago)? */
export function hasCompletedMyPart(
  challenge: IcaChallengeRecord,
  userId: string,
  plays?: IcaChallengePlayRecord[],
): boolean {
  const competitor = challenge.competitors.find((item) => item.userId === userId)
  const payload = competitor && isRecord(competitor.payload) ? competitor.payload : {}
  const game = isRecord(payload.game) ? payload.game : null
  if (game && typeof game.completedAt === 'string' && game.completedAt) return true
  const legacy = isRecord(payload.ownWords) ? payload.ownWords : null
  if (legacy && legacy.completedAt) return true
  if (isLightningChallenge(challenge)) return false

  if (Array.isArray(plays)) {
    return (
      plays.filter((play) => play.userId === userId).length >=
      ICA_CHALLENGE_OWN_WORDS_TOTAL_QUESTIONS
    )
  }
  return false
}

type StepResponse = {
  status?: string
  question?: IcaChallengeServedQuestion | null
  next?: IcaChallengeServedQuestion | null
  result?: IcaChallengeStep['result']
  pairs?: IcaChallengeStep['pairs']
  progress?: IcaChallengeStep['progress']
  session?: IcaChallengeStep['session']
  late?: boolean
  isMyTurn?: boolean
}

const STEP_STATUSES: IcaChallengeStepStatus[] = ['question', 'answered', 'round_finished', 'done']

function toStep(data: StepResponse): IcaChallengeStep {
  const status = STEP_STATUSES.includes(data.status as IcaChallengeStepStatus)
    ? (data.status as IcaChallengeStepStatus)
    : 'done'
  return {
    status,
    question: data.question ?? data.next ?? null,
    result: data.result ?? null,
    pairs: data.pairs ?? null,
    progress: data.progress ?? null,
    session: data.session ?? null,
    late: Boolean(data.late),
    isMyTurn: typeof data.isMyTurn === 'boolean' ? data.isMyTurn : null,
  }
}

export async function fetchIcaChallengePlayState(challengeId: string): Promise<IcaChallengePlayState> {
  return invokeChallenges<IcaChallengePlayState>(
    { action: 'play-state', challengeId },
    'No pudimos cargar el desafío.',
  )
}

/** Pide la pregunta que toca (o retoma la que quedó abierta). */
export async function requestIcaChallengeQuestion(challengeId: string): Promise<IcaChallengeStep> {
  const data = await invokeChallenges<StepResponse>(
    { action: 'next-question', challengeId },
    'No pudimos cargar la siguiente palabra.',
  )
  return toStep(data)
}

export async function answerIcaChallengeQuestion(input: {
  challengeId: string
  questionIndex: number
  response: {
    optionIndex?: number | null
    text?: string | null
    transcripts?: string[] | null
    /** Parejas: significado unido a cada palabra de la izquierda. */
    matches?: Array<number | null>
  }
  clientMs: number | null
  timedOut?: boolean
}): Promise<IcaChallengeStep> {
  const data = await invokeChallenges<StepResponse>(
    {
      action: 'answer-question',
      challengeId: input.challengeId,
      questionIndex: input.questionIndex,
      response: input.response,
      clientMs: input.clientMs === null ? null : Math.max(0, Math.round(input.clientMs)),
      timedOut: Boolean(input.timedOut),
    },
    'No se pudo enviar tu respuesta.',
  )
  return toStep(data)
}

/** Cierra la partida del Modo Relámpago (al acabar el minuto). */
export async function endIcaChallengeSession(challengeId: string): Promise<IcaChallengeStep> {
  const data = await invokeChallenges<StepResponse>(
    { action: 'end-session', challengeId },
    'No se pudo cerrar la partida.',
  )
  return toStep(data)
}

export async function fetchIcaChallengeReview(challengeId: string): Promise<IcaChallengeReview> {
  return invokeChallenges<IcaChallengeReview>(
    { action: 'review', challengeId },
    'No pudimos cargar tus resultados.',
  )
}

export async function listIcaChallengePlays(challengeId: string): Promise<IcaChallengePlayRecord[]> {
  if (ICA_CHALLENGES_LOCAL) return (await loadLocalChallenges()).localListPlays([challengeId])
  if (!supabase) return []

  const { data, error } = await supabase
    .from('desafio_jugadas')
    .select('id, desafio_id, usuario_id, indice, acierto, ms, payload, creado_at')
    .eq('desafio_id', challengeId)
    .order('indice', { ascending: true })
    .order('creado_at', { ascending: true })

  if (error) throw error

  return (data || []).map((row) => toChallengePlayRecord(row as IcaChallengePlayRow))
}

export async function listIcaChallengePlaysByChallengeIds(
  challengeIds: string[],
): Promise<Record<string, IcaChallengePlayRecord[]>> {
  if (ICA_CHALLENGES_LOCAL) {
    return (await (await loadLocalChallenges()).localListPlays(challengeIds)).reduce<Record<string, IcaChallengePlayRecord[]>>((acc, play) => {
      if (!acc[play.challengeId]) acc[play.challengeId] = []
      acc[play.challengeId].push(play)
      return acc
    }, {})
  }
  if (!supabase || challengeIds.length === 0) return {}

  const uniqueChallengeIds = Array.from(
    new Set(challengeIds.map((id) => id.trim()).filter(Boolean)),
  )
  if (uniqueChallengeIds.length === 0) return {}

  const client = supabase
  const data = await runInBatches(uniqueChallengeIds, async (batchIds) => {
    const { data: batchData, error } = await client
      .from('desafio_jugadas')
      .select('id, desafio_id, usuario_id, indice, acierto, ms, payload, creado_at')
      .in('desafio_id', batchIds)
      .order('indice', { ascending: true })
      .order('creado_at', { ascending: true })

    if (error) throw error
    return (batchData || []) as IcaChallengePlayRow[]
  })

  const rows = data.map((row) => toChallengePlayRecord(row))
  return rows.reduce<Record<string, IcaChallengePlayRecord[]>>((acc, row) => {
    if (!acc[row.challengeId]) acc[row.challengeId] = []
    acc[row.challengeId].push(row)
    return acc
  }, {})
}

export async function listIcaChallengeProfilesByIds(
  userIds: string[],
): Promise<IcaChallengeProfileMap> {
  const botProfiles: IcaChallengeProfileMap = ICA_CHALLENGES_LOCAL
    ? (await loadLocalChallenges()).localBotProfiles()
    : {}
  if (!supabase || userIds.length === 0) return botProfiles

  const uniqueUserIds = Array.from(
    new Set(userIds.map((id) => id.trim()).filter((id) => id && !botProfiles[id])),
  )
  if (uniqueUserIds.length === 0) return botProfiles

  const client = supabase
  const data = await runInBatches(uniqueUserIds, async (batchIds) => {
    const { data: batchData, error } = await client
      .from('profiles')
      .select('id, display_name, username, avatar_url')
      .in('id', batchIds)

    if (error) throw error
    return batchData || []
  })

  return data.reduce<IcaChallengeProfileMap>((acc, row) => {
    const id = String((row as { id?: string }).id || '').trim()
    if (!id) return acc

    acc[id] = {
      displayName:
        String((row as { display_name?: string }).display_name || '').trim() || 'Usuario',
      username: String((row as { username?: string }).username || '').trim() || null,
      avatarUrl: String((row as { avatar_url?: string }).avatar_url || '').trim() || null,
    }

    return acc
  }, { ...botProfiles })
}

// ---------------------------------------------------------------------------
// Perfil de otro icademer (se abre al tocar su nombre en el ranking)
// ---------------------------------------------------------------------------

export type IcademerPublicProfile = {
  profile: {
    userId: string
    displayName: string
    username: string | null
    targetLang: string | null
    nativeLang: string | null
    level: string | null
    isMe: boolean
  }
  /** Datos de sus insignias (null = no se sabe). Ranking y eficacia se calculan en la app. */
  stats: {
    icaStreakBest: number | null
    flashStreakBest: number | null
    vocab: number | null
    wins: number | null
  }
  challenge: {
    canChallenge: boolean
    blockedReason: string | null
    blockedCode: string | null
  }
}

/**
 * Pide al servidor el perfil público de un icademer (acción `public-profile` de
 * ica-challenges-center). Si la función aún no está desplegada con esa acción, falla y la app
 * enseña lo que ya sabe por el ranking.
 */
export async function fetchIcademerPublicProfile(profileUserId: string): Promise<IcademerPublicProfile> {
  type Response = FunctionResponse & Partial<IcademerPublicProfile>
  const data = await invokeChallenges<Response>(
    { action: 'public-profile', profileUserId },
    'No se pudo cargar el perfil.',
  )
  if (!data.profile || !data.challenge) {
    throw new IcaChallengeRequestError('No se pudo cargar el perfil.')
  }
  const toCount = (value: unknown): number | null =>
    value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Math.max(0, Number(value))
  return {
    profile: {
      userId: String(data.profile.userId || profileUserId),
      displayName: String(data.profile.displayName || '').trim() || 'Usuario',
      username: data.profile.username || null,
      targetLang: data.profile.targetLang || null,
      nativeLang: data.profile.nativeLang || null,
      level: data.profile.level || null,
      isMe: Boolean(data.profile.isMe),
    },
    stats: {
      icaStreakBest: toCount(data.stats?.icaStreakBest),
      flashStreakBest: toCount(data.stats?.flashStreakBest),
      vocab: toCount(data.stats?.vocab),
      wins: toCount(data.stats?.wins),
    },
    challenge: {
      canChallenge: Boolean(data.challenge.canChallenge),
      blockedReason: data.challenge.blockedReason || null,
      blockedCode: data.challenge.blockedCode || null,
    },
  }
}

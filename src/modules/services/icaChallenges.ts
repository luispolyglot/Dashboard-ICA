import { supabase } from '@/lib/supabase'
import type {
  IcaChallengeAvailableUser,
  IcaChallengeCompetitor,
  IcaChallengeCompetitorInvitationStatus,
  IcaChallengeEnrollment,
  IcaChallengeRecord,
  IcaChallengeResultType,
  IcaChallengeScope,
  IcaChallengeStatus,
  IcaOwnWordsChallengeConfig,
  IcaTestAnswer,
  IcaTestQuestion,
  Lexicard,
} from '../types'

export const ICA_CHALLENGE_SLUG_OWN_WORDS = 'ica-own-words'
export const ICA_CHALLENGE_ALLOWED_ROUNDS = [3, 5, 10] as const
export const ICA_CHALLENGE_MIN_RESPONSE_SECONDS = 3
export const ICA_CHALLENGE_MAX_RESPONSE_SECONDS = 8

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

type AvailableUsersResponse = {
  rows?: Array<{
    userId: string
    displayName: string
    username: string | null
    activeChallengesCount: number
    canChallenge: boolean
    blockedReason: string | null
  }>
  myActiveChallengesCount?: number
  error?: string
}

type SimpleActionResponse = {
  ok?: boolean
  error?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function shuffle<T>(items: T[]): T[] {
  const next = items.slice()
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[randomIndex]] = [next[randomIndex], next[index]]
  }
  return next
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

function sanitizeOwnWordsConfig(config: IcaOwnWordsChallengeConfig): IcaOwnWordsChallengeConfig {
  const rounds = ICA_CHALLENGE_ALLOWED_ROUNDS.includes(config.rounds)
    ? config.rounds
    : 10

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

export function getOwnWordsChallengeConfig(
  metadata: Record<string, unknown>,
): IcaOwnWordsChallengeConfig {
  const roundsValue = Number(metadata.rounds ?? 10)
  const rounds = ICA_CHALLENGE_ALLOWED_ROUNDS.includes(roundsValue as 3 | 5 | 10)
    ? (roundsValue as 3 | 5 | 10)
    : 10

  const responseSeconds = Math.max(
    ICA_CHALLENGE_MIN_RESPONSE_SECONDS,
    Math.min(
      ICA_CHALLENGE_MAX_RESPONSE_SECONDS,
      Math.round(Number(metadata.responseSeconds ?? 5)),
    ),
  )

  return {
    rounds,
    responseSeconds,
  }
}

export function buildOwnWordsChallengeQuestions(
  cards: Lexicard[],
  targetLang: string,
  nativeLang: string,
  rounds: number,
): IcaTestQuestion[] {
  const filteredCards = cards.filter((card) => {
    const hasText = card.target.trim() && card.native.trim()
    const languageMatch =
      (!card.targetLang || card.targetLang === targetLang) &&
      (!card.nativeLang || card.nativeLang === nativeLang)
    return Boolean(hasText && languageMatch)
  })

  const uniqueByTarget = new Map<string, Lexicard>()
  for (const card of filteredCards) {
    const key = card.target.trim().toLowerCase()
    if (!uniqueByTarget.has(key)) {
      uniqueByTarget.set(key, card)
    }
  }

  const uniqueCards = Array.from(uniqueByTarget.values())
  if (uniqueCards.length < 4) return []

  const totalQuestions = Math.max(1, Math.min(10, Math.round(rounds)))
  const questionPool = shuffle(uniqueCards)
  const questions: IcaTestQuestion[] = []

  for (let index = 0; index < totalQuestions; index += 1) {
    const correctCard = questionPool[index % questionPool.length]
    const distractors = shuffle(
      uniqueCards.filter((card) => card.id !== correctCard.id),
    ).slice(0, 3)

    if (distractors.length < 3) break

    const options = shuffle([correctCard, ...distractors])
    const correctOptionIndex = options.findIndex((card) => card.id === correctCard.id)

    questions.push({
      promptNative: correctCard.native,
      correctTarget: correctCard.target,
      options: options.map((card) => card.target),
      correctOptionIndex,
      promptLexicardId: correctCard.id,
      optionLexicardIds: options.map((card) => card.id),
    })
  }

  return questions
}

export async function fetchMyIcaChallengeEnrollment(
  targetLang: string,
  nativeLang: string,
): Promise<IcaChallengeEnrollment> {
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
  if (!supabase) return []
  const userId = await getCurrentUserId()
  if (!userId) return []

  const { data, error } = await supabase
    .from('ica_challenges')
    .select(
      'id, challenge_slug, status, result_type, scope, target_lang, native_lang, challenger_user_id, challenged_user_id, winner_user_id, duration_seconds, expires_at, started_at, finalized_at, game_metadata, phases_json, created_at, updated_at, ica_challenge_competitors(challenge_id, user_id, competitor_order, invitation_status, score, payload, accepted_at, rejected_at, created_at, updated_at)',
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

export async function getIcaChallengeById(
  challengeId: string,
): Promise<IcaChallengeRecord | null> {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('ica_challenges')
    .select(
      'id, challenge_slug, status, result_type, scope, target_lang, native_lang, challenger_user_id, challenged_user_id, winner_user_id, duration_seconds, expires_at, started_at, finalized_at, game_metadata, phases_json, created_at, updated_at, ica_challenge_competitors(challenge_id, user_id, competitor_order, invitation_status, score, payload, accepted_at, rejected_at, created_at, updated_at)',
    )
    .eq('id', challengeId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return toChallengeRecord(data as IcaChallengeRow)
}

export async function createIcaOwnWordsChallenge(input: {
  challengedUserId: string
  scope: IcaChallengeScope
  targetLang?: string
  nativeLang?: string
  durationSeconds?: number
  config: IcaOwnWordsChallengeConfig
}): Promise<void> {
  if (!supabase) throw new Error('Falta configurar Supabase')

  const cleanConfig = sanitizeOwnWordsConfig(input.config)
  const durationSeconds = input.durationSeconds
    ? Math.max(1, Math.round(input.durationSeconds))
    : undefined

  const { data, error } = await supabase.functions.invoke<SimpleActionResponse>(
    'ica-challenges-center',
    {
      body: {
        action: 'create-own-words',
        challengedUserId: input.challengedUserId,
        scope: input.scope,
        targetLang: input.targetLang,
        nativeLang: input.nativeLang,
        rounds: cleanConfig.rounds,
        responseSeconds: cleanConfig.responseSeconds,
        durationSeconds,
      },
    },
  )

  if (error) throw error
  if (!data?.ok) throw new Error(data?.error || 'No se pudo crear el desafío.')
}

export async function respondIcaChallengeInvitation(
  challengeId: string,
  accept: boolean,
): Promise<void> {
  if (!supabase) throw new Error('Falta configurar Supabase')

  const { data, error } = await supabase.functions.invoke<SimpleActionResponse>(
    'ica-challenges-center',
    {
      body: {
        action: 'respond-invitation',
        challengeId,
        accept,
      },
    },
  )

  if (error) throw error
  if (!data?.ok) throw new Error(data?.error || 'No se pudo actualizar el desafío.')
}

export async function listAvailableIcaChallengeUsers(input: {
  targetLang: string
  nativeLang: string
  scope: IcaChallengeScope
}): Promise<{ rows: IcaChallengeAvailableUser[]; myActiveChallengesCount: number }> {
  if (!supabase) return { rows: [], myActiveChallengesCount: 0 }

  const { data, error } = await supabase.functions.invoke<AvailableUsersResponse>(
    'ica-challenges-center',
    {
      body: {
        action: 'list-available-users',
        targetLang: input.targetLang,
        nativeLang: input.nativeLang,
        scope: input.scope,
      },
    },
  )

  if (error) throw error
  if (data?.error) throw new Error(data.error)

  return {
    rows:
      data?.rows?.map((row) => ({
        userId: row.userId,
        displayName: row.displayName,
        username: row.username,
        activeChallengesCount: Number(row.activeChallengesCount || 0),
        canChallenge: Boolean(row.canChallenge),
        blockedReason: row.blockedReason || null,
      })) || [],
    myActiveChallengesCount: Number(data?.myActiveChallengesCount || 0),
  }
}

export function hasOwnWordsResult(
  challenge: IcaChallengeRecord,
  userId: string,
): boolean {
  const competitor = challenge.competitors.find((item) => item.userId === userId)
  if (!competitor) return false
  if (!isRecord(competitor.payload)) return false
  const ownWords = competitor.payload.ownWords
  if (!isRecord(ownWords)) return false
  return Boolean(ownWords.completedAt)
}

export async function submitIcaOwnWordsChallengeResult(input: {
  challengeId: string
  score: number
  totalQuestions: number
  answers: IcaTestAnswer[]
  rounds: number
  responseSeconds: number
}): Promise<void> {
  if (!supabase) throw new Error('Falta configurar Supabase')

  const { data, error } = await supabase.functions.invoke<SimpleActionResponse>(
    'ica-challenges-center',
    {
      body: {
        action: 'submit-own-words-result',
        challengeId: input.challengeId,
        score: Math.max(0, Math.round(input.score)),
        totalQuestions: Math.max(1, Math.round(input.totalQuestions)),
        answers: input.answers,
        rounds: input.rounds,
        responseSeconds: input.responseSeconds,
      },
    },
  )

  if (error) throw error
  if (!data?.ok) throw new Error(data?.error || 'No se pudo guardar el resultado.')
}

export function getIcaOwnWordsConfigLabel(metadata: Record<string, unknown>): string {
  const config = getOwnWordsChallengeConfig(metadata)
  return `${config.rounds} rondas · ${config.responseSeconds}s por respuesta`
}

import { jsonResponse } from '../_shared/http.ts'
import type { AdminClient, ChallengeScope, LanguagePair } from './types.ts'
import { MIN_WORDS_TO_JOIN, wordsMissingToJoin } from './engine.ts'

// Public profile of another icademer (opened from the ranking). Same dependency-injection
// pattern as directory.ts: the shared helpers live in index.ts and are passed in.

type SettingsInfo = { targetLang: string | null; nativeLang: string | null; cefrLevel: string | null }

type ProfileInput = {
  adminClient: AdminClient
  userId: string
  profileUserId: string
  maxActiveChallenges: number
  countActiveChallenges: (adminClient: AdminClient, userId: string) => Promise<number>
  hasActivePairChallenge: (adminClient: AdminClient, challengerUserId: string, challengedUserId: string) => Promise<boolean>
  fetchSettingsByUser: (adminClient: AdminClient, userIds: string[]) => Promise<Map<string, SettingsInfo>>
  fetchLevelsForPair: (input: {
    adminClient: AdminClient
    userIds: string[]
    targetLang: string
    nativeLang: string
    settingsByUser?: Map<string, SettingsInfo>
  }) => Promise<Map<string, string | null>>
  resolvePlayerPair: (
    adminClient: AdminClient,
    challenge: { scope: ChallengeScope; target_lang: string | null; native_lang: string | null },
    userId: string,
  ) => Promise<LanguagePair | null>
  countWordsForPair: (adminClient: AdminClient, userId: string, pair: LanguagePair) => Promise<number>
  notEnoughWordsToJoinMessage: (wordCount: number, action: 'retar' | 'aceptar') => string
  toText: (value: unknown) => string
}

function shiftDay(isoDay: string, days: number): string {
  const date = new Date(`${isoDay}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Longest streak. Days saved with CongeladICA keep the streak alive but do not add to it. */
export function longestStreakOf(completedDays: string[], savedDays: string[] = []): number {
  const completed = new Set(completedDays)
  const sorted = [...new Set([...completedDays, ...savedDays])].sort()
  let best = 0
  let run = 0
  let previous: string | null = null
  for (const day of sorted) {
    const consecutive = previous !== null && shiftDay(previous, 1) === day
    run = consecutive ? run : 0
    if (completed.has(day)) run += 1
    best = Math.max(best, run)
    previous = day
  }
  return best
}

/**
 * What another icademer's profile shows: name, target language, level, the numbers behind
 * their badges and whether they can be challenged right now (with the reason if not).
 * Ranking position and efficacy are computed by the app from the monthly snapshots (public).
 */
async function loadPublicProfile(input: ProfileInput): Promise<Response> {
  const { adminClient, userId, profileUserId, toText } = input
  if (!profileUserId) return jsonResponse(400, { ok: false, error: 'Falta el icademer.' })
  const isMe = profileUserId === userId

  const [{ data: profileRow, error: profileError }, settingsByUser] = await Promise.all([
    adminClient.from('profiles').select('id, display_name, username').eq('id', profileUserId).maybeSingle(),
    input.fetchSettingsByUser(adminClient, [userId, profileUserId]),
  ])
  if (profileError) return jsonResponse(500, { ok: false, error: profileError.message })
  if (!profileRow) return jsonResponse(404, { ok: false, error: 'No encontramos a este icademer.' })
  const profileFields = profileRow as Record<string, unknown>

  const setting = settingsByUser.get(profileUserId)
  const targetLang = setting?.targetLang || null
  const nativeLang = setting?.nativeLang || null
  const levels =
    targetLang && nativeLang
      ? await input.fetchLevelsForPair({
          adminClient,
          userIds: [profileUserId],
          targetLang,
          nativeLang,
          settingsByUser,
        })
      : new Map<string, string | null>()

  // --- Badge numbers ---
  const [metricsResult, vocabResult, winsResult] = await Promise.all([
    adminClient
      .from('daily_metrics')
      .select('day, creation_goal_completed, review_goal_completed, creation_streak_saved_at')
      .eq('user_id', profileUserId),
    adminClient.from('lexicards').select('id', { count: 'exact', head: true }).eq('user_id', profileUserId),
    adminClient
      .from('ica_challenges')
      .select('id', { count: 'exact', head: true })
      .eq('winner_user_id', profileUserId),
  ])
  const metricRows = (metricsResult.data || []) as Array<Record<string, unknown>>
  const creationDays = metricRows.filter((row) => row.creation_goal_completed === true).map((row) => toText(row.day))
  const savedDays = metricRows.filter((row) => row.creation_streak_saved_at).map((row) => toText(row.day))
  const reviewDays = metricRows.filter((row) => row.review_goal_completed === true).map((row) => toText(row.day))
  const stats = {
    icaStreakBest: metricsResult.error ? null : longestStreakOf(creationDays, savedDays),
    flashStreakBest: metricsResult.error ? null : longestStreakOf(reviewDays),
    vocab: vocabResult.error ? null : vocabResult.count || 0,
    wins: winsResult.error ? null : winsResult.count || 0,
  }

  // --- Can they be challenged? (same rules as creating a Global challenge) ---
  let blockedReason: string | null = null
  let blockedCode: string | null = null
  if (isMe) {
    blockedReason = 'Eres tú.'
    blockedCode = 'ICA_CHALLENGE_SELF'
  } else {
    const [myEnrollment, rivalEnrollment] = await Promise.all([
      adminClient.from('users_ica_challenges').select('id').eq('user_id', userId).eq('is_active', true).limit(1),
      adminClient.from('users_ica_challenges').select('id').eq('user_id', profileUserId).eq('is_active', true).limit(1),
    ])
    // Same pair resolution as create-challenge (settings, then the active enrollment).
    const globalScope = { scope: 'global' as const, target_lang: null, native_lang: null }
    const [myPair, rivalPair] = await Promise.all([
      input.resolvePlayerPair(adminClient, globalScope, userId),
      input.resolvePlayerPair(adminClient, globalScope, profileUserId),
    ])
    if ((myEnrollment.data || []).length === 0) {
      blockedCode = 'ICA_CHALLENGE_NOT_ENROLLED'
      blockedReason = 'Activa Desafíos ICA para poder retar.'
    } else if ((rivalEnrollment.data || []).length === 0) {
      blockedCode = 'ICA_CHALLENGE_RIVAL_NOT_ENROLLED'
      blockedReason = 'Todavía no juega a Desafíos ICA.'
    } else {
      const [myWords, rivalWords] = await Promise.all([
        myPair ? input.countWordsForPair(adminClient, userId, myPair) : Promise.resolve(0),
        rivalPair ? input.countWordsForPair(adminClient, profileUserId, rivalPair) : Promise.resolve(0),
      ])
      if (wordsMissingToJoin(myWords) > 0) {
        blockedCode = 'ICA_CHALLENGE_MIN_WORDS'
        blockedReason = input.notEnoughWordsToJoinMessage(myWords, 'retar')
      } else if (wordsMissingToJoin(rivalWords) > 0) {
        blockedCode = 'ICA_CHALLENGE_RIVAL_MIN_WORDS'
        blockedReason = `Aún no tiene ${MIN_WORDS_TO_JOIN} palabras en su Baúl ICA.`
      } else {
        const [myActive, rivalActive, activePair] = await Promise.all([
          input.countActiveChallenges(adminClient, userId),
          input.countActiveChallenges(adminClient, profileUserId),
          input.hasActivePairChallenge(adminClient, userId, profileUserId),
        ])
        if (activePair) {
          blockedCode = 'ICA_CHALLENGE_ACTIVE_PAIR_EXISTS'
          blockedReason = 'Ya tienen un desafío activo entre ustedes.'
        } else if (myActive >= input.maxActiveChallenges) {
          blockedCode = 'ICA_CHALLENGE_ACTIVE_LIMIT_REACHED'
          blockedReason = 'Ya tienes 3 desafíos activos. Termina uno para retar de nuevo.'
        } else if (rivalActive >= input.maxActiveChallenges) {
          blockedCode = 'ICA_CHALLENGE_OPPONENT_ACTIVE_LIMIT_REACHED'
          blockedReason = 'Ya tiene 3 desafíos activos.'
        }
      }
    }
  }

  return jsonResponse(200, {
    ok: true,
    profile: {
      userId: profileUserId,
      displayName: toText(profileFields.display_name) || 'Usuario',
      username: toText(profileFields.username) || null,
      targetLang,
      nativeLang,
      level: levels.get(profileUserId) ?? null,
      isMe,
    },
    stats,
    challenge: { canChallenge: blockedReason === null, blockedReason, blockedCode },
  })
}

/** Same as loadPublicProfile, but a database error becomes a JSON 500 (with CORS headers). */
export async function getPublicProfile(input: ProfileInput): Promise<Response> {
  try {
    return await loadPublicProfile(input)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado.'
    return jsonResponse(500, { ok: false, error: message })
  }
}

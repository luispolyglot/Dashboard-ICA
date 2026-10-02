import { jsonResponse } from '../_shared/http.ts'
import type { AdminClient, ChallengeScope, LanguagePair } from './types.ts'
import {
  activeSinceDay,
  checkMixedAllowed,
  DEFAULT_MAX_LEVEL_GAP,
  isRecentlyActive,
  MIN_WORDS_TO_JOIN,
  summarizeChallengeActivity,
  wordsMissingToJoin,
  type ActivityChallengeRow,
} from './engine.ts'

type SettingsInfo = { targetLang: string | null; nativeLang: string | null; cefrLevel: string | null }
type EnrollmentInfo = { targetLang: string | null; nativeLang: string | null; updatedAt: string | null }

type DirectoryInput = {
  adminClient: AdminClient
  userId: string
  targetLang: string
  nativeLang: string
  scope: ChallengeScope
  maxActiveChallenges: number
  countActiveChallenges: (adminClient: AdminClient, userId: string) => Promise<number>
  fetchSettingsByUser: (adminClient: AdminClient, userIds: string[]) => Promise<Map<string, SettingsInfo>>
  fetchLevelsForPair: (input: {
    adminClient: AdminClient
    userIds: string[]
    targetLang: string
    nativeLang: string
    settingsByUser?: Map<string, SettingsInfo>
  }) => Promise<Map<string, string | null>>
  countWordsForPair: (adminClient: AdminClient, userId: string, pair: LanguagePair) => Promise<number>
  toText: (value: unknown) => string
}

/** Lista rivales, filtra inactivos y carga sus métricas mediante una RPC agrupada. */
export async function listAvailableUsers(input: DirectoryInput): Promise<Response> {
  const { adminClient, userId, targetLang, nativeLang, scope, toText } = input
  const activeCount = await input.countActiveChallenges(adminClient, userId)

  const enrollmentQuery = adminClient
    .from('users_ica_challenges')
    .select('user_id, target_lang, native_lang, updated_at')
    .eq('is_active', true)

  if (scope === 'language') {
    enrollmentQuery.eq('target_lang', targetLang).eq('native_lang', nativeLang)
  }

  const { data: enrollmentRows, error: enrollmentError } = await enrollmentQuery
  if (enrollmentError) return jsonResponse(500, { error: enrollmentError.message })

  const enrollmentList = (enrollmentRows || []) as Array<Record<string, unknown>>
  const candidateIds = Array.from(
    new Set(
      enrollmentList
        .map((row) => toText(row.user_id))
        .filter((id) => id && id !== userId),
    ),
  )

  const latestEnrollmentByUser = new Map<string, EnrollmentInfo>()
  const samePairUserIds = new Set<string>()
  for (const row of enrollmentList) {
    const candidateId = toText(row.user_id)
    if (!candidateId || candidateId === userId) continue

    if (toText(row.target_lang) === targetLang && toText(row.native_lang) === nativeLang) {
      samePairUserIds.add(candidateId)
    }

    const previous = latestEnrollmentByUser.get(candidateId)
    const currentUpdatedAt = toText(row.updated_at) || null
    if (
      !previous ||
      (currentUpdatedAt !== null && (previous.updatedAt === null || currentUpdatedAt > previous.updatedAt))
    ) {
      latestEnrollmentByUser.set(candidateId, {
        targetLang: toText(row.target_lang) || null,
        nativeLang: toText(row.native_lang) || null,
        updatedAt: currentUpdatedAt,
      })
    }
  }

  const settingsByUser = await input.fetchSettingsByUser(adminClient, [userId, ...candidateIds])
  const levels = await input.fetchLevelsForPair({
    adminClient,
    userIds: [userId, ...Array.from(samePairUserIds)],
    targetLang,
    nativeLang,
    settingsByUser,
  })
  const myLevel = levels.get(userId) ?? null
  const myWordCount =
    targetLang && nativeLang
      ? await input.countWordsForPair(adminClient, userId, { targetLang, nativeLang })
      : 0
  const wordsInfo = { myWordCount, minWordsToJoin: MIN_WORDS_TO_JOIN }

  if (candidateIds.length === 0) {
    return jsonResponse(200, { rows: [], myActiveChallengesCount: activeCount, myLevel, ...wordsInfo })
  }

  const { data: profilesRows, error: profilesError } = await adminClient
    .from('profiles')
    .select('id, display_name, username')
    .in('id', candidateIds)
  if (profilesError) return jsonResponse(500, { error: profilesError.message })

  const candidatePairs = new Map<string, LanguagePair>()
  for (const candidateId of candidateIds) {
    const setting = settingsByUser.get(candidateId)
    const enrollment = latestEnrollmentByUser.get(candidateId)
    const pair =
      scope === 'language'
        ? { targetLang, nativeLang }
        : setting?.targetLang && setting.nativeLang
          ? { targetLang: setting.targetLang, nativeLang: setting.nativeLang }
          : enrollment?.targetLang && enrollment.nativeLang
            ? { targetLang: enrollment.targetLang, nativeLang: enrollment.nativeLang }
            : null
    if (pair) candidatePairs.set(candidateId, pair)
  }

  const directoryMetricsPromise = adminClient.rpc('ica_challenge_directory_metrics', {
    p_current_user_id: userId,
    p_candidate_ids: candidateIds,
    p_language_pairs: Array.from(candidatePairs, ([candidateId, pair]) => ({
      user_id: candidateId,
      target_lang: pair.targetLang,
      native_lang: pair.nativeLang,
    })),
  })

  const nowMs = Date.now()
  const candidateIdList = candidateIds.join(',')
  const [directoryMetricsResult, metricsResult, activityResult] = await Promise.all([
    directoryMetricsPromise,
    adminClient
      .from('daily_metrics')
      .select('user_id, day')
      .in('user_id', candidateIds)
      .gte('day', activeSinceDay(nowMs)),
    adminClient
      .from('ica_challenges')
      .select('challenger_user_id, challenged_user_id, status, result_type, winner_user_id, finalized_at, created_at')
      .or(`challenger_user_id.in.(${candidateIdList}),challenged_user_id.in.(${candidateIdList})`)
      .order('created_at', { ascending: false })
      .limit(3000),
  ])
  if (directoryMetricsResult.error) return jsonResponse(500, { error: directoryMetricsResult.error.message })

  const directoryMetricsByUser = new Map<string, Record<string, unknown>>()
  for (const metric of (directoryMetricsResult.data || []) as Array<Record<string, unknown>>) {
    const candidateId = toText(metric.user_id)
    if (candidateId) directoryMetricsByUser.set(candidateId, metric)
  }

  // Si no se puede saber la actividad, no se esconde a nadie.
  const activityKnown = !metricsResult.error
  const lastAppDayByUser = new Map<string, string>()
  for (const row of (metricsResult.data || []) as Array<Record<string, unknown>>) {
    const candidateId = toText(row.user_id)
    const day = toText(row.day)
    if (!candidateId || !day) continue
    const previous = lastAppDayByUser.get(candidateId)
    if (!previous || day > previous) lastAppDayByUser.set(candidateId, day)
  }

  const activityRows: ActivityChallengeRow[] = ((activityResult.data || []) as Array<Record<string, unknown>>).map(
    (row) => ({
      challengerUserId: toText(row.challenger_user_id),
      challengedUserId: toText(row.challenged_user_id),
      status: toText(row.status),
      resultType: toText(row.result_type) || null,
      winnerUserId: toText(row.winner_user_id) || null,
      finalizedAt: toText(row.finalized_at) || null,
      createdAt: toText(row.created_at) || null,
    }),
  )

  const rows = ((profilesRows || []) as Array<Record<string, unknown>>).map((row) => {
    const candidateId = toText(row.id)
    const activity = summarizeChallengeActivity(activityRows, candidateId, nowMs)
    if (
      activityKnown &&
      !isRecentlyActive({
        lastAppActivityDay: lastAppDayByUser.get(candidateId) ?? null,
        lastChallengeAtMs: activity.lastChallengeAtMs,
        nowMs,
      })
    ) {
      return null
    }

    const candidatePair = candidatePairs.get(candidateId)
    if (!candidatePair) return null
    const directoryMetrics = directoryMetricsByUser.get(candidateId)
    if (wordsMissingToJoin(Number(directoryMetrics?.word_count || 0)) > 0) return null

    const userActiveCount = Number(directoryMetrics?.active_challenges_count || 0)
    let blockedReason: string | null = null
    if (activeCount >= input.maxActiveChallenges) blockedReason = 'Tu máximo de desafíos activos es 3.'
    else if (userActiveCount >= input.maxActiveChallenges) blockedReason = 'Este usuario ya tiene 3 desafíos activos.'
    else if (Boolean(directoryMetrics?.has_active_pair)) blockedReason = 'Ya tienen un desafío activo entre ustedes.'

    const setting = settingsByUser.get(candidateId)
    const enrollment = latestEnrollmentByUser.get(candidateId)
    const samePair = samePairUserIds.has(candidateId)
    const level = samePair ? levels.get(candidateId) ?? null : null
    const mixed = samePair
      ? checkMixedAllowed({ myLevel, rivalLevel: level, maxGap: DEFAULT_MAX_LEVEL_GAP })
      : { allowed: false as const, reason: 'Solo con icademers de tu mismo idioma.' }

    return {
      userId: candidateId,
      displayName: toText(row.display_name) || 'Usuario',
      username: toText(row.username) || null,
      nativeLang: setting?.nativeLang || enrollment?.nativeLang || null,
      targetLang: setting?.targetLang || enrollment?.targetLang || null,
      cefrLevel: level,
      level,
      samePair,
      mixedAllowed: mixed.allowed,
      mixedBlockedReason: mixed.allowed ? null : mixed.reason,
      activeChallengesCount: userActiveCount,
      canChallenge: blockedReason === null,
      blockedReason,
      winStreak: activity.winStreak,
      recentChallenges: activity.recentChallenges,
    }
  })

  const visibleRows = rows.filter((row): row is NonNullable<typeof row> => row !== null)
  visibleRows.sort(
    (a, b) => b.recentChallenges - a.recentChallenges || a.displayName.localeCompare(b.displayName, 'es'),
  )
  return jsonResponse(200, { rows: visibleRows, myActiveChallengesCount: activeCount, myLevel, ...wordsInfo })
}

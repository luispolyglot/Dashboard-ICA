import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  IcaChallengeAvailableUser,
  IcaChallengeEnrollment,
  IcaChallengePlayRecord,
  IcaChallengeRecord,
  IcaChallengeScope,
  IcaChallengeTypeRecord,
  IcaOwnWordsChallengeConfig,
} from '../types'
import {
  cancelIcaChallengeInvitation,
  createIcaOwnWordsChallenge,
  fetchMyIcaChallengeEnrollment,
  listIcaChallengeProfilesByIds,
  listIcaChallengeTypes,
  listIcaChallengePlaysByChallengeIds,
  listAvailableIcaChallengeUsers,
  listMyIcaChallenges,
  respondIcaChallengeInvitation,
  upsertMyIcaChallengeEnrollment,
} from '../services/icaChallenges'

type UseIcaChallengesOverviewParams = {
  targetLang?: string
  nativeLang?: string
}

type UseIcaChallengesOverviewResult = {
  enrollment: IcaChallengeEnrollment | null
  challenges: IcaChallengeRecord[]
  playsByChallengeId: Record<string, IcaChallengePlayRecord[]>
  userProfiles: Record<
    string,
    { displayName: string; username: string | null; avatarUrl: string | null }
  >
  challengeTypes: IcaChallengeTypeRecord[]
  availableUsers: IcaChallengeAvailableUser[]
  myActiveChallengesCount: number
  isLoading: boolean
  isSavingEnrollment: boolean
  isCreatingChallenge: boolean
  isResponding: boolean
  isCancelling: boolean
  currentUserId: string | null
  error: string | null
  setEnrollmentActive: (active: boolean) => Promise<void>
  createOwnWordsChallenge: (input: {
    challengeTypeId?: string
    challengedUserId: string
    scope: IcaChallengeScope
    config: IcaOwnWordsChallengeConfig
    durationSeconds?: number
  }) => Promise<void>
  respondInvitation: (challengeId: string, accept: boolean) => Promise<void>
  cancelInvitation: (challengeId: string) => Promise<void>
  refreshAvailableUsers: (scope: IcaChallengeScope) => Promise<void>
  refresh: () => Promise<void>
}

export function useIcaChallengesOverview({
  targetLang,
  nativeLang,
}: UseIcaChallengesOverviewParams): UseIcaChallengesOverviewResult {
  const [enrollment, setEnrollment] = useState<IcaChallengeEnrollment | null>(null)
  const [challenges, setChallenges] = useState<IcaChallengeRecord[]>([])
  const [playsByChallengeId, setPlaysByChallengeId] = useState<
    Record<string, IcaChallengePlayRecord[]>
  >({})
  const [userProfiles, setUserProfiles] = useState<
    Record<string, { displayName: string; username: string | null; avatarUrl: string | null }>
  >({})
  const [challengeTypes, setChallengeTypes] = useState<IcaChallengeTypeRecord[]>([])
  const [availableUsers, setAvailableUsers] = useState<IcaChallengeAvailableUser[]>([])
  const [myActiveChallengesCount, setMyActiveChallengesCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingEnrollment, setIsSavingEnrollment] = useState(false)
  const [isCreatingChallenge, setIsCreatingChallenge] = useState(false)
  const [isResponding, setIsResponding] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshAvailableUsers = useCallback(
    async (scope: IcaChallengeScope) => {
      if (!targetLang || !nativeLang) {
        setAvailableUsers([])
        setMyActiveChallengesCount(0)
        return
      }

      try {
        const data = await listAvailableIcaChallengeUsers({
          targetLang,
          nativeLang,
          scope,
        })
        setAvailableUsers(data.rows)
        setMyActiveChallengesCount(data.myActiveChallengesCount)
      } catch {
        setAvailableUsers([])
      }
    },
    [nativeLang, targetLang],
  )

  const refresh = useCallback(async () => {
    if (!targetLang || !nativeLang) {
      setEnrollment(null)
        setChallenges([])
        setPlaysByChallengeId({})
        setUserProfiles({})
        setChallengeTypes([])
        setAvailableUsers([])
      setMyActiveChallengesCount(0)
      setCurrentUserId(null)
      setError(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const [
        {
          data: { user },
        },
        enrollmentData,
        challengesData,
        challengeTypesData,
        availableUsersData,
      ] = await Promise.all([
        supabase?.auth.getUser() ?? Promise.resolve({ data: { user: null }, error: null }),
        fetchMyIcaChallengeEnrollment(targetLang, nativeLang),
        listMyIcaChallenges(targetLang, nativeLang),
        listIcaChallengeTypes(),
        listAvailableIcaChallengeUsers({
          targetLang,
          nativeLang,
          scope: 'global',
        }),
      ])

      setCurrentUserId(user?.id ?? null)
      setEnrollment(enrollmentData)
      setChallenges(challengesData)
      const challengeIds = challengesData.map((challenge) => challenge.id)
      const playsData = await listIcaChallengePlaysByChallengeIds(challengeIds)
      const userIds = Array.from(
        new Set(
          challengesData
            .flatMap((challenge) => [challenge.challengerUserId, challenge.challengedUserId])
            .concat(availableUsersData.rows.map((row) => row.userId)),
        ),
      )
      const profilesData = await listIcaChallengeProfilesByIds(userIds)
      setPlaysByChallengeId(playsData)
      setUserProfiles(profilesData)
      setChallengeTypes(challengeTypesData)
      setAvailableUsers(availableUsersData.rows)
      setMyActiveChallengesCount(availableUsersData.myActiveChallengesCount)
    } catch {
      setError('No pudimos cargar los desafíos ICA.')
    } finally {
      setIsLoading(false)
    }
  }, [nativeLang, targetLang])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const setEnrollmentActive = useCallback(
    async (active: boolean) => {
      if (!targetLang || !nativeLang) return
      setIsSavingEnrollment(true)
      try {
        const next = await upsertMyIcaChallengeEnrollment({
          targetLang,
          nativeLang,
          isActive: active,
        })
        setEnrollment(next)
        if (!active) {
          setAvailableUsers([])
        } else {
          await refreshAvailableUsers('language')
        }
      } finally {
        setIsSavingEnrollment(false)
      }
    },
    [nativeLang, refreshAvailableUsers, targetLang],
  )

  const createOwnWordsChallenge = useCallback(
    async (input: {
      challengeTypeId?: string
      challengedUserId: string
      scope: IcaChallengeScope
      config: IcaOwnWordsChallengeConfig
      durationSeconds?: number
    }) => {
      if (!targetLang || !nativeLang) return
      setIsCreatingChallenge(true)
      try {
        await createIcaOwnWordsChallenge({
          challengeTypeId: input.challengeTypeId,
          challengedUserId: input.challengedUserId,
          scope: input.scope,
          targetLang,
          nativeLang,
          durationSeconds: input.durationSeconds,
          config: input.config,
        })
        await refresh()
      } finally {
        setIsCreatingChallenge(false)
      }
    },
    [nativeLang, refresh, refreshAvailableUsers, targetLang],
  )

  const respondInvitation = useCallback(async (challengeId: string, accept: boolean) => {
    setIsResponding(true)
    try {
      await respondIcaChallengeInvitation(challengeId, accept)
      await refresh()
    } finally {
      setIsResponding(false)
    }
  }, [refresh])

  const cancelInvitation = useCallback(async (challengeId: string) => {
    setIsCancelling(true)
    try {
      await cancelIcaChallengeInvitation(challengeId)
      await refresh()
    } finally {
      setIsCancelling(false)
    }
  }, [refresh])

  return useMemo(
    () => ({
      enrollment,
      challenges,
      playsByChallengeId,
      userProfiles,
      challengeTypes,
      availableUsers,
      myActiveChallengesCount,
      isLoading,
      isSavingEnrollment,
      isCreatingChallenge,
      isResponding,
      isCancelling,
      currentUserId,
      error,
      setEnrollmentActive,
      createOwnWordsChallenge,
      respondInvitation,
      cancelInvitation,
      refreshAvailableUsers,
      refresh,
    }),
    [
      availableUsers,
      challenges,
      playsByChallengeId,
      userProfiles,
      challengeTypes,
      createOwnWordsChallenge,
      currentUserId,
      enrollment,
      error,
      isCreatingChallenge,
      isCancelling,
      isLoading,
      myActiveChallengesCount,
      isResponding,
      isSavingEnrollment,
      refresh,
      refreshAvailableUsers,
      respondInvitation,
      cancelInvitation,
      setEnrollmentActive,
    ],
  )
}

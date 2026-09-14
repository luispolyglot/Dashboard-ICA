import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  IcaChallengeAvailableUser,
  IcaChallengeEnrollment,
  IcaChallengeRecord,
  IcaChallengeScope,
  IcaOwnWordsChallengeConfig,
} from '../types'
import {
  createIcaOwnWordsChallenge,
  fetchMyIcaChallengeEnrollment,
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
  availableUsers: IcaChallengeAvailableUser[]
  myActiveChallengesCount: number
  isLoading: boolean
  isSavingEnrollment: boolean
  isCreatingChallenge: boolean
  isResponding: boolean
  currentUserId: string | null
  error: string | null
  setEnrollmentActive: (active: boolean) => Promise<void>
  createOwnWordsChallenge: (input: {
    challengedUserId: string
    scope: IcaChallengeScope
    config: IcaOwnWordsChallengeConfig
    durationSeconds?: number
  }) => Promise<void>
  respondInvitation: (challengeId: string, accept: boolean) => Promise<void>
  refreshAvailableUsers: (scope: IcaChallengeScope) => Promise<void>
  refresh: () => Promise<void>
}

export function useIcaChallengesOverview({
  targetLang,
  nativeLang,
}: UseIcaChallengesOverviewParams): UseIcaChallengesOverviewResult {
  const [enrollment, setEnrollment] = useState<IcaChallengeEnrollment | null>(null)
  const [challenges, setChallenges] = useState<IcaChallengeRecord[]>([])
  const [availableUsers, setAvailableUsers] = useState<IcaChallengeAvailableUser[]>([])
  const [myActiveChallengesCount, setMyActiveChallengesCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingEnrollment, setIsSavingEnrollment] = useState(false)
  const [isCreatingChallenge, setIsCreatingChallenge] = useState(false)
  const [isResponding, setIsResponding] = useState(false)
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
        availableUsersData,
      ] = await Promise.all([
        supabase?.auth.getUser() ?? Promise.resolve({ data: { user: null }, error: null }),
        fetchMyIcaChallengeEnrollment(targetLang, nativeLang),
        listMyIcaChallenges(targetLang, nativeLang),
        listAvailableIcaChallengeUsers({
          targetLang,
          nativeLang,
          scope: 'language',
        }),
      ])

      setCurrentUserId(user?.id ?? null)
      setEnrollment(enrollmentData)
      setChallenges(challengesData)
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
      challengedUserId: string
      scope: IcaChallengeScope
      config: IcaOwnWordsChallengeConfig
      durationSeconds?: number
    }) => {
      if (!targetLang || !nativeLang) return
      setIsCreatingChallenge(true)
      try {
        await createIcaOwnWordsChallenge({
          challengedUserId: input.challengedUserId,
          scope: input.scope,
          targetLang,
          nativeLang,
          durationSeconds: input.durationSeconds,
          config: input.config,
        })
        await Promise.all([refresh(), refreshAvailableUsers(input.scope)])
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

  return useMemo(
    () => ({
      enrollment,
      challenges,
      availableUsers,
      myActiveChallengesCount,
      isLoading,
      isSavingEnrollment,
      isCreatingChallenge,
      isResponding,
      currentUserId,
      error,
      setEnrollmentActive,
      createOwnWordsChallenge,
      respondInvitation,
      refreshAvailableUsers,
      refresh,
    }),
    [
      availableUsers,
      challenges,
      createOwnWordsChallenge,
      currentUserId,
      enrollment,
      error,
      isCreatingChallenge,
      isLoading,
      myActiveChallengesCount,
      isResponding,
      isSavingEnrollment,
      refresh,
      refreshAvailableUsers,
      respondInvitation,
      setEnrollmentActive,
    ],
  )
}

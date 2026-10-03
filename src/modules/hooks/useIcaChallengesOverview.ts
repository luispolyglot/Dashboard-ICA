import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '@/i18n'
import { supabase } from '@/lib/supabase'
import type {
  IcaChallengeAvailableUser,
  IcaChallengeEnrollment,
  IcaChallengePlayRecord,
  IcaChallengeRecord,
  IcaChallengeScope,
  IcaChallengeStats,
  IcaChallengeTypeRecord,
  IcaOwnWordsChallengeConfig,
} from '../types'
import {
  cancelIcaChallengeInvitation,
  createIcaChallenge,
  fetchMyIcaChallengeEnrollment,
  fetchMyIcaChallengeStats,
  listIcaChallengeProfilesByIds,
  listIcaChallengeTypes,
  listIcaChallengePlaysByChallengeIds,
  listAvailableIcaChallengeUsers,
  listMyIcaChallenges,
  respondIcaChallengeInvitation,
  upsertMyIcaChallengeEnrollment,
} from '../services/icaChallenges'
import { refreshIcaChallengeAlerts } from './useIcaChallengeAlerts'
import { useAuth } from '@/auth/AuthContext'

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
  /** Tu nivel real (barra de progreso) en este par de idiomas. */
  myLevel: string | null
  /** Palabras de tu Baúl ICA en este idioma (null = aún no se sabe). */
  myWordCount: number | null
  /** Palabras necesarias para entrar en los retos (20). */
  minWordsToJoin: number
  /** Victorias, derrotas y racha de victorias seguidas. */
  stats: IcaChallengeStats | null
  isLoading: boolean
  isSavingEnrollment: boolean
  isCreatingChallenge: boolean
  isResponding: boolean
  isCancelling: boolean
  currentUserId: string | null
  error: string | null
  setEnrollmentActive: (active: boolean) => Promise<void>
  createChallenge: (input: {
    challengeTypeId: string
    challengedUserId: string
    scope: IcaChallengeScope
    config: IcaOwnWordsChallengeConfig
    durationSeconds?: number
    /** 4.º desafío con un «desafío extra» (EXTRA_CHALLENGE_COST ICA Coins, ver game/rules.ts). */
    extraSlot?: boolean
  }) => Promise<void>
  respondInvitation: (challengeId: string, accept: boolean) => Promise<void>
  cancelInvitation: (challengeId: string) => Promise<void>
  refreshAvailableUsers: (scope: IcaChallengeScope) => Promise<void>
  refresh: () => Promise<void>
}

// DATOS PRECARGADOS: al pulsar «Desafiar» en el perfil de un icademer, el perfil espera un
// momento mientras se cargan los datos de Desafíos (prefetchIcaChallengesOverview) y la página
// abre ya con ellos, directamente en «Retar a …», sin pasar por «Cargando desafíos…».

type OverviewSnapshot = {
  currentUserId: string | null
  enrollment: IcaChallengeEnrollment | null
  challenges: IcaChallengeRecord[]
  playsByChallengeId: Record<string, IcaChallengePlayRecord[]>
  userProfiles: Record<string, { displayName: string; username: string | null; avatarUrl: string | null }>
  challengeTypes: IcaChallengeTypeRecord[]
  availableUsers: IcaChallengeAvailableUser[]
  myActiveChallengesCount: number
  myLevel: string | null
  myWordCount: number | null
  minWordsToJoin: number
}

/** Cuánto vale una precarga (después se vuelve a pedir). */
const SNAPSHOT_FRESH_MS = 30_000
let lastSnapshot: { key: string; at: number; data: OverviewSnapshot } | null = null
let inflightSnapshot: { key: string; promise: Promise<OverviewSnapshot> } | null = null

async function fetchOverviewSnapshot(targetLang: string, nativeLang: string): Promise<OverviewSnapshot> {
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
  return {
    currentUserId: user?.id ?? null,
    enrollment: enrollmentData,
    challenges: challengesData,
    playsByChallengeId: playsData,
    userProfiles: profilesData,
    challengeTypes: challengeTypesData,
    availableUsers: availableUsersData.rows,
    myActiveChallengesCount: availableUsersData.myActiveChallengesCount,
    myLevel: availableUsersData.myLevel,
    myWordCount: availableUsersData.myWordCount,
    minWordsToJoin: availableUsersData.minWordsToJoin,
  }
}

/**
 * Carga los datos de Desafíos. Si ya se están cargando, espera a esa misma carga, salvo con
 * `force` (después de retar, aceptar, etc., hay que pedirlos de nuevo).
 */
function loadOverviewSnapshot(targetLang: string, nativeLang: string, force = false): Promise<OverviewSnapshot> {
  const key = `${targetLang}|${nativeLang}`
  if (!force && inflightSnapshot?.key === key) return inflightSnapshot.promise
  const promise = fetchOverviewSnapshot(targetLang, nativeLang)
    .then((data) => {
      lastSnapshot = { key, at: Date.now(), data }
      return data
    })
    .finally(() => {
      if (inflightSnapshot?.promise === promise) inflightSnapshot = null
    })
  inflightSnapshot = { key, promise }
  return promise
}

function freshSnapshot(targetLang?: string, nativeLang?: string, userId?: string | null): OverviewSnapshot | null {
  if (!targetLang || !nativeLang || !lastSnapshot) return null
  if (lastSnapshot.key !== `${targetLang}|${nativeLang}`) return null
  // Solo si es de la misma cuenta (por si se cambia de usuario en la misma pestaña).
  if (!userId || lastSnapshot.data.currentUserId !== userId) return null
  return Date.now() - lastSnapshot.at < SNAPSHOT_FRESH_MS ? lastSnapshot.data : null
}

/** Precarga Desafíos (p. ej. al pulsar «Desafiar» en un perfil). No falla nunca. */
export async function prefetchIcaChallengesOverview(targetLang?: string | null, nativeLang?: string | null): Promise<void> {
  if (!targetLang || !nativeLang) return
  try {
    await loadOverviewSnapshot(targetLang, nativeLang)
  } catch {
    // Si falla, la página lo vuelve a intentar al abrirse.
  }
}

export function useIcaChallengesOverview({
  targetLang,
  nativeLang,
}: UseIcaChallengesOverviewParams): UseIcaChallengesOverviewResult {
  // Si hay datos precargados (de hace menos de 30 s), la página abre ya con ellos.
  const { user } = useAuth()
  const [initial] = useState(() => freshSnapshot(targetLang, nativeLang, user?.id))
  const [enrollment, setEnrollment] = useState<IcaChallengeEnrollment | null>(initial?.enrollment ?? null)
  const [challenges, setChallenges] = useState<IcaChallengeRecord[]>(initial?.challenges ?? [])
  const [playsByChallengeId, setPlaysByChallengeId] = useState<
    Record<string, IcaChallengePlayRecord[]>
  >(initial?.playsByChallengeId ?? {})
  const [userProfiles, setUserProfiles] = useState<
    Record<string, { displayName: string; username: string | null; avatarUrl: string | null }>
  >(initial?.userProfiles ?? {})
  const [challengeTypes, setChallengeTypes] = useState<IcaChallengeTypeRecord[]>(initial?.challengeTypes ?? [])
  const [availableUsers, setAvailableUsers] = useState<IcaChallengeAvailableUser[]>(initial?.availableUsers ?? [])
  const [myActiveChallengesCount, setMyActiveChallengesCount] = useState(initial?.myActiveChallengesCount ?? 0)
  const [myLevel, setMyLevel] = useState<string | null>(initial?.myLevel ?? null)
  const [myWordCount, setMyWordCount] = useState<number | null>(initial?.myWordCount ?? null)
  const [minWordsToJoin, setMinWordsToJoin] = useState(initial?.minWordsToJoin ?? 20)
  const [stats, setStats] = useState<IcaChallengeStats | null>(null)
  const [isLoading, setIsLoading] = useState(!initial)
  const [isSavingEnrollment, setIsSavingEnrollment] = useState(false)
  const [isCreatingChallenge, setIsCreatingChallenge] = useState(false)
  const [isResponding, setIsResponding] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(initial?.currentUserId ?? null)
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
        setMyLevel(data.myLevel)
        setMyWordCount(data.myWordCount)
        setMinWordsToJoin(data.minWordsToJoin)
      } catch {
        setAvailableUsers([])
      }
    },
    [nativeLang, targetLang],
  )

  // La pantalla de «Cargando…» solo sale la primera vez (o al cambiar de idioma).
  // Después, al aceptar, rechazar o retar, los datos se actualizan por detrás sin
  // que la pantalla parpadee.
  const loadedKeyRef = useRef<string | null>(initial ? `${targetLang}|${nativeLang}` : null)

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

    const loadKey = `${targetLang}|${nativeLang}`
    const firstLoad = loadedKeyRef.current !== loadKey
    if (firstLoad) setIsLoading(true)
    setError(null)
    try {
      // La primera vez se aprovecha la precarga (si la hay); después, siempre datos nuevos.
      const data = await loadOverviewSnapshot(targetLang, nativeLang, !firstLoad)
      setCurrentUserId(data.currentUserId)
      setEnrollment(data.enrollment)
      setChallenges(data.challenges)
      setPlaysByChallengeId(data.playsByChallengeId)
      setUserProfiles(data.userProfiles)
      setChallengeTypes(data.challengeTypes)
      setAvailableUsers(data.availableUsers)
      setMyActiveChallengesCount(data.myActiveChallengesCount)
      setMyLevel(data.myLevel)
      setMyWordCount(data.myWordCount)
      setMinWordsToJoin(data.minWordsToJoin)
      // El aviso de la barra de abajo y la cabecera se pone al día.
      void refreshIcaChallengeAlerts(true)
      // El balance (racha de victorias) no bloquea la pantalla si falla.
      void fetchMyIcaChallengeStats()
        .then(setStats)
        .catch(() => setStats(null))
    } catch {
      setError(t('No pudimos cargar los desafíos ICA.'))
    } finally {
      loadedKeyRef.current = loadKey
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

  const createChallenge = useCallback(
    async (input: {
      challengeTypeId: string
      challengedUserId: string
      scope: IcaChallengeScope
      config: IcaOwnWordsChallengeConfig
      durationSeconds?: number
      extraSlot?: boolean
    }) => {
      if (!targetLang || !nativeLang) return
      setIsCreatingChallenge(true)
      try {
        await createIcaChallenge({
          challengeTypeId: input.challengeTypeId,
          challengedUserId: input.challengedUserId,
          scope: input.scope,
          targetLang,
          nativeLang,
          durationSeconds: input.durationSeconds,
          config: input.config,
          extraSlot: input.extraSlot,
        })
        await refresh()
      } finally {
        setIsCreatingChallenge(false)
      }
    },
    [nativeLang, refresh, targetLang],
  )

  const respondInvitation = useCallback(async (challengeId: string, accept: boolean) => {
    setIsResponding(true)
    // Se ve al momento: el reto sale de «Pendientes» sin esperar al servidor.
    setChallenges((previous) =>
      previous.map((challenge) =>
        challenge.id === challengeId
          ? {
              ...challenge,
              status: accept ? 'in_progress' : 'not_accepted',
              resultType: accept ? challenge.resultType : 'not_accepted',
            }
          : challenge,
      ),
    )
    try {
      await respondIcaChallengeInvitation(challengeId, accept)
      await refresh()
    } catch (respondError) {
      // Si falla (p. ej. el reto ya caducó), se vuelve a lo que diga el servidor.
      void refresh()
      throw respondError
    } finally {
      setIsResponding(false)
    }
  }, [refresh])

  const cancelInvitation = useCallback(async (challengeId: string) => {
    setIsCancelling(true)
    setChallenges((previous) =>
      previous.map((challenge) =>
        challenge.id === challengeId ? { ...challenge, status: 'cancelled', resultType: 'cancelled' } : challenge,
      ),
    )
    try {
      await cancelIcaChallengeInvitation(challengeId)
      await refresh()
    } catch (cancelError) {
      void refresh()
      throw cancelError
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
      myLevel,
      myWordCount,
      minWordsToJoin,
      stats,
      isLoading,
      isSavingEnrollment,
      isCreatingChallenge,
      isResponding,
      isCancelling,
      currentUserId,
      error,
      setEnrollmentActive,
      createChallenge,
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
      createChallenge,
      currentUserId,
      enrollment,
      error,
      isCreatingChallenge,
      isCancelling,
      isLoading,
      myActiveChallengesCount,
      myLevel,
      myWordCount,
      minWordsToJoin,
      stats,
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

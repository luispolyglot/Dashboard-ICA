import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useDashboardContext } from '../context/DashboardContext'
import { fetchMonthlySnapshotLeaderboard } from '../services/leaderboard'
import { fetchMyCoachingDashboard } from '../services/coaching'
import { closedMonthEfficacy } from './rankingMath'
import { shiftIsoDay } from '../utils'
import type { MedalCategory, MedalTier } from './medals'
import { medalText, TIER_ORDER } from './medals'
import { t } from '@/i18n'
import { useAuth } from '@/auth/AuthContext'
import { peekQuick, storeQuick } from '../services/quickCache'

// INSIGNIAS: catálogo del documento de logros de Luis + progreso calculado con datos reales.
// Todo es de lectura: no se guarda nada nuevo.

export type AchievementLevel = {
  tier: MedalTier
  /** Lo que hay que llegar a tener (días, %, palabras, victorias, veces 1.º o meses al 100 %). */
  value: number
  /** Texto de la cinta de la medalla. */
  ribbon: string
  /** Texto corto bajo la medalla. */
  caption: string
}

export type AchievementCategoryDef = {
  key: MedalCategory
  title: string
  description: string
  /** 8 niveles: bronce, plata, oro, rubí, diamante y Leyenda I, II y III. */
  levels: AchievementLevel[]
}

// Umbrales del 3 de octubre de 2026 (Luis): que el diamante cueste unos 6 meses haciéndolo muy
// bien en todas, y la Leyenda I más o menos un año. La Leyenda es un sexto nivel con tres pasos.
const days = (value: number) => ({ ribbon: `${value} DÍAS`, caption: `${value} días` })
const levelsOf = (values: number[], text: (value: number) => { ribbon: string; caption: string }) =>
  values.map((value, index) => ({ tier: TIER_ORDER[index], value, ...text(value) }))

export const ACHIEVEMENT_CATALOG: AchievementCategoryDef[] = [
  {
    key: 'rachaICA',
    title: 'Racha ICA',
    description: 'Días seguidos completando el ciclo ICA.',
    levels: levelsOf([7, 30, 60, 120, 200, 365, 730, 1000], days),
  },
  {
    key: 'rachaFlash',
    title: 'Racha Flashcards',
    description: 'Días seguidos acertando tus flashcards del día.',
    levels: levelsOf([7, 30, 60, 120, 200, 365, 730, 1000], days),
  },
  {
    key: 'ranking',
    title: 'Ranking mensual',
    description: 'Tu puesto en el ranking al cerrar el mes.',
    // En ranking, `value` es cuántas veces hay que quedar 1.º (bronce y plata: el puesto).
    levels: [
      { tier: 'bronce', value: 3, ribbon: '3.º', caption: 'Tercer puesto' },
      { tier: 'plata', value: 2, ribbon: '2.º', caption: 'Segundo puesto' },
      { tier: 'oro', value: 1, ribbon: '1.º', caption: 'Primer puesto' },
      { tier: 'rubi', value: 2, ribbon: '1.º ×2', caption: '1.º dos veces' },
      { tier: 'diamante', value: 3, ribbon: '1.º ×3', caption: '1.º tres veces' },
      { tier: 'leyenda1', value: 5, ribbon: '1.º ×5', caption: '1.º cinco veces' },
      { tier: 'leyenda2', value: 8, ribbon: '1.º ×8', caption: '1.º ocho veces' },
      { tier: 'leyenda3', value: 12, ribbon: '1.º ×12', caption: '1.º doce veces' },
    ],
  },
  {
    key: 'eficacia',
    title: 'Eficacia',
    description: 'Tus puntos del mes sobre el máximo posible.',
    // Hasta rubí: el mejor mes (%). Desde diamante: cuántos meses al 100 % (no hace falta seguidos).
    levels: [
      ...levelsOf([60, 70, 90, 100], (value) => ({ ribbon: `${value}%`, caption: `${value} %` })),
      { tier: 'diamante', value: 3, ribbon: '100% ×3', caption: '3 meses al 100 %' },
      { tier: 'leyenda1', value: 6, ribbon: '100% ×6', caption: '6 meses al 100 %' },
      { tier: 'leyenda2', value: 9, ribbon: '100% ×9', caption: '9 meses al 100 %' },
      { tier: 'leyenda3', value: 12, ribbon: '100% ×12', caption: '12 meses al 100 %' },
    ],
  },
  {
    key: 'vocab',
    title: 'Vocabulario ICA',
    description: 'Palabras en tu Baúl ICA.',
    levels: levelsOf([50, 100, 200, 500, 1000, 2000, 3000, 5000], (value) => ({ ribbon: `${value}`, caption: `${value} palabras` })),
  },
  {
    key: 'desafios',
    title: 'Desafíos ICA',
    description: 'Desafíos ICA ganados.',
    levels: levelsOf([10, 20, 50, 100, 200, 365, 600, 1000], (value) => ({ ribbon: `${value}`, caption: `${value} ganados` })),
  },
  {
    key: 'coaching',
    title: 'Coaching ICA',
    description: 'Anillos de tu coaching: cada semana con sus 6 tareas hechas cierra un anillo.',
    // Luis (6-7 Oct): up to Leyenda I, rings of your best coaching; Leyenda II and III count the
    // rings of all your coachings together (20 and 30).
    levels: [
      { tier: 'bronce', value: 4, ribbon: '4', caption: '4 anillos' },
      { tier: 'plata', value: 5, ribbon: '5', caption: '5 anillos' },
      { tier: 'oro', value: 6, ribbon: '6', caption: '6 anillos' },
      { tier: 'rubi', value: 8, ribbon: '8', caption: '8 anillos' },
      { tier: 'diamante', value: 9, ribbon: '9', caption: '9 anillos' },
      { tier: 'leyenda1', value: 10, ribbon: '10', caption: 'Los 10 anillos' },
      { tier: 'leyenda2', value: 20, ribbon: '20', caption: '20 anillos' },
      { tier: 'leyenda3', value: 30, ribbon: '30', caption: '30 anillos' },
    ],
  },
]

/** Coaching levels from this index on count the rings of all coachings (Leyenda II and III). */
const COACHING_TOTAL_FROM = 6

/** Cuántas insignias hay en total (7 categorías × 8 niveles). */
export const TOTAL_ACHIEVEMENTS = ACHIEVEMENT_CATALOG.reduce((sum, def) => sum + def.levels.length, 0)

/** Lo que llevas y lo que pide un nivel, para la barra de avance. */
export type AchievementGoal = { have: number; need: number }

export type AchievementProgress = {
  /** Valor actual (null si no se pudo calcular). */
  current: number | null
  /** Cuántos niveles se han conseguido (0-8: 5 rangos y 3 Leyendas). */
  earned: number
  /** Texto corto del progreso (perfil de otros icademers). */
  progressLabel: string
  /** Para cada nivel, lo que llevas y lo que pide (null si aún no hay datos). */
  goals: Array<AchievementGoal | null>
}

// ---------------------------------------------------------------------------
// Cálculos
// ---------------------------------------------------------------------------

/** Racha más larga de la historia (los días salvados mantienen la racha pero no suman). */
export function longestStreak(completedDays: string[], savedDays: string[] = []): number {
  const completed = new Set(completedDays)
  const continuity = new Set([...completedDays, ...savedDays])
  const sorted = [...continuity].sort()
  let best = 0
  let run = 0
  let previous: string | null = null
  for (const day of sorted) {
    const consecutive = previous !== null && shiftIsoDay(previous, 1) === day
    run = consecutive ? run : 0
    if (completed.has(day)) run += 1
    best = Math.max(best, run)
    previous = day
  }
  return best
}

type RemoteStats = {
  vocab: number | null
  wins: number | null
  bestAccuracy: number | null
  /** Meses cerrados con un 100 % de eficacia (no hace falta que sean seguidos). */
  perfectMonths?: number | null
  rankings: { first: number; second: number; third: number } | null
  /** Anillos del mejor coaching y anillos de todos tus coachings juntos. */
  coaching?: CoachingRingStats | null
}

export type CoachingRingStats = {
  bestRings: number
  totalRings: number
  /** false = never had a coaching, so the badge is locked. Missing (older server or cache) = unknown. */
  hasCoaching?: boolean
}

/** The Coaching ICA badge is only for coaching students: locked when we know the student never had one. */
export function isCoachingBadgeLocked(stats: CoachingRingStats | null | undefined): boolean {
  return stats?.hasCoaching === false
}

/** How many badges a student can earn (without the coaching ones when they are locked). */
export function reachableAchievements(coachingLocked: boolean): number {
  return ACHIEVEMENT_CATALOG.reduce(
    (sum, def) => sum + (coachingLocked && def.key === 'coaching' ? 0 : def.levels.length),
    0,
  )
}

/** Coaching rings of any student (the badge is public, like the others). */
export async function fetchCoachingRingStats(userId?: string | null): Promise<CoachingRingStats | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_coaching_ring_stats', userId ? { p_user_id: userId } : {})
  if (error || !data || typeof data !== 'object') return null
  const row = data as Record<string, unknown>
  return {
    bestRings: Number(row.bestRings) || 0,
    totalRings: Number(row.totalRings) || 0,
    ...(typeof row.hasCoaching === 'boolean' ? { hasCoaching: row.hasCoaching } : {}),
  }
}

/**
 * Your own coaching rings. If the server does not have get_coaching_ring_stats yet (it arrives with
 * the 6 Oct migration), the coaching list still says whether you ever had a coaching, so the
 * badge is locked for students who never had one.
 */
async function fetchMyCoachingRingStats(userId: string): Promise<CoachingRingStats | null> {
  const stats = await fetchCoachingRingStats(userId).catch(() => null)
  if (stats) return stats
  const memberships = await fetchMyCoachingDashboard().catch(() => null)
  return memberships && memberships.length === 0 ? { bestRings: 0, totalRings: 0, hasCoaching: false } : null
}

function monthStarts(fromIso: string, count: number): string[] {
  const now = new Date()
  const out: string[] = []
  for (let back = 1; back <= count; back += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    if (iso >= fromIso) out.push(iso)
  }
  return out
}

async function fetchRemoteStats(): Promise<RemoteStats> {
  const empty: RemoteStats = { vocab: null, wins: null, bestAccuracy: null, perfectMonths: null, rankings: null, coaching: null }
  if (!supabase) return empty
  const client = supabase
  const { data: session } = await client.auth.getSession()
  const userId = session.session?.user.id
  if (!userId) return empty

  const vocabPromise = client
    .from('lexicards')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .then(({ count, error }) => (error ? null : count ?? 0))

  const winsPromise = client
    .from('ica_challenges')
    .select('id', { count: 'exact', head: true })
    .eq('winner_user_id', userId)
    .then(({ count, error }) => (error ? null : count ?? 0))

  const [vocab, wins, monthly, coaching] = await Promise.all([
    vocabPromise,
    winsPromise,
    fetchRankingHistoryFor(userId),
    fetchMyCoachingRingStats(userId),
  ])
  return { vocab, wins, bestAccuracy: monthly.bestEfficacy, perfectMonths: monthly.perfectMonths, rankings: monthly.rankings, coaching }
}

/**
 * Ranking y eficacia de cualquier icademer: su fila en la foto de cada mes cerrado desde que
 * existe el ranking (mayo 2026). Eficacia = puntos conseguidos / puntos máximos del mes.
 * Lo usan tus insignias y el perfil de otro icademer en el ranking.
 */
export async function fetchRankingHistoryFor(
  userId: string,
): Promise<{ rankings: RemoteStats['rankings']; bestEfficacy: number | null; perfectMonths: number | null }> {
  // Hasta 4 años atrás: la Leyenda de ranking y de eficacia pide hasta 12 meses.
  const months = monthStarts('2026-05-01', 48)
  const stats = { first: 0, second: 0, third: 0 }
  let best: number | null = null
  let perfect = 0
  // Todos los meses a la vez (las fotos de cada mes se guardan en caché).
  const results = await Promise.all(
    months.map((start) => fetchMonthlySnapshotLeaderboard(start, 400).catch(() => null)),
  )
  const anyOk = results.some((rows) => rows !== null)
  for (const [index, rows] of results.entries()) {
    if (!rows) continue
    const row = rows.find((item) => item.user_id === userId)
    if (!row) continue
    if (row.rank === 1) stats.first += 1
    else if (row.rank === 2) stats.second += 1
    else if (row.rank === 3) stats.third += 1
    const efficacy = closedMonthEfficacy(row, months[index])
    best = best === null ? efficacy : Math.max(best, efficacy)
    if (efficacy >= 100) perfect += 1
  }
  return { rankings: anyOk ? stats : null, bestEfficacy: best, perfectMonths: anyOk ? perfect : null }
}

/** Datos con los que se calculan las insignias de otro icademer (null = no se sabe). */
export type AchievementValues = {
  rachaICA: number | null
  rachaFlash: number | null
  eficacia: number | null
  /** Meses al 100 % de eficacia (para el diamante y la Leyenda de eficacia). */
  perfectMonths?: number | null
  vocab: number | null
  desafios: number | null
  rankings: { first: number; second: number; third: number } | null
  /** Coaching: anillos del mejor coaching y de todos tus coachings (null = no se sabe). */
  coaching?: CoachingRingStats | null
}

/** Cuántos niveles tiene conseguidos en cada categoría (0-8), con los mismos umbrales que tus insignias. */
export function earnedLevelsFrom(values: AchievementValues): Record<MedalCategory, number> {
  const { byCategory } = computeAchievements(values)
  const out = {} as Record<MedalCategory, number>
  for (const def of ACHIEVEMENT_CATALOG) out[def.key] = byCategory[def.key].earned
  return out
}

let cachedStats: { at: number; promise: Promise<RemoteStats> } | null = null

function getRemoteStats(): Promise<RemoteStats> {
  if (cachedStats && Date.now() - cachedStats.at < 60_000) return cachedStats.promise
  cachedStats = { at: Date.now(), promise: fetchRemoteStats() }
  return cachedStats.promise
}

/** Calcula las insignias por detrás (al abrir la app), para que el perfil salga al momento. */
export function prefetchAchievementStats(userId: string | null | undefined): void {
  if (!userId) return
  void getRemoteStats()
    .then((stats) => storeQuick(`achievements:${userId}`, stats))
    .catch(() => undefined)
}

/** Lo que llevas para cada nivel de una categoría (null si aún no hay datos). */
function goalsFor(
  def: AchievementCategoryDef,
  current: number | null,
  perfectMonths: number | null,
  rankings: RemoteStats['rankings'],
  coaching: CoachingRingStats | null = null,
): Array<AchievementGoal | null> {
  return def.levels.map((level, index) => {
    if (def.key === 'coaching') {
      if (!coaching) return null
      return index >= COACHING_TOTAL_FROM
        ? { have: coaching.totalRings, need: level.value }
        : { have: coaching.bestRings, need: level.value }
    }
    if (def.key === 'ranking') {
      if (!rankings) return null
      // Bronce: acabar un mes en el top 3; plata: en el top 2; desde oro: veces 1.º.
      if (index === 0) return { have: Math.min(1, rankings.first + rankings.second + rankings.third), need: 1 }
      if (index === 1) return { have: Math.min(1, rankings.first + rankings.second), need: 1 }
      return { have: rankings.first, need: level.value }
    }
    if (def.key === 'eficacia' && index >= 4) {
      return perfectMonths === null ? null : { have: perfectMonths, need: level.value }
    }
    return current === null ? null : { have: current, need: level.value }
  })
}

function progressFor(
  def: AchievementCategoryDef,
  current: number | null,
  perfectMonths: number | null,
  rankings: RemoteStats['rankings'],
  coaching: CoachingRingStats | null = null,
): AchievementProgress {
  const goals = goalsFor(def, current, perfectMonths, rankings, coaching)
  // Los niveles van en orden: cuenta los conseguidos seguidos desde el bronce.
  let earned = 0
  while (earned < goals.length && goals[earned] && goals[earned]!.have >= goals[earned]!.need) earned += 1
  const known = goals.some((goal) => goal !== null)
  const next = def.levels[earned]
  const progressLabel = !known
    ? t('Calculando…')
    : next
      ? t('Siguiente: {next}', { next: medalText(next.caption) })
      : t('¡Todas conseguidas!')
  return { current, earned, progressLabel, goals }
}

/** Texto de la barra de avance: «41 / 60 días», «1 / 3 meses al 100 %»… */
export function goalText(def: AchievementCategoryDef, index: number, goal: AchievementGoal): string {
  const have = Math.min(goal.have, goal.need)
  if (def.key === 'ranking') {
    if (index === 0) return have >= 1 ? t('Un mes en el top 3') : t('Acaba un mes en el top 3')
    if (index === 1) return have >= 1 ? t('Un mes en el top 2') : t('Acaba un mes en el top 2')
    return t('{have} / {need} veces 1.º', { have, need: goal.need })
  }
  if (def.key === 'eficacia') {
    return index >= 4
      ? t('{have} / {need} meses al 100 %', { have, need: goal.need })
      : t('Tu mejor mes: {have} / {need} %', { have, need: goal.need })
  }
  if (def.key === 'vocab') return t('{have} / {need} palabras', { have, need: goal.need })
  if (def.key === 'desafios') return t('{have} / {need} ganados', { have, need: goal.need })
  if (def.key === 'coaching') {
    return index >= COACHING_TOTAL_FROM
      ? t('{have} / {need} anillos en todos tus coachings', { have, need: goal.need })
      : t('{have} / {need} anillos', { have, need: goal.need })
  }
  return t('{have} / {need} días seguidos', { have, need: goal.need })
}

/** Qué hay que hacer para conseguir esta insignia (va debajo de la barra de avance). */
export function unlockHint(def: AchievementCategoryDef, index: number, goal: AchievementGoal): string {
  const n = goal.need
  if (def.key === 'rachaICA') return t('Completa el ciclo ICA {n} días seguidos para desbloquear esta insignia.', { n })
  if (def.key === 'rachaFlash') return t('Acierta tus flashcards del día {n} días seguidos para desbloquear esta insignia.', { n })
  if (def.key === 'ranking') {
    if (index === 0) return t('Acaba un mes en el top 3 del ranking para desbloquear esta insignia.')
    if (index === 1) return t('Acaba un mes en el top 2 del ranking para desbloquear esta insignia.')
    if (index === 2) return t('Acaba un mes en el primer puesto del ranking para desbloquear esta insignia.')
    return t('Acaba {n} meses en el primer puesto del ranking (no hace falta que sean seguidos) para desbloquear esta insignia.', { n })
  }
  if (def.key === 'eficacia') {
    return index >= 4
      ? t('Completa {n} meses al 100 % de eficacia (no hace falta que sean seguidos) para desbloquear esta insignia.', { n })
      : t('Completa un mes con un {n} % de eficacia para desbloquear esta insignia.', { n })
  }
  if (def.key === 'vocab') return t('Llega a {n} palabras en tu Baúl ICA para desbloquear esta insignia.', { n })
  if (def.key === 'coaching') {
    return index >= COACHING_TOTAL_FROM
      ? t('Suma {n} anillos entre todos tus coachings para desbloquear esta insignia.', { n })
      : t('Es del Coaching ICA: completa {n} anillos en un mismo coaching (las 6 tareas de {n} semanas) para desbloquear esta insignia.', { n })
  }
  return t('Gana {n} desafíos ICA para desbloquear esta insignia.', { n })
}

/** Progreso de todas las categorías a partir de los datos (también lo usan las pruebas visuales). */
export function computeAchievements(values: AchievementValues): {
  byCategory: Record<MedalCategory, AchievementProgress>
  totalEarned: number
} {
  const byCategory = {} as Record<MedalCategory, AchievementProgress>
  let totalEarned = 0
  for (const def of ACHIEVEMENT_CATALOG) {
    const value =
      def.key === 'ranking' ? null : def.key === 'coaching' ? values.coaching?.bestRings ?? null : values[def.key]
    const progress = progressFor(def, value, values.perfectMonths ?? null, values.rankings, values.coaching ?? null)
    byCategory[def.key] = progress
    totalEarned += progress.earned
  }
  return { byCategory, totalEarned }
}

/** Progreso de cada categoría de insignias con los datos reales del alumno. */
export function useAchievements(): {
  byCategory: Record<MedalCategory, AchievementProgress>
  totalEarned: number
  loading: boolean
  /** True when the student never had a coaching: the Coaching ICA badges are shown locked. */
  coachingLocked: boolean
} {
  const { creationDays, savedCreationDays, completedDays } = useDashboardContext()
  const { user } = useAuth()
  const cacheKey = user?.id ? `achievements:${user.id}` : null
  // Lo último que se calculó sale al momento; se recalcula por detrás.
  const [remote, setRemote] = useState<RemoteStats | null>(() => (cacheKey ? peekQuick<RemoteStats>(cacheKey) ?? null : null))

  useEffect(() => {
    let active = true
    void getRemoteStats()
      .then((stats) => {
        if (!active) return
        setRemote(stats)
        if (cacheKey) storeQuick(cacheKey, stats)
      })
      .catch(() => {
        if (active) setRemote((previous) => previous ?? { vocab: null, wins: null, bestAccuracy: null, perfectMonths: null, rankings: null, coaching: null })
      })
    return () => {
      active = false
    }
  }, [cacheKey])

  return useMemo(() => {
    const { byCategory, totalEarned } = computeAchievements({
      rachaICA: longestStreak(creationDays ?? [], savedCreationDays ?? []),
      rachaFlash: longestStreak(completedDays ?? []),
      eficacia: remote?.bestAccuracy ?? null,
      perfectMonths: remote?.perfectMonths ?? null,
      vocab: remote?.vocab ?? null,
      desafios: remote?.wins ?? null,
      rankings: remote?.rankings ?? null,
      coaching: remote?.coaching ?? null,
    })
    return { byCategory, totalEarned, loading: remote === null, coachingLocked: isCoachingBadgeLocked(remote?.coaching) }
  }, [completedDays, creationDays, remote, savedCreationDays])
}

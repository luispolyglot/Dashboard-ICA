import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useDashboardContext } from '../context/DashboardContext'
import { fetchMonthlySnapshotLeaderboard } from '../services/leaderboard'
import { closedMonthEfficacy } from './rankingMath'
import { shiftIsoDay } from '../utils'
import type { MedalCategory, MedalTier } from './medals'
import { medalText, TIER_ORDER } from './medals'
import { t, tn } from '@/i18n'
import { useAuth } from '@/auth/AuthContext'
import { peekQuick, storeQuick } from '../services/quickCache'

// INSIGNIAS: catálogo del documento de logros de Luis + progreso calculado con datos reales.
// Todo es de lectura: no se guarda nada nuevo.

export type AchievementLevel = {
  tier: MedalTier
  /** Umbral numérico (días, %, entradas, victorias). En ranking: el puesto (3, 2, 1, 1, 1). */
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
  levels: AchievementLevel[]
}

const days = (value: number) => ({ ribbon: `${value} DÍAS`, caption: `${value} días` })

export const ACHIEVEMENT_CATALOG: AchievementCategoryDef[] = [
  {
    key: 'rachaICA',
    title: 'Racha ICA',
    description: 'Días seguidos completando el ciclo ICA (Inmersión, Creación y Activación).',
    levels: [7, 30, 90, 180, 360].map((value, index) => ({ tier: TIER_ORDER[index], value, ...days(value) })),
  },
  {
    key: 'rachaFlash',
    title: 'Racha Flashcards',
    description: 'Días seguidos acertando tus 10 flashcards del día.',
    levels: [7, 30, 90, 180, 360].map((value, index) => ({ tier: TIER_ORDER[index], value, ...days(value) })),
  },
  {
    key: 'ranking',
    title: 'Ranking mensual',
    description: 'Tu puesto en el ranking del mes al cerrarse el día 28.',
    levels: [
      { tier: 'bronce', value: 3, ribbon: '3.º', caption: 'Tercer puesto' },
      { tier: 'plata', value: 2, ribbon: '2.º', caption: 'Segundo puesto' },
      { tier: 'oro', value: 1, ribbon: '1.º', caption: 'Primer puesto' },
      { tier: 'rubi', value: 1, ribbon: '1.º ×2', caption: '1.º dos veces' },
      { tier: 'diamante', value: 1, ribbon: '1.º ×3', caption: '1.º tres veces' },
    ],
  },
  {
    key: 'eficacia',
    title: 'Eficacia',
    description:
      'Porcentaje de acción aplicada en un mes completo: los puntos del ranking que consigues entre los puntos máximos posibles del mes.',
    levels: [50, 65, 80, 90, 100].map((value, index) => ({
      tier: TIER_ORDER[index],
      value,
      ribbon: `${value}%`,
      caption: `${value} % de eficacia`,
    })),
  },
  {
    key: 'vocab',
    title: 'Vocabulario ICA',
    description: 'Palabras añadidas a tu Baúl ICA (en todos tus idiomas).',
    levels: [50, 100, 200, 500, 1000].map((value, index) => ({
      tier: TIER_ORDER[index],
      value,
      ribbon: `${value}`,
      caption: `${value} palabras`,
    })),
  },
  {
    key: 'desafios',
    title: 'Desafíos ICA',
    description: 'Desafíos ICA ganados.',
    levels: [10, 20, 50, 100, 200].map((value, index) => ({
      tier: TIER_ORDER[index],
      value,
      ribbon: `${value}`,
      caption: `${value} ganados`,
    })),
  },
]

export type AchievementProgress = {
  /** Valor actual (null si no se pudo calcular). */
  current: number | null
  /** Cuántos niveles se han conseguido (0-5). */
  earned: number
  /** Texto de progreso hacia el siguiente nivel. */
  progressLabel: string
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
  rankings: { first: number; second: number; third: number } | null
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
  const empty: RemoteStats = { vocab: null, wins: null, bestAccuracy: null, rankings: null }
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

  const [vocab, wins, monthly] = await Promise.all([vocabPromise, winsPromise, fetchRankingHistoryFor(userId)])
  return { vocab, wins, bestAccuracy: monthly.bestEfficacy, rankings: monthly.rankings }
}

/**
 * Ranking y eficacia de cualquier icademer: su fila en la foto de cada mes cerrado desde que
 * existe el ranking (mayo 2026). Eficacia = puntos conseguidos / puntos máximos del mes.
 * Lo usan tus insignias y el perfil de otro icademer en el ranking.
 */
export async function fetchRankingHistoryFor(
  userId: string,
): Promise<{ rankings: RemoteStats['rankings']; bestEfficacy: number | null }> {
  const months = monthStarts('2026-05-01', 12)
  const stats = { first: 0, second: 0, third: 0 }
  let best: number | null = null
  // Todos los meses a la vez (las fotos de cada mes se guardan en caché).
  const results = await Promise.all(
    months.map((start) => fetchMonthlySnapshotLeaderboard(start, 400).catch(() => null)),
  )
  const anyOk = results.some((rows) => rows !== null)
  for (const rows of results) {
    if (!rows) continue
    const row = rows.find((item) => item.user_id === userId)
    if (!row) continue
    if (row.rank === 1) stats.first += 1
    else if (row.rank === 2) stats.second += 1
    else if (row.rank === 3) stats.third += 1
    const efficacy = closedMonthEfficacy(row)
    best = best === null ? efficacy : Math.max(best, efficacy)
  }
  return { rankings: anyOk ? stats : null, bestEfficacy: best }
}

/** Datos con los que se calculan las insignias de otro icademer (null = no se sabe). */
export type AchievementValues = {
  rachaICA: number | null
  rachaFlash: number | null
  eficacia: number | null
  vocab: number | null
  desafios: number | null
  rankings: { first: number; second: number; third: number } | null
}

/** Cuántos rangos tiene conseguidos en cada categoría (0-5), con los mismos umbrales que tus insignias. */
export function earnedLevelsFrom(values: AchievementValues): Record<MedalCategory, number> {
  const out = {} as Record<MedalCategory, number>
  for (const def of ACHIEVEMENT_CATALOG) {
    const value = def.key === 'ranking' ? null : values[def.key]
    out[def.key] = progressFor(def, value, values.rankings).earned
  }
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

function progressFor(def: AchievementCategoryDef, current: number | null, rankings: RemoteStats['rankings']): AchievementProgress {
  if (def.key === 'ranking') {
    if (!rankings) return { current: null, earned: 0, progressLabel: t('Sin datos del ranking todavía') }
    const podium = rankings.first + rankings.second + rankings.third
    const earned =
      rankings.first >= 3 ? 5 : rankings.first >= 2 ? 4 : rankings.first >= 1 ? 3 : rankings.second >= 1 ? 2 : rankings.third >= 1 ? 1 : 0
    const label =
      podium === 0
        ? t('Aún sin podio. Termina el mes en el top 3.')
        : t('Podios: {first}× 1.º · {second}× 2.º · {third}× 3.º', {
            first: rankings.first,
            second: rankings.second,
            third: rankings.third,
          })
    return { current: podium, earned, progressLabel: label }
  }
  if (current === null) return { current: null, earned: 0, progressLabel: t('Calculando…') }
  const earned = def.levels.filter((level) => current >= level.value).length
  const next = def.levels[earned]
  const now =
    def.key === 'rachaICA' || def.key === 'rachaFlash'
      ? tn(current, 'Tu mejor racha: {n} día', 'Tu mejor racha: {n} días')
      : def.key === 'eficacia'
        ? t('Tu mejor mes: {n} % de eficacia', { n: current })
        : def.key === 'vocab'
          ? t('Llevas {n} palabras', { n: current })
          : t('Llevas {n} ganados', { n: current })
  const label = next
    ? t('{now} · siguiente: {next}', { now, next: medalText(next.caption) })
    : t('¡Todas conseguidas! {now}', { now })
  return { current, earned, progressLabel: label }
}

/** Progreso de cada categoría de insignias con los datos reales del alumno. */
export function useAchievements(): { byCategory: Record<MedalCategory, AchievementProgress>; totalEarned: number; loading: boolean } {
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
        if (active) setRemote((previous) => previous ?? { vocab: null, wins: null, bestAccuracy: null, rankings: null })
      })
    return () => {
      active = false
    }
  }, [cacheKey])

  return useMemo(() => {
    const values: Record<MedalCategory, number | null> = {
      rachaICA: longestStreak(creationDays, savedCreationDays),
      rachaFlash: longestStreak(completedDays),
      ranking: null,
      eficacia: remote?.bestAccuracy ?? null,
      vocab: remote?.vocab ?? null,
      desafios: remote?.wins ?? null,
    }
    const byCategory = {} as Record<MedalCategory, AchievementProgress>
    let totalEarned = 0
    for (const def of ACHIEVEMENT_CATALOG) {
      const progress = progressFor(def, values[def.key], remote?.rankings ?? null)
      byCategory[def.key] = progress
      totalEarned += progress.earned
    }
    return { byCategory, totalEarned, loading: remote === null }
  }, [completedDays, creationDays, remote, savedCreationDays])
}

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { todayKey } from '../utils'
import {
  CHALLENGE_WIN_REWARD,
  EXTRA_CHALLENGE_COST,
  PHASE_BOOST_COST,
  FLASH_STREAK_MILESTONES,
  STREAK_MILESTONES,
  rollCycleChest,
  type DailyLimitKey,
} from './rules'
import { uiLocale } from '@/i18n'
import { peekQuick, storeQuick } from '../services/quickCache'

// ICA COINS (en el código se siguen llamando "fichas")
// - El saldo REAL es el de siempre (get_my_preguntica_token_balance): lo que se gana
//   con el ranking del mes y se gasta en PreguntICA.
// - Lo nuevo (cofre del ciclo, hitos de racha y ampliar una fase) aún no existe en el
//   servidor. Mientras Nahuel no lo active, se guarda como "vista previa" en este
//   dispositivo y se suma al saldo real para poder probarlo con tus datos.

export type FichaPreviewEntry = {
  id: string
  /** day_boost: «Ampliar el día» antiguo (las tres fases a la vez). phase_boost: una fase. */
  type: 'cycle_chest' | 'streak_milestone' | 'flash_milestone' | 'day_boost' | 'phase_boost' | 'challenge_slot' | 'challenge_win'
  delta: number
  day: string
  createdAt: number
  milestoneDays?: number
  /** Solo en challenge_slot: ya se usó para un 4.º desafío. */
  used?: boolean
  /** Solo en challenge_win: el desafío ganado (para no darla dos veces). */
  challengeId?: string
  /** Solo en phase_boost: la fase ampliada. */
  phase?: DailyLimitKey
}

export const FICHAS_CHANGED_EVENT = 'ica:fichas-changed'
const PREVIEW_PREFIX = 'ica-fichas-preview-v1:'

function storageKey(userId: string | null | undefined): string {
  return `${PREVIEW_PREFIX}${userId || 'anon'}`
}

export function readPreviewEntries(userId: string | null | undefined): FichaPreviewEntry[] {
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    // Legacy dev-only "test coins" grants are ignored so local balances match real usage.
    return (parsed as Array<FichaPreviewEntry | { type: 'test_grant' }>).filter(
      (entry): entry is FichaPreviewEntry => entry.type !== 'test_grant',
    )
  } catch {
    return []
  }
}

function writePreviewEntries(userId: string | null | undefined, entries: FichaPreviewEntry[]): void {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(entries))
  } catch {
    // Sin almacenamiento: la vista previa dura hasta recargar.
  }
  window.dispatchEvent(new Event(FICHAS_CHANGED_EVENT))
}

function addEntry(userId: string | null | undefined, entry: Omit<FichaPreviewEntry, 'id' | 'createdAt'>) {
  const entries = readPreviewEntries(userId)
  entries.push({
    ...entry,
    id: `${entry.type}:${entry.day}:${entry.challengeId ?? entry.phase ?? ''}:${Date.now()}`,
    createdAt: Date.now(),
  })
  writePreviewEntries(userId, entries)
}

export function getPreviewDelta(entries: FichaPreviewEntry[]): number {
  return Math.round(entries.reduce((sum, entry) => sum + entry.delta, 0) * 100) / 100
}

export function hasClaimedCycleChest(entries: FichaPreviewEntry[], day = todayKey()): boolean {
  return entries.some((entry) => entry.type === 'cycle_chest' && entry.day === day)
}

/** ICA Coins que dio el cofre de hoy (0 si aún no se ha abierto). */
export function todayChestCoins(entries: FichaPreviewEntry[], day = todayKey()): number {
  return entries.find((entry) => entry.type === 'cycle_chest' && entry.day === day)?.delta ?? 0
}

export function claimCycleChest(userId: string | null | undefined): number {
  const day = todayKey()
  if (hasClaimedCycleChest(readPreviewEntries(userId), day)) return 0
  const coins = rollCycleChest()
  addEntry(userId, { type: 'cycle_chest', delta: coins, day })
  return coins
}

/** ¿Esta fase está ampliada hoy? (también con un «Ampliar el día» antiguo, que ampliaba las tres). */
export function hasPhaseBoost(entries: FichaPreviewEntry[], phase: DailyLimitKey, day = todayKey()): boolean {
  return entries.some(
    (entry) => entry.day === day && (entry.type === 'day_boost' || (entry.type === 'phase_boost' && entry.phase === phase)),
  )
}

/** Fases ampliadas hoy. */
export function phaseBoostsToday(entries: FichaPreviewEntry[], day = todayKey()): Record<DailyLimitKey, boolean> {
  return {
    words: hasPhaseBoost(entries, 'words', day),
    phrases: hasPhaseBoost(entries, 'phrases', day),
    activations: hasPhaseBoost(entries, 'activations', day),
  }
}

/** Amplía una fase solo hoy (PHASE_BOOST_COST ICA Coins). Si ya estaba ampliada, no cobra. */
export function buyPhaseBoost(userId: string | null | undefined, phase: DailyLimitKey, totalBalance: number): boolean {
  const day = todayKey()
  if (hasPhaseBoost(readPreviewEntries(userId), phase, day)) return true
  if (totalBalance < PHASE_BOOST_COST) return false
  addEntry(userId, { type: 'phase_boost', delta: -PHASE_BOOST_COST, day, phase })
  return true
}

type MilestoneType = 'streak_milestone' | 'flash_milestone'

export function claimedMilestones(entries: FichaPreviewEntry[], type: MilestoneType = 'streak_milestone'): Set<number> {
  return new Set(
    entries
      .filter((entry) => entry.type === type && entry.milestoneDays)
      .map((entry) => entry.milestoneDays as number),
  )
}

function claimMilestones(
  userId: string | null | undefined,
  streak: number,
  type: MilestoneType,
  milestones: ReadonlyArray<{ days: number; reward: number }>,
): number {
  const entries = readPreviewEntries(userId)
  const claimed = claimedMilestones(entries, type)
  let gained = 0
  for (const milestone of milestones) {
    if (streak >= milestone.days && !claimed.has(milestone.days)) {
      entries.push({
        id: `${type}:${milestone.days}`,
        type,
        delta: milestone.reward,
        day: todayKey(),
        createdAt: Date.now(),
        milestoneDays: milestone.days,
      })
      gained += milestone.reward
    }
  }
  if (gained > 0) writePreviewEntries(userId, entries)
  return gained
}

/** Cobra los hitos de racha ICA alcanzados que aún no se cobraron. Devuelve las ICA Coins ganadas. */
export function claimReachedMilestones(userId: string | null | undefined, bestStreak: number): number {
  return claimMilestones(userId, bestStreak, 'streak_milestone', STREAK_MILESTONES)
}

/** Lo mismo con la racha de flashcards (7 → 1, 30 → 3, 90 → 5, 180 → 10, 360 → 20). */
export function claimReachedFlashMilestones(userId: string | null | undefined, streak: number): number {
  return claimMilestones(userId, streak, 'flash_milestone', FLASH_STREAK_MILESTONES)
}

// ---------------------------------------------------------------------------
// Desafío extra (4.º desafío activo) por EXTRA_CHALLENGE_COST ICA Coins
// ---------------------------------------------------------------------------

/** Cada desafío ICA ganado da {CHALLENGE_WIN_REWARD} ICA Coin (una sola vez por desafío). Devuelve true si se ha dado ahora. */
export function claimChallengeWinCoin(userId: string | null | undefined, challengeId: string): boolean {
  if (!userId || !challengeId) return false
  const entries = readPreviewEntries(userId)
  if (entries.some((entry) => entry.type === 'challenge_win' && entry.challengeId === challengeId)) return false
  addEntry(userId, { type: 'challenge_win', delta: CHALLENGE_WIN_REWARD, day: todayKey(), challengeId })
  return true
}

/** Pases de «desafío extra» comprados y aún sin usar. */
export function unusedChallengeSlots(entries: FichaPreviewEntry[]): number {
  return entries.filter((entry) => entry.type === 'challenge_slot' && !entry.used).length
}

/** Compra un pase de desafío extra. false si no hay saldo. */
export function buyChallengeSlot(userId: string | null | undefined, totalBalance: number): boolean {
  if (totalBalance < EXTRA_CHALLENGE_COST) return false
  addEntry(userId, { type: 'challenge_slot', delta: -EXTRA_CHALLENGE_COST, day: todayKey(), used: false })
  return true
}

/** Gasta un pase ya comprado (al retar o aceptar a la 4.ª persona). */
export function consumeChallengeSlot(userId: string | null | undefined): boolean {
  const entries = readPreviewEntries(userId)
  const slot = entries.find((entry) => entry.type === 'challenge_slot' && !entry.used)
  if (!slot) return false
  slot.used = true
  writePreviewEntries(userId, entries)
  return true
}

// ---------------------------------------------------------------------------
// Hook: saldo real + vista previa
// ---------------------------------------------------------------------------

export type FichasState = {
  /** Saldo del servidor (null mientras carga o si falla). */
  realBalance: number | null
  /** Lo ganado/gastado en vista previa en este dispositivo. */
  previewDelta: number
  /** Lo que se muestra: real + vista previa, en número entero y nunca negativo. */
  total: number | null
  entries: FichaPreviewEntry[]
  refresh: () => void
}

let balanceRequest: Promise<number | null> | null = null
let balanceRequestAt = 0

async function fetchRealBalance(): Promise<number | null> {
  if (!supabase) return null
  const now = Date.now()
  if (balanceRequest && now - balanceRequestAt < 1500) return balanceRequest
  balanceRequestAt = now
  const client = supabase
  balanceRequest = (async () => {
    const { data, error } = await client.rpc('get_my_preguntica_token_balance')
    if (error) return null
    return Number(data || 0)
  })()
  return balanceRequest
}

export function useFichas(userId: string | null | undefined): FichasState {
  // El último saldo conocido sale al momento; el del servidor llega por detrás.
  const [realBalance, setRealBalance] = useState<number | null>(() =>
    userId ? peekQuick<number>(`coins:${userId}`) ?? null : null,
  )
  const [entries, setEntries] = useState<FichaPreviewEntry[]>(() => readPreviewEntries(userId))

  const refresh = useCallback(() => {
    setEntries(readPreviewEntries(userId))
    void fetchRealBalance().then((value) => {
      if (value === null) return
      setRealBalance(value)
      if (userId) storeQuick(`coins:${userId}`, value)
    })
  }, [userId])

  useEffect(() => {
    refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const onLocalChange = () => setEntries(readPreviewEntries(userId))
    window.addEventListener(FICHAS_CHANGED_EVENT, onLocalChange)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener(FICHAS_CHANGED_EVENT, onLocalChange)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh, userId])

  const previewDelta = getPreviewDelta(entries)
  return {
    realBalance,
    previewDelta,
    total: realBalance === null ? null : toWholeFichas(realBalance + previewDelta),
    entries,
    refresh,
  }
}

/**
 * Ranking del mes: el servidor da tus puntos ÷ 10 con decimales. Se enseñan las ICA Coins
 * enteras y lo que sobra (p. ej. 0,6) es la barrita hacia la siguiente: no se pierde.
 * Devuelve cuánto llevas de la próxima (de 0 a 1).
 */
export function nextCoinProgress(realBalance: number | null): number {
  if (realBalance === null || !Number.isFinite(realBalance) || realBalance < 0) return 0
  return Math.max(0, Math.min(0.999, realBalance - Math.floor(realBalance + 1e-9)))
}

/** Las fichas siempre se muestran enteras y nunca en negativo. */
export function toWholeFichas(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value + 1e-9))
}

// Se crea al formatear para usar el idioma de la interfaz.
export const fichasFormatter = {
  format: (value: number): string => new Intl.NumberFormat(uiLocale(), { maximumFractionDigits: 0 }).format(value),
}

/** «1 ICA Coin», «5 ICA Coins». Las fichas se llaman ICA Coins en la app. */
export function coinsText(value: number): string {
  return `${fichasFormatter.format(value)} ICA ${value === 1 ? 'Coin' : 'Coins'}`
}

// ---------------------------------------------------------------------------
// MONEDAS "EN CAMINO": al abrir el cofre las ICA Coins ya están guardadas, pero el
// contador de arriba no las suma hasta que pulsas «Recoger mis ICA Coins» (y vuelan allí).
// ---------------------------------------------------------------------------

const HELD_EVENT = 'ica:fichas-held'
let heldCoins = 0

/** Esconde del contador de arriba `amount` ICA Coins hasta que se recojan. */
export function holdCoinsDisplay(amount: number): void {
  heldCoins = Math.max(0, amount)
  window.dispatchEvent(new Event(HELD_EVENT))
}

/** Suelta las ICA Coins escondidas: el contador las suma (de una en una, con un poco de ritmo). */
export function releaseCoinsDisplay(stepMs = 90): void {
  if (heldCoins <= 0) return
  const tick = () => {
    heldCoins = Math.max(0, heldCoins - 1)
    window.dispatchEvent(new Event(HELD_EVENT))
    if (heldCoins > 0) window.setTimeout(tick, stepMs)
  }
  tick()
}

/** Cuántas ICA Coins están "en camino" (aún no sumadas en el contador). */
export function useHeldCoins(): number {
  const [held, setHeld] = useState(heldCoins)
  useEffect(() => {
    const onChange = () => setHeld(heldCoins)
    window.addEventListener(HELD_EVENT, onChange)
    return () => window.removeEventListener(HELD_EVENT, onChange)
  }, [])
  return held
}

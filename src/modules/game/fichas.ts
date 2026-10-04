import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { todayKey } from '../utils'
import type { DailyLimitKey } from './rules'
import { uiLocale } from '@/i18n'
import { peekQuick, storeQuick } from '../services/quickCache'
import { gameSfx } from './sfx'

// ICA Coins tienen una única fuente de verdad: preguntica_token_ledger en Supabase.
// El estado local solo conserva una copia rápida de lectura y nunca acredita ni gasta monedas.

export type IcaCoinEntry = {
  id: string
  type:
    | 'monthly_earn'
    | 'redeem_unlock'
    | 'manual_adjustment'
    | 'cycle_chest'
    | 'streak_milestone'
    | 'flash_milestone'
    | 'phase_boost'
    | 'challenge_slot'
    | 'challenge_win'
  delta: number
  day: string
  createdAt: number
  milestoneDays?: number
  used?: boolean
  challengeId?: string
  phase?: DailyLimitKey
  rolled?: number
}

export type IcaCoinsServerState = {
  balance: number
  today: string
  chestOpened: boolean
  chestCoins: number
  chestRolled: number | null
  phaseBoosts: DailyLimitKey[]
  unusedPasses: number
  claimedIcaMilestones: number[]
  claimedFlashMilestones: number[]
  challengeWinsThisWeek: number
  icaStreak: number
  flashStreak: number
  usageToday: Record<DailyLimitKey, number>
  entries: IcaCoinEntry[]
}

export const FICHAS_CHANGED_EVENT = 'ica:fichas-changed'
const STATE_CACHE_PREFIX = 'ica-coins-state:'

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function numeric(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseEntry(value: unknown): IcaCoinEntry | null {
  const row = objectValue(value)
  if (!row || typeof row.id !== 'string' || typeof row.type !== 'string') return null
  const allowed = new Set([
    'monthly_earn', 'redeem_unlock', 'manual_adjustment', 'cycle_chest', 'streak_milestone',
    'flash_milestone', 'phase_boost', 'challenge_slot', 'challenge_win',
  ])
  if (!allowed.has(row.type)) return null
  return {
    id: row.id,
    type: row.type as IcaCoinEntry['type'],
    delta: numeric(row.delta),
    day: typeof row.day === 'string' ? row.day : '',
    createdAt: numeric(row.createdAt),
    ...(row.milestoneDays == null ? {} : { milestoneDays: numeric(row.milestoneDays) }),
    ...(row.used == null ? {} : { used: Boolean(row.used) }),
    ...(typeof row.challengeId === 'string' ? { challengeId: row.challengeId } : {}),
    ...(row.phase === 'words' || row.phase === 'phrases' || row.phase === 'activations'
      ? { phase: row.phase }
      : {}),
    ...(row.rolled == null ? {} : { rolled: numeric(row.rolled) }),
  }
}

function parseState(value: unknown): IcaCoinsServerState | null {
  const row = objectValue(value)
  if (!row || typeof row.today !== 'string') return null
  const strings = (value: unknown): DailyLimitKey[] =>
    Array.isArray(value)
      ? value.filter((item): item is DailyLimitKey => item === 'words' || item === 'phrases' || item === 'activations')
      : []
  const numbers = (value: unknown): number[] =>
    Array.isArray(value) ? value.map((item) => numeric(item)).filter((item) => item > 0) : []
  return {
    balance: numeric(row.balance),
    today: row.today,
    chestOpened: Boolean(row.chestOpened),
    chestCoins: numeric(row.chestCoins),
    chestRolled: row.chestRolled == null ? null : numeric(row.chestRolled),
    phaseBoosts: strings(row.phaseBoosts),
    unusedPasses: numeric(row.unusedPasses),
    claimedIcaMilestones: numbers(row.claimedIcaMilestones),
    claimedFlashMilestones: numbers(row.claimedFlashMilestones),
    challengeWinsThisWeek: numeric(row.challengeWinsThisWeek),
    icaStreak: numeric(row.icaStreak),
    flashStreak: numeric(row.flashStreak),
    usageToday: (() => {
      const usage = objectValue(row.usageToday)
      return {
        words: numeric(usage?.words),
        phrases: numeric(usage?.phrases),
        activations: numeric(usage?.activations),
      }
    })(),
    entries: Array.isArray(row.entries)
      ? row.entries.map(parseEntry).filter((entry): entry is IcaCoinEntry => entry !== null)
      : [],
  }
}

export function signalIcaCoinsStateChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(FICHAS_CHANGED_EVENT))
}

function rpcError(error: { message?: string } | null): never {
  throw new Error(error?.message || 'ICA_COINS_REQUEST_FAILED')
}

export async function loadIcaCoinsState(userId?: string | null): Promise<IcaCoinsServerState | null> {
  if (!supabase || !userId) return null
  const { data, error } = await supabase.rpc('get_my_ica_coins_state')
  if (error) rpcError(error)
  const state = parseState(data)
  if (!state) throw new Error('ICA_COINS_STATE_INVALID')
  storeQuick(`${STATE_CACHE_PREFIX}${userId}`, state)
  return state
}

async function callCoinRpc(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED')
  const { data, error } = await supabase.rpc(name, args)
  if (error) rpcError(error)
  const row = objectValue(data)
  if (!row) throw new Error('ICA_COINS_RESPONSE_INVALID')
  signalIcaCoinsStateChanged()
  return row
}

export function hasClaimedCycleChest(entries: IcaCoinEntry[], day = todayKey()): boolean {
  return entries.some((entry) => entry.type === 'cycle_chest' && entry.day === day)
}

export function todayChestCoins(entries: IcaCoinEntry[], day = todayKey()): number {
  return entries.find((entry) => entry.type === 'cycle_chest' && entry.day === day)?.delta ?? 0
}

export function hasPhaseBoost(entries: IcaCoinEntry[], phase: DailyLimitKey, day = todayKey()): boolean {
  return entries.some((entry) => entry.day === day && entry.type === 'phase_boost' && entry.phase === phase)
}

export function phaseBoostsToday(entries: IcaCoinEntry[], day = todayKey()): Record<DailyLimitKey, boolean> {
  return {
    words: hasPhaseBoost(entries, 'words', day),
    phrases: hasPhaseBoost(entries, 'phrases', day),
    activations: hasPhaseBoost(entries, 'activations', day),
  }
}

export function claimedMilestones(
  entries: IcaCoinEntry[],
  type: 'streak_milestone' | 'flash_milestone' = 'streak_milestone',
): Set<number> {
  return new Set(entries.filter((entry) => entry.type === type && entry.milestoneDays).map((entry) => entry.milestoneDays!))
}

export function challengeWinCoinsThisWeek(entries: IcaCoinEntry[]): number {
  return entries
    .filter((entry) => entry.type === 'challenge_win')
    .reduce((sum, entry) => sum + entry.delta, 0)
}

export function unusedChallengeSlots(entries: IcaCoinEntry[]): number {
  return entries.filter((entry) => entry.type === 'challenge_slot' && !entry.used).length
}

export type ChestResult = { coins: number; rolled: number; alreadyOpened?: boolean }

export async function claimCycleChest(_userId?: string | null): Promise<ChestResult> {
  const result = await callCoinRpc('claim_cycle_chest')
  return {
    coins: numeric(result.coins),
    rolled: numeric(result.rolled),
    alreadyOpened: Boolean(result.alreadyOpened),
  }
}

export async function claimReachedMilestones(_userId?: string | null, _clientStreak?: number): Promise<number> {
  const result = await callCoinRpc('claim_streak_milestones', { p_kind: 'ica' })
  return numeric(result.gained)
}

export async function claimReachedFlashMilestones(_userId?: string | null, _clientStreak?: number): Promise<number> {
  const result = await callCoinRpc('claim_streak_milestones', { p_kind: 'flashcards' })
  return numeric(result.gained)
}

export async function buyPhaseBoost(
  _userId: string | null | undefined,
  phase: DailyLimitKey,
  _clientBalance?: number,
): Promise<boolean> {
  const result = await callCoinRpc('buy_phase_boost', { p_phase: phase })
  if (result.ok && !result.alreadyOwned) gameSfx.spend()
  return Boolean(result.ok)
}

export async function buyChallengeSlot(
  _userId: string | null | undefined,
  _clientBalance?: number,
): Promise<boolean> {
  const result = await callCoinRpc('buy_challenge_pass')
  if (result.ok && !result.alreadyOwned) gameSfx.spend()
  return Boolean(result.ok)
}

export function walletRoom(total: number): number {
  return Math.max(0, 100 - Math.max(0, Math.floor(total)))
}

/** Lunes de la semana local ISO indicada; se usa solo para presentación/pruebas. */
export function weekStartKey(day: string): string {
  const date = new Date(`${day}T12:00:00Z`)
  const weekday = date.getUTCDay()
  date.setUTCDate(date.getUTCDate() - ((weekday + 6) % 7))
  return date.toISOString().slice(0, 10)
}

export type FichasState = {
  realBalance: number | null
  total: number | null
  entries: IcaCoinEntry[]
  today: string
  chestOpened: boolean
  chestCoins: number
  chestRolled: number | null
  phaseBoosts: Record<DailyLimitKey, boolean>
  unusedPasses: number
  claimedIcaMilestones: Set<number>
  claimedFlashMilestones: Set<number>
  challengeWinsThisWeek: number
  icaStreak: number
  flashStreak: number
  usageToday: Record<DailyLimitKey, number>
  refresh: () => Promise<IcaCoinsServerState | null>
}

export function useFichas(userId: string | null | undefined): FichasState {
  const [serverState, setServerState] = useState<IcaCoinsServerState | null>(() =>
    userId ? peekQuick<IcaCoinsServerState>(`${STATE_CACHE_PREFIX}${userId}`) ?? null : null,
  )

  const refresh = useCallback(async () => {
    if (!userId) {
      setServerState(null)
      return null
    }
    try {
      const next = await loadIcaCoinsState(userId)
      setServerState(next)
      return next
    } catch {
      return null
    }
  }, [userId])

  useEffect(() => {
    setServerState(userId ? peekQuick<IcaCoinsServerState>(`${STATE_CACHE_PREFIX}${userId}`) ?? null : null)
    void refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener(FICHAS_CHANGED_EVENT, onVisible)
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener(FICHAS_CHANGED_EVENT, onVisible)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh, userId])

  const entries = serverState?.entries ?? []
  return {
    realBalance: serverState?.balance ?? null,
    total: serverState ? toWholeFichas(serverState.balance) : null,
    entries,
    today: serverState?.today ?? todayKey(),
    chestOpened: serverState?.chestOpened ?? false,
    chestCoins: serverState?.chestCoins ?? 0,
    chestRolled: serverState?.chestRolled ?? null,
    phaseBoosts: phaseBoostsToday(entries, serverState?.today),
    unusedPasses: serverState?.unusedPasses ?? 0,
    claimedIcaMilestones: new Set(serverState?.claimedIcaMilestones ?? []),
    claimedFlashMilestones: new Set(serverState?.claimedFlashMilestones ?? []),
    challengeWinsThisWeek: serverState?.challengeWinsThisWeek ?? 0,
    icaStreak: serverState?.icaStreak ?? 0,
    flashStreak: serverState?.flashStreak ?? 0,
    usageToday: serverState?.usageToday ?? { words: 0, phrases: 0, activations: 0 },
    refresh,
  }
}

/** El saldo se muestra entero; el decimal del ranking se conserva en el ledger. */
export function toWholeFichas(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value + 1e-9))
}

export function nextCoinProgress(realBalance: number | null): number {
  if (realBalance === null || !Number.isFinite(realBalance) || realBalance < 0) return 0
  return Math.max(0, Math.min(0.999, realBalance - Math.floor(realBalance + 1e-9)))
}

export const fichasFormatter = {
  format: (value: number): string => new Intl.NumberFormat(uiLocale(), { maximumFractionDigits: 0 }).format(value),
}

export function coinsText(value: number): string {
  return `${fichasFormatter.format(value)} ICA ${value === 1 ? 'Coin' : 'Coins'}`
}

const HELD_EVENT = 'ica:fichas-held'
let heldCoins = 0

export function holdCoinsDisplay(amount: number): void {
  heldCoins = Math.max(0, amount)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(HELD_EVENT))
}

export function releaseCoinsDisplay(stepMs = 90): void {
  if (heldCoins <= 0) return
  const tick = () => {
    heldCoins = Math.max(0, heldCoins - 1)
    window.dispatchEvent(new Event(HELD_EVENT))
    if (heldCoins > 0) window.setTimeout(tick, stepMs)
  }
  tick()
}

export function useHeldCoins(): number {
  const [held, setHeld] = useState(heldCoins)
  useEffect(() => {
    const onChange = () => setHeld(heldCoins)
    window.addEventListener(HELD_EVENT, onChange)
    return () => window.removeEventListener(HELD_EVENT, onChange)
  }, [])
  return held
}

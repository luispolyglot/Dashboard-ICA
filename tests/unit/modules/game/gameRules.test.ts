import { afterEach, describe, expect, it, vi } from 'vitest'
import { longestStreak } from '../../../../src/modules/game/achievements'
import {
  challengeWinCoinsThisWeek,
  claimedMilestones,
  hasPhaseBoost,
  nextCoinProgress,
  phaseBoostsToday,
  toWholeFichas,
  unusedChallengeSlots,
  walletRoom,
  weekStartKey,
  type IcaCoinEntry,
} from '../../../../src/modules/game/fichas'
import { dailyGameModeFor, DAILY_GAME_MODES } from '../../../../src/modules/game/dailyGame'
import { shortName } from '../../../../src/modules/game/ranking'
import { CYCLE_CHEST_ODDS, rollCycleChest, STREAK_MILESTONES } from '../../../../src/modules/game/rules'
import { getIcaStreakState, isIcaCycleDone } from '../../../../src/modules/game/streak'
import { countActivatedWords } from '../../../../src/modules/game/useActivatedWords'
import type { DailyProgressEntry, Lexicard } from '../../../../src/modules/types'

function progress(partial: Partial<DailyProgressEntry> = {}): DailyProgressEntry {
  return {
    wordsAdded: 0,
    phraseGenerated: false,
    reviewCorrect: 0,
    voiceActivationsCount: 0,
    ...partial,
  }
}

function entry(partial: Partial<IcaCoinEntry> & Pick<IcaCoinEntry, 'id' | 'type'>): IcaCoinEntry {
  return { delta: 0, day: '2026-10-05', createdAt: 0, ...partial }
}

describe('modo juego: reglas y estado de ICA Coins del servidor', () => {
  afterEach(() => vi.useRealTimers())

  it('el ciclo ICA pide 5 palabras, 1 frase y 1 activación', () => {
    expect(isIcaCycleDone(progress({ wordsAdded: 5, phraseGenerated: true, voiceActivationsCount: 1 }))).toBe(true)
    expect(isIcaCycleDone(progress({ wordsAdded: 4, phraseGenerated: true, voiceActivationsCount: 1 }))).toBe(false)
    expect(isIcaCycleDone(progress({ wordsAdded: 5, phraseGenerated: true, voiceActivationsCount: 0 }))).toBe(false)
  })

  it('la racha cuenta el ciclo de hoy aunque el servidor tarde en refrescar el ranking', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-30T10:00:00Z'))
    const base = {
      creationDays: ['2026-09-28', '2026-09-29'],
      savedCreationDays: [],
      creationSavesUsedThisMonth: 0,
      creationSavesLimit: 2,
    }
    expect(getIcaStreakState({ ...base, todayProgress: progress() }).streak).toBe(2)
    const done = getIcaStreakState({
      ...base,
      todayProgress: progress({ wordsAdded: 5, phraseGenerated: true, voiceActivationsCount: 1 }),
    })
    expect(done.streak).toBe(3)
    expect(done.cycleDoneToday).toBe(true)
  })

  it('los días salvados mantienen continuidad sin sumar como día completado', () => {
    expect(longestStreak(['2026-09-01', '2026-09-02', '2026-09-04'], ['2026-09-03'])).toBe(3)
    expect(longestStreak(['2026-09-01', '2026-09-02', '2026-09-04'])).toBe(2)
  })

  it('el cofre conserva las probabilidades 40/30/20/8/2', () => {
    expect(CYCLE_CHEST_ODDS.reduce((sum, [, percent]) => sum + percent, 0)).toBe(100)
    expect(rollCycleChest(() => 0)).toBe(1)
    expect(rollCycleChest(() => 0.399)).toBe(1)
    expect(rollCycleChest(() => 0.4)).toBe(2)
    expect(rollCycleChest(() => 0.699)).toBe(2)
    expect(rollCycleChest(() => 0.7)).toBe(3)
    expect(rollCycleChest(() => 0.899)).toBe(3)
    expect(rollCycleChest(() => 0.9)).toBe(4)
    expect(rollCycleChest(() => 0.979)).toBe(4)
    expect(rollCycleChest(() => 0.98)).toBe(5)
  })

  it('las ampliaciones se leen de las entradas del servidor y se limitan a hoy y a su fase', () => {
    const entries = [entry({ id: 'boost-1', type: 'phase_boost', phase: 'words', day: '2026-10-05', delta: -15 })]
    expect(hasPhaseBoost(entries, 'words', '2026-10-05')).toBe(true)
    expect(hasPhaseBoost(entries, 'phrases', '2026-10-05')).toBe(false)
    expect(phaseBoostsToday(entries, '2026-10-05')).toEqual({ words: true, phrases: false, activations: false })
    expect(hasPhaseBoost(entries, 'words', '2026-10-06')).toBe(false)
  })

  it('los hitos se identifican por tipo y se conceden una sola vez en el ledger', () => {
    const entries = [
      entry({ id: 'milestone-7', type: 'streak_milestone', milestoneDays: 7, delta: 2 }),
      entry({ id: 'flash-7', type: 'flash_milestone', milestoneDays: 7, delta: 1 }),
    ]
    expect(claimedMilestones(entries, 'streak_milestone')).toEqual(new Set([7]))
    expect(claimedMilestones(entries, 'flash_milestone')).toEqual(new Set([7]))
    expect(STREAK_MILESTONES.map((milestone) => milestone.days)).toEqual([7, 30, 90, 180, 360])
  })

  it('el máximo de premios por desafío se expone desde el total calculado por servidor', () => {
    const entries = [
      ...Array.from({ length: 7 }, (_, index) => entry({ id: `win-${index}`, type: 'challenge_win', delta: 1 })),
      entry({ id: 'capped-win', type: 'challenge_win', delta: 0 }),
    ]
    expect(challengeWinCoinsThisWeek(entries)).toBe(7)
  })

  it('los pases disponibles y usados se leen de los registros asociados al ledger', () => {
    const entries = [
      entry({ id: 'pass-a', type: 'challenge_slot', delta: -15, used: false }),
      entry({ id: 'pass-b', type: 'challenge_slot', delta: -15, used: true }),
    ]
    expect(unusedChallengeSlots(entries)).toBe(1)
  })

  it('el tope selectivo nunca calcula espacio negativo cuando el saldo supera 100', () => {
    expect(walletRoom(0)).toBe(100)
    expect(walletRoom(97)).toBe(3)
    expect(walletRoom(100)).toBe(0)
    expect(walletRoom(140)).toBe(0)
  })

  it('la semana empieza el lunes', () => {
    expect(weekStartKey('2026-09-30')).toBe('2026-09-28')
    expect(weekStartKey('2026-10-04')).toBe('2026-09-28')
    expect(weekStartKey('2026-10-05')).toBe('2026-10-05')
  })

  it('las flashcards cuentan palabras activadas desde el Baúl y el MetaTracker', () => {
    const cards = [
      { id: 'a', activationCount: 2 },
      { id: 'b', activationCount: 0 },
      { id: 'c', activationCount: 1 },
    ] as Lexicard[]
    expect(countActivatedWords(cards)).toBe(2)
    expect(countActivatedWords(cards, 21)).toBe(21)
    expect(countActivatedWords(cards, null)).toBe(2)
  })

  it('el saldo visible es entero y el remanente del ranking se conserva como progreso', () => {
    expect(toWholeFichas(3.6)).toBe(3)
    expect(toWholeFichas(-8.92)).toBe(0)
    expect(nextCoinProgress(3.6)).toBeCloseTo(0.6)
    expect(nextCoinProgress(4)).toBe(0)
    expect(nextCoinProgress(-1.2)).toBe(0)
    expect(nextCoinProgress(null)).toBe(0)
  })

  it('el reto del día sigue el calendario del mes, igual para todos', () => {
    const kinds = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'].map((day) => dailyGameModeFor(day).kind)
    expect(kinds).toEqual(['speak', 'listen', 'write', 'choice', 'pairs'])
    expect(new Set(kinds).size).toBe(DAILY_GAME_MODES.length)
    expect(dailyGameModeFor('2026-10-06').kind).toBe('speak')
    expect(dailyGameModeFor('2026-11-01').kind).toBe('speak')
    expect(dailyGameModeFor('2026-10-31').kind).toBe('speak')
  })

  it('el nombre corto conserva sitio para la insignia del ranking', () => {
    expect(shortName('Ana García')).toBe('Ana G.')
    expect(shortName('Luis González Gómez')).toBe('Luis G.')
    expect(shortName('Tomasz')).toBe('Tomasz')
    expect(shortName('  ')).toBe('Usuario')
  })
})

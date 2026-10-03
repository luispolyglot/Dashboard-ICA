import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { longestStreak } from '../../../../src/modules/game/achievements'
import {
  buyChallengeSlot,
  buyPhaseBoost,
  challengeWinCoinsThisWeek,
  claimChallengeWinCoin,
  claimCycleChest,
  claimReachedFlashMilestones,
  claimReachedMilestones,
  consumeChallengeSlot,
  getPreviewDelta,
  hasPhaseBoost,
  phaseBoostsToday,
  nextCoinProgress,
  nextPhaseBoostPrice,
  readPreviewEntries,
  walletRoom,
  weekStartKey,
  toWholeFichas,
  unusedChallengeSlots,
} from '../../../../src/modules/game/fichas'
import { dailyGameModeFor, DAILY_GAME_MODES } from '../../../../src/modules/game/dailyGame'
import { shortName } from '../../../../src/modules/game/ranking'
import { CYCLE_CHEST_ODDS, rollCycleChest } from '../../../../src/modules/game/rules'
import { countNewPhraseToday, readPhrasesToday } from '../../../../src/modules/game/limits'
import { forgetQuick, storeQuick } from '../../../../src/modules/services/quickCache'
import { getIcaStreakState, isIcaCycleDone } from '../../../../src/modules/game/streak'
import { countActivatedWords } from '../../../../src/modules/game/useActivatedWords'
import type { DailyProgressEntry, Lexicard } from '../../../../src/modules/types'

const USER = 'user-test'

function progress(partial: Partial<DailyProgressEntry> = {}): DailyProgressEntry {
  return {
    wordsAdded: 0,
    phraseGenerated: false,
    reviewCorrect: 0,
    voiceActivationsCount: 0,
    ...partial,
  }
}

describe('modo juego: reglas', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-30T10:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('el ciclo ICA pide 5 palabras, 1 frase y 1 activación', () => {
    expect(isIcaCycleDone(progress({ wordsAdded: 5, phraseGenerated: true, voiceActivationsCount: 1 }))).toBe(true)
    expect(isIcaCycleDone(progress({ wordsAdded: 4, phraseGenerated: true, voiceActivationsCount: 1 }))).toBe(false)
    expect(isIcaCycleDone(progress({ wordsAdded: 5, phraseGenerated: true, voiceActivationsCount: 0 }))).toBe(false)
  })

  it('la racha cuenta hoy en cuanto el ciclo está hecho, aunque el servidor tarde', () => {
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

  it('la racha más larga no suma los días salvados, pero no se corta por ellos', () => {
    expect(longestStreak(['2026-09-01', '2026-09-02', '2026-09-04'], ['2026-09-03'])).toBe(3)
    expect(longestStreak(['2026-09-01', '2026-09-02', '2026-09-04'])).toBe(2)
  })

  it('el cofre del ciclo da de 1 a 5 ICA Coins y solo una vez al día', () => {
    const { coins } = claimCycleChest(USER)
    expect(coins).toBeGreaterThanOrEqual(1)
    expect(coins).toBeLessThanOrEqual(5)
    expect(claimCycleChest(USER).coins).toBe(0)
    expect(getPreviewDelta(readPreviewEntries(USER))).toBe(coins)
  })

  it('el cofre sigue las probabilidades 40/30/20/8/2', () => {
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
    expect(rollCycleChest(() => 0.9999)).toBe(5)
  })

  it('los hitos de racha se cobran una sola vez', () => {
    expect(claimReachedMilestones(USER, 6)).toBe(0)
    expect(claimReachedMilestones(USER, 7)).toBe(2)
    expect(claimReachedMilestones(USER, 8)).toBe(0)
    expect(claimReachedMilestones(USER, 30)).toBe(5)
    expect(getPreviewDelta(readPreviewEntries(USER))).toBe(7)
  })

  it('ampliar una fase cuesta 15 ICA Coins, solo amplía esa fase y no se cobra dos veces', () => {
    expect(buyPhaseBoost(USER, 'words', 14)).toBe(false)
    expect(hasPhaseBoost(readPreviewEntries(USER), 'words')).toBe(false)
    expect(buyPhaseBoost(USER, 'words', 15)).toBe(true)
    expect(buyPhaseBoost(USER, 'words', 15)).toBe(true)
    expect(getPreviewDelta(readPreviewEntries(USER))).toBe(-15)
    expect(phaseBoostsToday(readPreviewEntries(USER))).toEqual({ words: true, phrases: false, activations: false })

    // La 2.ª ampliación de la semana cuesta 20.
    expect(buyPhaseBoost(USER, 'activations', 100)).toBe(true)
    expect(getPreviewDelta(readPreviewEntries(USER))).toBe(-35)
    expect(phaseBoostsToday(readPreviewEntries(USER))).toEqual({ words: true, phrases: false, activations: true })

    vi.setSystemTime(new Date('2026-10-01T10:00:00'))
    expect(hasPhaseBoost(readPreviewEntries(USER), 'words')).toBe(false)
  })

  it('ampliaciones de la semana: 15, 20 y 25; no hay 4.ª y el lunes vuelve a 15', () => {
    // 30 sept 2026 es miércoles: la semana empieza el lunes 28.
    expect(weekStartKey('2026-09-30')).toBe('2026-09-28')
    expect(weekStartKey('2026-10-04')).toBe('2026-09-28')
    expect(weekStartKey('2026-10-05')).toBe('2026-10-05')

    expect(nextPhaseBoostPrice(readPreviewEntries(USER))).toBe(15)
    expect(buyPhaseBoost(USER, 'words', 100)).toBe(true)
    expect(nextPhaseBoostPrice(readPreviewEntries(USER))).toBe(20)
    expect(buyPhaseBoost(USER, 'phrases', 19)).toBe(false)
    expect(buyPhaseBoost(USER, 'phrases', 20)).toBe(true)
    vi.setSystemTime(new Date('2026-10-02T10:00:00'))
    expect(buyPhaseBoost(USER, 'words', 100)).toBe(true)
    expect(getPreviewDelta(readPreviewEntries(USER))).toBe(-60)
    expect(nextPhaseBoostPrice(readPreviewEntries(USER))).toBe(null)
    expect(buyPhaseBoost(USER, 'activations', 100)).toBe(false)

    vi.setSystemTime(new Date('2026-10-05T10:00:00'))
    expect(nextPhaseBoostPrice(readPreviewEntries(USER))).toBe(15)
  })

  it('desafíos ganados: como mucho 7 ICA Coins por semana; el lunes se reinicia', () => {
    for (let index = 0; index < 9; index += 1) claimChallengeWinCoin(USER, `reto-${index}`)
    expect(challengeWinCoinsThisWeek(readPreviewEntries(USER))).toBe(7)
    expect(getPreviewDelta(readPreviewEntries(USER))).toBe(7)
    // El mismo desafío no se vuelve a intentar otro día.
    vi.setSystemTime(new Date('2026-10-05T10:00:00'))
    expect(claimChallengeWinCoin(USER, 'reto-8')).toBe(false)
    expect(claimChallengeWinCoin(USER, 'reto-nuevo')).toBe(true)
    expect(challengeWinCoinsThisWeek(readPreviewEntries(USER))).toBe(1)
  })

  it('hucha: como mucho 100; con la hucha llena el cofre y los desafíos no suman', () => {
    expect(walletRoom(0)).toBe(100)
    expect(walletRoom(97)).toBe(3)
    expect(walletRoom(140)).toBe(0)
    // Saldo del servidor (último conocido) de 98: el cofre suma como mucho 2.
    storeQuick(`coins:${USER}`, 98)
    const chest = claimCycleChest(USER)
    expect(chest.coins).toBe(Math.min(chest.rolled, 2))
    expect(getPreviewDelta(readPreviewEntries(USER))).toBe(chest.coins)
    // Ya en 100: un desafío ganado no suma (se apunta con 0).
    storeQuick(`coins:${USER}`, 100 - chest.coins)
    expect(claimChallengeWinCoin(USER, 'reto-lleno')).toBe(false)
    expect(getPreviewDelta(readPreviewEntries(USER))).toBe(chest.coins)
    forgetQuick(`coins:${USER}`)
  })

  it('el contador de frases nuevas vuelve a cero al cambiar de día', () => {
    countNewPhraseToday(USER)
    countNewPhraseToday(USER)
    expect(readPhrasesToday(USER)).toBe(2)
    vi.setSystemTime(new Date('2026-10-01T09:00:00'))
    expect(readPhrasesToday(USER)).toBe(0)
  })

  it('palabras activadas: se usa el mayor entre el baúl y el MetaTracker', () => {
    const cards = [
      { id: 'a', activationCount: 2 },
      { id: 'b', activationCount: 0 },
      { id: 'c', activationCount: 1 },
    ] as Lexicard[]
    expect(countActivatedWords(cards)).toBe(2)
    expect(countActivatedWords(cards, 21)).toBe(21)
    expect(countActivatedWords(cards, null)).toBe(2)
  })

  it('hitos de racha de flashcards: la mitad (7 → 1, 30 → 3…) y una sola vez', () => {
    expect(claimReachedFlashMilestones(USER, 6)).toBe(0)
    expect(claimReachedFlashMilestones(USER, 7)).toBe(1)
    expect(claimReachedFlashMilestones(USER, 30)).toBe(3)
    expect(claimReachedFlashMilestones(USER, 30)).toBe(0)
    // No se mezclan con los de la racha ICA.
    expect(claimReachedMilestones(USER, 7)).toBe(2)
  })

  it('desafío extra: cuesta 15 ICA Coins y se gasta al usarlo', () => {
    expect(buyChallengeSlot(USER, 14)).toBe(false)
    expect(buyChallengeSlot(USER, 15)).toBe(true)
    expect(unusedChallengeSlots(readPreviewEntries(USER))).toBe(1)
    expect(getPreviewDelta(readPreviewEntries(USER))).toBe(-15)
    expect(consumeChallengeSlot(USER)).toBe(true)
    expect(unusedChallengeSlots(readPreviewEntries(USER))).toBe(0)
    expect(consumeChallengeSlot(USER)).toBe(false)
  })

  it('ranking: monedas enteras y lo que sobra es el avance hacia la siguiente', () => {
    expect(toWholeFichas(3.6)).toBe(3)
    expect(toWholeFichas(-8.92)).toBe(0)
    expect(nextCoinProgress(3.6)).toBeCloseTo(0.6)
    expect(nextCoinProgress(4)).toBe(0)
    expect(nextCoinProgress(-1.2)).toBe(0)
    expect(nextCoinProgress(null)).toBe(0)
  })

  it('reto del día: cada día toca un modo y van rotando', () => {
    const kinds = ['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((day) => dailyGameModeFor(day).kind)
    expect(new Set(kinds).size).toBe(DAILY_GAME_MODES.length)
    expect(dailyGameModeFor('2026-09-30').kind).toBe(dailyGameModeFor('2026-10-05').kind)
  })

  it('ranking: nombre corto para que quepa la insignia', () => {
    expect(shortName('Ana García')).toBe('Ana G.')
    expect(shortName('Luis González Gómez')).toBe('Luis G.')
    expect(shortName('Tomasz')).toBe('Tomasz')
    expect(shortName('  ')).toBe('Usuario')
  })
})

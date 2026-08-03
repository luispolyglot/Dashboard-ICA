import { describe, expect, it } from 'vitest'
import {
  computeLevelPosition,
  getLevelThresholds,
  NATIVE_PATH_LABEL,
} from '@/modules/components/MetaTracker/leveling'
import { getMetaTrackerSnapshot } from '@/modules/components/MetaTracker/progress'

describe('meta tracker leveling', () => {
  it('marks C1 as reached and starts native path at threshold', () => {
    const thresholds = getLevelThresholds('Polaco')

    const atC1 = computeLevelPosition(thresholds.C1, thresholds)

    expect(atC1.currentLevelKey).toBe('C1')
    expect(atC1.nextLevelKey).toBe(NATIVE_PATH_LABEL)
    expect(atC1.isNativePath).toBe(true)
    expect(atC1.wordsToNext).toBeNull()
    expect(atC1.pctOverall).toBe(1)
  })

  it('keeps C1 and native path when total words exceed C1 threshold', () => {
    const thresholds = getLevelThresholds('Polaco')

    const afterC1 = computeLevelPosition(thresholds.C1 + 10, thresholds)

    expect(afterC1.currentLevelKey).toBe('C1')
    expect(afterC1.nextLevelKey).toBe(NATIVE_PATH_LABEL)
    expect(afterC1.total).toBe(thresholds.C1 + 10)
    expect(afterC1.wordsToNext).toBeNull()
    expect(afterC1.isNativePath).toBe(true)
  })

  it('still tracks progression normally before C1', () => {
    const thresholds = getLevelThresholds('Polaco')

    const beforeC1 = computeLevelPosition(thresholds.C1 - 1, thresholds)

    expect(beforeC1.currentLevelKey).toBe('B2+')
    expect(beforeC1.nextLevelKey).toBe('C1')
    expect(beforeC1.wordsToNext).toBe(1)
    expect(beforeC1.isNativePath).toBe(false)
  })

  it('builds snapshot with native-path literals for confirmed C1 users', () => {
    const thresholds = getLevelThresholds('Polaco')

    const snapshot = getMetaTrackerSnapshot(
      {
        startLevel: '0',
        priorIcaWords: 0,
        activationWordsTotal: thresholds.C1 + 10,
        confirmedAt: Date.now(),
      },
      'Polaco',
    )

    expect(snapshot.currentLevelKey).toBe('C1')
    expect(snapshot.nextLevelKey).toBe(NATIVE_PATH_LABEL)
    expect(snapshot.wordsToNext).toBeNull()
    expect(snapshot.isNativePath).toBe(true)
  })
})

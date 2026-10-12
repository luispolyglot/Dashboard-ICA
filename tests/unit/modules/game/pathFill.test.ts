import { afterEach, describe, expect, it } from 'vitest'
import { decidePathFill, readPathSeen, writePathSeen } from '../../../../src/modules/game/pathFill'

describe('decidePathFill', () => {
  it('only remembers the first time of the day', () => {
    expect(decidePathFill(null, 0)).toBe('remember')
    expect(decidePathFill(null, 3)).toBe('remember')
  })

  it('fills when a new stop is reached', () => {
    expect(decidePathFill(0, 1)).toBe('fill')
    expect(decidePathFill(1, 3)).toBe('fill')
  })

  it('does nothing when already seen or going back', () => {
    expect(decidePathFill(2, 2)).toBe('none')
    expect(decidePathFill(3, 1)).toBe('none')
  })
})

describe('readPathSeen / writePathSeen', () => {
  afterEach(() => window.localStorage.clear())

  it('keeps what was seen today, per user', () => {
    writePathSeen('ana', 2)
    expect(readPathSeen('ana')).toBe(2)
    expect(readPathSeen('luis')).toBeNull()
  })

  it('forgets it the next day', () => {
    writePathSeen('ana', 4, new Date(2026, 9, 1, 22, 0))
    expect(readPathSeen('ana', new Date(2026, 9, 2, 9, 0))).toBeNull()
  })
})

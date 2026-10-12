import { beforeEach, describe, expect, it } from 'vitest'
import { useChallengeSequenceStore } from '../../../../src/modules/stores/challengeSequenceStore'
import type { MasterNote } from '../../../../src/modules/types'

const note = (id: string) => ({ id, name: id }) as unknown as MasterNote

describe('Nota desafiante: escuchar todas seguidas (Luis, 12 Oct)', () => {
  beforeEach(() => useChallengeSequenceStore.getState().end())

  it('empieza por la nota elegida y sigue hasta la última', () => {
    useChallengeSequenceStore.getState().start([note('1'), note('2'), note('3'), note('4')], 2, 'Español')
    const state = useChallengeSequenceStore.getState()
    expect(state.looping).toBe(true)
    expect(state.loopIds).toEqual(['3', '4'])
    expect(state.request?.startIndex).toBe(2)
  })

  it('cada inicio es una escucha nueva (el reproductor se vuelve a montar)', () => {
    const { start } = useChallengeSequenceStore.getState()
    start([note('1'), note('2')], 0, 'Español')
    const first = useChallengeSequenceStore.getState().request?.token
    start([note('1'), note('2')], 1, 'Español')
    expect(useChallengeSequenceStore.getState().request?.token).not.toBe(first)
    expect(useChallengeSequenceStore.getState().loopIds).toEqual(['2'])
  })

  it('al terminar no queda nada sonando', () => {
    useChallengeSequenceStore.getState().start([note('1')], 0, 'Español')
    useChallengeSequenceStore.getState().end()
    const state = useChallengeSequenceStore.getState()
    expect(state.request).toBeNull()
    expect(state.looping).toBe(false)
    expect(state.controls).toBeNull()
  })
})

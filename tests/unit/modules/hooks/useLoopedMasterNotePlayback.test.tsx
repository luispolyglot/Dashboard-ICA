import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useLoopedMasterNotePlayback } from '@/modules/hooks/useLoopedMasterNotePlayback'

describe('useLoopedMasterNotePlayback', () => {
  it('plays transition cue and first track when loop starts', async () => {
    const playNoteById = vi.fn(async () => {})
    const playTransitionCue = vi.fn(async () => true)
    const stopPlayback = vi.fn(() => {})

    const { result } = renderHook(() =>
      useLoopedMasterNotePlayback({
        playingNoteId: null,
        playNoteById,
        playTransitionCue,
        stopPlayback,
      }),
    )

    await act(async () => {
      await result.current.startLoop(['note-a', 'note-b'])
    })

    expect(result.current.looping).toBe(true)
    expect(result.current.loopIndex).toBe(0)
    expect(playTransitionCue).toHaveBeenCalledTimes(1)
    expect(playTransitionCue).toHaveBeenCalledWith('start')
    expect(playNoteById).toHaveBeenCalledWith('note-a')
  })

  it('auto-advances to next track when current ends', async () => {
    const playNoteById = vi.fn(async () => {})
    const playTransitionCue = vi.fn(async () => true)
    const stopPlayback = vi.fn(() => {})

    const { result, rerender } = renderHook(
      ({ playingNoteId }: { playingNoteId: string | null }) =>
        useLoopedMasterNotePlayback({
          playingNoteId,
          playNoteById,
          playTransitionCue,
          stopPlayback,
        }),
      { initialProps: { playingNoteId: null } },
    )

    await act(async () => {
      await result.current.startLoop(['note-a', 'note-b'])
    })

    rerender({ playingNoteId: 'note-a' })
    rerender({ playingNoteId: null })

    await waitFor(() => {
      expect(playNoteById).toHaveBeenCalledWith('note-b')
    })

    expect(result.current.loopIndex).toBe(1)
    expect(playTransitionCue).toHaveBeenCalledTimes(2)
    expect(playTransitionCue.mock.calls[1]?.[0]).toBe('step')
  })

  it('stops auto-advance at end when repeat is off', async () => {
    const playNoteById = vi.fn(async () => {})
    const playTransitionCue = vi.fn(async () => true)
    const stopPlayback = vi.fn(() => {})

    const { result, rerender } = renderHook(
      ({ playingNoteId }: { playingNoteId: string | null }) =>
        useLoopedMasterNotePlayback({
          playingNoteId,
          playNoteById,
          playTransitionCue,
          stopPlayback,
        }),
      { initialProps: { playingNoteId: null } },
    )

    await act(async () => {
      await result.current.startLoop(['note-a', 'note-b'])
    })

    await act(async () => {
      result.current.setRepeatEnabled(false)
    })

    rerender({ playingNoteId: 'note-a' })
    rerender({ playingNoteId: null })

    await waitFor(() => {
      expect(result.current.loopIndex).toBe(1)
    })

    rerender({ playingNoteId: 'note-b' })
    rerender({ playingNoteId: null })

    await waitFor(() => {
      expect(result.current.loopIndex).toBe(0)
    })

    expect(playNoteById).toHaveBeenCalledTimes(2)
    expect(playTransitionCue).toHaveBeenCalledTimes(2)
    expect(playTransitionCue.mock.calls[0]?.[0]).toBe('start')
    expect(playTransitionCue.mock.calls[1]?.[0]).toBe('step')
  })
})

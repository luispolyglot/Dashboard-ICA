import { act, renderHook, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MasterNote } from '@/modules/types'

const createSignedMasterNoteAudioUrlMock = vi.fn()
const fetchMasterNoteChunksMock = vi.fn()

vi.mock('@/modules/services/masterNotes', () => ({
  createSignedMasterNoteAudioUrl: (...args: unknown[]) => createSignedMasterNoteAudioUrlMock(...args),
  fetchMasterNoteChunks: (...args: unknown[]) => fetchMasterNoteChunksMock(...args),
}))

import { useMasterNotePlayback } from '@/modules/hooks/useMasterNotePlayback'

const baseNote: MasterNote = {
  id: 'note-1',
  name: 'Nota Maestra 1',
  state: 'closed',
  close_type: 'temporal',
  total_duration_ms: 12000,
  final_audio_path: null,
  target_lang: 'en',
  native_lang: 'es',
  created_at: '2026-05-30T10:00:00.000Z',
  updated_at: '2026-05-30T10:00:00.000Z',
  closed_at: '2026-05-30T10:00:00.000Z',
}

class MockAudio {
  src: string

  currentTime = 0

  duration = 12

  paused = true

  readyState = 1

  onended: (() => void) | null = null

  onerror: (() => void) | null = null

  ontimeupdate: (() => void) | null = null

  onloadedmetadata: (() => void) | null = null

  play = vi.fn(async () => {
    this.paused = false
  })

  pause = vi.fn(() => {
    this.paused = true
  })

  constructor(src: string) {
    this.src = src
    mockAudioInstances.push(this)
  }
}

const mockAudioInstances: MockAudio[] = []
const originalAudio = globalThis.Audio
const originalFetch = globalThis.fetch
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

describe('useMasterNotePlayback', () => {
  beforeAll(() => {
    globalThis.Audio = MockAudio as unknown as typeof Audio
  })

  afterAll(() => {
    globalThis.Audio = originalAudio
    globalThis.fetch = originalFetch
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  })

  beforeEach(() => {
    createSignedMasterNoteAudioUrlMock.mockReset()
    fetchMasterNoteChunksMock.mockReset()
    mockAudioInstances.length = 0

    let objectUrlCount = 0
    URL.createObjectURL = vi.fn(() => {
      objectUrlCount += 1
      return `blob:merged-${objectUrlCount}`
    })
    URL.revokeObjectURL = vi.fn()

    globalThis.fetch = vi.fn(async () => {
      const blob = new Blob(['chunk-audio'], { type: 'audio/mpeg' })
      return new Response(blob, { status: 200 })
    }) as typeof fetch

    createSignedMasterNoteAudioUrlMock.mockImplementation(async (path: string) => `https://audio/${path}`)
    fetchMasterNoteChunksMock.mockResolvedValue([
      {
        id: 'chunk-1',
        master_note_id: 'note-1',
        phrase_generation_id: 'phrase-1',
        storage_path: 'chunk-1.mp3',
        duration_ms: 6000,
        mime_type: 'audio/mpeg',
        size_bytes: 1200,
        sort_order: 0,
        created_at: '2026-05-30T10:00:00.000Z',
      },
      {
        id: 'chunk-2',
        master_note_id: 'note-1',
        phrase_generation_id: 'phrase-2',
        storage_path: 'chunk-2.mp3',
        duration_ms: 6000,
        mime_type: 'audio/mpeg',
        size_bytes: 1200,
        sort_order: 1,
        created_at: '2026-05-30T10:00:05.000Z',
      },
    ])
  })

  it('unifies chunk audio and reuses in-memory cache on replay', async () => {
    const { result } = renderHook(() => useMasterNotePlayback())

    await act(async () => {
      await result.current.play(baseNote)
    })

    expect(fetchMasterNoteChunksMock).toHaveBeenCalledTimes(1)
    expect(createSignedMasterNoteAudioUrlMock).toHaveBeenCalledTimes(2)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)

    expect(mockAudioInstances).toHaveLength(1)
    expect(mockAudioInstances[0]?.src).toBe('blob:merged-1')
    expect(result.current.durationSec).toBe(12)

    act(() => {
      result.current.seekForward10()
    })

    expect(mockAudioInstances[0]?.currentTime).toBe(10)
    expect(result.current.positionSec).toBe(10)

    act(() => {
      const firstAudio = mockAudioInstances[0]
      if (!firstAudio) return
      firstAudio.currentTime = 12
      firstAudio.onended?.()
    })

    await waitFor(() => {
      expect(result.current.playingNoteId).toBeNull()
    })

    await act(async () => {
      await result.current.play(baseNote)
    })

    expect(fetchMasterNoteChunksMock).toHaveBeenCalledTimes(1)
    expect(createSignedMasterNoteAudioUrlMock).toHaveBeenCalledTimes(2)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(mockAudioInstances).toHaveLength(2)
    expect(mockAudioInstances[1]?.src).toBe('blob:merged-1')
  })

  it('returns empty-audio error when temporal note has no chunks', async () => {
    fetchMasterNoteChunksMock.mockResolvedValueOnce([])

    const { result } = renderHook(() => useMasterNotePlayback())

    await act(async () => {
      await result.current.play(baseNote)
    })

    expect(result.current.error).toBe('No hay audios para reproducir en esta nota maestra')
    expect(mockAudioInstances).toHaveLength(0)
  })

  it('revokes merged object URL cache on unmount', async () => {
    const { result, unmount } = renderHook(() => useMasterNotePlayback())

    await act(async () => {
      await result.current.play(baseNote)
    })

    unmount()

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:merged-1')
  })
})

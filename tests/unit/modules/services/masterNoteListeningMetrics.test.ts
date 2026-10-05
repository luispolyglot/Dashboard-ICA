import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()
const selectRows: { value: Array<{ listened_seconds: number }> } = { value: [] }
const toastSuccess = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        then: (resolve: (value: unknown) => void) => resolve({ data: selectRows.value, error: null }),
      }
      return query
    },
  },
}))

vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => toastSuccess(...args) } }))

import {
  celebrateListeningGoalIfReached,
  enqueueMasterNoteListeningDelta,
  flushPendingMasterNoteListeningDeltas,
} from '@/modules/services/masterNoteListeningMetrics'
import { todayKey } from '@/modules/utils'

const STORAGE_KEY = 'icademy:master-note-listening:pending:v1'
const base = { userId: 'u1', day: '2026-10-05', targetLang: 'Polaco', nativeLang: 'Español' }

function pending(): Array<{ id: string; deltaSeconds: number }> {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
}

describe('master note listening metrics', () => {
  beforeEach(() => {
    window.localStorage.clear()
    rpcMock.mockReset()
    toastSuccess.mockReset()
    selectRows.value = []
  })

  it('keeps the seconds listened while a send is on its way', async () => {
    enqueueMasterNoteListeningDelta({ ...base, deltaSeconds: 10 })
    let release: () => void = () => undefined
    rpcMock.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve({ data: null, error: null }) }),
    )
    const flushing = flushPendingMasterNoteListeningDeltas('u1')
    await Promise.resolve()
    // Listening goes on while the first 10 s travel to the server.
    enqueueMasterNoteListeningDelta({ ...base, deltaSeconds: 7 })
    release()
    await flushing

    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_delta_seconds: 10 })
    expect(pending().map((event) => event.deltaSeconds)).toEqual([7])
  })

  it('celebrates 10 minutes once per day', async () => {
    selectRows.value = [{ listened_seconds: 420 }, { listened_seconds: 200 }]
    expect(await celebrateListeningGoalIfReached('u1')).toBe(true)
    expect(toastSuccess).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem('icademy:master-note-listening:goal-celebrated-day')).toBe(todayKey())

    expect(await celebrateListeningGoalIfReached('u1')).toBe(false)
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })

  it('does not celebrate before 10 minutes', async () => {
    selectRows.value = [{ listened_seconds: 599 }]
    expect(await celebrateListeningGoalIfReached('u1')).toBe(false)
    expect(toastSuccess).not.toHaveBeenCalled()
  })
})

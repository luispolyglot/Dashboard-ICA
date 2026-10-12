import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLocalListeningDayStamp } from '@/modules/services/listeningCalendar'

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

const storageKey = 'icademy:master-note-listening:pending:v1'
const goalCelebratedKey = 'icademy:master-note-listening:goal-celebrated-day'
const userId = 'user-1'
const firstOccurrence = '2026-10-05T21:00:00.000Z'

function enqueue(deltaSeconds: number, occurredAt: string): void {
  enqueueMasterNoteListeningDelta({
    userId,
    day: getLocalListeningDayStamp(new Date(occurredAt)),
    targetLang: 'italiano',
    nativeLang: 'español',
    deltaSeconds,
    occurredAt,
  })
}

function getPendingDeltas(): number[] {
  return JSON.parse(window.localStorage.getItem(storageKey) || '[]')
    .map((event: { deltaSeconds: number }) => event.deltaSeconds)
}

describe('master note listening metrics', () => {
  beforeEach(() => {
    window.localStorage.clear()
    rpcMock.mockReset()
    toastSuccess.mockReset()
    selectRows.value = []
  })

  it('keeps the seconds listened while a send is on its way', async () => {
    enqueue(10, firstOccurrence)
    let releaseFirstRequest: (value: { data: null; error: null }) => void = () => undefined
    rpcMock
      .mockImplementationOnce(
        () => new Promise((resolve) => { releaseFirstRequest = resolve }),
      )
      .mockResolvedValue({ data: null, error: null })

    const flushing = flushPendingMasterNoteListeningDeltas(userId)
    await Promise.resolve()
    enqueue(7, '2026-10-05T21:00:20.000Z')
    releaseFirstRequest({ data: null, error: null })
    await flushing

    expect(rpcMock).toHaveBeenCalledTimes(2)
    expect(rpcMock.mock.calls.map(([, args]) => args.p_delta_seconds)).toEqual([10, 7])
    expect(getPendingDeltas()).toEqual([])
  })

  it('celebrates 10 minutes once per day', async () => {
    selectRows.value = [{ listened_seconds: 420 }, { listened_seconds: 200 }]
    expect(await celebrateListeningGoalIfReached('u1')).toBe(true)
    expect(toastSuccess).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem(goalCelebratedKey)).toBe(getLocalListeningDayStamp())

    expect(await celebrateListeningGoalIfReached('u1')).toBe(false)
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })

  it('does not celebrate before 10 minutes', async () => {
    selectRows.value = [{ listened_seconds: 599 }]
    expect(await celebrateListeningGoalIfReached('u1')).toBe(false)
    expect(toastSuccess).not.toHaveBeenCalled()
  })
})

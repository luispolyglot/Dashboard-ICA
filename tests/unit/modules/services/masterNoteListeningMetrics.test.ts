import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLocalListeningDayStamp } from '@/modules/services/listeningCalendar'

const rpcMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}))

import {
  enqueueMasterNoteListeningDelta,
  flushPendingMasterNoteListeningDeltas,
} from '@/modules/services/masterNoteListeningMetrics'

const storageKey = 'icademy:master-note-listening:pending:v1'
const firstOccurrence = '2026-10-05T21:00:00.000Z'
const userId = 'user-1'

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
  })

  it('keeps seconds enqueued while an earlier event is being sent', async () => {
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
})

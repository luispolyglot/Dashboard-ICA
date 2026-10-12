import { describe, expect, it } from 'vitest'
import { countPendingMasterNotesForSession, countPendingTaskAudioBySession } from '../../../../../supabase/functions/coaching-center/pending-review'

describe('countPendingMasterNotesForSession', () => {
  it('counts only closed notes without feedback inside coaching window', () => {
    const count = countPendingMasterNotesForSession(
      {
        userId: 'user-1',
        targetLang: 'English',
        activatedAt: '2026-01-01T00:00:00.000Z',
        durationWeeks: 12,
      },
      [
        {
          userId: 'user-1',
          targetLang: 'english',
          closedAt: '2026-01-04T12:00:00.000Z',
          updatedAt: null,
          feedbackLoomUrl: null,
          feedbackNotes: null,
        },
        {
          userId: 'user-1',
          targetLang: 'ENGLISH',
          closedAt: '2026-01-10T12:00:00.000Z',
          updatedAt: null,
          feedbackLoomUrl: 'https://loom.com/share/abc',
          feedbackNotes: null,
        },
        {
          userId: 'user-1',
          targetLang: 'english',
          closedAt: '2026-01-11T12:00:00.000Z',
          updatedAt: null,
          feedbackLoomUrl: null,
          feedbackNotes: 'reviewed',
        },
      ],
    )

    expect(count).toBe(1)
  })

  it('ignores notes before activation and keeps post-activation notes pending', () => {
    const count = countPendingMasterNotesForSession(
      {
        userId: 'user-1',
        targetLang: 'English',
        activatedAt: '2026-01-01T00:00:00.000Z',
        durationWeeks: 1,
      },
      [
        {
          userId: 'user-1',
          targetLang: 'english',
          closedAt: '2025-12-31T23:59:59.000Z',
          updatedAt: null,
          feedbackLoomUrl: null,
          feedbackNotes: null,
        },
        {
          userId: 'user-1',
          targetLang: 'english',
          closedAt: '2026-01-08T00:00:00.000Z',
          updatedAt: null,
          feedbackLoomUrl: null,
          feedbackNotes: null,
        },
      ],
    )

    expect(count).toBe(1)
  })

  it('uses updatedAt when closedAt is missing', () => {
    const count = countPendingMasterNotesForSession(
      {
        userId: 'user-1',
        targetLang: 'English',
        activatedAt: '2026-01-01T00:00:00.000Z',
        durationWeeks: 2,
      },
      [
        {
          userId: 'user-1',
          targetLang: 'english',
          closedAt: null,
          updatedAt: '2026-01-07T12:00:00.000Z',
          feedbackLoomUrl: null,
          feedbackNotes: null,
        },
      ],
    )

    expect(count).toBe(1)
  })

  it('keeps sessions isolated by user and language', () => {
    const count = countPendingMasterNotesForSession(
      {
        userId: 'user-1',
        targetLang: 'English',
        activatedAt: '2026-01-01T00:00:00.000Z',
        durationWeeks: 2,
      },
      [
        {
          userId: 'user-2',
          targetLang: 'english',
          closedAt: '2026-01-03T00:00:00.000Z',
          updatedAt: null,
          feedbackLoomUrl: null,
          feedbackNotes: null,
        },
        {
          userId: 'user-1',
          targetLang: 'japanese',
          closedAt: '2026-01-03T00:00:00.000Z',
          updatedAt: null,
          feedbackLoomUrl: null,
          feedbackNotes: null,
        },
      ],
    )

    expect(count).toBe(0)
  })

  it('uses activated week windows when provided', () => {
    const count = countPendingMasterNotesForSession(
      {
        userId: 'user-1',
        targetLang: 'English',
        activatedAt: '2026-01-01T00:00:00.000Z',
        durationWeeks: 12,
        activatedWeekWindows: [
          {
            startAt: '2026-01-01T00:00:00.000Z',
            endAt: '2026-01-08T00:00:00.000Z',
          },
        ],
      },
      [
        {
          userId: 'user-1',
          targetLang: 'english',
          closedAt: '2026-01-03T00:00:00.000Z',
          updatedAt: null,
          feedbackLoomUrl: null,
          feedbackNotes: null,
        },
        {
          userId: 'user-1',
          targetLang: 'english',
          closedAt: '2026-01-10T00:00:00.000Z',
          updatedAt: null,
          feedbackLoomUrl: null,
          feedbackNotes: null,
        },
      ],
    )

    expect(count).toBe(1)
  })
})

describe('countPendingTaskAudioBySession', () => {
  it('counts the homework audios still waiting for feedback, per session and week', () => {
    const result = countPendingTaskAudioBySession([
      { sessionId: 's1', periodNumber: 3, feedbackAt: null },
      { sessionId: 's1', periodNumber: 2, feedbackAt: null },
      { sessionId: 's1', periodNumber: 3, feedbackAt: null },
      { sessionId: 's1', periodNumber: 1, feedbackAt: '2026-10-01T10:00:00Z' },
      { sessionId: 's2', periodNumber: 1, feedbackAt: '  ' },
      { sessionId: '', periodNumber: 1, feedbackAt: null },
    ])
    expect(result.get('s1')).toEqual({ count: 3, periods: [2, 3] })
    expect(result.get('s2')).toEqual({ count: 1, periods: [1] })
    expect(result.has('')).toBe(false)
  })
})

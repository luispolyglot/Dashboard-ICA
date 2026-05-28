import { describe, expect, it } from 'vitest'
import { countPendingMasterNotesForSession } from '../../../../../supabase/functions/coaching-center/pending-review'

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

  it('ignores notes outside the coaching period', () => {
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

    expect(count).toBe(0)
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
})

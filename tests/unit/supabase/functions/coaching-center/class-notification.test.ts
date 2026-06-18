import { describe, expect, it } from 'vitest'
import {
  buildClassScheduleSignature,
  hasPostClassResources,
  isReminderDueNow,
  resolveClassScheduleNotificationEvent,
} from '../../../../../supabase/functions/coaching-center/class-notification'

describe('coaching class notification helpers', () => {
  it('detects post-class resources', () => {
    expect(
      hasPostClassResources({
        week_number: 1,
        loom_url: null,
        report: null,
        report_image_path: null,
        scheduled_at: null,
        class_join_url: null,
      }),
    ).toBe(false)

    expect(
      hasPostClassResources({
        week_number: 1,
        loom_url: 'https://www.loom.com/share/abc',
        report: null,
        report_image_path: null,
        scheduled_at: null,
        class_join_url: null,
      }),
    ).toBe(true)
  })

  it('returns scheduled event for active week first-time scheduling', () => {
    const event = resolveClassScheduleNotificationEvent({
      activeWeekNumber: 2,
      previousRows: [],
      nextRows: [
        {
          week_number: 2,
          loom_url: null,
          report: null,
          report_image_path: null,
          scheduled_at: '2026-07-01T14:00:00.000Z',
          class_join_url: 'https://meet.google.com/abc',
        },
      ],
    })

    expect(event?.type).toBe('scheduled')
    expect(event?.weekNumber).toBe(2)
    expect(event?.scheduleSignature).toBe(
      buildClassScheduleSignature({
        scheduled_at: '2026-07-01T14:00:00.000Z',
        class_join_url: 'https://meet.google.com/abc',
      }),
    )
  })

  it('returns rescheduled event when active week schedule changes', () => {
    const event = resolveClassScheduleNotificationEvent({
      activeWeekNumber: 1,
      previousRows: [
        {
          week_number: 1,
          loom_url: null,
          report: null,
          report_image_path: null,
          scheduled_at: '2026-07-01T14:00:00.000Z',
          class_join_url: 'https://meet.google.com/abc',
        },
      ],
      nextRows: [
        {
          week_number: 1,
          loom_url: null,
          report: null,
          report_image_path: null,
          scheduled_at: '2026-07-01T15:00:00.000Z',
          class_join_url: 'https://meet.google.com/abc',
        },
      ],
    })

    expect(event?.type).toBe('rescheduled')
  })

  it('does not notify when active week has post-class resources', () => {
    const event = resolveClassScheduleNotificationEvent({
      activeWeekNumber: 3,
      previousRows: [],
      nextRows: [
        {
          week_number: 3,
          loom_url: 'https://www.loom.com/share/abc',
          report: null,
          report_image_path: null,
          scheduled_at: '2026-07-01T14:00:00.000Z',
          class_join_url: 'https://meet.google.com/abc',
        },
      ],
    })

    expect(event).toBeNull()
  })

  it('calculates reminder due window correctly', () => {
    const scheduledAt = '2026-07-01T14:00:00.000Z'

    expect(
      isReminderDueNow({
        scheduledAt,
        reminderMinutes: 30,
        nowMs: Date.parse('2026-07-01T13:30:00.000Z'),
      }),
    ).toBe(true)

    expect(
      isReminderDueNow({
        scheduledAt,
        reminderMinutes: 30,
        nowMs: Date.parse('2026-07-01T13:29:59.000Z'),
      }),
    ).toBe(false)

    expect(
      isReminderDueNow({
        scheduledAt,
        reminderMinutes: 30,
        nowMs: Date.parse('2026-07-01T14:00:00.000Z'),
      }),
    ).toBe(false)
  })

  it('normalizes date format when building schedule signature', () => {
    expect(
      buildClassScheduleSignature({
        scheduled_at: '2026-06-18 12:30:00+00',
        class_join_url: null,
      }),
    ).toBe(
      buildClassScheduleSignature({
        scheduled_at: '2026-06-18T12:30:00.000Z',
        class_join_url: null,
      }),
    )
  })
})

import { describe, expect, it } from 'vitest'
import {
  formatScheduledClassDateTime,
  hasPostClassResources,
  shouldRenderUpcomingClassResources,
  toDateTimeLocalInputValue,
  toIsoFromDateTimeLocalInput,
} from '../../../../src/modules/views/coachingClassResources'

describe('coachingClassResources helpers', () => {
  it('detects post-class resources', () => {
    expect(
      hasPostClassResources({
        loomUrl: null,
        report: null,
        reportImagePath: null,
        reportImageUrl: null,
      }),
    ).toBe(false)

    expect(
      hasPostClassResources({
        loomUrl: 'https://www.loom.com/share/abc',
        report: null,
        reportImagePath: null,
        reportImageUrl: null,
      }),
    ).toBe(true)
  })

  it('renders upcoming resources only when post-class resources do not exist', () => {
    expect(
      shouldRenderUpcomingClassResources({
        loomUrl: null,
        report: null,
        reportImagePath: null,
        reportImageUrl: null,
        scheduledAt: '2026-06-18T10:00:00.000Z',
        classJoinUrl: null,
      }),
    ).toBe(true)

    expect(
      shouldRenderUpcomingClassResources({
        loomUrl: 'https://www.loom.com/share/abc',
        report: null,
        reportImagePath: null,
        reportImageUrl: null,
        scheduledAt: '2026-06-18T10:00:00.000Z',
        classJoinUrl: 'https://meet.google.com/abc',
      }),
    ).toBe(false)
  })

  it('converts datetime-local values to and from ISO', () => {
    const iso = '2026-06-18T15:30:00.000Z'
    const localInput = toDateTimeLocalInputValue(iso)

    expect(localInput).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(toIsoFromDateTimeLocalInput(localInput)).toBe(iso)
  })

  it('formats scheduled date fallback for invalid values', () => {
    expect(formatScheduledClassDateTime('invalid-date')).toBe(
      'Fecha no disponible',
    )
  })
})

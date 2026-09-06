import { describe, expect, it } from 'vitest'
import {
  hasAllStudentGuidelineResponses,
  hasCoachGuidelinesCompleted,
} from '../../../../../supabase/functions/coaching-center/v2-class'

describe('v2 class helpers', () => {
  it('returns true when all three guidelines are present', () => {
    expect(
      hasCoachGuidelinesCompleted({
        guideline1: 'A',
        guideline2: 'B',
        guideline3: 'C',
      }),
    ).toBe(true)
  })

  it('returns false when one guideline is missing', () => {
    expect(
      hasCoachGuidelinesCompleted({
        guideline1: 'A',
        guideline2: '',
        guideline3: 'C',
      }),
    ).toBe(false)
  })

  it('returns true only when all student responses are present', () => {
    expect(
      hasAllStudentGuidelineResponses({
        response1: 'A',
        response2: 'B',
        response3: 'C',
      }),
    ).toBe(true)

    expect(
      hasAllStudentGuidelineResponses({
        response1: 'A',
        response2: null,
        response3: 'C',
      }),
    ).toBe(false)
  })
})

export function hasCoachGuidelinesCompleted(input: {
  guideline1: string | null
  guideline2: string | null
  guideline3: string | null
}): boolean {
  return (
    Boolean(input.guideline1?.trim()) &&
    Boolean(input.guideline2?.trim()) &&
    Boolean(input.guideline3?.trim())
  )
}

export function hasAllStudentGuidelineResponses(input: {
  response1: string | null
  response2: string | null
  response3: string | null
}): boolean {
  return (
    Boolean(input.response1?.trim()) &&
    Boolean(input.response2?.trim()) &&
    Boolean(input.response3?.trim())
  )
}

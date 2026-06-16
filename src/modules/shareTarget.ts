export const SHARE_TARGET_INPUT_QUERY_PARAM = 'sharedTarget'
export const SHARE_TARGET_SOURCE_QUERY_PARAM = 'source'
export const SHARE_TARGET_SOURCE = 'web-share-target'
export const SHARE_TARGET_MAX_CHARS = 50

function truncateToMaxChars(value: string): string {
  return Array.from(value).slice(0, SHARE_TARGET_MAX_CHARS).join('')
}

export function sanitizeShareTargetInput(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '')

  if (!normalized) return ''
  return truncateToMaxChars(normalized)
}

export function getSharedTargetFromParams(searchParams: URLSearchParams): string {
  const candidates = [searchParams.get('text'), searchParams.get('title')]

  for (const candidate of candidates) {
    if (!candidate) continue
    const sanitized = sanitizeShareTargetInput(candidate)
    if (sanitized) return sanitized
  }

  return ''
}

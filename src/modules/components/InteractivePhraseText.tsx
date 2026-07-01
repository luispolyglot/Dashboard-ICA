import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { sanitizeTokenForLookup, segmentPhraseText } from '../phraseSegmentation'

type InteractivePhraseTextProps = {
  text: string
  language: string
  onTokenClick: (token: string) => void
  className?: string
  query?: string
}

type HighlightRange = {
  start: number
  end: number
}

function getHighlightRanges(text: string, query: string): HighlightRange[] {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return []

  const lowerText = text.toLocaleLowerCase()
  const lowerQuery = trimmedQuery.toLocaleLowerCase()
  if (!lowerQuery) return []

  const ranges: HighlightRange[] = []
  let fromIndex = 0

  while (fromIndex < lowerText.length) {
    const foundAt = lowerText.indexOf(lowerQuery, fromIndex)
    if (foundAt === -1) break
    ranges.push({ start: foundAt, end: foundAt + lowerQuery.length })
    fromIndex = foundAt + lowerQuery.length
  }

  return ranges
}

function renderHighlightedSegment(
  value: string,
  segmentStart: number,
  ranges: HighlightRange[],
): ReactNode {
  if (!ranges.length || !value) return value

  const segmentEnd = segmentStart + value.length
  const overlapping = ranges.filter(
    (range) => range.start < segmentEnd && range.end > segmentStart,
  )
  if (!overlapping.length) return value

  const nodes: ReactNode[] = []
  let cursor = 0

  overlapping.forEach((range, index) => {
    const localStart = Math.max(0, range.start - segmentStart)
    const localEnd = Math.min(value.length, range.end - segmentStart)

    if (localStart > cursor) {
      nodes.push(
        <span key={`plain-${segmentStart}-${index}-${cursor}`}>
          {value.slice(cursor, localStart)}
        </span>,
      )
    }

    if (localEnd > localStart) {
      nodes.push(
        <mark
          key={`mark-${segmentStart}-${index}-${localStart}`}
          className='rounded-sm bg-primary/20 px-0.5 text-primary'
        >
          {value.slice(localStart, localEnd)}
        </mark>,
      )
      cursor = localEnd
    }
  })

  if (cursor < value.length) {
    nodes.push(
      <span key={`plain-tail-${segmentStart}-${cursor}`}>{value.slice(cursor)}</span>,
    )
  }

  return nodes
}

export function InteractivePhraseText({
  text,
  language,
  onTokenClick,
  className,
  query,
}: InteractivePhraseTextProps) {
  const segments = useMemo(() => segmentPhraseText(text, language), [language, text])
  const highlightRanges = useMemo(() => getHighlightRanges(text, query || ''), [text, query])

  return (
    <p className={className}>
      {(() => {
        let offset = 0

        return segments.map((segment, index) => {
          const segmentStart = offset
          offset += segment.value.length

          if (!segment.isToken) {
            return (
              <span key={`${segment.value}-${index}`}>
                {renderHighlightedSegment(segment.value, segmentStart, highlightRanges)}
              </span>
            )
          }

          const token = sanitizeTokenForLookup(segment.value)
          if (!token) {
            return (
              <span key={`${segment.value}-${index}`}>
                {renderHighlightedSegment(segment.value, segmentStart, highlightRanges)}
              </span>
            )
          }

          return (
            <button
              key={`${segment.value}-${index}`}
              type='button'
              onClick={() => onTokenClick(token)}
              className={cn(
                'rounded-sm underline decoration-dotted underline-offset-3',
                'decoration-foreground/20 transition-colors hover:decoration-foreground/70',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70',
              )}
            >
              {renderHighlightedSegment(segment.value, segmentStart, highlightRanges)}
            </button>
          )
        })
      })()}
    </p>
  )
}

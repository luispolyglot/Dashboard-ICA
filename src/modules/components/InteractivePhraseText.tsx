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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightMatch(text: string, query: string): ReactNode {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return text

  const regex = new RegExp(`(${escapeRegex(trimmedQuery)})`, 'gi')
  const parts = text.split(regex)

  return parts.map((part, index) =>
    part.toLowerCase() === trimmedQuery.toLowerCase() ? (
      <mark
        key={`${part}-${index}`}
        className='rounded-sm bg-primary/20 px-0.5 text-primary'
      >
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  )
}

export function InteractivePhraseText({
  text,
  language,
  onTokenClick,
  className,
  query,
}: InteractivePhraseTextProps) {
  const segments = useMemo(() => segmentPhraseText(text, language), [language, text])

  return (
    <p className={className}>
      {segments.map((segment, index) => {
        if (!segment.isToken) {
          return (
            <span key={`${segment.value}-${index}`}>
              {highlightMatch(segment.value, query || '')}
            </span>
          )
        }

        const token = sanitizeTokenForLookup(segment.value)
        if (!token) {
          return <span key={`${segment.value}-${index}`}>{segment.value}</span>
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
            {highlightMatch(segment.value, query || '')}
          </button>
        )
      })}
    </p>
  )
}

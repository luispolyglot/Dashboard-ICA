import { useEffect, useState } from 'react'
import { getRomanization } from '../utils/romanization'

type RomanizationHintProps = {
  text: string
  language: string
  className?: string
}

export function RomanizationHint({ text, language, className }: RomanizationHintProps) {
  const [romanization, setRomanization] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    getRomanization(text, language)
      .then((value) => {
        if (active) setRomanization(value)
      })
      .catch(() => {
        if (active) setRomanization(null)
      })

    return () => {
      active = false
    }
  }, [text, language])

  if (!romanization) return null

  return (
    <p className={className || 'mt-1 text-xs text-muted-foreground'}>
      Romanización: {romanization}
    </p>
  )
}

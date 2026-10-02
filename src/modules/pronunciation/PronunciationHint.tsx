import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { usePronunciation } from './pronunciation'

/**
 * «/bocú/»: cómo suena la palabra. No pinta nada si está apagada en Perfil o si no se ha podido
 * conseguir. Con `showLoading`, mientras llega enseña «/ · · · /» latiendo (en las flashcards,
 * para que se sepa que viene y la tarjeta no salte).
 */
export function PronunciationHint({
  word,
  targetLang,
  nativeLang,
  className,
  showLoading = false,
}: {
  word: string | null | undefined
  targetLang: string | null | undefined
  nativeLang: string | null | undefined
  className?: string
  showLoading?: boolean
}) {
  const { text, loading } = usePronunciation(word, targetLang, nativeLang)
  if (!text) {
    if (!showLoading || !loading) return null
    return (
      <span className={cn('animate-pulse font-semibold text-muted-foreground opacity-60', className)} aria-hidden='true'>
        / · · · /
      </span>
    )
  }
  return (
    <span className={cn('font-semibold text-muted-foreground', className)} aria-label={t('Se pronuncia {text}', { text })}>
      /{text}/
    </span>
  )
}

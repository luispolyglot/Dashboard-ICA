import { useEffect, useState } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { langName as displayLangName, t } from '@/i18n'
import { toast } from 'sonner'
import { prefetchSpeech, speakNatural, stopTTS, type SpeakResult } from '../services/tts'
import { SquareIcon, Volume2Icon } from 'lucide-react'

type SpeakButtonProps = {
  text: string
  langName: string
  color: string
  label?: string
  className?: string
  disabled?: boolean
  variant?: 'default' | 'icon' | 'cta'
  isPlaying?: boolean
  onPlayingChange?: (isPlaying: boolean) => void
  /**
   * Prepare the premium audio as soon as the button shows. Off where the text changes while
   * typing (Inmersión): there each prefix would be generated and paid for (Luis, 6 Oct).
   */
  prefetch?: boolean
}

const SPEAK_RATE_STORAGE_KEY = 'speak-button-rate'

const SPEAK_TONES = {
  i: { solid: 'var(--ica-i)', soft: 'var(--ica-i-soft)', ink: 'var(--ica-i-ink)' },
  ok: { solid: 'var(--ica-ok)', soft: 'var(--ica-ok-soft)', ink: 'var(--ica-ok-ink)' },
  gold: { solid: 'var(--ica-gold)', soft: 'var(--ica-gold-soft)', ink: 'var(--ica-gold-ink)' },
  fire: { solid: 'var(--ica-fire)', soft: 'var(--ica-fire-soft)', ink: 'var(--ica-fire-ink)' },
  bad: { solid: 'var(--ica-bad-strong)', soft: 'var(--ica-bad-soft)', ink: 'var(--ica-bad-ink)' },
}

function getInitialRate(): 0.75 | 1 {
  if (typeof window === 'undefined') return 1

  const stored = window.localStorage.getItem(SPEAK_RATE_STORAGE_KEY)
  return stored === '0.75' ? 0.75 : 1
}

export function SpeakButton({
  text,
  langName,
  color,
  label,
  className,
  disabled,
  variant = 'default',
  isPlaying,
  onPlayingChange,
  prefetch = true,
}: SpeakButtonProps) {
  const [internalPlaying, setInternalPlaying] = useState(false)
  const [rate, setRate] = useState<0.75 | 1>(getInitialRate)
  const playing = isPlaying ?? internalPlaying

  const setPlaying = (next: boolean) => {
    if (isPlaying === undefined) {
      setInternalPlaying(next)
    }
    onPlayingChange?.(next)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SPEAK_RATE_STORAGE_KEY, String(rate))
  }, [rate])

  // The voice is prepared as soon as the button appears (a new word, a new phrase…), so the
  // first tap does not wait for it.
  useEffect(() => {
    if (!prefetch) return
    void prefetchSpeech(text, langName)
  }, [text, langName, prefetch])

  // Color del modo juego según el color de la frecuencia (azul por defecto).
  const colors =
    color === '#EF4444'
      ? SPEAK_TONES.bad
      : color === '#F97316'
        ? SPEAK_TONES.fire
        : color === '#EAB308'
          ? SPEAK_TONES.gold
          : color === '#22C55E'
            ? SPEAK_TONES.ok
            : SPEAK_TONES.i
  const toneStyle: CSSProperties = {
    background: colors.soft,
    color: colors.ink,
    borderColor: `color-mix(in oklab, ${colors.solid} 36%, transparent)`,
    boxShadow: `0 3px 0 color-mix(in oklab, ${colors.solid} 36%, transparent)`,
  }

  // When nothing could be played (Google voice and device voice both failed), say so instead of
  // silently going back to «Escuchar».
  const handleEnd = (result: SpeakResult) => {
    setPlaying(false)
    if (!result.ok) {
      toast.error(t('No se pudo reproducir el audio. Toca otra vez.'), { id: 'speak-button-failed' })
    }
  }

  const go = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (playing) {
      stopTTS()
      setPlaying(false)
      return
    }
    setPlaying(true)
    speakNatural(text, langName, handleEnd, rate)
  }

  const handleRate = (e: MouseEvent<HTMLButtonElement>, nextRate: 0.75 | 1) => {
    e.stopPropagation()
    setRate(nextRate)

    if (!playing) return

    stopTTS()
    setPlaying(true)
    speakNatural(text, langName, handleEnd, nextRate)
  }

  if (variant === 'icon') {
    return (
      <button
        type='button'
        onClick={go}
        disabled={disabled}
        aria-label={label || t('Escuchar {lang}', { lang: displayLangName(langName) })}
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-xl border-2 transition-[transform,box-shadow,filter] active:translate-y-[3px] active:shadow-none disabled:pointer-events-none disabled:opacity-50',
          playing ? 'brightness-110' : '',
          className,
        )}
        style={toneStyle}
      >
        {playing ? (
          <SquareIcon className='size-4' strokeWidth={2.6} fill='currentColor' />
        ) : (
          <Volume2Icon className='size-5' strokeWidth={2.4} />
        )}
      </button>
    )
  }

  // Selector de velocidad (x1 / x0.75) en dos mitades, como las pestañas del modo juego.
  const rateToggle = (
    <div className='inline-flex h-10 overflow-hidden rounded-xl border-2 border-border bg-card dark:bg-transparent' role='group' aria-label={t('Velocidad')}>
      {([1, 0.75] as const).map((option) => (
        <button
          key={option}
          type='button'
          onClick={(e) => handleRate(e, option)}
          disabled={playing || disabled}
          aria-pressed={rate === option}
          className={cn(
            'min-w-11 px-2.5 text-xs font-extrabold tabular-nums transition-colors disabled:opacity-60',
            option === 0.75 && 'border-l-2 border-border',
            rate === option ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60',
          )}
        >
          x{option}
        </button>
      ))}
    </div>
  )

  if (variant === 'cta') {
    return (
      <div className={cn('mt-4 flex flex-wrap items-center gap-2', className)}>
        <Button
          type='button'
          onClick={go}
          variant='default'
          disabled={disabled}
          className={cn('font-extrabold', playing ? 'brightness-110' : '')}
        >
          {playing ? t('Reproduciendo...') : label || t('Escuchar {lang}', { lang: displayLangName(langName) })}
          {playing ? (
            <SquareIcon className='ml-1 size-4' fill='currentColor' />
          ) : (
            <Volume2Icon className='ml-1 size-4' strokeWidth={2.4} />
          )}
        </Button>
        {rateToggle}
      </div>
    )
  }

  return (
    <div className={cn('mt-4 flex flex-wrap items-center gap-2', className)}>
      <button
        type='button'
        onClick={go}
        disabled={disabled}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-xl border-2 px-3.5 text-sm font-extrabold transition-[transform,box-shadow,filter] active:translate-y-[3px] active:shadow-none disabled:pointer-events-none disabled:opacity-50',
          playing ? 'brightness-110' : '',
        )}
        style={toneStyle}
      >
        {playing ? (
          <SquareIcon className='size-4' strokeWidth={2.6} fill='currentColor' />
        ) : (
          <Volume2Icon className='size-5' strokeWidth={2.4} />
        )}
        {playing ? t('Reproduciendo...') : label || t('Escuchar')}
      </button>
      {rateToggle}
    </div>
  )
}

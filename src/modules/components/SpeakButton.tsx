import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { speakNatural, stopTTS } from '../services/tts'
import { SquareIcon, Volume1Icon } from 'lucide-react'

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
}

const SPEAK_RATE_STORAGE_KEY = 'speak-button-rate'

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

  const tone =
    color === '#EF4444'
      ? 'border-red-500/40 bg-red-500/10 text-red-400'
      : color === '#F97316'
        ? 'border-orange-500/40 bg-orange-500/10 text-orange-400'
        : color === '#EAB308'
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
          : color === '#22C55E'
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
            : 'border-blue-500/40 bg-blue-500/10 text-blue-400'

  const go = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (playing) {
      stopTTS()
      setPlaying(false)
      return
    }
    setPlaying(true)
    speakNatural(text, langName, () => setPlaying(false), rate)
  }

  const handleRate = (e: MouseEvent<HTMLButtonElement>, nextRate: 0.75 | 1) => {
    e.stopPropagation()
    setRate(nextRate)

    if (!playing) return

    stopTTS()
    setPlaying(true)
    speakNatural(text, langName, () => setPlaying(false), nextRate)
  }

  if (variant === 'icon') {
    return (
      <Button
        type='button'
        onClick={go}
        variant='outline'
        size='icon'
        disabled={disabled}
        aria-label={label || `Escuchar ${langName}`}
        className={cn(tone, playing ? 'brightness-125' : '', className)}
      >
        {playing ? (
          <SquareIcon className='size-4' />
        ) : (
          <Volume1Icon className='size-4' />
        )}
      </Button>
    )
  }

  if (variant === 'cta') {
    return (
      <div className={cn('mt-4 flex flex-wrap items-center gap-2', className)}>
        <Button
          type='button'
          onClick={go}
          variant='default'
          disabled={disabled}
          className={cn('font-semibold', playing ? 'brightness-110' : '')}
        >
          {playing ? 'Reproduciendo...' : label || `Escuchar ${langName}`}
          {playing ? (
            <SquareIcon className='ml-1 size-4' />
          ) : (
            <Volume1Icon className='ml-1 size-4' />
          )}
        </Button>

        <div className='inline-flex overflow-hidden rounded-md border border-border'>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            onClick={(e) => handleRate(e, 1)}
            disabled={playing || disabled}
            className={cn('rounded-none px-3 text-xs', rate === 1 ? 'bg-muted text-foreground' : 'text-muted-foreground')}
          >
            x1
          </Button>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            onClick={(e) => handleRate(e, 0.75)}
            disabled={playing || disabled}
            className={cn('rounded-none border-l border-border px-3 text-xs', rate === 0.75 ? 'bg-muted text-foreground' : 'text-muted-foreground')}
          >
            x0.75
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('mt-4 flex flex-wrap items-center gap-2', className)}>
      <span className='text-xs text-muted-foreground'>
        {label || `Escuchar ${langName}`}
      </span>

      <Button
        type='button'
        size='sm'
        variant={rate === 1 ? 'default' : 'outline'}
        onClick={(e) => handleRate(e, 1)}
        disabled={playing || disabled}
      >
        x1
      </Button>
      <Button
        type='button'
        size='sm'
        variant={rate === 0.75 ? 'default' : 'outline'}
        onClick={(e) => handleRate(e, 0.75)}
        disabled={playing || disabled}
      >
        x0.75
      </Button>

      <Button
        type='button'
        onClick={go}
        variant='outline'
        disabled={disabled}
        className={`${tone} ${playing ? 'brightness-125' : ''}`}
      >
        {playing ? 'Reproduciendo...' : 'Escuchar'}
        {playing ? (
          <SquareIcon className='size-4 ml-1' />
        ) : (
          <Volume1Icon className='size-4 ml-1' />
        )}
      </Button>
    </div>
  )
}

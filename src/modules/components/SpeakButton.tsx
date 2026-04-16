import { useState } from 'react'
import type { MouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import { speakNatural, stopTTS } from '../services/tts'
import { Volume1Icon, SquareIcon } from 'lucide-react'

type SpeakButtonProps = {
  text: string
  langName: string
  color: string
  label?: string
  className?: string
}

export function SpeakButton({
  text,
  langName,
  color,
  label,
  className,
}: SpeakButtonProps) {
  const [s, setS] = useState(false)
  const [rate, setRate] = useState<0.75 | 1>(1)

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
    if (s) {
      stopTTS()
      setS(false)
      return
    }
    setS(true)
    speakNatural(text, langName, () => setS(false), rate)
  }

  const handleRate = (e: MouseEvent<HTMLButtonElement>, nextRate: 0.75 | 1) => {
    e.stopPropagation()
    setRate(nextRate)

    if (!s) return

    stopTTS()
    setS(true)
    speakNatural(text, langName, () => setS(false), nextRate)
  }

  return (
    <div
      className={`mt-4 flex flex-wrap items-center gap-2 ${className || ''}`}
    >
      <span className='text-xs text-muted-foreground'>
        {label || `Escuchar ${langName}`}
      </span>

      <Button
        type='button'
        size='sm'
        variant={rate === 1 ? 'default' : 'outline'}
        onClick={(e) => handleRate(e, 1)}
        disabled={s}
      >
        x1
      </Button>
      <Button
        type='button'
        size='sm'
        variant={rate === 0.75 ? 'default' : 'outline'}
        onClick={(e) => handleRate(e, 0.75)}
        disabled={s}
      >
        x0.75
      </Button>

      <Button
        type='button'
        onClick={go}
        variant='outline'
        className={`${tone} ${s ? 'brightness-125' : ''}`}
      >
        {s ? 'Reproduciendo...' : 'Escuchar'}
        {s ? (
          <SquareIcon className='size-4 ml-1' />
        ) : (
          <Volume1Icon className='size-4 ml-1' />
        )}
      </Button>
    </div>
  )
}

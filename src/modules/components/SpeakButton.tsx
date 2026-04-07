import { useState } from 'react'
import type { MouseEvent } from 'react'
import { speakNatural, stopTTS } from '../services/tts'

type SpeakButtonProps = {
  text: string
  langName: string
  color: string
}

export function SpeakButton({ text, langName, color }: SpeakButtonProps) {
  const [s, setS] = useState(false)

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
    speakNatural(text, langName, () => setS(false))
  }

  return (
    <button
      type='button'
      onClick={go}
      className={`mt-4 inline-flex items-center gap-2 rounded-xl border px-5 py-2 text-sm font-semibold ${tone} ${s ? 'brightness-125' : ''}`}
    >
      <svg
        width='16'
        height='16'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='2.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      >
        <polygon
          points='11 5 6 9 2 9 2 15 6 15 11 19 11 5'
          fill={s ? 'currentColor' : 'none'}
        />
        <path d='M15.54 8.46a5 5 0 0 1 0 7.07' />
        <path d='M19.07 4.93a10 10 0 0 1 0 14.14' />
      </svg>
      {s ? 'Reproduciendo...' : 'Escuchar pronunciación'}
    </button>
  )
}

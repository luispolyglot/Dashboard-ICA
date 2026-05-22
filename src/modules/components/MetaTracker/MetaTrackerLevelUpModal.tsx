import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import confetti from 'canvas-confetti'
import { Button } from '@/components/ui/button'

export type MetaTrackerLevelUpCelebration = {
  targetLang: string
  fromLevel: string
  toLevel: string
  fromTotalWords: number
  toTotalWords: number
  activatedWords: number
  nextLevel: string
  wordsToNext: number
}

type MetaTrackerLevelUpModalProps = {
  open: boolean
  celebration: MetaTrackerLevelUpCelebration | null
  onOpenChange: (open: boolean) => void
}

const formatLevelLabel = (level: string): string =>
  level.toLowerCase() === 'pre-a1' ? 'PRE-A1' : level

export function MetaTrackerLevelUpModal({
  open,
  celebration,
  onOpenChange,
}: MetaTrackerLevelUpModalProps) {
  const [phase, setPhase] = useState<'from' | 'to'>('from')
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    if (!open || !celebration) return

    setPhase('from')
    setShowDetails(false)
    const levelSwapTimeout = window.setTimeout(() => {
      setPhase('to')
      confetti({
        particleCount: 110,
        spread: 170,
        startVelocity: 24,
        gravity: 1,
        ticks: 280,
        origin: { x: 0.5, y: 0.3 },
        zIndex: 1300,
      })
    }, 720)

    const revealDetailsTimeout = window.setTimeout(() => {
      setShowDetails(true)
    }, 1500)

    return () => {
      window.clearTimeout(levelSwapTimeout)
      window.clearTimeout(revealDetailsTimeout)
    }
  }, [open, celebration])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onOpenChange])

  if (!celebration || !open) return null

  return (
    <div
      className='fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm'
      onClick={() => onOpenChange(false)}
      role='presentation'
    >
      <style>
        {`@keyframes metaLevelFadeOut { 0% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(0.9); } }
          @keyframes metaLevelPopBounce { 0% { opacity: 0; transform: scale(10); } 65% { opacity: 1; transform: scale(0.86); } 82% { transform: scale(1.08); } 100% { opacity: 1; transform: scale(1); } }
          @keyframes metaCardEnter { 0% { opacity: 0; transform: translateY(14px); } 100% { opacity: 1; transform: translateY(0); } }
          @keyframes metaDetailsFadeIn { 0% { opacity: 0; transform: translateY(8px); } 100% { opacity: 1; transform: translateY(0); } }
        `}
      </style>

      <div
        className={`relative w-full max-w-xl p-6 text-white transition-all duration-300 ${
          showDetails
            ? 'rounded-2xl border border-white/15 bg-[#0b1220f2] shadow-2xl'
            : 'border border-transparent bg-transparent shadow-none'
        }`}
        onClick={(event) => event.stopPropagation()}
        style={{ animation: 'metaCardEnter 260ms ease-out both' }}
      >
        {showDetails && (
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            onClick={() => onOpenChange(false)}
            aria-label='Cerrar celebracion'
            className='absolute top-4 right-4 z-10 border border-white/20 text-white/85 hover:bg-white/10 hover:text-white'
          >
            <X />
          </Button>
        )}

        <div
          className={`mt-6 flex min-h-[180px] items-center justify-center transition-all duration-300 ${
            showDetails
              ? 'rounded-xl border border-white/15 bg-white/5'
              : 'rounded-none border border-transparent bg-transparent'
          }`}
        >
          {phase === 'from' ? (
            <div
              className='text-5xl font-black tracking-tight text-slate-200 sm:text-6xl'
              style={{ animation: 'metaLevelFadeOut 700ms ease-in forwards' }}
            >
              {formatLevelLabel(celebration.fromLevel)}
            </div>
          ) : (
            <div
              className='text-6xl font-black tracking-tight text-emerald-300 sm:text-7xl'
              style={{ animation: 'metaLevelPopBounce 620ms cubic-bezier(.2,.88,.22,1.25) both' }}
            >
              {formatLevelLabel(celebration.toLevel)}
            </div>
          )}
        </div>

        <div
          className='mt-4'
          style={{
            opacity: showDetails ? 1 : 0,
            animation: showDetails ? 'metaDetailsFadeIn 320ms ease-out both' : 'none',
            pointerEvents: showDetails ? 'auto' : 'none',
          }}
        >
          <h3 className='text-3xl font-bold sm:text-4xl'>Subiste de nivel</h3>
          <p className='mt-2 text-base text-slate-200'>
            Pasaste de {formatLevelLabel(celebration.fromLevel)} a{' '}
            {formatLevelLabel(celebration.toLevel)} en {celebration.targetLang}.
          </p>

          <div className='mt-4 rounded-lg border border-emerald-300/35 bg-emerald-500/10 p-4'>
            <p className='text-base font-semibold text-emerald-200'>
              +{celebration.activatedWords} palabras activadas
            </p>
            <p className='mt-1 text-sm text-slate-200'>
              {celebration.fromTotalWords} {'->'} {celebration.toTotalWords} palabras
            </p>
          </div>

          {celebration.wordsToNext > 0 && (
            <div className='mt-3 rounded-lg border border-cyan-300/30 bg-cyan-500/8 p-4'>
              <p className='text-sm font-semibold text-cyan-200'>
                Proximo nivel: {formatLevelLabel(celebration.nextLevel)}
              </p>
              <p className='mt-1 text-sm text-slate-200'>
                Te faltan {celebration.wordsToNext} palabras para alcanzarlo.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

import { LockIcon, PlayIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CHALLENGE_UNLOCK_RATIO } from '../../services/challengeUnlocks'

type NotaDesafianteCardProps = {
  /** 0–1: cuánto falta para desbloquear (1 = desbloqueada). */
  progress: number
  unlocked: boolean
  isPlayingThisNote: boolean
  onListen: () => void
  onStart: () => void
  className?: string
}

const UNLOCK_PERCENT = Math.round(CHALLENGE_UNLOCK_RATIO * 100)

/**
 * Tarjeta visible de la nota desafiante dentro de una nota maestra.
 * Bloqueada hasta escuchar el 80 % de la nota hoy; después, botón para empezar.
 */
export function NotaDesafianteCard({
  progress,
  unlocked,
  isPlayingThisNote,
  onListen,
  onStart,
  className,
}: NotaDesafianteCardProps) {
  // Lo que se muestra es el % de la nota escuchado (0–80 %), no el % del objetivo.
  const listenedPercent = Math.round(progress * UNLOCK_PERCENT)

  return (
    <div
      className={cn(
        'mb-4 overflow-hidden rounded-2xl border p-4 transition-colors',
        unlocked
          ? 'border-sky-400/60 bg-gradient-to-br from-sky-500/15 via-sky-500/5 to-transparent shadow-[0_0_28px_-14px_rgba(56,189,248,0.9)]'
          : 'border-border/70 bg-muted/30',
        className,
      )}
    >
      <div className='flex items-start gap-3'>
        <div
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-xl text-2xl',
            unlocked ? 'bg-sky-500/20' : 'bg-muted',
          )}
          aria-hidden='true'
        >
          {unlocked ? '🎯' : <LockIcon className='size-5 text-muted-foreground' />}
        </div>
        <div className='min-w-0 flex-1'>
          <p className='text-[11px] font-semibold tracking-[0.12em] text-sky-600 uppercase dark:text-sky-300'>
            Nota desafiante
          </p>
          <p className='font-serif text-lg leading-snug font-bold'>
            {unlocked ? '¿Te la sabes de memoria?' : 'Escúchala para desbloquearla'}
          </p>
          <p className='mt-0.5 text-sm text-muted-foreground'>
            {unlocked
              ? 'Oirás cada trozo en tu idioma y lo dirás de memoria. Abierta hasta el final del día.'
              : `Escucha al menos el ${UNLOCK_PERCENT} % de esta nota hoy. Cada día se vuelve a bloquear.`}
          </p>
        </div>
      </div>

      {!unlocked && (
        <div className='mt-3'>
          <div className='mb-1 flex justify-between text-xs text-muted-foreground'>
            <span>{isPlayingThisNote ? 'Escuchando…' : 'Escuchado hoy'}</span>
            <span className='tabular-nums font-semibold text-foreground'>
              {listenedPercent} % / {UNLOCK_PERCENT} %
            </span>
          </div>
          <div
            className='h-2 w-full overflow-hidden rounded-full bg-muted'
            role='progressbar'
            aria-valuemin={0}
            aria-valuemax={UNLOCK_PERCENT}
            aria-valuenow={listenedPercent}
            aria-label='Porcentaje de la nota escuchado hoy'
          >
            <div
              className='h-full rounded-full bg-sky-500 transition-[width] duration-500'
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className='mt-3'>
        {unlocked ? (
          <Button type='button' className='h-11 w-full text-base font-bold' onClick={onStart}>
            🎯 Empezar nota desafiante
          </Button>
        ) : (
          !isPlayingThisNote && (
            <Button type='button' variant='outline' className='w-full' onClick={onListen}>
              <PlayIcon className='mr-1 size-4' />
              Escuchar la nota
            </Button>
          )
        )}
      </div>
    </div>
  )
}

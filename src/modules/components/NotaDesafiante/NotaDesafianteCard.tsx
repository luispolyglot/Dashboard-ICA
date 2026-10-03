import { LockIcon, PlayIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TargetGlyph } from '../../game/icons'
import { IconTile, Panel, tone } from '../../game/ui'
import { CHALLENGE_UNLOCK_RATIO } from '../../services/challengeUnlocks'
import { t } from '@/i18n'

type NotaDesafianteCardProps = {
  /** Solo las notas cerradas (completas) tienen nota desafiante. */
  noteClosed: boolean
  /** 0–1: cuánto falta para desbloquear (1 = desbloqueada). */
  progress: number
  unlocked: boolean
  isPlayingThisNote: boolean
  onListen: () => void
  onStart: () => void
  className?: string
}

const UNLOCK_PERCENT = Math.round(CHALLENGE_UNLOCK_RATIO * 100)

/** La diana con un candado encima (nota desafiante bloqueada). */
function LockedTarget() {
  return (
    <span className='relative'>
      <IconTile tone='neutral' size={52}>
        <span className='opacity-45 grayscale'>
          <TargetGlyph size={32} />
        </span>
      </IconTile>
      <span
        className='absolute -right-1.5 -bottom-1.5 flex size-6 items-center justify-center rounded-full border-2 border-card'
        style={{ background: 'var(--muted-foreground)' }}
      >
        <LockIcon className='size-3 text-white' strokeWidth={3} aria-hidden='true' />
      </span>
    </span>
  )
}

function Eyebrow() {
  return (
    <p className='m-0 text-xs font-extrabold tracking-[0.08em] uppercase' style={{ color: tone('a').ink }}>
      {t('Nota desafiante')}
    </p>
  )
}

/**
 * Tarjeta visible de la nota desafiante dentro de una nota maestra.
 * Bloqueada hasta escuchar el 80 % de la nota esta semana; después, botón para empezar.
 */
export function NotaDesafianteCard({
  noteClosed,
  progress,
  unlocked,
  isPlayingThisNote,
  onListen,
  onStart,
  className,
}: NotaDesafianteCardProps) {
  // Lo que se muestra es el % de la nota escuchado (0–80 %), no el % del objetivo.
  const listenedPercent = Math.round(progress * UNLOCK_PERCENT)

  // Nota abierta: primero hay que completarla; la escucha todavía no cuenta.
  if (!noteClosed) {
    return (
      <Panel className={cn('flex items-start gap-4', className)}>
        <LockedTarget />
        <div className='min-w-0 flex-1'>
          <Eyebrow />
          <p className='m-0 mt-0.5 text-lg leading-snug font-extrabold'>{t('Completa esta nota para desbloquearla')}</p>
          <p className='m-0 mt-1 text-sm font-semibold text-muted-foreground'>
            {t('Cuando la nota llegue a 3:00 y se complete, escucha al menos el {pct} % y podrás hacer su nota desafiante.', { pct: UNLOCK_PERCENT })}
          </p>
        </div>
      </Panel>
    )
  }

  if (unlocked) {
    return (
      <Panel tone='gold' className={cn('p-5', className)}>
        <div className='flex items-center gap-4'>
          <span className='ica-bob flex size-16 shrink-0 items-center justify-center rounded-3xl bg-card'>
            <TargetGlyph size={44} />
          </span>
          <div className='min-w-0 flex-1'>
            <Eyebrow />
            <p className='m-0 mt-0.5 text-xl leading-tight font-black tracking-tight'>{t('¿Te la sabes de memoria?')}</p>
            <p className='m-0 mt-1 text-sm font-semibold text-muted-foreground'>
              {t('Oirás cada trozo en tu idioma y lo dirás de memoria. Abierta hasta el final del día.')}
            </p>
          </div>
        </div>
        <Button type='button' size='xl' variant='a' className='mt-4 w-full' onClick={onStart}>
          {t('Empezar nota desafiante')}
        </Button>
      </Panel>
    )
  }

  return (
    <Panel className={cn('p-5', className)}>
      <div className='flex items-start gap-4'>
        <LockedTarget />
        <div className='min-w-0 flex-1'>
          <Eyebrow />
          <p className='m-0 mt-0.5 text-lg leading-snug font-extrabold'>{t('Escúchala para desbloquearla')}</p>
          <p className='m-0 mt-1 text-sm font-semibold text-muted-foreground'>
            {t('Escucha al menos el {pct} % de esta nota. Queda abierta hasta el domingo; el lunes se vuelve a bloquear.', { pct: UNLOCK_PERCENT })}
          </p>
        </div>
      </div>

      <div className='mt-4'>
        <div className='mb-1.5 flex justify-between text-sm font-extrabold'>
          <span className='text-muted-foreground'>{isPlayingThisNote ? t('Escuchando…') : t('Escuchado esta semana')}</span>
          <span className='tabular-nums' style={{ color: 'var(--ica-gold-ink)' }}>
            {listenedPercent} % / {UNLOCK_PERCENT} %
          </span>
        </div>
        <div
          className='relative h-3.5 w-full overflow-hidden rounded-full bg-muted'
          role='progressbar'
          aria-valuemin={0}
          aria-valuemax={UNLOCK_PERCENT}
          aria-valuenow={listenedPercent}
          aria-label={t('Porcentaje de la nota escuchado esta semana')}
        >
          <div
            className='h-full rounded-full transition-[width] duration-500'
            style={{
              width: `${progress > 0 ? Math.max(4, Math.round(progress * 100)) : 0}%`,
              background: 'var(--ica-gold)',
            }}
          />
        </div>
      </div>

      {!isPlayingThisNote && (
        <Button type='button' size='lg' variant='outline' className='mt-4 w-full' onClick={onListen}>
          <PlayIcon className='size-4 fill-current' strokeWidth={2.4} />
          {t('Escuchar la nota')}
        </Button>
      )}
    </Panel>
  )
}

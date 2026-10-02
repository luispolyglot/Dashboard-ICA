import { cn } from '@/lib/utils'
import { Pill } from '../game/ui'
import { t } from '@/i18n'
import {
  MASTER_NOTE_COMPLETE_DURATION_MS,
  formatMasterNoteLabel,
} from '../services/masterNotes'

type MasterNoteProgressBarProps = {
  noteName: string | null | undefined
  /** Tiempo ya guardado en la nota (ms). */
  savedMs: number
  /** Tiempo que se está grabando ahora o el del borrador sin guardar (ms). */
  pendingMs?: number
  recording?: boolean
  /** Muestra el nombre de la nota encima del tiempo (si ya sale en otro sitio, se oculta). */
  showName?: boolean
  className?: string
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * Progreso de la nota maestra: "Nota Maestra 2 · 2:10 / 3:00" en grande y la barra gruesa.
 * La parte sólida es lo guardado; la parte clara, lo que se está grabando.
 */
export function MasterNoteProgressBar({
  noteName,
  savedMs,
  pendingMs = 0,
  recording = false,
  showName = true,
  className,
}: MasterNoteProgressBarProps) {
  const goal = MASTER_NOTE_COMPLETE_DURATION_MS
  const safeSaved = Math.max(0, savedMs)
  const safePending = Math.max(0, pendingMs)
  const total = safeSaved + safePending
  const savedPct = Math.min(100, (safeSaved / goal) * 100)
  const totalPct = Math.min(100, (total / goal) * 100)
  const willComplete = total >= goal
  const remainingMs = Math.max(0, goal - total)
  const solid = willComplete ? 'var(--ica-ok)' : 'var(--ica-a)'
  const ink = willComplete ? 'var(--ica-ok-ink)' : 'var(--ica-a-ink)'

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className='flex items-end justify-between gap-3'>
        <div className='min-w-0'>
          {showName ? <p className='ica-label m-0 mb-1 truncate'>{formatMasterNoteLabel(noteName)}</p> : null}
          <p className='m-0 text-3xl leading-none font-black tabular-nums' style={{ color: ink }}>
            {formatDuration(total)}
            <span className='ml-1 text-base font-extrabold text-muted-foreground'>/ {formatDuration(goal)}</span>
          </p>
        </div>
        {willComplete ? (
          <Pill tone='ok' solid>
            ✓ {t('Completa')}
          </Pill>
        ) : null}
      </div>

      <div
        className='relative h-4 w-full overflow-hidden rounded-full bg-muted'
        role='progressbar'
        aria-valuemin={0}
        aria-valuemax={Math.round(goal / 1000)}
        aria-valuenow={Math.round(Math.min(total, goal) / 1000)}
        aria-label={t('{note}: {done} de {goal}', { note: formatMasterNoteLabel(noteName), done: formatDuration(total), goal: formatDuration(goal) })}
      >
        {/* Lo que se está grabando (más claro) */}
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-[width] duration-300',
            recording && 'animate-pulse',
          )}
          style={{ width: `${totalPct}%`, background: `color-mix(in oklab, ${solid} 40%, transparent)` }}
        />
        {/* Lo ya guardado */}
        <div
          className='absolute inset-y-0 left-0 rounded-full transition-[width] duration-300'
          style={{ width: `${savedPct > 0 ? Math.max(savedPct, 4) : 0}%`, background: solid }}
        />
        {savedPct > 6 ? (
          <span
            className='absolute top-[3px] left-2 h-1 rounded-full bg-white/35'
            style={{ width: `calc(${savedPct}% - 1rem)` }}
            aria-hidden='true'
          />
        ) : null}
      </div>

      <p className='m-0 text-xs font-semibold text-muted-foreground'>
        {willComplete
          ? safePending > 0
            ? t('Al guardar esta grabación, completarás la nota.')
            : t('Nota lista para completarse.')
          : t('Te faltan {time} para completar la nota.', { time: formatDuration(remainingMs) })}
      </p>
    </div>
  )
}

import { cn } from '@/lib/utils'
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
  className?: string
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * Barra "Nota Maestra 2 · 2:10 / 3:00".
 * La parte sólida es lo guardado; la parte clara, lo que se está grabando.
 */
export function MasterNoteProgressBar({
  noteName,
  savedMs,
  pendingMs = 0,
  recording = false,
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

  return (
    <div className={cn('rounded-xl border border-border/70 bg-muted/30 p-3', className)}>
      <div className='mb-1.5 flex items-baseline justify-between gap-2 text-sm'>
        <span className='font-semibold'>
          {formatMasterNoteLabel(noteName)}
        </span>
        <span
          className={cn(
            'tabular-nums font-semibold',
            willComplete ? 'text-emerald-500' : 'text-foreground',
          )}
        >
          {formatDuration(total)} / {formatDuration(goal)}
        </span>
      </div>

      <div
        className='relative h-2.5 w-full overflow-hidden rounded-full bg-muted'
        role='progressbar'
        aria-valuemin={0}
        aria-valuemax={Math.round(goal / 1000)}
        aria-valuenow={Math.round(Math.min(total, goal) / 1000)}
        aria-label={`${formatMasterNoteLabel(noteName)}: ${formatDuration(total)} de ${formatDuration(goal)}`}
      >
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-[width] duration-300',
            willComplete ? 'bg-emerald-500/45' : 'bg-primary/40',
            recording && 'animate-pulse',
          )}
          style={{ width: `${totalPct}%` }}
        />
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-[width] duration-300',
            willComplete ? 'bg-emerald-500' : 'bg-primary',
          )}
          style={{ width: `${savedPct}%` }}
        />
      </div>

      <p className='mt-1.5 text-xs text-muted-foreground'>
        {willComplete
          ? safePending > 0
            ? '✨ Al guardar esta grabación, completarás la nota.'
            : '✨ Nota lista para completarse.'
          : `Te faltan ${formatDuration(remainingMs)} para completar la nota.`}
      </p>
    </div>
  )
}

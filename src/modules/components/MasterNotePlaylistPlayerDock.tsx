import {
  ListMusicIcon,
  PauseIcon,
  PlayIcon,
  RepeatOffIcon,
  RepeatIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SkipBackIcon,
  SkipForwardIcon,
  XIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GameProgress, IconTile, tone } from '../game/ui'
import { formatMasterNoteLabel } from '../services/masterNotes'
import { RoundActionButton, SquareIconButton } from './MasterNoteGameUi'
import { t } from '@/i18n'

type MasterNotePlaylistPlayerDockProps = {
  open: boolean
  playlistName: string
  noteName: string
  progressSec: number
  durationSec: number
  currentIndex: number
  totalCount: number
  paused: boolean
  repeatEnabled: boolean
  onTogglePause: () => void
  onToggleRepeat: () => void
  onSeekBack10: () => void
  onSeekForward10: () => void
  onPrevious: () => void
  onNext: () => void
  onClose: () => void
  extraClassname?: string
}

function formatSeconds(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

export function MasterNotePlaylistPlayerDock({
  open,
  playlistName,
  noteName,
  progressSec,
  durationSec,
  currentIndex,
  totalCount,
  paused,
  repeatEnabled,
  onTogglePause,
  onToggleRepeat,
  onSeekBack10,
  onSeekForward10,
  onPrevious,
  onNext,
  onClose,
  extraClassname = '',
}: MasterNotePlaylistPlayerDockProps) {
  if (!open) return null

  const safeDuration = Math.max(1, durationSec)
  const progressValue = Math.max(0, Math.min(1, progressSec / safeDuration))

  // Reproductor fijo abajo: tarjeta blanca con canto, acentos rojos de la A.
  return (
    <div
      className={`fixed inset-x-0 bottom-20 z-40 border-t-2 border-border bg-card px-4 pt-3 pb-[calc(0.85rem+env(safe-area-inset-bottom))] text-foreground shadow-[0_-8px_30px_color-mix(in_oklab,var(--foreground)_10%,transparent)] lg:bottom-0 lg:z-50 ${extraClassname}`}
    >
      <div className='mx-auto flex w-full max-w-xl items-center gap-3'>
        <IconTile tone='a' solid size={44} className='rounded-xl'>
          <ListMusicIcon className='size-5.5' strokeWidth={2.4} />
        </IconTile>
        <div className='min-w-0 flex-1'>
          <p className='m-0 truncate leading-tight font-extrabold'>{formatMasterNoteLabel(noteName)}</p>
          <p className='m-0 mt-0.5 truncate text-xs font-semibold text-muted-foreground'>
            {playlistName} · <span className='tabular-nums'>{currentIndex + 1}/{totalCount}</span>
          </p>
        </div>
        <button
          type='button'
          onClick={onToggleRepeat}
          aria-label={repeatEnabled ? t('Desactivar bucle') : t('Activar bucle')}
          aria-pressed={repeatEnabled}
          className='flex size-10 shrink-0 items-center justify-center rounded-xl border-2 transition-colors'
          style={
            repeatEnabled
              ? { background: tone('a').soft, color: tone('a').ink, borderColor: 'color-mix(in oklab, var(--ica-a) 40%, transparent)' }
              : { borderColor: 'var(--border)', color: 'var(--muted-foreground)' }
          }
        >
          {repeatEnabled ? (
            <RepeatIcon className='size-4.5' strokeWidth={2.6} />
          ) : (
            <RepeatOffIcon className='size-4.5' strokeWidth={2.6} />
          )}
        </button>
        <Button
          type='button'
          size='icon'
          variant='ghost'
          className='shrink-0 rounded-xl text-muted-foreground'
          onClick={onClose}
          aria-label={t('Cerrar reproductor')}
        >
          <XIcon className='size-5' strokeWidth={2.6} />
        </Button>
      </div>

      <div className='mx-auto mt-3 w-full max-w-xl'>
        <GameProgress value={progressValue} color='var(--ica-a)' height={10} />
        <div className='mt-1 flex items-center justify-between text-[11px] font-extrabold text-muted-foreground tabular-nums'>
          <span>{formatSeconds(progressSec)}</span>
          <span>{formatSeconds(durationSec)}</span>
        </div>
      </div>

      <div className='mx-auto mt-1 flex w-full max-w-xl items-center justify-center gap-3 lg:gap-5'>
        <Button
          type='button'
          size='icon-lg'
          variant='ghost'
          className='rounded-xl'
          onClick={onPrevious}
          aria-label={t('Anterior')}
        >
          <SkipBackIcon className='size-6 fill-current' strokeWidth={2.2} />
        </Button>
        <SquareIconButton onClick={onSeekBack10} ariaLabel={t('Retroceder 10 segundos')}>
          <span className='relative flex items-center justify-center'>
            <RotateCcwIcon className='size-5' strokeWidth={2.4} />
            <span className='absolute -right-1.5 -bottom-1.5 text-[9px] font-black'>10</span>
          </span>
        </SquareIconButton>
        <RoundActionButton size={60} onClick={onTogglePause} ariaLabel={paused ? t('Reanudar') : t('Pausar')}>
          {paused ? (
            <PlayIcon className='ml-1 size-7 fill-current' strokeWidth={2.4} />
          ) : (
            <PauseIcon className='size-7 fill-current' strokeWidth={2.4} />
          )}
        </RoundActionButton>
        <SquareIconButton onClick={onSeekForward10} ariaLabel={t('Adelantar 10 segundos')}>
          <span className='relative flex items-center justify-center'>
            <RotateCwIcon className='size-5' strokeWidth={2.4} />
            <span className='absolute -right-1.5 -bottom-1.5 text-[9px] font-black'>10</span>
          </span>
        </SquareIconButton>
        <Button
          type='button'
          size='icon-lg'
          variant='ghost'
          className='rounded-xl'
          onClick={onNext}
          aria-label={t('Siguiente')}
        >
          <SkipForwardIcon className='size-6 fill-current' strokeWidth={2.2} />
        </Button>
      </div>
    </div>
  )
}

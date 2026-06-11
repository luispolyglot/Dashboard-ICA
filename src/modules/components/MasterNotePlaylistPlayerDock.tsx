import {
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SkipBackIcon,
  SkipForwardIcon,
  XIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

type MasterNotePlaylistPlayerDockProps = {
  open: boolean
  playlistName: string
  noteName: string
  progressSec: number
  durationSec: number
  currentIndex: number
  totalCount: number
  paused: boolean
  onTogglePause: () => void
  onSeekBack10: () => void
  onSeekForward10: () => void
  onPrevious: () => void
  onNext: () => void
  onClose: () => void
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
  onTogglePause,
  onSeekBack10,
  onSeekForward10,
  onPrevious,
  onNext,
  onClose,
}: MasterNotePlaylistPlayerDockProps) {
  if (!open) return null

  const safeDuration = Math.max(1, durationSec)
  const progressPercent = Math.max(
    0,
    Math.min(100, (progressSec / safeDuration) * 100),
  )

  return (
    <div className='fixed inset-x-0 bottom-0 z-50 border-t border-white/20 bg-[radial-gradient(circle_at_20%_0%,_#334155_0%,_#111827_55%,_#020617_100%)] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 text-white shadow-[0_-10px_40px_rgba(2,6,23,0.6)]'>
      <div className='mx-auto flex w-full max-w-5xl items-start justify-between gap-3'>
        <div className='min-w-0 flex-1'>
          <p className='truncate text-sm font-semibold'>{noteName}</p>
          <p className='truncate text-xs text-white/70'>
            {playlistName} · {currentIndex + 1}/{totalCount}
          </p>
        </div>
        <Button
          type='button'
          size='icon'
          variant='ghost'
          className='text-white hover:bg-white/10 hover:text-white'
          onClick={onClose}
          aria-label='Cerrar reproductor'
        >
          <XIcon className='size-5' />
        </Button>
      </div>

      <div className='mx-auto mt-3 w-full max-w-5xl'>
        <div className='h-1.5 w-full rounded-full bg-white/20'>
          <div
            className='h-full rounded-full bg-white transition-all duration-200'
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className='mt-1 flex items-center justify-between text-[11px] text-white/75'>
          <span>{formatSeconds(progressSec)}</span>
          <span>{formatSeconds(durationSec)}</span>
        </div>
      </div>

      <div className='mx-auto mt-3 flex w-full max-w-5xl items-center justify-center gap-6'>
        <Button
          type='button'
          size='icon'
          variant='ghost'
          className='relative text-white hover:bg-white/10 hover:text-white'
          onClick={onSeekBack10}
          aria-label='Retroceder 10 segundos'
        >
          <RotateCcwIcon className='size-4' />
          <span className='absolute -right-1 -bottom-1 text-[9px] font-bold'>10</span>
        </Button>

        <Button
          type='button'
          size='icon-lg'
          variant='ghost'
          className='text-white hover:bg-white/10 hover:text-white'
          onClick={onPrevious}
          aria-label='Anterior'
        >
          <SkipBackIcon className='size-6' />
        </Button>

        <Button
          type='button'
          size='icon-lg'
          className='size-16 rounded-full bg-white text-slate-950 hover:bg-white/90'
          onClick={onTogglePause}
          aria-label={paused ? 'Reanudar' : 'Pausar'}
        >
          {paused ? <PlayIcon className='size-8' /> : <PauseIcon className='size-8' />}
        </Button>

        <Button
          type='button'
          size='icon'
          variant='ghost'
          className='relative text-white hover:bg-white/10 hover:text-white'
          onClick={onSeekForward10}
          aria-label='Adelantar 10 segundos'
        >
          <RotateCwIcon className='size-4' />
          <span className='absolute -right-1 -bottom-1 text-[9px] font-bold'>10</span>
        </Button>

        <Button
          type='button'
          size='icon-lg'
          variant='ghost'
          className='text-white hover:bg-white/10 hover:text-white'
          onClick={onNext}
          aria-label='Siguiente'
        >
          <SkipForwardIcon className='size-6' />
        </Button>
      </div>
    </div>
  )
}

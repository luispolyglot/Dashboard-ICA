import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HeadphonesIcon, PauseIcon, PlayIcon, XIcon } from 'lucide-react'
import { useMasterNotePlayback } from '../hooks/useMasterNotePlayback'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { t } from '@/i18n'

// MASTER NOTE IN THE BACKGROUND (Luis, 5 Oct): a master note keeps playing while the student
// moves around the app. The list and the note screen share one player that lives in the layout
// (it is not destroyed when the screen changes), and on the other screens a small player stays at
// the top. The challenge game keeps its own player (useMasterNotePlayback) and stops this one.

type SharedPlayback = ReturnType<typeof useMasterNotePlayback>

const SharedPlaybackContext = createContext<SharedPlayback | null>(null)

export function MasterNotePlaybackProvider({ children }: { children: ReactNode }) {
  const playback = useMasterNotePlayback()
  return <SharedPlaybackContext.Provider value={playback}>{children}</SharedPlaybackContext.Provider>
}

/** The master note player shared by the whole app (needs MasterNotePlaybackProvider). */
export function useSharedMasterNotePlayback(): SharedPlayback {
  const playback = useContext(SharedPlaybackContext)
  if (!playback) throw new Error('useSharedMasterNotePlayback needs MasterNotePlaybackProvider')
  return playback
}

/** Same, but null outside the provider (to stop it from screens that may live elsewhere). */
export function useOptionalSharedMasterNotePlayback(): SharedPlayback | null {
  return useContext(SharedPlaybackContext)
}

/** Screens with their own audio (the challenge game) stop the shared note when they open. */
export function useStopSharedMasterNote(): void {
  const playback = useOptionalSharedMasterNotePlayback()
  const playingId = playback?.playingNoteId ?? null
  const stop = playback?.stop
  const stoppedRef = useRef(false)
  useEffect(() => {
    if (stoppedRef.current || !playingId || !stop) return
    stoppedRef.current = true
    stop()
  }, [playingId, stop])
}

const formatTime = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** Small player at the top while a master note plays and you are on another screen. */
export function MasterNoteMiniPlayer() {
  const playback = useOptionalSharedMasterNotePlayback()
  const location = useLocation()
  const navigate = useNavigate()
  if (!playback?.playingNoteId) return null

  const notePath = `${DASHBOARD_ROUTES.masterNotes}/note/${playback.playingNoteId}`
  // The list and the note itself already have their own controls.
  const path = location.pathname.replace(/\/$/, '')
  if (path === DASHBOARD_ROUTES.masterNotes || path === notePath) return null

  return (
    <MasterNoteMiniPlayerBar
      name={playback.playingNoteName || t('Nota maestra')}
      isPaused={playback.isPaused}
      positionSec={playback.positionSec}
      durationSec={playback.durationSec}
      onOpen={() => navigate(notePath)}
      onTogglePause={playback.togglePause}
      onStop={playback.stop}
    />
  )
}

/** The bar itself (no logic), so it can also be previewed on its own. */
export function MasterNoteMiniPlayerBar({
  name,
  isPaused,
  positionSec,
  durationSec,
  onOpen,
  onTogglePause,
  onStop,
}: {
  name: string
  isPaused: boolean
  positionSec: number
  durationSec: number
  onOpen: () => void
  onTogglePause: () => void
  onStop: () => void
}) {
  const progress = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0
  return (
    <div className='shrink-0 px-2.5 pt-2 md:px-4'>
      <div className='relative mx-auto flex w-full max-w-2xl items-center gap-2 overflow-hidden rounded-2xl border-2 border-border bg-card py-1.5 pr-1.5 pl-2 shadow-sm'>
        <button
          type='button'
          onClick={onOpen}
          className='flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-0.5 text-left hover:bg-muted/70'
          aria-label={t('Abrir la nota maestra {name}', { name })}
        >
          <span
            className='flex size-9 shrink-0 items-center justify-center rounded-xl text-white'
            style={{ background: 'var(--ica-a)' }}
            aria-hidden='true'
          >
            <HeadphonesIcon className='size-5' strokeWidth={2.6} />
          </span>
          <span className='min-w-0 flex-1'>
            <span className='block text-[11px] font-black tracking-[0.08em] text-muted-foreground uppercase'>
              {isPaused ? t('En pausa') : t('Escuchando')}
            </span>
            <span className='block truncate text-sm font-extrabold'>{name}</span>
          </span>
          <span className='shrink-0 text-xs font-bold text-muted-foreground tabular-nums'>
            {formatTime(positionSec)}
            {durationSec > 0 ? ` / ${formatTime(durationSec)}` : ''}
          </span>
        </button>
        <button
          type='button'
          onClick={onTogglePause}
          className='flex size-10 shrink-0 items-center justify-center rounded-full text-white transition-transform active:scale-95'
          style={{ background: 'var(--ica-a)' }}
          aria-label={isPaused ? t('Seguir escuchando') : t('Pausar')}
        >
          {isPaused ? (
            <PlayIcon className='ml-0.5 size-5 fill-current' strokeWidth={2.4} />
          ) : (
            <PauseIcon className='size-5 fill-current' strokeWidth={2.4} />
          )}
        </button>
        <button
          type='button'
          onClick={onStop}
          className='flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted'
          aria-label={t('Dejar de escuchar')}
        >
          <XIcon className='size-5' strokeWidth={2.6} />
        </button>
        <span
          className='absolute bottom-0 left-0 h-[3px]'
          style={{ width: `${progress * 100}%`, background: 'var(--ica-a)' }}
          aria-hidden='true'
        />
      </div>
    </div>
  )
}

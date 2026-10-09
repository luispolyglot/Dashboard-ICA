import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ChevronDownIcon,
  DownloadIcon,
  ListMusicIcon,
  Loader2Icon,
  MicIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SquareIcon,
  Trash2Icon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { IcaDeletionWarningDialog } from '../components/IcaDeletionWarningDialog'
import {
  MasterNotePlaylistEditorDialog,
  type PlaylistEditorNoteOption,
} from '../components/MasterNotePlaylistEditorDialog'
import { MasterNotePlaylistPlayerDock } from '../components/MasterNotePlaylistPlayerDock'
import { MasterNoteProgressBar } from '../components/MasterNoteProgressBar'
import {
  ErrorNote,
  MENU_CONTENT_CLASS,
  MENU_ITEM_CLASS,
  NotePlayerControls,
  NoteNumberTile,
  RoundActionButton,
  formatDuration,
  formatShortDate,
  moreMenuTrigger,
} from '../components/MasterNoteGameUi'
import {
  getMetaTrackerLevelColor,
} from '../components/MetaTracker/colors'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { useSharedMasterNotePlayback } from '../components/MasterNotePlaybackProvider'
import { useLoopedMasterNotePlayback } from '../hooks/useLoopedMasterNotePlayback'
import {
  getLoopCuePlaybackSource,
  warmLoopCueOfflineCache,
} from '../audio/loopCueCache'
import { formatDate } from '../utils'
import {
  createMasterNote,
  deleteMasterNote,
  downloadMasterNoteAudio,
  fetchMasterNotes,
  formatMasterNoteLabel,
} from '../services/masterNotes'
import { useMasterNotePlaylists } from '../hooks/useMasterNotePlaylists'
import { NotaDesafianteChip } from '../components/NotaDesafiante/NotaDesafianteChip'
import { useChallengeEnabled } from '../services/challengeChunks'
import { CHALLENGE_UNLOCK_RATIO } from '../services/challengeUnlocks'
import { CHALLENGE_NOTE_MIN_CLOSED_NOTES, PHASE_BOOST_COST } from '../game/rules'
import { FichaIcon, TargetGlyph } from '../game/icons'
import { useDailyLimits } from '../game/limits'
import {
  EmptyState,
  GamePage,
  GameProgress,
  IconTile,
  PageTitle,
  Panel,
  PhaseLetter,
  Pill,
  RowGroup,
  SectionLabel,
  SegmentedTabs,
  tone,
} from '../game/ui'
import type { MasterNote } from '../types'
import { RenameMasterNoteDialog } from '../components/RenameMasterNoteDialog'
import { PendingActivationCard } from '../components/PendingActivationCard'
import { PendingActivationPopup } from '../components/PendingActivationPopup'
import { usePendingActivationPhrase } from '../hooks/usePendingActivationPhrase'
import { langName, t, tn } from '@/i18n'
import { FirstUseTip, useFirstUseTip } from '../components/FirstUseTip'

type MasterNotesViewProps = {
  targetLang: string
  nativeLang: string
  todayVoiceActivationsCount: number
}

function compareByCreatedAtAsc(a: MasterNote, b: MasterNote): number {
  const aTime = new Date(a.created_at || 0).getTime()
  const bTime = new Date(b.created_at || 0).getTime()

  if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0
  if (Number.isNaN(aTime)) return 1
  if (Number.isNaN(bTime)) return -1
  return aTime - bTime
}

/** Pastilla del nivel con el que se cerró la nota (B1, B2...), con su color. */
function LevelPill({ level }: { level: string }) {
  const color = getMetaTrackerLevelColor(level)
  return (
    <span
      className='inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] leading-5 font-extrabold'
      style={{
        background: `color-mix(in oklab, ${color} 16%, var(--card))`,
        color: `color-mix(in oklab, ${color} 70%, var(--foreground))`,
      }}
    >
      {level}
    </span>
  )
}

function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className='flex flex-col gap-3' aria-hidden='true'>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className='h-18 animate-pulse rounded-3xl bg-muted' />
      ))}
    </div>
  )
}

export function MasterNotesView({
  targetLang,
  nativeLang,
  todayVoiceActivationsCount,
}: MasterNotesViewProps) {
  const challengeEnabled = useChallengeEnabled()
  // First master note (Luis, 9 Oct): bubbles that say where to tap.
  const [createTipPending, closeCreateTip] = useFirstUseTip('notes-create')
  const [recordTipPending, closeRecordTip] = useFirstUseTip('notes-record')
  const pendingPhrase = usePendingActivationPhrase(targetLang)
  const navigate = useNavigate()
  const [items, setItems] = useState<MasterNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'notes' | 'playlists'>('notes')
  const [playlistDialogOpen, setPlaylistDialogOpen] = useState(false)
  const [playlistDialogMode, setPlaylistDialogMode] = useState<
    'create' | 'edit'
  >('create')
  const [playlistDialogSubmitting, setPlaylistDialogSubmitting] =
    useState(false)
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(
    null,
  )
  const [deletingPlaylistId, setDeletingPlaylistId] = useState<string | null>(
    null,
  )
  const [activePlayerPlaylistId, setActivePlayerPlaylistId] = useState<
    string | null
  >(null)
  const [renameCandidate, setRenameCandidate] = useState<MasterNote | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<MasterNote | null>(
    null,
  )
  const [playAllStartNoteId, setPlayAllStartNoteId] = useState<string | null>(
    null,
  )

  const {
    error: playbackError,
    clearError,
    playingNoteId,
    canPlay,
    play,
    playTransitionCue,
    stop,
    pause,
    resume,
    togglePause,
    seekBack10,
    seekForward10,
    isPaused,
    positionSec,
    durationSec,
  } = useSharedMasterNotePlayback()

  const {
    playlists,
    itemsByPlaylistId,
    loading: playlistsLoading,
    error: playlistsError,
    refresh: refreshPlaylists,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    replacePlaylistItems,
    clearError: clearPlaylistsError,
  } = useMasterNotePlaylists({ targetLang, nativeLang })

  useEffect(() => {
    fetchMasterNotes(targetLang, nativeLang)
      .then((rows) => {
        setItems(rows)
        setError(null)
        clearError()
      })
      .catch((err) => {
        console.error(err)
        setError(t('No se pudieron cargar las notas maestras'))
      })
      .finally(() => setLoading(false))
  }, [nativeLang, targetLang])

  useEffect(() => {
    void refreshPlaylists()
  }, [refreshPlaylists])

  // Nota desafiante: hace falta tener al menos 2 notas maestras terminadas.
  const closedNotesCount = items.filter((item) => item.state === 'closed').length
  const challengeReady =
    !loading && closedNotesCount >= CHALLENGE_NOTE_MIN_CLOSED_NOTES

  useEffect(() => {
    void warmLoopCueOfflineCache()
  }, [])

  const openItems = useMemo(
    () =>
      items
        .filter((item) => item.state === 'open')
        .slice()
        .sort(compareByCreatedAtAsc),
    [items],
  )
  const closedItems = useMemo(
    () =>
      items
        .filter((item) => item.state === 'closed')
        .slice()
        .sort(compareByCreatedAtAsc),
    [items],
  )

  const closedNotesById = useMemo(
    () => new Map(closedItems.map((note) => [note.id, note])),
    [closedItems],
  )

  const closedNoteOptions = useMemo<PlaylistEditorNoteOption[]>(() => {
    return closedItems.map((note) => ({
      id: note.id,
      name: note.name,
    }))
  }, [closedItems])

  const editingPlaylist = useMemo(() => {
    if (!editingPlaylistId) return null
    return (
      playlists.find((playlist) => playlist.id === editingPlaylistId) || null
    )
  }, [editingPlaylistId, playlists])

  const editingPlaylistNoteIds = useMemo(() => {
    if (!editingPlaylist) return []
    return (itemsByPlaylistId.get(editingPlaylist.id) || [])
      .map((item) => item.master_note_id)
      .filter((id) => closedNotesById.has(id))
  }, [closedNotesById, editingPlaylist, itemsByPlaylistId])

  const activePlayerPlaylist = useMemo(() => {
    if (!activePlayerPlaylistId) return null
    return (
      playlists.find((playlist) => playlist.id === activePlayerPlaylistId) ||
      null
    )
  }, [activePlayerPlaylistId, playlists])

  const itemsById = useMemo(() => {
    return new Map(items.map((item) => [item.id, item]))
  }, [items])

  const playNoteById = useCallback(
    async (noteId: string): Promise<void> => {
      const note = itemsById.get(noteId)
      if (!note) return
      await play(note)
    },
    [itemsById, play],
  )

  const resolveNowPlayingMetadata = useCallback((noteId: string) => {
    const note = itemsById.get(noteId)
    if (!note) return null

    return {
      title: note.name,
      artist: t('Nota maestra'),
      album: 'ICADEMY',
    }
  }, [itemsById])

  const playCue = useCallback(async (kind: 'start' | 'step' | 'finish'): Promise<unknown> => {
    const source = await getLoopCuePlaybackSource(kind)
    return await playTransitionCue(source)
  }, [playTransitionCue])

  const {
    looping: loopingClosed,
    loopIds: activeLoopIds,
    loopIndex,
    repeatEnabled: playlistRepeatEnabled,
    setRepeatEnabled: setPlaylistRepeatEnabled,
    startLoop,
    stopLoop,
    playNext,
    playPrevious,
    replayCurrent,
  } = useLoopedMasterNotePlayback({
    playingNoteId,
    isPaused,
    playNoteById,
    playTransitionCue: playCue,
    pausePlayback: pause,
    resumePlayback: resume,
    seekBack10,
    seekForward10,
    resolveNowPlayingMetadata,
    stopPlayback: stop,
  })

  const activeLoopNote = useMemo(() => {
    const noteId = activeLoopIds[loopIndex]
    if (!noteId) return null
    return itemsById.get(noteId) || null
  }, [activeLoopIds, itemsById, loopIndex])

  const playableClosedNoteIds = useMemo(() => {
    return closedItems
      .filter((note) => canPlay(note, note.total_duration_ms > 0 ? 1 : 0))
      .map((note) => note.id)
  }, [canPlay, closedItems])

  const defaultPlayAllStartNoteId = playableClosedNoteIds[0] || null

  useEffect(() => {
    if (!defaultPlayAllStartNoteId) {
      setPlayAllStartNoteId(null)
      return
    }

    if (
      playAllStartNoteId &&
      playableClosedNoteIds.includes(playAllStartNoteId)
    ) {
      return
    }

    setPlayAllStartNoteId(defaultPlayAllStartNoteId)
  }, [
    defaultPlayAllStartNoteId,
    playAllStartNoteId,
    playableClosedNoteIds,
  ])

  const selectedPlayAllStartNote = useMemo(() => {
    const selectedId = playAllStartNoteId || defaultPlayAllStartNoteId
    if (!selectedId) return null
    return closedItems.find((note) => note.id === selectedId) || null
  }, [closedItems, defaultPlayAllStartNoteId, playAllStartNoteId])

  const disableLoopPlayback = (stopCurrent = false): void => {
    stopLoop(stopCurrent)
    setActivePlayerPlaylistId(null)
  }
  const handleCreate = async (): Promise<void> => {
    if (creating) return
    setCreating(true)
    try {
      const created = await createMasterNote(targetLang, nativeLang)
      setItems((prev) => [created, ...prev])
      setError(null)
      navigate(`${DASHBOARD_ROUTES.masterNotes}/note/${created.id}`)
    } catch (err) {
      console.error(err)
      setError(t('No se pudo crear la nota maestra'))
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (noteId: string): Promise<void> => {
    if (deletingId) return
    setDeletingId(noteId)
    try {
      await deleteMasterNote(noteId)
      setItems((prev) => prev.filter((item) => item.id !== noteId))
      setDeleteCandidate(null)
    } catch (err) {
      console.error(err)
      setError(t('No se pudo eliminar la nota maestra'))
    } finally {
      setDeletingId(null)
    }
  }

  const handlePlay = async (note: MasterNote): Promise<void> => {
    if (playingNoteId === note.id) {
      if (loopingClosed) {
        disableLoopPlayback(true)
      } else {
        stop()
      }
      return
    }

    if (loopingClosed) {
      disableLoopPlayback(false)
    }

    try {
      await play(note)
      setError(null)
    } catch (err) {
      console.error(err)
      setError(t('No se pudo reproducir la nota maestra'))
    }
  }

  const handleDownload = async (note: MasterNote): Promise<void> => {
    if (downloadingId) return
    setDownloadingId(note.id)
    try {
      await downloadMasterNoteAudio(note)
      setError(null)
    } catch (err) {
      console.error(err)
      setError(t('No se pudo descargar la nota maestra'))
    } finally {
      setDownloadingId(null)
    }
  }

  const getPlayablePlaylistNoteIds = (playlistId: string): string[] => {
    return (itemsByPlaylistId.get(playlistId) || [])
      .map((item) => item.master_note_id)
      .filter((noteId) => {
        const note = closedNotesById.get(noteId)
        if (!note) return false
        return canPlay(note, note.total_duration_ms > 0 ? 1 : 0)
      })
  }

  const handlePlayAllClosedLoopFrom = async (
    startNoteId: string,
  ): Promise<void> => {
    const ids = playableClosedNoteIds
    if (ids.length === 0) {
      setError(t('No hay notas maestras cerradas reproducibles para el bucle'))
      return
    }

    const startIndex = ids.indexOf(startNoteId)
    if (startIndex === -1) {
      setError(t('La nota seleccionada no tiene audio reproducible'))
      return
    }

    const idsFromStart = ids.slice(startIndex)
    if (idsFromStart.length === 0) {
      setError(t('No hay notas para reproducir desde esa selección'))
      return
    }

    setPlayAllStartNoteId(startNoteId)
    setPlaylistRepeatEnabled(false)
    const started = await startLoop(idsFromStart)
    if (!started) return
    setActivePlayerPlaylistId(null)
    setError(null)
  }

  const handlePlayPlaylist = async (playlistId: string): Promise<void> => {
    const playlist = playlists.find((row) => row.id === playlistId)
    if (!playlist) return

    const ids = getPlayablePlaylistNoteIds(playlistId)
    if (ids.length === 0) {
      setError(t('Esta lista no tiene notas cerradas reproducibles'))
      return
    }

    setPlaylistRepeatEnabled(true)
    const started = await startLoop(ids)
    if (!started) return
    setActivePlayerPlaylistId(playlistId)
    setError(null)
  }

  const handleNextLoopTrack = async (): Promise<void> => {
    await playNext()
  }

  const handlePrevLoopTrack = async (): Promise<void> => {
    await playPrevious()
  }

  const handleTogglePlaylistPause = async (): Promise<void> => {
    if (!loopingClosed || activeLoopIds.length === 0) return

    if (playingNoteId) {
      togglePause()
      return
    }

    if (isPaused) {
      await resume()
      return
    }

    await replayCurrent()
  }

  const handleCreatePlaylistClick = (): void => {
    setPlaylistDialogMode('create')
    setEditingPlaylistId(null)
    setPlaylistDialogOpen(true)
  }

  const handleEditPlaylistClick = (playlistId: string): void => {
    setPlaylistDialogMode('edit')
    setEditingPlaylistId(playlistId)
    setPlaylistDialogOpen(true)
  }

  const handlePlaylistDialogSubmit = async (payload: {
    name: string
    noteIds: string[]
  }): Promise<void> => {
    if (playlistDialogSubmitting) return

    const normalizedName = payload.name.trim()
    if (!normalizedName) {
      setError(t('Escribe un nombre para la lista de reproducción'))
      return
    }

    setPlaylistDialogSubmitting(true)
    try {
      if (playlistDialogMode === 'create') {
        const created = await createPlaylist(normalizedName)
        await replacePlaylistItems(created.id, payload.noteIds)
      } else if (editingPlaylist) {
        if (editingPlaylist.name.trim() !== normalizedName) {
          await renamePlaylist(editingPlaylist.id, normalizedName)
        }
        await replacePlaylistItems(editingPlaylist.id, payload.noteIds)
      }

      clearPlaylistsError()
      setError(null)
      setPlaylistDialogOpen(false)
      setEditingPlaylistId(null)
    } catch (err) {
      console.error(err)
      setError(t('No se pudieron guardar los cambios de la lista'))
    } finally {
      setPlaylistDialogSubmitting(false)
    }
  }

  const handleDeletePlaylist = async (playlistId: string): Promise<void> => {
    if (deletingPlaylistId) return

    setDeletingPlaylistId(playlistId)
    try {
      await deletePlaylist(playlistId)
      setError(null)
    } catch (err) {
      console.error(err)
      setError(t('No se pudo eliminar la lista de reproducción'))
    } finally {
      setDeletingPlaylistId(null)
    }
  }

  const handleClosePlaylistPlayer = (): void => {
    disableLoopPlayback(true)
  }

  // ---------------------------------------------------------------- vista
  // Progreso del día en la A (mismo límite que ve Activar frase).
  const dailyLimits = useDailyLimits()
  const activationsMax = dailyLimits.limits.activations
  const activationsDone = Math.min(dailyLimits.used.activations, activationsMax)
  const activationsLeft = Math.max(0, activationsMax - dailyLimits.used.activations)
  const atDailyLimit = dailyLimits.isAtLimit('activations')
  const dayText =
    activationsDone === 0
      ? t('Graba 1 frase con tu voz para completar la A de hoy.')
      : atDailyLimit
        ? t('Máximo del día alcanzado. Mañana el contador vuelve a cero.')
        : t('A completada hoy.')

  // La nota en curso es la abierta más antigua (ahí cae la próxima frase). Las demás van en la lista.
  const currentOpenNote = openItems[0] || null
  // La última frase creada sin grabar (si aún se puede grabar hoy).
  const pendingPhraseToRecord = atDailyLimit ? null : pendingPhrase
  const listedNotes = [...closedItems, ...openItems.slice(1)]
  const a = tone('a')
  const shownError = error || playbackError || playlistsError
  const dockOpen = Boolean(activePlayerPlaylist && activeLoopIds.length > 0)
  const loopingAll = loopingClosed && !activePlayerPlaylistId
  const unlockPercent = Math.round(CHALLENGE_UNLOCK_RATIO * 100)

  const noteHref = (item: MasterNote): string =>
    `${DASHBOARD_ROUTES.masterNotes}/note/${item.id}`

  const renderPlayButton = (item: MasterNote, size = 44) => {
    const isPlayingThis = playingNoteId === item.id
    const playable = canPlay(item, item.total_duration_ms > 0 ? 1 : 0)
    return (
      <RoundActionButton
        size={size}
        onClick={() => void handlePlay(item)}
        disabled={!isPlayingThis && (!playable || downloadingId === item.id)}
        ariaLabel={isPlayingThis ? t('Detener') : t('Escuchar')}
        live={isPlayingThis && !isPaused}
      >
        {isPlayingThis ? (
          <SquareIcon className='size-4 fill-current' strokeWidth={2.4} />
        ) : (
          <PlayIcon className='ml-0.5 size-5 fill-current' strokeWidth={2.4} />
        )}
      </RoundActionButton>
    )
  }

  const renderPlayer = (item: MasterNote) =>
    playingNoteId === item.id ? (
      <NotePlayerControls
        className='mt-4'
        positionSec={positionSec}
        durationSec={durationSec}
        isPaused={isPaused}
        onSeekBack={seekBack10}
        onTogglePause={togglePause}
        onSeekForward={seekForward10}
      />
    ) : null

  const renderNoteMenu = (item: MasterNote, extra?: ReactNode, quiet = false) => {
    const isDownloadingThis = downloadingId === item.id
    return (
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>{moreMenuTrigger({ quiet })}</DropdownMenuTrigger>
        <DropdownMenuContent align='end' className={MENU_CONTENT_CLASS}>
          {item.state === 'closed' && (
            <DropdownMenuItem
              className={MENU_ITEM_CLASS}
              disabled={isDownloadingThis}
              onSelect={() => void handleDownload(item)}
            >
              {isDownloadingThis ? (
                <Loader2Icon className='animate-spin' />
              ) : (
                <DownloadIcon strokeWidth={2.4} />
              )}
              {t('Descargar nota maestra')}
            </DropdownMenuItem>
          )}
          {extra}
          <DropdownMenuItem className={MENU_ITEM_CLASS} onSelect={() => setRenameCandidate(item)}>
            <PencilIcon strokeWidth={2.4} />
            {t('Cambiar nombre')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant='destructive'
            className={MENU_ITEM_CLASS}
            disabled={deletingId === item.id || isDownloadingThis}
            onSelect={() => setDeleteCandidate(item)}
          >
            <Trash2Icon strokeWidth={2.4} />
            {t('Eliminar nota maestra')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const renderNoteRow = (item: MasterNote) => {
    const isDownloadingThis = downloadingId === item.id
    const isPlayingThis = playingNoteId === item.id
    const closed = item.state === 'closed'
    const label = formatMasterNoteLabel(item.name)
    const title = (
      <>
        <span className='flex min-w-0 items-center gap-2'>
          <span className='truncate text-base leading-tight font-extrabold'>{label}</span>
          {item.closed_level ? <LevelPill level={item.closed_level} /> : null}
        </span>
        <span className='mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-bold text-muted-foreground'>
          <Pill tone={closed ? 'gold' : 'ok'}>{closed ? t('Cerrada') : t('Abierta')}</Pill>
          <span className='tabular-nums'>
            {formatDuration(item.total_duration_ms)}
            {closed ? '' : ' / 3:00'}
          </span>
          {closed && item.closed_at ? (
            <span aria-label={t('Cerrada el: {date}', { date: formatDate(item.closed_at) })}>· {formatShortDate(item.closed_at)}</span>
          ) : null}
          {isDownloadingThis ? <span>· {t('Descargando…')}</span> : null}
        </span>
      </>
    )

    return (
      <div key={item.id} className='py-3'>
        <div className='flex items-center gap-3'>
          <NoteNumberTile name={item.name} closed={closed} />
          {isDownloadingThis ? (
            <span className='min-w-0 flex-1 opacity-70' aria-disabled='true'>
              {title}
            </span>
          ) : (
            <Link
              to={noteHref(item)}
              aria-label={t('Ingresar a la nota maestra: {label}', { label })}
              className='min-w-0 flex-1 transition-opacity active:opacity-70'
            >
              {title}
            </Link>
          )}
          {renderPlayButton(item)}
          {!isPlayingThis ? renderNoteMenu(item, undefined, true) : <span className='size-9 shrink-0' aria-hidden='true' />}
        </div>
        {renderPlayer(item)}
        {challengeEnabled && challengeReady && closed && item.total_duration_ms > 0 && (
          <div className='mt-2 pl-[60px]'>
            <NotaDesafianteChip
              noteId={item.id}
              noteDurationMs={item.total_duration_ms}
              noteHref={noteHref(item)}
            />
          </div>
        )}
      </div>
    )
  }

  // La nota en curso, destacada arriba con su botón grande (o crear una si no hay).
  const currentPanel = currentOpenNote ? (
    <Panel tone='a' className='p-5'>
      <div className='flex items-start gap-3'>
        <div className='min-w-0 flex-1'>
          <p className='m-0 text-xs font-extrabold tracking-[0.08em] uppercase' style={{ color: a.ink }}>
            {t('Tu nota en curso')}
          </p>
          <p className='m-0 mt-0.5 truncate text-2xl leading-tight font-black tracking-tight'>
            {formatMasterNoteLabel(currentOpenNote.name)}
          </p>
        </div>
        <Pill tone='ok' solid className='mt-1'>
          {t('Abierta')}
        </Pill>
        {playingNoteId !== currentOpenNote.id
          ? renderNoteMenu(
              currentOpenNote,
              <DropdownMenuItem
                className={MENU_ITEM_CLASS}
                disabled={creating}
                onSelect={() => void handleCreate()}
              >
                <PlusIcon strokeWidth={2.6} />
                {creating ? t('Creando...') : t('Crear otra nota maestra')}
              </DropdownMenuItem>,
            )
          : null}
      </div>
      <MasterNoteProgressBar
        className='mt-4'
        noteName={currentOpenNote.name}
        savedMs={currentOpenNote.total_duration_ms}
        showName={false}
      />
      {pendingPhraseToRecord ? (
        // La frase recién creada, lista para grabar: el botón lleva directo a grabarla.
        <div className='mt-4 rounded-2xl bg-card px-4 py-3'>
          <p className='m-0 text-xs font-extrabold tracking-[0.08em] uppercase' style={{ color: a.ink }}>
            {t('Tu frase nueva')}
          </p>
          <p className='m-0 mt-1 text-base leading-snug font-black'>«{pendingPhraseToRecord.generated_phrase}»</p>
          {pendingPhraseToRecord.translation ? (
            <p className='m-0 mt-0.5 text-sm font-semibold text-muted-foreground'>{pendingPhraseToRecord.translation}</p>
          ) : null}
        </div>
      ) : null}
      <div className='relative mt-5 flex items-center gap-3'>
        {recordTipPending ? (
          <FirstUseTip onClose={closeRecordTip}>
            {t('Toca aquí para grabar tu frase en voz alta. Cada frase grabada suma tiempo a tu nota maestra hasta llegar a 3:00.')}
          </FirstUseTip>
        ) : null}
        <Button asChild size='xl' variant='a' className='min-w-0 flex-1'>
          <Link
            onClick={() => (recordTipPending ? closeRecordTip() : undefined)}
            to={
              pendingPhraseToRecord
                ? `${noteHref(currentOpenNote)}/activate/${pendingPhraseToRecord.id}`
                : noteHref(currentOpenNote)
            }
          >
            <MicIcon className='size-5' strokeWidth={2.6} />
            {pendingPhraseToRecord
              ? t('Grabar esta frase')
              : currentOpenNote.total_duration_ms > 0
                ? t('Seguir grabando')
                : t('Empezar a grabar')}
          </Link>
        </Button>
        {canPlay(currentOpenNote, currentOpenNote.total_duration_ms > 0 ? 1 : 0) ||
        playingNoteId === currentOpenNote.id
          ? renderPlayButton(currentOpenNote, 52)
          : null}
      </div>
      {pendingPhraseToRecord ? (
        <Link
          to={noteHref(currentOpenNote)}
          className='mt-3 block text-center text-sm font-extrabold underline-offset-4 hover:underline'
          style={{ color: a.ink }}
        >
          {t('Ver la nota')}
        </Link>
      ) : null}
      {renderPlayer(currentOpenNote)}
    </Panel>
  ) : pendingPhraseToRecord ? (
    // Sin nota abierta: el aviso crea la nota y lleva directo a grabar la frase.
    <PendingActivationCard phrase={pendingPhraseToRecord} targetLang={targetLang} nativeLang={nativeLang} />
  ) : (
    <Panel tone='a' className='flex flex-col items-center gap-3 p-6 text-center'>
      <IconTile tone='a' solid size={64}>
        <MicIcon className='size-8' strokeWidth={2.6} />
      </IconTile>
      <div>
        <p className='m-0 text-xl font-black tracking-tight'>{t('Empieza una nota maestra')}</p>
        <p className='m-0 mt-1 text-sm font-semibold text-muted-foreground'>
          {t('Graba frases en {lang} con tu voz: la nota se completa sola al llegar a 3:00.', { lang: langName(targetLang) })}
        </p>
      </div>
      <div className='relative mt-1 w-full'>
        {createTipPending ? (
          <FirstUseTip onClose={closeCreateTip}>
            {t('Empieza aquí: crea tu primera nota maestra. En ella grabarás tus frases en voz alta.')}
          </FirstUseTip>
        ) : null}
        <Button
          type='button'
          size='xl'
          variant='a'
          className='w-full'
          onClick={() => {
            if (createTipPending) closeCreateTip()
            void handleCreate()
          }}
          disabled={creating}
        >
          <PlusIcon className='size-5' strokeWidth={2.8} />
          {creating ? t('Creando...') : t('Crear nota maestra')}
        </Button>
      </div>
    </Panel>
  )

  return (
    <GamePage>
      <PendingActivationPopup phrase={pendingPhraseToRecord} targetLang={targetLang} nativeLang={nativeLang} />
      <PageTitle
        icon={<PhaseLetter letter='A' size={46} />}
        subtitle={t('Tus notas maestras en {lang}, con tu voz', { lang: langName(targetLang) })}
      >
        {t('Activación')}
      </PageTitle>

      {/* El día, sin contador: «0 de 2» hacía pensar que había que hacer 2 (Luis, 9 Oct).
          Como en Creación, solo se dice si la A de hoy está hecha y, si llega, el máximo. */}
      <div className='-mt-1 flex flex-wrap items-center gap-3 rounded-3xl px-5 py-4' style={{ background: a.soft }}>
        <IconTile tone='a' solid size={44}>
          <MicIcon className='size-6' strokeWidth={2.6} />
        </IconTile>
        <p className='m-0 min-w-0 flex-1 text-sm font-extrabold' style={{ color: a.ink }}>
          {dayText}
        </p>
        {dailyLimits.boosted.activations ? (
          <Pill tone='c' solid>
            {t('AMPLIADA HOY')}
          </Pill>
        ) : null}
        {atDailyLimit && !dailyLimits.boosted.activations ? (
          <Link
            to={DASHBOARD_ROUTES.fichas}
            className='inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-extrabold'
            style={{ background: 'var(--ica-gold)', color: '#3a2a00', boxShadow: '0 3px 0 var(--ica-gold-edge)' }}
          >
            <FichaIcon size={16} />
            {t('Ampliar Activación · {n}', { n: PHASE_BOOST_COST })}
          </Link>
        ) : null}
      </div>

      {shownError ? <ErrorNote>{shownError}</ErrorNote> : null}

      {/* La nota en curso */}
      {loading ? <div className='h-60 animate-pulse rounded-3xl bg-muted' aria-hidden='true' /> : currentPanel}

      <SegmentedTabs
        ariaLabel={t('Notas maestras o listas de reproducción')}
        value={activeTab}
        onChange={setActiveTab}
        options={[
          { value: 'notes', label: t('Notas maestras'), icon: <MicIcon className='size-4.5' strokeWidth={2.6} /> },
          { value: 'playlists', label: t('Listas'), icon: <ListMusicIcon className='size-4.5' strokeWidth={2.6} /> },
        ]}
      />

      {activeTab === 'notes' ? (
        <div className='flex flex-col gap-6'>
          {!loading && closedItems.length > 0 && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type='button'
                  disabled={playableClosedNoteIds.length === 0}
                  className='ica-panel ica-press flex w-full items-center gap-3 p-3 text-left disabled:opacity-60'
                >
                  <IconTile tone='a' solid size={44}>
                    {loopingAll ? (
                      <SquareIcon className='size-4 fill-current' strokeWidth={2.4} />
                    ) : (
                      <PlayIcon className='ml-0.5 size-5 fill-current' strokeWidth={2.4} />
                    )}
                  </IconTile>
                  <span className='min-w-0 flex-1'>
                    <span className='block leading-tight font-extrabold'>
                      {loopingAll ? t('Reproduciendo todas') : t('Reproducir todas una vez')}
                    </span>
                    <span className='mt-0.5 block truncate text-xs font-semibold text-muted-foreground'>
                      {t('Desde: {note}', { note: selectedPlayAllStartNote ? formatMasterNoteLabel(selectedPlayAllStartNote.name) : '...' })}
                    </span>
                  </span>
                  <ChevronDownIcon className='size-5 shrink-0 text-muted-foreground' strokeWidth={2.6} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start' className={cn(MENU_CONTENT_CLASS, 'max-h-80')}>
                <p className='ica-label m-0 px-2.5 pt-1.5 pb-1'>{t('Empezar desde')}</p>
                {loopingAll && (
                  <DropdownMenuItem className={MENU_ITEM_CLASS} onSelect={handleClosePlaylistPlayer}>
                    <SquareIcon strokeWidth={2.4} />
                    {t('Detener reproducción total')}
                  </DropdownMenuItem>
                )}
                {closedItems.map((note) => {
                  const playable = canPlay(note, note.total_duration_ms > 0 ? 1 : 0)
                  return (
                    <DropdownMenuItem
                      key={note.id}
                      className={MENU_ITEM_CLASS}
                      disabled={!playable}
                      onSelect={() => {
                        void handlePlayAllClosedLoopFrom(note.id)
                      }}
                    >
                      <PlayIcon strokeWidth={2.4} />
                      {formatMasterNoteLabel(note.name)}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div>
            <SectionLabel
              right={
                !loading && closedItems.length > 0 ? (
                  <span className='text-xs font-extrabold text-muted-foreground tabular-nums'>
                    {tn(closedItems.length, '{n} terminada', '{n} terminadas')}
                  </span>
                ) : null
              }
            >
              {t('Tus notas maestras')}
            </SectionLabel>
            {loading ? (
              <SkeletonRows />
            ) : listedNotes.length > 0 ? (
              <RowGroup>{listedNotes.map(renderNoteRow)}</RowGroup>
            ) : (
              <EmptyState
                className='py-6'
                icon={
                  <IconTile tone='a' size={64}>
                    <MicIcon className='size-8' strokeWidth={2.4} />
                  </IconTile>
                }
                title={items.length === 0 ? t('Todavía no tienes notas maestras.') : t('Aún no has terminado ninguna nota.')}
                text={t('Cuando una nota llegue a 3:00 aparecerá aquí para escucharla cuando quieras.')}
              />
            )}
          </div>

          {challengeEnabled ? (
            <Panel className='flex items-start gap-3'>
              <IconTile tone='a' size={48}>
                <TargetGlyph size={30} />
              </IconTile>
              <div className='min-w-0 flex-1'>
                <p className='m-0 leading-tight font-extrabold'>{t('Nota desafiante')}</p>
                <p className='m-0 mt-1 text-xs font-semibold text-muted-foreground'>
                  {t('Cuando una nota maestra esté completa, escucha al menos el {pct} % y se desbloquea su nota desafiante hasta el final del día.', { pct: unlockPercent })}
                </p>
                {!loading && !challengeReady ? (
                  <div className='mt-3'>
                    <GameProgress
                      value={closedNotesCount / CHALLENGE_NOTE_MIN_CLOSED_NOTES}
                      color='var(--ica-gold)'
                      height={10}
                    />
                    <p className='m-0 mt-1.5 text-xs font-extrabold' style={{ color: 'var(--ica-gold-ink)' }}>
                      {t('Se abre cuando tengas {min} notas maestras terminadas (llevas {n}).', { min: CHALLENGE_NOTE_MIN_CLOSED_NOTES, n: closedNotesCount })}
                    </p>
                  </div>
                ) : null}
              </div>
            </Panel>
          ) : null}
        </div>
      ) : (
        <div className='flex flex-col gap-5'>
          <Button type='button' size='lg' variant='outline' className='w-full' onClick={handleCreatePlaylistClick}>
            <PlusIcon className='size-5' strokeWidth={2.6} />
            {t('Crear lista de reproducción')}
          </Button>

          {playlistsLoading && playlists.length === 0 ? <SkeletonRows count={2} /> : null}

          {!playlistsLoading && playlists.length === 0 ? (
            <EmptyState
              className='py-6'
              icon={
                <IconTile tone='a' size={64}>
                  <ListMusicIcon className='size-8' strokeWidth={2.4} />
                </IconTile>
              }
              title={t('Aún no tienes listas de reproducción.')}
              text={t('Crea, edita y reproduce tus listas de notas cerradas.')}
            />
          ) : null}

          {playlists.length > 0 ? (
            <div>
              <SectionLabel>{t('Mis listas de reproducción')}</SectionLabel>
              <RowGroup>
                {playlists.map((playlist) => {
                  const totalItems = itemsByPlaylistId.get(playlist.id)?.length || 0
                  const isThisPlaying = activePlayerPlaylistId === playlist.id && loopingClosed

                  return (
                    <div key={playlist.id} className='flex items-center gap-3 py-3'>
                      <IconTile tone='a' size={48}>
                        <ListMusicIcon className='size-6' strokeWidth={2.4} />
                      </IconTile>
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate leading-tight font-extrabold'>{playlist.name}</span>
                        <span className='mt-0.5 block text-xs font-semibold text-muted-foreground'>
                          {tn(totalItems, '{n} nota en esta lista', '{n} notas en esta lista')}
                        </span>
                      </span>
                      <RoundActionButton
                        size={44}
                        ariaLabel={isThisPlaying ? t('Detener') : t('Escuchar')}
                        live={isThisPlaying && !isPaused}
                        onClick={() => {
                          if (isThisPlaying) {
                            handleClosePlaylistPlayer()
                            return
                          }
                          void handlePlayPlaylist(playlist.id)
                        }}
                      >
                        {isThisPlaying ? (
                          <SquareIcon className='size-4 fill-current' strokeWidth={2.4} />
                        ) : (
                          <PlayIcon className='ml-0.5 size-5 fill-current' strokeWidth={2.4} />
                        )}
                      </RoundActionButton>
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>{moreMenuTrigger({ quiet: true })}</DropdownMenuTrigger>
                        <DropdownMenuContent align='end' className={MENU_CONTENT_CLASS}>
                          <DropdownMenuItem
                            className={MENU_ITEM_CLASS}
                            onSelect={() => handleEditPlaylistClick(playlist.id)}
                          >
                            <PencilIcon strokeWidth={2.4} />
                            {t('Editar lista')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant='destructive'
                            className={MENU_ITEM_CLASS}
                            disabled={deletingPlaylistId === playlist.id}
                            onSelect={() => void handleDeletePlaylist(playlist.id)}
                          >
                            <Trash2Icon strokeWidth={2.4} />
                            {t('Eliminar lista')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )
                })}
              </RowGroup>
            </div>
          ) : null}
        </div>
      )}

      {/* Hueco para que el reproductor de abajo no tape la última fila */}
      {dockOpen ? <div className='h-44 shrink-0 lg:h-36' aria-hidden='true' /> : null}

      <MasterNotePlaylistEditorDialog
        open={playlistDialogOpen}
        mode={playlistDialogMode}
        initialName={editingPlaylist?.name || ''}
        initialNoteIds={editingPlaylistNoteIds}
        closedNotes={closedNoteOptions}
        submitting={playlistDialogSubmitting}
        onOpenChange={(open) => {
          setPlaylistDialogOpen(open)
          if (!open) {
            setEditingPlaylistId(null)
          }
        }}
        onSubmit={handlePlaylistDialogSubmit}
      />

      <MasterNotePlaylistPlayerDock
        open={dockOpen}
        playlistName={activePlayerPlaylist?.name || t('Lista de reproducción')}
        noteName={activeLoopNote?.name || t('Sin nota en reproducción')}
        progressSec={positionSec}
        durationSec={durationSec}
        currentIndex={loopIndex}
        totalCount={activeLoopIds.length}
        paused={isPaused || !playingNoteId}
        repeatEnabled={playlistRepeatEnabled}
        onTogglePause={() => {
          void handleTogglePlaylistPause()
        }}
        onToggleRepeat={() => setPlaylistRepeatEnabled((prev) => !prev)}
        onSeekBack10={seekBack10}
        onSeekForward10={seekForward10}
        onPrevious={() => {
          void handlePrevLoopTrack()
        }}
        onNext={() => {
          void handleNextLoopTrack()
        }}
        onClose={handleClosePlaylistPlayer}
      />

      <RenameMasterNoteDialog
        note={renameCandidate}
        onClose={() => setRenameCandidate(null)}
        onRenamed={(updated) =>
          setItems((prev) => prev.map((item) => (item.id === updated.id ? { ...item, name: updated.name } : item)))
        }
      />

      <IcaDeletionWarningDialog
        open={Boolean(deleteCandidate)}
        onOpenChange={(open) => {
          if (!open) setDeleteCandidate(null)
        }}
        onConfirm={() => {
          if (!deleteCandidate?.id) return
          void handleDelete(deleteCandidate.id)
        }}
        loading={Boolean(deletingId)}
        title={t('Eliminar nota maestra')}
        resourceLabel={t('esta nota maestra y sus audios')}
        resource='audio'
        resourceDates={[
          deleteCandidate?.created_at,
          deleteCandidate?.closed_at,
        ]}
        todayTotalCount={todayVoiceActivationsCount}
      />
    </GamePage>
  )
}

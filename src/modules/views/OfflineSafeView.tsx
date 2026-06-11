import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SquareIcon,
  Volume2Icon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LANG_CODES } from '../constants'
import { useMasterNotePlayback } from '../hooks/useMasterNotePlayback'
import {
  getMasterNotesLoopAnnouncement,
  type LoopAnnouncementType,
} from './masterNotesLoopAnnouncements'
import { OFFLINE_SAFE_LAST_PATH_STORAGE_KEY } from '../offline/events'
import { DASHBOARD_ROUTES } from '../routes/paths'
import {
  listOfflineClosedMasterNotes,
  type OfflineClosedMasterNote,
} from '../services/masterNotesOfflineStore'
import { speakLocal, stopTTS } from '../services/tts'
import type { MasterNote } from '../types'
import { formatDate } from '../utils'

function getCurrentPath(): string {
  if (typeof window === 'undefined') return DASHBOARD_ROUTES.home

  const candidate = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (!candidate || candidate === DASHBOARD_ROUTES.offlineSafe) {
    return DASHBOARD_ROUTES.home
  }

  return candidate
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function resolveSpeechLangName(note: OfflineClosedMasterNote): string {
  const candidate = (note.nativeLang || note.targetLang || '').trim()
  if (!candidate) return 'Español'

  if (LANG_CODES[candidate]) {
    return candidate
  }

  const normalized = candidate.toLowerCase()
  const entries = Object.entries(LANG_CODES)
  const exactCodeMatch = entries.find(
    ([, code]) => code.toLowerCase() === normalized,
  )
  if (exactCodeMatch) {
    return exactCodeMatch[0]
  }

  const languagePrefix = normalized.split('-')[0]
  const prefixMatch = entries.find(([, code]) =>
    code.toLowerCase().startsWith(`${languagePrefix}-`),
  )
  if (prefixMatch) {
    return prefixMatch[0]
  }

  return 'Español'
}

export function OfflineSafeView() {
  const navigate = useNavigate()
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const [loadingNotes, setLoadingNotes] = useState(true)
  const [notes, setNotes] = useState<OfflineClosedMasterNote[]>([])
  const [notesError, setNotesError] = useState<string | null>(null)
  const [loopingClosed, setLoopingClosed] = useState(false)
  const [loopIds, setLoopIds] = useState<string[]>([])
  const [loopIndex, setLoopIndex] = useState(0)
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>('')
  const previousPlayingNoteIdRef = useRef<string | null>(null)
  const loopTokenRef = useRef(0)

  const {
    error: playbackError,
    playingNoteId,
    play,
    stop,
    togglePause,
    seekBack10,
    seekForward10,
    isPaused,
    positionSec,
    durationSec,
  } = useMasterNotePlayback()

  useEffect(() => {
    let isMounted = true

    const loadOfflineNotes = async () => {
      setLoadingNotes(true)
      try {
        const rows = await listOfflineClosedMasterNotes()
        if (!isMounted) return
        setNotes(rows)
        setNotesError(null)
      } catch {
        if (!isMounted) return
        setNotesError('No se pudo cargar tu caché local de notas maestras')
      } finally {
        if (!isMounted) return
        setLoadingNotes(false)
      }
    }

    void loadOfflineNotes()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const returnPath = useMemo(() => {
    if (typeof window === 'undefined') return DASHBOARD_ROUTES.home
    const stored = window.sessionStorage.getItem(
      OFFLINE_SAFE_LAST_PATH_STORAGE_KEY,
    )
    if (stored && stored !== DASHBOARD_ROUTES.offlineSafe) {
      return stored
    }
    return getCurrentPath()
  }, [])

  const shouldAutoReturn = useMemo(() => {
    if (typeof window === 'undefined') return false
    return Boolean(
      window.sessionStorage.getItem(OFFLINE_SAFE_LAST_PATH_STORAGE_KEY),
    )
  }, [])

  useEffect(() => {
    if (!isOnline || !shouldAutoReturn) return

    const timeoutId = window.setTimeout(() => {
      window.sessionStorage.removeItem(OFFLINE_SAFE_LAST_PATH_STORAGE_KEY)
      navigate(returnPath, { replace: true })
    }, 700)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isOnline, navigate, returnPath, shouldAutoReturn])

  const handleRetry = () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(OFFLINE_SAFE_LAST_PATH_STORAGE_KEY)
    }
    navigate(returnPath, { replace: true })
  }

  const languageGroups = useMemo(() => {
    const groupsMap = new Map<
      string,
      {
        key: string
        label: string
        notes: OfflineClosedMasterNote[]
      }
    >()

    for (const note of notes) {
      const target = (note.targetLang || '').trim() || 'Sin idioma objetivo'
      const native = (note.nativeLang || '').trim() || 'Sin idioma nativo'
      const key = `${target}::${native}`
      const label = `${target} -> ${native}`

      const current = groupsMap.get(key)
      if (current) {
        current.notes.push(note)
      } else {
        groupsMap.set(key, {
          key,
          label,
          notes: [note],
        })
      }
    }

    return Array.from(groupsMap.values())
  }, [notes])

  useEffect(() => {
    if (languageGroups.length === 0) {
      setSelectedGroupKey('')
      return
    }

    const hasSelected = languageGroups.some(
      (group) => group.key === selectedGroupKey,
    )
    if (hasSelected) return
    setSelectedGroupKey(languageGroups[0]?.key || '')
  }, [languageGroups, selectedGroupKey])

  const visibleNotes = useMemo(() => {
    if (languageGroups.length <= 1) {
      return notes
    }

    const selected = languageGroups.find(
      (group) => group.key === selectedGroupKey,
    )
    return selected?.notes || []
  }, [languageGroups, notes, selectedGroupKey])

  const notesById = useMemo(() => {
    return new Map(visibleNotes.map((note) => [note.noteId, note]))
  }, [visibleNotes])

  const playableOfflineNotes = useMemo(
    () => visibleNotes.filter((note) => note.audioAvailable),
    [visibleNotes],
  )

  const toMasterNote = (note: OfflineClosedMasterNote): MasterNote => {
    return {
      id: note.noteId,
      name: note.name,
      state: 'closed',
      close_type: note.closeType,
      closed_level: note.closedLevel,
      total_duration_ms: note.totalDurationMs,
      final_audio_path: note.finalAudioPath,
      target_lang: note.targetLang,
      native_lang: note.nativeLang,
      created_at: note.createdAt,
      updated_at: note.updatedAt,
      closed_at: note.closedAt,
    }
  }

  const disableLoopPlayback = (stopCurrent = false): void => {
    loopTokenRef.current += 1
    setLoopingClosed(false)
    setLoopIds([])
    setLoopIndex(0)
    stopTTS()
    if (stopCurrent) {
      stop()
    }
  }

  const announceLoopNote = async (
    note: OfflineClosedMasterNote,
    token: number,
    announcementType: LoopAnnouncementType,
  ): Promise<void> => {
    if (token !== loopTokenRef.current) return

    const spokenText = getMasterNotesLoopAnnouncement(
      note.name || 'nota maestra',
      announcementType,
    )
    const langName = resolveSpeechLangName(note)
    await new Promise<void>((resolve) => {
      speakLocal(spokenText, langName, () => resolve(), 1)
    })
  }

  const playLoopNoteAt = async (
    index: number,
    ids: string[],
    token: number,
    announcementType: LoopAnnouncementType,
    delayBeforeSpeakMs = 0,
  ): Promise<void> => {
    if (ids.length === 0) return
    if (token !== loopTokenRef.current) return

    if (delayBeforeSpeakMs > 0) {
      await waitMs(delayBeforeSpeakMs)
      if (token !== loopTokenRef.current) return
    }

    const safeIndex = ((index % ids.length) + ids.length) % ids.length
    const note = notesById.get(ids[safeIndex])
    if (!note || !note.audioAvailable) return

    setLoopIndex(safeIndex)
    await announceLoopNote(note, token, announcementType)
    if (token !== loopTokenRef.current) return

    await waitMs(1000)
    if (token !== loopTokenRef.current) return

    stopTTS()
    await waitMs(120)
    if (token !== loopTokenRef.current) return

    await play(toMasterNote(note))
  }

  useEffect(() => {
    const prevPlayingNoteId = previousPlayingNoteIdRef.current

    if (
      loopingClosed &&
      prevPlayingNoteId &&
      !playingNoteId &&
      loopIds.length > 0
    ) {
      const nextIndex = (loopIndex + 1) % loopIds.length
      const token = loopTokenRef.current
      void playLoopNoteAt(nextIndex, loopIds, token, 'next', 1000)
    }

    previousPlayingNoteIdRef.current = playingNoteId
  }, [loopIds, loopIndex, loopingClosed, notesById, play, playingNoteId])

  useEffect(() => {
    if (!loopingClosed) return
    disableLoopPlayback(true)
  }, [selectedGroupKey])

  const handlePlay = async (note: OfflineClosedMasterNote): Promise<void> => {
    if (!note.audioAvailable) return

    if (playingNoteId === note.noteId) {
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

    await play(toMasterNote(note))
  }

  const handleClosedLoopToggle = async (): Promise<void> => {
    if (loopingClosed) {
      disableLoopPlayback(true)
      return
    }

    if (playableOfflineNotes.length === 0) {
      return
    }

    const token = loopTokenRef.current + 1
    loopTokenRef.current = token

    const ids = playableOfflineNotes.map((note) => note.noteId)
    setLoopingClosed(true)
    setLoopIds(ids)
    setLoopIndex(0)
    await playLoopNoteAt(0, ids, token, 'first')
  }

  const formatDuration = (durationMs: number): string => {
    const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }

  return (
    <section className='mx-auto w-full max-w-3xl flex-1 px-5 pt-8 pb-24 lg:pb-8'>
      <h2 className='mb-2 font-serif text-2xl font-bold lg:text-3xl'>
        Modo seguro offline
      </h2>
      <p className='mb-5 text-sm text-muted-foreground'>
        Detectamos problemas de conectividad. Te llevamos a un modo seguro para
        mantener disponible Notas Maestras cuando no hay red.
      </p>

      <Card className='rounded-2xl'>
        <CardContent className='space-y-4'>
          <div className='flex flex-wrap items-center gap-2'>
            <p className='text-sm font-semibold'>Estado de red:</p>
            <Badge
              variant='outline'
              className={
                isOnline
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-700'
              }
            >
              {isOnline ? 'Conexión disponible' : 'Sin conexión'}
            </Badge>
          </div>

          <p className='text-sm text-muted-foreground'>
            Si la conexión vuelve, puedes reintentar para regresar a la pantalla
            anterior.
          </p>

          <div className='flex flex-wrap gap-2'>
            <Button type='button' onClick={handleRetry} disabled={!isOnline}>
              Reintentar y volver
            </Button>
            <Button
              type='button'
              variant='outline'
              onClick={() => navigate(DASHBOARD_ROUTES.masterNotes)}
            >
              Ir a Notas maestras
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className='mt-4 space-y-3'>
        <p className='text-xs font-semibold tracking-wide text-muted-foreground'>
          Notas maestras cerradas en caché local
        </p>

        {languageGroups.length > 1 && (
          <div className='flex items-center gap-2'>
            <p className='text-xs text-muted-foreground'>Idioma:</p>
            <Select
              value={selectedGroupKey}
              onValueChange={setSelectedGroupKey}
            >
              <SelectTrigger size='sm' className='min-w-56'>
                <SelectValue placeholder='Selecciona idioma' />
              </SelectTrigger>
              <SelectContent>
                {languageGroups.map((group) => (
                  <SelectItem key={group.key} value={group.key}>
                    {group.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {playableOfflineNotes.length > 0 && (
          <Button
            type='button'
            variant={loopingClosed ? 'secondary' : 'outline'}
            onClick={() => void handleClosedLoopToggle()}
          >
            {loopingClosed ? (
              <>
                <SquareIcon className='mr-1 size-4' />
                Detener bucle
              </>
            ) : (
              <>
                <RepeatIcon className='mr-1 size-4' />
                Reproducir bucle
              </>
            )}
          </Button>
        )}

        {playbackError && (
          <p className='text-sm text-red-400'>{playbackError}</p>
        )}

        {loadingNotes && (
          <p className='text-sm text-muted-foreground'>
            Cargando notas offline...
          </p>
        )}

        {!loadingNotes && notesError && (
          <p className='text-sm text-red-400'>{notesError}</p>
        )}

        {!loadingNotes && !notesError && visibleNotes.length === 0 && (
          <p className='text-sm text-muted-foreground'>
            Aún no hay notas cerradas guardadas en este dispositivo.
          </p>
        )}

        {!loadingNotes &&
          !notesError &&
          visibleNotes.map((note) => (
            <Card key={note.noteId} className='rounded-2xl'>
              <CardContent className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                  <div className='flex flex-wrap items-center gap-2'>
                    <p className='font-semibold'>⭐ {note.name}</p>
                    <Badge
                      variant='outline'
                      className='border-amber-500/30 bg-amber-500/10 text-amber-700'
                    >
                      Cerrada
                    </Badge>
                    <Badge variant='outline'>Caché local</Badge>
                    <Badge
                      variant='outline'
                      className={
                        note.audioAvailable
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                          : 'border-zinc-500/30 bg-zinc-500/10 text-zinc-700'
                      }
                    >
                      {note.audioAvailable
                        ? 'Audio offline listo'
                        : 'Audio offline pendiente'}
                    </Badge>
                  </div>
                  <div className='mt-1 text-xs text-muted-foreground'>
                    Duración: {formatDuration(note.totalDurationMs)}
                    {note.closedAt
                      ? ` · Cerrada el: ${formatDate(note.closedAt)}`
                      : ''}
                    {` · Sync local: ${formatDate(note.cachedAt)}`}
                  </div>
                </div>

                <div className='flex gap-2'>
                  {playingNoteId !== note.noteId ? (
                    <Button
                      type='button'
                      onClick={() => void handlePlay(note)}
                      disabled={!note.audioAvailable}
                    >
                      <Volume2Icon className='mr-1 size-4' />
                      Escuchar
                    </Button>
                  ) : (
                    <>
                      <Button
                        type='button'
                        onClick={() => void handlePlay(note)}
                      >
                        <SquareIcon className='mr-1 size-4' />
                        Detener
                      </Button>
                      <Button
                        type='button'
                        size='icon'
                        variant='outline'
                        onClick={seekBack10}
                      >
                        <RotateCcwIcon className='size-4' />
                      </Button>
                      <Button
                        type='button'
                        size='icon'
                        variant='outline'
                        onClick={togglePause}
                      >
                        {isPaused ? (
                          <PlayIcon className='size-4' />
                        ) : (
                          <PauseIcon className='size-4' />
                        )}
                      </Button>
                      <Button
                        type='button'
                        size='icon'
                        variant='outline'
                        onClick={seekForward10}
                      >
                        <RotateCwIcon className='size-4' />
                      </Button>
                      <span className='inline-flex min-w-18 items-center justify-end text-xs text-muted-foreground'>
                        {formatDuration(positionSec * 1000)} /{' '}
                        {formatDuration(durationSec * 1000)}
                      </span>
                    </>
                  )}

                  {!note.audioAvailable && (
                    <Button
                      type='button'
                      size='icon'
                      variant='outline'
                      disabled
                    >
                      <Loader2Icon className='size-4' />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
      </div>
    </section>
  )
}

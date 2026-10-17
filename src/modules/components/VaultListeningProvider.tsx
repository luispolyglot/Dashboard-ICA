import { createContext, useContext, useEffect, useRef, useState, type Context, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HeadphonesIcon, PauseIcon, PlayIcon, SkipBackIcon, XIcon } from 'lucide-react'
import { t } from '@/i18n'
import { holdWhilePlaying } from '../services/audioSession'
import { getSpeechAudioUrl, premiumVoiceDayLimited, premiumVoiceUsable, stopTTS } from '../services/tts'
import { VAULT_LISTEN_PAUSE_MS, markWordListened } from '../services/vaultListening'
import {
  joinClips,
  segmentAt,
  silentAudioUrl,
  type ListeningTrack,
  type TrackPhase,
  type TrackSegment,
} from '../services/vaultListeningTrack'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { useOptionalSharedMasterNotePlayback } from './MasterNotePlaybackProvider'
import type { Lexicard } from '../types'

// ESCUCHAR MI BAÚL ICA EN TODA LA APP (Luis, 11 Oct). The player lives in the layout, like the
// master notes, so it keeps playing when the student goes to Juegos, Ranking or leaves the app, and
// with the phone locked:
//  - the words are played as ONE audio file built from the premium voice (one voice only: a word
//    whose voice is not ready yet is left out, it never switches to the old robotic voices);
//  - while the voices are being prepared, the same audio element plays silence, so the phone keeps
//    the page awake even if it is locked right after tapping «Escuchar»;
//  - on other screens a small player at the top shows the word and lets you pause or stop.

export type VaultListeningStatus = 'idle' | 'preparing' | 'playing' | 'paused' | 'done' | 'error'

export type VaultListeningState = {
  status: VaultListeningStatus
  /** The words asked for, in order. */
  words: Lexicard[]
  /** The words in the audio (the ones whose voice was ready). */
  playable: Lexicard[]
  /** Words whose two audios are ready / that could not be prepared / already answered. */
  readyCount: number
  failedCount: number
  settledCount: number
  /** Position in `playable` and which half of it sounds. */
  index: number
  phase: TrackPhase
  rate: number
  error: string | null
  /** Google's daily limit of new audios was reached: the words left out will sound tomorrow. */
  dayLimited: boolean
  /** Words heard in this visit (to update «Sin escuchar aún» at once). */
  heardIds: ReadonlySet<string>
}

export type VaultListeningApi = VaultListeningState & {
  start: (words: Lexicard[], options: { nativeLang: string; targetLang: string; rate: number }) => void
  /** Start now with the words already prepared (the rest stay prepared for next time). */
  startNow: () => void
  pause: () => void
  resume: () => void
  stop: () => void
  /** Back to the previous word (or the start of the one that just sounded), from your language. */
  previous: () => void
}

const INITIAL: VaultListeningState = {
  status: 'idle',
  words: [],
  playable: [],
  readyCount: 0,
  failedCount: 0,
  settledCount: 0,
  index: 0,
  phase: 'native',
  rate: 1,
  error: null,
  dayLimited: false,
  heardIds: new Set(),
}

// Same trick as MasterNotePlaybackProvider: one context even when the dev server reloads this file.
const CONTEXT_KEY = '__icaVaultListeningContext'
const globalStore = globalThis as typeof globalThis & { [CONTEXT_KEY]?: Context<VaultListeningApi | null> }
const VaultListeningContext =
  globalStore[CONTEXT_KEY] ?? (globalStore[CONTEXT_KEY] = createContext<VaultListeningApi | null>(null))

export function useVaultListening(): VaultListeningApi | null {
  return useContext(VaultListeningContext)
}

/**
 * Speed at `time` (Luis, 17 Oct): your language always sounds at normal speed; only the language
 * you learn (and the pause before it, to repeat it) goes at the slow speed chosen.
 */
export function playbackRateAt(segments: TrackSegment[], time: number, slowRate: number): number {
  const segment = segmentAt(segments, time)
  if (!segment) return 1
  if (segment.phase === 'native') return time >= segment.end ? slowRate : 1
  return time < segment.end ? slowRate : 1
}

/**
 * Where «back» goes (Luis, 17 Oct): while your language of a word is sounding, to the word before;
 * once its other half has started (or in the pause after it), to the start of that same word: the
 * one you probably want to hear again. Always from its first half (your language).
 */
export function previousWordStart(segments: TrackSegment[], time: number): number {
  const segment = segmentAt(segments, time)
  if (!segment) return 0
  const word = segment.phase === 'native' && time < segment.end ? segment.word - 1 : segment.word
  const start = segments.find((item) => item.word === Math.max(0, word) && item.phase === 'native')
  return start ? start.start : 0
}

function setMediaSession(
  title: string,
  handlers: { play: () => void; pause: () => void; stop: () => void; previous?: () => void } | null,
  state: MediaSessionPlaybackState,
): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  const session = navigator.mediaSession
  try {
    session.metadata = handlers ? new MediaMetadata({ title, artist: 'Mi Baúl ICA' }) : null
  } catch {
    /* no metadata: it still plays */
  }
  const actions: Array<[MediaSessionAction, (() => void) | null]> = [
    ['play', handlers?.play ?? null],
    ['pause', handlers?.pause ?? null],
    ['stop', handlers?.stop ?? null],
    ['previoustrack', handlers?.previous ?? null],
  ]
  for (const [action, handler] of actions) {
    try {
      session.setActionHandler(action, handler)
    } catch {
      /* this action is not supported here */
    }
  }
  session.playbackState = state
}

export function VaultListeningProvider({ children }: { children: ReactNode }) {
  const masterNotes = useOptionalSharedMasterNotePlayback()
  const [state, setState] = useState<VaultListeningState>(INITIAL)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const silentUrlRef = useRef<string | null>(null)
  const trackRef = useRef<ListeningTrack | null>(null)
  const sessionRef = useRef(0)
  const startedRef = useRef(false)
  const wordsRef = useRef<Lexicard[]>([])
  const clipsRef = useRef<Map<string, [string, string]>>(new Map())
  const markedRef = useRef<Set<string>>(new Set())
  const rateRef = useRef(1)

  const ensureAudio = (): HTMLAudioElement => {
    if (!audioRef.current) {
      const audio = new Audio()
      audio.preload = 'auto'
      // iPhone: «playback» sound session while it sounds (also the silence while preparing), so it
      // keeps playing with the phone locked or outside the app; released when paused or stopped.
      holdWhilePlaying(audio)
      audioRef.current = audio
    }
    return audioRef.current
  }

  const releaseTrack = (): void => {
    const audio = audioRef.current
    if (audio) {
      audio.onplay = null
      audio.onpause = null
      audio.ontimeupdate = null
      audio.onended = null
      audio.pause()
      audio.loop = false
      audio.removeAttribute('src')
    }
    if (trackRef.current) URL.revokeObjectURL(trackRef.current.url)
    trackRef.current = null
    setMediaSession('', null, 'none')
  }

  const stop = (): void => {
    sessionRef.current += 1
    startedRef.current = false
    releaseTrack()
    setState((previous) => ({ ...INITIAL, heardIds: previous.heardIds }))
  }

  const markHeard = (word: Lexicard): void => {
    if (markedRef.current.has(word.id)) return
    markedRef.current.add(word.id)
    void markWordListened(word.id)
    setState((previous) => ({ ...previous, heardIds: new Set(previous.heardIds).add(word.id) }))
  }

  const pause = (): void => {
    audioRef.current?.pause()
  }

  const resume = (): void => {
    const audio = audioRef.current
    if (!audio || !trackRef.current) return
    void audio.play().catch(() => undefined)
  }

  const previous = (): void => {
    const audio = audioRef.current
    const track = trackRef.current
    if (!audio || !track) return
    // After the end, «back» plays the last word again.
    const time = audio.ended ? track.duration : audio.currentTime
    audio.currentTime = previousWordStart(track.segments, time)
    audio.playbackRate = 1
    setState((current) => (current.status === 'done' ? { ...current, status: 'playing' } : current))
    void audio.play().catch(() => undefined)
  }

  const playWords = async (session: number, words: Lexicard[]): Promise<void> => {
    const urls = words.flatMap((word) => clipsRef.current.get(word.id) ?? [])
    const track = await joinClips(urls, VAULT_LISTEN_PAUSE_MS)
    if (session !== sessionRef.current) {
      if (track) URL.revokeObjectURL(track.url)
      return
    }
    if (!track) {
      releaseTrack()
      setState((previous) => ({ ...previous, status: 'error', error: t('No se pudo preparar el audio en este dispositivo.') }))
      return
    }
    trackRef.current = track
    const audio = ensureAudio()
    audio.loop = false
    audio.src = track.url
    // Starts with your language: normal speed (the slow one is only for the language you learn).
    audio.defaultPlaybackRate = 1
    audio.playbackRate = 1
    audio.preservesPitch = true
    audio.ontimeupdate = () => {
      const wantedRate = playbackRateAt(track.segments, audio.currentTime, rateRef.current)
      if (audio.playbackRate !== wantedRate) audio.playbackRate = wantedRate
      const segment = segmentAt(track.segments, audio.currentTime)
      if (!segment) return
      setState((previous) =>
        previous.index === segment.word && previous.phase === segment.phase
          ? previous
          : { ...previous, index: segment.word, phase: segment.phase },
      )
      // A word counts as heard once the half in the language you learn has sounded.
      if (segment.phase === 'target' && audio.currentTime >= segment.end) markHeard(words[segment.word])
    }
    audio.onplay = () => {
      setState((previous) => (previous.status === 'paused' ? { ...previous, status: 'playing' } : previous))
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
    }
    audio.onpause = () => {
      if (audio.ended) return
      setState((previous) => (previous.status === 'playing' ? { ...previous, status: 'paused' } : previous))
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
    }
    audio.onended = () => {
      words.forEach(markHeard)
      setState((previous) => ({ ...previous, status: 'done', index: words.length }))
      setMediaSession('', null, 'none')
    }
    setMediaSession(t('Escuchar mis palabras'), { play: resume, pause, stop, previous }, 'playing')
    setState((previous) => ({ ...previous, status: 'playing', playable: words, index: 0, phase: 'native' }))
    void audio.play().catch(() => {
      // The phone did not allow it (no tap): the student only has to press play.
      setState((previous) => ({ ...previous, status: 'paused' }))
    })
  }

  const beginPlayback = (session: number): void => {
    if (session !== sessionRef.current || startedRef.current) return
    startedRef.current = true
    const ready = wordsRef.current.filter((word) => clipsRef.current.has(word.id))
    const dayLimited = premiumVoiceDayLimited()
    if (ready.length === 0) {
      releaseTrack()
      setState((previous) => ({
        ...previous,
        status: 'error',
        dayLimited,
        error: dayLimited
          ? t('Por hoy la voz de la app ya no puede preparar palabras nuevas. Mañana podrás escucharlas.')
          : t('Ahora mismo la voz de la app está saturada. Prueba otra vez en unos minutos.'),
      }))
      return
    }
    setState((previous) => ({ ...previous, dayLimited }))
    void playWords(session, ready)
  }

  const start: VaultListeningApi['start'] = (words, options) => {
    sessionRef.current += 1
    const session = sessionRef.current
    startedRef.current = false
    releaseTrack()
    stopTTS()
    if (masterNotes?.playingNoteId) masterNotes.stop()
    wordsRef.current = words
    clipsRef.current = new Map()
    markedRef.current = new Set()
    rateRef.current = options.rate

    // Inside the tap: unlock the audio element and keep it playing silence while the voices are
    // prepared, so the phone does not put the page to sleep if it is locked now.
    const audio = ensureAudio()
    if (!silentUrlRef.current) silentUrlRef.current = silentAudioUrl()
    audio.loop = true
    audio.src = silentUrlRef.current
    void audio.play().catch(() => undefined)
    setMediaSession(t('Preparando tus palabras…'), { play: resume, pause, stop }, 'playing')

    setState((previous) => ({
      ...INITIAL,
      heardIds: previous.heardIds,
      status: 'preparing',
      words,
      rate: options.rate,
    }))

    if (!premiumVoiceUsable()) {
      releaseTrack()
      setState((previous) => ({ ...previous, status: 'error', error: t('La voz de la app no está disponible ahora mismo.') }))
      return
    }

    let settled = 0
    for (const word of words) {
      void Promise.all([
        // Each word in the native language it was saved with (Baúl ICA por idioma objetivo).
        getSpeechAudioUrl(word.native, word.nativeLang || options.nativeLang),
        getSpeechAudioUrl(word.target, options.targetLang),
      ]).then(([nativeUrl, targetUrl]) => {
        if (session !== sessionRef.current) return
        const ok = Boolean(nativeUrl && targetUrl)
        if (ok) clipsRef.current.set(word.id, [nativeUrl as string, targetUrl as string])
        settled += 1
        setState((previous) => ({
          ...previous,
          readyCount: previous.readyCount + (ok ? 1 : 0),
          failedCount: previous.failedCount + (ok ? 0 : 1),
          settledCount: previous.settledCount + 1,
        }))
        if (settled === words.length) beginPlayback(session)
      })
    }
  }

  const startNow = (): void => beginPlayback(sessionRef.current)

  // A master note started while the words play: the words pause (never two audios at once).
  // While the voices are still being prepared, the session stops instead (it would start on top).
  const masterPlaying = Boolean(masterNotes?.playingNoteId && !masterNotes.isPaused)
  useEffect(() => {
    if (!masterPlaying) return
    if (state.status === 'preparing') stop()
    else if (audioRef.current && !audioRef.current.paused && trackRef.current) audioRef.current.pause()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterPlaying])

  useEffect(
    () => () => {
      releaseTrack()
      if (silentUrlRef.current) URL.revokeObjectURL(silentUrlRef.current)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const api: VaultListeningApi = { ...state, start, startNow, pause, resume, stop, previous }
  return <VaultListeningContext.Provider value={api}>{children}</VaultListeningContext.Provider>
}

/** Small player at the top of the other screens while the words of the vault play. */
export function VaultListeningMiniPlayer() {
  const listening = useVaultListening()
  const location = useLocation()
  const navigate = useNavigate()
  if (!listening) return null
  const { status } = listening
  if (status !== 'preparing' && status !== 'playing' && status !== 'paused') return null
  // Mi Baúl ICA has the full player.
  if (location.pathname.replace(/\/$/, '') === DASHBOARD_ROUTES.myIcaWords) return null

  const word = status === 'preparing' ? null : listening.playable[listening.index] ?? null
  const total = status === 'preparing' ? listening.words.length : listening.playable.length
  const done = status === 'preparing' ? listening.settledCount : Math.min(listening.index + 1, total)
  const progress = total > 0 ? Math.min(1, done / total) : 0
  const paused = status === 'paused'

  return (
    <div className='shrink-0 px-2.5 pt-2 md:px-4'>
      <div className='relative mx-auto flex w-full max-w-2xl items-center gap-2 overflow-hidden rounded-2xl border-2 border-border bg-card py-1.5 pr-1.5 pl-2 shadow-sm'>
        <button
          type='button'
          onClick={() => navigate(DASHBOARD_ROUTES.myIcaWords)}
          className='flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-0.5 text-left hover:bg-muted/70'
          aria-label={t('Abrir Mi Baúl ICA')}
        >
          <span
            className='flex size-9 shrink-0 items-center justify-center rounded-xl text-white'
            style={{ background: 'var(--ica-i)' }}
            aria-hidden='true'
          >
            <HeadphonesIcon className='size-5' strokeWidth={2.6} />
          </span>
          <span className='min-w-0 flex-1'>
            <span className='block text-[11px] font-black tracking-[0.08em] text-muted-foreground uppercase'>
              {status === 'preparing' ? t('Preparando tus palabras') : paused ? t('En pausa') : t('Escuchando tu Baúl ICA')}
            </span>
            <span className='block truncate text-sm font-extrabold'>
              {word ? `${word.target} · ${word.native}` : t('{n} de {total}', { n: done, total })}
            </span>
          </span>
          {word ? (
            <span className='shrink-0 text-xs font-bold text-muted-foreground tabular-nums'>
              {done} / {total}
            </span>
          ) : null}
        </button>
        {status !== 'preparing' ? (
          <button
            type='button'
            onClick={listening.previous}
            className='flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted'
            aria-label={t('Palabra anterior')}
          >
            <SkipBackIcon className='size-5 fill-current' strokeWidth={2.4} />
          </button>
        ) : null}
        {status !== 'preparing' ? (
          <button
            type='button'
            onClick={paused ? listening.resume : listening.pause}
            className='flex size-10 shrink-0 items-center justify-center rounded-full text-white transition-transform active:scale-95'
            style={{ background: 'var(--ica-i)' }}
            aria-label={paused ? t('Seguir escuchando') : t('Pausar')}
          >
            {paused ? <PlayIcon className='ml-0.5 size-5 fill-current' strokeWidth={2.4} /> : <PauseIcon className='size-5 fill-current' strokeWidth={2.4} />}
          </button>
        ) : null}
        <button
          type='button'
          onClick={listening.stop}
          className='flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted'
          aria-label={t('Dejar de escuchar')}
        >
          <XIcon className='size-5' strokeWidth={2.6} />
        </button>
        <span
          className='absolute bottom-0 left-0 h-[3px]'
          style={{ width: `${progress * 100}%`, background: 'var(--ica-i)' }}
          aria-hidden='true'
        />
      </div>
    </div>
  )
}

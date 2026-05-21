import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RomanizationHint } from '../components/RomanizationHint'
import { SpeakButton } from '../components/SpeakButton'
import { useDashboardContext } from '../context/DashboardContext'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { fetchPhraseHistoryEntry } from '../services/phraseHistory'
import {
  addMasterNoteChunk,
  fetchMasterNoteById,
  fetchMasterNoteChunks,
} from '../services/masterNotes'
import type { MasterNote, PhraseGenerationEntry } from '../types'

type MasterNoteActivatePhraseViewProps = {
  noteId: string
  phraseId: string
  targetLang: string
}

type RecordingDraft = {
  blob: Blob
  url: string
  durationMs: number
  mimeType: string
  sizeBytes: number
}

const MAX_DURATION_MS = 3 * 60 * 1000 + 30 * 1000

type PendingLeaveAction =
  | {
      kind: 'path'
      to: string
    }
  | {
      kind: 'back'
    }
  | null

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function getPreferredMimeType(): string {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return 'audio/webm'
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ]
  const supported = candidates.find((mime) =>
    MediaRecorder.isTypeSupported(mime),
  )
  return supported || 'audio/webm'
}

export function MasterNoteActivatePhraseView({
  noteId,
  phraseId,
  targetLang,
}: MasterNoteActivatePhraseViewProps) {
  const navigate = useNavigate()
  const { refreshCreationDaysFromSource } = useDashboardContext()
  const [note, setNote] = useState<MasterNote | null>(null)
  const [phrase, setPhrase] = useState<PhraseGenerationEntry | null>(null)
  const [recordingDraft, setRecordingDraft] = useState<RecordingDraft | null>(
    null,
  )
  const [recording, setRecording] = useState(false)
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const pendingLeaveRef = useRef<PendingLeaveAction>(null)
  const allowNavigationRef = useRef(false)
  const pageSectionRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!recording) return

    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [recording])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordingStartedAtRef = useRef<number | null>(null)
  const recordingIntervalRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const waveDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const waveFrameRef = useRef<number | null>(null)
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!recording) {
      pendingLeaveRef.current = null
      allowNavigationRef.current = false
      setLeaveDialogOpen(false)
    }
  }, [recording])

  useEffect(() => {
    if (!recording) return

    const onDocumentClickCapture = (event: MouseEvent): void => {
      if (allowNavigationRef.current || leaveDialogOpen) return
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }

      const target = event.target as Element | null
      if (!target) return
      if (target.closest('[role="dialog"]')) return
      if (pageSectionRef.current?.contains(target)) return

      const anchor = target.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download')) return

      let nextUrl: URL
      try {
        nextUrl = new URL(anchor.href, window.location.href)
      } catch {
        return
      }

      if (nextUrl.origin !== window.location.origin) return

      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
      const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
      if (nextPath === currentPath) return

      event.preventDefault()
      event.stopPropagation()
      pendingLeaveRef.current = { kind: 'path', to: nextPath }
      setLeaveDialogOpen(true)
    }

    document.addEventListener('click', onDocumentClickCapture, true)
    return () => {
      document.removeEventListener('click', onDocumentClickCapture, true)
    }
  }, [leaveDialogOpen, recording])

  useEffect(() => {
    if (!recording) return

    const markerState = { masterNoteRecordingGuard: true, at: Date.now() }
    window.history.pushState(markerState, '', window.location.href)

    const onPopState = (): void => {
      if (allowNavigationRef.current) {
        allowNavigationRef.current = false
        return
      }

      pendingLeaveRef.current = { kind: 'back' }
      setLeaveDialogOpen(true)
      window.history.pushState(markerState, '', window.location.href)
    }

    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [recording])

  const clearDraft = (): void => {
    setRecordingDraft((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
  }

  const stopWave = (): void => {
    if (waveFrameRef.current !== null) {
      window.cancelAnimationFrame(waveFrameRef.current)
      waveFrameRef.current = null
    }
    analyserRef.current = null
    waveDataRef.current = null
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => null)
      audioContextRef.current = null
    }
  }

  const stopRecording = (): void => {
    const recorder = mediaRecorderRef.current
    if (!recorder) return
    if (recorder.state !== 'inactive') recorder.stop()
  }

  useEffect(() => {
    const load = async (): Promise<void> => {
      setLoading(true)
      try {
        const [foundNote, foundPhrase, noteChunks] = await Promise.all([
          fetchMasterNoteById(noteId, targetLang),
          fetchPhraseHistoryEntry(phraseId),
          fetchMasterNoteChunks(noteId),
        ])
        if (!foundNote || !foundPhrase) {
          setError('No se encontró la nota o frase seleccionada')
          return
        }

        const totalDuration = noteChunks.reduce(
          (sum, chunk) => sum + chunk.duration_ms,
          0,
        )
        if (
          noteChunks.some((chunk) => chunk.phrase_generation_id === phraseId)
        ) {
          setError('Esta frase ya fue activada en esta nota maestra')
        } else if (foundNote.state !== 'open') {
          setError(
            'La nota maestra está cerrada y no admite nuevas activaciones',
          )
        } else {
          setError(null)
        }

        setNote({ ...foundNote, total_duration_ms: totalDuration })
        setPhrase(foundPhrase)
      } catch (err) {
        console.error(err)
        setError('No se pudo cargar la activación de frase')
      } finally {
        setLoading(false)
      }
    }

    void load()

    return () => {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== 'inactive'
      ) {
        mediaRecorderRef.current.stop()
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
      if (recordingIntervalRef.current !== null) {
        window.clearInterval(recordingIntervalRef.current)
      }
      stopWave()
      if (recordingDraft) URL.revokeObjectURL(recordingDraft.url)
    }
  }, [noteId, phraseId, targetLang])

  const remainingBeforeRecordingMs = Math.max(
    0,
    MAX_DURATION_MS - (note?.total_duration_ms || 0),
  )
  const remainingDuringRecordingMs = Math.max(
    0,
    remainingBeforeRecordingMs - recordingElapsedMs,
  )
  const canRecord =
    !!note &&
    note.state === 'open' &&
    remainingBeforeRecordingMs > 0 &&
    !error?.includes('ya fue activada')

  const exceededLimitWhileRecording =
    recording && remainingDuringRecordingMs === 0
  const exceededLimitForNewRecordings =
    !recording && remainingBeforeRecordingMs === 0

  const startWave = (stream: MediaStream): void => {
    try {
      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser
      const waveBuffer = new ArrayBuffer(analyser.frequencyBinCount)
      waveDataRef.current = new Uint8Array(waveBuffer)

      const draw = () => {
        waveFrameRef.current = window.requestAnimationFrame(draw)

        const canvas = waveCanvasRef.current
        const data = waveDataRef.current
        const node = analyserRef.current
        if (!canvas || !data || !node) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const dpr = window.devicePixelRatio || 1
        const displayWidth = Math.max(1, Math.floor(canvas.clientWidth))
        const displayHeight = Math.max(1, Math.floor(canvas.clientHeight))
        const targetWidth = Math.floor(displayWidth * dpr)
        const targetHeight = Math.floor(displayHeight * dpr)

        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
          canvas.width = targetWidth
          canvas.height = targetHeight
        }

        const width = canvas.width
        const height = canvas.height
        node.getByteFrequencyData(data)

        ctx.clearRect(0, 0, width, height)
        ctx.fillStyle = '#1f2937'
        ctx.fillRect(0, 0, width, height)

        const barCount = data.length
        const barWidth = width / barCount
        for (let i = 0; i < barCount; i += 1) {
          const value = data[i] / 255
          const barHeight = Math.max(2, value * height)
          const x = i * barWidth
          const y = height - barHeight
          ctx.fillStyle = '#60a5fa'
          ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight)
        }
      }

      draw()
    } catch (err) {
      console.error(err)
    }
  }

  const startRecording = async (): Promise<void> => {
    if (recording || !canRecord) return
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setError('No se puede usar micrófono en este dispositivo')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferredMimeType = getPreferredMimeType()
      const recorder = MediaRecorder.isTypeSupported(preferredMimeType)
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream)

      recordedChunksRef.current = []
      recordingStartedAtRef.current = Date.now()
      mediaRecorderRef.current = recorder
      mediaStreamRef.current = stream
      setRecording(true)
      setRecordingElapsedMs(0)
      setError(null)
      startWave(stream)

      if (recordingIntervalRef.current !== null) {
        window.clearInterval(recordingIntervalRef.current)
      }
      recordingIntervalRef.current = window.setInterval(() => {
        const startedAt = recordingStartedAtRef.current
        if (!startedAt) return
        setRecordingElapsedMs(Date.now() - startedAt)
      }, 200)

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data)
      }

      recorder.onstop = () => {
        const startedAt = recordingStartedAtRef.current
        const mimeType = recorder.mimeType || preferredMimeType
        if (startedAt) {
          const durationMs = Date.now() - startedAt
          const blob = new Blob(recordedChunksRef.current, { type: mimeType })
          if (blob.size > 0) {
            const url = URL.createObjectURL(blob)
            setRecordingDraft((prev) => {
              if (prev) URL.revokeObjectURL(prev.url)
              return {
                blob,
                url,
                durationMs,
                mimeType,
                sizeBytes: blob.size,
              }
            })
          }
        }

        mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
        mediaRecorderRef.current = null
        recordingStartedAtRef.current = null
        recordedChunksRef.current = []
        setRecording(false)
        if (recordingIntervalRef.current !== null) {
          window.clearInterval(recordingIntervalRef.current)
          recordingIntervalRef.current = null
        }
        setRecordingElapsedMs(0)
        stopWave()
      }

      recorder.start()
    } catch (err) {
      console.error(err)
      setError('No se pudo iniciar la grabación')
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
      mediaRecorderRef.current = null
      if (recordingIntervalRef.current !== null) {
        window.clearInterval(recordingIntervalRef.current)
        recordingIntervalRef.current = null
      }
      stopWave()
      setRecording(false)
      setRecordingElapsedMs(0)
    }
  }

  const handleSaveChunk = async (): Promise<void> => {
    if (!recordingDraft || !note || !phrase || saving) return
    setSaving(true)
    try {
      await addMasterNoteChunk({
        noteId: note.id,
        phraseGenerationId: phrase.id,
        audioBlob: recordingDraft.blob,
        mimeType: recordingDraft.mimeType,
        durationMs: recordingDraft.durationMs,
      })
      await refreshCreationDaysFromSource()
      navigate(`${DASHBOARD_ROUTES.masterNotes}/note/${note.id}`)
    } catch (err) {
      console.error(err)
      setError('No se pudo guardar el audio en la nota maestra')
    } finally {
      setSaving(false)
    }
  }

  const handleKeepRecording = (): void => {
    pendingLeaveRef.current = null
    setLeaveDialogOpen(false)
  }

  const handleLeaveAnyway = (): void => {
    const pendingLeave = pendingLeaveRef.current
    pendingLeaveRef.current = null
    setLeaveDialogOpen(false)
    if (!pendingLeave) return

    allowNavigationRef.current = true
    if (pendingLeave.kind === 'path') {
      navigate(pendingLeave.to)
      return
    }

    navigate(-1)
  }

  if (loading) {
    return (
      <section
        ref={pageSectionRef}
        className='mx-auto w-full max-w-3xl flex-1 px-5 pt-8 pb-24 lg:pb-8'
      >
        <p className='text-sm text-muted-foreground'>Cargando activación...</p>
      </section>
    )
  }

  if (!note || !phrase) {
    return (
      <section className='mx-auto w-full max-w-3xl flex-1 px-5 pt-8 pb-24 lg:pb-8'>
        <p className='text-sm text-red-400'>No se pudo abrir la activación.</p>
      </section>
    )
  }

  return (
    <>
      <section className='mx-auto w-full max-w-3xl flex-1 px-5 pt-8 pb-24 lg:pb-8'>
        <h2 className='mb-1 font-serif text-2xl lg:text-3xl font-bold'>
          Activar frase
        </h2>
        <p className='mb-2 text-sm text-muted-foreground'>Nota: {note.name}</p>
        <p className='mb-4 text-sm text-muted-foreground'>
          Acumulado: {formatDuration(note.total_duration_ms)} · Disponible:{' '}
          {formatDuration(remainingBeforeRecordingMs)}
        </p>
        {error && <p className='mb-3 text-sm text-red-400'>{error}</p>}

        <Card className='rounded-2xl'>
          <CardContent>
            <p className='font-serif text-2xl font-bold'>
              {phrase.generated_phrase || 'Sin frase'}
            </p>
            {phrase.generated_phrase && (
              <RomanizationHint
                text={phrase.generated_phrase}
                language={targetLang}
              />
            )}
            <p className='mt-2 text-lg text-muted-foreground'>
              {phrase.translation || 'Sin traducción'}
            </p>
            {phrase.source_words && phrase.source_words.length > 0 && (
              <div className='mt-3 flex flex-wrap gap-2'>
                {phrase.source_words.map((word) => (
                  <span
                    key={word}
                    className='rounded-md bg-primary/30 px-2.5 py-0.5 text-xs font-semibold text-white'
                  >
                    {word}
                  </span>
                ))}
              </div>
            )}

            {phrase.generated_phrase && (
              <div className='mt-3'>
                <SpeakButton
                  text={phrase.generated_phrase}
                  langName={targetLang}
                  color='#3B82F6'
                  disabled={recording}
                />
              </div>
            )}

            <div className='mt-4 rounded-xl border border-border/70 bg-muted/30 p-3'>
              <p className='mb-2 text-xs font-semibold tracking-wide text-muted-foreground'>
                GRABADOR
              </p>

              {recording && (
                <div className='mb-2 space-y-1'>
                  <p className='text-sm'>
                    Grabando: {formatDuration(recordingElapsedMs)}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    Tiempo restante para la nota:{' '}
                    {formatDuration(remainingDuringRecordingMs)}
                  </p>
                  {exceededLimitWhileRecording && (
                    <p className='text-xs font-semibold text-red-400'>
                      Superaste 3:30. Puedes guardar este audio, pero no podrás
                      grabar más.
                    </p>
                  )}
                  <canvas
                    ref={waveCanvasRef}
                    width={600}
                    height={72}
                    className='h-18 w-full rounded-md border border-border/60 bg-slate-900'
                  />
                </div>
              )}

              {recording ? (
                <Button type='button' onClick={stopRecording} size='sm'>
                  ⏹️ Detener
                </Button>
              ) : (
                <Button
                  type='button'
                  onClick={() => void startRecording()}
                  size='sm'
                  disabled={!canRecord}
                >
                  Activar frase
                </Button>
              )}

              {exceededLimitForNewRecordings && (
                <p className='mt-2 text-xs font-semibold text-red-400'>
                  Esta nota ya superó 3:30. Ya no puedes grabar más audios.
                </p>
              )}

              {recordingDraft && (
                <div className='mt-3 rounded-lg border border-border/60 bg-background p-2'>
                  <p className='mb-1 text-xs text-muted-foreground'>
                    Borrador: {formatDuration(recordingDraft.durationMs)} ·{' '}
                    {Math.round(recordingDraft.sizeBytes / 1024)} KB
                  </p>
                  <audio controls src={recordingDraft.url} className='w-full' />
                  <div className='mt-2 flex gap-2'>
                    <Button
                      type='button'
                      onClick={() => void handleSaveChunk()}
                      size='sm'
                      variant='outline'
                      disabled={saving}
                    >
                      {saving ? 'Guardando...' : 'Guardar audio'}
                    </Button>
                    {!saving && (
                      <Button
                        type='button'
                        onClick={clearDraft}
                        size='sm'
                        variant='ghost'
                      >
                        Descartar
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <Dialog
        open={leaveDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleKeepRecording()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salir durante grabación</DialogTitle>
            <DialogDescription>
              Hay una grabación en curso. Si sales ahora, se perderá.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={handleKeepRecording}
            >
              Seguir grabando
            </Button>
            <Button
              type='button'
              variant='destructive'
              onClick={handleLeaveAnyway}
            >
              Salir igual
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

import { useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  CheckIcon,
  Loader2Icon,
  MessageSquareTextIcon,
  MicIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SendIcon,
  SquareIcon,
  Trash2Icon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { t } from '@/i18n'
import { RoundActionButton, SquareIconButton } from '../MasterNoteGameUi'
import { tone as toneColors, type Tone } from '../../game/ui'
import { formatClock, useAudioRecorder, type AudioRecorderError } from '../../hooks/useAudioRecorder'
import type { CoachingTaskAudioAnswer } from '../../services/coaching'
import { saveCoachTaskFeedback, sendStudentTaskAudio } from '../../services/coachingTaskAudio'

// AUDIO TASKS (Luis, 6 Oct). Student: record, listen, send. Coach: listen to the student and
// answer with an audio, a text or both. The student then sees «Tu coach te ha respondido».
// Look (Luis, 7 Oct): the same recorder as Activación (big red mic, pause, timer, live waveform)
// and a player of our own instead of the browser's grey one.

export type TaskAudioTarget = {
  sessionId: string
  periodNumber: number
  classIndex: 1 | 2
  taskIndex: 1 | 2 | 3
}

type Recorder = ReturnType<typeof useAudioRecorder>

function recorderErrorText(error: AudioRecorderError | null): string | null {
  if (error === 'unsupported') return t('Tu navegador no permite grabar audio. Prueba con Chrome o Safari actualizados.')
  if (error === 'denied') return t('Para grabar, permite el micrófono en tu navegador.')
  if (error === 'failed') return t('No se pudo empezar a grabar. Inténtalo de nuevo.')
  return null
}

/** Live bars of the microphone while recording, like Activación. */
function RecordingWave({ stream, paused }: { stream: MediaStream | null; paused: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!stream) return
    let frame = 0
    let context: AudioContext | null = null
    try {
      context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      context.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
      const draw = () => {
        frame = window.requestAnimationFrame(draw)
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx) return
        const dpr = window.devicePixelRatio || 1
        const width = Math.max(1, Math.floor(canvas.clientWidth * dpr))
        const height = Math.max(1, Math.floor(canvas.clientHeight * dpr))
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width
          canvas.height = height
        }
        analyser.getByteFrequencyData(data)
        ctx.clearRect(0, 0, width, height)
        ctx.fillStyle = window.getComputedStyle(canvas).color || '#ef4444'
        const bars = Math.min(40, data.length)
        const gap = 3 * dpr
        const barWidth = Math.max(2, (width - gap * (bars - 1)) / bars)
        for (let i = 0; i < bars; i += 1) {
          const barHeight = Math.max(4 * dpr, (data[i] / 255) * height)
          const x = i * (barWidth + gap)
          const y = (height - barHeight) / 2
          ctx.beginPath()
          if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, barWidth, barHeight, Math.min(barWidth, barHeight) / 2)
          else ctx.rect(x, y, barWidth, barHeight)
          ctx.fill()
        }
      }
      draw()
    } catch {
      // Without the waveform the recording still works.
    }
    return () => {
      window.cancelAnimationFrame(frame)
      void context?.close().catch(() => undefined)
    }
  }, [stream])

  return (
    <canvas
      ref={canvasRef}
      className='mt-4 h-12 w-full transition-opacity'
      style={{ color: 'var(--ica-a)', opacity: paused ? 0.35 : 1 }}
      aria-hidden='true'
    />
  )
}

/**
 * Our own audio player: round play button, a bar you can tap to jump, and the times.
 * `knownSeconds` covers recordings whose length the browser cannot read (webm from Chrome).
 */
function VoicePlayer({
  src,
  label,
  knownSeconds,
  toneName = 'a',
}: {
  src: string
  label: string
  knownSeconds?: number | null
  toneName?: Tone
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const colors = toneColors(toneName)
  const total = duration > 0 ? duration : Math.max(0, knownSeconds || 0)
  const progress = total > 0 ? Math.min(1, current / total) : 0

  useEffect(() => {
    setPlaying(false)
    setCurrent(0)
    setDuration(0)
  }, [src])

  const readDuration = () => {
    const value = audioRef.current?.duration
    if (value && Number.isFinite(value)) setDuration(value)
  }

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) void audio.play().catch(() => setPlaying(false))
    else audio.pause()
  }

  const seek = (event: PointerEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio || total <= 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    audio.currentTime = ratio * total
    setCurrent(audio.currentTime)
  }

  return (
    <div
      className='flex items-center gap-3 rounded-2xl border-2 px-2.5 py-2'
      style={{ borderColor: `color-mix(in oklab, ${colors.solid} 30%, var(--border))`, background: `color-mix(in oklab, ${colors.solid} 7%, transparent)` }}
    >
      <audio
        ref={audioRef}
        src={src}
        preload='metadata'
        onLoadedMetadata={readDuration}
        onDurationChange={readDuration}
        onTimeUpdate={() => setCurrent(audioRef.current?.currentTime || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setCurrent(0)
        }}
      />
      <button
        type='button'
        onClick={toggle}
        aria-label={playing ? t('Pausar {label}', { label }) : t('Escuchar {label}', { label })}
        className='ica-press flex size-11 shrink-0 items-center justify-center rounded-full text-white'
        style={{ background: colors.solid, boxShadow: `0 3px 0 ${colors.edge}` }}
      >
        {playing ? (
          <PauseIcon className='size-5 fill-current' strokeWidth={2.4} />
        ) : (
          <PlayIcon className='ml-0.5 size-5 fill-current' strokeWidth={2.4} />
        )}
      </button>
      <div className='min-w-0 flex-1'>
        <div
          role='slider'
          tabIndex={0}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(current)}
          onPointerDown={seek}
          onKeyDown={(event) => {
            const audio = audioRef.current
            if (!audio) return
            if (event.key === 'ArrowRight') audio.currentTime = Math.min(total, audio.currentTime + 5)
            if (event.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5)
          }}
          className='relative h-2.5 w-full cursor-pointer rounded-full bg-muted'
        >
          <span
            className='absolute inset-y-0 left-0 rounded-full'
            style={{ width: `${progress * 100}%`, background: colors.solid }}
          />
          <span
            className='absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-card'
            style={{ left: `${progress * 100}%`, borderColor: colors.solid }}
            aria-hidden='true'
          />
        </div>
        <div className='mt-1 flex justify-between text-[11px] font-extrabold text-muted-foreground tabular-nums'>
          <span>{formatClock(current)}</span>
          <span>{total > 0 ? formatClock(total) : '–:––'}</span>
        </div>
      </div>
    </div>
  )
}

/** The recorder of Activación: big mic, then pause + stop with the timer and the waveform. */
function RecorderPanel({
  recorder,
  disabled,
  size,
  idleTitle,
  idleText,
}: {
  recorder: Recorder
  disabled?: boolean
  size: number
  idleTitle: string
  idleText: string
}) {
  const errorText = recorderErrorText(recorder.error)
  const live = recorder.recording && !recorder.paused
  const pauseSize = Math.round(size * 0.46)
  const title = recorder.recording ? (recorder.paused ? t('Grabación pausada') : t('Grabando…')) : idleTitle
  const text = recorder.recording ? t('Toca el cuadrado para terminar.') : idleText

  return (
    <div className='flex flex-col items-center py-2 text-center'>
      <div className='flex items-center justify-center gap-5'>
        {recorder.recording ? (
          <SquareIconButton
            onClick={recorder.paused ? recorder.resume : recorder.pause}
            ariaLabel={recorder.paused ? t('Reanudar grabación') : t('Pausar grabación')}
            className='shrink-0'
          >
            {recorder.paused ? (
              <PlayIcon className='ml-0.5 size-5 fill-current' strokeWidth={2.4} />
            ) : (
              <PauseIcon className='size-5 fill-current' strokeWidth={2.4} />
            )}
          </SquareIconButton>
        ) : null}
        <RoundActionButton
          size={size}
          onClick={recorder.recording ? recorder.stop : () => void recorder.start()}
          disabled={disabled && !recorder.recording}
          ariaLabel={recorder.recording ? t('Detener grabación') : idleTitle}
          live={live}
        >
          {recorder.recording ? (
            <SquareIcon style={{ width: size * 0.32, height: size * 0.32 }} className='fill-current' strokeWidth={2.4} />
          ) : (
            <MicIcon style={{ width: size * 0.42, height: size * 0.42 }} strokeWidth={2.4} />
          )}
        </RoundActionButton>
        {recorder.recording ? <span className='shrink-0' style={{ width: Math.max(44, pauseSize) }} aria-hidden='true' /> : null}
      </div>

      <p className='m-0 mt-5 text-lg font-black tracking-tight'>{title}</p>
      {recorder.recording ? (
        <p className='m-0 mt-1 text-3xl leading-none font-black tabular-nums' style={{ color: 'var(--ica-a-ink)' }}>
          {formatClock(recorder.elapsed)}
          <span className='ml-1 text-sm font-bold text-muted-foreground'>/ {formatClock(recorder.maxSeconds)}</span>
        </p>
      ) : null}
      <p className='m-0 mt-1.5 max-w-xs text-sm font-semibold text-muted-foreground'>{text}</p>
      {recorder.recording ? <RecordingWave stream={recorder.stream} paused={recorder.paused} /> : null}
      {errorText ? (
        <p className='m-0 mt-3 rounded-xl px-3 py-2 text-xs font-bold' style={{ background: 'var(--ica-bad-soft)', color: 'var(--ica-bad-ink)' }}>
          {errorText}
        </p>
      ) : null}
    </div>
  )
}

/** Draft just recorded: listen, then send or record again. */
function DraftCard({
  recorder,
  busy,
  sendLabel,
  onSend,
  onDiscard,
}: {
  recorder: Recorder
  busy: boolean
  sendLabel: string
  onSend?: () => void
  onDiscard: () => void
}) {
  if (!recorder.audio) return null
  return (
    <div className='rounded-2xl border-2 border-border bg-card p-4 dark:bg-background/40'>
      <div className='flex items-center justify-between gap-3'>
        <p className='ica-label m-0'>{t('Tu grabación')}</p>
        <span className='text-xs font-extrabold text-muted-foreground tabular-nums'>{formatClock(recorder.audio.seconds)}</span>
      </div>
      <div className='mt-3'>
        <VoicePlayer src={recorder.audio.url} label={t('tu grabación')} knownSeconds={recorder.audio.seconds} />
      </div>
      {onSend ? (
        <Button type='button' size='xl' variant='a' className='mt-4 w-full' onClick={onSend} disabled={busy}>
          {busy ? <Loader2Icon className='size-5 animate-spin' strokeWidth={2.6} /> : <SendIcon className='size-5' strokeWidth={2.6} />}
          {busy ? t('Enviando...') : sendLabel}
        </Button>
      ) : null}
      <Button
        type='button'
        size='lg'
        variant='ghost'
        className='mt-2 w-full text-muted-foreground'
        onClick={onDiscard}
        disabled={busy}
      >
        <RotateCcwIcon className='size-4.5' strokeWidth={2.4} />
        {t('Grabar otra vez')}
      </Button>
    </div>
  )
}

function CoachFeedbackView({ answer }: { answer: CoachingTaskAudioAnswer }) {
  if (!answer.feedbackAt) return null
  return (
    <div
      className='space-y-3 rounded-2xl border-2 p-3.5'
      style={{ borderColor: 'var(--ica-gold)', background: 'color-mix(in oklab, var(--ica-gold) 10%, transparent)' }}
    >
      <p className='m-0 flex items-center gap-1.5 text-xs font-black tracking-wide uppercase' style={{ color: 'var(--ica-gold-ink)' }}>
        <MessageSquareTextIcon className='size-4' strokeWidth={2.6} aria-hidden='true' />
        {t('Tu coach te ha respondido')}
      </p>
      {answer.feedbackAudioUrl ? (
        <VoicePlayer
          src={answer.feedbackAudioUrl}
          label={t('el audio de tu coach')}
          knownSeconds={answer.feedbackAudioSeconds}
          toneName='gold'
        />
      ) : null}
      {answer.feedbackText ? <p className='m-0 text-sm font-semibold whitespace-pre-wrap'>{answer.feedbackText}</p> : null}
    </div>
  )
}

/** Student side of an audio task. */
export function StudentTaskAudio({
  target,
  answer,
  canEdit,
  onSent,
}: {
  target: TaskAudioTarget
  answer: CoachingTaskAudioAnswer | null
  canEdit: boolean
  onSent: (answer: CoachingTaskAudioAnswer, studentCompletedAt: string | null) => void
}) {
  const recorder = useAudioRecorder(180)
  const [sending, setSending] = useState(false)
  const [rerecording, setRerecording] = useState(false)
  const reviewed = Boolean(answer?.feedbackAt)

  const send = async () => {
    if (!recorder.audio) return
    setSending(true)
    try {
      const result = await sendStudentTaskAudio({ ...target, blob: recorder.audio.blob, seconds: recorder.audio.seconds })
      recorder.clear()
      setRerecording(false)
      onSent(result.answer, result.studentCompletedAt)
      toast.success(t('Audio enviado. Tu coach lo escuchará y te responderá.'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('No se pudo enviar el audio.'))
    } finally {
      setSending(false)
    }
  }

  if (answer && !rerecording) {
    return (
      <div className='space-y-3'>
        <div className='rounded-2xl border-2 border-border bg-card p-3.5 dark:bg-background/40'>
          <div className='mb-2.5 flex items-center justify-between gap-2'>
            <p className='ica-label m-0'>{t('Tu audio')}</p>
            <span
              className='inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black'
              style={{ background: 'var(--ica-ok-soft)', color: 'var(--ica-ok-ink)' }}
            >
              <CheckIcon className='size-3.5' strokeWidth={3} aria-hidden='true' />
              {t('Enviado')}
            </span>
          </div>
          {answer.studentAudioUrl ? (
            <VoicePlayer src={answer.studentAudioUrl} label={t('tu audio')} knownSeconds={answer.studentAudioSeconds} />
          ) : null}
          {!reviewed ? (
            <div className='mt-2.5 flex flex-wrap items-center justify-between gap-2'>
              <p className='m-0 text-xs font-semibold text-muted-foreground'>{t('Tu coach te responderá aquí.')}</p>
              {canEdit ? (
                <Button type='button' size='sm' variant='ghost' className='text-muted-foreground' onClick={() => setRerecording(true)}>
                  <RotateCcwIcon className='size-4' aria-hidden='true' />
                  {t('Cambiar mi audio')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {reviewed ? <CoachFeedbackView answer={answer} /> : null}
      </div>
    )
  }

  if (!canEdit) {
    return <p className='text-xs text-muted-foreground'>{t('Esta tarea se respondía con un audio.')}</p>
  }

  return (
    <div className='space-y-3'>
      {recorder.audio && !recorder.recording ? (
        <DraftCard
          recorder={recorder}
          busy={sending}
          sendLabel={t('Enviar a mi coach')}
          onSend={() => void send()}
          onDiscard={() => recorder.clear()}
        />
      ) : (
        <div className='rounded-2xl border-2 border-dashed border-border px-4 py-5'>
          <RecorderPanel
            recorder={recorder}
            disabled={sending}
            size={96}
            idleTitle={t('Graba tu respuesta')}
            idleText={t('Toca el micro y responde en voz alta. Hasta 3 minutos.')}
          />
        </div>
      )}
      {rerecording && !recorder.recording ? (
        <Button
          type='button'
          size='sm'
          variant='ghost'
          className='w-full text-muted-foreground'
          onClick={() => {
            recorder.clear()
            setRerecording(false)
          }}
          disabled={sending}
        >
          {t('Cancelar y dejar mi audio anterior')}
        </Button>
      ) : null}
    </div>
  )
}

/** Coach side: the student's audio and the feedback form. */
export function CoachTaskAudioFeedback({
  target,
  answer,
  onSaved,
}: {
  target: TaskAudioTarget
  answer: CoachingTaskAudioAnswer | null
  onSaved: (answer: CoachingTaskAudioAnswer) => void
}) {
  const recorder = useAudioRecorder(300)
  const [text, setText] = useState(answer?.feedbackText || '')
  const [removeAudio, setRemoveAudio] = useState(false)
  const [saving, setSaving] = useState(false)

  if (!answer) {
    return (
      <p className='m-0 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground'>
        <MicIcon className='size-3.5' aria-hidden='true' />
        {t('El alumno todavía no ha mandado su audio.')}
      </p>
    )
  }

  const keepsOldAudio = Boolean(answer.feedbackAudioUrl) && !removeAudio && !recorder.audio
  const canSave = !saving && !recorder.recording && (Boolean(text.trim()) || Boolean(recorder.audio) || keepsOldAudio)

  const save = async () => {
    setSaving(true)
    try {
      const saved = await saveCoachTaskFeedback({
        ...target,
        feedbackText: text.trim() || null,
        audio: recorder.audio ? { blob: recorder.audio.blob, seconds: recorder.audio.seconds } : null,
        removeAudio: removeAudio && !recorder.audio,
      })
      recorder.clear()
      setRemoveAudio(false)
      onSaved(saved)
      toast.success(answer.feedbackAt ? t('Feedback actualizado.') : t('Feedback enviado al alumno.'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('No se pudo guardar el feedback.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='space-y-3'>
      <div className='rounded-2xl border-2 border-border bg-card p-3.5 dark:bg-background/40'>
        <p className='ica-label m-0 mb-2.5'>{t('Audio del alumno')}</p>
        {answer.studentAudioUrl ? (
          <VoicePlayer src={answer.studentAudioUrl} label={t('el audio del alumno')} knownSeconds={answer.studentAudioSeconds} />
        ) : null}
      </div>

      <div className='space-y-3 rounded-2xl border-2 border-border p-3.5'>
        <p className='ica-label m-0'>
          {answer.feedbackAt ? t('Tu feedback (ya enviado)') : t('Tu feedback: graba un audio, escribe o las dos cosas')}
        </p>
        {keepsOldAudio && answer.feedbackAudioUrl ? (
          <div className='flex items-center gap-2'>
            <div className='min-w-0 flex-1'>
              <VoicePlayer
                src={answer.feedbackAudioUrl}
                label={t('tu audio de feedback')}
                knownSeconds={answer.feedbackAudioSeconds}
                toneName='gold'
              />
            </div>
            <SquareIconButton onClick={() => setRemoveAudio(true)} ariaLabel={t('Quitar tu audio')}>
              <Trash2Icon className='size-4.5' strokeWidth={2.4} />
            </SquareIconButton>
          </div>
        ) : recorder.audio && !recorder.recording ? (
          <DraftCard recorder={recorder} busy={saving} sendLabel='' onDiscard={() => recorder.clear()} />
        ) : (
          <RecorderPanel
            recorder={recorder}
            disabled={saving}
            size={76}
            idleTitle={answer.feedbackAudioUrl ? t('Grabar otro audio') : t('Grabar feedback en audio')}
            idleText={t('Hasta 5 minutos. También puedes escribir abajo.')}
          />
        )}
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          className='rounded-2xl'
          placeholder={t('Escribe tu corrección o comentario (opcional si mandas audio)')}
        />
        <Button type='button' size='xl' variant='a' className='w-full' onClick={() => void save()} disabled={!canSave}>
          {saving ? <Loader2Icon className='size-5 animate-spin' strokeWidth={2.6} /> : <SendIcon className='size-5' strokeWidth={2.6} />}
          {saving ? t('Guardando...') : answer.feedbackAt ? t('Actualizar feedback') : t('Enviar feedback')}
        </Button>
      </div>
    </div>
  )
}

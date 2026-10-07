import { useState } from 'react'
import { CheckIcon, MicIcon, MessageSquareTextIcon, RotateCcwIcon, SendIcon, SquareIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { t } from '@/i18n'
import { formatClock, useAudioRecorder, type AudioRecorderError } from '../../hooks/useAudioRecorder'
import type { CoachingTaskAudioAnswer } from '../../services/coaching'
import { saveCoachTaskFeedback, sendStudentTaskAudio } from '../../services/coachingTaskAudio'

// AUDIO TASKS (Luis, 6 Oct). Student: record, listen, send. Coach: listen to the student and
// answer with an audio, a text or both. The student then sees «Tu coach te ha respondido».

export type TaskAudioTarget = {
  sessionId: string
  periodNumber: number
  classIndex: 1 | 2
  taskIndex: 1 | 2 | 3
}

function recorderErrorText(error: AudioRecorderError | null): string | null {
  if (error === 'unsupported') return t('Tu navegador no permite grabar audio. Prueba con Chrome o Safari actualizados.')
  if (error === 'denied') return t('Para grabar, permite el micrófono en tu navegador.')
  if (error === 'failed') return t('No se pudo empezar a grabar. Inténtalo de nuevo.')
  return null
}

function AudioPlayer({ src, label }: { src: string; label: string }) {
  return <audio controls preload='metadata' src={src} className='h-10 w-full' aria-label={label} />
}

/** Record button, timer and preview, shared by student and coach. */
function Recorder({
  recorder,
  disabled,
  recordLabel,
}: {
  recorder: ReturnType<typeof useAudioRecorder>
  disabled?: boolean
  recordLabel: string
}) {
  const errorText = recorderErrorText(recorder.error)
  return (
    <div className='space-y-2'>
      {recorder.recording ? (
        <div className='flex items-center gap-3 rounded-2xl border px-3 py-2' style={{ borderColor: 'var(--v3-line)' }}>
          <span className='size-3 shrink-0 animate-pulse rounded-full bg-red-500' aria-hidden='true' />
          <span className='flex-1 text-sm font-bold tabular-nums'>
            {formatClock(recorder.elapsed)}
            <span className='font-medium text-muted-foreground'> / {formatClock(recorder.maxSeconds)}</span>
          </span>
          <Button type='button' size='sm' variant='destructive' onClick={recorder.stop} aria-label={t('Parar la grabación')}>
            <SquareIcon className='size-4' aria-hidden='true' />
            {t('Parar')}
          </Button>
        </div>
      ) : recorder.audio ? (
        <div className='space-y-2'>
          <AudioPlayer src={recorder.audio.url} label={t('Escuchar tu grabación')} />
          <Button type='button' size='sm' variant='ghost' onClick={() => void recorder.start()} disabled={disabled}>
            <RotateCcwIcon className='size-4' aria-hidden='true' />
            {t('Grabar otra vez')}
          </Button>
        </div>
      ) : (
        <Button type='button' size='sm' variant='outline' onClick={() => void recorder.start()} disabled={disabled}>
          <MicIcon className='size-4' aria-hidden='true' />
          {recordLabel}
        </Button>
      )}
      {errorText ? <p className='text-xs font-semibold text-red-600 dark:text-red-400'>{errorText}</p> : null}
    </div>
  )
}

function CoachFeedbackView({ answer }: { answer: CoachingTaskAudioAnswer }) {
  if (!answer.feedbackAt) return null
  return (
    <div
      className='space-y-2 rounded-2xl border p-3'
      style={{
        borderColor: 'color-mix(in oklab, var(--v3-gold) 55%, var(--v3-line) 45%)',
        background: 'color-mix(in oklab, var(--v3-gold) 10%, var(--v3-card) 90%)',
      }}
    >
      <p className='flex items-center gap-1.5 text-xs font-black tracking-wide uppercase' style={{ color: 'var(--ica-gold-ink)' }}>
        <MessageSquareTextIcon className='size-3.5' aria-hidden='true' />
        {t('Tu coach te ha respondido')}
      </p>
      {answer.feedbackAudioUrl ? <AudioPlayer src={answer.feedbackAudioUrl} label={t('Audio de tu coach')} /> : null}
      {answer.feedbackText ? <p className='text-sm whitespace-pre-wrap'>{answer.feedbackText}</p> : null}
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
        <div className='space-y-1.5'>
          <p className='flex items-center gap-1.5 text-xs font-bold text-muted-foreground'>
            <CheckIcon className='size-3.5 text-cyan-500' aria-hidden='true' />
            {t('Tu audio')}
          </p>
          {answer.studentAudioUrl ? <AudioPlayer src={answer.studentAudioUrl} label={t('Tu audio')} /> : null}
        </div>
        {reviewed ? (
          <CoachFeedbackView answer={answer} />
        ) : (
          <div className='flex flex-wrap items-center gap-2'>
            <p className='text-xs text-muted-foreground'>{t('Enviado. Tu coach te responderá aquí.')}</p>
            {canEdit ? (
              <Button type='button' size='sm' variant='ghost' onClick={() => setRerecording(true)}>
                <RotateCcwIcon className='size-4' aria-hidden='true' />
                {t('Cambiar mi audio')}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    )
  }

  if (!canEdit) {
    return <p className='text-xs text-muted-foreground'>{t('Esta tarea se respondía con un audio.')}</p>
  }

  return (
    <div className='space-y-3'>
      <p className='flex items-center gap-1.5 text-xs font-semibold text-muted-foreground'>
        <MicIcon className='size-3.5' aria-hidden='true' />
        {t('Esta tarea se responde con un audio (hasta 3 minutos).')}
      </p>
      <Recorder recorder={recorder} disabled={sending} recordLabel={t('Grabar mi respuesta')} />
      {recorder.audio && !recorder.recording ? (
        <div className='flex flex-wrap gap-2'>
          <Button type='button' size='sm' onClick={() => void send()} disabled={sending}>
            <SendIcon className='size-4' aria-hidden='true' />
            {sending ? t('Enviando...') : t('Enviar a mi coach')}
          </Button>
          {rerecording ? (
            <Button type='button' size='sm' variant='ghost' onClick={() => { recorder.clear(); setRerecording(false) }} disabled={sending}>
              {t('Cancelar')}
            </Button>
          ) : null}
        </div>
      ) : rerecording && !recorder.recording ? (
        <Button type='button' size='sm' variant='ghost' onClick={() => setRerecording(false)}>
          {t('Cancelar')}
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
    return <p className='text-xs text-muted-foreground'>{t('El alumno todavía no ha mandado su audio.')}</p>
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
      <div className='space-y-1.5'>
        <p className='text-xs font-medium text-foreground'>{t('Audio del alumno')}</p>
        {answer.studentAudioUrl ? <AudioPlayer src={answer.studentAudioUrl} label={t('Audio del alumno')} /> : null}
      </div>
      <div className='space-y-2 rounded-xl border p-3' style={{ borderColor: 'var(--v3-line)' }}>
        <p className='text-xs font-medium text-foreground'>
          {answer.feedbackAt ? t('Tu feedback (ya enviado)') : t('Tu feedback: graba un audio, escribe o las dos cosas')}
        </p>
        {keepsOldAudio && answer.feedbackAudioUrl ? (
          <div className='flex items-center gap-2'>
            <div className='min-w-0 flex-1'>
              <AudioPlayer src={answer.feedbackAudioUrl} label={t('Tu audio de feedback')} />
            </div>
            <Button type='button' size='icon' variant='ghost' onClick={() => setRemoveAudio(true)} aria-label={t('Quitar tu audio')}>
              <Trash2Icon className='size-4' aria-hidden='true' />
            </Button>
          </div>
        ) : (
          <Recorder
            recorder={recorder}
            disabled={saving}
            recordLabel={answer.feedbackAudioUrl ? t('Grabar otro audio') : t('Grabar feedback en audio')}
          />
        )}
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          placeholder={t('Escribe tu corrección o comentario (opcional si mandas audio)')}
        />
        <Button type='button' size='sm' onClick={() => void save()} disabled={!canSave}>
          <SendIcon className='size-4' aria-hidden='true' />
          {saving ? t('Guardando...') : answer.feedbackAt ? t('Actualizar feedback') : t('Enviar feedback')}
        </Button>
      </div>
    </div>
  )
}

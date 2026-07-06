import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  fetchPregunticaHistory,
  type PregunticaHistoryAttempt,
  type PregunticaHistoryWeek,
} from '../services/preguntica'

type PregunticaHistoryQuestionCard = {
  id: string
  questionText: string
  questionTranslation: string | null
  weekStart: string
  weekEnd: string
  timezone: string
  isUnlocked: boolean
  unlockedVia: 'progress' | 'tokens' | 'manual' | null
  activationWordsCount: number
  requiredActivationWords: number
  completedAt: string | null
  attempts: PregunticaHistoryAttempt[]
}

function formatDate(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(durationMs: number | null): string {
  if (!durationMs || durationMs <= 0) return '-'
  const seconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}:${String(remaining).padStart(2, '0')}`
}

function getStatusLabel(status: string): string {
  const normalized = status.trim().toLowerCase()
  if (normalized === 'pending_response') return 'Pendiente de respuesta'
  if (normalized === 'analyzing') return 'Analizando'
  if (normalized === 'analyzed') return 'Analizada'
  if (normalized === 'completed') return 'Completada'
  if (normalized === 'failed') return 'Con errores'
  return status
}

function getModeLabel(mode: string): string {
  const normalized = mode.trim().toLowerCase()
  if (normalized === 'mixed') return 'Aleatorio'
  if (normalized === 'vital') return 'Vital'
  if (normalized === 'frequent') return 'Frecuente'
  if (normalized === 'occasional') return 'Ocasional'
  if (normalized === 'rare') return 'Raro'
  return mode
}

function getUnlockLabel(source: string | null): string {
  if (!source) return 'Sin desbloquear'
  if (source === 'progress') return 'Progreso'
  if (source === 'tokens') return 'Fichas'
  if (source === 'manual') return 'Manual'
  return source
}

function toQuestionCards(weeks: PregunticaHistoryWeek[]): PregunticaHistoryQuestionCard[] {
  return weeks.flatMap((week) => {
    if (week.attempts.length === 0) {
      return [
        {
          id: `week-${week.id}`,
          questionText: 'Sin pregunta registrada',
          questionTranslation: null,
          weekStart: week.weekStart,
          weekEnd: week.weekEnd,
          timezone: week.timezone,
          isUnlocked: week.isUnlocked,
          unlockedVia: week.unlockedVia,
          activationWordsCount: week.activationWordsCount,
          requiredActivationWords: week.requiredActivationWords,
          completedAt: week.completedAt,
          attempts: [],
        },
      ]
    }

    const groups = new Map<string, PregunticaHistoryQuestionCard>()

    week.attempts.forEach((attempt) => {
      const rawQuestion = attempt.questionText?.trim() || ''
      const questionText = rawQuestion || 'Sin pregunta registrada'
      const questionKey = attempt.questionId || `text:${questionText.toLowerCase()}`
      const key = `${week.id}:${questionKey}`

      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          questionText,
          questionTranslation: attempt.questionTranslation,
          weekStart: week.weekStart,
          weekEnd: week.weekEnd,
          timezone: week.timezone,
          isUnlocked: week.isUnlocked,
          unlockedVia: week.unlockedVia,
          activationWordsCount: week.activationWordsCount,
          requiredActivationWords: week.requiredActivationWords,
          completedAt: week.completedAt,
          attempts: [],
        })
      }

      groups.get(key)?.attempts.push(attempt)
    })

    return Array.from(groups.values()).map((group) => ({
      ...group,
      attempts: [...group.attempts].sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime()
        const bTime = new Date(b.createdAt).getTime()
        if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0
        return aTime - bTime
      }),
    }))
  })
}

function AttemptContent({ attempt }: { attempt: PregunticaHistoryAttempt }) {
  return (
    <article className='rounded-xl border border-border/80 bg-background p-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-sm font-semibold'>Modo {getModeLabel(attempt.wordMode)}</p>
        <span className='rounded-full bg-muted px-2 py-0.5 text-xs'>
          {getStatusLabel(attempt.status)}
        </span>
      </div>

      <p className='mt-1 text-xs text-muted-foreground'>{formatDate(attempt.createdAt)}</p>

      {attempt.icaWords.length > 0 && (
        <div className='mt-3'>
          <p className='text-xs font-semibold text-muted-foreground'>Palabras ICA:</p>
          <div className='mt-1.5 flex flex-wrap gap-1.5'>
            {attempt.icaWords.map((word) => (
              <span
                key={`${attempt.id}-${word}`}
                className='rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900'
              >
                {word}
              </span>
            ))}
          </div>
        </div>
      )}

      {attempt.transcriptText && (
        <div className='mt-3 rounded-lg border border-border bg-muted/30 p-2'>
          <p className='text-xs font-semibold text-muted-foreground'>Transcripción</p>
          <p className='mt-1 text-sm'>{attempt.transcriptText}</p>
          <p className='mt-1 text-[11px] text-muted-foreground'>
            {attempt.responseCharCount || 0} caracteres
          </p>
        </div>
      )}

      {attempt.feedback && (
        <div className='mt-3 rounded-lg border border-emerald-300/40 bg-emerald-50 p-3'>
          <p className='text-sm font-semibold text-emerald-900'>
            Feedback del agente · {attempt.feedback.score.toFixed(1)} / 10
          </p>
          <p className='mt-1 text-sm text-emerald-900'>{attempt.feedback.naturalness}</p>
          <p className='mt-2 text-sm text-emerald-900'>{attempt.feedback.coachReply}</p>
        </div>
      )}

      {attempt.errorMessage && (
        <p className='mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800'>
          {attempt.errorMessage}
        </p>
      )}

      {attempt.audios.length > 0 && (
        <div className='mt-4 space-y-2'>
          <p className='text-xs font-semibold text-muted-foreground'>Audios ({attempt.audios.length})</p>
          {attempt.audios.map((audio) => (
            <div key={audio.id} className='rounded-lg border border-border p-2'>
              <div className='mb-1 flex items-center justify-between gap-2'>
                <span className='text-xs text-muted-foreground'>
                  {formatDate(audio.createdAt)} · {formatDuration(audio.durationMs)}
                </span>
                <span className='text-xs text-muted-foreground'>{getStatusLabel(audio.status)}</span>
              </div>
              {audio.signedUrl ? (
                <audio controls src={audio.signedUrl} className='w-full' />
              ) : (
                <p className='text-xs text-muted-foreground'>No se pudo cargar el audio</p>
              )}
            </div>
          ))}
        </div>
      )}

      {attempt.suggestionsHistory.length > 0 && (
        <div className='mt-4 space-y-2'>
          <p className='text-xs font-semibold text-muted-foreground'>
            Historial de sugerencias ({attempt.suggestionsHistory.length})
          </p>
          {attempt.suggestionsHistory.map((batch) => (
            <div key={batch.id} className='rounded-lg border border-border p-2'>
              <p className='text-xs text-muted-foreground'>
                Actualización {batch.refreshIndex} · {formatDate(batch.createdAt)}
              </p>
              <div className='mt-1 flex flex-wrap gap-1.5'>
                {batch.words.map((item) => (
                  <span
                    key={`${batch.id}-${item.word}`}
                    className='rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs text-violet-900'
                    title={item.reason}
                  >
                    {item.word}
                    {item.translation ? ` · ${item.translation}` : ''}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

export function PregunticaHistoryView() {
  const [weeks, setWeeks] = useState<PregunticaHistoryWeek[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      try {
        const rows = await fetchPregunticaHistory(30)
        if (!active) return
        setWeeks(rows)
        setError(null)
      } catch (err) {
        if (!active) return
        const message = err instanceof Error ? err.message : 'No se pudo cargar historial'
        setError(message)
        toast.error(message)
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  const cards = toQuestionCards(weeks)

  return (
    <section className='mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-24 pt-6 md:pb-8'>
      <h1 className='font-serif text-3xl font-bold'>🗂️ Historial PreguntICA</h1>
      <p className='mt-2 text-sm text-muted-foreground'>
        Aquí puedes reescuchar audios, revisar transcripciones, feedback del agente y
        sugerencias ICA de cada semana.
      </p>

      {loading && <p className='mt-6 text-sm text-muted-foreground'>Cargando historial...</p>}
      {error && <p className='mt-6 text-sm text-red-500'>{error}</p>}

      {!loading && !error && weeks.length === 0 && (
        <p className='mt-6 text-sm text-muted-foreground'>Aún no tienes PreguntICAs registradas.</p>
      )}

      <div className='mt-6 space-y-4'>
        {cards.map((card) => (
          <section key={card.id} className='rounded-2xl border border-border bg-card p-4'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div>
                <h2 className='font-serif text-xl font-bold'>{card.questionText}</h2>
                {card.questionTranslation && card.questionTranslation !== card.questionText && (
                  <p className='mt-1 text-sm text-muted-foreground'>
                    Traducción (español): {card.questionTranslation}
                  </p>
                )}
                <p className='mt-1 text-xs text-muted-foreground'>
                  Semana {card.weekStart} → {card.weekEnd} · {card.timezone} · Desbloqueo:{' '}
                  {getUnlockLabel(card.unlockedVia)} · {card.activationWordsCount}/
                  {card.requiredActivationWords} palabras
                </p>
              </div>
              <span className='rounded-full bg-muted px-2.5 py-1 text-xs'>
                {card.completedAt ? 'Completada' : card.isUnlocked ? 'Desbloqueada' : 'Bloqueada'}
              </span>
            </div>

            {card.attempts.length === 0 ? (
              <p className='mt-4 text-sm text-muted-foreground'>Sin intentos en esta semana.</p>
            ) : (
              <Accordion type='multiple' className='mt-4 space-y-2'>
                {card.attempts.map((attempt: PregunticaHistoryAttempt, index) => (
                  <AccordionItem
                    key={attempt.id}
                    value={attempt.id}
                    className='rounded-xl border border-border bg-background px-3'
                  >
                    <AccordionTrigger className='py-3 hover:no-underline'>
                      <div className='flex w-full flex-wrap items-center gap-2 pr-2'>
                        <span className='font-medium'>Intento {index + 1}</span>
                        <span className='rounded-full bg-muted px-2 py-0.5 text-[11px]'>
                          {getStatusLabel(attempt.status)}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className='pb-3'>
                      <AttemptContent attempt={attempt} />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </section>
        ))}
      </div>
    </section>
  )
}

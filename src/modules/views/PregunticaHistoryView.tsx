import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
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
  type PregunticaWordSuggestion,
  type PregunticaHistoryWeek,
} from '../services/preguntica'
import { AddIcaSuggestionModal } from '../components/AddIcaSuggestionModal'
import type { AppConfig, Lexicard } from '../types'

type PregunticaHistoryViewProps = {
  config: AppConfig
  cards: Lexicard[]
  setCards: Dispatch<SetStateAction<Lexicard[]>>
  onWordAdded: () => Promise<unknown>
}

type PregunticaHistoryQuestionCard = {
  id: string
  questionText: string
  questionTranslation: string | null
  createdAt: string
  weekStart: string
  weekEnd: string
  timezone: string
  isUnlocked: boolean
  unlockedVia: 'progress' | 'tokens' | 'manual' | null
  activationWordsCount: number
  requiredActivationWords: number
  completedAt: string | null
  attempt: PregunticaHistoryAttempt
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

function getAttemptKindLabel(kind: 'weekly' | 'token_unlock'): string {
  return kind === 'token_unlock' ? 'Canje de fichas' : 'Reto semanal'
}

function normalizeComparableText(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
}

function normalizeForWordMatch(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function textIncludesWord(text: string, word: string): boolean {
  const normalizedText = normalizeForWordMatch(text)
  const normalizedWord = normalizeForWordMatch(word)
  if (!normalizedText || !normalizedWord) return false

  if (normalizedWord.includes(' ')) {
    return normalizedText.includes(normalizedWord)
  }

  const tokens = new Set(normalizedText.split(' '))
  return tokens.has(normalizedWord)
}

function normalizeCorrectionValue(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isSameCorrection(original: string, suggestion: string): boolean {
  return normalizeCorrectionValue(original) === normalizeCorrectionValue(suggestion)
}

function toQuestionCards(weeks: PregunticaHistoryWeek[]): PregunticaHistoryQuestionCard[] {
  return weeks
    .flatMap((week) =>
      week.attempts.map((attempt) => ({
        id: attempt.id,
        questionText: attempt.questionText?.trim() || 'Sin pregunta registrada',
        questionTranslation: attempt.questionTranslation,
        createdAt: attempt.createdAt,
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        timezone: week.timezone,
        isUnlocked: week.isUnlocked,
        unlockedVia: week.unlockedVia,
        activationWordsCount: week.activationWordsCount,
        requiredActivationWords: week.requiredActivationWords,
        completedAt: week.completedAt,
        attempt,
      })),
    )
    .sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime()
      const bTime = new Date(b.createdAt).getTime()
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0
      return bTime - aTime
    })
}

function AttemptContent({
  attempt,
  onSuggestionClick,
  isSuggestionAdded,
}: {
  attempt: PregunticaHistoryAttempt
  onSuggestionClick: (suggestion: PregunticaWordSuggestion) => void
  isSuggestionAdded: (word: string) => boolean
}) {
  const transcriptForFeedback = attempt.transcriptText || attempt.responseText || ''
  const analysisAudios = [...attempt.audios].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime()
    const bTime = new Date(b.createdAt).getTime()
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0
    return aTime - bTime
  })
  const icaUsage = attempt.icaWords.map((word) => ({
    word,
    used: textIncludesWord(transcriptForFeedback, word),
  }))
  const usedIcaCount = icaUsage.filter((item) => item.used).length

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
                className='rounded-full border border-emerald-300/60 bg-emerald-100/70 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200'
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
        <div className='mt-3 rounded-lg border border-border bg-[linear-gradient(165deg,hsl(var(--background)),hsl(var(--muted)/0.35))] p-3'>
          <div className='flex flex-wrap items-center gap-3'>
            <p className='font-serif text-2xl font-bold text-amber-500'>
              {attempt.feedback.score.toFixed(1)}
              <span className='ml-1 text-sm font-medium text-muted-foreground'>/10</span>
            </p>
            <div className='h-2 min-w-28 flex-1 overflow-hidden rounded-full bg-muted/70'>
              <i
                className='block h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-300'
                style={{ width: `${Math.max(0, Math.min(100, attempt.feedback.score * 10))}%` }}
              />
            </div>
            <p className='text-xs font-semibold tracking-wide text-muted-foreground'>Naturalidad</p>
          </div>
          <p className='mt-1 text-sm text-muted-foreground'>{attempt.feedback.naturalness}</p>

          {icaUsage.length > 0 && (
            <div className='mt-3'>
              <p className='text-xs font-semibold text-muted-foreground'>
                Palabras objetivo usadas · {usedIcaCount}/{icaUsage.length}
              </p>
              <div className='mt-1.5 flex flex-wrap gap-1.5'>
                {icaUsage.map((item) => (
                  <span
                    key={`${attempt.id}-${item.word}-used`}
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                      item.used
                        ? 'border-emerald-300/60 bg-emerald-100/70 text-emerald-900 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200'
                        : 'border-border bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    {item.used ? '✓ ' : ''}
                    {item.word}
                  </span>
                ))}
              </div>
            </div>
          )}

          {attempt.feedback.corrections.length > 0 && (
            <ul className='mt-3 space-y-2 text-sm'>
              {attempt.feedback.corrections.map((item, index) => (
                <li key={`${attempt.id}-${index}-correction`} className='rounded-lg border border-border bg-background/70 p-2'>
                  {isSameCorrection(item.original, item.suggestion) ? (
                    <span className='font-semibold text-emerald-500'>✓ {item.suggestion}</span>
                  ) : (
                    <>
                      <span className='font-semibold text-red-500 line-through'>{item.original}</span>
                      {' '}→{' '}
                      <span className='font-semibold text-emerald-500'>{item.suggestion}</span>
                    </>
                  )}
                  <div className='text-xs text-muted-foreground'>{item.reason}</div>
                </li>
              ))}
            </ul>
          )}

          <div className='mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3'>
            <p className='text-sm text-foreground/90'>{attempt.feedback.coachReply}</p>
          </div>
        </div>
      )}

      {attempt.errorMessage && (
        <p className='mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800'>
          {attempt.errorMessage}
        </p>
      )}

      {analysisAudios.length > 0 && (
        <div className='mt-4 space-y-2'>
          <p className='text-xs font-semibold text-muted-foreground'>
            Intentos de análisis ({analysisAudios.length}/3)
          </p>
          {analysisAudios.map((audio, index) => (
            <div key={audio.id} className='rounded-lg border border-border p-2'>
              <div className='mb-1 flex items-center justify-between gap-2'>
                <span className='text-xs font-semibold'>Intento {index + 1}</span>
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
                  <button
                    type='button'
                    key={`${batch.id}-${item.word}`}
                    onClick={() => onSuggestionClick(item)}
                    disabled={isSuggestionAdded(item.word)}
                    className='rounded-md border border-amber-300/40 bg-amber-500/10 px-2 py-0.5 text-xs text-foreground transition hover:border-amber-300/80 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-70'
                    title={item.translation
                      ? `Traducción: ${item.translation}\nMotivo: ${item.reason}`
                      : `Motivo: ${item.reason}`}
                  >
                    {isSuggestionAdded(item.word) ? '✓ ' : '+ '}
                    {item.word}
                    {item.translation ? ` · ${item.translation}` : ''}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

export function PregunticaHistoryView({
  config,
  cards,
  setCards,
  onWordAdded,
}: PregunticaHistoryViewProps) {
  const [weeks, setWeeks] = useState<PregunticaHistoryWeek[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [suggestionModalOpen, setSuggestionModalOpen] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState<PregunticaWordSuggestion | null>(null)
  const [addedSuggestionWords, setAddedSuggestionWords] = useState<string[]>([])

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

  const questionCards = toQuestionCards(weeks)
  const existingCardWords = useMemo(
    () => new Set(cards.map((card) => normalizeComparableText(card.target))),
    [cards],
  )
  const addedSuggestionSet = useMemo(
    () => new Set(addedSuggestionWords.map(normalizeComparableText)),
    [addedSuggestionWords],
  )

  function isSuggestionAdded(word: string): boolean {
    const key = normalizeComparableText(word)
    return existingCardWords.has(key) || addedSuggestionSet.has(key)
  }

  function handleOpenSuggestionModal(suggestion: PregunticaWordSuggestion) {
    if (isSuggestionAdded(suggestion.word)) return
    setSelectedSuggestion(suggestion)
    setSuggestionModalOpen(true)
  }

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
      {!loading && !error && weeks.length > 0 && questionCards.length === 0 && (
        <p className='mt-6 text-sm text-muted-foreground'>Aún no tienes PreguntICAs registradas.</p>
      )}

      <div className='mt-6 space-y-4'>
        {questionCards.map((card) => (
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
                <p className='mt-1 text-xs text-muted-foreground'>Creada: {formatDate(card.createdAt)}</p>
              </div>
              <div className='flex flex-col items-end gap-1'>
                <span className='rounded-full bg-muted px-2.5 py-1 text-xs'>
                  {card.completedAt ? 'Completada' : card.isUnlocked ? 'Desbloqueada' : 'Bloqueada'}
                </span>
                <span className='rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground'>
                  {getAttemptKindLabel(card.attempt.attemptKind)}
                </span>
              </div>
            </div>

            <Accordion type='single' collapsible className='mt-4'>
              <AccordionItem
                value={card.attempt.id}
                className='rounded-xl border border-border bg-background px-3'
              >
                <AccordionTrigger className='py-3 hover:no-underline'>
                  <div className='flex w-full flex-wrap items-center gap-2 pr-2'>
                    <span className='font-medium'>Ver detalle</span>
                    <span className='rounded-full bg-muted px-2 py-0.5 text-[11px]'>
                      {getStatusLabel(card.attempt.status)}
                    </span>
                    <span className='text-[11px] text-muted-foreground'>
                      Análisis: {card.attempt.retryCount}/3
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className='pb-3'>
                  <AttemptContent
                    attempt={card.attempt}
                    onSuggestionClick={handleOpenSuggestionModal}
                    isSuggestionAdded={isSuggestionAdded}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </section>
        ))}
      </div>

      <AddIcaSuggestionModal
        open={suggestionModalOpen}
        onOpenChange={setSuggestionModalOpen}
        suggestion={selectedSuggestion}
        config={config}
        cards={cards}
        setCards={setCards}
        onWordAdded={onWordAdded}
        onAdded={(word) => {
          setAddedSuggestionWords((current) => {
            const normalized = normalizeComparableText(word)
            if (current.map(normalizeComparableText).includes(normalized)) return current
            return [...current, word]
          })
        }}
      />
    </section>
  )
}

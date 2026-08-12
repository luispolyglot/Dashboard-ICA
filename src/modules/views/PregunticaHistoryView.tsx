import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
import { PlusIcon } from 'lucide-react'
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
import { ExtractWordsToVaultModal } from '../components/ExtractWordsToVaultModal'
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

function formatDateShort(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = String(date.getFullYear())
  return `${day}-${month}-${year}`
}

function formatDuration(durationMs: number | null): string {
  if (!durationMs || durationMs <= 0) return '-'
  const seconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}:${String(remaining).padStart(2, '0')}`
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

function getModeTone(mode: string): string {
  const normalized = mode.trim().toLowerCase()
  if (normalized === 'mixed') return 'border-violet-300/60 bg-violet-500/10 text-violet-700 dark:text-violet-300'
  if (normalized === 'vital') return 'border-blue-300/60 bg-blue-500/10 text-blue-700 dark:text-blue-300'
  if (normalized === 'frequent') return 'border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (normalized === 'occasional') return 'border-amber-300/60 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  if (normalized === 'rare') return 'border-orange-300/60 bg-orange-500/10 text-orange-700 dark:text-orange-300'
  return 'border-border bg-muted/40 text-muted-foreground'
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
  questionText,
  questionTranslation,
  onSuggestionClick,
  isSuggestionAdded,
  onExtractWordClick,
  isExtractWordAdded,
}: {
  attempt: PregunticaHistoryAttempt
  questionText: string
  questionTranslation: string | null
  onSuggestionClick: (suggestion: PregunticaWordSuggestion) => void
  isSuggestionAdded: (word: string) => boolean
  onExtractWordClick: (text: string) => void
  isExtractWordAdded: (word: string) => boolean
}) {
  const analysisAudios = [...attempt.audios].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime()
    const bTime = new Date(b.createdAt).getTime()
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0
    return aTime - bTime
  })

  return (
    <article className='space-y-3 pb-1'>
      {questionTranslation && questionTranslation !== questionText && (
        <div className='rounded-xl border border-sky-200/70 bg-sky-50/80 p-3 dark:border-sky-500/30 dark:bg-sky-950/25'>
          <p className='text-[11px] font-semibold uppercase tracking-wide text-sky-700/90 dark:text-sky-300/90'>
            Traducción (español)
          </p>
          <p className='mt-1 font-serif text-[15px] leading-relaxed text-slate-700 dark:text-slate-100'>
            {questionTranslation}
          </p>
        </div>
      )}

      <div>
        <p className='inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground'>
          <span>Palabras ICA</span>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${getModeTone(attempt.wordMode)}`}>
            {getModeLabel(attempt.wordMode)}
          </span>
          <span>:</span>
        </p>
        {attempt.icaWords.length > 0 ? (
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
        ) : (
          <p className='mt-1.5 text-xs text-muted-foreground'>Sin palabras ICA registradas.</p>
        )}
      </div>

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
          <Accordion type='multiple' className='space-y-2'>
            {analysisAudios.map((audio, index) => {
              const transcript = audio.transcriptionText || ''
              const usage = attempt.icaWords.map((word) => ({
                word,
                used: textIncludesWord(transcript, word),
              }))
              const usedCount = usage.filter((item) => item.used).length

              return (
                <AccordionItem
                  key={audio.id}
                  value={audio.id}
                  className='rounded-lg border border-border bg-background px-3'
                >
                  <AccordionTrigger className='py-3 hover:no-underline'>
                    <div className='flex w-full flex-wrap items-center gap-2 pr-2'>
                      <span className='font-medium'>Análisis {index + 1}</span>
                      <span className='text-[11px] text-muted-foreground'>
                        {formatDate(audio.createdAt)} · {formatDuration(audio.durationMs)}
                      </span>
                      {audio.feedback && (
                        <span className='rounded-full border border-amber-300/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-300'>
                          {audio.feedback.score.toFixed(1)}/10
                        </span>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className='pb-3'>
                    <div className='space-y-3'>
                      {audio.signedUrl ? (
                        <audio controls src={audio.signedUrl} className='w-full' />
                      ) : (
                        <p className='text-xs text-muted-foreground'>No se pudo cargar el audio</p>
                      )}

                      {audio.transcriptionText && (
                        <div className='rounded-lg border border-border bg-muted/30 p-2'>
                          <p className='text-xs font-semibold text-muted-foreground'>Transcripción</p>
                          <p className='mt-1 text-sm'>{audio.transcriptionText}</p>
                          <p className='mt-1 text-[11px] text-muted-foreground'>
                            {audio.transcriptionText.length} caracteres
                          </p>
                        </div>
                      )}

                      {audio.feedback && (
                        <div className='rounded-lg border border-border bg-[linear-gradient(165deg,hsl(var(--background)),hsl(var(--muted)/0.35))] p-3'>
                          <div className='flex flex-wrap items-center gap-3'>
                            <p className='font-serif text-2xl font-bold text-amber-500'>
                              {audio.feedback.score.toFixed(1)}
                              <span className='ml-1 text-sm font-medium text-muted-foreground'>/10</span>
                            </p>
                            <div className='h-2 min-w-28 flex-1 overflow-hidden rounded-full bg-muted/70'>
                              <i
                                className='block h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-300'
                                style={{ width: `${Math.max(0, Math.min(100, audio.feedback.score * 10))}%` }}
                              />
                            </div>
                            <p className='text-xs font-semibold tracking-wide text-muted-foreground'>
                              Naturalidad
                            </p>
                          </div>
                          <p className='mt-1 text-sm text-muted-foreground'>{audio.feedback.naturalness}</p>

                          {usage.length > 0 && (
                            <div className='mt-3'>
                              <p className='text-xs font-semibold text-muted-foreground'>
                                Palabras objetivo usadas · {usedCount}/{usage.length}
                              </p>
                              <div className='mt-1.5 flex flex-wrap gap-1.5'>
                                {usage.map((item) => (
                                  <span
                                    key={`${audio.id}-${item.word}-used`}
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

                          {audio.feedback.corrections.length > 0 && (
                            <ul className='mt-3 space-y-2 text-sm'>
                              {audio.feedback.corrections.map((item, corrIndex) => (
                                <li key={`${audio.id}-${corrIndex}-correction`} className='rounded-lg border border-border bg-background/70 p-2'>
                                  {isSameCorrection(item.original, item.suggestion) ? (
                                    <div className='flex items-start justify-between gap-2'>
                                      <span className='font-semibold text-emerald-500'>✓ {item.suggestion}</span>
                                      <button
                                        type='button'
                                        onClick={() => onExtractWordClick(item.suggestion)}
                                        disabled={isExtractWordAdded(item.suggestion)}
                                        aria-label={`Extraer "${item.suggestion}" al baul`}
                                        className='inline-flex size-5 items-center justify-center rounded-full border border-emerald-300/70 bg-emerald-100/70 text-emerald-700 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200'
                                        title={
                                          isExtractWordAdded(item.suggestion)
                                            ? 'Ya existe en tu baul ICA'
                                            : 'Extraer al baul ICA'
                                        }
                                      >
                                        <PlusIcon className='size-3' />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className='flex items-start justify-between gap-2'>
                                      <div>
                                        <span className='font-semibold text-red-500 line-through'>{item.original}</span>
                                        {' '}→{' '}
                                        <span className='font-semibold text-emerald-500'>{item.suggestion}</span>
                                      </div>
                                      <button
                                        type='button'
                                        onClick={() => onExtractWordClick(item.suggestion)}
                                        disabled={isExtractWordAdded(item.suggestion)}
                                        aria-label={`Extraer "${item.suggestion}" al baul`}
                                        className='inline-flex size-5 items-center justify-center rounded-full border border-emerald-300/70 bg-emerald-100/70 text-emerald-700 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200'
                                        title={
                                          isExtractWordAdded(item.suggestion)
                                            ? 'Ya existe en tu baul ICA'
                                            : 'Extraer al baul ICA'
                                        }
                                      >
                                        <PlusIcon className='size-3' />
                                      </button>
                                    </div>
                                  )}
                                  <div className='text-xs text-muted-foreground'>{item.reason}</div>
                                </li>
                              ))}
                            </ul>
                          )}

                          <div className='mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3'>
                            <p className='text-sm text-foreground/90'>{audio.feedback.coachReply}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
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
  const [extractWordsModalOpen, setExtractWordsModalOpen] = useState(false)
  const [extractWordsText, setExtractWordsText] = useState('')

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      try {
        const rows = await fetchPregunticaHistory(
          {
            targetLang: config.targetLang,
            nativeLang: config.nativeLang,
          },
          30,
        )
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
  }, [config.nativeLang, config.targetLang])

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

  function isExtractWordAdded(word: string): boolean {
    return existingCardWords.has(normalizeComparableText(word))
  }

  function handleOpenExtractWordsModal(text: string) {
    if (!text.trim() || isExtractWordAdded(text)) return
    setExtractWordsText(text)
    setExtractWordsModalOpen(true)
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

      <Accordion type='multiple' className='mt-6 space-y-4'>
        {questionCards.map((card) => (
          <AccordionItem key={card.id} value={card.id} className='rounded-2xl border border-border bg-card px-4'>
            <AccordionTrigger className='py-4 hover:no-underline'>
              <div className='flex w-full flex-wrap items-start justify-between gap-3 pr-2 text-left'>
                <div>
                  <h2 className='font-serif text-xl font-bold'>
                    {formatDateShort(card.createdAt)} - {card.questionText}
                  </h2>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    Semana {card.weekStart} → {card.weekEnd}
                  </p>
                </div>
                <div className='flex flex-col items-end gap-1'>
                  <span className='rounded-full bg-muted px-2.5 py-1 text-xs'>
                    {card.completedAt ? 'Completada' : card.isUnlocked ? 'Desbloqueada' : 'Bloqueada'}
                  </span>
                  {card.attempt.attemptKind === 'token_unlock' ? (
                    <span className='rounded-full border border-emerald-300/50 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300'>
                      Canje de fichas
                    </span>
                  ) : (
                    <span className='rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary'>
                      Reto semanal
                    </span>
                  )}
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className='pb-4 pt-2'>
              <AttemptContent
                attempt={card.attempt}
                questionText={card.questionText}
                questionTranslation={card.questionTranslation}
                onSuggestionClick={handleOpenSuggestionModal}
                isSuggestionAdded={isSuggestionAdded}
                onExtractWordClick={handleOpenExtractWordsModal}
                isExtractWordAdded={isExtractWordAdded}
              />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

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

      <ExtractWordsToVaultModal
        open={extractWordsModalOpen}
        onOpenChange={(open) => {
          setExtractWordsModalOpen(open)
          if (!open) setExtractWordsText('')
        }}
        text={extractWordsText}
        seedWords={extractWordsText ? [extractWordsText] : []}
        targetLang={config.targetLang}
        nativeLang={config.nativeLang}
        cards={cards}
        setCards={setCards}
        onWordAdded={onWordAdded}
      />
    </section>
  )
}

import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Accordion as AccordionPrimitive } from 'radix-ui'
import { ChevronDownIcon, HistoryIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t, uiLocale } from '@/i18n'
import {
  fetchPregunticaHistory,
  type PregunticaHistoryAttempt,
  type PregunticaWordSuggestion,
  type PregunticaHistoryWeek,
} from '../services/preguntica'
import { AddIcaSuggestionModal } from '../components/AddIcaSuggestionModal'
import { ExtractWordsToVaultModal } from '../components/ExtractWordsToVaultModal'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { FichaIcon, MicGlyph, TrophyIcon } from '../game/icons'
import { EmptyState, GamePage, IconTile, PageTitle, Pill, SectionLabel, type Tone } from '../game/ui'
import type { AppConfig, Lexicard } from '../types'
import {
  CoachBubble,
  CorrectionList,
  ModePill,
  ScoreHero,
  SuggestionChips,
  TranscriptBlock,
  WordUsage,
} from './pregunticaParts'

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

/** Las PreguntICAs de una misma semana, juntas. */
type PregunticaHistoryWeekGroup = {
  key: string
  weekStart: string
  weekEnd: string
  completedAt: string | null
  isUnlocked: boolean
  cards: PregunticaHistoryQuestionCard[]
}

function formatDate(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(uiLocale(), {
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

function parseDateOnly(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

/** "22 – 28 sept" (la semana acaba el día antes de `weekEnd`, que es el lunes siguiente). */
function formatWeekRange(weekStart: string, weekEnd: string): string {
  const start = parseDateOnly(weekStart)
  const endExclusive = parseDateOnly(weekEnd)
  if (!start || !endExclusive) return `${weekStart} → ${weekEnd}`
  const end = new Date(endExclusive)
  end.setDate(end.getDate() - 1)
  const month = (date: Date) => date.toLocaleDateString(uiLocale(), { month: 'short' }).replace('.', '')
  if (start.getMonth() === end.getMonth()) return `${start.getDate()} – ${end.getDate()} ${month(end)}`
  return `${start.getDate()} ${month(start)} – ${end.getDate()} ${month(end)}`
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
        questionText: attempt.questionText?.trim() || t('Sin pregunta registrada'),
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

/** Agrupa las tarjetas por semana, sin cambiar su orden (de la más reciente a la más antigua). */
function groupByWeek(cards: PregunticaHistoryQuestionCard[]): PregunticaHistoryWeekGroup[] {
  const groups: PregunticaHistoryWeekGroup[] = []
  const byKey = new Map<string, PregunticaHistoryWeekGroup>()
  cards.forEach((card) => {
    const key = `${card.weekStart}|${card.weekEnd}`
    let group = byKey.get(key)
    if (!group) {
      group = {
        key,
        weekStart: card.weekStart,
        weekEnd: card.weekEnd,
        completedAt: card.completedAt,
        isUnlocked: card.isUnlocked,
        cards: [],
      }
      byKey.set(key, group)
      groups.push(group)
    }
    group.cards.push(card)
  })
  return groups
}

/** La mejor nota de un intento (de sus análisis o, si no hay, la del intento). */
function bestScore(attempt: PregunticaHistoryAttempt): number | null {
  const scores = attempt.audios
    .map((audio) => audio.feedback?.score ?? audio.analysisScore)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (attempt.feedback) scores.push(attempt.feedback.score)
  return scores.length > 0 ? Math.max(...scores) : null
}

function weekStatus(group: { completedAt: string | null; isUnlocked: boolean }): { label: string; tone: Tone } {
  if (group.completedAt) return { label: t('Completada'), tone: 'ok' }
  if (group.isUnlocked) return { label: t('Desbloqueada'), tone: 'c' }
  return { label: t('Bloqueada'), tone: 'neutral' }
}

/** Día y mes en un cuadradito (como una hoja de calendario). */
function DateTile({ value }: { value: string }) {
  const date = new Date(value)
  const valid = !Number.isNaN(date.getTime())
  return (
    <span
      className='flex size-12 shrink-0 flex-col items-center justify-center rounded-2xl leading-none sm:size-14'
      style={{ background: 'var(--ica-c-soft)', color: 'var(--ica-c-ink)' }}
    >
      <span className='sr-only'>{formatDateShort(value)}</span>
      <span className='text-xl font-black tabular-nums' aria-hidden='true'>
        {valid ? date.getDate() : '–'}
      </span>
      <span className='mt-0.5 text-[10px] font-extrabold tracking-[0.08em] uppercase' aria-hidden='true'>
        {valid ? date.toLocaleDateString(uiLocale(), { month: 'short' }).replace('.', '') : ''}
      </span>
    </span>
  )
}

/** Nota en grande a la derecha de la fila (con la flecha del desplegable debajo). */
function RowScore({ score }: { score: number | null }) {
  return (
    <span className='flex shrink-0 flex-col items-end gap-1.5 leading-none'>
      {score === null ? (
        <span className='text-xs font-extrabold text-muted-foreground'>{t('Sin nota')}</span>
      ) : (
        <span className='flex items-center gap-1' aria-label={t('Nota {score} de 10', { score: score.toFixed(1) })}>
          <TrophyIcon size={18} />
          <span className='text-2xl font-black tabular-nums' style={{ color: 'var(--ica-gold-ink)' }}>
            {score.toFixed(1)}
          </span>
        </span>
      )}
      <ChevronDownIcon
        className='size-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180'
        strokeWidth={2.6}
        aria-hidden='true'
      />
    </span>
  )
}

/** Dato grande del resumen (arriba). */
function HistoryStat({ icon, value, label }: { icon: ReactNode; value: ReactNode; label: string }) {
  return (
    <div className='ica-panel flex min-w-0 flex-col items-center gap-1 px-2 py-3 text-center'>
      {icon}
      <span className='text-2xl leading-none font-black tabular-nums'>{value}</span>
      <span className='text-xs leading-tight font-bold text-muted-foreground'>{label}</span>
    </div>
  )
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
    <article className='flex flex-col gap-5'>
      {questionTranslation && questionTranslation !== questionText && (
        <div className='rounded-2xl border-2 border-border bg-muted/40 px-4 py-3'>
          <p className='ica-label m-0'>{t('Traducción (español)')}</p>
          <p className='m-0 mt-1 text-base leading-snug font-bold'>{questionTranslation}</p>
        </div>
      )}

      <div>
        <SectionLabel right={<ModePill mode={attempt.wordMode} />}>{t('Palabras ICA')}</SectionLabel>
        {attempt.icaWords.length > 0 ? (
          <div className='flex flex-wrap gap-2'>
            {attempt.icaWords.map((word) => (
              <span
                key={`${attempt.id}-${word}`}
                className='rounded-full border-2 px-3 py-1 text-sm font-extrabold'
                style={{
                  background: 'var(--ica-i-soft)',
                  color: 'var(--ica-i-ink)',
                  borderColor: 'color-mix(in oklab, var(--ica-i) 35%, transparent)',
                }}
              >
                {word}
              </span>
            ))}
          </div>
        ) : (
          <p className='m-0 text-sm font-semibold text-muted-foreground'>{t('Sin palabras ICA registradas.')}</p>
        )}
      </div>

      {attempt.errorMessage && (
        <p
          className='m-0 rounded-2xl px-4 py-3 text-sm font-bold'
          style={{ background: 'var(--ica-bad-soft)', color: 'var(--ica-bad-ink)' }}
        >
          {attempt.errorMessage}
        </p>
      )}

      {analysisAudios.length > 0 && (
        <div>
          <SectionLabel>{t('Intentos de análisis ({n}/3)', { n: analysisAudios.length })}</SectionLabel>
          <AccordionPrimitive.Root type='multiple' className='flex flex-col gap-2'>
            {analysisAudios.map((audio, index) => {
              const transcript = audio.transcriptionText || ''
              const usage = attempt.icaWords.map((word) => ({
                word,
                used: textIncludesWord(transcript, word),
              }))

              return (
                <AccordionPrimitive.Item
                  key={audio.id}
                  value={audio.id}
                  className='overflow-hidden rounded-2xl border-2 border-border'
                >
                  <AccordionPrimitive.Header className='m-0'>
                    <AccordionPrimitive.Trigger className='group flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/50'>
                      <span className='flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-black tabular-nums'>
                        {index + 1}
                      </span>
                      <span className='min-w-0 flex-1'>
                        <span className='block font-extrabold'>{t('Análisis {n}', { n: index + 1 })}</span>
                        <span className='block text-xs font-semibold text-muted-foreground'>
                          {formatDate(audio.createdAt)} · {formatDuration(audio.durationMs)}
                        </span>
                      </span>
                      {audio.feedback && (
                        <Pill tone='gold' className='text-xs'>
                          {audio.feedback.score.toFixed(1)}/10
                        </Pill>
                      )}
                      <ChevronDownIcon
                        className='size-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180'
                        strokeWidth={2.6}
                        aria-hidden='true'
                      />
                    </AccordionPrimitive.Trigger>
                  </AccordionPrimitive.Header>
                  <AccordionPrimitive.Content className='overflow-hidden data-open:animate-accordion-down data-closed:animate-accordion-up'>
                    <div className='flex flex-col gap-4 border-t-2 border-border px-3.5 pt-3.5 pb-4'>
                      {audio.signedUrl ? (
                        <audio controls src={audio.signedUrl} className='w-full' />
                      ) : (
                        <p className='m-0 text-xs font-semibold text-muted-foreground'>{t('No se pudo cargar el audio')}</p>
                      )}

                      {audio.transcriptionText && (
                        <TranscriptBlock
                          text={audio.transcriptionText}
                          meta={t('{n} caracteres', { n: audio.transcriptionText.length })}
                        />
                      )}

                      {audio.feedback && (
                        <>
                          <ScoreHero score={audio.feedback.score} text={audio.feedback.naturalness} compact />
                          <WordUsage usage={usage} />
                          <CorrectionList
                            corrections={audio.feedback.corrections}
                            isSame={isSameCorrection}
                            onExtract={onExtractWordClick}
                            isExtractAdded={isExtractWordAdded}
                          />
                          <CoachBubble text={audio.feedback.coachReply} />
                        </>
                      )}
                    </div>
                  </AccordionPrimitive.Content>
                </AccordionPrimitive.Item>
              )
            })}
          </AccordionPrimitive.Root>
        </div>
      )}

      {attempt.suggestionsHistory.length > 0 && (
        <div>
          <SectionLabel>{t('Historial de sugerencias ({n})', { n: attempt.suggestionsHistory.length })}</SectionLabel>
          <div className='flex flex-col gap-3'>
            {attempt.suggestionsHistory.map((batch) => (
              <div key={batch.id}>
                <p className='m-0 mb-1.5 text-xs font-bold text-muted-foreground'>
                  {t('Actualización {n}', { n: batch.refreshIndex })} · {formatDate(batch.createdAt)}
                </p>
                <SuggestionChips suggestions={batch.words} isAdded={isSuggestionAdded} onPick={onSuggestionClick} />
              </div>
            ))}
          </div>
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
        const message = err instanceof Error ? err.message : t('No se pudo cargar historial')
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
  const weekGroups = groupByWeek(questionCards)
  const existingCardWords = useMemo(
    () => new Set(cards.map((card) => normalizeComparableText(card.target))),
    [cards],
  )
  const addedSuggestionSet = useMemo(
    () => new Set(addedSuggestionWords.map(normalizeComparableText)),
    [addedSuggestionWords],
  )

  // Resumen de arriba: cuántas, la mejor nota y cuántas con ICA Coins.
  const allScores = questionCards
    .map((card) => bestScore(card.attempt))
    .filter((value): value is number => value !== null)
  const topScore = allScores.length > 0 ? Math.max(...allScores) : null
  const coinAttempts = questionCards.filter((card) => card.attempt.attemptKind === 'token_unlock').length

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

  const isEmpty = !loading && !error && questionCards.length === 0

  return (
    <GamePage>
      <PageTitle
        icon={
          <IconTile tone='c' size={52}>
            <HistoryIcon className='size-7' strokeWidth={2.6} aria-hidden='true' />
          </IconTile>
        }
        subtitle={t('Reescucha tus audios y repasa transcripciones, feedback y sugerencias ICA de cada semana.')}
      >
        {t('Historial PreguntICA')}
      </PageTitle>

      {loading && (
        <div className='flex flex-col gap-3' aria-live='polite'>
          <p className='m-0 text-sm font-bold text-muted-foreground'>{t('Cargando historial...')}</p>
          <div className='h-24 animate-pulse rounded-3xl bg-muted/70' aria-hidden='true' />
          <div className='h-24 animate-pulse rounded-3xl bg-muted/50' aria-hidden='true' />
        </div>
      )}

      {error && (
        <p
          className='m-0 rounded-3xl px-5 py-4 text-sm font-bold'
          style={{ background: 'var(--ica-bad-soft)', color: 'var(--ica-bad-ink)' }}
        >
          {error}
        </p>
      )}

      {isEmpty && (
        <div className='ica-panel'>
          <EmptyState
            icon={
              <IconTile tone='c' size={80}>
                <MicGlyph size={50} />
              </IconTile>
            }
            title={t('Aún no tienes PreguntICAs registradas.')}
            text={t('Cuando respondas tu primera PreguntICA, aquí podrás volver a escucharla y repasar tu feedback.')}
            action={
              <Button asChild size='lg' variant='c'>
                <Link to={DASHBOARD_ROUTES.preguntica}>{t('Ir a PreguntICA')}</Link>
              </Button>
            }
          />
        </div>
      )}

      {!loading && !error && questionCards.length > 0 && (
        <div className='grid grid-cols-3 gap-2'>
          <HistoryStat icon={<MicGlyph size={28} />} value={questionCards.length} label={t('respondidas')} />
          <HistoryStat
            icon={<TrophyIcon size={28} />}
            value={<span style={{ color: 'var(--ica-gold-ink)' }}>{topScore === null ? '–' : topScore.toFixed(1)}</span>}
            label={t('mejor nota')}
          />
          <HistoryStat icon={<FichaIcon size={28} />} value={coinAttempts} label={t('con ICA Coins')} />
        </div>
      )}

      {weekGroups.length > 0 && (
        <AccordionPrimitive.Root type='multiple' className='flex flex-col gap-6'>
          {weekGroups.map((group) => {
            const statusInfo = weekStatus(group)
            return (
              <section key={group.key} aria-label={t('Semana {range}', { range: formatWeekRange(group.weekStart, group.weekEnd) })}>
                <SectionLabel right={<Pill tone={statusInfo.tone}>{statusInfo.label}</Pill>}>
                  {t('Semana {range}', { range: formatWeekRange(group.weekStart, group.weekEnd) })}
                </SectionLabel>
                <div className='flex flex-col gap-3'>
                  {group.cards.map((card) => {
                    const score = bestScore(card.attempt)
                    const isCoins = card.attempt.attemptKind === 'token_unlock'
                    return (
                      <AccordionPrimitive.Item key={card.id} value={card.id} className='ica-panel overflow-hidden'>
                        <AccordionPrimitive.Header className='m-0'>
                          <AccordionPrimitive.Trigger className='group flex w-full items-center gap-3 px-3.5 py-3.5 text-left sm:px-4'>
                            <DateTile value={card.createdAt} />
                            <span className='min-w-0 flex-1'>
                              <span className='block leading-snug font-extrabold'>{card.questionText}</span>
                              <span className='mt-1.5 flex flex-wrap gap-1.5'>
                                {isCoins ? (
                                  <Pill tone='gold'>
                                    <FichaIcon size={14} />
                                    {t('Canje de ICA Coins')}
                                  </Pill>
                                ) : (
                                  <Pill tone='c'>{t('Reto semanal')}</Pill>
                                )}
                                <ModePill mode={card.attempt.wordMode} />
                              </span>
                            </span>
                            <RowScore score={score} />
                          </AccordionPrimitive.Trigger>
                        </AccordionPrimitive.Header>
                        <AccordionPrimitive.Content className='overflow-hidden data-open:animate-accordion-down data-closed:animate-accordion-up'>
                          <div className='border-t-2 border-border px-4 pt-4 pb-5'>
                            <AttemptContent
                              attempt={card.attempt}
                              questionText={card.questionText}
                              questionTranslation={card.questionTranslation}
                              onSuggestionClick={handleOpenSuggestionModal}
                              isSuggestionAdded={isSuggestionAdded}
                              onExtractWordClick={handleOpenExtractWordsModal}
                              isExtractWordAdded={isExtractWordAdded}
                            />
                          </div>
                        </AccordionPrimitive.Content>
                      </AccordionPrimitive.Item>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </AccordionPrimitive.Root>
      )}

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
    </GamePage>
  )
}

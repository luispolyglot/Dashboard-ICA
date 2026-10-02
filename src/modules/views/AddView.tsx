import { useEffect, useRef, useState } from 'react'
import {
  ArchiveIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LoaderCircleIcon,
  LockIcon,
  SparklesIcon,
  SpellCheckIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  CREATION_WORDS_GOAL,
  getImportance,
  getTodayProgress,
} from '../constants'
import {
  fetchSpellingSuggestion,
  fetchTranslation,
} from '../services/anthropic'
import { recordWordAddedEvent } from '../services/gamification'
import { kickLexicardExampleWorker } from '../services/lexicardExampleJobs'
import { insertWord } from '../services/storage'
import { generateId, todayKey } from '../utils'
import { DailyLimitNotice } from '../game/DailyLimitNotice'
import { useDailyLimits } from '../game/limits'
import {
  GamePage,
  GameProgress,
  IconTile,
  ListRow,
  PageTitle,
  PhaseLetter,
  Pill,
  RowGroup,
  SectionLabel,
} from '../game/ui'
import { RomanizationHint } from '../components/RomanizationHint'
import { PronunciationHint } from '../pronunciation/PronunciationHint'
import { SpeakButton } from '../components/SpeakButton'
import { TranslationSuggestion } from '../components/TranslationSuggestion'
import { DASHBOARD_ROUTES } from '../routes/paths'
import {
  sanitizeShareTargetInput,
  SHARE_TARGET_INPUT_QUERY_PARAM,
  SHARE_TARGET_MAX_CHARS,
  SHARE_TARGET_SOURCE,
  SHARE_TARGET_SOURCE_QUERY_PARAM,
} from '../shareTarget'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { langName, t, tn } from '@/i18n'
import { ImportancePicker, ImportanceTile } from './IcaWordParts'
import type {
  AppConfig,
  DailyProgressEntry,
  DailyProgressMap,
  ImportanceKey,
  Lexicard,
} from '../types'

type AddViewProps = {
  cards: Lexicard[]
  setCards: Dispatch<SetStateAction<Lexicard[]>>
  config: AppConfig
  dailyProgress: DailyProgressMap
  onWordAdded: () => Promise<DailyProgressEntry>
}

// Cuántas palabras recientes se ven antes de «Ver más».
const RECENT_PREVIEW = 5

// Estilo de los campos grandes de la fase I (borde azul al escribir).
const FIELD_CLASS =
  'h-14 rounded-2xl px-4 text-lg font-bold md:text-lg placeholder:font-semibold placeholder:text-muted-foreground/75 focus-visible:border-[var(--ica-i)] focus-visible:ring-[color-mix(in_oklab,var(--ica-i)_22%,transparent)]'

/** Día (AAAA-MM-DD) de una fecha en milisegundos, en hora local. */
function dayKeyOf(ms: number | null | undefined): string {
  if (!ms) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function normalizeComparableText(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
}

export function AddView({
  cards,
  setCards,
  config,
  dailyProgress,
  onWordAdded,
}: AddViewProps) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialSharedTargetRef = useRef(
    sanitizeShareTargetInput(
      searchParams.get(SHARE_TARGET_INPUT_QUERY_PARAM) || '',
    ),
  )
  const initialShareSourceRef = useRef(
    searchParams.get(SHARE_TARGET_SOURCE_QUERY_PARAM) === SHARE_TARGET_SOURCE,
  )
  const [target, setTarget] = useState('')
  const [native, setNative] = useState('')
  const [importance, setImportance] = useState<ImportanceKey | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [suggestionNative, setSuggestionNative] = useState<string | null>(null)
  const [suggestionTarget, setSuggestionTarget] = useState<string | null>(null)
  const [loadingNative, setLoadingNative] = useState(false)
  const [loadingTarget, setLoadingTarget] = useState(false)
  const [spellingSuggestion, setSpellingSuggestion] = useState<string | null>(
    null,
  )
  const [checkingSpelling, setCheckingSpelling] = useState(false)
  const [sharedPrefillStatus, setSharedPrefillStatus] = useState<
    'none' | 'prefilled' | 'missing'
  >('none')
  const [activeRecentSpeakerId, setActiveRecentSpeakerId] = useState<
    string | null
  >(null)
  const [showAllRecent, setShowAllRecent] = useState(false)
  const targetDebounceRef = useRef<number | null>(null)
  const nativeDebounceRef = useRef<number | null>(null)
  const spellingDebounceRef = useRef<number | null>(null)
  const targetRequestRef = useRef(0)
  const nativeRequestRef = useRef(0)
  const spellingRequestRef = useRef(0)

  const recent = cards.slice(-25).reverse()
  const todayProgress = getTodayProgress(dailyProgress)

  // Límite diario de palabras (10, o 20 con el día ampliado).
  // Además del dato del servidor, contamos lo guardado en esta pantalla por si el
  // servidor tarda un momento en actualizarse.
  const dailyLimits = useDailyLimits()
  const mountRef = useRef({ day: todayKey(), words: todayProgress.wordsAdded })
  const [savesThisVisit, setSavesThisVisit] = useState(0)
  const wordsUsedToday = Math.max(
    dailyLimits.used.words,
    mountRef.current.day === todayKey()
      ? mountRef.current.words + savesThisVisit
      : 0,
  )
  const wordLimit = dailyLimits.limits.words
  const wordLimitReached = wordsUsedToday >= wordLimit
  const wordLimitsState = {
    ...dailyLimits,
    used: { ...dailyLimits.used, words: wordsUsedToday },
  }
  const canCreatePhrase = todayProgress.wordsAdded >= CREATION_WORDS_GOAL
  const wordsLeftForPhrase = Math.max(
    0,
    CREATION_WORDS_GOAL - todayProgress.wordsAdded,
  )
  const trimmedTarget = target.trim()
  const targetCharsCount = Array.from(target).length
  const duplicateWord = cards.find(
    (card) =>
      normalizeComparableText(card.target) ===
        normalizeComparableText(trimmedTarget) &&
      (card.targetLang || '') === config.targetLang &&
      (card.nativeLang || '') === config.nativeLang,
  )
  const isDuplicate = Boolean(trimmedTarget && duplicateWord)
  const showDuplicateWarning = isDuplicate && !saving && !saved

  const clampTarget = (value: string): string =>
    Array.from(value).slice(0, SHARE_TARGET_MAX_CHARS).join('')

  const handleTargetChange = (value: string): void => {
    const nextValue = clampTarget(value)
    setTarget(nextValue)
    setSuggestionNative(null)
    setSpellingSuggestion(null)
    targetRequestRef.current += 1
    spellingRequestRef.current += 1

    if (targetDebounceRef.current !== null) {
      window.clearTimeout(targetDebounceRef.current)
    }
    if (spellingDebounceRef.current !== null) {
      window.clearTimeout(spellingDebounceRef.current)
    }

    if (nextValue.trim().length < 2) {
      setLoadingNative(false)
      setCheckingSpelling(false)
      return
    }

    const requestId = targetRequestRef.current
    targetDebounceRef.current = window.setTimeout(async () => {
      setLoadingNative(true)
      const result = await fetchTranslation(
        nextValue.trim(),
        config.targetLang,
        config.nativeLang,
      )
      if (requestId !== targetRequestRef.current) return
      setSuggestionNative(result)
      setLoadingNative(false)
    }, 900)

    const spellingCandidate = nextValue.trim()
    const looksLikeSingleWord = !spellingCandidate.includes(' ')
    if (!looksLikeSingleWord || spellingCandidate.length < 4) {
      setCheckingSpelling(false)
      return
    }

    const spellRequestId = spellingRequestRef.current
    spellingDebounceRef.current = window.setTimeout(async () => {
      setCheckingSpelling(true)
      const suggestion = await fetchSpellingSuggestion(
        spellingCandidate,
        config.targetLang,
      )
      if (spellRequestId !== spellingRequestRef.current) return

      const normalizedInput = spellingCandidate.toLowerCase()
      const normalizedSuggestion = suggestion?.toLowerCase() || ''
      setSpellingSuggestion(
        normalizedSuggestion && normalizedSuggestion !== normalizedInput
          ? suggestion
          : null,
      )
      setCheckingSpelling(false)
    }, 650)
  }

  const handleNativeChange = (value: string): void => {
    setNative(value)
    setSuggestionTarget(null)
    nativeRequestRef.current += 1

    if (nativeDebounceRef.current !== null) {
      window.clearTimeout(nativeDebounceRef.current)
    }

    if (value.trim().length < 2) {
      setLoadingTarget(false)
      return
    }

    const requestId = nativeRequestRef.current
    nativeDebounceRef.current = window.setTimeout(async () => {
      setLoadingTarget(true)
      const result = await fetchTranslation(
        value.trim(),
        config.nativeLang,
        config.targetLang,
      )
      if (requestId !== nativeRequestRef.current) return
      setSuggestionTarget(result)
      setLoadingTarget(false)
    }, 900)
  }

  useEffect(() => {
    void kickLexicardExampleWorker({ batchSize: 3 })
  }, [])

  useEffect(() => {
    const sharedTarget = initialSharedTargetRef.current
    const fromShareTarget = initialShareSourceRef.current

    if (!sharedTarget && !fromShareTarget) return

    if (sharedTarget) {
      handleTargetChange(sharedTarget)
      setSharedPrefillStatus('prefilled')
    } else if (fromShareTarget) {
      setSharedPrefillStatus('missing')
    }

    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete(SHARE_TARGET_INPUT_QUERY_PARAM)
    nextSearchParams.delete(SHARE_TARGET_SOURCE_QUERY_PARAM)
    setSearchParams(nextSearchParams, { replace: true })
  }, [])

  const canSave =
    target.trim() &&
    native.trim() &&
    importance &&
    !saving &&
    !isDuplicate &&
    !wordLimitReached

  const handleSave = async (): Promise<void> => {
    if (!canSave || !importance) return
    setSaving(true)

    if (targetDebounceRef.current !== null) {
      window.clearTimeout(targetDebounceRef.current)
      targetDebounceRef.current = null
    }
    if (spellingDebounceRef.current !== null) {
      window.clearTimeout(spellingDebounceRef.current)
      spellingDebounceRef.current = null
    }
    if (nativeDebounceRef.current !== null) {
      window.clearTimeout(nativeDebounceRef.current)
      nativeDebounceRef.current = null
    }
    targetRequestRef.current += 1
    nativeRequestRef.current += 1
    spellingRequestRef.current += 1
    setLoadingNative(false)
    setLoadingTarget(false)
    setCheckingSpelling(false)
    setSuggestionNative(null)
    setSuggestionTarget(null)
    setSpellingSuggestion(null)

    const trimmedTarget = target.trim()
    const trimmedNative = native.trim()

    if (isDuplicate) {
      setSaving(false)
      return
    }
    const newCard: Lexicard = {
      id: generateId(),
      target: trimmedTarget,
      native: trimmedNative,
      targetLang: config.targetLang,
      nativeLang: config.nativeLang,
      examplePhrase: null,
      exampleTranslation: null,
      importance,
      interval: 1,
      easeFactor: 2.5,
      streak: 0,
      activationCount: 0,
      firstActivatedAt: null,
      lastActivatedAt: null,
      lastReviewed: null,
      createdAt: Date.now(),
    }

    try {
      await insertWord(newCard)
      setCards((prev) => [...prev, newCard])
      setSavesThisVisit((count) => count + 1)

      void onWordAdded().catch((error) => {
        console.error(error)
      })

      void recordWordAddedEvent().catch((error) => {
        console.error(error)
      })

      setTarget('')
      setNative('')
      setImportance(null)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      console.error(error)
    } finally {
      setSaving(false)
    }
  }

  // --- Lo que se ve ---
  const shownWords = Math.min(wordsUsedToday, wordLimit)
  const goalMarkPct = Math.min(
    100,
    (CREATION_WORDS_GOAL / Math.max(1, wordLimit)) * 100,
  )
  const cycleWordsDone = Math.min(todayProgress.wordsAdded, CREATION_WORDS_GOAL)
  const todayStr = todayKey()
  const visibleRecent = showAllRecent ? recent : recent.slice(0, RECENT_PREVIEW)
  const hiddenRecentCount = recent.length - visibleRecent.length

  // Contador del día: palabras de hoy / máximo, con la marca del mínimo del ciclo (la C).
  const dayCounter = (
    <div
      className='order-2 rounded-3xl px-5 pt-4 pb-5'
      style={{ background: 'var(--ica-i-soft)' }}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='m-0 text-xs font-extrabold tracking-[0.08em] uppercase' style={{ color: 'var(--ica-i-ink)' }}>
            {t('Palabras de hoy')}
          </p>
          <p className='m-0 mt-1 flex items-baseline gap-1.5 leading-none'>
            <span
              key={shownWords}
              className='ica-pop text-5xl font-black tabular-nums'
              style={{ color: 'var(--ica-i-ink)' }}
            >
              {shownWords}
            </span>
            <span className='text-2xl font-black text-muted-foreground tabular-nums'>
              / {wordLimit}
            </span>
          </p>
        </div>
        {wordLimitReached ? (
          <Pill tone='gold' className='mt-0.5 bg-card!'>
            {t('MÁXIMO DEL DÍA')}
          </Pill>
        ) : canCreatePhrase ? (
          <Pill tone='ok' solid className='mt-0.5'>
            <CheckIcon className='size-3.5' strokeWidth={3.2} aria-hidden='true' />
            {t('MÍNIMO HECHO')}
          </Pill>
        ) : (
          <Pill tone='i' className='mt-0.5 bg-card!'>
            {t('FALTAN {n}', { n: wordsLeftForPhrase })}
          </Pill>
        )}
      </div>

      <div className='relative mt-5'>
        <GameProgress
          value={shownWords / Math.max(1, wordLimit)}
          color='var(--ica-i)'
          height={16}
          label={t('Palabras de hoy')}
        />
        {/* Marca del mínimo del ciclo: a partir de aquí se abre la C */}
        <span
          className='absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center'
          style={{ left: `${goalMarkPct}%` }}
          aria-hidden='true'
        >
          <span className={canCreatePhrase ? '' : 'opacity-60 grayscale-[0.4]'}>
            <PhaseLetter letter='C' size={26} />
          </span>
        </span>
      </div>

      <div className='mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs font-bold text-muted-foreground tabular-nums'>
        <span>{t('Mínimo {n} para tu ciclo', { n: CREATION_WORDS_GOAL })}</span>
        <span>
          {dailyLimits.boosted
            ? t('Máximo {n} (día ampliado)', { n: wordLimit })
            : t('Máximo {n}', { n: wordLimit })}
        </span>
      </div>
    </div>
  )

  // Bloque morado hacia la C: se abre con el mínimo de palabras del día.
  const phraseBlock = (
    <button
      type='button'
      disabled={!canCreatePhrase}
      onClick={() => navigate(DASHBOARD_ROUTES.activationPhrase)}
      className={cn(
        'ica-press order-4 flex w-full items-center gap-4 rounded-3xl border-2 p-4 text-left',
        canCreatePhrase ? '' : 'cursor-not-allowed',
      )}
      style={{
        background: 'var(--ica-c-soft)',
        borderColor: canCreatePhrase
          ? 'color-mix(in oklab, var(--ica-c) 45%, transparent)'
          : 'color-mix(in oklab, var(--ica-c) 22%, transparent)',
        boxShadow: `0 4px 0 color-mix(in oklab, var(--ica-c) ${canCreatePhrase ? 45 : 20}%, transparent)`,
      }}
    >
      <span className='relative shrink-0'>
        <span className={canCreatePhrase ? 'block' : 'block opacity-55'}>
          <PhaseLetter letter='C' size={56} />
        </span>
        {!canCreatePhrase ? (
          <span className='absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border-2 border-border bg-card text-muted-foreground'>
            <LockIcon className='size-3' strokeWidth={2.8} aria-hidden='true' />
          </span>
        ) : null}
      </span>
      <span className='min-w-0 flex-1'>
        <span className='block text-xs font-extrabold tracking-[0.08em] uppercase' style={{ color: 'var(--ica-c-ink)' }}>
          {t('Creación')}
        </span>
        <span className='block text-lg leading-tight font-extrabold text-foreground'>
          {t('Crear nueva frase')}
        </span>
        {canCreatePhrase ? (
          <span className='mt-0.5 block text-xs font-semibold text-muted-foreground'>
            {t('Ya tienes tus {n} palabras: úsalas en tu frase.', { n: CREATION_WORDS_GOAL })}
          </span>
        ) : (
          <>
            <span className='mt-0.5 block text-xs font-semibold text-muted-foreground'>
              {tn(
                wordsLeftForPhrase,
                'Añade {n} palabra más hoy para crear tu frase',
                'Añade {n} palabras más hoy para crear tu frase',
              )}
            </span>
            <span className='mt-2 flex gap-1.5' aria-hidden='true'>
              {Array.from({ length: CREATION_WORDS_GOAL }, (_, index) => (
                <span
                  key={index}
                  className='h-2 flex-1 rounded-full'
                  style={{
                    background:
                      index < cycleWordsDone
                        ? 'var(--ica-c)'
                        : 'color-mix(in oklab, var(--ica-c) 18%, var(--card))',
                  }}
                />
              ))}
            </span>
          </>
        )}
      </span>
      {canCreatePhrase ? (
        <span
          className='flex size-11 shrink-0 items-center justify-center rounded-2xl text-white'
          style={{ background: 'var(--ica-c)', boxShadow: '0 3px 0 var(--ica-c-edge)' }}
          aria-hidden='true'
        >
          <ChevronRightIcon className='size-6' strokeWidth={3} />
        </span>
      ) : null}
    </button>
  )

  // Tu baúl y las últimas palabras añadidas (filas como las de ICA Coins).
  const recentSection = (
    <div className='order-5 flex flex-col gap-6'>
      <div>
        <SectionLabel>{t('Tu baúl ICA')}</SectionLabel>
        <RowGroup>
          <ListRow
            to={DASHBOARD_ROUTES.myIcaWords}
            icon={
              <IconTile tone='i' size={44}>
                <ArchiveIcon className='size-5.5' strokeWidth={2.4} aria-hidden='true' />
              </IconTile>
            }
            title={t('Mis palabras ICA')}
            text={tn(cards.length, '{n} palabra guardada', '{n} palabras guardadas')}
          />
        </RowGroup>
      </div>

      {recent.length > 0 ? (
        <div>
          <SectionLabel>{t('Últimas añadidas')}</SectionLabel>
          <RowGroup>
            {visibleRecent.map((card) => {
              const importanceMeta = getImportance(card.importance)
              const addedToday = dayKeyOf(card.createdAt) === todayStr
              return (
                <div key={card.id} className='flex items-center gap-3 py-3'>
                  <ImportanceTile level={importanceMeta.key} size={40} />
                  <div className='min-w-0 flex-1'>
                    <p className='m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-tight font-extrabold break-words'>
                      <span className='min-w-0 break-words'>{card.target}</span>
                      {addedToday ? <Pill tone='i'>{t('HOY')}</Pill> : null}
                    </p>
                    <p className='m-0 mt-0.5 text-xs font-semibold break-words text-muted-foreground'>
                      {card.native}
                    </p>
                    <RomanizationHint
                      text={card.target}
                      language={card.targetLang || ''}
                      className='m-0 mt-0.5 text-[11px] font-semibold text-muted-foreground'
                    />
                    <PronunciationHint
                      word={card.target}
                      targetLang={card.targetLang || config.targetLang}
                      nativeLang={card.nativeLang || config.nativeLang}
                      className='m-0 mt-0.5 block text-xs'
                    />
                  </div>
                  <SpeakButton
                    text={card.target}
                    langName={card.targetLang || config.targetLang}
                    color={importanceMeta.color}
                    variant='icon'
                    label={t('Escuchar {word}', { word: card.target })}
                    isPlaying={activeRecentSpeakerId === card.id}
                    onPlayingChange={(isPlaying) => {
                      setActiveRecentSpeakerId(isPlaying ? card.id : null)
                    }}
                    disabled={
                      activeRecentSpeakerId !== null &&
                      activeRecentSpeakerId !== card.id
                    }
                  />
                </div>
              )
            })}
          </RowGroup>
          {recent.length > RECENT_PREVIEW ? (
            <Button
              type='button'
              variant='ghost'
              className='mt-2 w-full text-muted-foreground'
              onClick={() => setShowAllRecent((open) => !open)}
              aria-expanded={showAllRecent}
            >
              {showAllRecent ? t('Ver menos') : t('Ver {n} más', { n: hiddenRecentCount })}
              <ChevronDownIcon
                className={cn('size-4 transition-transform', showAllRecent && 'rotate-180')}
                strokeWidth={2.6}
                aria-hidden='true'
              />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )

  return (
    <GamePage wide className='lg:flex-row lg:items-start lg:gap-10'>
      {/* Columna principal: título y formulario (en el móvil se reparte con la del día) */}
      <div className='contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-6'>
        <PageTitle
          className='order-1'
          icon={<PhaseLetter letter='I' size={48} />}
          subtitle={t('Añade palabras nuevas a tu baúl ICA.')}
        >
          {t('Inmersión')}
        </PageTitle>

        {/* Formulario */}
        <div className='order-3 flex flex-col gap-6'>
          <p className='m-0 -mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground'>
            <SparklesIcon className='size-4 shrink-0' strokeWidth={2.4} style={{ color: 'var(--ica-i)' }} aria-hidden='true' />
            {t('Escribe en cualquier campo y la IA te sugiere la traducción.')}
          </p>

          {/* Idioma que aprendes */}
          <div>
            <div className='mb-2 flex items-baseline justify-between gap-2'>
              <Label htmlFor='ica-add-target' className='text-base font-extrabold'>
                {langName(config.targetLang)}
                <span className='text-sm font-semibold text-muted-foreground'>
                  {t('idioma objetivo')}
                </span>
              </Label>
              <span
                className='text-[11px] font-bold text-muted-foreground tabular-nums'
                aria-label={t('Máximo {n} caracteres', { n: SHARE_TARGET_MAX_CHARS })}
              >
                {targetCharsCount}/{SHARE_TARGET_MAX_CHARS}
              </span>
            </div>
            <Input
              id='ica-add-target'
              value={target}
              onChange={(e) => handleTargetChange(e.target.value)}
              disabled={saving}
              maxLength={SHARE_TARGET_MAX_CHARS}
              placeholder={t('Escribe en {lang}...', { lang: langName(config.targetLang) })}
              aria-invalid={showDuplicateWarning || undefined}
              className={FIELD_CLASS}
            />
            {showDuplicateWarning && (
              <p
                className='m-0 mt-2 flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold'
                style={{ background: 'var(--ica-bad-soft)', color: 'var(--ica-bad-ink)' }}
                role='alert'
              >
                <TriangleAlertIcon className='size-4 shrink-0' strokeWidth={2.6} aria-hidden='true' />
                {t('Esta palabra ya existe en tu baúl ICA.')}
              </p>
            )}
            {sharedPrefillStatus === 'prefilled' && (
              <p
                className='m-0 mt-2 rounded-2xl px-3 py-2 text-xs font-bold'
                style={{ background: 'var(--ica-ok-soft)', color: 'var(--ica-ok-ink)' }}
              >
                {t('Texto compartido detectado y traducción automática en curso.')}
              </p>
            )}
            {sharedPrefillStatus === 'missing' && (
              <p
                className='m-0 mt-2 rounded-2xl px-3 py-2 text-xs font-bold'
                style={{ background: 'var(--ica-gold-soft)', color: 'var(--ica-gold-ink)' }}
              >
                {t('No llegó texto válido desde compartir. Escríbelo manualmente.')}
              </p>
            )}
            <RomanizationHint text={target} language={config.targetLang} className='m-0 mt-2 text-xs font-semibold text-muted-foreground' />
            {(checkingSpelling || spellingSuggestion) && (
              <div className='mt-2'>
                {checkingSpelling && (
                  <span className='inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground'>
                    <LoaderCircleIcon className='size-3.5 animate-spin' strokeWidth={2.6} aria-hidden='true' />
                    {t('Revisando ortografía...')}
                  </span>
                )}
                {!checkingSpelling && spellingSuggestion && (
                  <div
                    className='flex items-center gap-2.5 rounded-2xl border-2 px-3 py-2'
                    style={{
                      background: 'var(--ica-gold-soft)',
                      borderColor: 'color-mix(in oklab, var(--ica-gold) 45%, transparent)',
                    }}
                  >
                    <SpellCheckIcon className='size-5 shrink-0' strokeWidth={2.4} style={{ color: 'var(--ica-gold-ink)' }} aria-hidden='true' />
                    <span className='min-w-0 flex-1 text-sm font-semibold break-words' style={{ color: 'var(--ica-gold-ink)' }}>
                      {t('¿Quizás querías escribir')} <b className='font-extrabold'>«{spellingSuggestion}»</b>?
                    </span>
                    <Button
                      type='button'
                      size='sm'
                      variant='gold'
                      className='h-9 px-4'
                      onClick={() => {
                        handleTargetChange(spellingSuggestion)
                        setSpellingSuggestion(null)
                      }}
                    >
                      {t('Usar')}
                    </Button>
                  </div>
                )}
              </div>
            )}
            <TranslationSuggestion
              suggestion={suggestionNative}
              loading={loadingNative}
              label={t('En {lang}', { lang: langName(config.nativeLang) })}
              onAccept={() => {
                if (suggestionNative) {
                  setNative(suggestionNative)
                  setSuggestionNative(null)
                }
              }}
            />
            {trimmedTarget && (
              <SpeakButton
                text={trimmedTarget}
                langName={config.targetLang}
                color='#3B82F6'
                label={t('Escuchar en {lang}', { lang: langName(config.targetLang) })}
                className='mt-2.5'
                disabled={saving}
              />
            )}
          </div>

          {/* Tu idioma */}
          <div>
            <div className='mb-2 flex items-baseline justify-between gap-2'>
              <Label htmlFor='ica-add-native' className='text-base font-extrabold'>
                {langName(config.nativeLang)}
                <span className='text-sm font-semibold text-muted-foreground'>
                  {t('idioma materno')}
                </span>
              </Label>
            </div>
            <Input
              id='ica-add-native'
              value={native}
              onChange={(e) => handleNativeChange(e.target.value)}
              disabled={saving}
              placeholder={t('Escribe en {lang}...', { lang: langName(config.nativeLang) })}
              className={FIELD_CLASS}
            />
            <TranslationSuggestion
              suggestion={suggestionTarget}
              loading={loadingTarget}
              label={t('En {lang}', { lang: langName(config.targetLang) })}
              onAccept={() => {
                if (suggestionTarget) {
                  setTarget(suggestionTarget)
                  setSuggestionTarget(null)
                }
              }}
            />
          </div>

          {/* Frecuencia */}
          <div>
            <p className='m-0 mb-2 text-base font-extrabold'>
              {t('Frecuencia de uso')}
            </p>
            <ImportancePicker
              value={importance}
              onChange={(key: ImportanceKey) => !saving && setImportance(key)}
              disabled={saving}
            />
          </div>

          <div className='flex flex-col gap-3'>
            {wordLimitReached && !saved && (
              <DailyLimitNotice kind='words' state={wordLimitsState} />
            )}

            <Button
              type='button'
              onClick={handleSave}
              disabled={!canSave}
              size='xl'
              variant={saved ? 'success' : 'i'}
              className={cn('w-full text-lg', saved && 'disabled:opacity-100')}
            >
              {saving ? (
                <>
                  <LoaderCircleIcon className='size-5 animate-spin' strokeWidth={2.6} aria-hidden='true' />
                  {t('Guardando...')}
                </>
              ) : saved ? (
                <>
                  <CheckIcon className='size-5' strokeWidth={3.2} aria-hidden='true' />
                  {t('¡Guardada!')}
                </>
              ) : wordLimitReached ? (
                t('Máximo del día alcanzado')
              ) : (
                t('Guardar palabra')
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Columna del día (a la derecha en ordenador; en el móvil se reparte) */}
      <div className='contents lg:flex lg:w-84 lg:shrink-0 lg:flex-col lg:gap-6'>
        {dayCounter}
        {phraseBlock}
        {recentSection}
      </div>
    </GamePage>
  )
}

/**
 * Piezas visuales de la pantalla de juego de Desafíos ICA
 * (reloj, pregunta de cada modo, tablero de Parejas, respuesta correcta y lista de resultados).
 * La lógica del juego está en IcaChallengePlayView.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowRightIcon,
  CheckIcon,
  CornerDownLeftIcon,
  MicIcon,
  PlusIcon,
  RotateCcwIcon,
  SkipForwardIcon,
  Volume2Icon,
  XIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LANG_CODES } from '../../constants'
import type {
  IcaChallengePairsResult,
  IcaChallengePublicQuestion,
  IcaChallengeReveal,
  IcaChallengeReviewItem,
} from '../../types'

// ---------------------------------------------------------------------------
// Reloj
// ---------------------------------------------------------------------------

/** Cuenta atrás que llama a onExpire una sola vez al llegar a 0. */
export function useCountdown(input: {
  endsAt: number | null
  totalMs: number | null
  onExpire?: () => void
  paused?: boolean
}) {
  const [now, setNow] = useState(() => Date.now())
  const expiredRef = useRef(false)
  const onExpireRef = useRef(input.onExpire)
  onExpireRef.current = input.onExpire

  useEffect(() => {
    expiredRef.current = false
  }, [input.endsAt])

  useEffect(() => {
    if (input.endsAt === null || input.paused) return
    const id = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(id)
  }, [input.endsAt, input.paused])

  const remainingMs = input.endsAt === null ? null : Math.max(0, input.endsAt - now)

  useEffect(() => {
    if (remainingMs === null || input.paused) return
    if (remainingMs <= 0 && !expiredRef.current) {
      expiredRef.current = true
      onExpireRef.current?.()
    }
  }, [remainingMs, input.paused])

  const fraction =
    remainingMs === null || !input.totalMs ? 1 : Math.max(0, Math.min(1, remainingMs / input.totalMs))

  return { remainingMs, fraction }
}

export function TimerBar({ remainingMs, fraction }: { remainingMs: number | null; fraction: number }) {
  if (remainingMs === null) return null
  const seconds = Math.ceil(remainingMs / 1000)
  const tone =
    fraction > 0.5 ? 'bg-emerald-500' : fraction > 0.25 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className='flex items-center gap-3' aria-label={`Quedan ${seconds} segundos`}>
      <div className='h-2 flex-1 overflow-hidden rounded-full bg-muted'>
        <div
          className={`h-full rounded-full transition-[width] duration-100 ease-linear ${tone}`}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <span
        className={`w-9 text-right font-mono text-sm tabular-nums ${
          fraction <= 0.25 ? 'font-semibold text-red-500' : 'text-muted-foreground'
        }`}
      >
        {seconds}s
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Enunciados
// ---------------------------------------------------------------------------

export function PromptCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/10 to-transparent px-4 py-6 text-center'>
      <p className='mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground'>
        {label}
      </p>
      {children}
    </div>
  )
}

export function BigWord({ children }: { children: ReactNode }) {
  return (
    <p className='break-words font-serif text-3xl font-semibold leading-tight sm:text-4xl'>{children}</p>
  )
}

export function ClozePhrase({ before, after }: { before: string; after: string }) {
  return (
    <p className='text-xl leading-relaxed sm:text-2xl'>
      {before}
      <span className='mx-1 inline-block min-w-[4.5rem] border-b-2 border-dashed border-primary align-baseline text-primary'>
        &nbsp;
      </span>
      {after}
    </p>
  )
}

export function QuestionPrompt({
  data,
  nativeLang,
  targetLang,
  onReplayAudio,
}: {
  data: IcaChallengePublicQuestion
  nativeLang: string
  targetLang: string
  onReplayAudio?: () => void
}) {
  if (data.kind === 'listen') {
    return (
      <PromptCard label={`Escucha en ${targetLang}`}>
        <button
          type='button'
          onClick={onReplayAudio}
          className='mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-primary transition hover:bg-primary/25 active:scale-95'
          aria-label='Escuchar otra vez'
        >
          <Volume2Icon className='h-9 w-9' />
        </button>
        <p className='mt-3 text-xs text-muted-foreground'>Toca para escuchar otra vez</p>
      </PromptCard>
    )
  }

  if (data.kind === 'cloze') {
    return (
      <PromptCard label='¿Qué palabra ICA falta?'>
        <ClozePhrase before={data.before} after={data.after} />
      </PromptCard>
    )
  }

  // Parejas no tiene enunciado: el tablero es la pregunta (PairsBoard).
  if (data.kind === 'pairs') return null

  const label =
    data.kind === 'write'
      ? `Escríbela en ${targetLang}`
      : data.kind === 'speak'
        ? `Dila en ${targetLang}`
        : `En ${nativeLang}`

  return (
    <PromptCard label={label}>
      <BigWord>{data.prompt}</BigWord>
    </PromptCard>
  )
}

// ---------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------

export function OptionsGrid({
  options,
  disabled,
  onPick,
  pickedIndex,
  correctIndex,
}: {
  options: string[]
  disabled: boolean
  onPick: (index: number) => void
  pickedIndex?: number | null
  correctIndex?: number | null
}) {
  const showResult = correctIndex !== undefined && correctIndex !== null
  return (
    <div className='grid gap-2 sm:grid-cols-2'>
      {options.map((option, index) => {
        const isCorrect = showResult && index === correctIndex
        const isWrongPick = showResult && pickedIndex === index && index !== correctIndex
        return (
          <Button
            key={`${option}-${index}`}
            type='button'
            variant='outline'
            disabled={disabled}
            onClick={() => onPick(index)}
            className={`h-auto min-h-12 whitespace-normal break-words px-4 py-3 text-base ${
              isCorrect
                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 disabled:opacity-100 dark:border-emerald-500 dark:bg-emerald-500/20 dark:text-emerald-300'
                : isWrongPick
                  ? 'border-red-500 bg-red-500/15 text-red-700 disabled:opacity-100 dark:border-red-500 dark:bg-red-500/20 dark:text-red-300'
                  : ''
            }`}
          >
            {option}
          </Button>
        )
      })}
    </div>
  )
}

export function WriteAnswerForm({
  hint,
  targetLang,
  disabled,
  onSubmit,
  onSkip,
  submitLabel = 'Comprobar',
  autoFocusKey,
}: {
  hint: string
  targetLang: string
  disabled: boolean
  onSubmit: (text: string) => void
  onSkip: () => void
  submitLabel?: string
  autoFocusKey: string | number
}) {
  const [text, setText] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  // El Input de la app no recibe ref (React 18): se busca dentro del formulario.
  const focusInput = () => formRef.current?.querySelector('input')?.focus()

  useEffect(() => {
    setText('')
    // Con un pequeño retraso para que el teclado del móvil se abra bien.
    const id = window.setTimeout(focusInput, 30)
    return () => window.clearTimeout(id)
  }, [autoFocusKey])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (disabled) return
    const value = text.trim()
    if (!value) {
      focusInput()
      return
    }
    onSubmit(value)
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className='space-y-2'>
      {hint && (
        <p className='text-center text-sm text-muted-foreground'>
          Empieza por <span className='font-semibold text-foreground'>{hint.replace('…', '')}</span>…
        </p>
      )}
      <div className='flex gap-2'>
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          // readOnly (y no disabled) para que el teclado del móvil no se cierre entre palabra y palabra
          readOnly={disabled}
          lang={LANG_CODES[targetLang] || undefined}
          autoCapitalize='none'
          autoCorrect='off'
          autoComplete='off'
          spellCheck={false}
          enterKeyHint='send'
          placeholder={`Escribe en ${targetLang}`}
          className='h-12 text-lg'
          aria-label={`Respuesta en ${targetLang}`}
        />
        <Button type='submit' disabled={disabled} className='h-12 px-4' aria-label={submitLabel}>
          <CornerDownLeftIcon className='h-4 w-4 sm:mr-1' />
          <span className='hidden sm:inline'>{submitLabel}</span>
        </Button>
      </div>
      <div className='flex justify-center'>
        <Button type='button' variant='ghost' size='sm' disabled={disabled} onClick={onSkip}>
          <SkipForwardIcon className='mr-1 h-3.5 w-3.5' />
          No la sé
        </Button>
      </div>
    </form>
  )
}

export function SpeakPanel({
  status,
  heard,
  message,
  disabled,
  onRetry,
  onSkip,
}: {
  status: 'starting' | 'listening' | 'checking' | 'idle'
  heard: string
  message: string | null
  disabled: boolean
  onRetry: () => void
  onSkip: () => void
}) {
  const listening = status === 'listening'
  return (
    <div className='space-y-3 text-center'>
      <div className='relative mx-auto flex h-20 w-20 items-center justify-center'>
        {listening && (
          <span className='absolute inset-0 animate-ping rounded-full bg-primary/25' aria-hidden='true' />
        )}
        <span
          className={`relative flex h-20 w-20 items-center justify-center rounded-full border ${
            listening ? 'border-primary bg-primary/20 text-primary' : 'border-border bg-muted/40 text-muted-foreground'
          }`}
        >
          <MicIcon className='h-8 w-8' />
        </span>
      </div>
      <p className='min-h-[1.5rem] text-lg font-medium'>
        {heard || (listening ? 'Te escucho…' : status === 'starting' ? 'Abriendo el micrófono…' : ' ')}
      </p>
      {message && <p className='text-sm text-amber-600 dark:text-amber-400'>{message}</p>}
      <div className='flex justify-center gap-2'>
        <Button type='button' variant='outline' size='sm' disabled={disabled || listening} onClick={onRetry}>
          <RotateCcwIcon className='mr-1 h-3.5 w-3.5' />
          Repetir
        </Button>
        <Button type='button' variant='ghost' size='sm' disabled={disabled} onClick={onSkip}>
          <SkipForwardIcon className='mr-1 h-3.5 w-3.5' />
          No la sé
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Parejas
// ---------------------------------------------------------------------------

/** Un color por pareja (el mismo a los dos lados), para ver de un vistazo qué está unido. */
const PAIR_TONES = [
  { dot: 'bg-sky-500', item: 'border-sky-400 bg-sky-500/15 text-sky-900 dark:border-sky-400/70 dark:text-sky-100' },
  { dot: 'bg-violet-500', item: 'border-violet-400 bg-violet-500/15 text-violet-900 dark:border-violet-400/70 dark:text-violet-100' },
  { dot: 'bg-amber-500', item: 'border-amber-400 bg-amber-500/15 text-amber-900 dark:border-amber-400/70 dark:text-amber-100' },
  { dot: 'bg-emerald-500', item: 'border-emerald-400 bg-emerald-500/15 text-emerald-900 dark:border-emerald-400/70 dark:text-emerald-100' },
  { dot: 'bg-rose-500', item: 'border-rose-400 bg-rose-500/15 text-rose-900 dark:border-rose-400/70 dark:text-rose-100' },
]

type PairSelection = { side: 'left' | 'right'; index: number } | null

/**
 * Tablero de Parejas: toca una palabra y después su significado (o al revés).
 * Tocar algo ya unido lo suelta. Al unir la cuarta pareja, la quinta se une sola
 * y se manda el tablero.
 */
export function PairsBoard({
  words,
  options,
  targetLang,
  nativeLang,
  disabled,
  boardKey,
  onChange,
  onComplete,
}: {
  words: string[]
  options: string[]
  targetLang: string
  nativeLang: string
  disabled: boolean
  /** Cambia con cada tablero nuevo: se vacían las parejas. */
  boardKey: number
  onChange: (matches: Array<number | null>) => void
  onComplete: (matches: Array<number | null>) => void
}) {
  const empty = () => words.map(() => null as number | null)
  const [matches, setMatches] = useState<Array<number | null>>(empty)
  const [selected, setSelected] = useState<PairSelection>(null)
  const completedRef = useRef(false)

  useEffect(() => {
    setMatches(words.map(() => null))
    setSelected(null)
    completedRef.current = false
    // Solo al cambiar de tablero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey])

  const commit = (next: Array<number | null>) => {
    let finalMatches = next
    const freeLeft = next.map((value, index) => (value === null ? index : -1)).filter((index) => index >= 0)
    if (freeLeft.length === 1) {
      // Solo queda una pareja posible: se une sola.
      const usedRight = new Set(next.filter((value): value is number => value !== null))
      const freeRight = options.map((_, index) => index).find((index) => !usedRight.has(index))
      if (freeRight !== undefined) {
        finalMatches = next.slice()
        finalMatches[freeLeft[0]] = freeRight
      }
    }
    setMatches(finalMatches)
    setSelected(null)
    onChange(finalMatches)
    if (finalMatches.every((value) => value !== null) && !completedRef.current) {
      completedRef.current = true
      window.setTimeout(() => onComplete(finalMatches), 280)
    }
  }

  const tapLeft = (index: number) => {
    if (disabled || completedRef.current) return
    if (matches[index] !== null) {
      const next = matches.slice()
      next[index] = null
      setMatches(next)
      onChange(next)
      setSelected({ side: 'left', index })
      return
    }
    if (selected?.side === 'left' && selected.index === index) {
      setSelected(null)
      return
    }
    if (selected?.side === 'right') {
      const next = matches.slice()
      next[index] = selected.index
      commit(next)
      return
    }
    setSelected({ side: 'left', index })
  }

  const tapRight = (index: number) => {
    if (disabled || completedRef.current) return
    const owner = matches.findIndex((value) => value === index)
    if (owner >= 0) {
      const next = matches.slice()
      next[owner] = null
      setMatches(next)
      onChange(next)
      setSelected({ side: 'right', index })
      return
    }
    if (selected?.side === 'right' && selected.index === index) {
      setSelected(null)
      return
    }
    if (selected?.side === 'left') {
      const next = matches.slice()
      next[selected.index] = index
      commit(next)
      return
    }
    setSelected({ side: 'right', index })
  }

  const itemClass = (tone: (typeof PAIR_TONES)[number] | null, isSelected: boolean) =>
    `relative flex min-h-14 w-full items-center justify-center rounded-xl border px-2.5 py-2 text-center text-[15px] font-medium leading-snug break-words transition active:scale-[0.97] disabled:cursor-default ${
      tone
        ? tone.item
        : isSelected
          ? 'border-primary bg-primary/15 ring-2 ring-primary/60'
          : 'border-border bg-card hover:border-primary/50 hover:bg-primary/5'
    }`

  const matchedCount = matches.filter((value) => value !== null).length

  return (
    <div>
      <div className='mb-2 grid grid-cols-2 gap-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground'>
        <span>{targetLang}</span>
        <span>{nativeLang}</span>
      </div>
      <div className='grid grid-cols-2 gap-2'>
        <div className='space-y-2'>
          {words.map((word, index) => {
            const tone = matches[index] !== null ? PAIR_TONES[index % PAIR_TONES.length] : null
            const isSelected = selected?.side === 'left' && selected.index === index
            return (
              <button
                key={`l-${boardKey}-${index}`}
                type='button'
                disabled={disabled}
                onClick={() => tapLeft(index)}
                className={itemClass(tone, isSelected)}
                aria-pressed={isSelected}
              >
                {tone && <span className={`absolute left-1.5 top-1.5 h-2 w-2 rounded-full ${tone.dot}`} />}
                {word}
              </button>
            )
          })}
        </div>
        <div className='space-y-2'>
          {options.map((option, index) => {
            const owner = matches.findIndex((value) => value === index)
            const tone = owner >= 0 ? PAIR_TONES[owner % PAIR_TONES.length] : null
            const isSelected = selected?.side === 'right' && selected.index === index
            return (
              <button
                key={`r-${boardKey}-${index}`}
                type='button'
                disabled={disabled}
                onClick={() => tapRight(index)}
                className={itemClass(tone, isSelected)}
                aria-pressed={isSelected}
              >
                {tone && <span className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${tone.dot}`} />}
                {option}
              </button>
            )
          })}
        </div>
      </div>
      <p className='mt-3 text-center text-xs text-muted-foreground'>
        {matchedCount === 0
          ? 'Toca una palabra y después su significado'
          : `${matchedCount} de ${words.length} parejas · toca una pareja para soltarla`}
      </p>
    </div>
  )
}

/** Tras corregir el tablero: cada palabra con lo que uniste y, si fallaste, la buena. */
export function PairsResult({
  words,
  options,
  result,
  timedOut,
}: {
  words: string[]
  options: string[]
  result: IcaChallengePairsResult
  timedOut: boolean
}) {
  const correctCount = result.correct.filter(Boolean).length
  const perfect = correctCount === words.length
  return (
    <div className='space-y-3' role='status'>
      <p
        className={`flex items-center justify-center gap-1.5 text-center text-sm font-semibold ${
          perfect ? 'text-emerald-600 dark:text-emerald-300' : 'text-foreground'
        }`}
      >
        {perfect ? <CheckIcon className='h-4 w-4' /> : null}
        {perfect
          ? '¡Tablero perfecto!'
          : `${correctCount} de ${words.length} parejas${timedOut ? ' · se acabó el tiempo' : ''}`}
      </p>
      <ul className='divide-y rounded-xl border'>
        {words.map((word, index) => {
          const ok = result.correct[index]
          const chosen = result.chosen[index]
          const solution = result.solution[index]
          return (
            <li key={`${word}-${index}`} className='flex items-center gap-2.5 px-3 py-2'>
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  ok
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                    : 'bg-red-500/15 text-red-600 dark:text-red-300'
                }`}
              >
                {ok ? <CheckIcon className='h-3.5 w-3.5' /> : <XIcon className='h-3.5 w-3.5' />}
              </span>
              <span className='min-w-0 flex-1 break-words text-sm font-medium'>{word}</span>
              <ArrowRightIcon className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
              <span className='min-w-0 flex-1 text-right text-sm'>
                {!ok && chosen !== null && options[chosen] && (
                  <span className='block text-xs text-muted-foreground line-through'>{options[chosen]}</span>
                )}
                <span className={ok ? '' : 'font-medium text-emerald-700 dark:text-emerald-300'}>
                  {options[solution] ?? ''}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Resultado de cada palabra
// ---------------------------------------------------------------------------

export function FeedbackCard({
  isCorrect,
  timedOut,
  reveal,
  myAnswer,
  kind,
}: {
  isCorrect: boolean
  timedOut: boolean
  reveal: IcaChallengeReveal
  myAnswer: string | null
  kind: IcaChallengePublicQuestion['kind']
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-5 text-center ${
        isCorrect
          ? 'border-emerald-500/60 bg-emerald-500/10'
          : 'border-red-500/50 bg-red-500/10'
      }`}
      role='status'
    >
      <p
        className={`mb-2 inline-flex items-center gap-1.5 text-sm font-semibold ${
          isCorrect ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'
        }`}
      >
        {isCorrect ? <CheckIcon className='h-4 w-4' /> : <XIcon className='h-4 w-4' />}
        {isCorrect ? '¡Correcto!' : timedOut ? 'Se acabó el tiempo' : 'No era esa'}
      </p>
      <p className='break-words font-serif text-2xl font-semibold'>{reveal.target}</p>
      <p className='text-sm text-muted-foreground'>{reveal.native}</p>
      {kind === 'cloze' && reveal.phrase && (
        <div className='mt-3 rounded-lg bg-background/60 px-3 py-2 text-sm'>
          <p>{reveal.phrase}</p>
          {reveal.phraseTranslation && (
            <p className='mt-0.5 text-xs text-muted-foreground'>{reveal.phraseTranslation}</p>
          )}
        </div>
      )}
      {!isCorrect && myAnswer && (kind === 'write' || kind === 'speak') && (
        <p className='mt-2 text-xs text-muted-foreground'>
          {kind === 'speak' ? 'He entendido' : 'Has escrito'}: «{myAnswer}»
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lista final de palabras
// ---------------------------------------------------------------------------

export function ReviewList({
  items,
  rivalFirstName,
  canAdd,
  onAdd,
}: {
  items: IcaChallengeReviewItem[]
  rivalFirstName: string
  canAdd: (item: IcaChallengeReviewItem) => 'add' | 'owned' | 'hidden'
  onAdd: (item: IcaChallengeReviewItem) => void
}) {
  return (
    <ul className='divide-y rounded-xl border'>
      {items.map((item) => {
        const addState = canAdd(item)
        return (
          <li key={`${item.index}-${item.target}`} className='flex items-center gap-3 px-3 py-2.5'>
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                item.isCorrect
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                  : 'bg-red-500/15 text-red-600 dark:text-red-300'
              }`}
              aria-label={item.isCorrect ? 'Acertada' : 'Fallada'}
            >
              {item.isCorrect ? <CheckIcon className='h-4 w-4' /> : <XIcon className='h-4 w-4' />}
            </span>
            <div className='min-w-0 flex-1'>
              <p className='break-words font-medium leading-tight'>
                {item.target}
                <span className='font-normal text-muted-foreground'> · {item.native}</span>
              </p>
              {!item.isCorrect && item.myAnswer && item.myAnswer !== item.target && (
                <p className='truncate text-xs text-muted-foreground'>
                  {item.kind === 'pairs' ? 'La uniste con' : 'Tu respuesta:'} «{item.myAnswer}»
                </p>
              )}
              {!item.isCorrect && !item.myAnswer && (item.timedOut || item.kind === 'pairs') && (
                <p className='text-xs text-muted-foreground'>
                  {item.kind === 'pairs' ? 'Sin unir' : 'Sin respuesta a tiempo'}
                </p>
              )}
              {item.fromRival && (
                <p className='text-[11px] font-medium uppercase tracking-wide text-primary/80'>
                  Del baúl de {rivalFirstName}
                </p>
              )}
            </div>
            {addState === 'add' && (
              <Button type='button' size='sm' variant='outline' onClick={() => onAdd(item)} className='shrink-0'>
                <PlusIcon className='mr-1 h-3.5 w-3.5' />
                <span className='hidden sm:inline'>Añadir a mi baúl</span>
                <span className='sm:hidden'>Añadir</span>
              </Button>
            )}
            {addState === 'owned' && (
              <span className='shrink-0 text-[11px] text-muted-foreground'>En tu baúl</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

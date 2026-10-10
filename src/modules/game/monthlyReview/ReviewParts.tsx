import { useEffect, useRef, useState, type ComponentType, type FormEvent } from 'react'
import { motion } from 'motion/react'
import { CheckIcon, CornerDownLeftIcon, SkipForwardIcon, Volume1Icon, Volume2Icon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { t } from '@/i18n'
import { BookGlyph, FlameIcon, HeadphonesGlyph, PencilGlyph } from '../icons'
import { SoundToggleButton } from '../SoundToggleButton'
import { tone, type Tone } from '../ui'
import { LANG_CODES } from '../../constants'
import { isRight, type ReviewRound, type ReviewVerdict } from './rules'

type GlyphProps = { size?: number; className?: string }

export const ROUND_META: Record<
  ReviewRound,
  { tone: Tone; Glyph: ComponentType<GlyphProps>; title: () => string; how: () => string }
> = {
  reading: {
    tone: 'i',
    Glyph: BookGlyph,
    title: () => t('Lectura'),
    how: () => t('Lee y elige la respuesta correcta.'),
  },
  listening: {
    tone: 'c',
    Glyph: HeadphonesGlyph,
    title: () => t('Escucha'),
    how: () => t('Escucha con calma. Puedes repetirlo y ponerlo más lento.'),
  },
  writing: {
    tone: 'a',
    Glyph: PencilGlyph,
    title: () => t('Escritura'),
    how: () => t('Ahora escribes tú. Las tildes y las mayúsculas no cuentan.'),
  },
}

/** Cover of each round: icon and color of the round, before its first question. */
export function RoundCover({
  round,
  number,
  count,
  onGo,
}: {
  round: ReviewRound
  number: number
  count: number
  onGo: () => void
}) {
  const meta = ROUND_META[round]
  const colors = tone(meta.tone)
  return (
    <section className='mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 pb-28 text-center'>
      <motion.span
        initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16 }}
        className='flex size-32 items-center justify-center rounded-[38px]'
        style={{ background: colors.soft, boxShadow: `0 7px 0 ${colors.edge}` }}
      >
        <meta.Glyph size={72} />
      </motion.span>
      <p className='mt-7 mb-0 text-xs font-extrabold tracking-[0.12em] uppercase' style={{ color: colors.ink }}>
        {t('Ronda {n} de 3', { n: number })}
      </p>
      <h1 className='m-0 mt-1 font-display text-4xl font-extrabold tracking-tight'>
        {t('Ronda {n} · {name}', { n: number, name: meta.title() })}
      </h1>
      <p className='mt-3 max-w-xs text-base font-semibold text-balance text-muted-foreground'>{meta.how()}</p>
      <p className='mt-1 text-sm font-bold text-muted-foreground'>{t('{n} preguntas', { n: count })}</p>
      <Button type='button' size='xl' variant={meta.tone === 'i' ? 'i' : meta.tone === 'c' ? 'c' : 'a'} className='mt-9 w-full max-w-sm text-lg font-extrabold' onClick={onGo}>
        {t('¡Vamos!')}
      </Button>
    </section>
  )
}

/** Top bar: leave, progress, streak and sound. */
export function ReviewTopBar({
  answered,
  total,
  round,
  streak,
  onExit,
}: {
  answered: number
  total: number
  round: ReviewRound
  streak: number
  onExit: () => void
}) {
  const colors = tone(ROUND_META[round].tone)
  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center gap-3'>
        <button
          type='button'
          onClick={onExit}
          className='flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted'
          aria-label={t('Salir del Repaso')}
        >
          <XIcon className='size-6' strokeWidth={2.6} aria-hidden='true' />
        </button>
        <div
          className='h-4 flex-1 overflow-hidden rounded-full bg-muted'
          role='progressbar'
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={answered}
          aria-label={t('Progreso del Repaso')}
        >
          <div className='relative h-full rounded-full transition-[width] duration-500' style={{ width: `${Math.max(4, (answered / total) * 100)}%`, background: colors.solid }}>
            <span className='absolute inset-x-2 top-[3px] h-1 rounded-full bg-white/35' />
          </div>
        </div>
        <SoundToggleButton />
      </div>
      <div className='flex items-center justify-between px-1'>
        <p className='m-0 text-xs font-extrabold tracking-[0.1em] uppercase' style={{ color: colors.ink }}>
          {ROUND_META[round].title()}
        </p>
        {streak >= 2 ? (
          <motion.span
            key={streak}
            initial={{ scale: 0.5, y: 6 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 14 }}
            className='inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-black tabular-nums'
            style={{ background: 'var(--ica-fire-soft)', color: 'var(--ica-fire-ink)' }}
            aria-label={t('Racha de {n} aciertos', { n: streak })}
          >
            <FlameIcon size={18} />×{streak}
          </motion.span>
        ) : (
          <span className='text-xs font-bold text-muted-foreground'>{answered + 1 > total ? total : answered + 1}/{total}</span>
        )}
      </div>
    </div>
  )
}

/** The big card with the question (what to do + what is shown). */
export function ReviewCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='rounded-3xl border-2 border-border bg-card px-4 py-6 text-center'>
      <p className='mb-3 text-xs font-extrabold tracking-[0.1em] text-muted-foreground uppercase'>{label}</p>
      {children}
    </div>
  )
}

/** A word or phrase, as big as it can be for its length. */
export function ReviewText({ children, className = '' }: { children: string; className?: string }) {
  const size = children.length > 60 ? 'text-xl' : children.length > 28 ? 'text-2xl sm:text-3xl' : children.length > 14 ? 'text-3xl sm:text-4xl' : 'text-4xl sm:text-5xl'
  return <p className={`m-0 font-display font-extrabold tracking-tight break-words ${size} ${className}`}>{children}</p>
}

/** Listening: replay, slower, and «No puedo escucharlo ahora» (that question does not count). */
export function ListenControls({
  onPlay,
  onSlow,
  onCannotListen,
  playing,
}: {
  onPlay: () => void
  onSlow: () => void
  onCannotListen: () => void
  playing: boolean
}) {
  return (
    <div className='flex flex-col items-center gap-3'>
      <div className='flex items-center justify-center gap-3'>
        <button
          type='button'
          onClick={onPlay}
          className='flex size-20 items-center justify-center rounded-3xl bg-primary text-primary-foreground transition active:translate-y-1'
          style={{ boxShadow: '0 5px 0 color-mix(in oklab, var(--primary) 70%, black)' }}
          aria-label={t('Escuchar otra vez')}
        >
          <Volume2Icon className={`size-9 ${playing ? 'animate-pulse' : ''}`} strokeWidth={2.4} aria-hidden='true' />
        </button>
        <button
          type='button'
          onClick={onSlow}
          className='flex h-20 flex-col items-center justify-center gap-1 rounded-3xl border-2 border-border bg-card px-4 text-sm font-extrabold transition active:translate-y-1'
          style={{ boxShadow: '0 5px 0 var(--border)' }}
        >
          <Volume1Icon className='size-6' strokeWidth={2.6} aria-hidden='true' />
          {t('Más lento')}
        </button>
      </div>
      <button type='button' onClick={onCannotListen} className='text-sm font-bold text-muted-foreground underline-offset-4 hover:underline'>
        {t('No puedo escucharlo ahora')}
      </button>
    </div>
  )
}

/** Typed answer. Accents and capitals do not count, so there is no keyboard warning here. */
export function TypeAnswerForm({
  lang,
  placeholder,
  onSubmit,
  onSkip,
  autoFocusKey,
}: {
  lang: string
  placeholder: string
  onSubmit: (text: string) => void
  onSkip: () => void
  autoFocusKey: string
}) {
  const [text, setText] = useState('')
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    setText('')
    const id = window.setTimeout(() => formRef.current?.querySelector('input')?.focus(), 60)
    return () => window.clearTimeout(id)
  }, [autoFocusKey])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = text.trim()
    if (!value) {
      formRef.current?.querySelector('input')?.focus()
      return
    }
    onSubmit(value)
  }

  return (
    <form ref={formRef} onSubmit={submit} className='space-y-2'>
      <div className='flex gap-2'>
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          lang={LANG_CODES[lang] || undefined}
          autoCapitalize='none'
          autoCorrect='off'
          autoComplete='off'
          spellCheck={false}
          enterKeyHint='send'
          placeholder={placeholder}
          className='h-14 rounded-2xl border-2 text-lg font-bold'
          aria-label={placeholder}
        />
        <Button type='submit' className='h-14 rounded-2xl px-4 font-extrabold' aria-label={t('Comprobar')}>
          <CornerDownLeftIcon className='size-4 sm:mr-1' aria-hidden='true' />
          <span className='hidden sm:inline'>{t('Comprobar')}</span>
        </Button>
      </div>
      <div className='flex justify-center'>
        <Button type='button' variant='ghost' size='sm' onClick={onSkip}>
          <SkipForwardIcon className='mr-1 size-3.5' aria-hidden='true' />
          {t('No la sé')}
        </Button>
      </div>
    </form>
  )
}

/** «Ordena tu frase»: tap the words in order; tap a placed word to take it back. */
export function OrderBoard({
  tiles,
  onSubmit,
  onSkip,
  resetKey,
}: {
  tiles: string[]
  onSubmit: (placed: string[]) => void
  onSkip: () => void
  resetKey: string
}) {
  const [placed, setPlaced] = useState<number[]>([])
  useEffect(() => setPlaced([]), [resetKey])
  const bank = tiles.map((_, index) => index).filter((index) => !placed.includes(index))
  const tileClass =
    'min-h-11 rounded-2xl border-2 px-3.5 py-2 text-base font-bold break-words transition-[transform,box-shadow] active:translate-y-[3px]'
  return (
    <div className='space-y-3'>
      <div
        className='flex min-h-[4.25rem] flex-wrap content-start gap-2 rounded-2xl border-2 border-dashed border-border-strong p-2.5'
        aria-label={t('Tu frase')}
      >
        {placed.length === 0 ? (
          <p className='m-0 w-full self-center text-center text-sm font-semibold text-muted-foreground'>{t('Toca las palabras en orden')}</p>
        ) : (
          placed.map((tileIndex, position) => (
            <button
              key={`${tileIndex}-${position}`}
              type='button'
              className={tileClass}
              style={{ borderColor: 'var(--primary)', background: 'color-mix(in oklab, var(--primary) 12%, var(--card))', boxShadow: '0 3px 0 var(--primary-edge)' }}
              onClick={() => setPlaced((current) => current.filter((_, at) => at !== position))}
            >
              {tiles[tileIndex]}
            </button>
          ))
        )}
      </div>
      <div className='flex flex-wrap justify-center gap-2' aria-label={t('Palabras para ordenar')}>
        {bank.map((tileIndex) => (
          <button
            key={tileIndex}
            type='button'
            className={tileClass}
            style={{ borderColor: 'var(--border)', background: 'var(--card)', boxShadow: '0 3px 0 var(--border)' }}
            onClick={() => setPlaced((current) => [...current, tileIndex])}
          >
            {tiles[tileIndex]}
          </button>
        ))}
      </div>
      <Button type='button' size='xl' className='w-full text-lg font-extrabold' disabled={placed.length !== tiles.length} onClick={() => onSubmit(placed.map((index) => tiles[index]))}>
        {t('Comprobar')}
      </Button>
      <div className='flex justify-center'>
        <Button type='button' variant='ghost' size='sm' onClick={onSkip}>
          <SkipForwardIcon className='mr-1 size-3.5' aria-hidden='true' />
          {t('No la sé')}
        </Button>
      </div>
    </div>
  )
}

/** Result of one answer, with the right one, and the way on. */
export function ReviewFeedback({
  verdict,
  main,
  sub,
  detail,
  onSpeak,
  onNext,
  last,
}: {
  verdict: ReviewVerdict
  main: string
  sub: string | null
  detail?: string | null
  onSpeak?: () => void
  onNext: () => void
  last: boolean
}) {
  const palette =
    verdict === 'correct'
      ? { border: 'var(--ica-ok)', bg: 'var(--ica-ok-soft)', ink: 'var(--ica-ok-ink)' }
      : verdict === 'almost'
        ? { border: 'var(--ica-gold)', bg: 'var(--ica-gold-soft)', ink: 'var(--ica-gold-ink)' }
        : { border: 'var(--ica-bad-strong)', bg: 'var(--ica-bad-soft)', ink: 'var(--ica-bad-ink)' }
  const title = verdict === 'correct' ? t('¡Correcto!') : verdict === 'almost' ? t('¡Casi!') : t('No era esa')
  return (
    <div className='space-y-3'>
      <div className='rounded-3xl border-2 px-4 py-4 text-center' style={{ borderColor: palette.border, background: palette.bg }} role='status'>
        <p className='m-0 inline-flex items-center gap-1.5 text-base font-extrabold' style={{ color: palette.ink }}>
          {isRight(verdict) ? <CheckIcon className='size-4' strokeWidth={3} aria-hidden='true' /> : <XIcon className='size-4' strokeWidth={3} aria-hidden='true' />}
          {title}
        </p>
        {verdict !== 'correct' ? (
          <p className='m-0 mt-1 text-xs font-bold text-muted-foreground'>{verdict === 'almost' ? t('Se escribe así:') : t('La respuesta era:')}</p>
        ) : null}
        <p className='m-0 mt-1 font-display text-2xl font-extrabold tracking-tight break-words'>{main}</p>
        {sub ? <p className='m-0 mt-0.5 text-sm font-semibold text-muted-foreground'>{sub}</p> : null}
        {detail ? <p className='m-0 mt-2 text-sm font-semibold text-muted-foreground'>{detail}</p> : null}
        {onSpeak ? (
          <button type='button' onClick={onSpeak} className='mx-auto mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-extrabold hover:bg-background/60' style={{ color: palette.ink }}>
            <Volume2Icon className='size-4' strokeWidth={2.6} aria-hidden='true' />
            {t('Escuchar')}
          </button>
        ) : null}
      </div>
      <Button type='button' size='xl' variant={isRight(verdict) ? 'success' : 'danger'} className='w-full text-lg font-extrabold' onClick={onNext} autoFocus>
        {last ? t('Ver mi resultado') : t('Continuar')}
      </Button>
    </div>
  )
}

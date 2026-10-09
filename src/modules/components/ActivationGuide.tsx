import { forwardRef, type ReactNode } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, CircleHelpIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel } from '../game/ui'
import { LanguageFlag } from './LanguagePicker'
import { sanitizeTokenForLookup, segmentPhraseText } from '../phraseSegmentation'
import { inSentence, type ActivationPair } from '../services/activationGuide'
import { langName, t } from '@/i18n'

/**
 * ACTIVACIÓN GUIADA (Luis, 9 Oct). Both phrases on screen, your language first and the one you
 * learn below, with the part you are on lit up in both. You say it in your language, then in the
 * other one, and tap anywhere to go on. No speech recognition: you set the pace.
 * - `preview`: before recording, the same look (Luis: «que aparezca directamente así»), with the
 *   words of the phrase you learn tappable to explore them, and room below for Escuchar.
 * - `live`: while recording, with «Siguiente parte».
 */
type ActivationGuideProps = {
  mode: 'preview' | 'live'
  pairs: ActivationPair[]
  step: number
  nativeLang: string
  targetLang: string
  paused?: boolean
  onNext?: () => void
  onPrev?: () => void
  /** Live: opens «Así se activa una frase» again. */
  onHelp?: () => void
  /** Preview: tapping a word of the phrase you learn (to explore it). */
  onTokenClick?: (token: string) => void
  /** Shown under the two phrases (preview: listen button, words…). */
  footer?: ReactNode
}

type ChunkState = 'done' | 'now' | 'next'

function chunkState(index: number, step: number): ChunkState {
  if (index < step) return 'done'
  if (index === step) return 'now'
  return 'next'
}

export const ActivationGuide = forwardRef<HTMLDivElement, ActivationGuideProps>(function ActivationGuide(
  { mode, pairs, step, nativeLang, targetLang, paused = false, onNext, onPrev, onHelp, onTokenClick, footer },
  ref,
) {
  const live = mode === 'live'
  const total = pairs.length
  const current = Math.min(step, total - 1)
  const isLast = current >= total - 1
  const single = total === 1
  const native = inSentence(langName(nativeLang))
  const target = inSentence(langName(targetLang))

  // Before recording (Luis, 9 Oct): only the two phrases, as small as possible, so the mic is on
  // the first screen. The parts and the «first your language» guide start when you record.
  if (!live) {
    const fullNative = pairs.map((pair) => pair.native).join(' ')
    const fullTarget = pairs.map((pair) => pair.target).join(' ')
    return (
      <div ref={ref} className='scroll-mt-3'>
        <Panel className='p-3.5 lg:p-5'>
          <div className='grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2.5'>
            <LanguageFlag language={nativeLang} size={26} className='mt-1' />
            <p className='m-0 text-base leading-snug font-semibold text-muted-foreground lg:text-lg'>
              <span className='sr-only'>{native}: </span>
              {fullNative}
            </p>
            <LanguageFlag language={targetLang} size={26} className='mt-1.5' />
            <p className='m-0 text-[1.2rem] leading-snug font-black tracking-tight lg:text-2xl'>
              <span className='sr-only'>{target}: </span>
              {onTokenClick ? (
                <TappableWords text={fullTarget} language={targetLang} onTokenClick={onTokenClick} />
              ) : (
                fullTarget
              )}
            </p>
          </div>
          {footer}
        </Panel>
      </div>
    )
  }

  return (
    <div ref={ref} className='scroll-mt-3'>
      <Panel tone='a' className='p-4 lg:p-5'>
        {/* Parte y progreso */}
        <div className='flex min-h-8 items-center justify-between gap-3'>
          <p className='ica-label m-0' aria-live='polite'>
            {single
                ? t('Tu frase')
                : t('Parte {n} de {total}', { n: current + 1, total })}
          </p>
          <div className='flex items-center gap-1.5'>
            {single ? null : (
              <span className='flex gap-1' aria-hidden='true'>
                {pairs.map((_, index) => (
                  <i
                    key={index}
                    className='block h-1.5 w-4 rounded-full transition-colors'
                    style={{ background: index <= current ? 'var(--ica-a)' : 'var(--border)' }}
                  />
                ))}
              </span>
            )}
            {single ? null : (
              <button
                type='button'
                onClick={onPrev}
                disabled={current === 0}
                aria-label={t('Parte anterior')}
                className='grid size-8 place-items-center rounded-full text-muted-foreground disabled:opacity-30'
              >
                <ChevronLeftIcon className='size-5' strokeWidth={2.6} />
              </button>
            )}
            {onHelp ? (
              <button
                type='button'
                onClick={onHelp}
                aria-label={t('Cómo se activa una frase')}
                className='grid size-8 place-items-center rounded-full text-muted-foreground'
              >
                <CircleHelpIcon className='size-5' strokeWidth={2.4} />
              </button>
            ) : null}
          </div>
        </div>

        {/* 1. Tu idioma */}
        <PhraseLine
          order={1}
          language={nativeLang}
          label={native}
          chunks={pairs.map((pair) => pair.native)}
          step={current}
          highlight={{ background: 'var(--ica-gold-soft)', color: 'var(--ica-gold-ink)', ring: 'var(--ica-gold)' }}
          className='mt-2.5 font-bold'
        />
        {/* 2. El idioma que aprendes */}
        <PhraseLine
          order={2}
          language={targetLang}
          label={target}
          chunks={pairs.map((pair) => pair.target)}
          step={current}
          highlight={{ background: 'var(--ica-i-soft)', color: 'var(--ica-i-ink)', ring: 'var(--ica-i)' }}
          className='mt-2 font-black'
        />

        {isLast ? (
          <p className='m-0 mt-3 text-center text-sm font-extrabold text-muted-foreground'>
            {single
              ? t('Al terminar, toca el cuadrado.')
              : t('Última parte. Al terminar, toca el cuadrado.')}
          </p>
        ) : (
          <>
            <div className='relative mt-3'>
              <Button type='button' size='lg' variant='a' className='w-full lg:h-14' onClick={onNext} disabled={paused}>
                {t('Siguiente parte')}
                <ChevronRightIcon className='size-5' strokeWidth={2.8} />
              </Button>
            </div>
            {paused ? (
              <p className='m-0 mt-2 text-center text-xs font-semibold text-muted-foreground'>
                {t('Grabación pausada')}
              </p>
            ) : null}
          </>
        )}
      </Panel>
    </div>
  )
})

function PhraseLine({
  order,
  language,
  label,
  chunks,
  step,
  highlight,
  className,
  onTokenClick,
}: {
  order: number
  language: string
  label: string
  chunks: string[]
  step: number
  highlight: { background: string; color: string; ring: string }
  className?: string
  onTokenClick?: (token: string) => void
}) {
  return (
    <div className={`grid grid-cols-[auto_1fr] items-start gap-3 rounded-2xl border-2 border-border bg-card px-3 py-2.5 dark:bg-background/40 ${className ?? ''}`}>
      <span className='flex flex-col items-center gap-1 pt-1'>
        <LanguageFlag language={language} size={30} />
        <span className='text-[0.65rem] leading-none font-black text-muted-foreground tabular-nums'>
          {order}
        </span>
      </span>
      <p className='m-0 text-[1.15rem] leading-[1.55] tracking-tight lg:text-xl'>
        <span className='sr-only'>{label}: </span>
        {chunks.map((chunk, index) => {
          const state = chunkState(index, step)
          return (
            <span key={index}>
              {index > 0 ? ' ' : null}
              <span
                className='rounded-md px-0.5 transition-colors duration-200 [box-decoration-break:clone]'
                style={
                  state === 'now'
                    ? { background: highlight.background, color: highlight.color, boxShadow: `inset 0 -2px 0 ${highlight.ring}` }
                    : { color: 'var(--muted-foreground)', opacity: state === 'done' ? 0.5 : 0.85 }
                }
              >
                {onTokenClick ? <TappableWords text={chunk} language={language} onTokenClick={onTokenClick} /> : chunk}
              </span>
            </span>
          )
        })}
      </p>
    </div>
  )
}

/** Words you can tap to explore, like the phrase used to show them (dotted underline). */
function TappableWords({
  text,
  language,
  onTokenClick,
}: {
  text: string
  language: string
  onTokenClick: (token: string) => void
}) {
  return (
    <>
      {segmentPhraseText(text, language).map((segment, index) => {
        const token = segment.isToken ? sanitizeTokenForLookup(segment.value) : ''
        if (!token) return <span key={index}>{segment.value}</span>
        return (
          <button
            key={index}
            type='button'
            onClick={() => onTokenClick(token)}
            className='rounded-sm underline decoration-current/30 decoration-dotted underline-offset-3 focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:outline-none'
          >
            {segment.value}
          </button>
        )
      })}
    </>
  )
}

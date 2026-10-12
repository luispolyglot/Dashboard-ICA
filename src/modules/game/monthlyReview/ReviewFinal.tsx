import { useEffect, useMemo, useRef, useState } from 'react'
import { ImageDownIcon, LightbulbIcon, RotateCcwIcon, Share2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { langName, t, tn } from '@/i18n'
import { launchWinConfetti } from '../../components/IcaChallenges/challengeFeedback'
import type { MonthlyReviewResult } from '../../services/monthlyReview'
import { FichaIcon } from '../icons'
import { gameSfx } from '../sfx'
import { tone } from '../ui'
import { ROUND_META } from './ReviewParts'
import { drawReviewImage, REVIEW_IMAGE_H, REVIEW_IMAGE_W, type ReviewImageData } from './reviewImage'
import { isLowReviewScore, REVIEW_LOW_SCORE_MAX, REVIEW_ROUNDS, weakestRound, type ReviewRound } from './rules'

export type MissedItem = { id: string; target: string; native: string }

const ROUND_COLORS: Record<ReviewRound, string> = { reading: '#7dd3fc', listening: '#60a5fa', writing: '#a5b4fc' }

function roundTip(round: ReviewRound): string {
  switch (round) {
    case 'reading':
      return t('Lee tus frases en voz alta y fíjate en cómo se usa cada palabra: la lectura se afianza usándolas.')
    case 'listening':
      return t('Escucha más veces tus notas maestras: es la forma más rápida de que el oído reconozca tus palabras.')
    case 'writing':
    default:
      return t('Escribe tus palabras sin mirarlas, en el móvil o a mano: así se fija la ortografía.')
  }
}

/** The image to save or share in ICADEMY, drawn when the screen opens. */
export function ReviewShare({ data, fileName, shareTitle }: { data: ReviewImageData; fileName: string; shareTitle: string }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [help, setHelp] = useState(false)
  const dataKey = JSON.stringify(data)

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = REVIEW_IMAGE_W
      canvas.height = REVIEW_IMAGE_H
      const context = canvas.getContext('2d')
      if (!context) return
      drawReviewImage(context, data)
      setImageUrl(canvas.toDataURL('image/png'))
      canvas.toBlob((blob) => setImageFile(blob ? new File([blob], fileName, { type: 'image/png' }) : null), 'image/png')
    } catch {
      setImageUrl(null)
    }
    // The picture is redrawn only when its content changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, fileName])

  const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  const canShare = Boolean(imageFile && typeof navigator !== 'undefined' && navigator.canShare?.({ files: [imageFile] }))

  const save = () => {
    if (canShare && imageFile) {
      navigator.share({ files: [imageFile], title: shareTitle }).catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setHelp(true)
      })
      return
    }
    if (isTouch) {
      setHelp(true)
      return
    }
    if (!imageUrl) return
    const link = document.createElement('a')
    link.href = imageUrl
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  if (!imageUrl) return null
  return (
    <div className='ica-panel flex flex-col items-center gap-3 px-4 py-4 text-center'>
      <p className='m-0 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>{t('Tu logro')}</p>
      <img
        src={imageUrl}
        alt={t('Imagen con tu resultado del Repaso')}
        className='w-44 rounded-2xl shadow-md'
        style={{ aspectRatio: `${REVIEW_IMAGE_W} / ${REVIEW_IMAGE_H}` }}
      />
      <Button type='button' size='xl' variant='outline' className='w-full' onClick={save}>
        {canShare ? <Share2Icon data-icon='inline-start' className='size-5' strokeWidth={2.6} /> : <ImageDownIcon data-icon='inline-start' className='size-5' strokeWidth={2.6} />}
        {t('Comparte tu logro en ICADEMY')}
      </Button>
      {help ? (
        <p className='m-0 text-sm font-semibold text-muted-foreground'>
          {t('Mantén pulsada la imagen y elige «Guardar imagen»; después súbela a ICADEMY.')}
        </p>
      ) : null}
    </div>
  )
}

export function ReviewFinal({
  result,
  coinsCapped,
  monthName,
  name,
  targetLang,
  missed,
  boostedCount,
  onDone,
  onRetry,
  practiceOf,
}: {
  result: MonthlyReviewResult
  coinsCapped: boolean
  monthName: string
  name: string
  targetLang: string
  missed: MissedItem[]
  boostedCount: number
  onDone: () => void
  /** With a low score: repeat it as practice (nothing changes). */
  onRetry?: () => void
  /** A practice round: the «X de cada 10» of the month's real Repaso, which stays the same. */
  practiceOf?: number
}) {
  const practice = practiceOf !== undefined
  const stopConfetti = useRef<(() => void) | null>(null)
  const x = result.rememberedOfTen
  const low = isLowReviewScore(x)

  useEffect(() => {
    gameSfx.celebrate()
    stopConfetti.current = launchWinConfetti()
    const coinTimer = result.coins > 0 && !practice ? window.setTimeout(() => gameSfx.coin(), 800) : null
    return () => {
      stopConfetti.current?.()
      if (coinTimer) window.clearTimeout(coinTimer)
    }
    // Once, when the result appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const weakest = weakestRound(result.rounds)
  const imageData = useMemo<ReviewImageData>(
    () => ({
      title: t('Repaso de {month}', { month: monthName }),
      name,
      language: langName(targetLang),
      rememberedOfTen: x,
      lead: t('Recuerdo'),
      caption: t('de cada 10 de mis palabras ICA'),
      rounds: REVIEW_ROUNDS.map((round) => ({
        label: ROUND_META[round].title(),
        value: `${result.rounds[round].correct}/${result.rounds[round].total}`,
        share: result.rounds[round].total ? result.rounds[round].correct / result.rounds[round].total : 0,
        color: ROUND_COLORS[round],
      })),
      cta: t('Comparte tu logro en ICADEMY'),
      footer: 'icademy.app',
    }),
    [monthName, name, result.rounds, targetLang, x],
  )

  return (
    <section className='mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pt-6 pb-28 text-center lg:py-10'>
      <div>
        <p className='m-0 text-xs font-extrabold tracking-[0.1em] text-muted-foreground uppercase'>{t('Repaso de {month}', { month: monthName })}</p>
        <h1 className='m-0 mt-1 font-display text-4xl font-extrabold tracking-tight text-balance'>
          {low ? t('¡Enhorabuena por terminarlo!') : t('¡Enhorabuena!')}
        </h1>
      </div>

      <div className='mx-auto flex items-baseline gap-2 rounded-3xl px-7 py-4' style={{ background: x >= 9 ? 'var(--ica-gold-soft)' : 'var(--ica-ok-soft)' }}>
        <span className='text-7xl leading-none font-black tabular-nums' style={{ color: x >= 9 ? 'var(--ica-gold-ink)' : 'var(--ica-ok-ink)' }}>
          {x}
        </span>
        <span className='text-xl font-extrabold text-muted-foreground'>{t('de cada 10')}</span>
      </div>
      <p className='m-0 text-base font-bold text-balance'>
        {low
          ? x >= REVIEW_LOW_SCORE_MAX
            ? t('Recuerdas {x} de cada 10 de tus palabras ICA de {month}. Ya casi estás a punto de entender la mitad de lo que aprendes.', { x, month: monthName })
            : t('Recuerdas {x} de cada 10 de tus palabras ICA de {month}. Cada repaso las fija un poco más.', { x, month: monthName })
          : t('Recuerdas {x} de cada 10 de tus palabras ICA de {month}. Ya las puedes usar en una conversación.', { x, month: monthName })}
      </p>

      {low && onRetry ? (
        <div className='ica-panel flex flex-col gap-3 px-4 py-4' style={{ background: 'var(--ica-i-soft)' }}>
          <p className='m-0 text-base font-extrabold' style={{ color: 'var(--ica-i-ink)' }}>
            {t('¿Quieres repetirlo? Seguro que te sale mejor.')}
          </p>
          <Button type='button' size='xl' variant='i' className='w-full text-lg font-extrabold' onClick={onRetry}>
            <RotateCcwIcon data-icon='inline-start' className='size-5' strokeWidth={2.6} />
            {t('Repetir el Repaso')}
          </Button>
          <p className='m-0 text-xs font-bold text-muted-foreground'>{t('Es para practicar: tu resultado y tus ICA Coins de este mes no cambian.')}</p>
        </div>
      ) : null}

      {practice ? (
        <p className='m-0 rounded-2xl bg-muted px-3 py-2.5 text-sm font-bold'>
          {t('Repaso de práctica. Tu resultado del mes sigue siendo {y} de cada 10.', { y: practiceOf })}
        </p>
      ) : null}

      {practice ? null : (
      <div className='ica-panel flex items-center justify-center gap-3 px-4 py-3' style={{ background: 'var(--ica-gold-soft)' }}>
        <FichaIcon size={40} />
        <div className='text-left'>
          <p className='m-0 text-xl font-black' style={{ color: 'var(--ica-gold-ink)' }}>
            {result.coins > 0 ? t('+{n} ICA Coins', { n: result.coins }) : t('0 ICA Coins')}
          </p>
          <p className='m-0 text-xs font-bold text-muted-foreground'>
            {result.coins === 0 && coinsCapped
              ? t('Tu hucha está llena (100): esta vez no se suma más.')
              : coinsCapped
                ? t('Se sumaron solo las que caben: tu hucha llega a 100.')
                : t('Tu premio: {x} de cada 10 palabras, {x} ICA Coins.', { x })}
          </p>
        </div>
      </div>
      )}

      <div className='ica-panel flex flex-col gap-3 px-4 py-4 text-left'>
        <p className='m-0 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>{t('Aciertos por ronda')}</p>
        {REVIEW_ROUNDS.map((round) => {
          const score = result.rounds[round]
          const colors = tone(ROUND_META[round].tone)
          const Glyph = ROUND_META[round].Glyph
          return (
            <div key={round} className='flex items-center gap-3'>
              <Glyph size={26} />
              <div className='min-w-0 flex-1'>
                <div className='flex items-baseline justify-between gap-2'>
                  <span className='text-sm font-extrabold'>{ROUND_META[round].title()}</span>
                  <span className='text-sm font-black tabular-nums'>{score.total ? `${score.correct}/${score.total}` : '–'}</span>
                </div>
                <div className='mt-1 h-2.5 overflow-hidden rounded-full bg-muted'>
                  <div className='h-full rounded-full' style={{ width: `${score.total ? (score.correct / score.total) * 100 : 0}%`, background: colors.solid }} />
                </div>
              </div>
            </div>
          )
        })}
        {weakest ? (
          <p className='m-0 mt-1 flex items-start gap-2 rounded-2xl bg-muted px-3 py-2.5 text-sm font-semibold'>
            <LightbulbIcon className='mt-0.5 size-4 shrink-0' strokeWidth={2.6} style={{ color: 'var(--ica-gold-ink)' }} aria-hidden='true' />
            <span>
              <b className='font-extrabold'>{t('Para mejorar: {round}.', { round: ROUND_META[weakest].title() })}</b> {roundTip(weakest)}
            </span>
          </p>
        ) : (
          <p className='m-0 mt-1 rounded-2xl px-3 py-2.5 text-sm font-extrabold' style={{ background: 'var(--ica-ok-soft)', color: 'var(--ica-ok-ink)' }}>
            {t('Las tres rondas, sin ningún fallo.')}
          </p>
        )}
      </div>

      {missed.length > 0 ? (
        <div className='ica-panel flex flex-col gap-2 px-4 py-4 text-left'>
          <p className='m-0 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>
            {t('Para repasar')}
          </p>
          <ul className='m-0 list-none divide-y-2 p-0'>
            {missed.map((item) => (
              <li key={item.id} className='py-2 first:pt-0 last:pb-0'>
                <span className='font-bold break-words'>{item.target}</span>
                <span className='font-semibold text-muted-foreground'> · {item.native}</span>
              </li>
            ))}
          </ul>
          {!practice && boostedCount > 0 ? (
            <p className='m-0 text-sm font-semibold text-muted-foreground'>
              {tn(boostedCount, 'Esa palabra ahora sale antes en tus flashcards.', 'Esas palabras ahora salen antes en tus flashcards.')}
            </p>
          ) : null}
        </div>
      ) : null}

      {practice ? null : (
        <ReviewShare data={imageData} fileName={`repaso-${monthName}.png`} shareTitle={t('Mi Repaso de {month}', { month: monthName })} />
      )}

      <Button type='button' size='xl' className='w-full text-lg font-extrabold' onClick={onDone}>
        {t('Volver a Tests')}
      </Button>
    </section>
  )
}

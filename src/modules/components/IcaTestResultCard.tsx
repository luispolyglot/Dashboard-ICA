import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { t, uiLocale } from '@/i18n'
import { TrophyIcon } from '../game/icons'
import { GameProgress, Pill, tone as toneColors } from '../game/ui'
import { IcaTestGlyph, scoreTone } from './IcaTestParts'

type IcaTestResultCardProps = {
  monthLabel: string
  title: string
  score: number
  totalQuestions: number
  message: string
  note: string
  className?: string
  isSaving?: boolean
  errorMessage?: string | null
  leaderboardPoints?: number | null
  errorReviewAction?: ReactNode
  actions: ReactNode
}

function formatPoints(value: number): string {
  return new Intl.NumberFormat(uiLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)
}

/** Estrella de la nota (llena o apagada). */
function ResultStar({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg viewBox='0 0 24 24' width={size} height={size} aria-hidden='true'>
      <path
        d='M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z'
        fill={filled ? '#FFC72C' : 'var(--muted)'}
        stroke={filled ? '#E0A500' : 'var(--border-strong)'}
        strokeWidth='1.6'
        strokeLinejoin='round'
      />
    </svg>
  )
}

/** Resultado del Test ICA como celebración: estrellas, nota enorme, aciertos y puntos. */
export function IcaTestResultCard({
  monthLabel,
  title,
  score,
  totalQuestions,
  message,
  note,
  className,
  isSaving = false,
  errorMessage = null,
  leaderboardPoints = null,
  errorReviewAction = null,
  actions,
}: IcaTestResultCardProps) {
  const ratio = totalQuestions > 0 ? score / totalQuestions : 0
  const colors = toneColors(scoreTone(score, totalQuestions))
  // 1 estrella desde la mitad, 2 desde el 80 % y 3 con todo bien
  const stars = ratio >= 1 ? 3 : ratio >= 0.8 ? 2 : ratio >= 0.5 ? 1 : 0
  const misses = Math.max(0, totalQuestions - score)

  return (
    <div className={cn('ica-panel w-full overflow-hidden text-center', className)}>
      {/* Cabecera de color: icono, mes y título */}
      <div className='flex flex-col items-center gap-2 px-5 pt-6 pb-5' style={{ background: colors.soft }}>
        <span className='ica-pop'>{ratio >= 0.8 ? <TrophyIcon size={76} /> : <IcaTestGlyph size={70} />}</span>
        {/* Solo la primera letra en mayúscula ("Octubre de 2026") */}
        <Pill tone='neutral'>{monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</Pill>
        <h2 className='m-0 font-display text-3xl leading-tight font-extrabold tracking-tight' style={{ color: colors.ink }}>
          {title}
        </h2>
        <div className='mt-1 flex items-end justify-center gap-1' aria-label={t('{n} de 3 estrellas', { n: stars })}>
          <ResultStar filled={stars >= 1} size={40} />
          <span className='-translate-y-2'>
            <ResultStar filled={stars >= 2} size={52} />
          </span>
          <ResultStar filled={stars >= 3} size={40} />
        </div>
      </div>

      <div className='flex flex-col items-center gap-4 px-5 pt-5 pb-6'>
        <p className='m-0 leading-none font-black tabular-nums' style={{ color: colors.ink }}>
          <span className='text-7xl'>{score}</span>
          <span className='text-3xl text-muted-foreground'>/{totalQuestions}</span>
        </p>
        <GameProgress value={ratio} color={colors.solid} height={16} className='max-w-xs' label={t('Aciertos del test')} />

        <div className='grid w-full max-w-xs grid-cols-2 gap-2'>
          <div className='rounded-2xl px-3 py-2.5' style={{ background: 'var(--ica-ok-soft)' }}>
            <p className='m-0 text-2xl leading-none font-black tabular-nums' style={{ color: 'var(--ica-ok-ink)' }}>
              {score}
            </p>
            <p className='m-0 mt-1 text-xs font-extrabold' style={{ color: 'var(--ica-ok-ink)' }}>
              {score === 1 ? t('acierto') : t('aciertos')}
            </p>
          </div>
          <div className='rounded-2xl px-3 py-2.5' style={{ background: 'var(--ica-bad-soft)' }}>
            <p className='m-0 text-2xl leading-none font-black tabular-nums' style={{ color: 'var(--ica-bad-ink)' }}>
              {misses}
            </p>
            <p className='m-0 mt-1 text-xs font-extrabold' style={{ color: 'var(--ica-bad-ink)' }}>
              {misses === 1 ? t('fallo') : t('fallos')}
            </p>
          </div>
        </div>

        <p className='m-0 max-w-sm text-base font-bold'>{message}</p>

        {leaderboardPoints !== null && (
          <div
            className='flex w-full max-w-sm items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left'
            style={{
              background: 'var(--ica-gold-soft)',
              borderColor: 'color-mix(in oklab, var(--ica-gold) 45%, transparent)',
            }}
          >
            <TrophyIcon size={34} />
            <span className='text-sm font-extrabold' style={{ color: 'var(--ica-gold-ink)' }}>
              {t('+{points} puntos para el ranking del mes', { points: formatPoints(leaderboardPoints) })}
            </span>
          </div>
        )}

        <p className='m-0 text-xs font-semibold text-muted-foreground'>{note}</p>
        {isSaving && <p className='m-0 text-sm font-bold text-muted-foreground'>{t('Guardando resultado...')}</p>}
        {errorMessage && (
          <p className='m-0 text-sm font-bold' style={{ color: 'var(--ica-bad-ink)' }}>
            {errorMessage}
          </p>
        )}
        {errorReviewAction}
        <div className='w-full'>{actions}</div>
      </div>
    </div>
  )
}

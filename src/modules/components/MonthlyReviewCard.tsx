import { CalendarClockIcon, PlayIcon, RotateCcwIcon, TimerIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'
import { BookGlyph, FichaIcon } from '../game/icons'
import { monthLabel } from '../game/monthlyRecap'
import { isLowReviewScore, REVIEW_TOTAL_QUESTIONS } from '../game/monthlyReview/rules'
import { Pill, SectionLabel } from '../game/ui'
import type { PastMonthlyReview } from '../hooks/useMonthlyReviewStatus'
import { DASHBOARD_ROUTES } from '../routes/paths'
import type { MonthlyReviewStatus } from '../services/monthlyReview'

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * REPASO DEL MES en la pantalla de Tests: solo se ve con la ventana abierta y las palabras
 * necesarias, o cuando ya está hecho (un intento por mes). El servidor decide todo.
 */
export function MonthlyReviewCard({ status }: { status: MonthlyReviewStatus | null }) {
  const reviewDone = status?.result ?? null
  if (!status || !(reviewDone || (status.windowOpen && status.eligible))) return null
  const reviewStatus = status
  return (
    <div className='ica-panel overflow-hidden'>
      <div className='flex items-center gap-4 px-5 pt-5 pb-4' style={{ background: 'var(--ica-i-soft)' }}>
        <span className={!reviewDone ? 'ica-bob' : undefined}>
          <BookGlyph size={64} />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='m-0 text-xs font-extrabold tracking-[0.08em] uppercase' style={{ color: 'var(--ica-i-ink)' }}>
            {t('Repaso del mes')}
          </p>
          <p className='m-0 font-display text-2xl leading-tight font-extrabold tracking-tight' style={{ color: 'var(--ica-i-ink)' }}>
            {capitalize(monthLabel(reviewStatus.monthStart))}
          </p>
          <Pill tone={reviewDone ? 'ok' : 'gold'} solid className='mt-1.5'>
            {reviewDone ? t('Hecho') : t('Disponible')}
          </Pill>
        </div>
        {reviewDone ? (
          <div className='flex flex-col items-center leading-none'>
            <span className='text-5xl font-black tabular-nums' style={{ color: 'var(--ica-i-ink)' }}>
              {reviewDone.rememberedOfTen}
            </span>
            <span className='mt-1 text-xs font-extrabold' style={{ color: 'var(--ica-i-ink)' }}>
              {t('de cada 10')}
            </span>
          </div>
        ) : null}
      </div>
      <div className='flex flex-col gap-4 px-5 pt-4 pb-5'>
        <div className='flex flex-wrap gap-2'>
          <span className='inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-extrabold'>
            <BookGlyph size={16} />
            {t('{n} preguntas', { n: REVIEW_TOTAL_QUESTIONS })}
          </span>
          <span className='inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-extrabold'>
            <TimerIcon className='size-4' strokeWidth={2.6} style={{ color: 'var(--ica-a)' }} aria-hidden='true' />
            {t('Sin reloj')}
          </span>
          <span className='inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-extrabold'>
            <CalendarClockIcon className='size-4' strokeWidth={2.6} style={{ color: 'var(--ica-i)' }} aria-hidden='true' />
            {t('Del {start} al {end}', { start: reviewStatus.openDay, end: reviewStatus.closeDay })}
          </span>
        </div>
        {reviewDone ? (
          <p className='m-0 flex items-center gap-2 text-sm font-bold' style={{ color: 'var(--ica-ok-ink)' }}>
            <FichaIcon size={22} />
            {reviewDone.coins > 0
              ? t('Recuerdas {x} de cada 10 de tus palabras. Ganaste {n} ICA Coins.', { x: reviewDone.rememberedOfTen, n: reviewDone.coins })
              : t('Recuerdas {x} de cada 10 de tus palabras.', { x: reviewDone.rememberedOfTen })}
          </p>
        ) : null}
        {reviewDone && reviewStatus.windowOpen && isLowReviewScore(reviewDone.rememberedOfTen) ? (
          <>
            <Button type='button' size='xl' variant='outline' className='w-full' asChild>
              <Link to={DASHBOARD_ROUTES.monthlyReview}>
                <RotateCcwIcon data-icon='inline-start' className='size-5' strokeWidth={2.6} />
                {t('Repetir el Repaso')}
              </Link>
            </Button>
            <p className='m-0 -mt-2 text-xs font-semibold text-muted-foreground'>
              {t('Es para practicar: tu resultado y tus ICA Coins de este mes no cambian.')}
            </p>
          </>
        ) : null}
        {reviewDone ? null : (
          <>
            <p className='m-0 text-sm font-semibold text-muted-foreground'>
              {t('¿Cuántas de tus palabras ICA de este mes recuerdas? Ganas tantas ICA Coins como palabras recuerdes de cada 10. Solo se hace una vez al mes.')}
            </p>
            <Button type='button' size='xl' variant='i' className='w-full' asChild>
              <Link to={DASHBOARD_ROUTES.monthlyReview}>
                <PlayIcon data-icon='inline-start' className='size-5' strokeWidth={2.6} />
                {t('Empezar el Repaso')}
              </Link>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

/** Los Repasos de meses anteriores. */
export function MonthlyReviewHistory({ items }: { items: PastMonthlyReview[] }) {
  if (items.length === 0) return null
  const pastReviews = items
  return (
    <div>
      <SectionLabel>{t('Tus repasos')}</SectionLabel>
      <div className='flex flex-col gap-3'>
        {pastReviews.map((item) => (
          <div key={item.month} className='ica-panel flex items-center gap-3 px-3.5 py-3'>
            <span className='flex size-[58px] shrink-0 items-center justify-center rounded-2xl text-3xl font-black tabular-nums' style={{ background: 'var(--ica-i-soft)', color: 'var(--ica-i-ink)' }}>
              {item.rememberedOfTen}
            </span>
            <div className='min-w-0 flex-1'>
              <p className='m-0 truncate text-base leading-tight font-extrabold'>{capitalize(monthLabel(item.month))}</p>
              <p className='m-0 mt-0.5 text-xs font-semibold text-muted-foreground'>
                {t('{x} de cada 10', { x: item.rememberedOfTen })}
                {item.coins > 0 ? ` · ${t('+{n} ICA Coins', { n: item.coins })}` : ''}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

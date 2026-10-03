import { ArrowRightIcon, GraduationCapIcon } from 'lucide-react'
import { t } from '@/i18n'

/** Formulario de entrada al Coaching ICA. */
export const COACHING_FORM_URL = 'https://tally.so/r/nWGeaR'

/**
 * Tarjeta para quien todavía no está en el Coaching ICA. «Quiero saber más» abre el
 * formulario de entrada (Tally) en una pestaña nueva.
 */
export function CoachingInviteCard({ preview = false }: { preview?: boolean }) {
  return (
    <>
      {preview ? (
        <p className='m-0 mb-2 rounded-2xl bg-muted px-3 py-2 text-xs font-bold text-muted-foreground'>
          {t('Vista previa (solo admin): así ven esta tarjeta quienes no están en el coaching.')}
        </p>
      ) : null}
      <div
        className='relative flex items-start gap-3 overflow-hidden rounded-[22px] p-3.5 text-white shadow-[0_4px_0_#1e1b4b]'
        style={{
          background:
            'radial-gradient(120% 120% at 100% 0%, rgb(236 72 153 / 0.4), transparent 55%), linear-gradient(135deg, #1d4ed8 0%, #6d28d9 60%, #9d174d 100%)',
        }}
      >
        <span className='flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15' aria-hidden='true'>
          <GraduationCapIcon className='size-5' strokeWidth={2.4} />
        </span>
        <span className='flex min-w-0 flex-1 flex-col items-start'>
          <span className='text-[10px] font-black tracking-[0.1em] text-white/75 uppercase'>{t('Coaching ICA')}</span>
          <span className='text-[16px] leading-tight font-black'>{t('Habla con soltura en 70 días')}</span>
          <span className='mt-0.5 text-xs font-semibold text-white/85'>
            {t('Programa intensivo y personalizado con Luis y su equipo.')}
          </span>
          <a
            href={COACHING_FORM_URL}
            target='_blank'
            rel='noopener noreferrer'
            className='ica-press mt-2.5 inline-flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-xs font-black text-[#4c1d95] shadow-[0_3px_0_rgb(0_0_0/0.25)]'
          >
            {t('Quiero saber más')}
            <ArrowRightIcon className='size-3.5' strokeWidth={3} aria-hidden='true' />
          </a>
        </span>
      </div>
    </>
  )
}

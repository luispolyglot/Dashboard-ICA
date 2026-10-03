import { Link } from 'react-router-dom'
import { LockIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { CardsIcon } from './icons'
import { FLASHCARDS_MIN_ACTIVATED_WORDS } from './rules'
import { GamePage, GameProgress, Panel, PhaseLetter } from './ui'
import { t, tn } from '@/i18n'

/** Pantalla de flashcards bloqueadas: se abren con 20 palabras activadas. */
export function FlashcardsLocked({ activatedWords }: { activatedWords: number }) {
  const shown = Math.min(activatedWords, FLASHCARDS_MIN_ACTIVATED_WORDS)
  const missing = Math.max(0, FLASHCARDS_MIN_ACTIVATED_WORDS - activatedWords)

  return (
    <GamePage className='items-center justify-center gap-5 text-center lg:max-w-md'>
      {/* Candado grande sobre las tarjetas */}
      <div className='relative mt-4'>
        <span
          className='flex size-32 items-center justify-center rounded-[2rem]'
          style={{ background: 'var(--ica-c-soft)' }}
        >
          <CardsIcon size={80} className='opacity-60 grayscale-[0.4]' />
        </span>
        <span
          className='ica-bob absolute -right-3 -bottom-3 flex size-16 items-center justify-center rounded-2xl text-white'
          style={{ background: 'var(--ica-c)', boxShadow: '0 5px 0 var(--ica-c-edge)' }}
        >
          <LockIcon className='size-8' strokeWidth={2.6} aria-hidden='true' />
        </span>
      </div>

      <div>
        <h2 className='m-0 font-display text-2xl leading-tight font-extrabold tracking-tight lg:text-3xl'>
          {t('Flashcards bloqueadas')}
        </h2>
        <p className='m-0 mt-1.5 text-base font-semibold text-muted-foreground'>
          {t('Se abren cuando tienes')}{' '}
          <b className='font-extrabold text-foreground'>
            {t('{n} palabras activadas', { n: FLASHCARDS_MIN_ACTIVATED_WORDS })}
          </b>
          .
        </p>
      </div>

      {/* Progreso hacia el desbloqueo */}
      <Panel className='text-left'>
        <div className='flex items-end justify-between gap-3'>
          <p className='m-0 leading-none'>
            <span className='text-4xl font-black tabular-nums' style={{ color: 'var(--ica-c-ink)' }}>
              {shown}
            </span>
            <span className='text-xl font-black text-muted-foreground tabular-nums'> / {FLASHCARDS_MIN_ACTIVATED_WORDS}</span>
          </p>
          <span
            className='rounded-full px-2.5 py-0.5 text-xs font-extrabold'
            style={{ background: 'var(--ica-c-soft)', color: 'var(--ica-c-ink)' }}
          >
            {missing === 0 ? t('¡Listo!') : tn(missing, t('Te falta {n}'), t('Te faltan {n}'))}
          </span>
        </div>
        <p className='m-0 mt-1 text-sm font-extrabold'>{t('palabras activadas')}</p>
        <GameProgress
          className='mt-3'
          value={shown / FLASHCARDS_MIN_ACTIVATED_WORDS}
          color='var(--ica-c)'
          height={16}
          label={t('{n} de {total} palabras activadas', { n: shown, total: FLASHCARDS_MIN_ACTIVATED_WORDS })}
        />
      </Panel>

      {/* Cómo se activa una palabra */}
      <div
        className='flex w-full items-center gap-3 rounded-3xl px-4 py-3 text-left'
        style={{ background: 'var(--ica-c-soft)' }}
      >
        <PhaseLetter letter='C' size={40} />
        <p className='m-0 text-sm font-semibold text-muted-foreground'>
          <b className='font-extrabold' style={{ color: 'var(--ica-c-ink)' }}>
            {t('¿Cómo se activa?')}
          </b>{' '}
          {t('Una palabra se activa cuando la usas en una frase de Creación (la C del ciclo).')}
        </p>
      </div>

      <div className='flex w-full flex-col gap-3'>
        <Button asChild size='xl' variant='c' className='w-full'>
          <Link to={DASHBOARD_ROUTES.activationPhrase}>{t('Crear una frase')}</Link>
        </Button>
        <Button asChild size='xl' variant='outline' className='w-full'>
          <Link to={DASHBOARD_ROUTES.home}>{t('Volver al inicio')}</Link>
        </Button>
      </div>
    </GamePage>
  )
}

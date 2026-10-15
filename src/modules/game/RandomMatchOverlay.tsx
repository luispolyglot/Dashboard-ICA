import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, Loader2Icon, ShuffleIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'
import { ModeGlyphBadge, type ChallengeModeTile } from '../components/IcaChallenges/ChallengeModePicker'
import { FichaIcon, SwordsIcon } from './icons'
import { FlagInitial } from './ranking'
import { LanguageFlag } from '../components/LanguagePicker'
import { EXTRA_CHALLENGE_COST } from './rules'

export type RandomMatchState =
  | { phase: 'searching' }
  | {
      phase: 'found'
      rivalName: string
      /** The flag each one bought and shows in the profile (null = none: just the initial). */
      myFlag: string | null
      rivalFlag: string | null
      /** The language each one plays in: a small flag next to the name. */
      myLang: string | null
      rivalLang: string | null
      tile: ChallengeModeTile | null
      modeName: string
      /** Same language: they play with words from both vaults. */
      sharedVault: boolean
      languageLabel: string
      status: 'sending' | 'sent'
    }
  /** You already have 3: pay «Un desafío más» right here and the challenge goes on (Luis, 15 Oct). */
  | { phase: 'needsPass'; balance: number | null; buying: boolean }
  | { phase: 'error'; message: string }

/** How long «Buscando rival…» stays at least, so it feels like a search (Luis, 15 Oct: 3-4 s). */
export const RANDOM_SEARCH_MS = 3400

/**
 * Like in the profile and the ranking (Luis, 15 Oct): the initial on the flag you bought, or just the
 * initial when you have none, so the bought flag stays special. No random colours.
 */
function Avatar({ name, flag }: { name: string; flag: string | null }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  return (
    <span className='rounded-full p-1' style={{ background: 'var(--border)', boxShadow: '0 5px 0 var(--border)' }}>
      {flag ? (
        <FlagInitial initial={initial} flag={flag} size={80} />
      ) : (
        <span
          className='flex size-20 items-center justify-center rounded-full text-3xl font-black'
          style={{ background: 'var(--muted)' }}
          aria-hidden='true'
        >
          {initial}
        </span>
      )}
    </span>
  )
}

/** The name with the flag of the language that person plays in (same flags = «Por idioma»). */
function NameWithLanguage({ name, language }: { name: string; language: string | null }) {
  return (
    <span className='flex max-w-28 items-center gap-1.5 text-sm font-extrabold'>
      {language ? <LanguageFlag language={language} size={18} /> : null}
      <span className='truncate'>{name}</span>
    </span>
  )
}

/**
 * DESAFÍO ALEATORIO (Luis, 15 Oct), like the matchmaking of a mobile game: a full screen that
 * searches for 3-4 s (names going by), then «¡Rival encontrado!» with the mode the app chose,
 * and the challenge is sent by itself. The person does not choose anything.
 */
export function RandomMatchOverlay({
  state,
  myName,
  onClose,
  onBuyPass,
}: {
  state: RandomMatchState
  myName: string
  onClose: () => void
  onBuyPass?: () => void
}) {
  useEffect(() => {
    if (typeof document === 'undefined') return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role='dialog'
      aria-modal='true'
      aria-label={t('Desafío aleatorio')}
      className='fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)] animate-in fade-in-0'
    >
      <div className='flex justify-end px-3 pt-3'>
        <button
          type='button'
          onClick={onClose}
          aria-label={t('Cerrar')}
          className='ica-press flex size-11 items-center justify-center rounded-full border-2 border-border bg-card text-muted-foreground'
        >
          <XIcon className='size-5' strokeWidth={2.8} aria-hidden='true' />
        </button>
      </div>

      <div className='flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] text-center'>
        {state.phase === 'searching' ? (
          <>
            <div className='relative flex size-56 items-center justify-center' aria-hidden='true'>
              <span className='absolute inset-0 animate-ping rounded-full opacity-25' style={{ background: 'var(--ica-a)' }} />
              <span
                className='absolute inset-6 animate-ping rounded-full opacity-30 [animation-delay:400ms]'
                style={{ background: 'var(--ica-a)' }}
              />
              <span
                className='relative flex size-40 items-center justify-center rounded-full border-4'
                style={{ background: 'var(--ica-a-soft)', borderColor: 'var(--ica-a)' }}
              >
                <img src='/guia-ica.png' alt='' draggable={false} className='ica-bob size-28 select-none object-contain' />
              </span>
            </div>
            <div className='flex flex-col items-center gap-2' role='status'>
              {/* No names here: who it is shows on the next screen (Luis, 15 Oct). */}
              <p className='m-0 font-display text-3xl font-black tracking-tight'>{t('Buscando rival…')}</p>
              <p className='m-0 max-w-xs text-sm font-semibold text-muted-foreground'>
                {t('Entre los icademers que han entrado en los últimos 30 días.')}
              </p>
            </div>
            <Button type='button' variant='outline' size='lg' className='w-full max-w-xs' onClick={onClose}>
              {t('Cancelar')}
            </Button>
          </>
        ) : state.phase === 'found' ? (
          <>
            <p className='m-0 text-sm font-black tracking-[0.12em] uppercase' style={{ color: 'var(--ica-gold-ink)' }}>
              {t('¡Rival encontrado!')}
            </p>
            <div className='ica-pop flex items-center gap-4'>
              <div className='flex flex-col items-center gap-2'>
                <Avatar name={myName} flag={state.myFlag} />
                <NameWithLanguage name={t('Tú')} language={state.myLang} />
              </div>
              {/* The swords in the middle bounce slowly (Luis, 15 Oct). */}
              <span
                className='ica-bob flex size-14 items-center justify-center rounded-full'
                style={{ background: 'var(--ica-gold)', boxShadow: '0 4px 0 var(--ica-gold-edge)', animationDuration: '2.4s' }}
                aria-hidden='true'
              >
                <SwordsIcon size={34} />
              </span>
              <div className='flex flex-col items-center gap-2'>
                <Avatar name={state.rivalName} flag={state.rivalFlag} />
                <NameWithLanguage name={state.rivalName} language={state.rivalLang} />
              </div>
            </div>
            <h1 className='m-0 font-display text-3xl font-black tracking-tight text-balance'>
              {t('¡A jugar con {name}!', { name: state.rivalName })}
            </h1>

            <div className='flex w-full max-w-sm flex-col gap-3 text-left'>
              <div className='ica-panel flex items-center gap-3 p-3'>
                {state.tile ? <ModeGlyphBadge tile={state.tile} /> : null}
                <div className='min-w-0'>
                  <p className='m-0 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>
                    {t('Modo elegido al azar')}
                  </p>
                  <p className='m-0 text-lg font-black'>{state.modeName}</p>
                </div>
              </div>
              <div
                className='flex items-start gap-3 rounded-2xl border-2 px-4 py-3'
                style={
                  state.sharedVault
                    ? { borderColor: 'var(--ica-i)', background: 'var(--ica-i-soft)', color: 'var(--ica-i-ink)' }
                    : { borderColor: 'var(--border)' }
                }
              >
                <ShuffleIcon className='mt-0.5 size-5 shrink-0' strokeWidth={2.4} aria-hidden='true' />
                <p className='m-0 text-sm font-bold'>
                  {state.sharedVault
                    ? t('{name} también aprende {lang}: comparten Baúl ICA, con palabras de los dos.', {
                        name: state.rivalName,
                        lang: state.languageLabel,
                      })
                    : t('Cada uno jugará con sus propias palabras ICA.')}
                </p>
              </div>
            </div>

            <p className='m-0 flex items-center gap-2 text-sm font-extrabold text-muted-foreground' role='status'>
              {state.status === 'sent' ? (
                <>
                  <CheckIcon className='size-4' strokeWidth={3} style={{ color: 'var(--ica-ok)' }} aria-hidden='true' />
                  {t('Reto enviado. Te avisamos cuando lo acepte.')}
                </>
              ) : (
                t('Enviando el reto…')
              )}
            </p>
            <Button
              type='button'
              variant='a'
              size='xl'
              className='w-full max-w-sm'
              disabled={state.status !== 'sent'}
              onClick={onClose}
            >
              {t('¡Genial!')}
            </Button>
          </>
        ) : state.phase === 'needsPass' ? (
          <>
            <img src='/guia-ica.png' alt='' aria-hidden='true' draggable={false} className='ica-bob size-32 select-none object-contain' />
            <div className='flex max-w-sm flex-col gap-2'>
              <p className='m-0 font-display text-2xl font-black tracking-tight'>{t('Ya tienes 3 desafíos en marcha')}</p>
              <p className='m-0 text-base font-semibold text-muted-foreground'>
                {t('Con «Un desafío más» puedes retar a alguien más ahora mismo.')}
              </p>
            </div>
            <div className='flex w-full max-w-xs flex-col gap-2'>
              <Button
                type='button'
                variant='gold'
                size='xl'
                disabled={state.buying || (state.balance !== null && state.balance < EXTRA_CHALLENGE_COST)}
                onClick={onBuyPass}
              >
                {state.buying ? <Loader2Icon className='animate-spin' aria-hidden='true' /> : <FichaIcon size={24} />}
                {t('Retar por {n} ICA Coins', { n: EXTRA_CHALLENGE_COST })}
              </Button>
              {state.balance !== null && state.balance < EXTRA_CHALLENGE_COST ? (
                <p className='m-0 text-sm font-bold' style={{ color: 'var(--ica-gold-ink)' }}>
                  {t('Tienes {n} ICA Coins: aún no te llega.', { n: state.balance })}
                </p>
              ) : null}
              <Button type='button' variant='outline' size='lg' onClick={onClose}>
                {t('Ahora no')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <img src='/guia-ica.png' alt='' aria-hidden='true' draggable={false} className='size-32 select-none object-contain opacity-80' />
            <p className='m-0 max-w-sm text-lg font-extrabold'>{state.message}</p>
            <div className='flex w-full max-w-xs flex-col gap-2'>
              <Button type='button' variant='outline' size='lg' onClick={onClose}>
                {t('Cerrar')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

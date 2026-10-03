import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/auth/AuthContext'
import { t } from '@/i18n'
import { useDashboardContext } from '../context/DashboardContext'
import { DASHBOARD_ROUTES } from '../routes/paths'
import {
  ICA_CHALLENGE_MIN_WORDS_TO_JOIN,
  upsertMyIcaChallengeEnrollment,
} from '../services/icaChallenges'
import { SwordsIcon } from './icons'

const STORAGE_PREFIX = 'ica-challenges-unlock-v1'

function readFlag(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeFlag(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

/**
 * DESAFÍOS DESBLOQUEADOS: cuando un idioma llega a 20 palabras en el Baúl ICA, se activan
 * los Desafíos ICA de ese idioma y sale una celebración que lleva a ellos.
 *
 * Solo salta si antes se vio el idioma por debajo de 20 (así no aparece a quien ya las tenía).
 * Se espera un momento a que el número sea estable (al cambiar de idioma las palabras se recargan).
 */
export function ChallengesUnlockWatcher() {
  const { cards, config, loading } = useDashboardContext()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const targetLang = config?.targetLang
  const nativeLang = config?.nativeLang
  const wordCount = cards.length
  const userId = user?.id

  useEffect(() => {
    if (loading || !userId || !targetLang || !nativeLang) return
    const timer = window.setTimeout(() => {
      const key = `${STORAGE_PREFIX}:${userId}:${targetLang}|${nativeLang}`
      const flag = readFlag(key)
      if (wordCount < ICA_CHALLENGE_MIN_WORDS_TO_JOIN) {
        if (flag !== 'pending') writeFlag(key, 'pending')
        return
      }
      if (flag === 'pending') {
        writeFlag(key, 'shown')
        setOpen(true)
        // Se activan solos: ya puede retar y que le reten.
        void upsertMyIcaChallengeEnrollment({ targetLang, nativeLang, isActive: true }).catch(() => undefined)
      } else if (!flag) {
        writeFlag(key, 'shown')
      }
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [loading, nativeLang, targetLang, userId, wordCount])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      void confetti({ particleCount: 120, spread: 160, startVelocity: 26, ticks: 260, origin: { x: 0.5, y: 0.35 }, zIndex: 1300 })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [open])

  if (!open) return null

  return (
    <div
      className='fixed inset-0 z-[110] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center'
      role='dialog'
      aria-modal='true'
      aria-label={t('Desafíos ICA desbloqueados')}
    >
      <div className='ica-sheet-up w-full max-w-md rounded-t-[28px] bg-background px-5 pt-8 pb-[max(env(safe-area-inset-bottom),1.25rem)] text-center shadow-2xl sm:rounded-[28px]'>
        <div className='relative mx-auto size-32'>
          <span className='ica-glow-pulse absolute inset-0 rounded-full' style={{ background: 'var(--ica-a-soft)' }} aria-hidden='true' />
          <span className='ica-pop relative flex size-32 items-center justify-center rounded-full' style={{ background: 'var(--ica-a-soft)' }}>
            <SwordsIcon size={78} className='ica-wiggle' />
          </span>
        </div>
        <p className='ica-fade-up m-0 mt-4 text-xs font-black tracking-[0.12em] uppercase' style={{ color: 'var(--ica-a-ink)' }}>
          {t('{n} palabras en tu Baúl ICA', { n: ICA_CHALLENGE_MIN_WORDS_TO_JOIN })}
        </p>
        <h2 className='ica-fade-up m-0 mt-1 font-display text-2xl leading-tight font-extrabold tracking-tight'>
          {t('¡Ya puedes participar en los Desafíos ICA!')}
        </h2>
        <p className='ica-fade-up m-0 mt-2 text-sm font-semibold text-muted-foreground'>
          {t('Los hemos activado por ti: reta a otros icademers con tus palabras y que te reten.')}
        </p>
        <div className='mt-6 flex flex-col gap-2'>
          <Button
            type='button'
            size='xl'
            variant='a'
            className='w-full'
            onClick={() => {
              setOpen(false)
              navigate(DASHBOARD_ROUTES.challengesIca)
            }}
          >
            {t('Ir a los Desafíos ICA')}
          </Button>
          <Button type='button' variant='ghost' className='w-full' onClick={() => setOpen(false)}>
            {t('Más tarde')}
          </Button>
        </div>
      </div>
    </div>
  )
}

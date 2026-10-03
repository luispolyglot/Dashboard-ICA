import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { t, langName } from '@/i18n'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TrophyIcon } from '../game/icons'
import { Pill } from '../game/ui'
import { IcaTestGlyph } from './IcaTestParts'
import { useIcaTestsOverview } from '../hooks/useIcaTestsOverview'
import { getIcaTestMonthLabel } from '../services/icaTests'
import { getIcaTestMonthRoute } from '../routes/paths'
import type { AppConfig, Lexicard } from '../types'

type IcaTestsAvailableModalProps = {
  config: AppConfig | null
  cards: Lexicard[]
}

export function IcaTestsAvailableModal({
  config,
  cards,
}: IcaTestsAvailableModalProps) {
  const [open, setOpen] = useState(false)
  const isDev = import.meta.env.DEV

  const {
    currentMonthCode,
    currentMonthDate,
    hasCurrentMonthTest,
    windowOpen,
    canTakeCurrentMonth,
  } = useIcaTestsOverview({
    targetLang: config?.targetLang,
    nativeLang: config?.nativeLang,
    cards,
  })

  const dismissKey = useMemo(
    () => `ica_tests_launch_modal_seen_${currentMonthCode}`,
    [currentMonthCode],
  )

  const markDismissedForCurrentMonth = () => {
    window.localStorage.setItem(dismissKey, currentMonthCode)
  }

  useEffect(() => {
    if (isDev) {
      console.info('[ica-tests-modal] evaluate', {
        route: window.location.pathname,
        currentMonthCode,
        currentMonthDate,
        windowOpen,
        canTakeCurrentMonth,
        hasCurrentMonthTest,
        hasConfig: Boolean(config),
      })
    }

    if (!config) {
      if (isDev) {
        console.info('[ica-tests-modal] closed: missing config')
      }
      setOpen(false)
      return
    }

    if (!windowOpen || hasCurrentMonthTest || !canTakeCurrentMonth) {
      if (isDev) {
        console.info('[ica-tests-modal] closed by conditions', {
          windowOpen,
          hasCurrentMonthTest,
          canTakeCurrentMonth,
        })
      }
      setOpen(false)
      return
    }

    const dismissed = window.localStorage.getItem(dismissKey) === currentMonthCode
    if (isDev) {
      console.info('[ica-tests-modal] dismiss state', {
        dismissKey,
        localValue: window.localStorage.getItem(dismissKey),
        expected: currentMonthCode,
        dismissed,
      })
    }
    setOpen(!dismissed)
  }, [
    canTakeCurrentMonth,
    config,
    currentMonthCode,
    currentMonthDate,
    dismissKey,
    hasCurrentMonthTest,
    isDev,
    windowOpen,
  ])

  if (!config) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          if (isDev) {
            console.info('[ica-tests-modal] dismissed via onOpenChange')
          }
          markDismissedForCurrentMonth()
        }
        setOpen(nextOpen)
      }}
    >
      <DialogContent className='gap-5 sm:max-w-md'>
        <div className='-mx-5 -mt-5 flex flex-col items-center gap-2 rounded-t-3xl px-5 pt-7 pb-5 text-center' style={{ background: 'var(--ica-c-soft)' }}>
          <span className='ica-bob'>
            <IcaTestGlyph size={72} />
          </span>
          <Pill tone='ok' solid>
            {t('Ya disponible')}
          </Pill>
        </div>
        <DialogHeader className='items-center text-center'>
          <DialogTitle className='pr-0 text-2xl'>{t('Test ICA disponible')}</DialogTitle>
          <DialogDescription>
            {t('El test de')}{' '}
            <b className='font-extrabold text-foreground'>
              {getIcaTestMonthLabel(currentMonthDate)}
            </b>{' '}
            {t('ya está habilitado para {pair}.', { pair: `${langName(config.nativeLang)} → ${langName(config.targetLang)}` })}
            <br />
            {t('Puedes hacerlo ahora o más tarde desde la sección Perfil.')}
          </DialogDescription>
        </DialogHeader>
        <div
          className='flex items-center gap-3 rounded-2xl border-2 px-3.5 py-3'
          style={{
            background: 'var(--ica-gold-soft)',
            borderColor: 'color-mix(in oklab, var(--ica-gold) 45%, transparent)',
          }}
        >
          <TrophyIcon size={34} />
          <p className='m-0 text-sm font-bold' style={{ color: 'var(--ica-gold-ink)' }}>
            <strong className='font-black'>{t('Importante:')}</strong>{' '}
            {t('el Test ICA suma puntos para el ranking del mes y cada respuesta correcta vale 0,1 puntos.')}
          </p>
        </div>
        <div className='flex flex-col gap-2'>
          <Button type='button' size='xl' variant='c' className='w-full' asChild>
            <Link
              to={getIcaTestMonthRoute(currentMonthCode)}
              onClick={() => {
                if (isDev) {
                  console.info('[ica-tests-modal] navigate to current month test')
                }
                markDismissedForCurrentMonth()
                setOpen(false)
              }}
            >
              {t('Ir al test')}
            </Link>
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='lg'
            className='w-full text-muted-foreground'
            onClick={() => {
              if (isDev) {
                console.info('[ica-tests-modal] dismissed via more-later')
              }
              markDismissedForCurrentMonth()
              setOpen(false)
            }}
          >
            {t('Más tarde')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

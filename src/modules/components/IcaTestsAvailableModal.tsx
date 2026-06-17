import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Test ICA disponible</DialogTitle>
          <DialogDescription>
            El test de{' '}
            <span className='capitalize'>
              {getIcaTestMonthLabel(currentMonthDate)}
            </span>{' '}
            ya está habilitado para {config.nativeLang} -&gt; {config.targetLang}.
            <br />
            Puedes hacerlo ahora o más tarde desde la sección Perfil.
          </DialogDescription>
          <div className='rounded-lg border border-amber-300/70 bg-amber-50/60 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100'>
            <strong>⚠️ IMPORTANTE</strong>
            <ul className='mt-2 list-inside list-disc'>
              <li>
                El ICA Test suma puntos para el leaderboard mensual y cada
                respuesta correcta vale 0,1 puntos.
              </li>
            </ul>
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => {
              if (isDev) {
                console.info('[ica-tests-modal] dismissed via more-later')
              }
              markDismissedForCurrentMonth()
              setOpen(false)
            }}
          >
            Más tarde
          </Button>
          <Button type='button' asChild>
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
              Ir al test
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

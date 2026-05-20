import { ClipboardCheckIcon, PlayIcon, RotateCcwIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useIcaTestsOverview } from '../hooks/useIcaTestsOverview'
import { DASHBOARD_ROUTES, getIcaTestMonthRoute } from '../routes/paths'
import {
  getIcaTestWindowStartDay,
  getIcaTestMonthLabel,
  ICA_TEST_REQUIRED_WORDS,
} from '../services/icaTests'
import type { Lexicard } from '../types'

type IcaTestsViewProps = {
  targetLang: string
  nativeLang: string
  cards: Lexicard[]
}

export function IcaTestsView({
  targetLang,
  nativeLang,
  cards,
}: IcaTestsViewProps) {
  const windowStartDay = getIcaTestWindowStartDay()
  const {
    tests,
    isLoading,
    error,
    currentMonthCode,
    currentMonthDate,
    hasCurrentMonthTest,
    canTakeCurrentMonth,
    featureAvailable,
    windowOpen,
    wordPool,
  } = useIcaTestsOverview({
    targetLang,
    nativeLang,
    cards,
  })

  const nextTestRoute = getIcaTestMonthRoute(currentMonthCode)

  return (
    <section className='mx-auto w-full max-w-5xl flex-1 p-4 pb-24 lg:pb-4'>
      <div className='mb-6 flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h2 className='font-serif text-3xl font-bold'>Tests ICA</h2>
          <p className='text-sm text-muted-foreground'>
            Evalúa tu vocabulario mensual con 15 equivalencias en modo
            contrarreloj.
          </p>
        </div>
      </div>

      {!featureAvailable && (
        <Card>
          <CardHeader>
            <CardTitle>Tests aún no habilitados</CardTitle>
            <CardDescription>
              Los Tests ICA están disponibles desde mayo de 2026.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {featureAvailable && (
        <div className='flex flex-col gap-4'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <ClipboardCheckIcon className='h-4 w-4' />
                Test del mes actual ({getIcaTestMonthLabel(currentMonthDate)})
              </CardTitle>
              <CardDescription>
                Disponible entre los días {windowStartDay} y 28. Cada pregunta
                tiene 6 segundos.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3 text-sm'>
              <p className='text-muted-foreground'>
                Idioma activo: {nativeLang} -&gt; {targetLang}
              </p>

              {!windowOpen && (
                <p className='text-amber-600'>
                  Fuera de ventana mensual. Vuelve entre los días{' '}
                  {windowStartDay} y 28.
                </p>
              )}

              {!hasCurrentMonthTest && !wordPool.eligible && (
                <p className='text-amber-600'>
                  Necesitas {ICA_TEST_REQUIRED_WORDS} palabras ICA entre este
                  mes y el anterior. Ahora hay {wordPool.availableWords}.
                </p>
              )}

              {hasCurrentMonthTest && (
                <p className='text-emerald-600'>
                  Ya completaste este test. Puedes rehacerlo sin cambiar el
                  resultado original.
                </p>
              )}

              <div className='flex flex-wrap gap-2'>
                {canTakeCurrentMonth ? (
                  <Button type='button' asChild>
                    <Link to={nextTestRoute}>
                      <PlayIcon data-icon='inline-start' />
                      Hacer test del mes
                    </Link>
                  </Button>
                ) : (
                  <Button type='button' disabled>
                    <PlayIcon data-icon='inline-start' />
                    Hacer test del mes
                  </Button>
                )}
                {hasCurrentMonthTest && (
                  <Button type='button' variant='outline' asChild>
                    <Link to={getIcaTestMonthRoute(currentMonthCode, true)}>
                      <RotateCcwIcon data-icon='inline-start' />
                      Rehacer test del mes
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {isLoading && (
            <p className='text-sm text-muted-foreground'>
              Cargando histórico de tests...
            </p>
          )}
          {error && <p className='text-sm text-destructive'>{error}</p>}

          {!isLoading && !error && tests.length === 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Aún no tienes Tests ICA guardados</CardTitle>
                <CardDescription>
                  Cuando completes uno, aparecerá aquí con tu puntaje y acceso a
                  rehacer.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button type='button' variant='outline' asChild>
                  <Link to={DASHBOARD_ROUTES.profile}>Volver al perfil</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {!isLoading && tests.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Histórico</CardTitle>
                <CardDescription>
                  Revisa resultados por mes y rehace cualquier intento sin
                  guardar cambios.
                </CardDescription>
              </CardHeader>
              <CardContent className='flex flex-col gap-3'>
                {tests.map((test) => (
                  <div
                    key={test.id}
                    className='flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3'
                  >
                    <div>
                      <p className='font-medium capitalize'>
                        {getIcaTestMonthLabel(test.testMonth)}
                      </p>
                      <p className='text-sm text-muted-foreground'>
                        {test.status === 'failed'
                          ? 'Estado: fallido'
                          : `Puntaje ${test.score}/${test.totalQuestions}`}{' '}
                        - Finalizado el{' '}
                        {test.finalizedAt
                          ? new Date(test.finalizedAt).toLocaleString()
                          : 'sin fecha'}
                      </p>
                    </div>
                    <Button type='button' variant='outline' asChild>
                      <Link to={getIcaTestMonthRoute(test.monthCode, true)}>
                        <RotateCcwIcon data-icon='inline-start' />
                        Rehacer
                      </Link>
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </section>
  )
}

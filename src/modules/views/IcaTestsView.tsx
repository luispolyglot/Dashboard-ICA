import { ArrowRightIcon, CalendarClockIcon, LockIcon, PlayIcon, RotateCcwIcon, SparklesIcon, TimerIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { t, tn, langName, uiLocale, getUiLang } from '@/i18n'
import { TrophyIcon } from '../game/icons'
import { EmptyState, GamePage, GameProgress, PageTitle, Pill, SectionLabel, StatTile } from '../game/ui'
import { IcaTestGlyph, ScoreBadge } from '../components/IcaTestParts'
import { LanguageFlag } from '../components/LanguagePicker'
import { useIcaTestsOverview } from '../hooks/useIcaTestsOverview'
import { DASHBOARD_ROUTES, getIcaTestMonthRoute } from '../routes/paths'
import {
  getIcaTestWindowStartDay,
  getIcaTestMonthLabel,
  ICA_TEST_MAX_WORDS_PER_ITEM,
  ICA_TEST_REQUIRED_WORDS,
  ICA_TEST_SECONDS_PER_QUESTION,
  ICA_TEST_TOTAL_QUESTIONS,
} from '../services/icaTests'
import type { Lexicard } from '../types'

type IcaTestsViewProps = {
  targetLang: string
  nativeLang: string
  cards: Lexicard[]
}

function formatShortDate(value: Date): string {
  return new Intl.DateTimeFormat(uiLocale(), { day: 'numeric', month: 'short' }).format(value)
}

function formatPoints(value: number): string {
  return new Intl.NumberFormat(uiLocale(), { maximumFractionDigits: 1 }).format(value)
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * TESTS ICA: el test del mes en grande (disponible, hecho o bloqueado),
 * tus números y la lista de meses con su nota.
 */
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
    currentMonthTest,
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
  const monthName = capitalize(getIcaTestMonthLabel(currentMonthDate))
  const completedTests = tests.filter((test) => test.status === 'completed')
  const bestTest = completedTests.reduce<(typeof tests)[number] | null>(
    (best, test) => (!best || test.score / test.totalQuestions > best.score / best.totalQuestions ? test : best),
    null,
  )
  const totalPoints = completedTests.reduce((sum, test) => sum + test.score / 10, 0)

  // Estado del test de este mes (lo que dice la pastilla)
  const currentStatus = hasCurrentMonthTest
    ? currentMonthTest?.status === 'failed'
      ? { label: t('Cerrado'), tone: 'bad' as const }
      : { label: t('Hecho'), tone: 'ok' as const }
    : !windowOpen
      ? { label: t('Bloqueado'), tone: 'neutral' as const }
      : !wordPool.eligible
        ? { label: t('Faltan palabras'), tone: 'gold' as const }
        : { label: t('Disponible'), tone: 'ok' as const }

  return (
    <GamePage>
      <PageTitle
        icon={<IcaTestGlyph size={44} />}
        subtitle={t('{n} preguntas contrarreloj con tus palabras ICA.', { n: ICA_TEST_TOTAL_QUESTIONS })}
      >
        {t('Tests ICA')}
      </PageTitle>

      {!featureAvailable && (
        <div className='ica-panel'>
          <EmptyState
            icon={<IcaTestGlyph size={64} />}
            title={t('Tests aún no habilitados')}
            text={t('Los Tests ICA están disponibles desde mayo de 2026.')}
          />
        </div>
      )}

      {featureAvailable && (
        <>
          {/* El test de este mes */}
          <div className='ica-panel overflow-hidden'>
            <div className='flex items-center gap-4 px-5 pt-5 pb-4' style={{ background: 'var(--ica-c-soft)' }}>
              <span className={canTakeCurrentMonth ? 'ica-bob' : undefined}>
                <IcaTestGlyph size={64} />
              </span>
              <div className='min-w-0 flex-1'>
                <p className='m-0 text-xs font-extrabold tracking-[0.08em] uppercase' style={{ color: 'var(--ica-c-ink)' }}>
                  {t('Test del mes')}
                </p>
                <p className='m-0 font-display text-2xl leading-tight font-extrabold tracking-tight' style={{ color: 'var(--ica-c-ink)' }}>
                  {monthName}
                </p>
                <Pill tone={currentStatus.tone} solid className='mt-1.5'>
                  {currentStatus.label}
                </Pill>
              </div>
              {hasCurrentMonthTest && currentMonthTest ? (
                <ScoreBadge
                  score={currentMonthTest.score}
                  total={currentMonthTest.totalQuestions}
                  failed={currentMonthTest.status === 'failed'}
                  size={68}
                />
              ) : null}
            </div>

            <div className='flex flex-col gap-4 px-5 pt-4 pb-5'>
              {/* Reglas en pastillas */}
              <div className='flex flex-wrap gap-2'>
                <span className='inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-extrabold'>
                  <IcaTestGlyph size={16} />
                  {t('{n} preguntas', { n: ICA_TEST_TOTAL_QUESTIONS })}
                </span>
                <span className='inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-extrabold'>
                  <TimerIcon className='size-4' strokeWidth={2.6} style={{ color: 'var(--ica-a)' }} aria-hidden='true' />
                  {t('{n} s cada una', { n: ICA_TEST_SECONDS_PER_QUESTION })}
                </span>
                <span className='inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-extrabold'>
                  <CalendarClockIcon className='size-4' strokeWidth={2.6} style={{ color: 'var(--ica-i)' }} aria-hidden='true' />
                  {t('Del {start} al 28', { start: windowStartDay })}
                </span>
              </div>

              <p className='m-0 flex items-center gap-2 text-sm font-semibold text-muted-foreground'>
                <LanguageFlag language={nativeLang} size={24} />
                <ArrowRightIcon className='size-4' strokeWidth={2.6} aria-hidden='true' />
                <LanguageFlag language={targetLang} size={24} />
                <span>
                  <b className='font-extrabold text-foreground'>{langName(targetLang)}</b> {t('desde {lang}', { lang: getUiLang() === 'en' ? langName(nativeLang) : nativeLang.toLowerCase() })}
                </span>
              </p>

              {!windowOpen && !hasCurrentMonthTest && (
                <p className='m-0 flex items-start gap-2 rounded-2xl bg-muted px-3 py-2.5 text-sm font-bold'>
                  <LockIcon className='mt-0.5 size-4 shrink-0 text-muted-foreground' strokeWidth={2.6} aria-hidden='true' />
                  {t('Fuera de la ventana del mes. Vuelve entre los días {start} y 28.', { start: windowStartDay })}
                </p>
              )}

              {!hasCurrentMonthTest && !wordPool.eligible && (
                <div className='rounded-2xl px-3.5 py-3' style={{ background: 'var(--ica-gold-soft)' }}>
                  <div className='mb-1.5 flex items-baseline justify-between gap-2'>
                    <span className='text-sm font-extrabold' style={{ color: 'var(--ica-gold-ink)' }}>
                      {t('Palabras ICA para el test')}
                    </span>
                    <span className='text-sm font-black tabular-nums' style={{ color: 'var(--ica-gold-ink)' }}>
                      {wordPool.availableWords}/{ICA_TEST_REQUIRED_WORDS}
                    </span>
                  </div>
                  <GameProgress
                    value={wordPool.availableWords / ICA_TEST_REQUIRED_WORDS}
                    color='var(--ica-gold)'
                    height={12}
                  />
                  <p className='m-0 mt-2 text-xs font-semibold text-muted-foreground'>
                    {t('Necesitas {required} palabras ICA para armar el test. Priorizamos frases de hasta {max} palabras y, si no alcanza, ampliamos el filtro.', {
                      required: ICA_TEST_REQUIRED_WORDS,
                      max: ICA_TEST_MAX_WORDS_PER_ITEM,
                    })}
                  </p>
                </div>
              )}

              {hasCurrentMonthTest && (
                <p className='m-0 text-sm font-bold' style={{ color: 'var(--ica-ok-ink)' }}>
                  {t('Ya completaste este test. Puedes reintentarlo sin cambiar el resultado original.')}
                </p>
              )}

              <div className='flex flex-col gap-2'>
                {canTakeCurrentMonth ? (
                  <Button type='button' size='xl' variant='c' className='w-full' asChild>
                    <Link to={nextTestRoute}>
                      <PlayIcon data-icon='inline-start' className='size-5' strokeWidth={2.6} />
                      {t('Hacer test del mes')}
                    </Link>
                  </Button>
                ) : !hasCurrentMonthTest ? (
                  <Button type='button' size='xl' variant='outline' className='w-full' disabled>
                    <LockIcon data-icon='inline-start' className='size-5' strokeWidth={2.6} />
                    {t('Hacer test del mes')}
                  </Button>
                ) : null}
                {hasCurrentMonthTest && (
                  <Button type='button' size='xl' variant='outline' className='w-full' asChild>
                    <Link to={getIcaTestMonthRoute(currentMonthCode, true)}>
                      <RotateCcwIcon data-icon='inline-start' className='size-5' strokeWidth={2.6} />
                      {t('Reintentar test del mes')}
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Tus números */}
          {completedTests.length > 0 ? (
            <div className='grid grid-cols-3 gap-2'>
              <StatTile
                className='flex-col items-start gap-1.5 px-3'
                icon={<IcaTestGlyph size={26} />}
                value={completedTests.length}
                label={tn(completedTests.length, 'test hecho', 'tests hechos')}
                tone='c'
              />
              <StatTile
                className='flex-col items-start gap-1.5 px-3'
                icon={<TrophyIcon size={26} />}
                value={bestTest ? `${bestTest.score}/${bestTest.totalQuestions}` : '–'}
                label={t('mejor nota')}
                tone='gold'
              />
              <StatTile
                className='flex-col items-start gap-1.5 px-3'
                icon={<SparklesIcon className='size-[26px]' strokeWidth={2.4} style={{ color: 'var(--ica-ok)' }} aria-hidden='true' />}
                value={formatPoints(totalPoints)}
                label={t('puntos ganados')}
                tone='ok'
              />
            </div>
          ) : null}

          {isLoading && (
            <div className='flex flex-col gap-2' aria-label={t('Cargando histórico de tests...')}>
              {[0, 1].map((index) => (
                <div key={index} className='h-20 animate-pulse rounded-3xl bg-muted/70' />
              ))}
            </div>
          )}
          {error && (
            <p className='m-0 text-sm font-bold' style={{ color: 'var(--ica-bad-ink)' }}>
              {error}
            </p>
          )}

          {!isLoading && !error && tests.length === 0 && (
            <div className='ica-panel'>
              <EmptyState
                icon={<IcaTestGlyph size={56} />}
                title={t('Aún no tienes Tests ICA guardados')}
                text={t('Cuando completes uno, aparecerá aquí con tu nota y podrás reintentarlo.')}
                action={
                  <Button type='button' variant='outline' size='lg' asChild>
                    <Link to={DASHBOARD_ROUTES.profile}>{t('Volver al perfil')}</Link>
                  </Button>
                }
              />
            </div>
          )}

          {!isLoading && tests.length > 0 && (
            <div>
              <SectionLabel>{t('Tus meses')}</SectionLabel>
              <p className='-mt-1 mb-3 text-xs font-semibold text-muted-foreground'>
                {t('Reintenta cuando quieras:')} <b className='text-foreground'>{t('el resultado original no cambia')}</b>.
              </p>
              <div className='flex flex-col gap-3'>
                {tests.map((test) => {
                  const failed = test.status === 'failed'
                  const running = test.status === 'running'
                  return (
                    <div key={test.id} className='ica-panel flex items-center gap-3 px-3.5 py-3'>
                      <ScoreBadge score={test.score} total={test.totalQuestions} failed={failed} size={58} />
                      <div className='min-w-0 flex-1'>
                        <p className='m-0 truncate text-base leading-tight font-extrabold'>
                          {capitalize(getIcaTestMonthLabel(test.testMonth))}
                        </p>
                        <div className='mt-1 flex flex-wrap items-center gap-1.5'>
                          <Pill tone={failed ? 'bad' : running ? 'gold' : 'ok'}>
                            {failed ? t('Fallido') : running ? t('En curso') : t('Hecho')}
                          </Pill>
                          <span className='text-xs font-semibold text-muted-foreground'>
                            {test.finalizedAt ? formatShortDate(new Date(test.finalizedAt)) : t('sin fecha')}
                          </span>
                        </div>
                        <span className='sr-only'>
                          {failed ? t('Estado: fallido') : t('Puntuación {score}/{total}', { score: test.score, total: test.totalQuestions })}
                        </span>
                      </div>
                      <Button type='button' variant='outline' size='lg' className='shrink-0 px-3' asChild>
                        <Link to={getIcaTestMonthRoute(test.monthCode, true)} aria-label={t('Reintentar {month}', { month: getIcaTestMonthLabel(test.testMonth) })}>
                          <RotateCcwIcon className='size-5' strokeWidth={2.6} />
                          <span className='hidden sm:inline'>{t('Reintentar')}</span>
                        </Link>
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </GamePage>
  )
}

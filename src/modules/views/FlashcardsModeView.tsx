import { LockIcon, PlayIcon, RotateCcwIcon } from 'lucide-react'
import { GOAL, REVIEW_MODE_OPTIONS, REVIEW_ROUND_SIZE } from '../constants'
import { useDashboardContext } from '../context/DashboardContext'
import { ReviewPlayStyleControl } from '../components/ReviewPlayStyleControl'
import { longestStreak } from '../game/achievements'
import { FrequencyGlyph, modeColors } from '../game/flashcardsUi'
import { CardsIcon } from '../game/icons'
import {
  EmptyState,
  GamePage,
  GameProgress,
  HeroBlock,
  IconTile,
  PageTitle,
  Panel,
  SectionLabel,
  StatTile,
} from '../game/ui'
import { getReviewModeMinimumWords } from '../review/playStyle'
import type { ReviewPlayStyle } from '../review/playStyle'
import { getStreak } from '../utils'
import type { Lexicard, ReviewMode } from '../types'
import { t, tn } from '@/i18n'

type FlashcardsModeViewProps = {
  cards: Lexicard[]
  reviewCorrectToday: number
  playStyle: ReviewPlayStyle
  pendingOnly: boolean
  confirmBeforeAnswer: boolean
  onPlayStyleChange: (style: ReviewPlayStyle) => void
  onPendingOnlyChange: (pendingOnly: boolean) => void
  onConfirmBeforeAnswerChange: (confirmBeforeAnswer: boolean) => void
  onStartMode: (mode: ReviewMode) => void
}

/**
 * FLASHCARDS: la racha y la meta de hoy arriba, y los modos de repaso en tarjetas grandes
 * (aleatorio y una por frecuencia). Las que aún no tienen palabras suficientes salen con candado.
 */
export function FlashcardsModeView({
  cards,
  reviewCorrectToday,
  playStyle,
  pendingOnly,
  confirmBeforeAnswer,
  onPlayStyleChange,
  onPendingOnlyChange,
  onConfirmBeforeAnswerChange,
  onStartMode,
}: FlashcardsModeViewProps) {
  const { completedDays } = useDashboardContext()
  const isGoalStyle = playStyle === 'goal'
  const pendingCards = cards.filter((card) => (card.streak || 0) === 0)
  const availableCards = pendingOnly ? pendingCards : cards
  const minWordsByMode = getReviewModeMinimumWords(playStyle)

  // Racha de flashcards (días con la meta de 10 acertadas) y meta de hoy.
  const days: string[] = completedDays || []
  const flashStreak = getStreak(days)
  const bestStreak = Math.max(flashStreak, longestStreak(days))
  const correctToday = Math.max(0, reviewCorrectToday)
  const goalDone = correctToday >= GOAL
  const missingToday = Math.max(GOAL - correctToday, 0)

  const countsByMode: Record<ReviewMode, number> = {
    mixed: availableCards.length,
    vital: availableCards.filter((card) => card.importance === 'vital').length,
    frequent: availableCards.filter((card) => card.importance === 'frequent')
      .length,
    occasional: availableCards.filter(
      (card) => card.importance === 'occasional',
    ).length,
    rare: availableCards.filter((card) => card.importance === 'rare').length,
    irrelevant: availableCards.filter(
      (card) => card.importance === 'irrelevant',
    ).length,
  }

  const intro = isGoalStyle
    ? pendingOnly
      ? t('Usa solo tus tarjetas no aprendidas o falladas y termina al llegar a 10 correctas.')
      : t('Usa todas tus tarjetas disponibles y termina al llegar a 10 correctas.')
    : pendingOnly
      ? tn(
          REVIEW_ROUND_SIZE,
          'Juega con tus tarjetas no aprendidas o falladas en una ronda de {n} flashcard.',
          'Juega con tus tarjetas no aprendidas o falladas en una ronda de {n} flashcards.',
        )
      : tn(
          REVIEW_ROUND_SIZE,
          'Juega con tus palabras ICA en una ronda de {n} flashcard.',
          'Juega con tus palabras ICA en una ronda de {n} flashcards.',
        )

  return (
    <GamePage wide className='lg:max-w-4xl'>
      <PageTitle
        subtitle={intro}
        right={
          <ReviewPlayStyleControl
            playStyle={playStyle}
            pendingOnly={pendingOnly}
            pendingCount={pendingCards.length}
            confirmBeforeAnswer={confirmBeforeAnswer}
            onPlayStyleChange={onPlayStyleChange}
            onPendingOnlyChange={onPendingOnlyChange}
            onConfirmBeforeAnswerChange={onConfirmBeforeAnswerChange}
          />
        }
      >
        Flashcards
      </PageTitle>

      <div className='grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-4'>
        {/* Racha de flashcards y meta de hoy */}
        <HeroBlock
          tone={goalDone ? 'fire' : 'primary'}
          icon={<CardsIcon size={64} className={goalDone ? undefined : 'ica-bob'} />}
          eyebrow={t('Racha de flashcards')}
          title={
            <span className='flex items-baseline gap-2'>
              <span className='text-5xl leading-none font-black tabular-nums'>{flashStreak}</span>
              <span className='text-lg font-extrabold'>{flashStreak === 1 ? t('día') : t('días')}</span>
            </span>
          }
          text={tn(bestStreak, 'Tu mejor racha: {n} día', 'Tu mejor racha: {n} días')}
        >
          <div className='mb-1.5 flex items-center justify-between gap-2 text-sm font-extrabold'>
            <span>{goalDone ? t('¡Meta de hoy cumplida!') : t('Meta de hoy')}</span>
            <span className='tabular-nums'>
              {Math.min(correctToday, GOAL)} / {GOAL}
            </span>
          </div>
          <GameProgress
            value={correctToday / GOAL}
            color={goalDone ? 'var(--ica-fire)' : 'var(--primary)'}
            height={16}
            className='bg-card'
            label={t('Meta de hoy de flashcards')}
          />
          <p className='m-0 mt-2 text-xs font-bold text-muted-foreground'>
            {goalDone
              ? t('Ya sumaste el día a tu racha. Puedes seguir repasando.')
              : tn(
                  missingToday,
                  'Acierta {n} flashcard más hoy para sumar un día.',
                  'Acierta {n} flashcards más hoy para sumar un día.',
                )}
          </p>
        </HeroBlock>

        {/* Tus palabras */}
        <div className='grid grid-cols-2 gap-3 lg:grid-cols-1'>
          <StatTile
            icon={<CardsIcon size={34} />}
            value={cards.length}
            label={cards.length === 1 ? t('palabra ICA') : t('palabras ICA')}
            tone='primary'
            className='lg:py-4'
          />
          <StatTile
            icon={
              <IconTile tone='bad' size={36} className='rounded-xl'>
                <RotateCcwIcon className='size-5' strokeWidth={2.6} />
              </IconTile>
            }
            value={pendingCards.length}
            label={t('por aprender')}
            tone='bad'
            className='lg:py-4'
          />
        </div>
      </div>

      {/* Sin palabras: el aviso va antes de los modos bloqueados */}
      {availableCards.length === 0 && (
        <EmptyState
          icon={<CardsIcon size={56} />}
          title={pendingOnly ? t('¡Nada pendiente!') : t('Aún no tienes palabras')}
          text={
            pendingOnly
              ? t('No tienes tarjetas no aprendidas o falladas en este momento.')
              : t('Añade palabras ICA para desbloquear las rondas.')
          }
        />
      )}

      <div>
        <SectionLabel>{t('Elige cómo repasar')}</SectionLabel>
        <div className='grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4'>
          {REVIEW_MODE_OPTIONS.map((mode) => {
            const count = countsByMode[mode.key]
            const minimumRequired = isGoalStyle
              ? minWordsByMode
              : mode.key === 'mixed' && !pendingOnly
                ? 1
                : minWordsByMode
            const disabled = count < minimumRequired
            const missing = Math.max(minimumRequired - count, 0)
            const colors = modeColors(mode.key)
            const isMixed = mode.key === 'mixed'
            const modeTitle = t(mode.title)
            const unitLiteral = pendingOnly ? t('por aprender') : count === 1 ? t('palabra') : t('palabras')
            const scope = isMixed
              ? pendingOnly
                ? t('tarjetas no aprendidas o falladas totales')
                : t('palabras ICA totales')
              : pendingOnly
                ? t('tarjetas no aprendidas o falladas de esta frecuencia')
                : t('palabras ICA de esta frecuencia')
            const ariaLabel = disabled
              ? t('{mode}: necesitas {min} {scope}. Tienes {count} ({missing} más).', {
                  mode: modeTitle,
                  min: minimumRequired,
                  scope,
                  count,
                  missing,
                })
              : pendingOnly
                ? tn(
                    count,
                    'Jugar {mode}: {n} palabra no aprendidas o falladas',
                    'Jugar {mode}: {n} palabras no aprendidas o falladas',
                    { mode: modeTitle },
                  )
                : tn(count, 'Jugar {mode}: {n} palabra ICA', 'Jugar {mode}: {n} palabras ICA', { mode: modeTitle })

            return (
              <Panel
                key={mode.key}
                as='button'
                onClick={() => !disabled && onStartMode(mode.key)}
                disabled={disabled}
                ariaLabel={ariaLabel}
                className='relative flex min-h-48 flex-col gap-1 p-4 disabled:cursor-not-allowed disabled:opacity-100 lg:min-h-52 lg:p-5'
                style={
                  disabled
                    ? { background: 'var(--muted)', boxShadow: 'none' }
                    : {
                        // Cada modo, su tarjeta de color bien delimitada
                        background: colors.soft,
                        borderColor: `color-mix(in oklab, ${colors.solid} 55%, transparent)`,
                        boxShadow: `0 4px 0 color-mix(in oklab, ${colors.solid} 55%, transparent)`,
                      }
                }
              >
                <span className='mb-2 flex items-start justify-between gap-2'>
                  <span
                    className='flex size-14 items-center justify-center rounded-2xl'
                    style={{
                      background: 'var(--card)',
                      opacity: disabled ? 0.8 : 1,
                    }}
                  >
                    {mode.key === 'mixed' ? (
                      <CardsIcon size={36} />
                    ) : (
                      <FrequencyGlyph importance={mode.key} size={32} />
                    )}
                  </span>
                  {disabled ? (
                    <span className='flex size-8 items-center justify-center rounded-full bg-card text-muted-foreground'>
                      <LockIcon className='size-4' strokeWidth={2.6} aria-hidden='true' />
                    </span>
                  ) : (
                    <span
                      className='flex size-9 items-center justify-center rounded-full text-white'
                      style={{ background: colors.solid, boxShadow: `0 3px 0 ${colors.edge}` }}
                      aria-hidden='true'
                    >
                      <PlayIcon className='ml-0.5 size-4' strokeWidth={3} fill='currentColor' />
                    </span>
                  )}
                </span>

                <span className='block font-display text-lg leading-tight font-extrabold tracking-tight'>
                  {modeTitle}
                </span>

                <span className='mt-auto block pt-2'>
                  {disabled ? (
                    <>
                      <GameProgress
                        value={minimumRequired > 0 ? count / minimumRequired : 0}
                        color={colors.solid}
                        height={10}
                        className='bg-card'
                      />
                      <span className='mt-1.5 block text-xs leading-snug font-bold text-muted-foreground'>
                        {count}/{minimumRequired} ·{' '}
                        {pendingOnly
                          ? tn(missing, 'te falta {n} por aprender', 'te faltan {n} por aprender')
                          : tn(missing, 'te falta {n} palabra', 'te faltan {n} palabras')}
                      </span>
                    </>
                  ) : (
                    <span className='flex items-baseline gap-1.5'>
                      <span className='text-3xl leading-none font-black tabular-nums' style={{ color: colors.ink }}>
                        {count}
                      </span>
                      <span className='text-xs font-extrabold text-muted-foreground'>{unitLiteral}</span>
                    </span>
                  )}
                </span>
              </Panel>
            )
          })}
        </div>
      </div>

    </GamePage>
  )
}

import { useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ChevronDownIcon, StoreIcon } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/utils'
import { DASHBOARD_ROUTES } from '../routes/paths'
import {
  buyChallengeSlot,
  buyPhaseBoost,
  challengeWinCoinsThisWeek,
  coinsText,
  fichasFormatter,
  nextCoinProgress,
  unusedChallengeSlots,
  useFichas,
  type FichaPreviewEntry,
} from '../game/fichas'
import { ChestIcon, FichaIcon, FlameIcon, PhaseBoostGlyph, PregunticaExtraGlyph, SwordsIcon, TrophyIcon } from '../game/icons'
import { LIMIT_LABELS, useDailyLimits } from '../game/limits'
import {
  CHALLENGE_WIN_REWARD,
  CHALLENGE_WIN_WEEKLY_CAP,
  COIN_WALLET_CAP,
  COIN_WALLET_WARN,
  CYCLE_CHEST_MAX,
  CYCLE_CHEST_MIN,
  FLASH_STREAK_MILESTONES,
  STREAK_MILESTONES,
  DAILY_LIMITS,
  EXTRA_CHALLENGE_COST,
  LIMIT_PHASE,
  PHASE_BOOST_COST,
  PHASE_BOOST_MULTIPLIER,
  PREGUNTICA_EXTRA_COST,
  RANKING_POINTS_PER_COIN,
  type DailyLimitKey,
} from '../game/rules'
import { gameSfx } from '../game/sfx'
import { StreakMilestones } from '../game/StreakExtras'
import { getIcaStreakState } from '../game/streak'
import { useDashboardContext } from '../context/DashboardContext'
import { getStreak } from '../utils'
import { getTodayProgress } from '../constants'
import { t } from '@/i18n'

const LIMIT_ROWS: Array<{ key: DailyLimitKey; letter: 'I' | 'C' | 'A'; color: string; soft: string }> = [
  { key: 'words', letter: 'I', color: 'var(--ica-i)', soft: 'var(--ica-i-soft)' },
  { key: 'phrases', letter: 'C', color: 'var(--ica-c)', soft: 'var(--ica-c-soft)' },
  { key: 'activations', letter: 'A', color: 'var(--ica-a)', soft: 'var(--ica-a-soft)' },
]

function entryLabel(entry: FichaPreviewEntry): string {
  if (entry.type === 'cycle_chest') return entry.rolled ? t('Cofre del ciclo (hucha llena)') : t('Cofre del ciclo')
  if (entry.type === 'streak_milestone') return t('Hito de racha ICA: {milestoneDays} días', { milestoneDays: entry.milestoneDays })
  if (entry.type === 'flash_milestone') return t('Hito de racha de flashcards: {milestoneDays} días', { milestoneDays: entry.milestoneDays })
  if (entry.type === 'challenge_win') return entry.delta > 0 ? t('Desafío ICA ganado') : t('Desafío ICA ganado (tope alcanzado)')
  if (entry.type === 'challenge_slot') return entry.used ? t('Desafío extra (usado)') : t('Desafío extra')
  if (entry.type === 'phase_boost' && entry.phase) return t('Ampliar {phase}', { phase: t(LIMIT_PHASE[entry.phase].name) })
  return t('Día ampliado')
}

/**
 * Botón de precio: la moneda y lo que cuesta (o el estado si ya está hecho). Al pasar el ratón
 * (o al llegar con el teclado) se ilumina en dorado, sube un poco, la moneda gira y lo cruza un
 * brillo: clase `ica-price` en index.css.
 */
function PriceButton({
  cost,
  onClick,
  disabled,
  confirming,
  doneLabel,
}: {
  cost: number
  onClick: () => void
  disabled?: boolean
  confirming?: boolean
  doneLabel?: string
}) {
  if (doneLabel) {
    return (
      <span
        className='shrink-0 rounded-2xl px-3 py-2 text-sm font-extrabold'
        style={{ background: 'var(--ica-ok-soft)', color: 'var(--ica-ok-ink)' }}
      >
        {doneLabel}
      </span>
    )
  }
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border-2 px-3 text-base font-extrabold tabular-nums transition-transform active:translate-y-[3px] disabled:opacity-50',
        confirming ? 'border-transparent text-white' : 'ica-price border-border',
      )}
      style={
        confirming
          ? { background: 'var(--ica-ok)', boxShadow: '0 3px 0 var(--ica-ok-edge)' }
          : { boxShadow: '0 3px 0 var(--border)', color: 'var(--ica-gold-ink)' }
      }
      aria-label={confirming ? t('Confirmar') : t('Cuesta {coins}', { coins: coinsText(cost) })}
    >
      {confirming ? (
        t('Confirmar')
      ) : (
        <>
          <span className='ica-price-coin inline-flex'>
            <FichaIcon size={20} />
          </span>{' '}
          {cost}
        </>
      )}
    </button>
  )
}

function Row({
  icon,
  title,
  text,
  right,
  onClick,
}: {
  icon: ReactNode
  title: string
  text: ReactNode
  right: ReactNode
  onClick?: () => void
}) {
  const content = (
    <>
      <span className='flex size-12 shrink-0 items-center justify-center rounded-2xl'>{icon}</span>
      <span className='min-w-0 flex-1'>
        <span className='block font-extrabold'>{title}</span>
        <span className='block text-xs font-semibold text-muted-foreground'>{text}</span>
      </span>
      {right}
    </>
  )
  if (onClick) {
    return (
      <button type='button' onClick={onClick} className='flex w-full items-center gap-3 py-3 text-left'>
        {content}
      </button>
    )
  }
  return <div className='flex items-center gap-3 py-3'>{content}</div>
}

/** Fila que se despliega aquí mismo para ver el detalle. */
function ExpandRow({
  open,
  onToggle,
  icon,
  title,
  text,
  children,
}: {
  open: boolean
  onToggle: () => void
  icon: ReactNode
  title: string
  text: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      <button type='button' onClick={onToggle} aria-expanded={open} className='flex w-full items-center gap-3 py-3 text-left'>
        <span className='flex size-12 shrink-0 items-center justify-center rounded-2xl'>{icon}</span>
        <span className='min-w-0 flex-1'>
          <span className='block font-extrabold'>{title}</span>
          <span className='block text-xs font-semibold text-muted-foreground'>{text}</span>
        </span>
        <ChevronDownIcon
          className={cn('size-5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden='true'
        />
      </button>
      {open ? <div className='ica-pop pb-4'>{children}</div> : null}
    </div>
  )
}

/**
 * ICA COINS: tu saldo, en qué se gastan (desafío extra, ampliar Inmersión, Creación o
 * Activación, PreguntICA extra)
 * y cómo se consiguen (cofre, hitos de racha ICA y de flashcards, ranking del mes).
 */
export function FichasView() {
  const [showAllMoves, setShowAllMoves] = useState(false)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { total, realBalance, entries } = useFichas(user?.id)
  const { limits, used, boosted } = useDailyLimits()
  const [confirming, setConfirming] = useState<DailyLimitKey | 'challenge' | null>(null)
  const [openRow, setOpenRow] = useState<'ica' | 'flash' | 'ranking' | null>(null)
  const { completedDays, creationDays, savedCreationDays, creationSavesUsedThisMonth, creationSavesLimit, dailyProgress } =
    useDashboardContext()
  const icaStreak = getIcaStreakState({
    creationDays,
    savedCreationDays,
    creationSavesUsedThisMonth,
    creationSavesLimit,
    todayProgress: getTodayProgress(dailyProgress),
  }).streak
  const flashStreak = getStreak(completedDays)
  const balance = total ?? 0
  const slots = unusedChallengeSlots(entries)
  const progress = nextCoinProgress(realBalance)
  const winCoinsThisWeek = challengeWinCoinsThisWeek(entries)
  const walletPercent = Math.min(100, (balance / COIN_WALLET_CAP) * 100)

  // «Ampliar» una fase solo hoy: primer toque pide confirmar, el segundo compra.
  const tryBoost = (kind: DailyLimitKey) => {
    const phase = t(LIMIT_PHASE[kind].name)
    if (confirming !== kind) {
      if (balance < PHASE_BOOST_COST) {
        toast.error(
          t('Necesitas {n} para ampliar {phase} (tienes {balance}).', { n: coinsText(PHASE_BOOST_COST), phase, balance }),
        )
        return
      }
      setConfirming(kind)
      return
    }
    setConfirming(null)
    if (buyPhaseBoost(user?.id, kind, balance)) {
      gameSfx.celebrate()
      toast.success(t('{phase} ampliada hoy', { phase }), {
        description: t('Hoy puedes llegar a {n} {what}.', {
          n: DAILY_LIMITS[kind] * PHASE_BOOST_MULTIPLIER,
          what: t(LIMIT_LABELS[kind].many),
        }),
      })
    }
  }

  const tryChallenge = () => {
    if (confirming !== 'challenge') {
      if (balance < EXTRA_CHALLENGE_COST) {
        toast.error(t('Necesitas {n} para un desafío extra (tienes {balance}).', { n: coinsText(EXTRA_CHALLENGE_COST), balance }))
        return
      }
      setConfirming('challenge')
      return
    }
    setConfirming(null)
    if (buyChallengeSlot(user?.id, balance)) {
      gameSfx.celebrate()
      toast.success(t('Desafío extra listo'), {
        description: t('Úsalo en Desafíos ICA para retar o aceptar a una 4.ª persona.'),
      })
    }
  }

  return (
    <section className='mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 pt-2 pb-28 lg:py-8'>
      <h1 className='m-0 font-display tracking-tight text-2xl leading-tight font-extrabold lg:text-3xl'>{t('ICA Coins')}</h1>

      {/* Saldo */}
      <div className='-mt-2 flex items-center gap-4 rounded-3xl px-5 py-4' style={{ background: 'var(--ica-gold-soft)' }}>
        <FichaIcon size={64} />
        <div className='min-w-0'>
          <p className='m-0 text-5xl leading-none font-black tabular-nums' style={{ color: 'var(--ica-gold-ink)' }}>
            {total === null ? '–' : fichasFormatter.format(total)}
          </p>
          <p className='m-0 mt-1 text-sm font-extrabold' style={{ color: 'var(--ica-gold-ink)' }}>
            {total === 1 ? t('ICA Coin') : t('ICA Coins')}
          </p>
          <p className='m-0 text-xs font-semibold text-muted-foreground'>{t('Se ganan cumpliendo el método y se gastan en ventajas.')}</p>
        </div>
      </div>

      {/* Hucha: como mucho COIN_WALLET_CAP */}
      <div className='-mt-3 px-1'>
        <div className='mb-1 flex items-center justify-between gap-2 text-xs font-bold'>
          <span className='text-muted-foreground'>{t('Tu hucha')}</span>
          <span className='tabular-nums' style={{ color: 'var(--ica-gold-ink)' }}>
            {t('{n} de {max}', { n: balance, max: COIN_WALLET_CAP })}
          </span>
        </div>
        <div className='h-2.5 overflow-hidden rounded-full bg-muted'>
          <span
            className='block h-full rounded-full transition-[width] duration-500'
            style={{ width: `${walletPercent}%`, background: 'var(--ica-gold)' }}
          />
        </div>
        <p
          className='m-0 mt-1 text-xs font-semibold'
          style={{ color: balance >= COIN_WALLET_WARN ? 'var(--ica-gold-ink)' : 'var(--muted-foreground)' }}
        >
          {balance >= COIN_WALLET_CAP
            ? t('Hucha llena: el cofre y los desafíos no suman hasta que gastes alguna.')
            : balance >= COIN_WALLET_WARN
              ? t('Casi llena: por encima de {max}, el cofre y los desafíos ya no suman.', { max: COIN_WALLET_CAP })
              : t('Puedes guardar hasta {max} ICA Coins.', { max: COIN_WALLET_CAP })}
        </p>
      </div>

      {/* En qué se gastan */}
      <div>
        <p className='mb-2 flex items-center gap-2 text-base font-black'>
          <span
            className='flex size-8 items-center justify-center rounded-xl'
            style={{ background: 'var(--ica-gold)', color: '#4a3200', boxShadow: '0 3px 0 var(--ica-gold-edge)' }}
          >
            <StoreIcon className='size-4.5' strokeWidth={2.6} aria-hidden='true' />
          </span>
          {t('Tienda')}
        </p>
        <div className='ica-group divide-y-2 divide-border'>
          <Row
            icon={
              <span className='flex size-12 items-center justify-center rounded-2xl' style={{ background: 'var(--ica-a-soft)' }}>
                <SwordsIcon size={30} />
              </span>
            }
            title={t('Desafío extra')}
            text={
              slots > 0
                ? t('Tienes {slots} sin usar. Sirve para retar o aceptar a una 4.ª persona.', { slots })
                : t('Con 3 desafíos en curso, reta o acepta el reto de una 4.ª persona.')
            }
            right={<PriceButton cost={EXTRA_CHALLENGE_COST} onClick={tryChallenge} confirming={confirming === 'challenge'} />}
          />
          {LIMIT_ROWS.map((row) => (
            <Row
              key={row.key}
              icon={
                <span className='flex size-12 items-center justify-center rounded-2xl' style={{ background: row.soft }}>
                  <PhaseBoostGlyph letter={row.letter} size={32} />
                </span>
              }
              title={t('Ampliar {phase} hoy', { phase: t(LIMIT_PHASE[row.key].name) })}
              text={t('Solo hoy: {n} {what} en vez de {base}.', {
                n: DAILY_LIMITS[row.key] * PHASE_BOOST_MULTIPLIER,
                base: DAILY_LIMITS[row.key],
                what: t(LIMIT_LABELS[row.key].many),
              })}
              right={
                <PriceButton
                  cost={PHASE_BOOST_COST}
                  onClick={() => tryBoost(row.key)}
                  confirming={confirming === row.key}
                  doneLabel={boosted[row.key] ? t('Activo hoy') : undefined}
                />
              }
            />
          ))}
          <Row
            icon={
              <span className='flex size-12 items-center justify-center rounded-2xl' style={{ background: 'var(--ica-a-soft)' }}>
                <PregunticaExtraGlyph size={30} />
              </span>
            }
            title={t('Intento extra de PreguntICA')}
            text={t('Una PreguntICA más esta semana, aunque no hayas activado las 20 palabras.')}
            right={
              <PriceButton
                cost={PREGUNTICA_EXTRA_COST}
                onClick={() => navigate(`${DASHBOARD_ROUTES.preguntica}?extra=1`)}
              />
            }
          />
        </div>
        {confirming ? (
          <p className='mt-1 text-xs font-semibold text-muted-foreground'>
            {t('Toca «Confirmar» para gastar {coins}.', {
              coins: coinsText(confirming === 'challenge' ? EXTRA_CHALLENGE_COST : PHASE_BOOST_COST),
            })}
          </p>
        ) : null}
      </div>

      {/* Límites de hoy */}
      <div>
        <div className='mb-2 flex items-center justify-between gap-2'>
          <p className='m-0 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>{t('Tus límites de hoy')}</p>

        </div>
        <div className='flex flex-col gap-3'>
          {LIMIT_ROWS.map((row) => {
            const value = used[row.key]
            const max = limits[row.key]
            return (
              <div key={row.key} className='flex items-center gap-3'>
                <span
                  className='flex size-9 shrink-0 items-center justify-center rounded-xl font-ica text-lg font-extrabold text-white'
                  style={{ background: row.color }}
                >
                  {row.letter}
                </span>
                <div className='min-w-0 flex-1'>
                  <div className='mb-1 flex justify-between text-sm font-bold'>
                    <span className='flex items-center gap-1.5'>
                      {t(LIMIT_LABELS[row.key].many)}
                      {boosted[row.key] ? (
                        <span
                          className='rounded-full px-1.5 text-[11px] font-black text-white'
                          style={{ background: row.color }}
                        >
                          ×{PHASE_BOOST_MULTIPLIER} {t('hoy')}
                        </span>
                      ) : null}
                    </span>
                    <span className='tabular-nums text-muted-foreground'>
                      {value} / {max}
                    </span>
                  </div>
                  <div className='h-3 overflow-hidden rounded-full bg-muted'>
                    <span
                      className='block h-full rounded-full transition-[width] duration-500'
                      style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: row.color }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Cómo se consiguen */}
      <div>
        <p className='mb-1 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>{t('Cómo se consiguen')}</p>
        <div className='ica-group divide-y-2 divide-border'>
          <Row
            icon={<ChestIcon size={44} state='ready' />}
            title={t('Cofre del ciclo')}
            text={t('Cada día que completas I·C·A.')}
            right={
              <span className='shrink-0 text-base font-extrabold' style={{ color: 'var(--ica-gold-ink)' }}>
                +{CYCLE_CHEST_MIN}–{CYCLE_CHEST_MAX}
              </span>
            }
          />
          <Row
            icon={<SwordsIcon size={38} />}
            title={t('Desafíos ICA')}
            text={t('Cada desafío que ganas, hasta {cap} por semana. Llevas {n}.', {
              cap: CHALLENGE_WIN_WEEKLY_CAP,
              n: winCoinsThisWeek,
            })}
            right={
              <span className='shrink-0 text-base font-extrabold' style={{ color: 'var(--ica-gold-ink)' }}>
                +{CHALLENGE_WIN_REWARD}
              </span>
            }
          />
          {/* Se despliegan aquí mismo (sin salir de la pantalla) */}
          <ExpandRow
            open={openRow === 'ica'}
            onToggle={() => setOpenRow((value) => (value === 'ica' ? null : 'ica'))}
            icon={<FlameIcon size={38} />}
            title={t('Hito de racha ICA')}
            text={t('ICA Coins al llegar a 7, 30, 90, 180 y 360 días.')}
          >
            <StreakMilestones kind='ica' streak={icaStreak} milestones={STREAK_MILESTONES} />
          </ExpandRow>
          <ExpandRow
            open={openRow === 'flash'}
            onToggle={() => setOpenRow((value) => (value === 'flash' ? null : 'flash'))}
            icon={<FlameIcon size={38} tone='flash' />}
            title={t('Hito de racha de flashcards')}
            text={t('ICA Coins al llegar a 7, 30, 90, 180 y 360 días.')}
          >
            <StreakMilestones kind='flashcards' streak={flashStreak} milestones={FLASH_STREAK_MILESTONES} />
          </ExpandRow>
          <ExpandRow
            open={openRow === 'ranking'}
            onToggle={() => setOpenRow((value) => (value === 'ranking' ? null : 'ranking'))}
            icon={<TrophyIcon size={38} />}
            title={t('Ranking del mes')}
            text={t('1 ICA Coin por cada {RANKING_POINTS_PER_COIN} puntos.', { RANKING_POINTS_PER_COIN })}
          >
            <div className='rounded-2xl bg-muted/70 p-3'>
              <p className='m-0 text-sm font-semibold text-muted-foreground'>
                {t('El día 28, al cerrar el ranking, recibes 1 ICA Coin por cada {n} puntos que hayas hecho en el mes. Lo que sobra se guarda para la siguiente.', { n: RANKING_POINTS_PER_COIN })}
              </p>
              <div className='mt-3 flex items-center gap-2'>
                <div className='h-2.5 flex-1 overflow-hidden rounded-full bg-card'>
                  <div className='h-full rounded-full' style={{ width: `${Math.round(progress * 100)}%`, background: 'var(--ica-gold)' }} />
                </div>
                <span className='shrink-0 text-xs font-bold text-muted-foreground'>
                  {t('{n} % de tu próxima', { n: Math.round(progress * 100) })}
                </span>
              </div>
            </div>
          </ExpandRow>
        </div>
      </div>

      {entries.length > 0 ? (
        <div>
          <p className='mb-1 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>{t('Movimientos')}</p>
          <div className='ica-group divide-y-2 divide-border'>
            {/* Los 4 últimos a la vista; el resto, al desplegar. */}
            {[...entries]
              .sort((a, b) => b.createdAt - a.createdAt)
              .slice(0, showAllMoves ? 40 : 4)
              .map((entry) => (
                <div key={entry.id} className='flex items-center justify-between gap-3 py-2.5 text-sm'>
                  <span className='font-bold'>{entryLabel(entry)}</span>
                  <span
                    className='font-extrabold tabular-nums'
                    style={{ color: entry.delta > 0 ? 'var(--ica-ok-ink)' : 'var(--ica-bad-ink)' }}
                  >
                    {entry.delta > 0 ? '+' : ''}
                    {fichasFormatter.format(entry.delta)}
                  </span>
                </div>
              ))}
          </div>
          {entries.length > 4 ? (
            <button
              type='button'
              onClick={() => setShowAllMoves((value) => !value)}
              aria-expanded={showAllMoves}
              className='mt-1 flex w-full items-center justify-center gap-1 rounded-xl py-2 text-sm font-extrabold text-primary hover:bg-muted/60'
            >
              {showAllMoves ? t('Ver menos') : t('Ver todos ({n})', { n: Math.min(entries.length, 40) })}
              <ChevronDownIcon className={`size-4 transition-transform ${showAllMoves ? 'rotate-180' : ''}`} aria-hidden='true' />
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

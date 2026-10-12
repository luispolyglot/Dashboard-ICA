import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDownIcon, PauseIcon, PlayIcon, SquareIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { langName, t } from '@/i18n'
import { HeadphonesGlyph } from '../game/icons'
import { FirstUseTip, useFirstUseTip } from './FirstUseTip'
import { inSentence } from '../services/activationGuide'
import {
  VAULT_LISTEN_COUNTS,
  fetchListenedWordIds,
  pickListeningQueue,
  type VaultListenCount,
  type VaultListenOrder,
} from '../services/vaultListening'
import { useVaultListening } from './VaultListeningProvider'
import type { Lexicard } from '../types'

/**
 * ESCUCHAR MI BAÚL ICA (Luis, 11 Oct; idea de Natalia). Between the filters and the words of Mi
 * Baúl ICA: the words of the current filter one after another, in your language, a pause of 1.5 s,
 * in the one you learn and another pause, to repeat them out loud (shadowing). You choose how many
 * in a row, the speed and whether only the ones you have never heard.
 * The audio itself lives in VaultListeningProvider (the layout), so it keeps playing on other
 * screens, outside the app and with the phone locked.
 */
type Props = {
  /** The words of the current filter, in the order the list shows them. */
  cards: Lexicard[]
  targetLang: string
  nativeLang: string
}

const RATES = [1, 0.75] as const
/** «Empezar ya» appears once this many words are ready and others are still being prepared. */
const START_NOW_MIN_READY = 3

export function VaultListenPlayer({ cards, targetLang, nativeLang }: Props) {
  const listening = useVaultListening()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState<VaultListenCount>(20)
  const [rate, setRate] = useState<(typeof RATES)[number]>(1)
  const [onlyUnheard, setOnlyUnheard] = useState(false)
  const [order, setOrder] = useState<VaultListenOrder>('list')
  const [savedHeardIds, setSavedHeardIds] = useState<Set<string>>(() => new Set())
  // First visit to the Baúl after this arrives (Luis, 11 Oct): a bubble presents it.
  const [tipPending, closeTip] = useFirstUseTip('vault-listen')

  const status = listening?.status ?? 'idle'
  const active = status === 'preparing' || status === 'playing' || status === 'paused'

  useEffect(() => {
    if (!open && !active) return
    let cancelled = false
    void fetchListenedWordIds().then((ids) => {
      if (!cancelled) setSavedHeardIds(ids)
    })
    return () => {
      cancelled = true
    }
  }, [open, active])

  if (!listening) return null

  const heardIds = new Set([...savedHeardIds, ...listening.heardIds])
  const unheardCount = cards.filter((card) => !heardIds.has(card.id)).length
  const preview = pickListeningQueue(cards, { count, onlyUnheard, heardIds })
  // Random: a new draw every time «Escuchar» is pressed (the preview only gives the amount).
  const start = (): void =>
    listening.start(order === 'random' ? pickListeningQueue(cards, { count, onlyUnheard, heardIds, order }) : preview, {
      nativeLang,
      targetLang,
      rate,
    })
  const expanded = open || active || status === 'done' || status === 'error'

  return (
    <div className='ica-panel relative flex flex-col gap-3 p-3'>
      {tipPending && !active ? (
        <FirstUseTip onClose={closeTip} side='bottom'>
          {t('Nuevo: escucha tus palabras seguidas, como una lista de reproducción. Sigue sonando con el móvil bloqueado.')}
        </FirstUseTip>
      ) : null}
      <button
        type='button'
        onClick={() => {
          if (tipPending) closeTip()
          setOpen((value) => !value)
        }}
        aria-expanded={expanded}
        className='flex w-full items-center gap-3 text-left'
      >
        <HeadphonesGlyph size={32} />
        <span className='flex min-w-0 flex-1 flex-col'>
          <span className='text-base font-extrabold'>{t('Escuchar mis palabras')}</span>
          <span className='text-sm font-semibold text-muted-foreground'>
            {t('En {native} y en {target}, con una pausa para repetirlas.', {
              native: inSentence(langName(nativeLang)),
              target: inSentence(langName(targetLang)),
            })}
          </span>
        </span>
        <ChevronDownIcon
          className={cn('size-5 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')}
          strokeWidth={2.6}
          aria-hidden='true'
        />
      </button>

      {!expanded ? null : active ? (
        <ActiveSession />
      ) : (
        <div className='flex flex-col gap-3'>
          {status === 'done' ? (
            <p className='m-0 rounded-xl bg-muted px-3 py-2 text-center text-sm font-extrabold'>
              {t('¡Listo! Has escuchado {n} palabras.', { n: listening.playable.length })}
            </p>
          ) : null}
          {status === 'error' && listening.error ? (
            <p
              className='m-0 rounded-xl px-3 py-2 text-center text-sm font-bold'
              style={{ background: 'var(--ica-bad-soft)', color: 'var(--ica-bad-ink)' }}
            >
              {listening.error}
            </p>
          ) : null}
          <OptionRow label={t('Palabras seguidas')}>
            {VAULT_LISTEN_COUNTS.map((value) => (
              <Chip key={value} active={count === value} onClick={() => setCount(value)}>
                {value}
              </Chip>
            ))}
          </OptionRow>
          <OptionRow label={t('Velocidad')}>
            {RATES.map((value) => (
              <Chip key={value} active={rate === value} onClick={() => setRate(value)}>
                {`x${value}`}
              </Chip>
            ))}
          </OptionRow>
          <OptionRow label={t('Orden')}>
            <Chip active={order === 'list'} onClick={() => setOrder('list')}>
              {t('Como en la lista')}
            </Chip>
            <Chip active={order === 'random'} onClick={() => setOrder('random')}>
              {t('Aleatorio')}
            </Chip>
          </OptionRow>
          <OptionRow label={t('Qué palabras')}>
            <Chip active={!onlyUnheard} onClick={() => setOnlyUnheard(false)}>
              {t('Las de este filtro')}
            </Chip>
            <Chip active={onlyUnheard} onClick={() => setOnlyUnheard(true)}>
              {t('Sin escuchar aún')}
              <span className='tabular-nums opacity-70'>{unheardCount}</span>
            </Chip>
          </OptionRow>
          <Button type='button' size='lg' variant='i' className='w-full' onClick={start} disabled={preview.length === 0}>
            <PlayIcon className='size-5 fill-current' strokeWidth={2.4} aria-hidden='true' />
            {preview.length === 0
              ? t('No hay palabras para escuchar')
              : status === 'done' && onlyUnheard
                ? t('Escuchar las siguientes {n}', { n: preview.length })
                : t('Escuchar {n} palabras', { n: preview.length })}
          </Button>
        </div>
      )}
    </div>
  )
}

/** Preparing or playing: the word on screen, the progress and the controls. */
function ActiveSession() {
  const listening = useVaultListening()
  if (!listening) return null
  const { status } = listening

  if (status === 'preparing') {
    const total = listening.words.length
    const waiting = listening.settledCount < total
    return (
      <div className='flex flex-col items-center gap-3 text-center'>
        <p className='m-0 text-sm font-extrabold tabular-nums'>
          {t('Preparando las voces… {n} de {total}', { n: listening.settledCount, total })}
        </p>
        <ProgressBar value={total > 0 ? listening.settledCount / total : 0} />
        <p className='m-0 text-xs font-semibold text-muted-foreground'>
          {t('Las palabras nuevas tardan un poco la primera vez; después quedan guardadas.')}
        </p>
        <div className='grid w-full grid-cols-2 gap-2'>
          <Button type='button' variant='outline' onClick={listening.stop}>
            <SquareIcon className='size-4 fill-current' strokeWidth={2.4} aria-hidden='true' />
            {t('Parar')}
          </Button>
          <Button
            type='button'
            variant='i'
            onClick={listening.startNow}
            disabled={!waiting || listening.readyCount < START_NOW_MIN_READY}
          >
            <PlayIcon className='size-4 fill-current' strokeWidth={2.4} aria-hidden='true' />
            {t('Empezar ya ({n})', { n: listening.readyCount })}
          </Button>
        </div>
      </div>
    )
  }

  const total = listening.playable.length
  const current = listening.playable[listening.index] ?? null
  const skipped = listening.words.length - total
  return (
    <div className='flex flex-col items-center gap-3 text-center'>
      {current ? (
        <>
          <p className='m-0 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase tabular-nums'>
            {t('Palabra {n} de {total}', { n: listening.index + 1, total })}
          </p>
          <p
            className={cn(
              'm-0 text-lg font-bold transition-opacity',
              listening.phase === 'native' ? 'opacity-100' : 'opacity-50',
            )}
          >
            {current.native}
          </p>
          <p
            className={cn(
              'm-0 font-display text-3xl font-black tracking-tight transition-opacity',
              listening.phase === 'target' ? 'opacity-100' : 'opacity-30',
            )}
          >
            {current.target}
          </p>
        </>
      ) : null}
      <ProgressBar value={total > 0 ? (listening.index + (listening.phase === 'target' ? 0.5 : 0)) / total : 0} />
      <p className='m-0 text-xs font-semibold text-muted-foreground'>
        {t('Puedes bloquear el móvil o ir a otra pantalla: sigue sonando.')}
      </p>
      {skipped > 0 ? (
        <p className='m-0 text-xs font-semibold text-muted-foreground'>
          {listening.dayLimited
            ? t('{n} palabras aún no tienen voz y hoy ya no se pueden preparar: se escucharán mañana.', { n: skipped })
            : t('{n} palabras se escucharán la próxima vez: su voz aún se está preparando.', { n: skipped })}
        </p>
      ) : null}
      <div className='grid w-full grid-cols-2 gap-2'>
        <Button type='button' variant='outline' onClick={listening.stop}>
          <SquareIcon className='size-4 fill-current' strokeWidth={2.4} aria-hidden='true' />
          {t('Parar')}
        </Button>
        {status === 'playing' ? (
          <Button type='button' variant='i' onClick={listening.pause}>
            <PauseIcon className='size-4 fill-current' strokeWidth={2.4} aria-hidden='true' />
            {t('Pausa')}
          </Button>
        ) : (
          <Button type='button' variant='i' onClick={listening.resume}>
            <PlayIcon className='size-4 fill-current' strokeWidth={2.4} aria-hidden='true' />
            {t('Seguir')}
          </Button>
        )}
      </div>
    </div>
  )
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className='h-2 w-full overflow-hidden rounded-full bg-muted'>
      <div
        className='h-full rounded-full transition-[width] duration-300'
        style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, background: 'var(--ica-i)' }}
      />
    </div>
  )
}

function OptionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='flex flex-col gap-1.5'>
      <span className='text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>{label}</span>
      <div className='flex flex-wrap gap-1.5'>{children}</div>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type='button'
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full border-2 px-3 text-sm font-extrabold tabular-nums',
        active ? '' : 'border-border bg-card text-muted-foreground dark:bg-transparent',
      )}
      style={active ? { background: 'var(--ica-i-soft)', borderColor: 'var(--ica-i)', color: 'var(--ica-i-ink)' } : undefined}
    >
      {children}
    </button>
  )
}

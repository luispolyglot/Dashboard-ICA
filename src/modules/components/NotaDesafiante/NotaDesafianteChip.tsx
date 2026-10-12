import { Link } from 'react-router-dom'
import { ChevronRightIcon, LockIcon } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { TargetGlyph } from '../../game/icons'
import {
  CHALLENGE_UNLOCK_RATIO,
  useChallengeUnlock,
} from '../../services/challengeUnlocks'
import { t } from '@/i18n'

type NotaDesafianteChipProps = {
  noteId: string
  noteDurationMs: number
  /** Ruta al detalle de la nota; con ?challenge=1 abre el desafío directamente. */
  noteHref: string
}

const UNLOCK_PERCENT = Math.round(CHALLENGE_UNLOCK_RATIO * 100)

/** Estado de la nota desafiante en la lista de notas maestras. */
export function NotaDesafianteChip({
  noteId,
  noteDurationMs,
  noteHref,
}: NotaDesafianteChipProps) {
  const { user } = useAuth()
  const { progress, unlocked } = useChallengeUnlock(user?.id, noteId, noteDurationMs)

  if (unlocked) {
    // Desbloqueada: botón dorado con canto para jugar ya.
    return (
      <Link
        to={`${noteHref}?challenge=1`}
        className='ica-press inline-flex items-center gap-2 rounded-2xl py-1.5 pr-2.5 pl-1.5 text-sm font-extrabold'
        style={{
          background: 'var(--ica-gold)',
          color: '#3a2a00',
          boxShadow: '0 3px 0 var(--ica-gold-edge)',
        }}
      >
        <span className='flex size-7 items-center justify-center rounded-xl bg-white/85'>
          <TargetGlyph size={20} />
        </span>
        {t('Nota desafiante desbloqueada · Empezar')}
        <ChevronRightIcon className='size-4' strokeWidth={2.8} aria-hidden='true' />
      </Link>
    )
  }

  const listenedPercent = Math.round(progress * UNLOCK_PERCENT)
  // Bloqueada: diana apagada, barra dorada y cuánto llevas escuchado esta semana.
  return (
    <span
      className='flex w-full max-w-sm items-center gap-2 text-xs font-bold text-muted-foreground'
      aria-label={t('Escucha al menos el {pct} % de esta nota para desbloquear su nota desafiante (dura hasta el domingo)', { pct: UNLOCK_PERCENT })}
    >
      <LockIcon className='size-3.5 shrink-0' strokeWidth={2.6} aria-hidden='true' />
      <span className='shrink-0 whitespace-nowrap'>{t('Desafío')}</span>
      <span className='h-2 min-w-8 flex-1 overflow-hidden rounded-full bg-muted' aria-hidden='true'>
        <span
          className='block h-full rounded-full transition-[width] duration-500'
          style={{ width: `${Math.round(progress * 100)}%`, background: 'var(--ica-gold)' }}
        />
      </span>
      <span className='shrink-0 tabular-nums whitespace-nowrap'>
        {t('escuchado {done} % de {pct} %', { done: listenedPercent, pct: UNLOCK_PERCENT })}
      </span>
    </span>
  )
}

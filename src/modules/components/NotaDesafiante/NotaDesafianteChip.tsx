import { Link } from 'react-router-dom'
import { LockIcon } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import {
  CHALLENGE_UNLOCK_RATIO,
  useChallengeUnlock,
} from '../../services/challengeUnlocks'

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
    return (
      <Link
        to={`${noteHref}?challenge=1`}
        className='mt-2 inline-flex items-center gap-1.5 rounded-full border border-sky-400/60 bg-sky-500/15 px-3 py-1 text-xs font-bold text-sky-700 shadow-[0_0_18px_-8px_rgba(56,189,248,0.9)] transition-colors hover:bg-sky-500/25 dark:text-sky-200'
      >
        🎯 Nota desafiante desbloqueada · Empezar
      </Link>
    )
  }

  const listenedPercent = Math.round(progress * UNLOCK_PERCENT)
  return (
    <span
      className='mt-2 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs text-muted-foreground'
      title={`Escucha al menos el ${UNLOCK_PERCENT} % de esta nota hoy para desbloquear su nota desafiante`}
    >
      <LockIcon className='size-3' aria-hidden='true' />
      Nota desafiante · escuchado {listenedPercent} % de {UNLOCK_PERCENT} %
    </span>
  )
}

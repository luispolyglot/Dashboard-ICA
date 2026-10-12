import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { getTodayProgress } from '../constants'
import { useDashboardContext } from '../context/DashboardContext'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { fetchIcademerChatStatus, joinIcademerChat } from '../services/icademerChat'
import { CYCLE_CELEBRATION_CLOSED_EVENT } from './CycleCelebration'
import { ChatBubblesIcon } from './icons'
import { chatLanguageLabel } from './icademerChat'
import { isIcaCycleDone } from './streak'
import { hasSeenChatInvite, markChatInviteSeen } from './useIcademerChat'
import { t } from '@/i18n'

/**
 * Invitación al chat de icademers de tu idioma. Sale UNA sola vez: al cerrar la celebración
 * del cofre el primer día que completas el ciclo ICA (si aún no estás en el chat).
 * Si dices «Ahora no», el chat sigue en Perfil, debajo de Notificaciones.
 */
export function ChatInvite() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { config, dailyProgress } = useDashboardContext()
  const [open, setOpen] = useState(false)
  const [joining, setJoining] = useState(false)
  const targetLang = config?.targetLang ?? ''
  const cycleDone = isIcaCycleDone(getTodayProgress(dailyProgress))

  useEffect(() => {
    if (!user?.id || !targetLang) return
    const onClosed = () => {
      if (!cycleDone || hasSeenChatInvite(user.id, targetLang)) return
      fetchIcademerChatStatus(targetLang)
        .then((status) => {
          if (status.isMember || !status.canJoin) {
            markChatInviteSeen(user.id, targetLang)
            return
          }
          // Un momento después de que se cierre la celebración y vuelen las monedas.
          window.setTimeout(() => setOpen(true), 1400)
        })
        .catch(() => {
          // Sin chat en el servidor: no se invita.
        })
    }
    window.addEventListener(CYCLE_CELEBRATION_CLOSED_EVENT, onClosed)
    return () => window.removeEventListener(CYCLE_CELEBRATION_CLOSED_EVENT, onClosed)
  }, [cycleDone, targetLang, user?.id])

  if (!open) return null
  const language = chatLanguageLabel(targetLang)

  const dismiss = () => {
    markChatInviteSeen(user?.id, targetLang)
    setOpen(false)
  }

  const join = async () => {
    setJoining(true)
    try {
      await joinIcademerChat(targetLang)
      markChatInviteSeen(user?.id, targetLang)
      setOpen(false)
      navigate(DASHBOARD_ROUTES.icademerChat)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('No se pudo conectar con el chat.'))
    } finally {
      setJoining(false)
    }
  }

  return (
    <div
      className='fixed inset-0 z-[110] flex items-end justify-center bg-black/50 sm:items-center'
      role='dialog'
      aria-modal='true'
      aria-labelledby='ica-chat-invite-title'
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss()
      }}
    >
      <div className='ica-sheet-up w-full max-w-md rounded-t-[28px] bg-background px-5 pt-6 pb-[max(env(safe-area-inset-bottom),1.25rem)] text-center shadow-2xl sm:rounded-[28px]'>
        <span
          className='mx-auto flex size-20 items-center justify-center rounded-3xl'
          style={{ background: 'var(--ica-i-soft)' }}
        >
          <ChatBubblesIcon size={52} />
        </span>
        <h2 id='ica-chat-invite-title' className='m-0 mt-4 font-display text-2xl leading-tight font-extrabold tracking-tight text-balance'>
          {t('Únete al grupo de icademers de {lang}', { lang: language })}
        </h2>
        <p className='m-0 mt-2 text-sm font-semibold text-muted-foreground'>
          {t('Saluda, conoce a quien aprende {lang} como tú y queda con otros icademers para ir al Club de DinámICA.', { lang: language })}
        </p>
        <Button type='button' size='xl' className='mt-5 w-full' onClick={() => void join()} disabled={joining}>
          {t('Unirme al chat')}
        </Button>
        <Button type='button' size='xl' variant='outline' className='mt-2 w-full' onClick={dismiss}>
          {t('Ahora no')}
        </Button>
        <p className='m-0 mt-3 text-xs font-semibold text-muted-foreground'>
          {t('Siempre lo tienes en Perfil, debajo de Notificaciones.')}
        </p>
      </div>
    </div>
  )
}

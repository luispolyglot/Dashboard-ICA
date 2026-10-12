import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { t, tn } from '@/i18n'
import { useDashboardContext } from '../context/DashboardContext'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { ChatBubblesIcon } from './icons'
import { useIcademerChatStatus } from './useIcademerChat'

// ACCESO RÁPIDO AL CHAT DE ICADEMERS (Luis, 3 oct: estaba muy escondido).
// En el ordenador va en la barra de arriba; en el móvil, arriba del perfil, junto a idiomas y tema
// (en la barra del móvil no cabe con el logo). El número rojo son los mensajes nuevos.

export function ChatQuickButton({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const { config } = useDashboardContext()
  const targetLang = config?.targetLang ?? null
  const status = useIcademerChatStatus(targetLang)
  if (!targetLang) return null
  const unread = status?.isMember ? status.unread : 0
  const label =
    unread > 0
      ? tn(unread, t('Chat de icademers · {n} mensaje nuevo'), t('Chat de icademers · {n} mensajes nuevos'))
      : t('Chat de icademers')
  return (
    <Link
      to={DASHBOARD_ROUTES.icademerChat}
      onClick={onNavigate}
      aria-label={label}
      className={cn(
        'ica-press relative flex shrink-0 items-center justify-center rounded-2xl border-2 border-border bg-card dark:bg-transparent',
        className,
      )}
      style={{ boxShadow: '0 3px 0 var(--border)' }}
    >
      <ChatBubblesIcon size={26} />
      {unread > 0 ? (
        <span
          className='absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-black text-white tabular-nums'
          style={{ background: 'var(--ica-bad-strong)' }}
          aria-hidden='true'
        >
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </Link>
  )
}

/** Puntito rojo para la pestaña Perfil del móvil cuando hay mensajes nuevos en el chat. */
export function useChatUnread(): number {
  const { config } = useDashboardContext()
  const status = useIcademerChatStatus(config?.targetLang ?? null)
  return status?.isMember ? status.unread : 0
}

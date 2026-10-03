import { ListRow } from './ui'
import { ChatBubblesIcon } from './icons'
import { chatLanguageLabel } from './icademerChat'
import { useIcademerChatStatus } from './useIcademerChat'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { t, tn } from '@/i18n'

/** Fila «Chat de icademers» del perfil (debajo de Notificaciones), con los mensajes nuevos. */
export function ChatProfileRow({ targetLang, onNavigate }: { targetLang: string; onNavigate?: () => void }) {
  const status = useIcademerChatStatus(targetLang)
  const language = chatLanguageLabel(targetLang)
  const unread = status?.isMember ? status.unread : 0
  const text = status?.isMember
    ? tn(status.memberCount, t('Icademers de {lang} · {n} persona', { lang: language }), t('Icademers de {lang} · {n} personas', { lang: language }))
    : t('Únete al grupo de icademers de {lang}', { lang: language })

  return (
    <div onClick={onNavigate}>
      <ListRow
        to={DASHBOARD_ROUTES.icademerChat}
        icon={
          <span className='flex size-[42px] items-center justify-center rounded-2xl' style={{ background: 'var(--ica-i-soft)' }}>
            <ChatBubblesIcon size={28} />
          </span>
        }
        title={t('Chat de icademers')}
        text={text}
        right={
          unread > 0 ? (
            <span
              className='flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-black text-white tabular-nums'
              style={{ background: 'var(--ica-bad-strong)' }}
              aria-label={tn(unread, t('{n} mensaje nuevo'), t('{n} mensajes nuevos'))}
            >
              {unread > 9 ? '9+' : unread}
            </span>
          ) : undefined
        }
      />
    </div>
  )
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { BellIcon, ChevronDownIcon, ClockIcon, GlobeIcon, LogOutIcon, SendIcon, UsersIcon } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDashboardContext } from '../context/DashboardContext'
import { ChatBubblesIcon } from '../game/icons'
import {
  CHAT_MAX_IN_A_ROW,
  CHAT_MESSAGES,
  chatLanguageLabel,
  deviceTimeZone,
  mustWaitForOthers,
  nextQuarter,
  timeInViewerZone,
  zoneCity,
  type ChatMessageKind,
} from '../game/icademerChat'
import { markChatInviteSeen } from '../game/useIcademerChat'
import { enablePushOnCurrentDevice } from '../services/pushNotifications'
import {
  fetchIcademerChat,
  fetchIcademerChatStatus,
  joinIcademerChat,
  leaveIcademerChat,
  sendIcademerChatMessage,
  setIcademerChatNotifications,
  type IcademerChatMessage,
  type IcademerChatStatus,
} from '../services/icademerChat'
import { t, tn, uiLocale } from '@/i18n'

const POLL_MS = 8000
const COMPOSER_OPEN_KEY = 'ica-chat-composer-open-v1'

// Colores para distinguir a la gente (sale siempre el mismo para cada persona).
const SENDER_TONES = [
  'var(--ica-i)',
  'var(--ica-c)',
  'var(--ica-a)',
  'var(--ica-reto, #a259f0)',
  'var(--ica-fire-edge)',
  'var(--ica-gold-edge)',
  'var(--ica-ok)',
]

function toneFor(key: string): string {
  let hash = 0
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) | 0
  return SENDER_TONES[Math.abs(hash) % SENDER_TONES.length]
}

function chatText(kind: ChatMessageKind, time?: string | null): string {
  const item = CHAT_MESSAGES.find((entry) => entry.kind === kind)
  if (!item) return ''
  return kind === 'hora' ? t(item.text, { time: time ?? '' }) : t(item.text)
}

function clockLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' })
}

function readComposerOpen(): boolean {
  try {
    return window.localStorage.getItem(COMPOSER_OPEN_KEY) !== '0'
  } catch {
    return true
  }
}

/** Ventana de abajo (en el móvil) o centrada (en el ordenador) con una pregunta y dos botones. */
function ChatSheet({
  icon,
  title,
  text,
  yes,
  no,
  onYes,
  onNo,
  busy,
  danger,
}: {
  icon: ReactNode
  title: string
  text?: string
  yes: string
  no: string
  onYes: () => void
  onNo: () => void
  busy?: boolean
  danger?: boolean
}) {
  return (
    <div
      className='fixed inset-0 z-[110] flex items-end justify-center bg-black/50 sm:items-center'
      role='dialog'
      aria-modal='true'
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onNo()
      }}
    >
      <div className='ica-sheet-up w-full max-w-md rounded-t-[28px] bg-background px-5 pt-6 pb-[max(env(safe-area-inset-bottom),1.25rem)] text-center shadow-2xl sm:rounded-[28px]'>
        <span className='mx-auto flex size-16 items-center justify-center rounded-3xl' style={{ background: 'var(--ica-i-soft)' }}>
          {icon}
        </span>
        <h2 className='m-0 mt-3 font-display text-xl leading-tight font-extrabold tracking-tight text-balance'>{title}</h2>
        {text ? <p className='m-0 mt-2 text-sm font-semibold text-muted-foreground'>{text}</p> : null}
        <Button
          type='button'
          size='xl'
          className='mt-5 w-full'
          onClick={onYes}
          disabled={busy}
          style={danger ? { background: 'var(--ica-bad-strong)', boxShadow: '0 4px 0 var(--ica-bad-edge)' } : undefined}
        >
          {yes}
        </Button>
        <Button type='button' size='xl' variant='outline' className='mt-2 w-full' onClick={onNo} disabled={busy}>
          {no}
        </Button>
      </div>
    </div>
  )
}

/**
 * CHAT DE ICADEMERS (uno por idioma objetivo). Chat cerrado: solo se pueden mandar los 8
 * mensajes de la lista (y una hora en cuartos). No se ve quién está dentro, solo cuántos son.
 * Como mucho 3 mensajes seguidos. Sirve para quedar en el Club de DinámICA.
 *
 * Horas: quien manda «¿A las…?» elige la hora en SU hora local; se guarda con su zona horaria
 * y cada icademer la ve ya pasada a la suya (con la hora original en pequeño). Las
 * notificaciones también llegan en la hora de cada uno.
 */
export function IcademerChatView() {
  const { user } = useAuth()
  const { config } = useDashboardContext()
  const targetLang = config?.targetLang ?? ''
  const language = chatLanguageLabel(targetLang)
  const viewerZone = useMemo(() => deviceTimeZone(), [])
  const viewerCity = zoneCity(viewerZone)

  const [status, setStatus] = useState<IcademerChatStatus | null>(null)
  const [messages, setMessages] = useState<IcademerChatMessage[]>([])
  const [memberCount, setMemberCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickingTime, setPickingTime] = useState(false)
  const [hour, setHour] = useState(() => nextQuarter(new Date()).slice(0, 2))
  const [minute, setMinute] = useState(() => nextQuarter(new Date()).slice(3))
  const [composerOpen, setComposerOpen] = useState(readComposerOpen)
  const [askNotifications, setAskNotifications] = useState(false)
  const [savingNotifications, setSavingNotifications] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const composerRef = useRef<HTMLDivElement | null>(null)
  const lastIdRef = useRef<string | null>(null)

  const loadChat = useCallback(async () => {
    try {
      const chat = await fetchIcademerChat(targetLang)
      setMessages(chat.messages)
      setMemberCount(chat.memberCount)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('No se pudo conectar con el chat.'))
    }
  }, [targetLang])

  // Estado (¿estás dentro?) y, si lo estás, los mensajes.
  useEffect(() => {
    if (!targetLang) return
    let active = true
    setLoading(true)
    void (async () => {
      try {
        const next = await fetchIcademerChatStatus(targetLang)
        if (!active) return
        setStatus(next)
        setMemberCount(next.memberCount)
        if (next.isMember) {
          markChatInviteSeen(user?.id, targetLang)
          // Aún no ha dicho si quiere avisos de este grupo: se pregunta al entrar.
          if (next.notificationsEnabled === null) setAskNotifications(true)
          await loadChat()
        }
      } catch (statusError) {
        if (active) setError(statusError instanceof Error ? statusError.message : t('No se pudo conectar con el chat.'))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [loadChat, targetLang, user?.id])

  // Mensajes nuevos cada pocos segundos mientras la pantalla está a la vista.
  useEffect(() => {
    if (!status?.isMember) return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadChat()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [loadChat, status?.isMember])

  // Baja al último mensaje cuando llega uno nuevo.
  useLayoutEffect(() => {
    const last = messages[messages.length - 1]?.id ?? null
    if (last && last !== lastIdRef.current) {
      lastIdRef.current = last
      composerRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [messages])

  const toggleComposer = () => {
    setComposerOpen((open) => {
      const next = !open
      try {
        window.localStorage.setItem(COMPOSER_OPEN_KEY, next ? '1' : '0')
      } catch {
        // Sin almacenamiento: se recuerda solo mientras la pantalla está abierta.
      }
      if (!next) setPickingTime(false)
      return next
    })
  }

  const join = async () => {
    setJoining(true)
    try {
      await joinIcademerChat(targetLang)
      markChatInviteSeen(user?.id, targetLang)
      setStatus((current) => (current ? { ...current, isMember: true, notificationsEnabled: null } : current))
      setAskNotifications(true)
      await loadChat()
    } catch (joinError) {
      toast.error(joinError instanceof Error ? joinError.message : t('No se pudo conectar con el chat.'))
    } finally {
      setJoining(false)
    }
  }

  const answerNotifications = async (enabled: boolean) => {
    setSavingNotifications(true)
    try {
      if (enabled) {
        // Activa los avisos en este móvil u ordenador (pide permiso al navegador si hace falta).
        try {
          await enablePushOnCurrentDevice()
        } catch (pushError) {
          toast.error(pushError instanceof Error ? pushError.message : t('No se pudieron activar los avisos en este dispositivo.'))
        }
      }
      await setIcademerChatNotifications(targetLang, enabled)
      setStatus((current) => (current ? { ...current, notificationsEnabled: enabled } : current))
      setAskNotifications(false)
      toast.success(
        enabled
          ? t('Te avisaremos cuando alguien escriba.')
          : t('Sin avisos de este grupo. Puedes activarlos en Perfil > Notificaciones.'),
      )
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : t('No se pudo conectar con el chat.'))
    } finally {
      setSavingNotifications(false)
    }
  }

  const leave = async () => {
    setLeaving(true)
    try {
      await leaveIcademerChat(targetLang)
      setStatus((current) => (current ? { ...current, isMember: false, notificationsEnabled: null } : current))
      setMessages([])
      setConfirmLeave(false)
      toast.success(t('Has salido del chat.'))
    } catch (leaveError) {
      toast.error(leaveError instanceof Error ? leaveError.message : t('No se pudo conectar con el chat.'))
    } finally {
      setLeaving(false)
    }
  }

  const waitForOthers = mustWaitForOthers(messages)

  const send = async (kind: ChatMessageKind) => {
    if (sending || waitForOthers) return
    if (kind === 'hora' && !pickingTime) {
      setPickingTime(true)
      return
    }
    setSending(true)
    try {
      await sendIcademerChatMessage({
        targetLang,
        kind,
        timeValue: kind === 'hora' ? `${hour}:${minute}` : undefined,
        timeZone: kind === 'hora' ? viewerZone : undefined,
      })
      setPickingTime(false)
      await loadChat()
    } catch (sendError) {
      toast.error(sendError instanceof Error ? sendError.message : t('No se pudo conectar con el chat.'))
    } finally {
      setSending(false)
    }
  }

  const peopleText = tn(memberCount, t('{n} persona en este chat'), t('{n} personas en este chat'))

  return (
    <section className='mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pt-2 pb-6 lg:py-8'>
      {/* Cabecera */}
      <div className='flex items-center gap-3'>
        <span className='flex size-14 shrink-0 items-center justify-center rounded-2xl' style={{ background: 'var(--ica-i-soft)' }}>
          <ChatBubblesIcon size={38} />
        </span>
        <div className='min-w-0 flex-1'>
          <h1 className='m-0 font-display text-2xl leading-tight font-extrabold tracking-tight text-balance'>
            {t('Icademers de {lang}', { lang: language })}
          </h1>
          <p className='m-0 mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground'>
            <UsersIcon className='size-4' strokeWidth={2.6} aria-hidden='true' />
            {peopleText}
          </p>
        </div>
      </div>

      {loading ? (
        <div className='flex flex-col gap-2' aria-hidden='true'>
          {[0, 1, 2].map((index) => (
            <div key={index} className='h-14 animate-pulse rounded-2xl bg-muted' style={{ width: `${70 - index * 12}%` }} />
          ))}
        </div>
      ) : error && !status ? (
        <p className='m-0 rounded-2xl bg-muted p-4 text-sm font-semibold text-muted-foreground'>{error}</p>
      ) : !status?.isMember ? (
        /* Aún no estás dentro */
        <div className='ica-pop flex flex-col gap-4 rounded-3xl border-2 border-border p-5'>
          <p className='m-0 text-lg leading-snug font-extrabold'>
            {t('Un chat con quien aprende {lang} como tú.', { lang: language })}
          </p>
          <ul className='m-0 flex list-none flex-col gap-2 p-0 text-sm font-semibold text-muted-foreground'>
            <li>{t('Los mensajes son cerrados: eliges uno de la lista y, si quieres, una hora.')}</li>
            <li>{t('Sirve para quedar en el Club de DinámICA y ponerle nombre a la gente.')}</li>
            <li>{t('Las horas se ajustan solas: cada uno las ve en su hora local.')}</li>
            <li>{t('Nadie ve quién está dentro: solo cuántos son.')}</li>
          </ul>
          {status && !status.canJoin ? (
            <p className='m-0 text-sm font-bold' style={{ color: 'var(--ica-bad-ink)' }}>
              {t('Este chat es para quien aprende este idioma.')}
            </p>
          ) : (
            <Button type='button' size='xl' className='w-full' onClick={() => void join()} disabled={joining}>
              {t('Unirme al chat')}
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Mensajes */}
          <div className='flex flex-col gap-2' aria-live='polite'>
            {messages.length === 0 ? (
              <p className='m-0 rounded-2xl bg-muted/70 p-4 text-center text-sm font-semibold text-muted-foreground'>
                {t('Aún no hay mensajes. Saluda tú primero.')}
              </p>
            ) : null}
            {messages.map((message, index) => {
              const previous = messages[index - 1]
              const sameSender = previous && previous.senderKey === message.senderKey
              // «¿A las…?»: se enseña en la hora de quien lo lee; la original, en pequeño.
              const converted =
                message.kind === 'hora' && message.timeValue && !message.isMe
                  ? timeInViewerZone(message.timeValue, message.timeZone, viewerZone, new Date(message.createdAt))
                  : null
              const shownTime = converted ? converted.time : message.timeValue
              const dayNote = converted?.dayShift === 1 ? t(' (del día siguiente)') : converted?.dayShift === -1 ? t(' (del día anterior)') : ''
              return (
                <div
                  key={message.id}
                  className={cn('flex flex-col', message.isMe ? 'items-end' : 'items-start', sameSender ? '-mt-1' : 'mt-1')}
                >
                  {!message.isMe && !sameSender ? (
                    <span className='mb-0.5 ml-1 text-xs font-extrabold' style={{ color: toneFor(message.senderKey) }}>
                      {message.senderName}
                    </span>
                  ) : null}
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl border-2 px-3.5 py-2',
                      message.isMe ? 'rounded-br-md border-transparent text-white' : 'rounded-bl-md border-border bg-card',
                    )}
                    style={message.isMe ? { background: 'var(--ica-me)' } : undefined}
                  >
                    <p className='m-0 flex items-center gap-1.5 text-[15px] leading-snug font-bold'>
                      {message.kind === 'hora' ? <ClockIcon className='size-4 shrink-0' strokeWidth={2.6} aria-hidden='true' /> : null}
                      {chatText(message.kind, shownTime)}
                    </p>
                    {message.kind === 'hora' && converted ? (
                      <p className='m-0 mt-0.5 text-xs font-semibold text-muted-foreground'>
                        {t('En tu hora{day}. {name} propuso las {time} de {city}.', {
                          day: dayNote,
                          name: message.senderName.split(' ')[0],
                          time: message.timeValue ?? '',
                          city: zoneCity(message.timeZone),
                        })}
                      </p>
                    ) : null}
                    {message.kind === 'hora' && message.isMe ? (
                      <p className='m-0 mt-0.5 text-xs font-semibold text-white/80'>
                        {t('Hora de {city}. A cada uno le llega en la suya.', { city: zoneCity(message.timeZone) || viewerCity })}
                      </p>
                    ) : null}
                    <p
                      className={cn(
                        'm-0 mt-0.5 text-right text-[11px] font-semibold tabular-nums',
                        message.isMe ? 'text-white/70' : 'text-muted-foreground',
                      )}
                    >
                      {clockLabel(message.createdAt)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Enviar mensaje: se puede plegar para leer con más sitio */}
          <div ref={composerRef} className='scroll-mb-28 rounded-3xl border-2 border-border bg-card md:scroll-mb-6'>
            <button
              type='button'
              onClick={toggleComposer}
              aria-expanded={composerOpen}
              className='flex w-full items-center gap-2 px-4 py-3 text-left'
            >
              <SendIcon className='size-4 shrink-0' strokeWidth={2.6} style={{ color: 'var(--ica-me)' }} aria-hidden='true' />
              <span className='flex-1 text-sm font-extrabold'>{t('Enviar mensaje')}</span>
              <span className='text-xs font-bold text-muted-foreground'>{composerOpen ? t('Ocultar') : t('Mostrar')}</span>
              <ChevronDownIcon
                className={cn('size-5 shrink-0 text-muted-foreground transition-transform', composerOpen && 'rotate-180')}
                aria-hidden='true'
              />
            </button>

            {composerOpen ? (
              <div className='ica-pop px-3 pb-3'>
                {waitForOthers ? (
                  <p className='m-0 mb-2 text-xs font-bold' style={{ color: 'var(--ica-gold-ink)' }}>
                    {t('Ya has mandado {n} seguidos. Espera a que escriba otra persona.', { n: CHAT_MAX_IN_A_ROW })}
                  </p>
                ) : null}
                {pickingTime ? (
                  <div className='ica-pop mb-2 flex flex-col gap-2 rounded-2xl bg-muted/70 p-2'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='text-sm font-extrabold'>{t('¿A las…?')}</span>
                      <Select value={hour} onValueChange={setHour}>
                        <SelectTrigger className='h-10 w-20 rounded-xl' aria-label={t('Hora')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, value) => String(value).padStart(2, '0')).map((value) => (
                            <SelectItem key={value} value={value}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className='font-black'>:</span>
                      <div className='flex gap-1' role='group' aria-label={t('Minutos')}>
                        {['00', '15', '30', '45'].map((value) => (
                          <button
                            key={value}
                            type='button'
                            onClick={() => setMinute(value)}
                            aria-pressed={minute === value}
                            className={cn(
                              'h-10 min-w-11 rounded-xl border-2 px-2 text-sm font-extrabold tabular-nums',
                              minute === value ? 'border-transparent text-white' : 'border-border bg-card',
                            )}
                            style={minute === value ? { background: 'var(--ica-me)' } : undefined}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className='m-0 flex items-start gap-1.5 text-xs font-semibold text-muted-foreground'>
                      <GlobeIcon className='mt-px size-3.5 shrink-0' strokeWidth={2.6} aria-hidden='true' />
                      {t('Pon la hora de {city}, la tuya. A cada icademer le llega pasada a su hora local.', { city: viewerCity })}
                    </p>
                    <div className='flex justify-end gap-1'>
                      <Button type='button' variant='outline' size='sm' onClick={() => setPickingTime(false)}>
                        {t('Cancelar')}
                      </Button>
                      <Button type='button' size='sm' onClick={() => void send('hora')} disabled={sending || waitForOthers}>
                        <SendIcon className='size-4' aria-hidden='true' />
                        {t('Enviar')}
                      </Button>
                    </div>
                  </div>
                ) : null}
                <div className='grid grid-cols-2 gap-2'>
                  {CHAT_MESSAGES.map((item) => (
                    <button
                      key={item.kind}
                      type='button'
                      onClick={() => void send(item.kind)}
                      disabled={sending || waitForOthers}
                      className={cn(
                        'ica-press flex min-h-11 items-center gap-1.5 rounded-2xl border-2 px-3 py-2 text-left text-sm leading-tight font-extrabold disabled:opacity-50',
                        item.kind === 'club' ? 'col-span-2 border-transparent text-white' : 'border-border bg-background',
                        item.kind === 'animo' ? 'col-span-2' : '',
                      )}
                      style={
                        item.kind === 'club'
                          ? { background: 'var(--ica-reto, #a259f0)', boxShadow: '0 3px 0 color-mix(in oklab, var(--ica-reto, #a259f0) 70%, black)' }
                          : { boxShadow: '0 3px 0 var(--border)' }
                      }
                    >
                      {item.kind === 'hora' ? <ClockIcon className='size-4 shrink-0' strokeWidth={2.6} aria-hidden='true' /> : null}
                      {item.kind === 'hora' ? t('¿A las…?') : t(item.text)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <button
            type='button'
            onClick={() => setConfirmLeave(true)}
            className='flex items-center gap-1.5 self-start text-xs font-bold text-muted-foreground hover:text-foreground'
          >
            <LogOutIcon className='size-3.5' aria-hidden='true' />
            {t('Salir del chat')}
          </button>
        </>
      )}

      {askNotifications && status?.isMember ? (
        <ChatSheet
          icon={<BellIcon className='size-8' strokeWidth={2.4} style={{ color: 'var(--ica-me)' }} aria-hidden='true' />}
          title={t('¿Quieres recibir notificaciones de este grupo?')}
          text={t('Te avisamos cuando alguien escriba en Icademers de {lang}. Puedes cambiarlo cuando quieras en Perfil > Notificaciones.', { lang: language })}
          yes={t('Sí, avisarme')}
          no={t('No')}
          busy={savingNotifications}
          onYes={() => void answerNotifications(true)}
          onNo={() => void answerNotifications(false)}
        />
      ) : null}

      {confirmLeave ? (
        <ChatSheet
          icon={<LogOutIcon className='size-8' strokeWidth={2.4} style={{ color: 'var(--ica-bad-strong)' }} aria-hidden='true' />}
          title={t('¿Seguro que quieres salir del chat de Icademers de {lang}?', { lang: language })}
          text={t('Dejarás de ver los mensajes y de recibir avisos. Puedes volver a entrar desde tu perfil.')}
          yes={t('Sí, salir')}
          no={t('No, quedarme')}
          busy={leaving}
          danger
          onYes={() => void leave()}
          onNo={() => setConfirmLeave(false)}
        />
      ) : null}
    </section>
  )
}

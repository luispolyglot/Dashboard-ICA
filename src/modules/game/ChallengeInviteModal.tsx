import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { t, tn } from '@/i18n'
import { useDashboardContext } from '../context/DashboardContext'
import { useIcaChallengeAlerts, refreshIcaChallengeAlerts } from '../hooks/useIcaChallengeAlerts'
import { DASHBOARD_ROUTES, getIcaChallengePlayRoute } from '../routes/paths'
import {
  listIcaChallengeProfilesByIds,
  listMyIcaChallenges,
  respondIcaChallengeInvitation,
  translateChallengeMessage,
} from '../services/icaChallenges'
import { tileForTypeId } from '../components/IcaChallenges/ChallengeModePicker'
import type { IcaChallengeRecord } from '../types'
import { gameSfx } from './sfx'
import { SwordsIcon } from './icons'
import { UserInitial } from './ranking'
import { afterGuides } from './WelcomeTour'

/**
 * «Te han retado» (Luis, 16 Oct): when you open the app on Inicio with a challenge waiting for
 * you, a window shows who challenged you, in which mode and how long is left, with «Aceptar»
 * (straight into the game) and «Ahora no». Each invitation is shown once per device; the «1» on
 * the games button stays as before. It waits for the guides, so it never opens on top of one.
 */

const SEEN_KEY = 'ica-invite-modal-seen-v1'

function readSeen(userId: string): string[] {
  try {
    const raw = window.localStorage.getItem(`${SEEN_KEY}:${userId}`)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function markSeen(userId: string, ids: string[]): void {
  try {
    const next = Array.from(new Set([...readSeen(userId), ...ids])).slice(-60)
    window.localStorage.setItem(`${SEEN_KEY}:${userId}`, JSON.stringify(next))
  } catch {
    /* without storage it may show again: not a problem */
  }
}

function timeLeft(acceptUntil: string | null): string | null {
  if (!acceptUntil) return null
  const diffMs = Date.parse(acceptUntil) - Date.now()
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null
  const minutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? t('Quedan {n} h para aceptar', { n: hours }) : t('Quedan {n} min para aceptar', { n: minutes })
}

type Invite = { challenge: IcaChallengeRecord; name: string; others: number }

export function ChallengeInviteModal() {
  const { user } = useAuth()
  const { config } = useDashboardContext()
  const location = useLocation()
  const navigate = useNavigate()
  const alerts = useIcaChallengeAlerts()
  const [invite, setInvite] = useState<Invite | null>(null)
  const [accepting, setAccepting] = useState(false)
  const lookingRef = useRef(false)
  const acceptRef = useRef<HTMLButtonElement | null>(null)
  const onHome = location.pathname === DASHBOARD_ROUTES.home
  const userId = user?.id ?? null

  useEffect(() => {
    if (!onHome || !userId || !config?.targetLang || !config.nativeLang || alerts.invites <= 0) return
    if (invite || lookingRef.current) return
    lookingRef.current = true
    let cancelled = false
    void (async () => {
      try {
        const rows = await listMyIcaChallenges(config.targetLang, config.nativeLang, 20)
        const seen = new Set(readSeen(userId))
        const now = Date.now()
        const waiting = rows.filter(
          (row) =>
            row.status === 'created' &&
            row.challengedUserId === userId &&
            (!row.acceptUntil || Date.parse(row.acceptUntil) > now),
        )
        const fresh = waiting.filter((row) => !seen.has(row.id))
        const first = fresh[0]
        if (!first || cancelled) return
        const profiles = await listIcaChallengeProfilesByIds([first.challengerUserId])
        if (cancelled) return
        const profile = profiles[first.challengerUserId]
        const name = (profile?.displayName || profile?.username || '').trim().split(/\s+/)[0] || t('Un icademer')
        // Never on top of a guide (welcome, phases…): it waits until they end.
        afterGuides(() => {
          if (cancelled) return
          markSeen(userId, fresh.map((row) => row.id))
          gameSfx.tap()
          setInvite({ challenge: first, name, others: waiting.length - 1 })
        })
      } catch {
        // Without a connection: the «1» on the games button is still there.
      } finally {
        lookingRef.current = false
      }
    })()
    return () => {
      cancelled = true
    }
  }, [alerts.invites, config?.nativeLang, config?.targetLang, invite, onHome, userId])

  if (!invite) return null

  const tile = tileForTypeId(invite.challenge.challengeSlug)
  const mode = tile ? t(tile.label) : null
  const left = timeLeft(invite.challenge.acceptUntil)

  const close = () => setInvite(null)
  const accept = async () => {
    if (accepting) return
    setAccepting(true)
    try {
      await respondIcaChallengeInvitation(invite.challenge.id, true, false)
      void refreshIcaChallengeAlerts(true)
      setInvite(null)
      navigate(getIcaChallengePlayRoute(invite.challenge.id))
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code
      setInvite(null)
      if (code === 'ICA_CHALLENGE_PASS_REQUIRED') {
        // A 4th challenge needs a «desafío extra»: Desafíos ICA explains it and sells it.
        navigate(`${DASHBOARD_ROUTES.challengesIca}?tab=pending`)
        return
      }
      toast.error(error instanceof Error ? translateChallengeMessage(error.message) : t('No se pudo responder el desafío.'))
    } finally {
      setAccepting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : close())}>
      <DialogContent
        className='text-center sm:max-w-sm'
        // The first thing in focus is «Aceptar el reto», not the link to the other challenges.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          acceptRef.current?.focus({ preventScroll: true })
        }}
      >
        <div className='flex flex-col items-center gap-3 pt-1'>
          <div className='relative'>
            <UserInitial name={invite.name} size={84} />
            <span
              className='ica-pop absolute -right-2 -bottom-1 flex size-10 items-center justify-center rounded-2xl'
              style={{ background: 'var(--ica-a)', boxShadow: '0 3px 0 var(--ica-a-edge)' }}
              aria-hidden='true'
            >
              <SwordsIcon size={26} />
            </span>
          </div>
          <DialogTitle className='pr-0 font-display text-2xl font-black tracking-tight'>
            {t('{name} te ha retado', { name: invite.name })}
          </DialogTitle>
          <DialogDescription className='m-0 text-base font-semibold text-muted-foreground'>
            {[mode, left].filter(Boolean).join(' · ') || t('Un desafío 1 contra 1 con tus palabras ICA.')}
          </DialogDescription>
          {invite.others > 0 ? (
            <button
              type='button'
              className='text-sm font-extrabold text-primary underline-offset-4 hover:underline'
              onClick={() => {
                close()
                navigate(`${DASHBOARD_ROUTES.challengesIca}?tab=pending`)
              }}
            >
              {tn(invite.others, 'Y {n} reto más esperándote', 'Y {n} retos más esperándote')}
            </button>
          ) : null}
        </div>
        <div className='mt-2 flex flex-col gap-2'>
          <Button ref={acceptRef} type='button' size='xl' className='w-full gap-2' onClick={() => void accept()} disabled={accepting}>
            {accepting ? <Loader2Icon className='size-5 animate-spin' aria-hidden='true' /> : null}
            {accepting ? t('Entrando…') : t('Aceptar el reto')}
          </Button>
          <Button type='button' variant='ghost' className='w-full font-bold' onClick={close} disabled={accepting}>
            {t('Ahora no')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

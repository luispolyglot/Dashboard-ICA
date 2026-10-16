import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Loader2Icon, MicIcon } from 'lucide-react'
import { t } from '@/i18n'
import { tone } from '../../game/ui'
import { listenOnce, type ListenOutcome } from './challengeEngine'

/**
 * MANTENER PULSADO PARA HABLAR (Luis y Nahuel, 16 Oct): en «Dilo en voz alta» (Desafíos y reto del
 * día) y en la nota desafiante, el micro ya no se abre solo. Se mantiene pulsado el botón mientras
 * se habla y, al soltarlo, se corrige lo dicho. Así no hay pitidos de más (el micro se abre una
 * vez, al pulsar) y una pausa entre dos palabras ya no corta la respuesta.
 */

export type HoldStatus = 'idle' | 'starting' | 'listening' | 'checking'

/** A tap shorter than this is a tap, not «holding»: we explain how it works. */
const SHORT_TAP_MS = 350

export function useHoldToTalk({
  lang,
  onInterim,
  onOutcome,
  acceptEarly,
}: {
  lang: string
  /** What is being heard while holding. */
  onInterim?: (text: string) => void
  /** When the answer is finished (released, or acceptEarly). `shortTap`: released almost at once. */
  onOutcome: (outcome: ListenOutcome, info: { shortTap: boolean }) => void
  /** Reto del día: if what is heard is already right, it counts at once, without releasing. */
  acceptEarly?: (text: string) => boolean
}) {
  const [status, setStatus] = useState<HoldStatus>('idle')
  const sessionRef = useRef<ReturnType<typeof listenOnce> | null>(null)
  const pressedAtRef = useRef(0)
  const releasedAtRef = useRef(0)
  const doneRef = useRef(false)
  // The latest callbacks, without starting a new session when they change.
  const callbacksRef = useRef({ onInterim, onOutcome, acceptEarly })
  callbacksRef.current = { onInterim, onOutcome, acceptEarly }

  const press = useCallback(() => {
    if (sessionRef.current) return
    doneRef.current = false
    pressedAtRef.current = Date.now()
    releasedAtRef.current = 0
    setStatus('starting')
    const session = listenOnce(lang, {
      holdToTalk: true,
      maxMs: 30000,
      onInterim: (text) => {
        if (doneRef.current) return
        setStatus('listening')
        callbacksRef.current.onInterim?.(text)
        if (callbacksRef.current.acceptEarly?.(text)) {
          doneRef.current = true
          sessionRef.current = null
          session.cancel()
          setStatus('checking')
          callbacksRef.current.onOutcome({ status: 'heard', transcript: text, candidates: [text] }, { shortTap: false })
        }
      },
    })
    sessionRef.current = session
    void session.promise.then((outcome) => {
      if (sessionRef.current === session) sessionRef.current = null
      if (doneRef.current || outcome.status === 'cancelled') return
      doneRef.current = true
      setStatus(outcome.status === 'heard' ? 'checking' : 'idle')
      const heldMs = (releasedAtRef.current || Date.now()) - pressedAtRef.current
      const shortTap = outcome.status !== 'heard' && heldMs < SHORT_TAP_MS
      callbacksRef.current.onOutcome(outcome, { shortTap })
    })
  }, [lang])

  const release = useCallback(() => {
    const session = sessionRef.current
    if (!session) return
    releasedAtRef.current = Date.now()
    setStatus((current) => (current === 'idle' ? current : 'checking'))
    session.release()
  }, [])

  const cancel = useCallback(() => {
    doneRef.current = true
    sessionRef.current?.cancel()
    sessionRef.current = null
    setStatus('idle')
  }, [])

  /** Ready for a new answer (new word, or after feedback). */
  const reset = useCallback(() => {
    cancel()
  }, [cancel])

  useEffect(() => cancel, [cancel])

  return { status, press, release, cancel, reset }
}

/** The big round mic button: hold it while speaking, release when finished. */
export function HoldToTalkButton({
  status,
  disabled,
  onPress,
  onRelease,
  size = 96,
}: {
  status: HoldStatus
  disabled?: boolean
  onPress: () => void
  onRelease: () => void
  size?: number
}) {
  const holding = status === 'starting' || status === 'listening'
  const checking = status === 'checking'
  const heldRef = useRef(false)
  const a = tone('a')

  const down = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || checking) return
    // Only the main button of the mouse; any finger.
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* old browser: works without it */
    }
    heldRef.current = true
    onPress()
  }
  const up = () => {
    if (!heldRef.current) return
    heldRef.current = false
    onRelease()
  }
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return
    event.preventDefault()
    if (disabled || checking || heldRef.current) return
    heldRef.current = true
    onPress()
  }
  const keyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    up()
  }

  return (
    <div className='flex flex-col items-center gap-2 select-none'>
      <div className='relative' style={{ width: size, height: size }}>
        {holding && (
          <span className='absolute inset-0 animate-ping rounded-full' style={{ background: a.soft }} aria-hidden='true' />
        )}
        <button
          type='button'
          disabled={disabled}
          aria-label={t('Mantén pulsado para hablar')}
          aria-pressed={holding}
          onPointerDown={down}
          onPointerUp={up}
          onPointerCancel={up}
          onLostPointerCapture={up}
          onKeyDown={keyDown}
          onKeyUp={keyUp}
          onContextMenu={(event) => event.preventDefault()}
          className='relative flex items-center justify-center rounded-full text-white transition-transform duration-100 disabled:opacity-50'
          style={{
            width: size,
            height: size,
            background: holding ? a.solid : `linear-gradient(180deg, ${a.solid}, color-mix(in oklab, ${a.solid} 80%, #000))`,
            boxShadow: holding ? `0 1px 0 ${a.edge}` : `0 6px 0 ${a.edge}`,
            transform: holding ? 'translateY(5px) scale(1.04)' : undefined,
            touchAction: 'none',
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none',
          }}
        >
          {checking ? (
            <Loader2Icon className='animate-spin' style={{ width: size * 0.38, height: size * 0.38 }} aria-hidden='true' />
          ) : (
            <MicIcon style={{ width: size * 0.4, height: size * 0.4 }} strokeWidth={2.4} aria-hidden='true' />
          )}
        </button>
      </div>
      <p className='m-0 text-sm font-extrabold' style={{ color: holding ? a.ink : undefined }}>
        {checking
          ? t('Comprobando…')
          : holding
            ? t('Suelta cuando termines')
            : t('Mantén pulsado para hablar')}
      </p>
    </div>
  )
}

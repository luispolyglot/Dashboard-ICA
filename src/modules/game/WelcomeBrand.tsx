import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { t } from '@/i18n'
import { useDashboardContext } from '../context/DashboardContext'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { IcaLogo } from './IcaLogo'
import { buildWelcomeCandidates, firstNameFrom } from './welcomeGreeting'

// LOGO DE LA CABECERA CON SALUDO DE ENTRADA (solo móvil, una vez por sesión):
// al abrir la app sale a la izquierda, subiendo desde abajo con un pequeño rebote, el saludo
// en el idioma que aprende el icademer: por la mañana «Buongiorno, Clara!», el resto del día
// «Ciao, Clara!». El logo, en el centro. Al rato el logo se desliza hasta su sitio de siempre,
// arriba a la izquierda, y el saludo va delante de él a la misma velocidad mientras se desvanece.
// Si no cabe, se prueba sin el nombre y con letra algo menor (nunca con puntos suspensivos).

const WELCOME_SHOWN_STORAGE_KEY = 'ica-welcome-shown'
const MOBILE_QUERY = '(max-width: 767px)'
const GREET_MS = 1800
const LEAVE_MS = 700
// Lo que recorre el logo: del centro de la pantalla a su sitio (1rem de margen; mide 75 px).
const LOGO_TRAVEL = 'calc(50vw - 1rem - 37.5px)'
const MOVE_EASING = 'cubic-bezier(0.45, 0, 0.35, 1)'

type Phase = 'enter' | 'greet' | 'leave' | 'done'

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function shouldGreet(): boolean {
  try {
    if (!window.matchMedia(MOBILE_QUERY).matches) return false
    return window.sessionStorage.getItem(WELCOME_SHOWN_STORAGE_KEY) !== '1'
  } catch {
    return false
  }
}

function markGreeted() {
  try {
    window.sessionStorage.setItem(WELCOME_SHOWN_STORAGE_KEY, '1')
  } catch {
    // Sin almacenamiento: el saludo puede repetirse al recargar.
  }
}

export function WelcomeBrand() {
  const { user } = useAuth()
  const { config } = useDashboardContext()
  // El saludo se decide una sola vez, al montar la cabecera.
  const [candidates] = useState<string[] | null>(() =>
    shouldGreet()
      ? buildWelcomeCandidates(
          config?.targetLang,
          firstNameFrom(user?.user_metadata?.display_name, user?.email),
          new Date().getHours(),
        )
      : null,
  )
  const greeting = candidates?.[0] ?? null
  const [phase, setPhase] = useState<Phase>(greeting ? 'enter' : 'done')
  // Se queda el primer saludo que quepa (y, si hace falta, con la letra algo menor).
  const [text, setText] = useState(greeting)
  const [fontSize, setFontSize] = useState(18)
  const textRef = useRef<HTMLSpanElement | null>(null)
  useLayoutEffect(() => {
    const node = textRef.current
    if (!node?.parentElement || !candidates) return
    // Se mide en una copia invisible (mismo ancho máximo y letra), no en el texto de verdad.
    const probe = node.cloneNode(false) as HTMLSpanElement
    probe.style.visibility = 'hidden'
    probe.style.transition = 'none'
    node.parentElement.appendChild(probe)
    let chosen: { text: string; size: number } = { text: candidates[candidates.length - 1], size: 14 }
    search: for (const size of [18, 16, 14]) {
      for (const candidate of candidates) {
        probe.textContent = candidate
        probe.style.fontSize = `${size}px`
        if (probe.scrollWidth <= probe.clientWidth + 1) {
          chosen = { text: candidate, size }
          break search
        }
      }
    }
    probe.remove()
    setText(chosen.text)
    setFontSize(chosen.size)
    // Solo al montar: el texto se decide antes de que se vea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!greeting) return
    markGreeted()
    const frame = window.requestAnimationFrame(() => setPhase('greet'))
    const leaveTimer = window.setTimeout(() => setPhase('leave'), GREET_MS)
    const doneTimer = window.setTimeout(() => setPhase('done'), GREET_MS + LEAVE_MS)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(leaveTimer)
      window.clearTimeout(doneTimer)
    }
  }, [greeting])

  const centered = phase === 'enter' || phase === 'greet'
  const [reducedMotion] = useState(prefersReducedMotion)

  return (
    <>
      {greeting && phase !== 'done' ? (
        <span
          ref={textRef}
          aria-hidden='true'
          className='pointer-events-none absolute top-1/2 left-4 max-w-[calc(50vw-4.25rem)] overflow-hidden leading-tight font-black whitespace-nowrap text-foreground'
          style={{
            fontSize,
            opacity: phase === 'greet' ? 1 : 0,
            // Entra subiendo desde abajo con un pequeño rebote (para que se vea al abrir).
            transform:
              phase === 'enter'
                ? 'translate(0, calc(-50% + 18px)) scale(0.92)'
                : phase === 'greet'
                  ? 'translate(0, -50%) scale(1)'
                  : `translate(calc(-1 * ${LOGO_TRAVEL}), -50%)`,
            transition:
              reducedMotion || phase === 'enter'
                ? 'none'
                : phase === 'greet'
                  ? 'transform 560ms cubic-bezier(0.2, 1.5, 0.4, 1), opacity 320ms ease-out'
                  : `transform ${LEAVE_MS}ms ${MOVE_EASING}, opacity ${LEAVE_MS}ms linear`,
          }}
        >
          {text}
        </span>
      ) : null}
      {greeting ? <span className='sr-only' role='status'>{text}</span> : null}
      <Link
        to={DASHBOARD_ROUTES.home}
        aria-label={t('ICA, ir al inicio')}
        className='inline-flex shrink-0'
        style={
          greeting
            ? {
                transform: centered ? `translateX(${LOGO_TRAVEL})` : 'translateX(0)',
                transition: reducedMotion ? 'none' : `transform ${LEAVE_MS}ms ${MOVE_EASING}`,
              }
            : undefined
        }
      >
        <IcaLogo size={20} />
      </Link>
    </>
  )
}

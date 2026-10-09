import { useState } from 'react'
import type { ComponentProps, PropsWithChildren, ReactNode } from 'react'
import { AlertTriangleIcon, EyeIcon, EyeOffIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IcaLogo } from '@/modules/game/IcaLogo'
import { setUiLang, t, useUiLang, type UiLang } from '@/i18n'

type AuthShellProps = PropsWithChildren<{
  title: string
  subtitle: string
  /** Lo que va debajo de la tarjeta (p. ej. «¿No tienes cuenta? Regístrate»). */
  footer?: ReactNode
  /** En la entrada se enseñan las tres fases del método para quien llega por primera vez. */
  showMethod?: boolean
}>

const PHASES = [
  { letter: 'I', label: 'Inmersión', color: 'var(--ica-i)', soft: 'var(--ica-i-soft)' },
  { letter: 'C', label: 'Creación', color: 'var(--ica-c)', soft: 'var(--ica-c-soft)' },
  { letter: 'A', label: 'Activación', color: 'var(--ica-a)', soft: 'var(--ica-a-soft)' },
] as const

/**
 * Marco de las pantallas de entrada (entrar, registrarse, recuperar contraseña).
 * Mismo estilo que la app: logo ICA arriba, tarjeta blanca con canto y botones grandes.
 */
export function AuthShell({ title, subtitle, footer, showMethod = false, children }: AuthShellProps) {
  return (
    <main className='relative flex min-h-dvh flex-col items-center overflow-hidden bg-background px-4 pt-[max(env(safe-area-inset-top),2.5rem)] pb-10 sm:justify-center sm:py-12'>
      {/* Manchas suaves con los colores del método, al fondo */}
      <div aria-hidden='true' className='pointer-events-none fixed inset-0 overflow-hidden'>
        <div className='absolute -top-24 -left-20 size-72 rounded-full opacity-25 blur-3xl' style={{ background: 'var(--ica-i)' }} />
        <div className='absolute top-1/3 -right-24 size-72 rounded-full opacity-20 blur-3xl' style={{ background: 'var(--ica-c)' }} />
        <div className='absolute -bottom-28 left-1/4 size-72 rounded-full opacity-15 blur-3xl' style={{ background: 'var(--ica-a)' }} />
      </div>

      <AuthLanguageSwitch />

      <div className='relative flex w-full max-w-[400px] flex-col items-center'>
        <div className='ica-fade-up flex flex-col items-center gap-2'>
          <IcaLogo size={46} className='ica-bob' />
          <p className='m-0 text-sm font-extrabold tracking-[0.06em] text-muted-foreground'>icademy.app</p>
        </div>

        <h1 className='mt-6 mb-0 text-center text-[28px] leading-tight font-black tracking-tight'>{title}</h1>
        <p className='mt-1.5 mb-0 max-w-[32ch] text-center text-[15px] font-semibold text-muted-foreground'>{subtitle}</p>

        {showMethod ? (
          <div className='mt-4 flex flex-wrap items-center justify-center gap-1.5'>
            {PHASES.map((phase) => (
              <span
                key={phase.letter}
                className='inline-flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-xs font-extrabold'
                style={{ background: phase.soft, color: phase.color }}
              >
                <span
                  className='flex size-5 items-center justify-center rounded-full font-ica text-[11px] font-extrabold text-white'
                  style={{ background: phase.color }}
                >
                  {phase.letter}
                </span>
                {t(phase.label)}
              </span>
            ))}
          </div>
        ) : null}

        <div className='ica-panel mt-6 w-full rounded-[24px] p-5 sm:p-6'>{children}</div>

        {footer ? <div className='mt-5 w-full text-center'>{footer}</div> : null}
      </div>
    </main>
  )
}

const AUTH_LANGUAGES: { value: UiLang; label: string }[] = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
]

/**
 * Spanish or English before signing in (Luis, 7 Oct). Each option is written in its own language.
 * Once inside, the app follows the student's native language as before.
 */
function AuthLanguageSwitch() {
  const lang = useUiLang()
  return (
    <div
      role='group'
      aria-label={t('Idioma de la app')}
      className='relative z-10 mb-4 flex self-center rounded-full border-2 border-border bg-card p-1 sm:absolute sm:top-6 sm:right-6 sm:mb-0'
    >
      {AUTH_LANGUAGES.map((option) => {
        const active = option.value === lang
        return (
          <button
            key={option.value}
            type='button'
            lang={option.value}
            aria-pressed={active}
            onClick={() => setUiLang(option.value)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-extrabold transition-colors',
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Campo de texto de las pantallas de entrada: etiqueta, icono a la izquierda y, en contraseñas, el ojo para verla. */
export function AuthField({
  id,
  label,
  icon: Icon,
  type = 'text',
  hint,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'id'> & {
  id: string
  label: string
  icon: LucideIcon
  hint?: ReactNode
}) {
  const [visible, setVisible] = useState(false)
  const isPassword = type === 'password'
  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex items-baseline justify-between gap-2'>
        <label htmlFor={id} className='text-sm font-extrabold'>
          {label}
        </label>
        {hint}
      </div>
      <div className='relative'>
        <Icon
          className='pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted-foreground'
          strokeWidth={2.4}
          aria-hidden='true'
        />
        <input
          id={id}
          type={isPassword && visible ? 'text' : type}
          className={cn(
            'h-12 w-full min-w-0 rounded-2xl border-2 border-input bg-card pr-3.5 pl-10 text-base font-semibold transition-colors outline-none placeholder:font-semibold placeholder:text-muted-foreground/70 focus-visible:border-[var(--ica-i)] focus-visible:ring-3 focus-visible:ring-[color-mix(in_oklab,var(--ica-i)_25%,transparent)] dark:bg-input/25',
            isPassword && 'pr-11',
            className,
          )}
          {...props}
        />
        {isPassword ? (
          <button
            type='button'
            onClick={() => setVisible((value) => !value)}
            className='absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground'
            aria-label={visible ? t('Ocultar contraseña') : t('Ver contraseña')}
          >
            {visible ? (
              <EyeOffIcon className='size-[18px]' strokeWidth={2.4} aria-hidden='true' />
            ) : (
              <EyeIcon className='size-[18px]' strokeWidth={2.4} aria-hidden='true' />
            )}
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** Mensaje de error o de éxito dentro de la tarjeta. */
export function AuthNotice({ tone, children }: PropsWithChildren<{ tone: 'error' | 'success' | 'warning' }>) {
  const style =
    tone === 'success'
      ? { background: 'var(--ica-ok-soft)', color: 'var(--ica-ok-ink)' }
      : tone === 'warning'
        ? { background: 'var(--ica-gold-soft)', color: 'var(--ica-gold-ink)' }
        : { background: 'var(--ica-bad-soft)', color: 'var(--ica-bad-ink)' }
  return (
    <div className='flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-bold' style={style} role={tone === 'error' ? 'alert' : 'status'}>
      {tone !== 'success' ? <AlertTriangleIcon className='mt-0.5 size-4 shrink-0' strokeWidth={2.6} aria-hidden='true' /> : null}
      <span>{children}</span>
    </div>
  )
}

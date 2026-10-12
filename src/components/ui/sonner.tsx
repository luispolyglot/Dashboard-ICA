import type { ReactNode } from 'react'
import { CheckIcon, InfoIcon, Loader2Icon, TriangleAlertIcon, XIcon } from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useTheme } from '@/theme/ThemeContext'

/** Icono redondo de color, como el resto de la app (verde = bien, rojo = error…). */
function ToastIcon({ soft, ink, children }: { soft: string; ink: string; children: ReactNode }) {
  return (
    <span
      className='flex size-9 shrink-0 items-center justify-center rounded-full [&>svg]:size-5'
      style={{ background: `var(${soft})`, color: `var(${ink})` }}
    >
      {children}
    </span>
  )
}

/**
 * AVISOS (las notificaciones que salen arriba): tarjeta blanca (u oscura) con borde y
 * sombra «de botón», el icono en un círculo de color y el texto en negrita.
 * Iguales en todo: «ICA Coins actualizadas», errores, avisos…
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme}
      className='toaster group'
      icons={{
        success: (
          <ToastIcon soft='--ica-ok-soft' ink='--ica-ok-ink'>
            <CheckIcon strokeWidth={3.2} />
          </ToastIcon>
        ),
        info: (
          <ToastIcon soft='--ica-i-soft' ink='--ica-i-ink'>
            <InfoIcon strokeWidth={2.6} />
          </ToastIcon>
        ),
        warning: (
          <ToastIcon soft='--ica-gold-soft' ink='--ica-gold-ink'>
            <TriangleAlertIcon strokeWidth={2.6} />
          </ToastIcon>
        ),
        error: (
          <ToastIcon soft='--ica-bad-soft' ink='--ica-bad-ink'>
            <XIcon strokeWidth={3.2} />
          </ToastIcon>
        ),
        loading: (
          <ToastIcon soft='--ica-i-soft' ink='--ica-i-ink'>
            <Loader2Icon className='animate-spin' strokeWidth={2.6} />
          </ToastIcon>
        ),
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'relative flex w-full items-center gap-3 rounded-[20px] border-2 border-border bg-card py-3 pr-10 pl-3 text-card-foreground shadow-[0_4px_0_var(--border),0_14px_30px_-14px_rgb(0_0_0/0.4)] sm:w-[356px]',
          icon: 'flex shrink-0 items-center justify-center',
          content: 'flex min-w-0 flex-1 flex-col gap-0.5',
          title: 'text-sm leading-snug font-extrabold',
          description: 'text-xs leading-snug font-semibold text-muted-foreground',
          closeButton:
            'absolute top-1/2 right-2.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border-0 !bg-transparent text-muted-foreground transition-colors hover:!bg-muted hover:text-foreground [&>svg]:size-4',
          actionButton:
            'shrink-0 rounded-xl bg-primary px-3 py-1.5 text-xs font-extrabold text-primary-foreground',
          cancelButton: 'shrink-0 rounded-xl bg-muted px-3 py-1.5 text-xs font-extrabold',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }

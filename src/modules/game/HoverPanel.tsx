import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Desplegable que se abre al pasar el ratón por encima (como en Duolingo), sin clicar.
 * - Solo con ratón: en el móvil, tocar el botón hace lo de siempre (abrir su pantalla).
 * - Con teclado se abre al llegar con Tab y se cierra con Escape.
 * - Se puede mover el ratón del botón al desplegable sin que se cierre.
 */
export function HoverPanel({
  trigger,
  children,
  label,
  align = 'end',
  width = 320,
}: {
  trigger: ReactNode
  children: ReactNode
  /** Nombre del desplegable para lectores de pantalla. */
  label: string
  align?: 'start' | 'center' | 'end'
  width?: number
}) {
  const [open, setOpen] = useState(false)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current)
    if (closeTimer.current) clearTimeout(closeTimer.current)
    openTimer.current = null
    closeTimer.current = null
  }

  const show = useCallback((delay: number) => {
    clearTimers()
    openTimer.current = setTimeout(() => setOpen(true), delay)
  }, [])

  const hide = useCallback((delay: number) => {
    clearTimers()
    closeTimer.current = setTimeout(() => setOpen(false), delay)
  }, [])

  useEffect(() => () => clearTimers(), [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div
      ref={rootRef}
      className='relative'
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') show(90)
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') hide(180)
      }}
      onFocus={(event) => {
        // Solo con teclado (al tocar en el móvil también llega el foco).
        if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) show(0)
      }}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) hide(0)
      }}
      onClick={() => {
        clearTimers()
        setOpen(false)
      }}
    >
      {trigger}
      {open ? (
        <div
          role='dialog'
          aria-label={label}
          className={cn(
            'absolute top-full z-50 pt-2',
            align === 'end' && 'right-0',
            align === 'start' && 'left-0',
            align === 'center' && 'left-1/2 -translate-x-1/2',
          )}
          style={{ width }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className='ica-hover-panel rounded-3xl border-2 border-border bg-popover p-4 text-popover-foreground shadow-[var(--pop-shadow)]'>
            {children}
          </div>
        </div>
      ) : null}
    </div>
  )
}

import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode, MouseEvent as ReactMouseEvent } from 'react'
import { LockIcon, Trash2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

const ACTION_WIDTH = 96

/**
 * Fila que se desliza a la izquierda para mostrar "Borrar" (como en el móvil).
 * Si la fila está protegida, en lugar de "Borrar" sale un candado.
 * Controlada desde fuera para que solo haya una abierta a la vez.
 */
export function SwipeRow({
  children,
  open,
  onOpenChange,
  onDelete,
  locked = false,
  disabled = false,
  className,
}: {
  children: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: () => void
  locked?: boolean
  disabled?: boolean
  className?: string
}) {
  const [drag, setDrag] = useState<number | null>(null)
  const start = useRef<{ x: number; y: number; base: number; decided: boolean | null; id: number } | null>(null)
  const swiped = useRef(false)

  const offset = drag ?? (open ? -ACTION_WIDTH : 0)

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    start.current = {
      x: event.clientX,
      y: event.clientY,
      base: open ? -ACTION_WIDTH : 0,
      decided: null,
      id: event.pointerId,
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current
    if (!s || s.id !== event.pointerId) return
    const dx = event.clientX - s.x
    const dy = event.clientY - s.y
    if (s.decided === null) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        s.decided = true
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          /* nada */
        }
      } else if (Math.abs(dy) > 8) {
        start.current = null
        return
      } else {
        return
      }
    }
    const next = Math.min(0, Math.max(-ACTION_WIDTH * 1.35, s.base + dx))
    setDrag(next)
  }

  const finish = () => {
    const s = start.current
    start.current = null
    if (!s || !s.decided) return
    swiped.current = true
    const current = drag ?? s.base
    onOpenChange(current < -ACTION_WIDTH / 2)
    setDrag(null)
  }

  // Tras deslizar no queremos que cuente como "tocar" un botón de la fila.
  // Y si la fila está abierta, tocarla la cierra.
  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (swiped.current) {
      swiped.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (open) {
      event.preventDefault()
      event.stopPropagation()
      onOpenChange(false)
    }
  }

  const reveal = Math.min(1, -offset / ACTION_WIDTH)

  return (
    <div className={cn('relative overflow-hidden', className)}>
      <button
        type='button'
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        onClick={() => {
          onOpenChange(false)
          onDelete()
        }}
        className='absolute inset-y-1.5 right-0 flex flex-col items-center justify-center gap-1 rounded-2xl text-xs font-black text-white'
        style={{
          width: ACTION_WIDTH - 8,
          background: locked ? 'var(--ica-gold)' : 'var(--ica-bad-strong)',
          color: locked ? '#4a3200' : '#fff',
          opacity: reveal,
          transform: `scale(${0.8 + reveal * 0.2})`,
        }}
      >
        {locked ? (
          <LockIcon className='size-5' strokeWidth={2.6} aria-hidden='true' />
        ) : (
          <Trash2Icon className='size-5' strokeWidth={2.6} aria-hidden='true' />
        )}
        {locked ? t('Protegida') : t('Borrar')}
      </button>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClickCapture={onClickCapture}
        className={cn('relative bg-card dark:bg-background', drag === null && 'transition-transform duration-200 ease-out')}
        style={{ transform: `translateX(${offset}px)`, touchAction: 'pan-y' }}
      >
        {children}
      </div>
    </div>
  )
}

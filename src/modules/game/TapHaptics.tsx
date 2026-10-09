import { useEffect } from 'react'
import { hapticTap } from './sfx'

// VIBRACIÓN EN CADA TOQUE (Luis, 3 oct: «como Duolingo»): un toque muy corto al pulsar
// botones, enlaces y pestañas. En Android vibra; en iPhone (iOS 18 o más) da el toque suave
// del interruptor escondido. Se apaga con el mismo botón que los sonidos.

const TAPPABLE = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"]'

export function TapHaptics() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest(TAPPABLE) : null
      if (!target) return
      if (target.closest('[aria-hidden="true"]')) return
      if (target instanceof HTMLButtonElement && target.disabled) return
      if (target.getAttribute('aria-disabled') === 'true') return
      hapticTap()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
  return null
}

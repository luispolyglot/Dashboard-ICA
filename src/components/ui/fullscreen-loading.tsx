import { IcaLogo } from '@/modules/game/IcaLogo'

type FullscreenLoadingProps = {
  label?: string
}

/**
 * Pantalla de carga: el logo ICA quieto en el centro, idéntico (tamaño, sitio y colores) al de
 * `index.html`. Así, al pasar de la carga inicial a esta y luego a la app, el logo no salta.
 * El texto solo lo lee el lector de pantalla.
 */
export function FullscreenLoading({
  label = 'Cargando...',
}: FullscreenLoadingProps) {
  return (
    <div
      className='fixed inset-0 flex items-center justify-center bg-background'
      role='status'
      aria-live='polite'
    >
      {/* size 40 = 150 × 105 px, como el logo de index.html */}
      <IcaLogo size={40} />
      <span className='sr-only'>{label}</span>
    </div>
  )
}

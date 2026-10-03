/**
 * Pantalla de arranque de la app (sesión y datos iniciales).
 *
 * Es idéntica a la que pinta index.html mientras se descarga la app, así que
 * al pasar de una a otra (y entre los distintos pasos del arranque) no se nota
 * ningún salto: solo se ve el logo y una barra que avanza.
 */
const BAR_CYCLE_MS = 1200

type FullscreenLoadingProps = {
  label?: string
}

export function FullscreenLoading({ label = 'Cargando...' }: FullscreenLoadingProps) {
  // La barra va sincronizada con el reloj de la página: aunque este componente
  // se monte varias veces seguidas, la animación continúa sin reiniciarse.
  const barDelay = `-${Math.round(performance.now() % BAR_CYCLE_MS)}ms`

  return (
    <div
      role='status'
      aria-live='polite'
      className='fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-background px-6'
    >
      <img src='/logo-light.png' alt='' className='h-28 w-28 rounded-3xl dark:hidden' />
      <img src='/logo-dark.png' alt='' className='hidden h-28 w-28 rounded-3xl dark:block' />
      <div className='relative h-1 w-32 overflow-hidden rounded-full bg-primary/15' aria-hidden='true'>
        <span
          className='app-splash-bar absolute inset-y-0 left-0 w-2/5 rounded-full bg-primary'
          style={{ animationDelay: barDelay }}
        />
      </div>
      <span className='sr-only'>{label}</span>
    </div>
  )
}

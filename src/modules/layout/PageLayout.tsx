import { Button } from '@/components/ui/button'
import { ChevronLeftIcon } from 'lucide-react'
import type { PropsWithChildren } from 'react'
import { Link } from 'react-router-dom'
import { t } from '@/i18n'

/**
 * Marco de las páginas.
 * - Normal: margen alrededor y botón «Volver» (el de siempre).
 * - `flush` (pantallas del modo juego): sin marco, para aprovechar todo el ancho del
 *   móvil; la vuelta atrás es una flecha pequeña (o nada en las
 *   pestañas principales, con `withBackButton={false}`).
 */
export function PageLayout({
  children,
  withBackButton = true,
  backTo = '..',
  flush = false,
}: PropsWithChildren & { withBackButton?: boolean; backTo?: string; flush?: boolean }) {
  if (flush) {
    return (
      <div className='relative mx-auto flex w-full flex-1 flex-col'>
        {withBackButton && (
          <div className='px-2 pt-1 lg:px-6 lg:pt-4'>
            <Link
              to={backTo}
              className='inline-flex h-9 items-center gap-0.5 rounded-xl pr-3 pl-1 text-sm font-extrabold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
            >
              <ChevronLeftIcon className='size-5' strokeWidth={2.6} aria-hidden='true' />
              {t('Volver')}
            </Link>
          </div>
        )}
        {children}
      </div>
    )
  }

  return (
    <div className='relative container mx-auto flex flex-1 flex-col p-4 pb-0 lg:pb-4'>
      {withBackButton && (
        <div className='pl-4'>
          <Button variant='outline' size='sm' asChild>
            <Link to={backTo}> {t('Volver')} </Link>
          </Button>
        </div>
      )}
      {children}
    </div>
  )
}

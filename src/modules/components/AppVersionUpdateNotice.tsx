import { Button } from '@/components/ui/button'
import { useVersionCheck } from '../hooks/useVersionCheck'

export function AppVersionUpdateNotice() {
  const updateAvailable = useVersionCheck()

  if (!updateAvailable) return null

  return (
    <div className='fixed right-4 bottom-4 z-50 w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-border bg-background p-3 shadow-xl'>
      <p className='text-sm font-semibold'>Nueva versión disponible</p>
      <p className='mt-1 text-xs text-muted-foreground'>
        Hay una actualización de la app. Recarga para usar la versión más
        reciente.
      </p>
      <div className='mt-3 flex justify-end'>
        <Button
          type='button'
          size='sm'
          onClick={() => window.location.reload()}
        >
          Recargar
        </Button>
      </div>
    </div>
  )
}

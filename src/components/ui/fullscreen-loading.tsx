import { LoaderCircle } from 'lucide-react'

type FullscreenLoadingProps = {
  label?: string
}

export function FullscreenLoading({
  label = 'Cargando...',
}: FullscreenLoadingProps) {
  return (
    <div className='flex w-full min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center text-muted-foreground'>
      <LoaderCircle
        className='h-7 w-7 animate-spin text-primary'
        aria-hidden='true'
      />
      <span className='text-sm font-medium'>{label}</span>
    </div>
  )
}

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { InfoIcon } from 'lucide-react'
import type { ReviewPlayStyle } from '../review/playStyle'

type ReviewPlayStyleControlProps = {
  playStyle: ReviewPlayStyle
  pendingOnly: boolean
  pendingCount: number
  onPlayStyleChange: (style: ReviewPlayStyle) => void
  onPendingOnlyChange: (pendingOnly: boolean) => void
  className?: string
}

export function ReviewPlayStyleControl({
  playStyle,
  pendingOnly,
  pendingCount,
  onPlayStyleChange,
  onPendingOnlyChange,
  className,
}: ReviewPlayStyleControlProps) {
  const checked = playStyle === 'goal'
  const playStyleLabel = checked
    ? 'Modo objetivo (10 correctas)'
    : 'Modo clasico (10 tarjetas)'
  const pendingOnlyLabel = pendingOnly
    ? pendingCount === 0
      ? 'Filtro activo: no tienes tarjetas no aprendidas o falladas.'
      : `Filtro activo: practicar solo no aprendidas o falladas (${pendingCount}).`
    : 'Practicar SOLO con las tarjetas no aprendidas o falladas'

  return (
    <div className={cn('inline-flex flex-col items-end gap-2', className)}>
      <div className='inline-flex items-center gap-2'>
        <Label
          htmlFor='review-play-style-goal'
          className='text-[11px] font-semibold text-muted-foreground'
        >
          {playStyleLabel}
        </Label>
        <Switch
          id='review-play-style-goal'
          checked={checked}
          onCheckedChange={(nextChecked) =>
            onPlayStyleChange(nextChecked ? 'goal' : 'classic')
          }
          aria-label='Cambiar forma de jugar flashcards'
        />

        <Dialog>
          <DialogTrigger asChild>
            <Button
              type='button'
              variant='ghost'
              size='icon-sm'
              aria-label='Información de modos de juego'
            >
              <InfoIcon className='size-4 text-muted-foreground' />
            </Button>
          </DialogTrigger>
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle>Formas de jugar flashcards</DialogTitle>
              <DialogDescription>
                Puedes alternar entre el modo clásico y el modo objetivo cuando
                quieras.
              </DialogDescription>
            </DialogHeader>

            <div className='space-y-3 text-sm'>
              <div className='rounded-lg border border-border bg-muted/30 p-3'>
                <p className='mb-1 font-semibold'>Modo clásico</p>
                <p className='text-muted-foreground'>
                  Ronda de 10 flashcards. Termina cuando respondes la última
                  tarjeta.
                </p>
              </div>

              <div className='rounded-lg border border-border bg-muted/30 p-3'>
                <p className='mb-1 font-semibold'>Modo objetivo</p>
                <p className='text-muted-foreground'>
                  Requiere 20 palabras ICA mínimas por modo. Usa todas tus
                  tarjetas disponibles y termina al llegar a 10 respuestas
                  correctas.
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <label
        htmlFor='review-pending-only'
        className='inline-flex max-w-[320px] items-start gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-left text-[11px] font-medium text-muted-foreground'
      >
        <input
          id='review-pending-only'
          type='checkbox'
          checked={pendingOnly}
          onChange={(event) => onPendingOnlyChange(event.target.checked)}
          className='mt-0.5 h-4 w-4 accent-primary'
          aria-label='Filtrar por tarjetas no aprendidas o falladas'
        />
        <span
          className={cn(
            pendingOnly && 'text-foreground',
            pendingOnly && pendingCount === 0 && 'text-red-600 dark:text-red-300',
          )}
        >
          {pendingOnlyLabel}
        </span>
      </label>
    </div>
  )
}

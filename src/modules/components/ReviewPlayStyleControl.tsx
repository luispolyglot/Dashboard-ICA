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
  onPlayStyleChange: (style: ReviewPlayStyle) => void
  className?: string
}

export function ReviewPlayStyleControl({
  playStyle,
  onPlayStyleChange,
  className,
}: ReviewPlayStyleControlProps) {
  const checked = playStyle === 'goal'
  const playStyleLabel = checked
    ? 'Modo objetivo (10 correctas)'
    : 'Modo clasico (10 tarjetas)'

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
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
  )
}

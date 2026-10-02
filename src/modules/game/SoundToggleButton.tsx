import { useEffect, useState } from 'react'
import { Volume2Icon, VolumeXIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { gameSfx, isGameSoundEnabled, setGameSoundEnabled } from './sfx'

const SOUND_TOGGLED_EVENT = 'ica:game-sound-toggled'

/**
 * Altavoz para quitar o poner los sonidos del juego (acierto, fallo, celebración…) sin salir
 * de la partida. Es el mismo ajuste que el de Perfil: se guarda en este dispositivo.
 */
export function SoundToggleButton({ className }: { className?: string }) {
  const [enabled, setEnabled] = useState(() => isGameSoundEnabled())

  useEffect(() => {
    const sync = () => setEnabled(isGameSoundEnabled())
    window.addEventListener(SOUND_TOGGLED_EVENT, sync)
    return () => window.removeEventListener(SOUND_TOGGLED_EVENT, sync)
  }, [])

  return (
    <button
      type='button'
      onClick={() => {
        const next = !enabled
        setGameSoundEnabled(next)
        setEnabled(next)
        window.dispatchEvent(new Event(SOUND_TOGGLED_EVENT))
        if (next) gameSfx.tap()
      }}
      aria-pressed={!enabled}
      aria-label={enabled ? t('Quitar el sonido') : t('Poner el sonido')}
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      {enabled ? (
        <Volume2Icon className='size-6' strokeWidth={2.6} aria-hidden='true' />
      ) : (
        <VolumeXIcon className='size-6' strokeWidth={2.6} aria-hidden='true' />
      )}
    </button>
  )
}

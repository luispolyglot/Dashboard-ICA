import { t } from '@/i18n'
import { ExternalLinkIcon, VideoIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconTile, Panel } from '../../game/ui'
import { ICADEMY_COMMUNITY_CALENDAR_URL } from '../../constants/community'

/**
 * Las clases en directo se dan en la comunidad ICADEMY (Skool), no en esta app (Luis, 9 Oct).
 * Aviso del Calendario ICADEMY con el enlace al calendario de la comunidad.
 */
export function CommunityClassesNotice() {
  return (
    <Panel tone='i' className='flex flex-col gap-3 sm:flex-row sm:items-center'>
      <span className='flex min-w-0 flex-1 items-center gap-3'>
        <IconTile tone='i' solid size={48}>
          <VideoIcon className='size-6' strokeWidth={2.4} />
        </IconTile>
        <span className='min-w-0 flex-1'>
          <span className='block leading-tight font-extrabold'>
            {t('Las clases son en la comunidad ICADEMY')}
          </span>
          <span className='mt-1 block text-sm font-semibold text-muted-foreground'>
            {t('Para entrar a tu clase, ábrela desde el calendario de la comunidad.')}
          </span>
        </span>
      </span>
      <Button asChild variant='i' size='lg' className='w-full sm:w-auto'>
        <a href={ICADEMY_COMMUNITY_CALENDAR_URL} target='_blank' rel='noopener noreferrer'>
          {t('Ir al calendario de la comunidad')}
          <ExternalLinkIcon data-icon='inline-end' />
        </a>
      </Button>
    </Panel>
  )
}

/** Botón de la ficha de una clase: lleva al calendario de la comunidad, donde está el enlace. */
export function CommunityClassLinkButton() {
  return (
    <Button asChild variant='i' size='lg' className='w-full'>
      <a href={ICADEMY_COMMUNITY_CALENDAR_URL} target='_blank' rel='noopener noreferrer'>
        <VideoIcon />
        {t('Entrar desde la comunidad')}
        <ExternalLinkIcon data-icon='inline-end' />
      </a>
    </Button>
  )
}

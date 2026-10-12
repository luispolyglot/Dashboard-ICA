import type { ReactNode } from 'react'
import { ChevronRightIcon, MicIcon, SquareIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LanguageFlag } from './LanguagePicker'
import { inSentence, type ActivationPair } from '../services/activationGuide'
import { langName, t } from '@/i18n'

/**
 * «ASÍ SE ACTIVA UNA FRASE» (Luis, 9 Oct): the first time you tap Activar frase, before the
 * recording starts, a short explanation with the first part of your own phrase as the example:
 * the coloured part in your language, the same part in the one you learn, «Siguiente parte»,
 * and so on until the end. It can be opened again from the «?» while recording.
 */
export function ActivationHowToDialog({
  open,
  onOpenChange,
  pair,
  multiplePairs,
  nativeLang,
  targetLang,
  startsRecording,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The first part of the phrase, shown as the example. */
  pair: ActivationPair | null
  multiplePairs: boolean
  nativeLang: string
  targetLang: string
  /** True when confirming starts the recording (first tap on Activar frase). */
  startsRecording: boolean
  onConfirm: () => void
}) {
  const native = inSentence(langName(nativeLang))
  const target = inSentence(langName(targetLang))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[92dvh] overflow-y-auto sm:max-w-md'>
        <DialogHeader className='text-left'>
          <DialogTitle className='pr-6 font-display text-2xl font-black tracking-tight'>
            {t('Así se activa una frase')}
          </DialogTitle>
          <DialogDescription className='text-base font-semibold'>
            {multiplePairs
              ? t('Vas a decir la frase parte por parte, sin parar la grabación.')
              : t('Vas a decir la frase en voz alta, primero en {native} y después en {target}.', { native, target })}
          </DialogDescription>
        </DialogHeader>

        <ol className='m-0 flex list-none flex-col gap-3 p-0'>
          <Step number={1} icon={<LanguageFlag language={nativeLang} size={26} />}>
            {multiplePairs
              ? t('Di en voz alta la parte coloreada en {native}.', { native })
              : t('Di la frase en voz alta en {native}.', { native })}
            {pair?.native ? (
              <Example background='var(--ica-gold-soft)' color='var(--ica-gold-ink)' ring='var(--ica-gold)'>
                {pair.native}
              </Example>
            ) : null}
          </Step>
          <Step number={2} icon={<LanguageFlag language={targetLang} size={26} />}>
            {multiplePairs
              ? t('Después, di esa misma parte en {target}.', { target })
              : t('Después, dila en {target}.', { target })}
            {pair?.target ? (
              <Example background='var(--ica-i-soft)' color='var(--ica-i-ink)' ring='var(--ica-i)'>
                {pair.target}
              </Example>
            ) : null}
          </Step>
          {multiplePairs ? (
            <Step number={3} icon={<ChevronRightIcon className='size-5' strokeWidth={3} />}>
              {t('Toca «Siguiente parte» y haz lo mismo con la siguiente parte coloreada, sin parar de grabar.')}
            </Step>
          ) : null}
          <Step number={multiplePairs ? 4 : 3} icon={<SquareIcon className='size-4 fill-current' strokeWidth={2.4} />}>
            {multiplePairs
              ? t('Cuando termines la última parte, toca el cuadrado para parar y guardar tu audio.')
              : t('Al terminar, toca el cuadrado para parar y guardar tu audio.')}
          </Step>
        </ol>

        <Button type='button' size='xl' variant='a' className='mt-1 w-full' onClick={onConfirm}>
          {startsRecording ? <MicIcon className='size-5' strokeWidth={2.6} /> : null}
          {startsRecording ? t('Entendido, empezar a grabar') : t('Entendido')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

function Step({ number, icon, children }: { number: number; icon: ReactNode; children: ReactNode }) {
  return (
    <li className='grid grid-cols-[auto_1fr] items-start gap-3'>
      <span className='flex flex-col items-center gap-1'>
        <span
          className='grid size-7 place-items-center rounded-full text-sm font-black text-white'
          style={{ background: 'var(--ica-a)' }}
        >
          {number}
        </span>
        <span className='grid min-h-5 place-items-center text-muted-foreground'>{icon}</span>
      </span>
      <div className='pt-0.5 text-[15px] leading-snug font-bold'>{children}</div>
    </li>
  )
}

function Example({
  children,
  background,
  color,
  ring,
}: {
  children: ReactNode
  background: string
  color: string
  ring: string
}) {
  return (
    <span
      className='mt-1.5 block w-fit max-w-full rounded-lg px-2 py-0.5 text-base font-black'
      style={{ background, color, boxShadow: `inset 0 -2px 0 ${ring}` }}
    >
      {children}
    </span>
  )
}

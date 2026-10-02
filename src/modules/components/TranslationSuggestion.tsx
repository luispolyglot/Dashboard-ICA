import { SparklesIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'

type TranslationSuggestionProps = {
  suggestion: string | null
  loading: boolean
  onAccept: () => void
  label: string
}

/** Sugerencia de traducción de la IA: bloque azul suave con la palabra grande y «Usar». */
export function TranslationSuggestion({ suggestion, loading, onAccept, label }: TranslationSuggestionProps) {
  if (!suggestion && !loading) return null

  return (
    <div
      className='mt-2 flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5'
      style={{
        background: 'var(--ica-i-soft)',
        borderColor: 'color-mix(in oklab, var(--ica-i) 32%, transparent)',
      }}
      aria-live='polite'
    >
      <span
        className='flex size-9 shrink-0 items-center justify-center rounded-xl text-white'
        style={{ background: 'var(--ica-i)', boxShadow: '0 3px 0 var(--ica-i-edge)' }}
        aria-hidden='true'
      >
        <SparklesIcon className={loading ? 'size-5 animate-pulse' : 'size-5'} strokeWidth={2.4} />
      </span>
      {loading ? (
        <span className='min-w-0 flex-1'>
          <span className='block text-xs font-extrabold' style={{ color: 'var(--ica-i-ink)' }}>
            {t('Traduciendo...')}
          </span>
          <span className='mt-1.5 block h-3 w-2/3 animate-pulse rounded-full bg-[color-mix(in_oklab,var(--ica-i)_22%,var(--card))]' />
        </span>
      ) : (
        <>
          <span className='min-w-0 flex-1'>
            <span className='block text-[11px] font-extrabold tracking-[0.06em] uppercase' style={{ color: 'var(--ica-i-ink)' }}>
              {label}
            </span>
            <span className='block text-base leading-snug font-extrabold break-words'>{suggestion}</span>
          </span>
          <Button type='button' size='sm' variant='i' onClick={onAccept} className='h-9 px-4'>
            {t('Usar')}
          </Button>
        </>
      )}
    </div>
  )
}

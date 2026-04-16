import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

type TranslationSuggestionProps = {
  suggestion: string | null
  loading: boolean
  onAccept: () => void
  label: string
}

export function TranslationSuggestion({ suggestion, loading, onAccept, label }: TranslationSuggestionProps) {
  if (!suggestion && !loading) return null

  return (
    <Card className='mt-2 flex-row items-center gap-2 px-3.5 py-2'>
      {loading ? (
        <span className='text-xs text-muted-foreground'>Traduciendo... 💭</span>
      ) : (
        <>
          <span className='text-[11px] text-muted-foreground'>{label}:</span>
          <span className='flex-1 text-sm font-semibold'>{suggestion}</span>
          <Button type='button' size='sm' variant='secondary' onClick={onAccept}>
            Usar
          </Button>
        </>
      )}
    </Card>
  )
}

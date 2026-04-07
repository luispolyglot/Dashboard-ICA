type TranslationSuggestionProps = {
  suggestion: string | null
  loading: boolean
  onAccept: () => void
  label: string
}

export function TranslationSuggestion({ suggestion, loading, onAccept, label }: TranslationSuggestionProps) {
  if (!suggestion && !loading) return null

  return (
    <div
      className={`mt-2 flex items-center gap-2 rounded-lg border px-3.5 py-2 ${
        loading ? 'border-slate-800 bg-slate-950' : 'border-blue-900 bg-blue-950/30'
      }`}
    >
      {loading ? (
        <span className='text-xs text-slate-500'>Traduciendo... 💭</span>
      ) : (
        <>
          <span className='text-[11px] text-slate-500'>{label}:</span>
          <span className='flex-1 text-sm font-semibold text-blue-400'>{suggestion}</span>
          <button
            type='button'
            onClick={onAccept}
            className='whitespace-nowrap rounded-md bg-blue-900 px-3 py-1 text-xs font-semibold text-blue-300'
          >
            Usar
          </button>
        </>
      )}
    </div>
  )
}

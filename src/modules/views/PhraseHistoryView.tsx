import { useEffect, useState } from 'react'
import { fetchPhraseHistory } from '../services/phraseHistory'
import type { PhraseGenerationEntry } from '../types'

export function PhraseHistoryView() {
  const [items, setItems] = useState<PhraseGenerationEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchPhraseHistory(40)
      .then((rows) => {
        setItems(rows)
        setError(null)
      })
      .catch(() => {
        setError('No se pudo cargar tu historial de frases')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  return (
    <section className='mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-5 py-8'>
      <h2 className='mb-1 font-serif text-3xl font-bold text-slate-100'>⚡ Mis Frases de Activacion</h2>
      <p className='mb-6 text-sm text-slate-500'>Historial con frase, traduccion, palabras usadas y metadata.</p>

      {loading && <p className='text-sm text-slate-500'>Cargando historial...</p>}
      {error && <p className='text-sm text-red-400'>{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p className='text-sm text-slate-500'>Todavia no generaste frases.</p>
      )}

      <div className='space-y-3'>
        {items.map((item) => (
          <article key={item.id} className='rounded-2xl border border-slate-800 bg-slate-950 p-4'>
            <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
              <span className='text-xs text-slate-500'>
                {new Date(item.created_at).toLocaleString('es-ES', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span className='rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-400'>
                {item.model || 'modelo no registrado'}
              </span>
            </div>

            <p className='font-serif text-xl font-bold text-slate-100'>
              {item.generated_phrase || 'Sin frase registrada'}
            </p>
            <p className='mt-2 text-sm text-slate-300'>{item.translation || 'Sin traduccion registrada'}</p>

            <div className='mt-3 flex flex-wrap gap-1.5'>
              {(item.source_words || []).map((word) => (
                <span key={`${item.id}-${word}`} className='rounded-md bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-400'>
                  {word}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

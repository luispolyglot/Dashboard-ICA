import { useEffect, useState } from 'react'
import { SpeakButton } from '../components/SpeakButton'
import {
  deletePhraseHistoryEntry,
  fetchPhraseHistory,
} from '../services/phraseHistory'
import { stopTTS } from '../services/tts'
import type { PhraseGenerationEntry } from '../types'

type PhraseHistoryViewProps = {
  targetLang: string
}

export function PhraseHistoryView({ targetLang }: PhraseHistoryViewProps) {
  const [items, setItems] = useState<PhraseGenerationEntry[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

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

    return () => {
      stopTTS()
    }
  }, [])

  const handleDelete = async (id: string): Promise<void> => {
    if (deletingId) return

    setDeletingId(id)
    try {
      await deletePhraseHistoryEntry(id)
      setItems((prev) => prev.filter((item) => item.id !== id))
      setConfirmDeleteId(null)
    } catch {
      setError('No se pudo eliminar la frase')
    } finally {
      setDeletingId(null)
    }
  }

  const visibleItems = items.filter((item) => {
    const q = query.trim().toLowerCase()
    if (!q) return true

    const phrase = (item.generated_phrase || '').toLowerCase()
    const translation = (item.translation || '').toLowerCase()
    const sourceWords = (item.source_words || []).join(' ').toLowerCase()

    return (
      phrase.includes(q) || translation.includes(q) || sourceWords.includes(q)
    )
  })

  return (
    <section className='mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-5 py-8'>
      <h2 className='mb-1 font-serif text-3xl font-bold text-slate-100'>
        ⚡ Mis Frases de Activacion
      </h2>
      <p className='mb-6 text-sm text-slate-500'>
        Historial con frase, traduccion, palabras usadas y metadata.
      </p>

      <div className='mb-5 relative'>
        <span className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500'>
          🔎
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder='Buscar por palabra o frase...'
          className='w-full rounded-lg border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none'
        />
      </div>

      {loading && (
        <p className='text-sm text-slate-500'>Cargando historial...</p>
      )}
      {error && <p className='text-sm text-red-400'>{error}</p>}

      {!loading && !error && visibleItems.length === 0 && (
        <p className='text-sm text-slate-500'>Todavia no generaste frases.</p>
      )}

      <div className='space-y-3'>
        {visibleItems.map((item) => (
          <article
            key={item.id}
            className='rounded-2xl border border-slate-800 bg-slate-950 p-4'
          >
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
            </div>

            <p className='font-serif text-xl font-bold text-slate-100'>
              {item.generated_phrase || 'Sin frase registrada'}
            </p>
            <p className='mt-2 text-sm text-slate-300'>
              {item.translation || 'Sin traduccion registrada'}
            </p>

            {item.generated_phrase && (
              <div className='mt-3'>
                <SpeakButton
                  text={item.generated_phrase}
                  langName={targetLang}
                  color='#EAB308'
                />
              </div>
            )}

            <div className='mt-3 flex flex-wrap gap-1.5'>
              {(item.source_words || []).map((word) => (
                <span
                  key={`${item.id}-${word}`}
                  className='rounded-md bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-400'
                >
                  {word}
                </span>
              ))}
            </div>

            {confirmDeleteId === item.id ? (
              <div className='mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-red-500/20 pt-3'>
                <span className='text-sm text-red-400'>
                  ¿Eliminar esta frase?
                </span>
                <div className='flex gap-2'>
                  <button
                    type='button'
                    onClick={() => handleDelete(item.id)}
                    disabled={deletingId === item.id}
                    className='rounded-md bg-red-500 px-4 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50'
                  >
                    {deletingId === item.id ? 'Eliminando...' : 'Si, eliminar'}
                  </button>
                  <button
                    type='button'
                    onClick={() => setConfirmDeleteId(null)}
                    disabled={deletingId === item.id}
                    className='rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-400 disabled:cursor-not-allowed disabled:opacity-50'
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className='mt-4 border-t border-slate-800 pt-3'>
                <button
                  type='button'
                  onClick={() => setConfirmDeleteId(item.id)}
                  className='rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-red-400'
                >
                  Eliminar frase
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

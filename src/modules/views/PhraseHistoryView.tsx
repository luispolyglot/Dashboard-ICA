import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { RomanizationHint } from '../components/RomanizationHint'
import { SpeakButton } from '../components/SpeakButton'
import {
  deletePhraseHistoryEntry,
  fetchPhraseHistory,
} from '../services/phraseHistory'
import { stopTTS } from '../services/tts'
import type { PhraseGenerationEntry } from '../types'
import { CopyIcon, Trash2Icon } from 'lucide-react'

type PhraseHistoryViewProps = {
  targetLang: string
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightMatch(text: string, query: string): ReactNode {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return text

  const regex = new RegExp(`(${escapeRegex(trimmedQuery)})`, 'gi')
  const parts = text.split(regex)

  return parts.map((part, index) =>
    part.toLowerCase() === trimmedQuery.toLowerCase() ? (
      <mark
        key={`${part}-${index}`}
        className='rounded-sm bg-primary/20 px-0.5 text-primary'
      >
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  )
}

export function PhraseHistoryView({ targetLang }: PhraseHistoryViewProps) {
  const [items, setItems] = useState<PhraseGenerationEntry[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [copyingId, setCopyingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    fetchPhraseHistory(40, targetLang)
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
  }, [targetLang])

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

  const handleCopyPhrase = async (
    id: string,
    phrase: string | null,
    translation: string | null = null,
  ): Promise<void> => {
    if (!phrase || copyingId) return

    setCopyingId(id)
    try {
      const completedPhrase = phrase + '\n\n' + translation
      await navigator.clipboard.writeText(completedPhrase)
      setCopiedId(id)
      window.setTimeout(() => {
        setCopiedId((current) => (current === id ? null : current))
      }, 1400)
    } finally {
      setCopyingId(null)
    }
  }

  return (
    <section className='mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-5 py-8'>
      <h2 className='mb-1 font-serif text-3xl font-bold'>
        ⚡ Mis Frases de Activación
      </h2>
      <p className='mb-6 text-sm text-muted-foreground'>
        Historial con frase, traducción, palabras usadas y metadata.
      </p>

      <div className='mb-5 relative'>
        <span className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground'>
          🔎
        </span>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder='Buscar por palabra o frase...'
          className='pl-9'
        />
      </div>

      {loading && (
        <p className='text-sm text-muted-foreground'>Cargando historial...</p>
      )}
      {error && <p className='text-sm text-red-400'>{error}</p>}

      {!loading && !error && visibleItems.length === 0 && (
        <p className='text-sm text-muted-foreground'>
          Todavía no generaste frases.
        </p>
      )}

      <div className='space-y-3'>
        {visibleItems.map((item) => (
          <Card key={item.id} className='rounded-2xl'>
            <CardContent>
              <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
                <span className='text-xs text-muted-foreground'>
                  {new Date(item.created_at).toLocaleString('es-ES', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              <p className='font-serif text-xl font-bold'>
                {highlightMatch(
                  item.generated_phrase || 'Sin frase registrada',
                  query,
                )}
              </p>
              {item.generated_phrase && (
                <RomanizationHint
                  text={item.generated_phrase}
                  language={targetLang}
                />
              )}
              <p className='mt-2 text-sm text-muted-foreground'>
                {highlightMatch(
                  item.translation || 'Sin traducción registrada',
                  query,
                )}
              </p>

              {item.generated_phrase && (
                <div className='mt-3'>
                  <SpeakButton
                    text={item.generated_phrase}
                    langName={targetLang}
                    color='#3B82F6'
                  />
                </div>
              )}

              <div className='mt-3 flex flex-wrap gap-1.5'>
                {(item.source_words || []).map((word) => (
                  <span
                    key={`${item.id}-${word}`}
                    className='rounded-md bg-primary/30 px-2.5 py-0.5 text-xs font-semibold text-white'
                  >
                    {highlightMatch(word, query)}
                  </span>
                ))}
              </div>

              {confirmDeleteId === item.id ? (
                <div className='mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-red-500/20 pt-3'>
                  <span className='text-sm text-red-400'>
                    ¿Eliminar esta frase?
                  </span>
                  <div className='flex gap-2'>
                    <Button
                      type='button'
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      variant='destructive'
                      size='sm'
                    >
                      {deletingId === item.id
                        ? 'Eliminando...'
                        : 'Sí, eliminar'}
                    </Button>
                    <Button
                      type='button'
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={deletingId === item.id}
                      variant='outline'
                      size='sm'
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className='mt-4 flex flex-wrap gap-2 border-t border-border pt-3'>
                  <Button
                    type='button'
                    onClick={() =>
                      void handleCopyPhrase(
                        item.id,
                        item.generated_phrase,
                        item.translation,
                      )
                    }
                    variant='outline'
                    size='sm'
                    disabled={!item.generated_phrase || copyingId === item.id}
                  >
                    <CopyIcon className='size-4' />
                    {copyingId === item.id
                      ? 'Copiando...'
                      : copiedId === item.id
                        ? 'Copiadas'
                        : 'Copiar frases'}
                  </Button>
                  <Button
                    type='button'
                    onClick={() => setConfirmDeleteId(item.id)}
                    variant='destructive'
                    size='sm'
                  >
                    Eliminar frase
                    <Trash2Icon className='size-4 ml-1' />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}

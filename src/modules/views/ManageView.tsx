import { useEffect, useState } from 'react'
import { CopyIcon, DownloadIcon, Trash2Icon } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import type { Dispatch, SetStateAction } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { RomanizationHint } from '../components/RomanizationHint'
import { IMPORTANCE_LEVELS, getImportance } from '../constants'
import { fetchWordExample } from '../services/anthropic'
import { fetchPhraseHistory } from '../services/phraseHistory'
import { saveData } from '../services/storage'
import {
  copyWordsToClipboard,
  downloadWordsAsDocx,
  downloadWordsAsPdf,
} from '../services/wordExport'
import { sortChronological } from '../utils'
import type { AppConfig, ImportanceKey, Lexicard } from '../types'

type ManageViewProps = {
  cards: Lexicard[]
  setCards: Dispatch<SetStateAction<Lexicard[]>>
  config: AppConfig
}

const TONE_CLASS: Record<ImportanceKey, string> = {
  vital: 'text-blue-400',
  frequent: 'text-emerald-400',
  occasional: 'text-amber-400',
  rare: 'text-orange-400',
  irrelevant: 'text-red-400',
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

function normalizeTerm(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function ManageView({ cards, setCards, config }: ManageViewProps) {
  const { user } = useAuth()
  const [filter, setFilter] = useState<ImportanceKey | 'all'>('all')
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTarget, setDraftTarget] = useState('')
  const [draftNative, setDraftNative] = useState('')
  const [draftExamplePhrase, setDraftExamplePhrase] = useState('')
  const [draftExampleTranslation, setDraftExampleTranslation] = useState('')
  const [draftImportance, setDraftImportance] = useState<ImportanceKey>('vital')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [generatingExampleId, setGeneratingExampleId] = useState<string | null>(
    null,
  )
  const [exampleErrorById, setExampleErrorById] = useState<
    Record<string, string>
  >({})
  const [busyExport, setBusyExport] = useState<null | 'copy' | 'docx' | 'pdf'>(
    null,
  )
  const [wordUsageCounts, setWordUsageCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    let active = true

    fetchPhraseHistory(300, config.targetLang)
      .then((rows) => {
        if (!active) return
        const next: Record<string, number> = {}
        rows.forEach((row) => {
          ;(row.source_words || []).forEach((word) => {
            const normalized = normalizeTerm(word)
            next[normalized] = (next[normalized] || 0) + 1
          })
        })
        setWordUsageCounts(next)
      })
      .catch(() => {
        if (!active) return
        setWordUsageCounts({})
      })

    return () => {
      active = false
    }
  }, [config.targetLang])

  const filteredByImportance =
    filter === 'all' ? cards : cards.filter((c) => c.importance === filter)
  const filtered = filteredByImportance.filter((card) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      card.target.toLowerCase().includes(q) ||
      card.native.toLowerCase().includes(q)
    )
  })
  const sorted = sortChronological(filtered)
  const ownerName =
    user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Usuario'

  const handleCopyWords = async (): Promise<void> => {
    if (busyExport) return
    setBusyExport('copy')
    try {
      await copyWordsToClipboard(ownerName, sorted)
    } finally {
      setBusyExport(null)
    }
  }

  const handleDownloadDocx = async (): Promise<void> => {
    if (busyExport) return
    setBusyExport('docx')
    try {
      await downloadWordsAsDocx(ownerName, sorted)
    } finally {
      setBusyExport(null)
    }
  }

  const handleDownloadPdf = async (): Promise<void> => {
    if (busyExport) return
    setBusyExport('pdf')
    try {
      await downloadWordsAsPdf(ownerName, sorted)
    } finally {
      setBusyExport(null)
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    const nextCards = cards.filter((c) => c.id !== id)
    setCards(nextCards)
    await saveData('dashboard-ICA-words', nextCards)
    setEditingId(null)
    setConfirmDeleteId(null)
  }

  const openEditor = (card: Lexicard): void => {
    setEditingId(card.id)
    setDraftTarget(card.target)
    setDraftNative(card.native)
    setDraftExamplePhrase(card.examplePhrase || '')
    setDraftExampleTranslation(card.exampleTranslation || '')
    setDraftImportance(card.importance)
    setConfirmDeleteId(null)
  }

  const closeEditor = (): void => {
    setEditingId(null)
    setConfirmDeleteId(null)
  }

  const handleSaveEdit = async (id: string): Promise<void> => {
    const nextCards = cards.map((card) => {
      if (card.id !== id) return card
      return {
        ...card,
        target: draftTarget.trim() || card.target,
        native: draftNative.trim() || card.native,
        examplePhrase: draftExamplePhrase.trim() || null,
        exampleTranslation: draftExampleTranslation.trim() || null,
        importance: draftImportance,
      }
    })

    setCards(nextCards)
    await saveData('dashboard-ICA-words', nextCards)
    closeEditor()
  }

  const handleGenerateExample = async (card: Lexicard): Promise<void> => {
    if (generatingExampleId) return

    setGeneratingExampleId(card.id)
    setExampleErrorById((prev) => ({ ...prev, [card.id]: '' }))
    try {
      const example = await fetchWordExample(
        card.target,
        card.native,
        config.targetLang,
        config.nativeLang,
        config.level || 'A2',
      )

      if (!example?.phrase || !example.translation) {
        setExampleErrorById((prev) => ({
          ...prev,
          [card.id]: 'No se pudo generar ejemplo ahora',
        }))
        return
      }

      const nextCards = cards.map((current) =>
        current.id === card.id
          ? {
              ...current,
              examplePhrase: example.phrase,
              exampleTranslation: example.translation,
            }
          : current,
      )

      setCards(nextCards)
      await saveData('dashboard-ICA-words', nextCards)
    } finally {
      setGeneratingExampleId(null)
    }
  }

  return (
    <section className='mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-5 py-8'>
      <h2 className='mb-1 font-serif text-3xl font-bold'>
        📖 Mi creación ICA
      </h2>
      <p className='mb-6 text-sm text-muted-foreground'>
        {cards.length} palabra{cards.length !== 1 ? 's' : ''} · Mas reciente
        primero
      </p>

      <div className='mb-4 flex flex-wrap items-center gap-2'>
        <div className='relative min-w-60 flex-1'>
          <span className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground'>
            🔎
          </span>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='Buscar palabra...'
            className='pl-9'
          />
        </div>

        <Button
          type='button'
          onClick={() => handleCopyWords()}
          disabled={sorted.length === 0 || busyExport !== null}
          variant='outline'
          size='sm'
        >
          <CopyIcon />
          {busyExport === 'copy' ? 'Copiando...' : 'Copiar'}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type='button'
              disabled={sorted.length === 0 || busyExport !== null}
              variant='outline'
              size='sm'
            >
              <DownloadIcon />
              {busyExport === 'docx' || busyExport === 'pdf'
                ? 'Generando...'
                : 'Descargar'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem onClick={() => void handleDownloadDocx()}>
              DOCX
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleDownloadPdf()}>
              PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className='mb-6 flex flex-wrap gap-1.5'>
        <Button
          type='button'
          onClick={() => setFilter('all')}
          variant={filter === 'all' ? 'default' : 'outline'}
          size='sm'
        >
          Todas ({cards.length})
        </Button>

        {IMPORTANCE_LEVELS.map((level) => {
          const count = cards.filter((c) => c.importance === level.key).length
          const selected = filter === level.key
          return (
            <Button
              key={level.key}
              type='button'
              onClick={() => setFilter(level.key)}
              variant={selected ? 'default' : 'outline'}
              size='sm'
              className={selected ? TONE_CLASS[level.key] : ''}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${TONE_CLASS[level.key].replace('text', 'bg')}`}
              />
              {count}
            </Button>
          )
        })}
      </div>

      {sorted.length === 0 && (
        <p className='mt-10 text-center text-sm text-muted-foreground'>
          No hay palabras con ese filtro.
        </p>
      )}

      {sorted.map((card) => {
        const importance = getImportance(card.importance)
        const isFailed = (card.streak || 0) === 0
        const isEditing = editingId === card.id
        const usageCount = wordUsageCounts[normalizeTerm(card.target)] || 0
        const usageLevel = usageCount >= 3 ? 2 : usageCount >= 1 ? 1 : 0
        const dateStr = card.createdAt
          ? new Date(card.createdAt).toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'short',
            })
          : ''

        return (
          <Card
            key={card.id}
            className={`mb-2.5 rounded-xl border p-3.5 ${
              isEditing
                ? 'border-primary/30 bg-primary/5'
                : usageLevel === 2
                  ? 'border-amber-400/70 bg-amber-500/10 shadow-[0_0_28px_-10px_rgba(251,191,36,0.95)]'
                  : usageLevel === 1
                    ? 'border-amber-400/50 bg-amber-500/5 shadow-[0_0_24px_-12px_rgba(251,191,36,0.7)]'
                  : ''
            }`}
          >
            <CardContent className='p-0'>
              <div className='flex items-center gap-2.5'>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${TONE_CLASS[card.importance].replace('text', 'bg')}`}
                />

                <div className='min-w-0 flex-1'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='text-base font-semibold'>
                      {highlightMatch(card.target, query)}
                    </span>
                    <span className='text-muted-foreground'>→</span>
                    <span className='text-base text-muted-foreground'>
                      {highlightMatch(card.native, query)}
                    </span>
                  </div>
                  <RomanizationHint
                    text={card.target}
                    language={card.targetLang || ''}
                  />

                  <div className='mt-1 flex flex-wrap items-center gap-2.5'>
                    <span className={`text-xs ${TONE_CLASS[card.importance]}`}>
                      {importance.label}
                    </span>
                    <span
                      className={`text-xs ${isFailed ? 'text-red-400' : 'text-emerald-400'}`}
                    >
                      {isFailed ? 'Por aprender' : `Racha ${card.streak}`}
                    </span>
                    {dateStr && (
                      <span className='text-[10px] text-muted-foreground'>
                        {dateStr}
                      </span>
                    )}
                    {usageLevel > 0 && (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          usageLevel === 2
                            ? 'border-amber-400/70 bg-amber-500/25 text-amber-600'
                            : 'border-amber-400/50 bg-amber-500/15 text-amber-500'
                        }`}
                      >
                        {usageLevel === 2
                          ? `Muy usada en activación (${usageCount})`
                          : 'Usada en activación'}
                      </span>
                    )}
                  </div>
                </div>

                {!isEditing && (
                  <Button
                    type='button'
                    onClick={() => openEditor(card)}
                    variant='outline'
                    size='sm'
                  >
                    Editar
                  </Button>
                )}
              </div>

              {isEditing && (
                <div className='mt-3 space-y-3 border-t border-border pt-3'>
                  <div className='grid gap-2 sm:grid-cols-2'>
                    <Input
                      value={draftTarget}
                      onChange={(event) => setDraftTarget(event.target.value)}
                    />
                    <Input
                      value={draftNative}
                      onChange={(event) => setDraftNative(event.target.value)}
                    />
                  </div>

                  <div className='grid gap-2'>
                    <Input
                      value={draftExamplePhrase}
                      onChange={(event) =>
                        setDraftExamplePhrase(event.target.value)
                      }
                      placeholder='Ejemplo (idioma objetivo)'
                    />
                    <Input
                      value={draftExampleTranslation}
                      onChange={(event) =>
                        setDraftExampleTranslation(event.target.value)
                      }
                      placeholder='Traduccion del ejemplo'
                    />

                    {!card.examplePhrase && (
                      <div>
                        <Button
                          type='button'
                          onClick={() => void handleGenerateExample(card)}
                          variant='secondary'
                          size='sm'
                          disabled={generatingExampleId === card.id}
                        >
                          {generatingExampleId === card.id
                            ? 'Generando ejemplo...'
                            : 'Generar ejemplo con IA'}
                        </Button>
                        {exampleErrorById[card.id] && (
                          <p className='mt-1 text-xs text-destructive'>
                            {exampleErrorById[card.id]}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className='flex flex-wrap gap-1.5'>
                    {IMPORTANCE_LEVELS.map((level) => (
                      <Button
                        key={level.key}
                        type='button'
                        onClick={() => setDraftImportance(level.key)}
                        variant={
                          draftImportance === level.key
                            ? 'secondary'
                            : 'outline'
                        }
                        size='sm'
                        className={
                          draftImportance === level.key
                            ? TONE_CLASS[level.key]
                            : ''
                        }
                      >
                        {level.label}
                      </Button>
                    ))}
                  </div>

                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    {confirmDeleteId === card.id ? (
                      <>
                        <span className='text-sm text-red-400'>
                          ¿Eliminar esta palabra?
                        </span>
                        <div className='flex gap-2'>
                          <Button
                            type='button'
                            onClick={() => handleDelete(card.id)}
                            variant='destructive'
                            size='sm'
                          >
                            Si, eliminar
                          </Button>
                          <Button
                            type='button'
                            onClick={() => setConfirmDeleteId(null)}
                            variant='outline'
                            size='sm'
                          >
                            Cancelar
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Button
                        type='button'
                        onClick={() => setConfirmDeleteId(card.id)}
                        variant='destructive'
                        size='sm'
                      >
                        Eliminar
                        <Trash2Icon className='size-4 ml-1' />
                      </Button>
                    )}

                    <div className='ml-auto flex gap-2'>
                      <Button
                        type='button'
                        onClick={closeEditor}
                        variant='outline'
                        size='sm'
                      >
                        Cancelar
                      </Button>
                      <Button
                        type='button'
                        onClick={() => handleSaveEdit(card.id)}
                        size='sm'
                      >
                        Guardar cambios
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </section>
  )
}

import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { CopyIcon, MicIcon, Trash2Icon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ActivatePhraseInMasterNoteModal } from '../components/ActivatePhraseInMasterNoteModal'
import { ExplorePhraseTokenModal } from '../components/ExplorePhraseTokenModal'
import { ExtractWordsToVaultModal } from '../components/ExtractWordsToVaultModal'
import { IcaDeletionWarningDialog } from '../components/IcaDeletionWarningDialog'
import { InteractivePhraseText } from '../components/InteractivePhraseText'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { RomanizationHint } from '../components/RomanizationHint'
import { SpeakButton } from '../components/SpeakButton'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { fetchPhraseVoiceActivations } from '../services/phraseVoiceActivations'
import {
  deletePhraseHistoryEntry,
  fetchPhraseHistory,
} from '../services/phraseHistory'
import { stopTTS } from '../services/tts'
import type {
  CEFRLevel,
  DailyProgressEntry,
  Lexicard,
  PhraseGenerationEntry,
  PhraseVoiceActivationEntry,
} from '../types'

type PhraseHistoryViewProps = {
  targetLang: string
  nativeLang: string
  level: CEFRLevel
  cards: Lexicard[]
  setCards: Dispatch<SetStateAction<Lexicard[]>>
  onWordAdded: () => Promise<DailyProgressEntry>
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

function toDayKey(value: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function PhraseHistoryView({
  targetLang,
  nativeLang,
  level,
  cards,
  setCards,
  onWordAdded,
}: PhraseHistoryViewProps) {
  const navigate = useNavigate()
  const [items, setItems] = useState<PhraseGenerationEntry[]>([])
  const [activationsByPhrase, setActivationsByPhrase] = useState<
    Record<string, PhraseVoiceActivationEntry[]>
  >({})
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<{
    id: string
    hasActivation: boolean
    createdAt: string
  } | null>(null)
  const [copyingId, setCopyingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [activateModalOpen, setActivateModalOpen] = useState(false)
  const [activatePhraseId, setActivatePhraseId] = useState<string | null>(null)
  const [extractModalOpen, setExtractModalOpen] = useState(false)
  const [extractPhraseId, setExtractPhraseId] = useState<string | null>(null)
  const [exploreModalOpen, setExploreModalOpen] = useState(false)
  const [exploreToken, setExploreToken] = useState('')
  const [explorePhrase, setExplorePhrase] = useState('')
  const [exploreTranslation, setExploreTranslation] = useState('')
  const todayKey = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }, [])
  const todayPhraseCount = useMemo(() => {
    return items.reduce((acc, item) => {
      return toDayKey(item.created_at) === todayKey ? acc + 1 : acc
    }, 0)
  }, [items, todayKey])

  useEffect(() => {
    const load = async (): Promise<void> => {
      setLoading(true)
      try {
        const rows = await fetchPhraseHistory(40, targetLang)
        setItems(rows)
        const activations = await fetchPhraseVoiceActivations(
          rows.map((r) => r.id),
        )
        setActivationsByPhrase(activations)
        setError(null)
      } catch (err) {
        console.error(err)
        setError('No se pudo cargar creación/activación de frases')
      } finally {
        setLoading(false)
      }
    }

    void load()

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
      setActivationsByPhrase((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setDeleteCandidate(null)
    } catch (err) {
      console.error(err)
      setError('No se pudo eliminar la frase')
    } finally {
      setDeletingId(null)
    }
  }

  const handleAskDelete = (id: string): void => {
    const phrase = items.find((item) => item.id === id)
    if (!phrase) return
    const hasActivation = (activationsByPhrase[id] || []).length > 0
    setDeleteCandidate({
      id,
      hasActivation,
      createdAt: phrase.created_at,
    })
  }

  const handleOpenActivateModal = (phraseId: string): void => {
    setActivatePhraseId(phraseId)
    setActivateModalOpen(true)
  }

  const handleOpenExtractModal = (phraseId: string): void => {
    setExtractPhraseId(phraseId)
    setExtractModalOpen(true)
  }

  const handleOpenExploreModal = (
    token: string,
    phrase: string,
    translation: string,
  ): void => {
    setExploreToken(token)
    setExplorePhrase(phrase)
    setExploreTranslation(translation)
    setExploreModalOpen(true)
  }

  const extractPhrase = items.find((item) => item.id === extractPhraseId) || null

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
    } catch (err) {
      console.error(err)
    } finally {
      setCopyingId(null)
    }
  }

  return (
    <section className='mx-auto flex h-auto w-full max-w-3xl flex-1 flex-col px-5 py-8 lg:h-full lg:min-h-0'>
      <h2 className='mb-0 lg:mb-1 font-serif text-2xl lg:text-3xl font-bold'>
        ⚡ Historial de Creación de Frases
      </h2>
      <p className='mb-4 lg:mb-6 text-sm text-muted-foreground'>
        Historial con frase, traducción y palabras usadas.
      </p>

      <div className='sticky top-0 z-20 -mx-5 mb-5 border-b border-border/60 bg-background/95 px-5 pt-1 pb-3 backdrop-blur lg:static lg:z-auto lg:m-0 lg:mb-5 lg:border-none lg:bg-transparent lg:px-0 lg:pt-0 lg:pb-0 lg:backdrop-blur-none'>
        <div className='relative'>
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
      </div>

      <div className='min-h-0 flex-1 overflow-visible lg:overflow-y-auto lg:pr-1'>
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
          {visibleItems.map((item) => {
            const activationCount = (activationsByPhrase[item.id] || []).length
            return (
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
                    <span
                      className={`inline-flex rounded-full p-1.5 ${
                        activationCount > 0
                          ? 'shadow-[0_0_10px_#eab30877,0_0_22px_#eab30844]'
                          : ''
                      }`}
                    >
                      <MicIcon className='size-4 text-muted-foreground' />
                    </span>
                  </div>

                  {item.generated_phrase ? (
                    <InteractivePhraseText
                      text={item.generated_phrase}
                      language={targetLang}
                      query={query}
                      onTokenClick={(token) =>
                        handleOpenExploreModal(
                          token,
                          item.generated_phrase || '',
                          item.translation || '',
                        )
                      }
                      className='font-serif text-xl font-bold'
                    />
                  ) : (
                    <p className='font-serif text-xl font-bold'>Sin frase registrada</p>
                  )}
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
                      disabled={
                        !item.generated_phrase || copyingId === item.id
                      }
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
                      onClick={() => handleAskDelete(item.id)}
                      variant='destructive'
                      size='sm'
                    >
                      Eliminar frase
                      <Trash2Icon className='ml-1 size-4' />
                    </Button>
                    <Button
                      type='button'
                      onClick={() => handleOpenExtractModal(item.id)}
                      variant='secondary'
                      size='sm'
                    >
                      📦 Extraer nuevas palabras
                    </Button>
                    {activationCount === 0 && (
                      <Button
                        type='button'
                        onClick={() => handleOpenActivateModal(item.id)}
                        variant='outline'
                        size='sm'
                        className='ml-auto'
                      >
                        🗣️ Activar frase
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      <Dialog
        open={Boolean(deleteCandidate?.hasActivation)}
        onOpenChange={(open) => {
          if (!open && !deletingId) setDeleteCandidate(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteCandidate?.hasActivation
                ? 'Frase activada en Nota Maestra'
                : '¿Eliminar esta frase?'}
            </DialogTitle>
            <DialogDescription>
              {deleteCandidate?.hasActivation
                ? 'Esta frase ya fue activada. Para borrarla, primero debes eliminarla desde la propia Nota Maestra.'
                : '¿Eliminar esta frase?'}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            {deleteCandidate?.hasActivation ? (
              <>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setDeleteCandidate(null)}
                >
                  Cerrar
                </Button>
                <Button
                  type='button'
                  onClick={() => {
                    setDeleteCandidate(null)
                    navigate(DASHBOARD_ROUTES.masterNotes)
                  }}
                >
                  Ir a Nota Maestra
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <IcaDeletionWarningDialog
        open={Boolean(deleteCandidate && !deleteCandidate.hasActivation)}
        onOpenChange={(open) => {
          if (!open && !deletingId) setDeleteCandidate(null)
        }}
        onConfirm={() => {
          if (!deleteCandidate?.id) return
          void handleDelete(deleteCandidate.id)
        }}
        loading={Boolean(deletingId)}
        title='Eliminar frase'
        resourceLabel='esta frase'
        resource='phrase'
        resourceDates={[deleteCandidate?.createdAt]}
        todayTotalCount={todayPhraseCount}
      />

      <ActivatePhraseInMasterNoteModal
        open={activateModalOpen}
        phraseId={activatePhraseId}
        targetLang={targetLang}
        nativeLang={nativeLang}
        onOpenChange={(open) => {
          setActivateModalOpen(open)
          if (!open) setActivatePhraseId(null)
        }}
      />

      <ExtractWordsToVaultModal
        open={extractModalOpen}
        onOpenChange={(open) => {
          setExtractModalOpen(open)
          if (!open) setExtractPhraseId(null)
        }}
        text={extractPhrase?.generated_phrase || ''}
        translation={extractPhrase?.translation || ''}
        seedWords={extractPhrase?.source_words || []}
        targetLang={targetLang}
        nativeLang={nativeLang}
        level={level}
        cards={cards}
        setCards={setCards}
        onWordAdded={onWordAdded}
      />

      <ExplorePhraseTokenModal
        open={exploreModalOpen}
        onOpenChange={setExploreModalOpen}
        token={exploreToken}
        phrase={explorePhrase}
        phraseTranslation={exploreTranslation}
        targetLang={targetLang}
        nativeLang={nativeLang}
        level={level}
        cards={cards}
        setCards={setCards}
        onWordAdded={onWordAdded}
      />
    </section>
  )
}

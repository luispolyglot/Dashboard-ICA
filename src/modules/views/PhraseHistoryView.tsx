import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import {
  CheckIcon,
  CopyIcon,
  MicIcon,
  PackagePlusIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { ActivatePhraseInMasterNoteModal } from '../components/ActivatePhraseInMasterNoteModal'
import { ExplorePhraseTokenModal } from '../components/ExplorePhraseTokenModal'
import { ExtractWordsToVaultModal } from '../components/ExtractWordsToVaultModal'
import { IcaDeletionWarningDialog } from '../components/IcaDeletionWarningDialog'
import { InteractivePhraseText } from '../components/InteractivePhraseText'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { t, tn, uiLocale } from '@/i18n'
import { RomanizationHint } from '../components/RomanizationHint'
import { SpeakButton } from '../components/SpeakButton'
import {
  EmptyState,
  GamePage,
  IconTile,
  PageTitle,
  PhaseLetter,
  Pill,
  RowGroup,
  SectionLabel,
} from '../game/ui'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { fetchPhraseVoiceActivations } from '../services/phraseVoiceActivations'
import {
  deletePhraseHistoryEntry,
  fetchPhraseHistoryPage,
} from '../services/phraseHistory'
import { stopTTS } from '../services/tts'
import type {
  DailyProgressEntry,
  Lexicard,
  PhraseGenerationEntry,
  PhraseVoiceActivationEntry,
} from '../types'

type PhraseHistoryViewProps = {
  targetLang: string
  nativeLang: string
  cards: Lexicard[]
  setCards: Dispatch<SetStateAction<Lexicard[]>>
  onWordAdded: () => Promise<DailyProgressEntry>
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightMatch(text: string, query: string): ReactNode {
  const terms = query
    .trim()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)

  if (!terms.length) return text

  const sortedTerms = Array.from(new Set(terms)).sort(
    (a, b) => b.length - a.length,
  )
  const pattern = sortedTerms.map((term) => escapeRegex(term)).join('|')
  if (!pattern) return text

  const regex = new RegExp(`(${pattern})`, 'gi')
  const parts = text.split(regex)

  return parts.map((part, index) =>
    sortedTerms.some((term) => term.toLowerCase() === part.toLowerCase()) ? (
      <mark
        key={`${part}-${index}`}
        className='rounded-md px-0.5 font-extrabold'
        style={{ background: 'color-mix(in oklab, var(--ica-c) 22%, transparent)', color: 'var(--ica-c-ink)' }}
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

/** "Hoy", "Ayer" o "Domingo, 27 de septiembre" (con el año si no es el actual). */
function dayLabel(key: string | null, todayKey: string): string {
  if (!key) return t('Sin fecha')
  if (key === todayKey) return t('Hoy')
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const now = new Date()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (date.getTime() === yesterday.getTime()) return t('Ayer')
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }
  if (year !== now.getFullYear()) options.year = 'numeric'
  const text = date.toLocaleDateString(uiLocale(), options)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function timeLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' })
}

/** Botón de acción discreto (solo icono) de cada fila. */
function RowAction({
  label,
  onClick,
  disabled,
  danger = false,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <Button
      type='button'
      variant='ghost'
      size='icon-sm'
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'rounded-xl text-muted-foreground [&_svg:not([class*=size-])]:size-4.5',
        danger && 'hover:bg-[var(--ica-bad-soft)] hover:text-[var(--ica-bad-ink)]',
      )}
    >
      {children}
    </Button>
  )
}

export function PhraseHistoryView({
  targetLang,
  nativeLang,
  cards,
  setCards,
  onWordAdded,
}: PhraseHistoryViewProps) {
  const PAGE_SIZE = 80
  const navigate = useNavigate()
  const [items, setItems] = useState<PhraseGenerationEntry[]>([])
  const [activationsByPhrase, setActivationsByPhrase] = useState<
    Record<string, PhraseVoiceActivationEntry[]>
  >({})
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
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

  const mergeItemsById = (
    previous: PhraseGenerationEntry[],
    next: PhraseGenerationEntry[],
  ): PhraseGenerationEntry[] => {
    const map = new Map<string, PhraseGenerationEntry>()
    for (const row of previous) {
      map.set(row.id, row)
    }
    for (const row of next) {
      map.set(row.id, row)
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
  }

  useEffect(() => {
    const load = async (): Promise<void> => {
      setLoading(true)
      try {
        const page = await fetchPhraseHistoryPage({
          limit: PAGE_SIZE,
          offset: 0,
          targetLang,
        })
        setItems(page.items)
        const activations = await fetchPhraseVoiceActivations(
          page.items.map((row) => row.id),
        )
        setActivationsByPhrase(activations)
        setHasMore(page.hasMore)
        setError(null)
      } catch (err) {
        console.error(err)
        setError(t('No se pudo cargar creación/activación de frases'))
      } finally {
        setLoading(false)
      }
    }

    void load()

    return () => {
      stopTTS()
    }
  }, [targetLang])

  const handleLoadMore = async (): Promise<void> => {
    if (loading || loadingMore || !hasMore) return

    setLoadingMore(true)
    try {
      const page = await fetchPhraseHistoryPage({
        limit: PAGE_SIZE,
        offset: items.length,
        targetLang,
      })

      setItems((prev) => mergeItemsById(prev, page.items))

      const activations = await fetchPhraseVoiceActivations(
        page.items.map((row) => row.id),
      )
      setActivationsByPhrase((prev) => ({ ...prev, ...activations }))
      setHasMore(page.hasMore)
      setError(null)
    } catch (err) {
      console.error(err)
      setError(t('No se pudo cargar más frases'))
    } finally {
      setLoadingMore(false)
    }
  }

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
      setError(t('No se pudo eliminar la frase'))
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


  // Frases agrupadas por día (ya vienen de la más nueva a la más antigua).
  const dayGroups: Array<{ key: string | null; items: PhraseGenerationEntry[] }> = []
  for (const item of visibleItems) {
    const key = toDayKey(item.created_at)
    const last = dayGroups[dayGroups.length - 1]
    if (last && last.key === key) {
      last.items.push(item)
    } else {
      dayGroups.push({ key, items: [item] })
    }
  }

  const trimmedQuery = query.trim()

  return (
    <GamePage>
      <PageTitle
        icon={<PhaseLetter letter='C' size={44} />}
        subtitle={t('Tus frases, día a día, con su traducción.')}
        right={
          <Button asChild variant='c' size='sm'>
            <Link to={DASHBOARD_ROUTES.activationPhrase}>
              <PlusIcon strokeWidth={3} aria-hidden='true' />
              {t('Crear')}
            </Link>
          </Button>
        }
      >
        {t('Historial de frases')}
      </PageTitle>

      {/* Buscador (fijo arriba en el móvil) */}
      <div className='sticky top-0 z-20 -mx-4 -my-2 bg-background/95 px-4 py-2 backdrop-blur lg:static lg:m-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none'>
        <div className='relative'>
          <SearchIcon
            className='pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground'
            strokeWidth={2.6}
            aria-hidden='true'
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('Buscar por palabra o frase...')}
            aria-label={t('Buscar por palabra o frase')}
            className='h-12 rounded-2xl pl-10'
          />
        </div>
      </div>

      {error && (
        <div
          role='alert'
          className='flex items-center gap-3 rounded-2xl px-4 py-3'
          style={{ background: 'var(--ica-bad-soft)', color: 'var(--ica-bad-ink)' }}
        >
          <TriangleAlertIcon className='size-5 shrink-0' strokeWidth={2.6} aria-hidden='true' />
          <p className='m-0 text-sm font-bold'>{error}</p>
        </div>
      )}

      {loading && (
        <RowGroup>
          <p className='sr-only'>{t('Cargando historial...')}</p>
          {[0, 1, 2].map((index) => (
            <div key={index} className='py-4' aria-hidden='true'>
              <div className='h-6 w-4/5 animate-pulse rounded-lg bg-muted' />
              <div className='mt-2 h-4 w-3/5 animate-pulse rounded-lg bg-muted' />
              <div className='mt-3 flex gap-1.5'>
                <div className='h-5 w-16 animate-pulse rounded-full bg-muted' />
                <div className='h-5 w-20 animate-pulse rounded-full bg-muted' />
                <div className='h-5 w-14 animate-pulse rounded-full bg-muted' />
              </div>
            </div>
          ))}
        </RowGroup>
      )}

      {!loading && !error && visibleItems.length === 0 && (
        <div className='ica-panel'>
          {trimmedQuery ? (
            <EmptyState
              icon={
                <IconTile tone='neutral' size={64}>
                  <SearchIcon className='size-8' strokeWidth={2.6} aria-hidden='true' />
                </IconTile>
              }
              title={t('Sin resultados')}
              text={t('No hay frases con «{query}».', { query: trimmedQuery })}
            />
          ) : (
            <EmptyState
              icon={<PhaseLetter letter='C' size={64} />}
              title={t('Aún no has creado frases')}
              text={t('Crea tu primera frase con tus palabras ICA y aparecerá aquí, ordenada por días.')}
              action={
                <Button asChild variant='c' size='lg'>
                  <Link to={DASHBOARD_ROUTES.activationPhrase}>{t('Crear mi primera frase')}</Link>
                </Button>
              }
            />
          )}
        </div>
      )}

      {/* Frases por día */}
      {dayGroups.map((group) => (
        <div key={group.key ?? 'sin-fecha'}>
          <SectionLabel
            right={
              <Pill tone='c'>
                {tn(group.items.length, '{n} frase', '{n} frases')}
              </Pill>
            }
          >
            {dayLabel(group.key, todayKey)}
          </SectionLabel>
          <RowGroup>
            {group.items.map((item) => {
              const activationCount = (activationsByPhrase[item.id] || []).length
              const copyLabel =
                copyingId === item.id
                  ? t('Copiando...')
                  : copiedId === item.id
                    ? t('Copiadas')
                    : t('Copiar frases')
              return (
                <article key={item.id} className='py-4'>
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
                      className='m-0 font-display text-xl leading-snug font-extrabold tracking-tight break-words'
                    />
                  ) : (
                    <p className='m-0 font-display text-xl font-extrabold tracking-tight text-muted-foreground'>
                      {t('Sin frase registrada')}
                    </p>
                  )}
                  {item.generated_phrase && (
                    <RomanizationHint
                      text={item.generated_phrase}
                      language={targetLang}
                    />
                  )}
                  <p className='m-0 mt-1 text-sm font-semibold text-muted-foreground'>
                    {highlightMatch(
                      item.translation || t('Sin traducción registrada'),
                      query,
                    )}
                  </p>

                  {(item.source_words || []).length > 0 && (
                    <div className='mt-2.5 flex flex-wrap gap-1.5'>
                      {(item.source_words || []).map((word) => (
                        <Pill key={`${item.id}-${word}`} tone='c'>
                          {highlightMatch(word, query)}
                        </Pill>
                      ))}
                    </div>
                  )}

                  <div className='mt-3 flex items-center gap-2'>
                    <span className='text-xs font-bold text-muted-foreground tabular-nums'>
                      {timeLabel(item.created_at)}
                    </span>
                    {activationCount > 0 ? (
                      <Pill tone='a'>
                        <MicIcon className='size-3' strokeWidth={3} aria-hidden='true' />
                        {t('Activada')}{activationCount > 1 ? ` ×${activationCount}` : ''}
                      </Pill>
                    ) : (
                      <Button
                        type='button'
                        onClick={() => handleOpenActivateModal(item.id)}
                        variant='a'
                        size='sm'
                        aria-label={t('Activar frase')}
                      >
                        <MicIcon strokeWidth={2.8} aria-hidden='true' />
                        {t('Activar')}
                      </Button>
                    )}
                    <div className='ml-auto flex items-center gap-0.5'>
                      {item.generated_phrase && (
                        <SpeakButton
                          text={item.generated_phrase}
                          langName={targetLang}
                          color='#3B82F6'
                          variant='icon'
                          className='size-8 rounded-xl'
                        />
                      )}
                      <RowAction
                        label={copyLabel}
                        onClick={() =>
                          void handleCopyPhrase(
                            item.id,
                            item.generated_phrase,
                            item.translation,
                          )
                        }
                        disabled={!item.generated_phrase || copyingId === item.id}
                      >
                        {copiedId === item.id ? (
                          <CheckIcon strokeWidth={3} style={{ color: 'var(--ica-ok-ink)' }} />
                        ) : (
                          <CopyIcon strokeWidth={2.4} />
                        )}
                      </RowAction>
                      <RowAction
                        label={t('Extraer nuevas palabras')}
                        onClick={() => handleOpenExtractModal(item.id)}
                      >
                        <PackagePlusIcon strokeWidth={2.4} />
                      </RowAction>
                      <RowAction
                        label={t('Eliminar frase')}
                        onClick={() => handleAskDelete(item.id)}
                        danger
                      >
                        <Trash2Icon strokeWidth={2.4} />
                      </RowAction>
                    </div>
                  </div>
                </article>
              )
            })}
          </RowGroup>
        </div>
      ))}

      {!loading && hasMore && (
        <Button
          type='button'
          variant='outline'
          size='lg'
          className='w-full'
          onClick={() => void handleLoadMore()}
          disabled={loadingMore}
        >
          {loadingMore ? t('Cargando...') : t('Cargar más frases')}
        </Button>
      )}

      <Dialog
        open={Boolean(deleteCandidate?.hasActivation)}
        onOpenChange={(open) => {
          if (!open && !deletingId) setDeleteCandidate(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <div className='flex items-center gap-3'>
              <PhaseLetter letter='A' size={40} />
              <DialogTitle>
                {deleteCandidate?.hasActivation
                  ? t('Frase activada en Nota Maestra')
                  : t('¿Eliminar esta frase?')}
              </DialogTitle>
            </div>
            <DialogDescription>
              {deleteCandidate?.hasActivation
                ? t('Esta frase ya fue activada. Para borrarla, primero debes eliminarla desde la propia Nota Maestra.')
                : t('¿Eliminar esta frase?')}
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
                  {t('Cerrar')}
                </Button>
                <Button
                  type='button'
                  variant='a'
                  onClick={() => {
                    setDeleteCandidate(null)
                    navigate(DASHBOARD_ROUTES.masterNotes)
                  }}
                >
                  {t('Ir a Nota Maestra')}
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
        title={t('Eliminar frase')}
        resourceLabel={t('esta frase')}
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
        cards={cards}
        setCards={setCards}
        onWordAdded={onWordAdded}
      />
    </GamePage>
  )
}

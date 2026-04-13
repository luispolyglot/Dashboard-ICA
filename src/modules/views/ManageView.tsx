import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import type { Dispatch, SetStateAction } from 'react'
import { IMPORTANCE_LEVELS, getImportance } from '../constants'
import { saveData } from '../services/storage'
import {
  copyWordsToClipboard,
  downloadWordsAsDocx,
  downloadWordsAsPdf,
} from '../services/wordExport'
import { sortChronological } from '../utils'
import type { ImportanceKey, Lexicard } from '../types'

type ManageViewProps = {
  cards: Lexicard[]
  setCards: Dispatch<SetStateAction<Lexicard[]>>
}

const TONE_CLASS: Record<ImportanceKey, string> = {
  vital: 'text-blue-400',
  frequent: 'text-emerald-400',
  occasional: 'text-amber-400',
  rare: 'text-orange-400',
  irrelevant: 'text-red-400',
}

export function ManageView({ cards, setCards }: ManageViewProps) {
  const { user } = useAuth()
  const [filter, setFilter] = useState<ImportanceKey | 'all'>('all')
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTarget, setDraftTarget] = useState('')
  const [draftNative, setDraftNative] = useState('')
  const [draftImportance, setDraftImportance] = useState<ImportanceKey>('vital')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [busyExport, setBusyExport] = useState<null | 'copy' | 'docx' | 'pdf'>(
    null,
  )

  const filteredByImportance =
    filter === 'all' ? cards : cards.filter((c) => c.importance === filter)
  const filtered = filteredByImportance.filter((card) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      card.target.toLowerCase().includes(q)
      || card.native.toLowerCase().includes(q)
    )
  })
  const sorted = sortChronological(filtered)
  const ownerName =
    user?.user_metadata?.display_name
    || user?.email?.split('@')[0]
    || 'Usuario'

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
        importance: draftImportance,
      }
    })

    setCards(nextCards)
    await saveData('dashboard-ICA-words', nextCards)
    closeEditor()
  }

  return (
    <section className='mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-5 py-8'>
      <h2 className='mb-1 font-serif text-3xl font-bold text-slate-100'>
        📖 Mis Palabras ICA
      </h2>
      <p className='mb-6 text-sm text-slate-500'>
        {cards.length} palabra{cards.length !== 1 ? 's' : ''} · Mas reciente
        primero
      </p>

      <div className='mb-4 flex flex-wrap items-center gap-2'>
        <div className='relative min-w-[240px] flex-1'>
          <span className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500'>
            🔎
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='Buscar palabra...'
            className='w-full rounded-lg border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none'
          />
        </div>

        <button
          type='button'
          onClick={() => handleCopyWords()}
          disabled={sorted.length === 0 || busyExport !== null}
          className='rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 disabled:cursor-not-allowed disabled:opacity-50'
        >
          {busyExport === 'copy' ? 'Copiando...' : 'Copiar'}
        </button>
        <button
          type='button'
          onClick={() => handleDownloadDocx()}
          disabled={sorted.length === 0 || busyExport !== null}
          className='rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 disabled:cursor-not-allowed disabled:opacity-50'
        >
          {busyExport === 'docx' ? 'Generando...' : 'Descargar DOCX'}
        </button>
        <button
          type='button'
          onClick={() => handleDownloadPdf()}
          disabled={sorted.length === 0 || busyExport !== null}
          className='rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 disabled:cursor-not-allowed disabled:opacity-50'
        >
          {busyExport === 'pdf' ? 'Generando...' : 'Descargar PDF'}
        </button>
      </div>

      <div className='mb-6 flex flex-wrap gap-1.5'>
        <button
          type='button'
          onClick={() => setFilter('all')}
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
            filter === 'all'
              ? 'border-slate-500 bg-slate-800 text-slate-100'
              : 'border-slate-800 bg-slate-950 text-slate-500'
          }`}
        >
          Todas ({cards.length})
        </button>

        {IMPORTANCE_LEVELS.map((level) => {
          const count = cards.filter((c) => c.importance === level.key).length
          const selected = filter === level.key
          return (
            <button
              key={level.key}
              type='button'
              onClick={() => setFilter(level.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                selected
                  ? `border-current ${TONE_CLASS[level.key]} bg-slate-900`
                  : 'border-slate-800 bg-slate-950 text-slate-500'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${TONE_CLASS[level.key].replace('text', 'bg')}`}
              />
              {count}
            </button>
          )
        })}
      </div>

      {sorted.length === 0 && (
        <p className='mt-10 text-center text-sm text-slate-600'>
          No hay palabras con ese filtro.
        </p>
      )}

      {sorted.map((card) => {
        const importance = getImportance(card.importance)
        const isFailed = (card.streak || 0) === 0
        const isEditing = editingId === card.id
        const dateStr = card.createdAt
          ? new Date(card.createdAt).toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'short',
            })
          : ''

        return (
          <article
            key={card.id}
            className={`mb-2.5 rounded-xl border p-3.5 ${
              isEditing
                ? 'border-red-500/30 bg-red-950/20'
                : 'border-slate-800 bg-slate-950'
            }`}
          >
            <div className='flex items-center gap-2.5'>
              <span
                className={`h-2.5 w-2.5 rounded-full ${TONE_CLASS[card.importance].replace('text', 'bg')}`}
              />

              <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='text-base font-semibold text-slate-100'>
                    {card.target}
                  </span>
                  <span className='text-slate-700'>→</span>
                  <span className='text-base text-slate-400'>
                    {card.native}
                  </span>
                </div>

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
                    <span className='text-[10px] text-slate-600'>
                      {dateStr}
                    </span>
                  )}
                </div>
              </div>

              {!isEditing && (
                <button
                  type='button'
                  onClick={() => openEditor(card)}
                  className='rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-blue-300'
                >
                  Editar
                </button>
              )}
            </div>

            {isEditing && (
              <div className='mt-3 space-y-3 border-t border-red-500/20 pt-3'>
                <div className='grid gap-2 sm:grid-cols-2'>
                  <input
                    value={draftTarget}
                    onChange={(event) => setDraftTarget(event.target.value)}
                    className='rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100'
                  />
                  <input
                    value={draftNative}
                    onChange={(event) => setDraftNative(event.target.value)}
                    className='rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100'
                  />
                </div>

                <div className='flex flex-wrap gap-1.5'>
                  {IMPORTANCE_LEVELS.map((level) => (
                    <button
                      key={level.key}
                      type='button'
                      onClick={() => setDraftImportance(level.key)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                        draftImportance === level.key
                          ? `border-current ${TONE_CLASS[level.key]} bg-slate-900`
                          : 'border-slate-700 text-slate-500'
                      }`}
                    >
                      {level.label}
                    </button>
                  ))}
                </div>

                <div className='flex flex-wrap items-center justify-between gap-2'>
                  {confirmDeleteId === card.id ? (
                    <>
                      <span className='text-sm text-red-400'>¿Eliminar esta palabra?</span>
                      <div className='flex gap-2'>
                        <button
                          type='button'
                          onClick={() => handleDelete(card.id)}
                          className='rounded-md bg-red-500 px-4 py-1.5 text-sm font-semibold text-white'
                        >
                          Si, eliminar
                        </button>
                        <button
                          type='button'
                          onClick={() => setConfirmDeleteId(null)}
                          className='rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-400'
                        >
                          Cancelar
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type='button'
                      onClick={() => setConfirmDeleteId(card.id)}
                      className='rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400'
                    >
                      Eliminar
                    </button>
                  )}

                  <div className='ml-auto flex gap-2'>
                    <button
                      type='button'
                      onClick={closeEditor}
                      className='rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-400'
                    >
                      Cancelar
                    </button>
                    <button
                      type='button'
                      onClick={() => handleSaveEdit(card.id)}
                      className='rounded-md bg-blue-500 px-4 py-1.5 text-sm font-semibold text-white'
                    >
                      Guardar cambios
                    </button>
                  </div>
                </div>
              </div>
            )}
          </article>
        )
      })}
    </section>
  )
}

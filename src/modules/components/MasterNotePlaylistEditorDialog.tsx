import { useEffect, useMemo, useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon, ListMusicIcon, PlusIcon, XIcon } from 'lucide-react'
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
import { IconTile, RowGroup, SectionLabel, tone } from '../game/ui'
import { formatMasterNoteLabel } from '../services/masterNotes'
import { NoteNumberTile } from './MasterNoteGameUi'
import { t, tn } from '@/i18n'

export type PlaylistEditorNoteOption = {
  id: string
  name: string
}

type MasterNotePlaylistEditorDialogProps = {
  open: boolean
  mode: 'create' | 'edit'
  initialName: string
  initialNoteIds: string[]
  closedNotes: PlaylistEditorNoteOption[]
  submitting?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: { name: string; noteIds: string[] }) => Promise<void>
}

export function MasterNotePlaylistEditorDialog({
  open,
  mode,
  initialName,
  initialNoteIds,
  closedNotes,
  submitting = false,
  onOpenChange,
  onSubmit,
}: MasterNotePlaylistEditorDialogProps) {
  const [name, setName] = useState(initialName)
  const [draftNoteIds, setDraftNoteIds] = useState<string[]>(initialNoteIds)

  const notesById = useMemo(
    () => new Map(closedNotes.map((note) => [note.id, note])),
    [closedNotes],
  )

  const availableNotes = useMemo(() => {
    const selected = new Set(draftNoteIds)
    return closedNotes.filter((note) => !selected.has(note.id))
  }, [closedNotes, draftNoteIds])

  useEffect(() => {
    if (!open) return
    setName(initialName)
    setDraftNoteIds(initialNoteIds.filter((id) => notesById.has(id)))
  }, [initialName, initialNoteIds, notesById, open])

  const handleAddNote = (noteId: string): void => {
    setDraftNoteIds((prev) => {
      if (prev.includes(noteId)) return prev
      return [...prev, noteId]
    })
  }

  const handleMoveNote = (noteId: string, direction: 'up' | 'down'): void => {
    setDraftNoteIds((prev) => {
      const index = prev.indexOf(noteId)
      if (index < 0) return prev

      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= prev.length) return prev

      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  const handleRemoveNote = (noteId: string): void => {
    setDraftNoteIds((prev) => prev.filter((id) => id !== noteId))
  }

  const handleSubmit = async (): Promise<void> => {
    await onSubmit({
      name,
      noteIds: draftNoteIds,
    })
  }

  const canSubmit = name.trim().length > 0 && draftNoteIds.length > 0

  return (
    <Dialog open={open} onOpenChange={(value) => !submitting && onOpenChange(value)}>
      <DialogContent className='max-h-[92dvh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader className='items-center text-center sm:text-center'>
          <IconTile tone='a' solid size={60} className='mb-1'>
            <ListMusicIcon className='size-7' strokeWidth={2.4} />
          </IconTile>
          <DialogTitle className='pr-0 font-display text-2xl font-black tracking-tight'>
            {mode === 'create' ? t('Crear lista de reproducción') : t('Editar lista de reproducción')}
          </DialogTitle>
          <DialogDescription className='text-sm font-semibold'>
            {t('Elige el nombre y ordena las notas maestras cerradas que quieras incluir.')}
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-5'>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('Ingresar nombre de la lista')}
            aria-label={t('Nombre de la lista')}
          />

          {/* Lo que ya está en la lista, en su orden */}
          <div>
            <SectionLabel
              right={
                <span className='text-xs font-extrabold text-muted-foreground tabular-nums'>
                  {tn(draftNoteIds.length, '{n} nota', '{n} notas')}
                </span>
              }
            >
              {t('Notas en la lista')}
            </SectionLabel>
            {draftNoteIds.length === 0 ? (
              <p className='m-0 rounded-2xl border-2 border-dashed border-border px-4 py-4 text-center text-sm font-semibold text-muted-foreground'>
                {t('Esta lista está vacía. Agrega notas cerradas.')}
              </p>
            ) : (
              <RowGroup className='max-h-72 overflow-y-auto'>
                {draftNoteIds.map((noteId, index) => {
                  const note = notesById.get(noteId)
                  if (!note) return null

                  return (
                    <div key={noteId} className='flex items-center gap-3 py-2.5'>
                      <NoteNumberTile name={note.name} closed size={40} />
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate leading-tight font-extrabold'>
                          {formatMasterNoteLabel(note.name)}
                        </span>
                        <span className='mt-0.5 block text-xs font-semibold text-muted-foreground'>
                          {t('Posición {n}', { n: index + 1 })}
                        </span>
                      </span>
                      <span className='flex shrink-0 items-center gap-1'>
                        <Button
                          type='button'
                          size='icon-sm'
                          variant='ghost'
                          onClick={() => handleMoveNote(noteId, 'up')}
                          disabled={index === 0}
                          aria-label={t('Mover arriba')}
                        >
                          <ArrowUpIcon className='size-4.5' strokeWidth={2.6} />
                        </Button>
                        <Button
                          type='button'
                          size='icon-sm'
                          variant='ghost'
                          onClick={() => handleMoveNote(noteId, 'down')}
                          disabled={index === draftNoteIds.length - 1}
                          aria-label={t('Mover abajo')}
                        >
                          <ArrowDownIcon className='size-4.5' strokeWidth={2.6} />
                        </Button>
                        <Button
                          type='button'
                          size='icon-sm'
                          variant='destructive'
                          onClick={() => handleRemoveNote(noteId)}
                          aria-label={t('Quitar nota')}
                        >
                          <XIcon className='size-4.5' strokeWidth={2.6} />
                        </Button>
                      </span>
                    </div>
                  )
                })}
              </RowGroup>
            )}
          </div>

          {/* Notas cerradas que aún se pueden añadir */}
          <div>
            <SectionLabel>{t('Notas disponibles')}</SectionLabel>
            {availableNotes.length === 0 ? (
              <p className='m-0 text-sm font-semibold text-muted-foreground'>
                {t('Ya agregaste todas las notas cerradas disponibles.')}
              </p>
            ) : (
              <div className='flex max-h-52 flex-wrap gap-2 overflow-y-auto p-0.5 pb-1.5'>
                {availableNotes.map((note) => (
                  <button
                    key={note.id}
                    type='button'
                    onClick={() => handleAddNote(note.id)}
                    aria-label={t('Agregar {note} a la lista', { note: formatMasterNoteLabel(note.name) })}
                    className='ica-press inline-flex h-10 items-center gap-1.5 rounded-2xl border-2 px-3 text-sm font-extrabold'
                    style={{
                      background: tone('a').soft,
                      color: tone('a').ink,
                      borderColor: 'color-mix(in oklab, var(--ica-a) 35%, transparent)',
                      boxShadow: '0 3px 0 color-mix(in oklab, var(--ica-a) 30%, transparent)',
                    }}
                  >
                    <PlusIcon className='size-4' strokeWidth={2.8} aria-hidden='true' />
                    {formatMasterNoteLabel(note.name)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className='flex-col-reverse gap-3 sm:flex-col-reverse'>
          <Button
            type='button'
            size='lg'
            variant='outline'
            className='w-full'
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('Cancelar')}
          </Button>
          <Button
            type='button'
            size='xl'
            variant='a'
            className='w-full'
            onClick={() => void handleSubmit()}
            disabled={submitting || !canSubmit}
          >
            {submitting
              ? t('Guardando...')
              : mode === 'create'
                ? t('Crear lista')
                : t('Guardar cambios')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
  const [nextNoteId, setNextNoteId] = useState('')

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

  useEffect(() => {
    if (!open) return
    if (availableNotes.length === 0) {
      setNextNoteId('')
      return
    }

    const exists = availableNotes.some((note) => note.id === nextNoteId)
    if (exists) return
    setNextNoteId(availableNotes[0]?.id || '')
  }, [availableNotes, nextNoteId, open])

  const handleAddNote = (): void => {
    if (!nextNoteId) return
    setDraftNoteIds((prev) => {
      if (prev.includes(nextNoteId)) return prev
      return [...prev, nextNoteId]
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
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Crear lista de reproducción' : 'Editar lista de reproducción'}
          </DialogTitle>
          <DialogDescription>
            Elige el nombre y ordena las notas maestras cerradas que quieras incluir.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-3'>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder='Ej: Cerradas de esta semana'
          />

          <div className='flex flex-wrap gap-2'>
            <div className='min-w-72 flex-1'>
              <Select
                value={nextNoteId}
                onValueChange={setNextNoteId}
                disabled={availableNotes.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Selecciona una nota cerrada' />
                </SelectTrigger>
                <SelectContent>
                  {availableNotes.map((note) => (
                    <SelectItem key={note.id} value={note.id}>
                      {note.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type='button'
              variant='outline'
              onClick={handleAddNote}
              disabled={!nextNoteId || availableNotes.length === 0}
            >
              <PlusIcon className='mr-1 size-4' />
              Agregar
            </Button>
          </div>

          <div className='max-h-72 space-y-2 overflow-auto rounded-lg border p-2'>
            {draftNoteIds.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                Esta lista está vacía. Agrega notas cerradas.
              </p>
            ) : (
              draftNoteIds.map((noteId, index) => {
                const note = notesById.get(noteId)
                if (!note) return null

                return (
                  <div
                    key={noteId}
                    className='flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3'
                  >
                    <div>
                      <p className='font-semibold'>{note.name}</p>
                      <p className='text-xs text-muted-foreground'>Posición {index + 1}</p>
                    </div>

                    <div className='flex items-center gap-2'>
                      <Button
                        type='button'
                        size='icon'
                        variant='outline'
                        onClick={() => handleMoveNote(noteId, 'up')}
                        disabled={index === 0}
                        aria-label='Mover arriba'
                      >
                        <ArrowUpIcon className='size-4' />
                      </Button>
                      <Button
                        type='button'
                        size='icon'
                        variant='outline'
                        onClick={() => handleMoveNote(noteId, 'down')}
                        disabled={index === draftNoteIds.length - 1}
                        aria-label='Mover abajo'
                      >
                        <ArrowDownIcon className='size-4' />
                      </Button>
                      <Button
                        type='button'
                        size='icon'
                        variant='destructive'
                        onClick={() => handleRemoveNote(noteId)}
                        aria-label='Quitar nota'
                      >
                        <XIcon className='size-4' />
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            type='button'
            onClick={() => void handleSubmit()}
            disabled={submitting || !canSubmit}
          >
            {submitting
              ? 'Guardando...'
              : mode === 'create'
                ? 'Crear lista'
                : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

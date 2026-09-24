import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { createMasterNote, fetchMasterNotes } from '../services/masterNotes'
import type { MasterNote } from '../types'

type ActivatePhraseInMasterNoteModalProps = {
  open: boolean
  phraseId: string | null
  targetLang: string
  nativeLang: string
  onOpenChange: (open: boolean) => void
}

export function ActivatePhraseInMasterNoteModal({
  open,
  phraseId,
  targetLang,
  nativeLang,
  onOpenChange,
}: ActivatePhraseInMasterNoteModalProps) {
  const navigate = useNavigate()
  const [openMasterNotes, setOpenMasterNotes] = useState<MasterNote[]>([])
  const [loadingMasterNotes, setLoadingMasterNotes] = useState(false)
  const [masterNotesError, setMasterNotesError] = useState<string | null>(null)
  const [activatingInNoteId, setActivatingInNoteId] = useState<string | null>(null)
  const [creatingAndActivating, setCreatingAndActivating] = useState(false)
  // Si no hay nada que elegir (0 o 1 nota abierta), vamos directos a grabar
  const [autoRouting, setAutoRouting] = useState(false)
  const autoRoutedRef = useRef(false)
  // El selector solo se muestra si de verdad hay que elegir (2+ notas abiertas) o hubo un error.
  // Así no aparece medio segundo antes de saltar directamente a grabar.
  const [showChooser, setShowChooser] = useState(false)

  useEffect(() => {
    if (!open) {
      autoRoutedRef.current = false
      setAutoRouting(false)
      setShowChooser(false)
    }
  }, [open])

  useEffect(() => {
    if (!open || !phraseId) return

    let active = true
    setLoadingMasterNotes(true)
    setMasterNotesError(null)

    void fetchMasterNotes(targetLang, nativeLang)
      .then((allNotes) => {
        if (!active) return
        // Las notas se completan solas al llegar a 3:00, así que cualquier nota abierta admite frases.
        const available = allNotes.filter((note) => note.state === 'open')
        setOpenMasterNotes(available)

        if (available.length <= 1 && !autoRoutedRef.current) {
          autoRoutedRef.current = true
          setAutoRouting(true)
          if (available.length === 1) {
            handleActivateInExistingNote(available[0].id)
          } else {
            void handleActivateInNewNote()
          }
        } else {
          setShowChooser(true)
        }
      })
      .catch((error) => {
        console.error(error)
        if (!active) return
        setMasterNotesError('No se pudieron cargar las notas maestras abiertas')
        setOpenMasterNotes([])
        setShowChooser(true)
      })
      .finally(() => {
        if (!active) return
        setLoadingMasterNotes(false)
      })

    return () => {
      active = false
    }
  }, [open, phraseId, targetLang, nativeLang])

  const handleActivateInExistingNote = (noteId: string): void => {
    if (!phraseId || activatingInNoteId || creatingAndActivating) return
    setActivatingInNoteId(noteId)
    navigate(
      `${DASHBOARD_ROUTES.masterNotes}/note/${noteId}/activate/${phraseId}`,
    )
  }

  const handleActivateInNewNote = async (): Promise<void> => {
    if (!phraseId || creatingAndActivating || activatingInNoteId) return
    setCreatingAndActivating(true)
    setMasterNotesError(null)
    try {
      const created = await createMasterNote(targetLang, nativeLang)
      navigate(
        `${DASHBOARD_ROUTES.masterNotes}/note/${created.id}/activate/${phraseId}`,
      )
    } catch (error) {
      console.error(error)
      setMasterNotesError('No se pudo crear la nota maestra')
      setAutoRouting(false)
      setShowChooser(true)
    } finally {
      setCreatingAndActivating(false)
    }
  }

  return (
    <Dialog
      open={open && showChooser}
      onOpenChange={(nextOpen) => {
        if (!creatingAndActivating && !activatingInNoteId) {
          onOpenChange(nextOpen)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Activar frase en Nota Maestra</DialogTitle>
          <DialogDescription>
            Una Nota Maestra es tu audio de práctica: vas grabando frases y se
            completa sola al llegar a 3 minutos. Elige en cuál grabar esta frase
            o empieza una nueva.
          </DialogDescription>
        </DialogHeader>

        {(loadingMasterNotes || autoRouting) && (
          <p className='text-sm text-muted-foreground'>
            Preparando tu grabación...
          </p>
        )}

        {!loadingMasterNotes && masterNotesError && (
          <p className='text-sm text-red-400'>{masterNotesError}</p>
        )}

        {!loadingMasterNotes && !autoRouting && !masterNotesError && openMasterNotes.length === 0 && (
          <p className='text-sm text-muted-foreground'>
            No tienes notas maestras abiertas.
          </p>
        )}

        {!loadingMasterNotes && !autoRouting && openMasterNotes.length > 0 && (
          <div className='max-h-60 space-y-2 overflow-y-auto pr-1'>
            {openMasterNotes.map((note) => {
              const isActivatingThis = activatingInNoteId === note.id
              return (
                <div
                  key={note.id}
                  className='rounded-lg border border-border/70 bg-muted/20 p-3 flex items-center justify-between'
                >
                  <p className='text-sm font-semibold'>{note.name}</p>
                  <Button
                    type='button'
                    size='sm'
                    className='mt-2'
                    disabled={Boolean(activatingInNoteId) || creatingAndActivating}
                    onClick={() => handleActivateInExistingNote(note.id)}
                  >
                    {isActivatingThis ? 'Abriendo...' : 'Activar en esta nota'}
                  </Button>
                </div>
              )
            })}
          </div>
        )}

        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={creatingAndActivating || Boolean(activatingInNoteId)}
          >
            Cancelar
          </Button>
          <Button
            type='button'
            variant='secondary'
            onClick={() => void handleActivateInNewNote()}
            disabled={creatingAndActivating || Boolean(activatingInNoteId) || !phraseId}
          >
            {creatingAndActivating
              ? 'Creando nota maestra...'
              : 'Activar en nota maestra nueva'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

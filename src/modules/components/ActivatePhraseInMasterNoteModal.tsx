import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MicIcon, PlusIcon, TriangleAlertIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { t } from '@/i18n'
import { IconTile, PhaseLetter } from '../game/ui'
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
        setMasterNotesError(t('No se pudieron cargar las notas maestras abiertas'))
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
      setMasterNotesError(t('No se pudo crear la nota maestra'))
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
          <div className='flex items-center gap-3'>
            <PhaseLetter letter='A' size={44} />
            <DialogTitle>{t('Activar frase en Nota Maestra')}</DialogTitle>
          </div>
          <DialogDescription>
            {t('Una Nota Maestra es tu audio de práctica: vas grabando frases y se completa sola al llegar a 3 minutos. Elige en cuál grabar esta frase o empieza una nueva.')}
          </DialogDescription>
        </DialogHeader>

        {(loadingMasterNotes || autoRouting) && (
          <div className='flex items-center gap-3 rounded-2xl px-4 py-3' style={{ background: 'var(--ica-a-soft)' }}>
            <span
              className='inline-block size-5 shrink-0 animate-spin rounded-full border-[3px] border-t-transparent'
              style={{ borderColor: 'var(--ica-a)', borderTopColor: 'transparent' }}
              aria-hidden='true'
            />
            <p className='m-0 text-sm font-bold' style={{ color: 'var(--ica-a-ink)' }}>
              {t('Preparando tu grabación...')}
            </p>
          </div>
        )}

        {!loadingMasterNotes && masterNotesError && (
          <div
            role='alert'
            className='flex items-center gap-3 rounded-2xl px-4 py-3'
            style={{ background: 'var(--ica-bad-soft)', color: 'var(--ica-bad-ink)' }}
          >
            <TriangleAlertIcon className='size-5 shrink-0' strokeWidth={2.6} aria-hidden='true' />
            <p className='m-0 text-sm font-bold'>{masterNotesError}</p>
          </div>
        )}

        {!loadingMasterNotes && !autoRouting && !masterNotesError && openMasterNotes.length === 0 && (
          <p className='m-0 text-sm font-semibold text-muted-foreground'>
            {t('No tienes notas maestras abiertas.')}
          </p>
        )}

        {!loadingMasterNotes && !autoRouting && openMasterNotes.length > 0 && (
          <div className='max-h-72 divide-y-2 divide-border overflow-y-auto rounded-2xl border-2 border-border px-3'>
            {openMasterNotes.map((note) => {
              const isActivatingThis = activatingInNoteId === note.id
              return (
                <div
                  key={note.id}
                  className='flex items-center gap-3 py-3'
                >
                  <IconTile tone='a' size={44}>
                    <MicIcon className='size-5.5' strokeWidth={2.6} aria-hidden='true' />
                  </IconTile>
                  <p className='m-0 min-w-0 flex-1 truncate font-extrabold'>{note.name}</p>
                  <Button
                    type='button'
                    size='sm'
                    variant='a'
                    disabled={Boolean(activatingInNoteId) || creatingAndActivating}
                    onClick={() => handleActivateInExistingNote(note.id)}
                    aria-label={t('Activar en esta nota: {name}', { name: note.name })}
                    className='shrink-0'
                  >
                    {isActivatingThis ? t('Abriendo...') : t('Activar')}
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
            {t('Cancelar')}
          </Button>
          <Button
            type='button'
            variant='outline'
            onClick={() => void handleActivateInNewNote()}
            disabled={creatingAndActivating || Boolean(activatingInNoteId) || !phraseId}
          >
            {!creatingAndActivating ? <PlusIcon strokeWidth={3} aria-hidden='true' /> : null}
            {creatingAndActivating
              ? t('Creando nota maestra...')
              : t('Activar en nota maestra nueva')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

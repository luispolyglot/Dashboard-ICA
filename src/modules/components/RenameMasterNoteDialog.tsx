import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Loader2Icon } from 'lucide-react'
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
  MASTER_NOTE_MAX_NUMBER,
  MASTER_NOTE_NUMBER_TAKEN,
  getMasterNoteNumber,
  renameMasterNote,
} from '../services/masterNotes'
import type { MasterNote } from '../types'
import { t } from '@/i18n'

type RenameMasterNoteDialogProps = {
  note: MasterNote | null
  onClose: () => void
  onRenamed: (note: MasterNote) => void
}

/** Cambiar el número de una nota maestra (Activación). Va escondido en el menú de tres puntos. */
export function RenameMasterNoteDialog({ note, onClose, onRenamed }: RenameMasterNoteDialogProps) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!note) return
    const current = getMasterNoteNumber(note.name)
    setValue(current === null ? '' : String(current))
    setError(null)
    setSaving(false)
  }, [note])

  const number = Number(value)
  const valid = /^\d+$/.test(value) && number >= 1 && number <= MASTER_NOTE_MAX_NUMBER
  const unchanged = note ? number === getMasterNoteNumber(note.name) : false

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!note || !valid || saving) return
    if (unchanged) {
      onClose()
      return
    }
    setSaving(true)
    setError(null)
    try {
      onRenamed(await renameMasterNote(note.id, number))
      onClose()
    } catch (err) {
      console.error(err)
      setError(
        err instanceof Error && err.message === MASTER_NOTE_NUMBER_TAKEN
          ? t('Ya tienes otra nota maestra con ese número.')
          : t('No se pudo cambiar el nombre de la nota maestra'),
      )
      setSaving(false)
    }
  }

  return (
    <Dialog open={Boolean(note)} onOpenChange={(open) => (open || saving ? null : onClose())}>
      <DialogContent className='sm:max-w-sm'>
        <form onSubmit={(event) => void handleSubmit(event)} className='flex flex-col gap-4'>
          <DialogHeader>
            <DialogTitle>{t('Cambiar nombre')}</DialogTitle>
            <DialogDescription>
              {t('La próxima nota maestra que crees seguirá la numeración desde el número más alto que tengas.')}
            </DialogDescription>
          </DialogHeader>
          <div className='flex items-center gap-3'>
            <span className='shrink-0 text-base font-extrabold'>{t('Nota Maestra')}</span>
            <Input
              type='number'
              inputMode='numeric'
              min={1}
              max={MASTER_NOTE_MAX_NUMBER}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-label={t('Número de la nota maestra')}
              aria-invalid={Boolean(error)}
              autoFocus
              className='w-24 tabular-nums'
            />
          </div>
          {error ? (
            <p role='alert' className='m-0 text-sm font-semibold text-destructive'>
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type='button' variant='outline' onClick={onClose} disabled={saving}>
              {t('Cancelar')}
            </Button>
            <Button type='submit' disabled={!valid || saving}>
              {saving ? <Loader2Icon className='animate-spin' /> : null}
              {t('Guardar')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

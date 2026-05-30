import { useEffect, useMemo, useState } from 'react'
import { CalendarPlusIcon, RefreshCcwIcon, Trash2Icon } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CalendarIcademyBoard } from '../components/calendar-icademy/CalendarIcademyBoard'
import {
  createCalendarIcademyEntry,
  deleteCalendarIcademyEntry,
  fetchCalendarIcademyEntries,
  updateCalendarIcademyEntry,
} from '../services/calendarIcademy'
import type { CalendarIcademyEntry, CalendarIcademyEntryInput } from '../types'

type EntryFormState = {
  classKey: string
  className: string
  languageCode: string
  sessionDate: string
  sessionTime: string
  teacher: string
  groupName: string
  note: string
}

const LANGUAGE_OPTIONS = [
  { value: 'pl', label: 'Polaco (PL)' },
  { value: 'fr', label: 'Frances (FR)' },
  { value: 'en', label: 'Ingles (EN)' },
  { value: 'it', label: 'Italiano (IT)' },
  { value: 'de', label: 'Aleman (DE)' },
]

function emptyForm(): EntryFormState {
  return {
    classKey: '',
    className: '',
    languageCode: 'en',
    sessionDate: '',
    sessionTime: '18:00',
    teacher: '',
    groupName: '',
    note: '',
  }
}

function toFormState(entry: CalendarIcademyEntry): EntryFormState {
  return {
    classKey: entry.classKey,
    className: entry.className,
    languageCode: entry.languageCode,
    sessionDate: entry.sessionDate,
    sessionTime: entry.sessionTime,
    teacher: entry.teacher,
    groupName: entry.groupName || '',
    note: entry.note || '',
  }
}

function toInputPayload(form: EntryFormState): CalendarIcademyEntryInput {
  return {
    classKey: form.classKey,
    className: form.className,
    languageCode: form.languageCode,
    sessionDate: form.sessionDate,
    sessionTime: form.sessionTime,
    teacher: form.teacher,
    groupName: form.groupName,
    note: form.note,
  }
}

export function ManageCalendarIcademyView() {
  const [entries, setEntries] = useState<CalendarIcademyEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<CalendarIcademyEntry | null>(
    null,
  )
  const [form, setForm] = useState<EntryFormState>(() => emptyForm())
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const isEditing = Boolean(editingEntry)

  const loadEntries = async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await fetchCalendarIcademyEntries()
      setEntries(data)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo cargar el calendario de clases.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadEntries()
  }, [])

  const suggestedClassKeys = useMemo(() => {
    const uniqueKeys = new Set(entries.map((entry) => entry.classKey))
    return Array.from(uniqueKeys).sort((a, b) => a.localeCompare(b))
  }, [entries])

  const openCreateModal = () => {
    setEditingEntry(null)
    setForm(emptyForm())
    setIsModalOpen(true)
  }

  const openEditModal = (entry: CalendarIcademyEntry) => {
    setEditingEntry(entry)
    setForm(toFormState(entry))
    setIsModalOpen(true)
  }

  const handleCloseModal = (nextOpen: boolean) => {
    if (isSaving || isDeleting) return
    setIsModalOpen(nextOpen)
  }

  const updateForm = <K extends keyof EntryFormState>(
    key: K,
    value: EntryFormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const validateForm = (): string | null => {
    if (!form.classKey.trim()) return 'La clave interna de clase es obligatoria.'
    if (!form.className.trim()) return 'El nombre de clase es obligatorio.'
    if (!form.languageCode.trim()) return 'El idioma es obligatorio.'
    if (!form.sessionDate) return 'La fecha de sesion es obligatoria.'
    if (!form.sessionTime) return 'La hora de sesion es obligatoria.'
    if (!form.teacher.trim()) return 'El docente es obligatorio.'
    return null
  }

  const handleSave = async () => {
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const payload = toInputPayload(form)

      if (editingEntry) {
        await updateCalendarIcademyEntry(editingEntry.id, payload)
      } else {
        await createCalendarIcademyEntry(payload)
      }

      setIsModalOpen(false)
      setEditingEntry(null)
      setForm(emptyForm())
      await loadEntries()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo guardar la entrada.'
      setError(message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editingEntry || isDeleting) return

    setIsDeleting(true)
    setError(null)

    try {
      await deleteCalendarIcademyEntry(editingEntry.id)
      setIsModalOpen(false)
      setEditingEntry(null)
      setForm(emptyForm())
      await loadEntries()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo eliminar la entrada.'
      setError(message)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <CalendarIcademyBoard
        title='Calendario ICADEMY - Gestion'
        description='Panel de super admin para crear, editar y borrar clases del calendario.'
        entries={entries}
        loading={loading}
        error={error}
        emptyMessage='Aun no hay clases cargadas. Crea la primera desde el boton "Agregar clase".'
        onEntryClick={openEditModal}
        topActions={
          <div className='flex flex-wrap gap-2'>
            <Button type='button' variant='outline' onClick={() => void loadEntries()}>
              <RefreshCcwIcon data-icon='inline-start' />
              Recargar
            </Button>
            <Button type='button' onClick={openCreateModal}>
              <CalendarPlusIcon data-icon='inline-start' />
              Agregar clase
            </Button>
          </div>
        }
      />

      <Dialog open={isModalOpen} onOpenChange={handleCloseModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Editar clase del calendario' : 'Agregar clase al calendario'}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Modifica los datos de la clase seleccionada.'
                : 'Completa los datos para registrar una nueva clase.'}
            </DialogDescription>
          </DialogHeader>

          <div className='grid gap-3'>
            <div className='grid gap-1.5'>
              <Label htmlFor='calendar-icademy-class-key'>Clave interna</Label>
              <Input
                id='calendar-icademy-class-key'
                value={form.classKey}
                onChange={(event) => updateForm('classKey', event.target.value)}
                placeholder='ej: en_basico'
                list='calendar-icademy-class-key-suggestions'
              />
              <datalist id='calendar-icademy-class-key-suggestions'>
                {suggestedClassKeys.map((classKey) => (
                  <option key={classKey} value={classKey} />
                ))}
              </datalist>
            </div>

            <div className='grid gap-1.5'>
              <Label htmlFor='calendar-icademy-class-name'>Nombre visible</Label>
              <Input
                id='calendar-icademy-class-name'
                value={form.className}
                onChange={(event) => updateForm('className', event.target.value)}
                placeholder='ej: Ingles basico'
              />
            </div>

            <div className='grid gap-1.5'>
              <Label htmlFor='calendar-icademy-language'>Idioma</Label>
              <Select
                value={form.languageCode}
                onValueChange={(value) => updateForm('languageCode', value)}
              >
                <SelectTrigger id='calendar-icademy-language'>
                  <SelectValue placeholder='Selecciona idioma' />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Idiomas</SelectLabel>
                    {LANGUAGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
              <div className='grid gap-1.5'>
                <Label htmlFor='calendar-icademy-session-date'>Fecha</Label>
                <Input
                  id='calendar-icademy-session-date'
                  type='date'
                  value={form.sessionDate}
                  onChange={(event) => updateForm('sessionDate', event.target.value)}
                />
              </div>

              <div className='grid gap-1.5'>
                <Label htmlFor='calendar-icademy-session-time'>Hora</Label>
                <Input
                  id='calendar-icademy-session-time'
                  type='time'
                  value={form.sessionTime}
                  onChange={(event) => updateForm('sessionTime', event.target.value)}
                />
              </div>
            </div>

            <div className='grid gap-1.5'>
              <Label htmlFor='calendar-icademy-teacher'>Docente</Label>
              <Input
                id='calendar-icademy-teacher'
                value={form.teacher}
                onChange={(event) => updateForm('teacher', event.target.value)}
                placeholder='ej: Joel'
              />
            </div>

            <div className='grid gap-1.5'>
              <Label htmlFor='calendar-icademy-group'>Grupo (opcional)</Label>
              <Input
                id='calendar-icademy-group'
                value={form.groupName}
                onChange={(event) => updateForm('groupName', event.target.value)}
                placeholder='ej: Grupo A'
              />
            </div>

            <div className='grid gap-1.5'>
              <Label htmlFor='calendar-icademy-note'>Nota (opcional)</Label>
              <Textarea
                id='calendar-icademy-note'
                value={form.note}
                onChange={(event) => updateForm('note', event.target.value)}
                placeholder='Cambios puntuales, observaciones, etc.'
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className='flex items-center justify-between sm:justify-between'>
            <div>
              {isEditing && (
                <Button
                  type='button'
                  variant='destructive'
                  onClick={() => void handleDelete()}
                  disabled={isDeleting || isSaving}
                >
                  <Trash2Icon data-icon='inline-start' />
                  {isDeleting ? 'Eliminando...' : 'Eliminar'}
                </Button>
              )}
            </div>

            <div className='flex gap-2'>
              <Button
                type='button'
                variant='outline'
                onClick={() => setIsModalOpen(false)}
                disabled={isSaving || isDeleting}
              >
                Cancelar
              </Button>
              <Button
                type='button'
                onClick={() => void handleSave()}
                disabled={isSaving || isDeleting}
              >
                {isSaving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear clase'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

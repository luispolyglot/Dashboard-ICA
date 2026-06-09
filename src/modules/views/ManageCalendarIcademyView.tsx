import { useEffect, useMemo, useState } from 'react'
import {
  CalendarPlusIcon,
  RefreshCcwIcon,
  Trash2Icon,
  UploadIcon,
  UsersIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CALENDAR_ICADEMY_CATALOG,
  getCalendarIcademyCatalogEntry,
} from '../constants/calendarIcademyCatalog'
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
import { fetchIcademyTeachers } from '../services/icademyTeachers'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { uploadCalendarIcademyBulkJson } from '../services/calendarIcademyBulk'
import type {
  CalendarIcademyEntry,
  CalendarIcademyEntryInput,
  IcademyTeacher,
} from '../types'

type EntryFormState = {
  classKey: string
  sessionDate: string
  sessionTime: string
  teacherId: string
  groupName: string
  note: string
}

type BulkClassEntry = {
  time?: string
  teacher_id?: string
  teacherId?: string
  classId?: string
  lang?: string
  group?: string
  note?: string
}

type BulkSchedule = Record<string, BulkClassEntry[]>

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function emptyForm(): EntryFormState {
  return {
    classKey: '',
    sessionDate: '',
    sessionTime: '18:00',
    teacherId: '',
    groupName: '',
    note: '',
  }
}

function toFormState(entry: CalendarIcademyEntry): EntryFormState {
  return {
    classKey: entry.classKey,
    sessionDate: entry.sessionDate,
    sessionTime: entry.sessionTime,
    teacherId: entry.teacherId || '',
    groupName: entry.groupName || '',
    note: entry.note || '',
  }
}

function toInputPayload(form: EntryFormState): CalendarIcademyEntryInput {
  const catalogEntry = getCalendarIcademyCatalogEntry(form.classKey)

  return {
    classKey: form.classKey,
    className: catalogEntry?.className || '',
    languageCode: catalogEntry?.languageCode || '',
    sessionDate: form.sessionDate,
    sessionTime: form.sessionTime,
    teacherId: form.teacherId,
    groupName: form.groupName,
    note: form.note,
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime())
}

function validateBulkSchedule(input: unknown): {
  schedule: BulkSchedule
  dates: number
  totalEntries: number
} {
  if (!isObject(input)) {
    throw new Error('El JSON debe ser un objeto con fechas como claves.')
  }

  const schedule = input as BulkSchedule
  const dates = Object.keys(schedule)
  if (dates.length === 0) {
    throw new Error('No hay fechas en el JSON para cargar.')
  }

  let totalEntries = 0

  for (const dateKey of dates) {
    if (!isValidDateKey(dateKey)) {
      throw new Error(`Fecha invalida: ${dateKey}. Usa formato YYYY-MM-DD.`)
    }

    const entries = schedule[dateKey]
    if (!Array.isArray(entries)) {
      throw new Error(`La fecha ${dateKey} debe contener un arreglo de clases.`)
    }

    totalEntries += entries.length

    for (let index = 0; index < entries.length; index += 1) {
      const item = entries[index]
      if (!isObject(item)) {
        throw new Error(
          `Entrada invalida en ${dateKey}, posicion ${index + 1}.`,
        )
      }

      const classId = String(item.classId || '').trim()
      const teacherId = String(item.teacher_id || item.teacherId || '').trim()
      const time = String(item.time || '').trim()

      if (!classId) {
        throw new Error(`Falta classId en ${dateKey}, posicion ${index + 1}.`)
      }

      if (!getCalendarIcademyCatalogEntry(classId)) {
        throw new Error(`classId no pertenece al catalogo oficial: ${classId}.`)
      }

      if (!teacherId) {
        throw new Error(
          `Falta teacher_id en ${dateKey} para classId ${classId}.`,
        )
      }

      if (!UUID_REGEX.test(teacherId)) {
        throw new Error(
          `teacher_id invalido en ${dateKey} para classId ${classId}.`,
        )
      }

      if (!time) {
        throw new Error(`Falta time en ${dateKey} para classId ${classId}.`)
      }
    }
  }

  return {
    schedule,
    dates: dates.length,
    totalEntries,
  }
}

export function ManageCalendarIcademyView() {
  const [entries, setEntries] = useState<CalendarIcademyEntry[]>([])
  const [teachers, setTeachers] = useState<IcademyTeacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<CalendarIcademyEntry | null>(
    null,
  )
  const [form, setForm] = useState<EntryFormState>(() => emptyForm())
  const [modalError, setModalError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
  const [bulkJsonInput, setBulkJsonInput] = useState('')
  const [bulkModalError, setBulkModalError] = useState<string | null>(null)
  const [isBulkSaving, setIsBulkSaving] = useState(false)

  const isEditing = Boolean(editingEntry)

  const loadEntries = async () => {
    setLoading(true)
    setError(null)

    try {
      const [entryRows, teacherRows] = await Promise.all([
        fetchCalendarIcademyEntries(),
        fetchIcademyTeachers(),
      ])
      setEntries(entryRows)
      setTeachers(teacherRows)
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

  const catalogOptions = useMemo(() => CALENDAR_ICADEMY_CATALOG, [])

  const openCreateModal = () => {
    setEditingEntry(null)
    setForm(emptyForm())
    setModalError(null)
    setIsModalOpen(true)
  }

  const openBulkModal = () => {
    setBulkModalError(null)
    setIsBulkModalOpen(true)
  }

  const openEditModal = (entry: CalendarIcademyEntry) => {
    setEditingEntry(entry)
    setForm(toFormState(entry))
    setModalError(null)
    setIsModalOpen(true)
  }

  const handleCloseModal = (nextOpen: boolean) => {
    if (isSaving || isDeleting) return
    if (!nextOpen) {
      setModalError(null)
    }
    setIsModalOpen(nextOpen)
  }

  const handleCloseBulkModal = (nextOpen: boolean) => {
    if (isBulkSaving) return
    if (!nextOpen) {
      setBulkModalError(null)
    }
    setIsBulkModalOpen(nextOpen)
  }

  const updateForm = <K extends keyof EntryFormState>(
    key: K,
    value: EntryFormState[K],
  ) => {
    setModalError(null)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const canSubmitForm =
    Boolean(form.classKey.trim()) &&
    Boolean(getCalendarIcademyCatalogEntry(form.classKey)) &&
    Boolean(form.sessionDate) &&
    Boolean(form.sessionTime) &&
    Boolean(form.teacherId.trim())

  const bulkValidation = useMemo(() => {
    const trimmed = bulkJsonInput.trim()
    if (!trimmed) {
      return {
        valid: false,
        message: 'Pega un JSON para habilitar la carga.',
        schedule: null as BulkSchedule | null,
        dates: 0,
        entries: 0,
      }
    }

    try {
      const parsed = JSON.parse(trimmed)
      const validated = validateBulkSchedule(parsed)
      return {
        valid: true,
        message: null,
        schedule: validated.schedule,
        dates: validated.dates,
        entries: validated.totalEntries,
      }
    } catch (error) {
      return {
        valid: false,
        message:
          error instanceof Error
            ? error.message
            : 'El JSON no es valido para carga.',
        schedule: null as BulkSchedule | null,
        dates: 0,
        entries: 0,
      }
    }
  }, [bulkJsonInput])

  const validateForm = (): string | null => {
    if (!form.classKey.trim())
      return 'Debes seleccionar una clase del catalogo.'
    if (!getCalendarIcademyCatalogEntry(form.classKey)) {
      return 'La clase seleccionada no pertenece al catalogo oficial.'
    }
    if (!form.sessionDate) return 'La fecha de sesión es obligatoria.'
    if (!form.sessionTime) return 'La hora de sesión es obligatoria.'
    if (!form.teacherId.trim()) return 'Debes seleccionar un profesor.'
    return null
  }

  const handleSave = async () => {
    const validationError = validateForm()
    if (validationError) {
      setModalError(validationError)
      return
    }

    setIsSaving(true)
    setModalError(null)

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
      setModalError(message)
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

  const handleBulkSave = async () => {
    if (!bulkValidation.valid || !bulkValidation.schedule) return

    setIsBulkSaving(true)
    setBulkModalError(null)

    try {
      await uploadCalendarIcademyBulkJson({
        schedule: bulkValidation.schedule,
      })
      setIsBulkModalOpen(false)
      setBulkJsonInput('')
      await loadEntries()
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo ejecutar la carga masiva.'
      setBulkModalError(message)
    } finally {
      setIsBulkSaving(false)
    }
  }

  return (
    <>
      <CalendarIcademyBoard
        title='Calendario ICADEMY - Gestión'
        description='Panel de super admin para crear, editar y borrar clases del calendario.'
        entries={entries}
        loading={loading}
        error={error}
        emptyMessage='Aun no hay clases cargadas. Crea la primera desde el boton "Agregar clase".'
        allowMonthNavigation
        onEntryClick={openEditModal}
        topActions={
          <div className='flex flex-wrap gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => void loadEntries()}
            >
              <RefreshCcwIcon data-icon='inline-start' />
              Recargar
            </Button>
            <Button type='button' variant='outline' onClick={openBulkModal}>
              <UploadIcon data-icon='inline-start' />
              Carga masiva JSON
            </Button>
            <Button type='button' variant='outline' asChild>
              <Link to={DASHBOARD_ROUTES.calendarIcademyTeachers}>
                <UsersIcon data-icon='inline-start' />
                Profesores
              </Link>
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
              {isEditing
                ? 'Editar clase del calendario'
                : 'Agregar clase al calendario'}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Modifica los datos de la clase seleccionada.'
                : 'Completa los datos para registrar una nueva clase.'}
            </DialogDescription>
          </DialogHeader>

          <div className='grid gap-3'>
            <div className='grid gap-1.5'>
              <Label htmlFor='calendar-icademy-class-selector'>Clase</Label>
              <Select
                value={form.classKey}
                onValueChange={(value) => updateForm('classKey', value)}
              >
                <SelectTrigger id='calendar-icademy-class-selector'>
                  <SelectValue placeholder='Selecciona una clase' />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Catalogo oficial</SelectLabel>
                    {catalogOptions.map((option) => (
                      <SelectItem key={option.classKey} value={option.classKey}>
                        {option.flag} {option.className}
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
                  onChange={(event) =>
                    updateForm('sessionDate', event.target.value)
                  }
                />
              </div>

              <div className='grid gap-1.5'>
                <Label htmlFor='calendar-icademy-session-time'>Hora</Label>
                <Input
                  id='calendar-icademy-session-time'
                  type='time'
                  value={form.sessionTime}
                  onChange={(event) =>
                    updateForm('sessionTime', event.target.value)
                  }
                />
              </div>
            </div>

            <div className='grid gap-1.5'>
              <Label htmlFor='calendar-icademy-teacher-id'>Profesor</Label>
              <Select
                value={form.teacherId}
                onValueChange={(value) => updateForm('teacherId', value)}
              >
                <SelectTrigger id='calendar-icademy-teacher-id'>
                  <SelectValue placeholder='Selecciona un profesor' />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Profesores habilitados</SelectLabel>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher.userId} value={teacher.userId}>
                        {teacher.displayName}
                        {teacher.username ? ` (@${teacher.username})` : ''}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {teachers.length === 0 && (
                <p className='text-xs text-muted-foreground'>
                  Aun no hay profesores cargados. Primero crea uno en la vista
                  "Profesores".
                </p>
              )}
            </div>

            <div className='grid gap-1.5'>
              <Label htmlFor='calendar-icademy-group'>Grupo (opcional)</Label>
              <Input
                id='calendar-icademy-group'
                value={form.groupName}
                onChange={(event) =>
                  updateForm('groupName', event.target.value)
                }
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

            {modalError && (
              <p className='text-sm text-destructive'>{modalError}</p>
            )}
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
                disabled={isSaving || isDeleting || !canSubmitForm}
              >
                {isSaving
                  ? 'Guardando...'
                  : isEditing
                    ? 'Guardar cambios'
                    : 'Crear clase'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isBulkModalOpen} onOpenChange={handleCloseBulkModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Carga masiva JSON</DialogTitle>
            <DialogDescription>
              Pega el JSON con formato fecha {'->'} lista de clases. Se
              reemplazaran todas las fechas incluidas. Cada clase ahora debe
              incluir `teacher_id`.
            </DialogDescription>
          </DialogHeader>

          <div className='grid gap-3'>
            <div className='grid gap-1.5'>
              <Label htmlFor='calendar-icademy-bulk-json'>JSON</Label>
              <Textarea
                id='calendar-icademy-bulk-json'
                value={bulkJsonInput}
                onChange={(event) => {
                  setBulkModalError(null)
                  setBulkJsonInput(event.target.value)
                }}
                placeholder='Pega aqui el JSON masivo'
                rows={14}
                className='overflow-y-auto max-h-56'
              />
            </div>

            {!bulkValidation.valid && bulkJsonInput.trim().length > 0 && (
              <p className='text-sm text-destructive'>
                {bulkValidation.message}
              </p>
            )}

            {bulkValidation.valid && (
              <p className='text-sm text-muted-foreground'>
                JSON valido. Fechas: {bulkValidation.dates} · Clases:{' '}
                {bulkValidation.entries}
              </p>
            )}

            {bulkModalError && (
              <p className='text-sm text-destructive'>{bulkModalError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setIsBulkModalOpen(false)}
              disabled={isBulkSaving}
            >
              Cancelar
            </Button>
            <Button
              type='button'
              onClick={() => void handleBulkSave()}
              disabled={!bulkValidation.valid || isBulkSaving}
            >
              {isBulkSaving ? 'Cargando...' : 'Confirmar carga'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

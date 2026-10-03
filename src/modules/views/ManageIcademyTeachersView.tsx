import { useEffect, useMemo, useState } from 'react'
import { GraduationCapIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react'
import { EmptyState, IconTile, PageTitle, Panel, RowGroup, SectionLabel } from '../game/ui'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import {
  createIcademyTeacher,
  deleteIcademyTeacher,
  fetchIcademyTeacherAssignableUsers,
  fetchIcademyTeachers,
} from '../services/icademyTeachers'
import type { IcademyTeacher, IcademyTeacherAssignableUser } from '../types'
import { useSoftLoading } from '../hooks/useSoftLoading'

export function ManageIcademyTeachersView() {
  const [teachers, setTeachers] = useState<IcademyTeacher[]>([])
  const [users, setUsers] = useState<IcademyTeacherAssignableUser[]>([])
  const [loading, setLoading, refreshing] = useSoftLoading(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [teacherPendingDelete, setTeacherPendingDelete] =
    useState<IcademyTeacher | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)

    try {
      const [teacherRows, userRows] = await Promise.all([
        fetchIcademyTeachers(),
        fetchIcademyTeacherAssignableUsers(),
      ])
      setTeachers(teacherRows)
      setUsers(userRows)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo cargar la gestion de profesores.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const availableUsers = useMemo(
    () => users.filter((row) => !row.isTeacher),
    [users],
  )
  const availableUserOptions = useMemo<ComboboxOption[]>(
    () =>
      availableUsers.map((user) => ({
        value: user.userId,
        label: `${user.displayName}${user.username ? ` (@${user.username})` : ''}`,
        keywords: `${user.userId} ${user.displayName} ${user.username || ''}`,
      })),
    [availableUsers],
  )

  const selectedUser = users.find((row) => row.userId === selectedUserId) || null

  const handleCreate = async () => {
    if (!selectedUser) {
      setFeedback('Debes seleccionar un usuario para asignarlo como profesor.')
      return
    }

    setIsCreating(true)
    setFeedback(null)

    try {
      await createIcademyTeacher({
        userId: selectedUser.userId,
        displayName: selectedUser.displayName,
        username: selectedUser.username,
      })
      setSelectedUserId('')
      setIsCreateModalOpen(false)
      setFeedback('Profesor creado correctamente.')
      await loadData()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo crear el profesor.'
      setFeedback(message)
    } finally {
      setIsCreating(false)
    }
  }

  const handleDelete = async (userId: string) => {
    setDeletingUserId(userId)
    setFeedback(null)

    try {
      await deleteIcademyTeacher(userId)
      setFeedback('Profesor eliminado correctamente.')
      await loadData()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo eliminar el profesor.'
      setFeedback(message)
    } finally {
      setDeletingUserId(null)
    }
  }

  const handleConfirmDelete = async () => {
    if (!teacherPendingDelete) return
    await handleDelete(teacherPendingDelete.userId)
    setTeacherPendingDelete(null)
  }

  return (
    <section className='mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pt-2 pb-8 lg:py-8'>
      <PageTitle
        icon={
          <IconTile tone='i' size={48}>
            <GraduationCapIcon className='size-6' strokeWidth={2.4} />
          </IconTile>
        }
        subtitle='Quién da clases en el Calendario ICADEMY.'
        right={
          <Button type='button' variant='outline' size='icon' className='rounded-2xl' onClick={() => void loadData()} disabled={loading || refreshing} aria-label='Recargar'>
            <RefreshCwIcon className={loading || refreshing ? 'size-5 animate-spin' : 'size-5'} strokeWidth={2.6} />
          </Button>
        }
      >
        Profesores ICADEMY
      </PageTitle>

      <Button
        type='button'
        size='lg'
        className='w-full rounded-2xl sm:w-fit'
        onClick={() => {
          setFeedback(null)
          setSelectedUserId('')
          setIsCreateModalOpen(true)
        }}
      >
        <PlusIcon className='size-5' strokeWidth={2.6} />
        Añadir profesor
      </Button>

      {feedback ? (
        <Panel tone='i' className='text-sm font-bold'>
          {feedback}
        </Panel>
      ) : null}

      <div>
        <SectionLabel>{teachers.length === 1 ? '1 profesor' : `${teachers.length} profesores`}</SectionLabel>
        {loading && teachers.length === 0 ? (
          <div className='flex flex-col gap-2' aria-hidden='true'>
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className='h-16 animate-pulse rounded-2xl bg-muted' />
            ))}
          </div>
        ) : error ? (
          <Panel tone='bad' className='text-sm font-bold'>
            {error}
          </Panel>
        ) : teachers.length === 0 ? (
          <Panel>
            <EmptyState title='Todavía no hay profesores' text='Añade el primero con el botón de arriba.' />
          </Panel>
        ) : (
          <RowGroup>
            {teachers.map((teacher) => (
              <div key={teacher.userId} className='flex items-center gap-3 py-3'>
                <span className='flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--ica-i-soft)] text-sm font-black text-[var(--ica-i-ink)] uppercase'>
                  {teacher.displayName.charAt(0) || '?'}
                </span>
                <span className='min-w-0 flex-1'>
                  <span className='block truncate font-extrabold'>{teacher.displayName}</span>
                  <span className='block truncate text-xs font-semibold text-muted-foreground'>
                    {teacher.username ? `@${teacher.username} · ` : ''}
                    <span className='font-mono'>{teacher.userId}</span>
                  </span>
                </span>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-sm'
                  className='rounded-xl text-[var(--ica-bad-ink)]'
                  onClick={() => setTeacherPendingDelete(teacher)}
                  disabled={deletingUserId === teacher.userId}
                  aria-label={`Quitar a ${teacher.displayName}`}
                >
                  <Trash2Icon className='size-4' strokeWidth={2.6} />
                </Button>
              </div>
            ))}
          </RowGroup>
        )}
      </div>

      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir profesor</DialogTitle>
            <DialogDescription>
              Selecciona un usuario de la app para asignarlo como profesor de
              ICADEMY.
            </DialogDescription>
          </DialogHeader>

          <div className='grid gap-1.5'>
            <Label>Usuario</Label>
            <Combobox
              value={selectedUserId}
              onValueChange={setSelectedUserId}
              options={availableUserOptions}
              placeholder='Selecciona un usuario'
              searchPlaceholder='Buscar por nombre, username o UUID...'
              emptyLabel='No hay usuarios disponibles'
            />
          </div>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setIsCreateModalOpen(false)}
              disabled={isCreating}
            >
              Cancelar
            </Button>
            <Button
              type='button'
              onClick={() => void handleCreate()}
              disabled={isCreating || !selectedUser}
            >
              {isCreating ? 'Creando...' : 'Crear profesor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(teacherPendingDelete)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setTeacherPendingDelete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quitar profesor</DialogTitle>
            <DialogDescription>
              {teacherPendingDelete
                ? `Vas a eliminar a ${teacherPendingDelete.displayName} de la tabla de profesores.`
                : 'Confirma que quieres quitar a este profesor.'}
            </DialogDescription>
          </DialogHeader>

          <p className='text-sm text-muted-foreground'>
            Su cuenta sigue en la app: solo deja de ser profesor.
          </p>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setTeacherPendingDelete(null)}
              disabled={Boolean(deletingUserId)}
            >
              Cancelar
            </Button>
            <Button
              type='button'
              variant='destructive'
              onClick={() => void handleConfirmDelete()}
              disabled={Boolean(deletingUserId)}
            >
              {deletingUserId ? 'Eliminando...' : 'Quitar profesor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

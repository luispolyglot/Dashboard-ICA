import { useEffect, useMemo, useState } from 'react'
import { PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

export function ManageIcademyTeachersView() {
  const [teachers, setTeachers] = useState<IcademyTeacher[]>([])
  const [users, setUsers] = useState<IcademyTeacherAssignableUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)

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

  return (
    <section className='mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-5 py-8'>
      <div className='mb-6'>
        <h2 className='mb-1 font-serif text-3xl font-bold'>Profesores ICADEMY</h2>
        <p className='text-sm text-muted-foreground'>
          Panel de SUPER ADMIN para asignar o quitar el rol de profesor.
        </p>
      </div>

      <Card>
        <CardHeader className='gap-4'>
          <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
            <CardTitle>Tabla de profesores ({teachers.length})</CardTitle>
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  setFeedback(null)
                  setSelectedUserId('')
                  setIsCreateModalOpen(true)
                }}
              >
                <PlusIcon className='h-4 w-4' />
                Nuevo profesor
              </Button>
              <Button
                type='button'
                variant='ghost'
                onClick={() => void loadData()}
                disabled={loading}
              >
                <RefreshCwIcon className='h-4 w-4' />
                Recargar
              </Button>
            </div>
          </div>

          {feedback && (
            <p className='rounded-md border border-border bg-muted/40 px-3 py-2 text-sm'>
              {feedback}
            </p>
          )}
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className='text-sm text-muted-foreground'>Cargando profesores...</p>
          ) : error ? (
            <p className='rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive'>
              {error}
            </p>
          ) : teachers.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              No hay profesores asignados.
            </p>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full min-w-[520px] text-sm'>
                <thead>
                  <tr className='border-b text-left text-muted-foreground'>
                    <th className='px-3 py-2 font-medium'>Nombre</th>
                    <th className='px-3 py-2 font-medium'>Username</th>
                    <th className='px-3 py-2 font-medium'>UUID</th>
                    <th className='px-3 py-2 font-medium text-right'>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((teacher) => (
                    <tr key={teacher.userId} className='border-b align-middle'>
                      <td className='px-3 py-2'>{teacher.displayName}</td>
                      <td className='px-3 py-2 text-muted-foreground'>
                        {teacher.username || '-'}
                      </td>
                      <td className='px-3 py-2 font-mono text-xs text-muted-foreground'>
                        {teacher.userId}
                      </td>
                      <td className='px-3 py-2 text-right'>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={() => void handleDelete(teacher.userId)}
                          disabled={deletingUserId === teacher.userId}
                        >
                          <Trash2Icon className='h-4 w-4' />
                          {deletingUserId === teacher.userId
                            ? 'Eliminando...'
                            : 'Eliminar'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar profesor</DialogTitle>
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
    </section>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EyeIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
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
  fetchAvailableUsersForCoaching,
  fetchCoachingAccess,
  fetchCoachingAdmins,
  fetchCoachingManagedUsers,
  type CoachingAdminRow,
  type CoachingAvailableUser,
  type CoachingManagedUser,
  type CoachingScope,
  upsertCoachingAdmin,
  upsertCoachingUser,
} from '../services/coaching'
import { LANGUAGES, LEVELS } from '../constants'
import { getManageCoachingUserRoute } from '../routes/paths'

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No disponible'
  return date.toLocaleString()
}

function createScopeKey(targetLang: string, level: string): string {
  return `${targetLang.trim().toLowerCase()}::${level.trim().toUpperCase()}`
}

export function ManageCoachingView() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const [users, setUsers] = useState<CoachingManagedUser[]>([])
  const [availableUsers, setAvailableUsers] = useState<CoachingAvailableUser[]>([])
  const [admins, setAdmins] = useState<CoachingAdminRow[]>([])
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false)
  const [createUserSelection, setCreateUserSelection] = useState('')
  const [createUserLevel, setCreateUserLevel] = useState('')
  const [isSavingUser, setIsSavingUser] = useState(false)

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<CoachingManagedUser | null>(null)

  const [isCreateAdminModalOpen, setIsCreateAdminModalOpen] = useState(false)
  const [createAdminUserId, setCreateAdminUserId] = useState('')
  const [createAdminRole, setCreateAdminRole] = useState<'coach_admin' | 'super_admin'>('coach_admin')
  const [createAdminScopes, setCreateAdminScopes] = useState<CoachingScope[]>([])
  const [createAdminScopeLanguage, setCreateAdminScopeLanguage] = useState('')
  const [createAdminScopeLevel, setCreateAdminScopeLevel] = useState('')
  const [isSavingAdmin, setIsSavingAdmin] = useState(false)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    setFeedback(null)

    try {
      const [access, usersData, availableData] = await Promise.all([
        fetchCoachingAccess(),
        fetchCoachingManagedUsers(),
        fetchAvailableUsersForCoaching(),
      ])

      setUsers(usersData)
      setAvailableUsers(availableData)
      setIsSuperAdmin(Boolean(access?.isCoachingSuperAdmin))

      if (access?.isCoachingSuperAdmin) {
        const adminRows = await fetchCoachingAdmins()
        setAdmins(adminRows)
      } else {
        setAdmins([])
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo cargar el panel de coaching.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const availableOptions = useMemo(() => {
    return availableUsers
      .filter((row) => !row.alreadyInCoaching)
      .sort((a, b) => {
        const byName = a.userDisplayName.localeCompare(b.userDisplayName, 'es', {
          sensitivity: 'base',
        })
        if (byName !== 0) return byName
        return a.targetLang.localeCompare(b.targetLang, 'es', {
          sensitivity: 'base',
        })
      })
      .map((row) => ({
        key: `${row.userId}::${row.targetLang}`,
        row,
      }))
  }, [availableUsers])

  const availableComboboxOptions = useMemo<ComboboxOption[]>(
    () =>
      availableOptions.map((item) => ({
        value: item.key,
        label: `${item.row.userDisplayName} · ${item.row.targetLang} (${item.row.activeLevel})`,
        keywords: `${item.row.userDisplayName} ${item.row.targetLang} ${item.row.activeLevel} ${item.row.userId}`,
      })),
    [availableOptions],
  )

  const uniqueAvailableUsers = useMemo(() => {
    const seen = new Set<string>()
    const output: Array<{ userId: string; label: string }> = []
    for (const row of availableUsers) {
      if (seen.has(row.userId)) continue
      seen.add(row.userId)
      output.push({ userId: row.userId, label: `${row.userDisplayName} (${row.userId})` })
    }
    return output.sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }))
  }, [availableUsers])

  const coachingLevels = useMemo(() => LEVELS, [])

  const scopeList = useMemo(
    () =>
      createAdminScopes.flatMap((scope) =>
        scope.levels.map((level) => ({
          targetLang: scope.targetLang,
          level,
          key: createScopeKey(scope.targetLang, level),
        })),
      ),
    [createAdminScopes],
  )

  const handleCreateUser = async () => {
    const selected = availableOptions.find((item) => item.key === createUserSelection)
    if (!selected) {
      setFeedback('Selecciona un usuario con idioma activo.')
      return
    }

    setIsSavingUser(true)
    setFeedback(null)

    try {
      await upsertCoachingUser({
        userId: selected.row.userId,
        targetLang: selected.row.targetLang,
        nativeLang: selected.row.nativeLang,
        level: createUserLevel.trim() || selected.row.activeLevel,
        isActive: true,
      })
      setIsCreateUserModalOpen(false)
      setCreateUserSelection('')
      setCreateUserLevel('')
      setFeedback('Usuario añadido al coaching correctamente.')
      await loadData()
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo añadir el usuario al coaching.'
      setFeedback(message)
    } finally {
      setIsSavingUser(false)
    }
  }


  const handleAskDeleteUser = (row: CoachingManagedUser) => {
    setUserToDelete(row)
    setDeleteModalOpen(true)
  }

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return

    setIsSavingUser(true)
    setFeedback(null)

    try {
      await upsertCoachingUser({
        userId: userToDelete.userId,
        targetLang: userToDelete.targetLang,
        nativeLang: userToDelete.nativeLang,
        level: userToDelete.level,
        classSessions: userToDelete.classSessions,
        feedbackNmUrl: userToDelete.feedbackNmUrl,
        feedbackNmNotes: userToDelete.feedbackNmNotes,
        weeklyObjectives: userToDelete.weeklyObjectives,
        notes: userToDelete.notes,
        isActive: false,
      })

      setDeleteModalOpen(false)
      setUserToDelete(null)
      setFeedback('Usuario removido de coaching correctamente.')
      await loadData()
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo eliminar el usuario de coaching.'
      setFeedback(message)
    } finally {
      setIsSavingUser(false)
    }
  }

  const handleCreateAdmin = async () => {
    if (!createAdminUserId.trim()) {
      setFeedback('Debes seleccionar un usuario para crear coach admin.')
      return
    }

    setIsSavingAdmin(true)
    setFeedback(null)

    try {
      if (createAdminRole === 'coach_admin' && createAdminScopes.length === 0) {
        setFeedback('Agrega al menos un scope de idioma y nivel para el coach.')
        setIsSavingAdmin(false)
        return
      }

      await upsertCoachingAdmin({
        userId: createAdminUserId,
        role: createAdminRole,
        scopes: createAdminRole === 'super_admin' ? [] : createAdminScopes,
      })
      setIsCreateAdminModalOpen(false)
      setCreateAdminUserId('')
      setCreateAdminRole('coach_admin')
      setCreateAdminScopes([])
      setCreateAdminScopeLanguage('')
      setCreateAdminScopeLevel('')
      setFeedback('Coach admin guardado correctamente.')
      await loadData()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo guardar el coach admin.'
      setFeedback(message)
    } finally {
      setIsSavingAdmin(false)
    }
  }

  const handleAddScope = () => {
    const targetLang = createAdminScopeLanguage.trim()
    const level = createAdminScopeLevel.trim().toUpperCase()
    if (!targetLang || !level) {
      setFeedback('Selecciona idioma y nivel para agregar un scope.')
      return
    }

    const nextKey = createScopeKey(targetLang, level)
    const exists = createAdminScopes.some((scope) =>
      scope.levels.some((itemLevel) => createScopeKey(scope.targetLang, itemLevel) === nextKey),
    )

    if (exists) {
      setFeedback('Ese scope ya fue agregado.')
      return
    }

    setFeedback(null)
    setCreateAdminScopes((prev) => {
      const existing = prev.find((scope) => scope.targetLang === targetLang)
      if (!existing) {
        return [...prev, { targetLang, levels: [level] }]
      }

      return prev.map((scope) =>
        scope.targetLang !== targetLang
          ? scope
          : { ...scope, levels: Array.from(new Set([...scope.levels, level])) },
      )
    })
  }

  const handleRemoveScope = (targetLang: string, level: string) => {
    setCreateAdminScopes((prev) =>
      prev
        .map((scope) =>
          scope.targetLang !== targetLang
            ? scope
            : {
                ...scope,
                levels: scope.levels.filter((item) => item !== level),
              },
        )
        .filter((scope) => scope.levels.length > 0),
    )
  }

  return (
    <section className='mx-auto w-full max-w-7xl flex-1 overflow-y-auto px-5 py-8'>
      <div className='mb-6 flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='mb-1 font-serif text-3xl font-bold'>Administrar Coaching</h2>
          <p className='text-sm text-muted-foreground'>
            Gestiona usuarios del coaching por idioma, nivel y objetivos semanales.
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button type='button' variant='outline' onClick={() => setIsCreateUserModalOpen(true)}>
            <PlusIcon className='h-4 w-4' />
            Agregar usuario
          </Button>
          {isSuperAdmin && (
            <Button type='button' variant='outline' onClick={() => setIsCreateAdminModalOpen(true)}>
              <PlusIcon className='h-4 w-4' />
              Crear coach
            </Button>
          )}
          <Button type='button' variant='ghost' onClick={() => void loadData()}>
            <RefreshCwIcon className='h-4 w-4' />
            Recargar
          </Button>
        </div>
      </div>

      {(error || feedback) && (
        <p className={`mb-4 text-sm ${error ? 'text-destructive' : 'text-muted-foreground'}`}>
          {error || feedback}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Usuarios en coaching ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className='text-sm text-muted-foreground'>Cargando tabla...</p>
          ) : users.length === 0 ? (
            <p className='text-sm text-muted-foreground'>No hay usuarios asignados todavía.</p>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full min-w-200 table-fixed text-left text-sm'>
                <thead>
                  <tr className='border-b text-muted-foreground'>
                    <th className='pb-2 font-medium'>Usuario</th>
                    <th className='pb-2 font-medium'>Idioma</th>
                    <th className='pb-2 font-medium'>Nivel</th>
                    <th className='pb-2 font-medium'>Coach</th>
                    <th className='pb-2 font-medium'>Activo</th>
                    <th className='pb-2 font-medium'>Actualizado</th>
                    <th className='pb-2 font-medium'>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((row) => (
                    <tr key={`${row.userId}-${row.targetLang}`} className='border-b align-middle last:border-b-0'>
                      <td className='py-2'>
                        <p className='font-medium'>{row.userDisplayName}</p>
                        {isSuperAdmin && (
                          <p className='text-xs text-muted-foreground'>{row.userId}</p>
                        )}
                      </td>
                      <td className='py-2'>
                        <p>{row.targetLang}</p>
                        <p className='text-xs text-muted-foreground'>
                          Activo app: {row.activeTargetLang || '-'} ({row.activeLevel || '-'})
                        </p>
                      </td>
                      <td className='py-2'>{row.level}</td>
                      <td className='py-2'>{row.coachDisplayName || '-'}</td>
                      <td className='py-2'>{row.isActive ? 'Sí' : 'No'}</td>
                      <td className='py-2 text-xs text-muted-foreground'>{formatDateTime(row.updatedAt)}</td>
                      <td className='py-2'>
                        <div className='flex flex-wrap gap-2'>
                          <Button
                            type='button'
                            variant='outline'
                            size='icon'
                            aria-label='Ver usuario coaching'
                            onClick={() =>
                              navigate(getManageCoachingUserRoute(row.userId, row.targetLang))
                            }
                          >
                            <EyeIcon className='h-4 w-4' />
                          </Button>
                          <Button
                            type='button'
                            variant='outline'
                            size='icon'
                            aria-label='Eliminar usuario coaching'
                            onClick={() => handleAskDeleteUser(row)}
                          >
                            <Trash2Icon className='h-4 w-4' />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {isSuperAdmin && (
        <Card className='mt-4'>
          <CardHeader>
            <CardTitle>Coaches admin ({admins.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {admins.length === 0 ? (
              <p className='text-sm text-muted-foreground'>No hay coaches admin creados.</p>
            ) : (
              <div className='overflow-x-auto'>
                <table className='w-full min-w-160 table-fixed text-left text-sm'>
                  <thead>
                    <tr className='border-b text-muted-foreground'>
                      <th className='pb-2 font-medium'>Usuario</th>
                      <th className='pb-2 font-medium'>Rol</th>
                      <th className='pb-2 font-medium'>Scopes</th>
                      <th className='pb-2 font-medium'>Estado</th>
                      <th className='pb-2 font-medium'>Creado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admins.map((row) => (
                      <tr key={row.userId} className='border-b last:border-b-0'>
                        <td className='py-2'>
                          <p className='font-medium'>{row.userDisplayName}</p>
                          <p className='text-xs text-muted-foreground'>{row.userId}</p>
                        </td>
                        <td className='py-2'>{row.role}</td>
                        <td className='py-2'>
                          {row.scopes.length === 0
                            ? 'Sin scopes (acceso completo por rol)'
                            : row.scopes
                                .map((scope) => `${scope.targetLang} [${scope.levels.join(', ') || 'todos'}]`)
                                .join(' · ')}
                        </td>
                        <td className='py-2'>{row.isActive ? 'Activo' : 'Inactivo'}</td>
                        <td className='py-2 text-xs text-muted-foreground'>
                          {formatDateTime(row.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={isCreateUserModalOpen} onOpenChange={setIsCreateUserModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar usuario al coaching</DialogTitle>
            <DialogDescription>
              Selecciona un usuario y su idioma activo. Se precompleta con su nivel actual.
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-3'>
            <div className='space-y-1.5'>
              <Label>Usuario + idioma</Label>
              <Combobox
                value={createUserSelection}
                onValueChange={(key) => {
                  setCreateUserSelection(key)
                  const selected = availableOptions.find((item) => item.key === key)
                  setCreateUserLevel(selected?.row.activeLevel || '')
                }}
                options={availableComboboxOptions}
                placeholder='Selecciona un usuario'
                searchPlaceholder='Buscar por nombre, idioma o ID'
                emptyLabel='No se encontraron usuarios'
              />
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='coaching-level'>Nivel coaching</Label>
              <Input
                id='coaching-level'
                value={createUserLevel}
                onChange={(event) => setCreateUserLevel(event.target.value)}
                placeholder='A2 / B1 / B2'
              />
            </div>
          </div>

          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => setIsCreateUserModalOpen(false)}>
              Cancelar
            </Button>
            <Button type='button' onClick={() => void handleCreateUser()} disabled={isSavingUser}>
              {isSavingUser ? 'Guardando...' : 'Agregar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar usuario del coaching</DialogTitle>
            <DialogDescription>
              Esta acción desactiva su membresía en coaching para el idioma seleccionado.
            </DialogDescription>
          </DialogHeader>

          <p className='text-sm text-muted-foreground'>
            Usuario: <span className='font-medium text-foreground'>{userToDelete?.userDisplayName || '-'}</span>
            {' · '}Idioma: <span className='font-medium text-foreground'>{userToDelete?.targetLang || '-'}</span>
          </p>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                setDeleteModalOpen(false)
                setUserToDelete(null)
              }}
            >
              Cancelar
            </Button>
            <Button type='button' onClick={() => void handleConfirmDeleteUser()} disabled={isSavingUser}>
              {isSavingUser ? 'Eliminando...' : 'Confirmar eliminación'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateAdminModalOpen} onOpenChange={setIsCreateAdminModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear coach admin</DialogTitle>
            <DialogDescription>
              Define rol y agrega scopes con idioma y nivel válidos.
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-3'>
            <div className='space-y-1.5'>
              <Label htmlFor='create-admin-user'>Usuario</Label>
              <select
                id='create-admin-user'
                className='h-10 w-full rounded-md border bg-background px-3 text-sm'
                value={createAdminUserId}
                onChange={(event) => setCreateAdminUserId(event.target.value)}
              >
                <option value=''>Selecciona usuario</option>
                {uniqueAvailableUsers.map((row) => (
                  <option key={row.userId} value={row.userId}>
                    {row.label}
                  </option>
                ))}
              </select>
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='create-admin-role'>Rol</Label>
              <select
                id='create-admin-role'
                className='h-10 w-full rounded-md border bg-background px-3 text-sm'
                value={createAdminRole}
                onChange={(event) =>
                  setCreateAdminRole(event.target.value as 'coach_admin' | 'super_admin')
                }
              >
                <option value='coach_admin'>coach_admin</option>
                <option value='super_admin'>super_admin</option>
              </select>
            </div>

            {createAdminRole === 'coach_admin' && (
              <div className='space-y-3 rounded-md border p-3'>
                <p className='text-sm font-medium'>Scopes del coach</p>

                <div className='flex w-full flex-row gap-2'>
                  <div className='space-y-1.5'>
                    <Label htmlFor='create-admin-scope-language'>Idioma</Label>
                    <select
                      id='create-admin-scope-language'
                      className='h-10 w-full rounded-md border bg-background px-3 text-sm'
                      value={createAdminScopeLanguage}
                      onChange={(event) => setCreateAdminScopeLanguage(event.target.value)}
                    >
                      <option value=''>Selecciona idioma</option>
                      {LANGUAGES.map((language) => (
                        <option key={language} value={language}>
                          {language}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className='space-y-1.5'>
                    <Label htmlFor='create-admin-scope-level'>Nivel</Label>
                    <select
                      id='create-admin-scope-level'
                      className='h-10 w-full max-w-14 rounded-md border bg-background px-3 text-sm'
                      value={createAdminScopeLevel}
                      onChange={(event) => setCreateAdminScopeLevel(event.target.value)}
                    >
                      <option value=''>-</option>
                      {coachingLevels.map((level) => (
                        <option key={level} value={level}>
                          {level === '0' ? '0 (Pre-A1)' : level}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className='flex items-end'>
                    <Button
                      type='button'
                      variant='outline'
                      onClick={handleAddScope}
                      disabled={!createAdminScopeLanguage || !createAdminScopeLevel}
                    >
                      <PlusIcon className='h-4 w-4' />
                      Añadir
                    </Button>
                  </div>
                </div>

                {scopeList.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>No hay scopes agregados.</p>
                ) : (
                  <div className='space-y-2'>
                    {scopeList.map((scopeItem) => (
                      <div key={scopeItem.key} className='flex items-center justify-between rounded-md border px-3 py-2 text-sm'>
                        <span>
                          {scopeItem.targetLang} · {scopeItem.level}
                        </span>
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          onClick={() =>
                            handleRemoveScope(scopeItem.targetLang, scopeItem.level)
                          }
                        >
                          Quitar
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => setIsCreateAdminModalOpen(false)}>
              Cancelar
            </Button>
            <Button type='button' onClick={() => void handleCreateAdmin()} disabled={isSavingAdmin}>
              {isSavingAdmin ? 'Guardando...' : 'Crear coach'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

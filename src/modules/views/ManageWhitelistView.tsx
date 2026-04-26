import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  FileUpIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
} from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createWhitelistManualUser,
  fetchWhitelist,
  syncWhitelistCsv,
  type WhitelistEntry,
  updateWhitelistFlags,
} from '../services/whitelistAdmin'

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No disponible'
  return date.toLocaleString()
}

export function ManageWhitelistView() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<WhitelistEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [manualEmail, setManualEmail] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [processingRow, setProcessingRow] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [search])

  const loadRows = async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await fetchWhitelist(debouncedSearch)
      setRows(data)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo cargar la whitelist.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRows()
  }, [debouncedSearch])

  const sourceLabel = useMemo(() => {
    return (value: string) => {
      if (value === 'csv_sync') return 'CSV sync'
      if (value === 'manual') return 'Manual'
      return value
    }
  }, [])

  const handleToggle = async (
    email: string,
    key: 'canRegister' | 'canLogin',
    value: boolean,
  ) => {
    setProcessingRow(`${email}:${key}`)
    setFeedback(null)

    try {
      await updateWhitelistFlags({
        email,
        ...(key === 'canRegister'
          ? { canRegister: value }
          : { canLogin: value }),
      })

      setRows((prev) =>
        prev.map((row) => {
          if (row.email !== email) return row
          return {
            ...row,
            [key]: value,
          }
        }),
      )
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo actualizar la fila.'
      setFeedback(message)
    } finally {
      setProcessingRow(null)
    }
  }

  const handleCreate = async () => {
    const normalizedEmail = manualEmail.trim().toLowerCase()
    if (!normalizedEmail.includes('@')) {
      setFeedback('Ingresa un email válido para crear el registro manual.')
      return
    }

    setIsCreating(true)
    setFeedback(null)

    try {
      await createWhitelistManualUser(normalizedEmail)
      setIsCreateModalOpen(false)
      setManualEmail('')
      setFeedback('Usuario añadido a whitelist manualmente.')
      await loadRows()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo crear el usuario.'
      setFeedback(message)
    } finally {
      setIsCreating(false)
    }
  }

  const handleCsvUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.currentTarget.value = ''
    if (!file) return

    const looksLikeCsv =
      file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')
    if (!looksLikeCsv) {
      setFeedback('El archivo debe ser .csv')
      return
    }

    setIsSyncing(true)
    setFeedback(null)

    try {
      const result = await syncWhitelistCsv(file)
      setFeedback(
        `Sync completado: ${result.total} emails procesados, ${result.inserted} upserts, ${result.disabled} deshabilitados.`,
      )
      await loadRows()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo sincronizar el CSV.'
      setFeedback(message)
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <section className='mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-5 py-8'>
      <div className='mb-6'>
        <h2 className='mb-1 font-serif text-3xl font-bold'>
          Gestionar whitelist
        </h2>
        <p className='text-sm text-muted-foreground'>
          Panel exclusivo para SUPER ADMIN para habilitar o bloquear
          registro/login por email.
        </p>
      </div>

      <Card>
        <CardHeader className='gap-4'>
          <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
            <CardTitle>Usuarios en whitelist ({rows.length})</CardTitle>
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                variant='outline'
                onClick={() => setIsCreateModalOpen(true)}
              >
                <PlusIcon className='h-4 w-4' />
                Nuevo manual
              </Button>
              <Button
                type='button'
                variant='outline'
                onClick={() => fileInputRef.current?.click()}
                disabled={isSyncing}
              >
                <FileUpIcon className='h-4 w-4' />
                {isSyncing ? 'Sincronizando...' : 'Subir CSV'}
              </Button>
              <Button
                type='button'
                variant='ghost'
                onClick={() => void loadRows()}
                disabled={loading}
              >
                <RefreshCwIcon className='h-4 w-4' />
                Recargar
              </Button>
              <input
                ref={fileInputRef}
                type='file'
                accept='.csv,text/csv'
                className='hidden'
                onChange={handleCsvUpload}
              />
            </div>
          </div>

          <div className='max-w-sm'>
            <Label htmlFor='whitelist-email-search' className='mb-1.5 block'>
              Buscar por email
            </Label>
            <Input
              id='whitelist-email-search'
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder='usuario@email.com'
            />
          </div>

          {(feedback || error) && (
            <p
              className={`text-sm ${error ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              {error || feedback}
            </p>
          )}
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className='text-sm text-muted-foreground'>
              Cargando whitelist...
            </p>
          ) : rows.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              No hay registros para mostrar.
            </p>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full min-w-160 table-fixed text-left text-sm'>
                <thead className='table w-full table-fixed'>
                  <tr className='border-b text-muted-foreground'>
                    <th className='w-[34%] pb-2 font-medium'>Email</th>
                    <th className='w-[14%] pb-2 font-medium'>Source</th>
                    <th className='w-[16%] pb-2 font-medium'>Can register</th>
                    <th className='w-[16%] pb-2 font-medium'>Can login</th>
                    <th className='w-[20%] pb-2 font-medium'>Updated</th>
                  </tr>
                </thead>
                <tbody className='block max-h-[56dvh] overflow-y-auto'>
                  {rows.map((row) => {
                    const canRegisterLoading =
                      processingRow === `${row.email}:canRegister`
                    const canLoginLoading =
                      processingRow === `${row.email}:canLogin`

                    return (
                      <tr key={row.email} className='table w-full table-fixed border-b align-middle last:border-b-0'>
                        <td className='w-[34%] py-2 font-mono text-xs'>{row.email}</td>
                        <td className='w-[14%] py-2'>{sourceLabel(row.source)}</td>
                        <td className='w-[16%] py-2'>
                          <label className='inline-flex items-center gap-2'>
                            <input
                              type='checkbox'
                              checked={row.canRegister}
                              disabled={canRegisterLoading}
                              onChange={(event) =>
                                void handleToggle(
                                  row.email,
                                  'canRegister',
                                  event.target.checked,
                                )
                              }
                            />
                            <span>{row.canRegister ? 'true' : 'false'}</span>
                          </label>
                        </td>
                        <td className='w-[16%] py-2'>
                          <label className='inline-flex items-center gap-2'>
                            <input
                              type='checkbox'
                              checked={row.canLogin}
                              disabled={canLoginLoading}
                              onChange={(event) =>
                                void handleToggle(
                                  row.email,
                                  'canLogin',
                                  event.target.checked,
                                )
                              }
                            />
                            <span>{row.canLogin ? 'true' : 'false'}</span>
                          </label>
                        </td>
                        <td className='w-[20%] py-2 text-xs text-muted-foreground'>
                          {formatDateTime(row.updatedAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear usuario manual</DialogTitle>
            <DialogDescription>
              Añade un email a la whitelist con `can_register=true`,
              `can_login=true` y `source=manual`.
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-1.5'>
            <Label htmlFor='manual-whitelist-email'>Email</Label>
            <Input
              id='manual-whitelist-email'
              type='email'
              placeholder='usuario@email.com'
              value={manualEmail}
              onChange={(event) => setManualEmail(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type='button'
              onClick={() => void handleCreate()}
              disabled={isCreating}
            >
              {isCreating ? 'Guardando...' : 'Crear usuario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className='mt-4 flex items-start gap-2 rounded-md border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-xs text-amber-900'>
        <ShieldAlertIcon className='mt-0.5 h-4 w-4 shrink-0' />
        <p>
          Cambios realizados aquí impactan directamente la capacidad de registro
          e inicio de sesión.
        </p>
      </div>
    </section>
  )
}

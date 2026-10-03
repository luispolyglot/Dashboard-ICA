import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  FileUpIcon,
  MailIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { EmptyState, IconTile, PageTitle, Panel, RowGroup, StatTile } from '../game/ui'
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  createWhitelistManualUser,
  fetchWhitelist,
  syncWhitelistCsv,
  type WhitelistEntry,
  updateWhitelistFlags,
} from '../services/whitelistAdmin'
import { formatDateTime } from '../utils'
import { useSoftLoading } from '../hooks/useSoftLoading'

export function ManageWhitelistView() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [loading, setLoading, refreshing] = useSoftLoading(true)
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
      const data = await fetchWhitelist(
        debouncedSearch,
        sourceFilter === 'all' ? null : sourceFilter,
      )
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
  }, [debouncedSearch, sourceFilter])

  const sourceLabel = useMemo(() => {
    return (value: string) => {
      if (value === 'csv_sync') return 'CSV sync'
      if (value === 'manual') return 'Manual'
      return value
    }
  }, [])

  const sourceOptions = useMemo(() => {
    const values = new Set(rows.map((row) => row.source))
    values.add('manual')
    values.add('csv_sync')
    return Array.from(values)
  }, [rows])

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

  const handleSourceChange = async (email: string, source: string) => {
    setProcessingRow(`${email}:source`)
    setFeedback(null)

    try {
      await updateWhitelistFlags({ email, source })

      setRows((prev) =>
        prev.map((row) => {
          if (row.email !== email) return row
          return {
            ...row,
            source,
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

  const totalCanLogin = rows.filter((row) => row.canLogin).length
  const blocked = rows.length - totalCanLogin

  return (
    <section className='mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pt-2 pb-8 lg:py-8'>
      <PageTitle
        icon={
          <IconTile tone='ok' size={48}>
            <ShieldCheckIcon className='size-6' strokeWidth={2.4} />
          </IconTile>
        }
        subtitle='Quién puede registrarse y entrar en la app.'
        right={
          <Button
            type='button'
            variant='outline'
            size='icon'
            className='rounded-2xl'
            onClick={() => void loadRows()}
            disabled={loading || refreshing}
            aria-label='Recargar'
          >
            <RefreshCwIcon className={loading || refreshing ? 'size-5 animate-spin' : 'size-5'} strokeWidth={2.6} />
          </Button>
        }
      >
        Whitelist
      </PageTitle>

      <div className='grid grid-cols-3 gap-3'>
        <StatTile tone='primary' value={String(rows.length)} label='emails' />
        <StatTile tone='ok' value={String(totalCanLogin)} label='con acceso' />
        <StatTile tone={blocked > 0 ? 'bad' : 'neutral'} value={String(blocked)} label='bloqueados' />
      </div>

      <div className='grid grid-cols-2 gap-2'>
        <Button type='button' size='lg' className='rounded-2xl' onClick={() => setIsCreateModalOpen(true)}>
          <PlusIcon className='size-5' strokeWidth={2.6} />
          Añadir email
        </Button>
        <Button
          type='button'
          size='lg'
          variant='outline'
          className='rounded-2xl'
          onClick={() => fileInputRef.current?.click()}
          disabled={isSyncing}
        >
          <FileUpIcon className='size-5' strokeWidth={2.6} />
          {isSyncing ? 'Sincronizando...' : 'Subir CSV'}
        </Button>
        <input ref={fileInputRef} type='file' accept='.csv,text/csv' className='hidden' onChange={handleCsvUpload} />
      </div>

      <div className='flex flex-col gap-3'>
        <div className='relative'>
          <SearchIcon className='pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted-foreground' strokeWidth={2.4} />
          <Input
            id='whitelist-email-search'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder='Buscar por email'
            aria-label='Buscar por email'
            className='h-12 rounded-2xl pl-10'
          />
        </div>
        <div className='flex flex-wrap gap-2' role='group' aria-label='Filtrar por origen'>
          {['all', ...sourceOptions].map((source) => {
            const active = sourceFilter === source
            return (
              <button
                key={source}
                type='button'
                onClick={() => setSourceFilter(source)}
                aria-pressed={active}
                className={cn(
                  'h-9 rounded-full border-2 px-3.5 text-xs font-extrabold transition-colors',
                  active ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                {source === 'all' ? 'Todos' : sourceLabel(source)}
              </button>
            )
          })}
        </div>
      </div>

      {feedback || error ? (
        <Panel tone={error ? 'bad' : 'i'} className='text-sm font-bold'>
          {error || feedback}
        </Panel>
      ) : null}

      {loading && rows.length === 0 ? (
        <div className='flex flex-col gap-2' aria-hidden='true'>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className='h-16 animate-pulse rounded-2xl bg-muted' />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Panel>
          <EmptyState
            icon={
              <IconTile tone='ok' size={56}>
                <MailIcon className='size-7' strokeWidth={2.4} />
              </IconTile>
            }
            title='No hay emails'
            text='Prueba con otra búsqueda o añade uno nuevo.'
          />
        </Panel>
      ) : (
        <RowGroup>
          {rows.map((row) => {
            const canRegisterLoading = processingRow === `${row.email}:canRegister`
            const canLoginLoading = processingRow === `${row.email}:canLogin`
            const sourceLoading = processingRow === `${row.email}:source`
            return (
              <div key={row.email} className='flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3'>
                <div className='flex min-w-0 flex-1 items-center gap-3'>
                  <span
                    className='flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-black uppercase'
                    style={{
                      background: row.canLogin ? 'var(--ica-ok-soft)' : 'var(--ica-bad-soft)',
                      color: row.canLogin ? 'var(--ica-ok-ink)' : 'var(--ica-bad-ink)',
                    }}
                    aria-hidden='true'
                  >
                    {row.email.charAt(0)}
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate text-sm font-extrabold'>{row.email}</span>
                    <span className='mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-muted-foreground'>
                      <Select value={row.source} onValueChange={(value) => void handleSourceChange(row.email, value)} disabled={sourceLoading}>
                        <SelectTrigger className='h-6 w-fit gap-1 rounded-full border-0 bg-muted px-2 text-[11px] font-extrabold'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {sourceOptions.map((source) => (
                            <SelectItem key={source} value={source}>
                              {sourceLabel(source)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {formatDateTime(row.updatedAt)}
                    </span>
                  </span>
                </div>
                <div className='flex shrink-0 items-center gap-4 pl-[52px] sm:pl-0'>
                  <label className='flex items-center gap-2 text-xs font-extrabold text-muted-foreground'>
                    <Switch
                      checked={row.canRegister}
                      disabled={canRegisterLoading}
                      onCheckedChange={(checked) => void handleToggle(row.email, 'canRegister', checked)}
                      aria-label={`Puede registrarse: ${row.email}`}
                    />
                    Registro
                  </label>
                  <label className='flex items-center gap-2 text-xs font-extrabold text-muted-foreground'>
                    <Switch
                      checked={row.canLogin}
                      disabled={canLoginLoading}
                      onCheckedChange={(checked) => void handleToggle(row.email, 'canLogin', checked)}
                      aria-label={`Puede entrar: ${row.email}`}
                    />
                    Entrar
                  </label>
                </div>
              </div>
            )
          })}
        </RowGroup>
      )}

      <Panel tone='gold' className='flex items-start gap-2 text-xs font-bold'>
        <ShieldAlertIcon className='mt-0.5 size-4 shrink-0' strokeWidth={2.6} />
        Lo que cambies aquí afecta al momento a quién puede registrarse y entrar.
      </Panel>

      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir email</DialogTitle>
            <DialogDescription>Podrá registrarse y entrar en la app desde ya.</DialogDescription>
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
            <Button type='button' variant='outline' onClick={() => setIsCreateModalOpen(false)}>
              Cancelar
            </Button>
            <Button type='button' onClick={() => void handleCreate()} disabled={isCreating}>
              {isCreating ? 'Guardando...' : 'Añadir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

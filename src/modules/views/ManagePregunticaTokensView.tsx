import { useEffect, useMemo, useState } from 'react'
import { MinusIcon, PlusIcon, RefreshCwIcon, SaveIcon, SearchIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState, IconTile, PageTitle, Panel, Pill, RowGroup, StatTile } from '../game/ui'
import { FichaIcon } from '../game/icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  fetchPregunticaTokensAdminOverview,
  updatePregunticaManualTokensForUser,
  type PregunticaTokensAdminUser,
} from '../services/pregunticaTokensAdmin'

const PAGE_SIZE_OPTIONS = [10, 50, 100] as const

export function ManagePregunticaTokensView() {
  const [rows, setRows] = useState<PregunticaTokensAdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState<number>(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [manualDraftByUserId, setManualDraftByUserId] = useState<
    Record<string, string>
  >({})

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetchPregunticaTokensAdminOverview()
      setRows(data)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No se pudieron cargar las ICA Coins.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filteredRows = useMemo(() => {
    const normalized = search.trim().toLowerCase()
    if (!normalized) return rows
    return rows.filter((row) => {
      return (
        row.username.toLowerCase().includes(normalized) ||
        row.userId.toLowerCase().includes(normalized)
      )
    })
  }, [rows, search])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, pageSize])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const visibleRows = filteredRows.slice(pageStart, pageStart + pageSize)

  const handleSaveManualTokens = async (row: PregunticaTokensAdminUser) => {
    const draft = (manualDraftByUserId[row.userId] ?? String(row.manualTokens)).trim()
    if (!/^\d+$/u.test(draft)) {
      toast.error('Las ICA Coins a mano deben ser un número entero (0 o más).')
      return
    }

    const nextValue = Number(draft)
    if (!Number.isInteger(nextValue) || nextValue < 0) {
      toast.error('Las ICA Coins a mano deben ser un número entero (0 o más).')
      return
    }

    if (nextValue === row.manualTokens) {
      toast('No hay cambios que guardar.')
      return
    }

    setSavingUserId(row.userId)
    try {
      const updated = await updatePregunticaManualTokensForUser(
        row.userId,
        nextValue,
      )

      setRows((prev) =>
        prev.map((item) =>
          item.userId === row.userId
            ? { ...item, manualTokens: updated.manualTokens }
            : item,
        ),
      )
      setManualDraftByUserId((prev) => ({
        ...prev,
        [row.userId]: String(updated.manualTokens),
      }))
      toast.success('ICA Coins actualizadas.')
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No se pudieron actualizar las ICA Coins.',
      )
    } finally {
      setSavingUserId(null)
    }
  }

  const totalMonthly = rows.reduce((sum, row) => sum + (Number(row.monthlyTokens) || 0), 0)
  const totalManual = rows.reduce((sum, row) => sum + (Number(row.manualTokens) || 0), 0)

  return (
    <section className='mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pt-2 pb-8 lg:py-8'>
      <PageTitle
        icon={
          <IconTile tone='gold' size={48}>
            <FichaIcon size={30} />
          </IconTile>
        }
        subtitle='Las ICA Coins de cada persona: las que ganó este mes y las que le das tú a mano.'
        right={
          <Button type='button' variant='outline' size='icon' className='rounded-2xl' onClick={() => void load()} disabled={loading} aria-label='Recargar'>
            <RefreshCwIcon className={loading ? 'size-5 animate-spin' : 'size-5'} strokeWidth={2.6} />
          </Button>
        }
      >
        ICA Coins
      </PageTitle>

      <div className='grid grid-cols-3 gap-3'>
        <StatTile tone='primary' value={String(rows.length)} label='personas' />
        <StatTile tone='gold' value={String(totalMonthly)} label='este mes' />
        <StatTile tone='c' value={String(totalManual)} label='a mano' />
      </div>

      <div className='flex flex-col gap-2 sm:flex-row'>
        <div className='relative flex-1'>
          <SearchIcon className='pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted-foreground' strokeWidth={2.4} />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder='Buscar por nombre o ID'
            aria-label='Buscar por nombre o ID'
            className='h-12 rounded-2xl pl-10'
          />
        </div>
        <div className='flex gap-1.5' role='group' aria-label='Cuántos mostrar'>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <button
              key={size}
              type='button'
              onClick={() => setPageSize(size)}
              aria-pressed={pageSize === size}
              className={cn(
                'h-12 min-w-12 rounded-2xl border-2 px-3 text-sm font-extrabold transition-colors',
                pageSize === size ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className='flex flex-col gap-2' aria-hidden='true'>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className='h-16 animate-pulse rounded-2xl bg-muted' />
          ))}
        </div>
      ) : filteredRows.length === 0 ? (
        <Panel>
          <EmptyState title='No hay nadie con esa búsqueda' text='Prueba con otro nombre o ID.' />
        </Panel>
      ) : (
        <>
          <RowGroup>
            {visibleRows.map((row) => {
              const draftValue = manualDraftByUserId[row.userId] ?? String(row.manualTokens)
              const isSaving = savingUserId === row.userId
              const changed = draftValue.trim() !== String(row.manualTokens)
              return (
                <div key={row.userId} className='flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3'>
                  <div className='flex min-w-0 flex-1 items-center gap-3'>
                    <span className='flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-border bg-muted text-sm font-black uppercase'>
                      {row.username.charAt(0) || '?'}
                    </span>
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate font-extrabold'>{row.username}</span>
                      <span className='block truncate font-mono text-[11px] text-muted-foreground'>{row.userId}</span>
                    </span>
                    <Pill tone='gold'>+{row.monthlyTokens} este mes</Pill>
                  </div>
                  <div className='flex shrink-0 items-center gap-2 pl-[52px] sm:pl-0'>
                    <span className='text-xs font-extrabold whitespace-nowrap text-muted-foreground'>A mano</span>
                    <Button
                      type='button'
                      variant='outline'
                      size='icon-sm'
                      className='h-10 rounded-xl'
                      aria-label={`Quitar 1 ICA Coin a ${row.username}`}
                      onClick={() =>
                        setManualDraftByUserId((prev) => ({
                          ...prev,
                          [row.userId]: String(Math.max(0, (Number(draftValue) || 0) - 1)),
                        }))
                      }
                    >
                      <MinusIcon className='size-4' strokeWidth={2.8} />
                    </Button>
                    <Input
                      type='text'
                      inputMode='numeric'
                      value={draftValue}
                      onChange={(event) => {
                        setManualDraftByUserId((prev) => ({ ...prev, [row.userId]: event.target.value }))
                      }}
                      className='h-10 w-14 rounded-xl px-1 text-center'
                      aria-label={`ICA Coins a mano de ${row.username}`}
                    />
                    <Button
                      type='button'
                      variant='outline'
                      size='icon-sm'
                      className='h-10 rounded-xl'
                      aria-label={`Dar 1 ICA Coin a ${row.username}`}
                      onClick={() =>
                        setManualDraftByUserId((prev) => ({
                          ...prev,
                          [row.userId]: String((Number(draftValue) || 0) + 1),
                        }))
                      }
                    >
                      <PlusIcon className='size-4' strokeWidth={2.8} />
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      className='h-10 rounded-xl'
                      variant={changed ? 'default' : 'outline'}
                      onClick={() => void handleSaveManualTokens(row)}
                      disabled={isSaving}
                    >
                      <SaveIcon className='size-4' strokeWidth={2.6} />
                      {isSaving ? 'Guardando...' : 'Guardar'}
                    </Button>
                  </div>
                </div>
              )
            })}
          </RowGroup>

          <div className='flex items-center justify-between gap-2'>
            <Button
              type='button'
              variant='outline'
              className='rounded-2xl'
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={safePage <= 1}
            >
              Anterior
            </Button>
            <p className='m-0 text-xs font-extrabold text-muted-foreground'>
              Página {safePage} de {totalPages}
            </p>
            <Button
              type='button'
              variant='outline'
              className='rounded-2xl'
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={safePage >= totalPages}
            >
              Siguiente
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

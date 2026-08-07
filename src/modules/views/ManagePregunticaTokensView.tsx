import { useEffect, useMemo, useState } from 'react'
import { RefreshCwIcon, SaveIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
          : 'No se pudieron cargar las fichas de PreguntICA.',
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
      toast.error('Las fichas manuales deben ser un entero no negativo.')
      return
    }

    const nextValue = Number(draft)
    if (!Number.isInteger(nextValue) || nextValue < 0) {
      toast.error('Las fichas manuales deben ser un entero no negativo.')
      return
    }

    if (nextValue === row.manualTokens) {
      toast('No hubo cambios para guardar en esa fila.')
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
      toast.success('Fichas manuales actualizadas correctamente.')
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No se pudieron actualizar las fichas manuales.',
      )
    } finally {
      setSavingUserId(null)
    }
  }

  return (
    <section className='mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-5 py-8'>
      <div className='mb-6'>
        <h2 className='mb-1 font-serif text-3xl font-bold'>Gestión Fichas PreguntICA</h2>
        <p className='text-sm text-muted-foreground'>
          Panel de SUPER ADMIN para consultar fichas mensuales y editar fichas
          manuales por usuario.
        </p>
      </div>

      <Card>
        <CardHeader className='gap-4'>
          <div className='flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
            <CardTitle>Usuarios ({filteredRows.length})</CardTitle>
            <div className='flex flex-col gap-2 sm:flex-row sm:items-end'>
              <div className='w-full min-w-[240px]'>
                <p className='mb-1.5 text-xs text-muted-foreground'>Buscar</p>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder='Username o ID'
                />
              </div>
              <div className='w-[130px]'>
                <p className='mb-1.5 text-xs text-muted-foreground'>Mostrar</p>
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => setPageSize(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Cantidad' />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type='button'
                variant='ghost'
                onClick={() => void load()}
                disabled={loading}
              >
                <RefreshCwIcon className='h-4 w-4' />
                Recargar
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className='text-sm text-muted-foreground'>Cargando usuarios...</p>
          ) : filteredRows.length === 0 ? (
            <p className='text-sm text-muted-foreground'>No hay usuarios para mostrar.</p>
          ) : (
            <>
              <div className='overflow-x-auto'>
                <table className='w-full min-w-200 table-fixed text-left text-sm'>
                  <thead className='table w-full table-fixed'>
                    <tr className='border-b text-muted-foreground'>
                      <th className='w-[24%] pb-2 font-medium'>Username</th>
                      <th className='w-[34%] pb-2 font-medium'>ID</th>
                      <th className='w-[14%] pb-2 font-medium'>Fichas mensuales</th>
                      <th className='w-[28%] pb-2 font-medium'>Fichas manuales</th>
                    </tr>
                  </thead>
                  <tbody className='block max-h-[56dvh] overflow-y-auto'>
                    {visibleRows.map((row) => {
                      const draftValue =
                        manualDraftByUserId[row.userId] ?? String(row.manualTokens)
                      const isSaving = savingUserId === row.userId

                      return (
                        <tr
                          key={row.userId}
                          className='table w-full table-fixed border-b align-middle last:border-b-0'
                        >
                          <td className='w-[24%] py-2 font-medium'>{row.username}</td>
                          <td className='w-[34%] py-2 font-mono text-xs'>{row.userId}</td>
                          <td className='w-[14%] py-2'>{row.monthlyTokens}</td>
                          <td className='w-[28%] py-2'>
                            <div className='flex items-center gap-2'>
                              <Input
                                type='number'
                                min={0}
                                step={1}
                                value={draftValue}
                                onChange={(event) => {
                                  setManualDraftByUserId((prev) => ({
                                    ...prev,
                                    [row.userId]: event.target.value,
                                  }))
                                }}
                                className='h-8 w-24'
                              />
                              <Button
                                type='button'
                                size='sm'
                                onClick={() => void handleSaveManualTokens(row)}
                                disabled={isSaving}
                              >
                                <SaveIcon className='h-4 w-4' />
                                {isSaving ? 'Guardando...' : 'Guardar'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className='mt-4 flex flex-wrap items-center justify-between gap-2'>
                <p className='text-xs text-muted-foreground'>
                  Página {safePage} de {totalPages}
                </p>
                <div className='flex gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={safePage <= 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                    }
                    disabled={safePage >= totalPages}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

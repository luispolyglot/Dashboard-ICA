import { useEffect, useMemo, useState } from 'react'
import { MessageCircleQuestionIcon, PencilIcon, RefreshCwIcon, SaveIcon, SearchIcon, Trash2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { EmptyState, IconTile, PageTitle, Panel, Pill, RowGroup, SectionLabel, StatTile } from '../game/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  bulkImportPregunticaQuestions,
  deletePregunticaQuestionIfUnused,
  fetchPregunticaQuestions,
  updatePregunticaQuestionState,
  updatePregunticaQuestionText,
  type PregunticaAdminQuestion,
} from '../services/pregunticaAdmin'

export function ManagePregunticaQuestionsView() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [rows, setRows] = useState<PregunticaAdminQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [search])

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetchPregunticaQuestions(debouncedSearch)
      setRows(data)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudieron cargar las preguntas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [debouncedSearch])

  const stats = useMemo(() => {
    const active = rows.filter((row) => row.isActive).length
    return {
      total: rows.length,
      active,
      inactive: Math.max(rows.length - active, 0),
    }
  }, [rows])

  const handleBulkImport = async () => {
    if (!bulkText.trim()) {
      setFeedback('Pega al menos una pregunta (una por línea).')
      return
    }

    setSaving(true)
    setFeedback(null)
    try {
      const result = await bulkImportPregunticaQuestions(bulkText)
      setFeedback(
        `Importación lista: ${result.insertedOrUpdated} guardadas, ${result.ignored} repetidas ignoradas.`,
      )
      setBulkText('')
      await load()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudieron guardar las preguntas')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (row: PregunticaAdminQuestion, next: boolean) => {
    setSaving(true)
    setFeedback(null)
    try {
      await updatePregunticaQuestionState(row.id, next)
      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, isActive: next } : item)))
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo actualizar el estado')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!editingId) return

    setSaving(true)
    setFeedback(null)
    try {
      await updatePregunticaQuestionText(editingId, editingValue)
      setRows((prev) =>
        prev.map((item) =>
          item.id === editingId
            ? { ...item, questionEs: editingValue.trim(), translations: {} }
            : item,
        ),
      )
      setEditingId(null)
      setEditingValue('')
      setFeedback('Pregunta actualizada. Se reinició caché de traducciones para esa entrada.')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo actualizar la pregunta')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (row: PregunticaAdminQuestion) => {
    if (!row.canDelete) {
      setFeedback('No se puede eliminar esta pregunta porque ya fue usada en intentos.')
      return
    }

    const confirmed = window.confirm(`¿Eliminar esta pregunta?\n\n"${row.questionEs}"`)
    if (!confirmed) return

    setSaving(true)
    setFeedback(null)
    try {
      await deletePregunticaQuestionIfUnused(row.id)
      setRows((prev) => prev.filter((item) => item.id !== row.id))
      if (editingId === row.id) {
        setEditingId(null)
        setEditingValue('')
      }
      setFeedback('Pregunta eliminada correctamente.')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo eliminar la pregunta')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className='mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pt-2 pb-8 lg:py-8'>
      <PageTitle
        icon={
          <IconTile tone='c' size={48}>
            <MessageCircleQuestionIcon className='size-6' strokeWidth={2.4} />
          </IconTile>
        }
        subtitle='Banco de preguntas en español. La traducción a cada idioma se guarda sola.'
        right={
          <Button type='button' variant='outline' size='icon' className='rounded-2xl' onClick={() => void load()} disabled={loading} aria-label='Recargar'>
            <RefreshCwIcon className={loading ? 'size-5 animate-spin' : 'size-5'} strokeWidth={2.6} />
          </Button>
        }
      >
        Preguntas PreguntICA
      </PageTitle>

      <div className='grid grid-cols-3 gap-3'>
        <StatTile tone='c' value={String(stats.total)} label='preguntas' />
        <StatTile tone='ok' value={String(stats.active)} label='activas' />
        <StatTile tone='neutral' value={String(stats.inactive)} label='inactivas' />
      </div>

      <div>
        <SectionLabel>Añadir preguntas</SectionLabel>
        <Panel className='flex flex-col gap-3'>
          <p className='m-0 text-sm font-semibold text-muted-foreground'>Pega preguntas en español, una por línea. Cada línea es una pregunta nueva.</p>
          <Textarea
            value={bulkText}
            onChange={(event) => setBulkText(event.target.value)}
            rows={6}
            className='rounded-2xl'
            placeholder={'¿Qué hiciste el fin de semana?\n¿Cuál es tu comida favorita?'}
          />
          <Button type='button' size='lg' className='w-full rounded-2xl sm:w-fit' onClick={handleBulkImport} disabled={saving}>
            <SaveIcon className='size-5' strokeWidth={2.6} />
            Guardar preguntas
          </Button>
        </Panel>
      </div>

      {feedback ? (
        <Panel tone='i' className='text-sm font-bold'>
          {feedback}
        </Panel>
      ) : null}

      <div>
        <SectionLabel>Banco</SectionLabel>
        <div className='relative mb-3'>
          <SearchIcon className='pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted-foreground' strokeWidth={2.4} />
          <Input
            placeholder='Buscar pregunta'
            aria-label='Buscar pregunta'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className='h-12 rounded-2xl pl-10'
          />
        </div>

        {loading && rows.length === 0 ? (
          <div className='flex flex-col gap-2' aria-hidden='true'>
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className='h-20 animate-pulse rounded-2xl bg-muted' />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Panel>
            <EmptyState title='No hay preguntas' text='Añade las primeras arriba.' />
          </Panel>
        ) : (
          <RowGroup>
            {rows.map((row) => {
              const editing = editingId === row.id
              return (
                <div key={row.id} className={cn('flex flex-col gap-2 py-3', !row.isActive && 'opacity-70')}>
                  {editing ? (
                    <Input value={editingValue} onChange={(event) => setEditingValue(event.target.value)} className='rounded-xl' autoFocus />
                  ) : (
                    <p className='m-0 text-[15px] font-bold'>{row.questionEs}</p>
                  )}
                  <div className='flex flex-wrap items-center gap-1.5'>
                    <Pill tone={row.canDelete ? 'ok' : 'a'}>{row.canDelete ? 'Sin usar' : `Usada ${row.usageCount} veces`}</Pill>
                    <Pill tone='i'>{Object.keys(row.translations || {}).length} traducciones</Pill>
                    <span className='flex-1' />
                    <label className='flex items-center gap-2 text-xs font-extrabold text-muted-foreground'>
                      <Switch checked={row.isActive} disabled={saving} onCheckedChange={(checked) => void handleToggle(row, checked)} aria-label='Activa' />
                      {row.isActive ? 'Activa' : 'Inactiva'}
                    </label>
                    {editing ? (
                      <>
                        <Button size='sm' className='rounded-xl' onClick={handleSaveEdit} disabled={saving}>
                          Guardar
                        </Button>
                        <Button
                          size='sm'
                          variant='ghost'
                          className='rounded-xl'
                          onClick={() => {
                            setEditingId(null)
                            setEditingValue('')
                          }}
                          disabled={saving}
                        >
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <Button
                        size='icon-sm'
                        variant='ghost'
                        className='rounded-xl'
                        onClick={() => {
                          setEditingId(row.id)
                          setEditingValue(row.questionEs)
                        }}
                        disabled={saving}
                        aria-label='Editar'
                      >
                        <PencilIcon className='size-4' strokeWidth={2.6} />
                      </Button>
                    )}
                    <Button
                      size='icon-sm'
                      variant='ghost'
                      className='rounded-xl text-[var(--ica-bad-ink)]'
                      onClick={() => void handleDelete(row)}
                      disabled={saving || !row.canDelete}
                      aria-label='Eliminar'
                      title={row.canDelete ? 'Eliminar pregunta' : 'No se puede eliminar porque ya se usó'}
                    >
                      <Trash2Icon className='size-4' strokeWidth={2.6} />
                    </Button>
                  </div>
                </div>
              )
            })}
          </RowGroup>
        )}
      </div>
    </section>
  )
}

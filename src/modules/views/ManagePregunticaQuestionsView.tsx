import { useEffect, useMemo, useState } from 'react'
import { RefreshCwIcon, SaveIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  bulkImportPregunticaQuestions,
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

  return (
    <section className='mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-5 py-8'>
      <div className='mb-6'>
        <h2 className='mb-1 font-serif text-3xl font-bold'>Preguntas PreguntICA</h2>
        <p className='text-sm text-muted-foreground'>
          Banco en español. La traducción al idioma objetivo se almacena en caché automáticamente.
        </p>
      </div>

      <Card>
        <CardHeader className='gap-3'>
          <CardTitle>Carga masiva por líneas</CardTitle>
          <p className='text-sm text-muted-foreground'>
            Pega preguntas en español, una por línea. Cada salto de línea crea una entrada.
          </p>
        </CardHeader>
        <CardContent className='space-y-3'>
          <Textarea
            value={bulkText}
            onChange={(event) => setBulkText(event.target.value)}
            rows={10}
            placeholder={'Pregunta 1\nPregunta 2\nPregunta 3'}
          />
          <div className='flex flex-wrap items-center gap-2'>
            <Button type='button' onClick={handleBulkImport} disabled={saving}>
              <SaveIcon className='h-4 w-4' />
              Guardar preguntas
            </Button>
            <Button type='button' variant='ghost' onClick={() => void load()} disabled={loading}>
              <RefreshCwIcon className='h-4 w-4' />
              Recargar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className='mt-5'>
        <CardHeader className='gap-3'>
          <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
            <CardTitle>
              Banco ({stats.total}) · Activas {stats.active} · Inactivas {stats.inactive}
            </CardTitle>
            <Input
              className='max-w-sm'
              placeholder='Buscar pregunta...'
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className='space-y-3'>
          {feedback && (
            <p className='rounded-md border border-border bg-muted/40 px-3 py-2 text-sm'>
              {feedback}
            </p>
          )}

          {loading ? (
            <p className='text-sm text-muted-foreground'>Cargando preguntas...</p>
          ) : rows.length === 0 ? (
            <p className='text-sm text-muted-foreground'>No hay preguntas cargadas.</p>
          ) : (
            <div className='space-y-2'>
              {rows.map((row) => {
                const editing = editingId === row.id
                return (
                  <article key={row.id} className='rounded-lg border border-border p-3'>
                    <div className='flex flex-col gap-2 md:flex-row md:items-center md:justify-between'>
                      {editing ? (
                        <Input
                          value={editingValue}
                          onChange={(event) => setEditingValue(event.target.value)}
                          className='md:max-w-3xl'
                        />
                      ) : (
                        <p className='text-sm font-medium'>{row.questionEs}</p>
                      )}

                      <div className='flex flex-wrap items-center gap-2'>
                        <span className='text-xs text-muted-foreground'>
                          Traducciones: {Object.keys(row.translations || {}).length}
                        </span>

                        <button
                          type='button'
                          onClick={() => void handleToggle(row, !row.isActive)}
                          disabled={saving}
                          className={`rounded-md px-2 py-1 text-xs font-semibold ${
                            row.isActive
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {row.isActive ? 'Activa' : 'Inactiva'}
                        </button>

                        {editing ? (
                          <>
                            <Button size='sm' onClick={handleSaveEdit} disabled={saving}>
                              Guardar
                            </Button>
                            <Button
                              size='sm'
                              variant='outline'
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
                            size='sm'
                            variant='outline'
                            onClick={() => {
                              setEditingId(row.id)
                              setEditingValue(row.questionEs)
                            }}
                            disabled={saving}
                          >
                            Editar
                          </Button>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

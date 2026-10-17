import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CheckIcon, FileTextIcon, LoaderCircleIcon, SparklesIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  fetchCoachingClassAiMaterial,
  generateCoachingClassTasks,
  generateCoachingPeriodReport,
  publishCoachingPeriodReport,
  reviseCoachingPeriodReport,
  saveCoachingClassTranscript,
  saveCoachingPeriodReportDraft,
  type CoachingPeriodReportResult,
  type CoachingProposedClassTask,
  type CoachingV2Focus,
  type CoachingV2PeriodReport,
  type CoachingWeeklyReportData,
  type CoachingWeeklyReportDraft,
} from '../../services/coaching'
import { CoachingWeeklyReportView, type FocusBaseline } from './CoachingWeeklyReport'
import { t } from '@/i18n'

/* ══════════════════════════════════════════════════════════════════════
   Coach: transcripciones de Loom, tareas propuestas por la IA y reporte
   semanal escrito por la IA (Luis, 15 Oct). Las tareas llegan al alumno
   cuando el coach guarda la clase. El reporte se escribe y se publica solo
   en cuanto las dos clases tienen su Loom y su transcripción, y el coach
   puede editarlo, pedir cambios a la IA o retirarlo (16 Oct).
   ══════════════════════════════════════════════════════════════════════ */

const MIN_TRANSCRIPT_CHARS = 200

export function useClassAiMaterial(sessionId: string, periodNumber: number, enabled: boolean) {
  const [transcripts, setTranscripts] = useState<Record<1 | 2, string>>({ 1: '', 2: '' })
  const [draft, setDraft] = useState<CoachingWeeklyReportDraft | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!enabled || !sessionId) return
    let cancelled = false
    setLoaded(false)
    setTranscripts({ 1: '', 2: '' })
    setDraft(null)
    fetchCoachingClassAiMaterial({ sessionId, periodNumber })
      .then((material) => {
        if (cancelled) return
        const next: Record<1 | 2, string> = { 1: '', 2: '' }
        for (const row of material.transcripts) next[row.classIndex === 2 ? 2 : 1] = row.transcript
        setTranscripts(next)
        setDraft(material.reportDraft)
      })
      .catch((error) => {
        // An older coaching-center without these actions: the panels say so when used.
        console.warn('class AI material not loaded', error)
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [enabled, sessionId, periodNumber])

  const setTranscript = useCallback((classIndex: 1 | 2, text: string) => {
    setTranscripts((prev) => ({ ...prev, [classIndex]: text }))
  }, [])

  return { transcripts, setTranscript, draft, setDraft, loaded }
}

/** The AI can take a minute: a result for a week that is no longer on screen is dropped. */
function useCurrentPeriod(periodNumber: number) {
  const ref = useRef(periodNumber)
  ref.current = periodNumber
  // Unmounted (the week changed and the panel was replaced): no week matches any more.
  useEffect(() => {
    ref.current = periodNumber
    return () => {
      ref.current = Number.NaN
    }
  }, [periodNumber])
  return ref
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/** The pasted transcript, short: its first lines, «…» and its last lines. */
function TranscriptPreview({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  const cut = lines.length > 8
  const head = cut ? lines.slice(0, 5) : lines
  const tail = cut ? lines.slice(-2) : []
  return (
    <div className='rounded-lg border px-3 py-2 text-xs leading-relaxed' style={{ borderColor: 'var(--v3-line)', background: 'var(--v3-card)' }}>
      {head.map((line, index) => (
        <p key={`h-${index}`} className='m-0 truncate'>
          {line}
        </p>
      ))}
      {cut ? (
        <p className='m-0 py-0.5 font-black' style={{ color: 'var(--v3-muted)' }}>
          {t('… {n} líneas más …', { n: lines.length - 7 })}
        </p>
      ) : null}
      {tail.map((line, index) => (
        <p key={`t-${index}`} className='m-0 truncate'>
          {line}
        </p>
      ))}
    </div>
  )
}

/** Inside each class (coach): paste the Loom transcript and ask the AI for the 3 tasks. */
export function ClassTranscriptPanel({
  sessionId,
  periodNumber,
  classIndex,
  savedTranscript,
  onSaved,
  onTasks,
  disabled,
}: {
  sessionId: string
  periodNumber: number
  classIndex: 1 | 2
  savedTranscript: string
  onSaved: (text: string) => void
  onTasks: (tasks: CoachingProposedClassTask[]) => void
  disabled: boolean
}) {
  const [text, setText] = useState(savedTranscript)
  const [busy, setBusy] = useState<'save' | 'tasks' | null>(null)
  const [proposed, setProposed] = useState<CoachingProposedClassTask[] | null>(null)
  const [open, setOpen] = useState(false)
  // Luis, 16 Oct: once pasted, the transcript shows only its start and end, not the whole page.
  const [editing, setEditing] = useState(false)
  const currentPeriod = useCurrentPeriod(periodNumber)

  useEffect(() => {
    setText(savedTranscript)
  }, [savedTranscript])

  // Another week: the proposal shown belonged to the previous one.
  useEffect(() => {
    setProposed(null)
  }, [periodNumber])

  const trimmed = text.trim()
  const changed = trimmed !== savedTranscript.trim()
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_TRANSCRIPT_CHARS

  async function save() {
    const startPeriod = periodNumber
    setBusy('save')
    try {
      await saveCoachingClassTranscript({ sessionId, periodNumber, classIndex, transcript: trimmed })
      if (currentPeriod.current !== startPeriod) return
      onSaved(trimmed)
      setEditing(false)
      toast.success(trimmed ? t('Transcripción guardada.') : t('Transcripción borrada.'))
    } catch (error) {
      toast.error(errorMessage(error, t('No se pudo guardar la transcripción.')))
    } finally {
      setBusy(null)
    }
  }

  async function prepareTasks() {
    const startPeriod = periodNumber
    setBusy('tasks')
    try {
      const tasks = await generateCoachingClassTasks({
        sessionId,
        periodNumber,
        classIndex,
      })
      if (currentPeriod.current !== startPeriod) {
        toast.message(t('Las tareas de la semana {n} están listas: vuelve a esa semana y pulsa otra vez.', { n: startPeriod }))
        return
      }
      setProposed(tasks)
      onTasks(tasks)
      toast.success(t('Tareas listas. Revísalas y pulsa «Guardar clase {n}» para publicarlas.', { n: classIndex }))
    } catch (error) {
      toast.error(errorMessage(error, t('No se pudieron preparar las tareas.')))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className='rounded-xl border p-3' style={{ borderColor: 'var(--v3-line)', background: 'color-mix(in oklab, var(--v3-card) 94%, var(--v3-cyan) 6%)' }}>
      <button type='button' className='flex w-full items-center justify-between gap-2 text-left' onClick={() => setOpen((value) => !value)}>
        <span className='flex items-center gap-2 text-sm font-bold'>
          <FileTextIcon className='size-4' />
          {t('Transcripción de Loom')}
          <span className='text-xs font-semibold' style={{ color: 'var(--v3-muted)' }}>
            {t('(solo la ves tú)')}
          </span>
        </span>
        <span className='flex items-center gap-1 text-xs font-bold' style={{ color: savedTranscript ? 'var(--v3-cyan)' : 'var(--v3-muted)' }}>
          {savedTranscript ? <CheckIcon className='size-3.5' /> : null}
          {savedTranscript ? t('Guardada') : t('Sin pegar')}
        </span>
      </button>

      {open ? (
        <div className='mt-3 space-y-2'>
          {editing || !trimmed ? (
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData('text')
                if (!pasted.trim()) return
                event.preventDefault()
                setText(pasted)
                setEditing(false)
              }}
              rows={6}
              className='max-h-48 overflow-y-auto'
              placeholder={t('Pega aquí la transcripción que Loom pone al lado del vídeo.')}
              disabled={disabled || busy !== null}
              autoFocus={editing}
            />
          ) : (
            <TranscriptPreview text={trimmed} />
          )}
          {tooShort ? (
            <p className='text-xs font-semibold' style={{ color: 'var(--ica-bad-ink)' }}>
              {t('Parece muy corta: pega la transcripción completa de la clase.')}
            </p>
          ) : null}
          <div className='flex flex-wrap gap-2'>
            {changed && trimmed ? (
              <Button type='button' size='sm' onClick={() => void save()} disabled={disabled || busy !== null || tooShort}>
                {busy === 'save' ? t('Guardando...') : t('Guardar transcripción')}
              </Button>
            ) : null}
            {trimmed && !editing ? (
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => {
                  setText('')
                  setEditing(true)
                }}
                disabled={disabled || busy !== null}
              >
                {t('Pegar otra')}
              </Button>
            ) : null}
            {editing && savedTranscript ? (
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => {
                  setText(savedTranscript)
                  setEditing(false)
                }}
                disabled={busy !== null}
              >
                {t('Cancelar')}
              </Button>
            ) : null}
            {/* Luis, 16 Oct: the AI tasks open once the transcript is saved. */}
            <Button
              type='button'
              size='sm'
              variant={savedTranscript && !changed ? 'default' : 'outline'}
              onClick={() => void prepareTasks()}
              disabled={disabled || busy !== null || !savedTranscript || changed}
            >
              {busy === 'tasks' ? <LoaderCircleIcon className='size-4 animate-spin' /> : <SparklesIcon className='size-4' />}
              {busy === 'tasks' ? t('Leyendo la clase...') : t('Preparar las 3 tareas con IA')}
            </Button>
          </div>
          {!savedTranscript || changed ? (
            <p className='text-xs font-semibold' style={{ color: 'var(--v3-muted)' }}>
              {t('Guarda la transcripción para poder preparar las tareas con IA.')}
            </p>
          ) : null}
          {busy === 'tasks' ? (
            <p className='text-xs font-semibold' style={{ color: 'var(--v3-muted)' }}>
              {t('Puede tardar hasta un minuto.')}
            </p>
          ) : null}
          {proposed ? (
            <div className='space-y-1.5 rounded-lg border p-2.5 text-xs' style={{ borderColor: 'var(--v3-line)' }}>
              <p className='font-bold'>{t('Las tareas ya están abajo. Revísalas y pulsa «Guardar clase {n}».', { n: classIndex })}</p>
              {proposed.map((task, index) =>
                task.why ? (
                  <p key={`why-${index}`} style={{ color: 'var(--v3-muted)' }}>
                    <b>{t('Tarea {n}', { n: index + 1 + (classIndex === 2 ? 3 : 0) })}:</b> {task.why}
                  </p>
                ) : null,
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Report card (coach). Luis, 16 Oct: as soon as both classes have their Loom and transcript the AI
 * writes the report and it is published on its own (the student opens it with her 6 tasks). The
 * coach can edit or remove anything, ask the AI for a change, or withdraw it.
 */
export function ReportAiPanel({
  sessionId,
  periodNumber,
  transcripts,
  looms,
  materialLoaded,
  draft,
  onDraft,
  publishedData,
  onPublished,
  targetLang,
  focuses,
  baseline,
  disabled,
}: {
  sessionId: string
  periodNumber: number
  transcripts: Record<1 | 2, string>
  /** Saved Loom link of each class (not the unsaved input). */
  looms: Record<1 | 2, boolean>
  /** The transcripts and the report of this week have been read from the server. */
  materialLoaded: boolean
  draft: CoachingWeeklyReportDraft | null
  onDraft: (draft: CoachingWeeklyReportDraft | null) => void
  publishedData: CoachingWeeklyReportData | null
  onPublished: (report: CoachingV2PeriodReport | null) => void
  targetLang: string
  focuses: CoachingV2Focus[]
  baseline: FocusBaseline
  disabled: boolean
}) {
  const [busy, setBusy] = useState<'generate' | 'revise' | 'save' | 'publish' | 'unpublish' | null>(null)
  const [request, setRequest] = useState('')
  const currentPeriod = useCurrentPeriod(periodNumber)
  const autoStarted = useRef(false)
  const ready = Boolean(transcripts[1].trim() && transcripts[2].trim() && looms[1] && looms[2])
  const isPublished = Boolean(publishedData)

  /** Applies what the server returns, if the coach is still on that week. */
  function apply(startPeriod: number, result: CoachingPeriodReportResult, publishedNow: boolean) {
    if (currentPeriod.current !== startPeriod) return false
    onDraft(result.draft)
    if (publishedNow) onPublished(result.periodReport)
    return true
  }

  async function generate() {
    const startPeriod = periodNumber
    setBusy('generate')
    try {
      const result = await generateCoachingPeriodReport({ sessionId, periodNumber })
      // Saved and published on the server for its own week: it shows when the coach goes back there.
      if (apply(startPeriod, result, true)) {
        toast.success(t('Reporte publicado. El alumno lo verá al terminar sus 6 tareas. Puedes cambiar lo que quieras.'))
      }
    } catch (error) {
      toast.error(errorMessage(error, t('No se pudo preparar el reporte.')))
    } finally {
      setBusy(null)
    }
  }

  // As soon as the second class has its Loom and its transcript, the report starts on its own.
  // Once per week on screen; if it fails, the button tries again.
  useEffect(() => {
    if (!ready || !materialLoaded || disabled || busy !== null) return
    if (draft || publishedData || autoStarted.current) return
    autoStarted.current = true
    void generate()
  }, [ready, materialLoaded, disabled, busy, draft, publishedData])

  async function revise() {
    const text = request.trim()
    if (!text) return
    const startPeriod = periodNumber
    setBusy('revise')
    try {
      const result = await reviseCoachingPeriodReport({ sessionId, periodNumber, request: text })
      if (apply(startPeriod, result, true)) {
        setRequest('')
        toast.success(t('Hecho. El reporte ya está cambiado.'))
      }
    } catch (error) {
      toast.error(errorMessage(error, t('La IA no pudo cambiar el reporte.')))
    } finally {
      setBusy(null)
    }
  }

  async function saveEdit(data: CoachingWeeklyReportData) {
    const startPeriod = periodNumber
    setBusy('save')
    try {
      const result = await saveCoachingPeriodReportDraft({ sessionId, periodNumber, reportData: data })
      // Withdrawn reports stay withdrawn: the edit is kept for when it is published again.
      apply(startPeriod, result, isPublished)
    } catch (error) {
      toast.error(errorMessage(error, t('No se pudo guardar el reporte.')))
    } finally {
      setBusy(null)
    }
  }

  async function publish(unpublish: boolean) {
    const startPeriod = periodNumber
    setBusy(unpublish ? 'unpublish' : 'publish')
    try {
      const report = await publishCoachingPeriodReport({ sessionId, periodNumber, ...(unpublish ? { unpublish: true } : {}) })
      if (currentPeriod.current !== startPeriod) return
      onPublished(report)
      toast.success(unpublish ? t('Reporte retirado. El alumno ya no lo ve.') : t('Reporte publicado. El alumno lo verá al terminar sus 6 tareas.'))
    } catch (error) {
      toast.error(errorMessage(error, t('No se pudo publicar el reporte.')))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className='space-y-3 rounded-xl border p-3' style={{ borderColor: 'var(--v3-line)' }}>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='flex items-center gap-2 text-sm font-bold'>
          <SparklesIcon className='size-4' />
          {t('Reporte con IA')}
        </p>
        <span className='flex gap-3 text-xs font-bold' style={{ color: 'var(--v3-muted)' }}>
          {([1, 2] as const).map((classIndex) => {
            const complete = Boolean(transcripts[classIndex].trim() && looms[classIndex])
            const missing = [!looms[classIndex] ? t('falta Loom') : null, !transcripts[classIndex].trim() ? t('falta transcripción') : null]
              .filter(Boolean)
              .join(' · ')
            return (
              <span key={classIndex} className='flex items-center gap-1' style={{ color: complete ? 'var(--v3-cyan)' : undefined }}>
                {complete ? <CheckIcon className='size-3.5' /> : null}
                {t('Clase {n}', { n: classIndex })}
                {missing ? <span className='font-semibold'>({missing})</span> : null}
              </span>
            )
          })}
        </span>
      </div>

      {!ready && !draft ? (
        <p className='text-xs font-semibold' style={{ color: 'var(--v3-muted)' }}>
          {t('Se escribe y se publica solo en cuanto las dos clases tengan su Loom guardado y su transcripción.')}
        </p>
      ) : busy === 'generate' ? (
        <p className='flex items-center gap-2 text-sm font-bold'>
          <LoaderCircleIcon className='size-4 animate-spin' style={{ color: 'var(--v3-cyan)' }} />
          {t('La IA está leyendo las dos clases. Puede tardar hasta un minuto.')}
        </p>
      ) : !draft ? (
        <Button type='button' size='sm' onClick={() => void generate()} disabled={disabled || busy !== null}>
          <SparklesIcon className='size-4' />
          {t('Preparar el reporte con IA')}
        </Button>
      ) : null}

      {draft ? (
        <div className='space-y-3 rounded-xl border p-3' style={{ borderColor: 'var(--v3-line)', background: 'var(--v3-card)' }}>
          <p className='flex items-center gap-1.5 text-xs font-bold' style={{ color: isPublished ? 'var(--v3-cyan)' : 'var(--v3-muted)' }}>
            {isPublished ? <CheckIcon className='size-3.5' /> : null}
            {isPublished
              ? t('Publicado. Así lo ve el alumno: lo que cambies se ve al momento.')
              : t('Retirado: el alumno no lo ve. Lo que cambies se guarda para cuando lo publiques.')}
          </p>

          {/* Ask the AI for a change */}
          <div className='space-y-2 rounded-xl border p-2.5' style={{ borderColor: 'color-mix(in oklab, var(--v3-cyan) 45%, var(--v3-line))' }}>
            <p className='flex items-center gap-1.5 text-xs font-black'>
              <SparklesIcon className='size-3.5' style={{ color: 'var(--v3-cyan)' }} />
              {t('Pídele un cambio a la IA')}
            </p>
            <Textarea
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              rows={2}
              maxLength={600}
              placeholder={t('Ej.: quita la corrección del pasado y añade una sobre la pronunciación de «th».')}
              disabled={disabled || busy !== null}
            />
            <Button type='button' size='sm' onClick={() => void revise()} disabled={disabled || busy !== null || !request.trim()}>
              {busy === 'revise' ? <LoaderCircleIcon className='size-4 animate-spin' /> : <SparklesIcon className='size-4' />}
              {busy === 'revise' ? t('Cambiando el reporte...') : t('Cambiar con IA')}
            </Button>
          </div>

          <CoachingWeeklyReportView
            data={draft.data}
            targetLang={targetLang}
            focuses={focuses}
            baseline={baseline}
            periodNumber={periodNumber}
            canAddWords={false}
            editable={disabled || busy !== null ? undefined : { onChange: (next) => void saveEdit(next) }}
          />
          <div className='flex flex-wrap gap-2'>
            {isPublished ? (
              <Button type='button' variant='outline' onClick={() => void publish(true)} disabled={disabled || busy !== null}>
                {busy === 'unpublish' ? t('Retirando...') : t('Retirar reporte')}
              </Button>
            ) : (
              <Button type='button' onClick={() => void publish(false)} disabled={disabled || busy !== null}>
                {busy === 'publish' ? t('Publicando...') : t('Publicar reporte')}
              </Button>
            )}
            <Button type='button' variant='ghost' onClick={() => void generate()} disabled={disabled || busy !== null || !ready}>
              {t('Escribirlo de nuevo desde cero')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

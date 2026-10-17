import { describe, expect, it } from 'vitest'
import {
  TRANSCRIPT_MAX_CHARS,
  buildClassTasksPrompt,
  buildWeeklyReportPrompt,
  normalizeTranscript,
  parseClassTasks,
  parseWeeklyReport,
  transcriptForPrompt,
  type ClassAiContext,
} from '../../../../../supabase/functions/coaching-center/class-ai'

const context: ClassAiContext = {
  targetLang: 'Inglés',
  nativeLang: 'Español',
  level: 'B1',
  studentName: 'Ana',
  teacherName: 'Luis',
  classIndex: 1,
  periodNumber: 3,
  focuses: [{ title: 'Conectores', comment: null, phase: 'Explicado' }],
  previousTasks: ['Escribe 3 palabras nuevas de la clase'],
}

const longText = 'Luis: so tell me about your weekend. Ana: I am agree with you. '.repeat(10)

describe('class transcript', () => {
  it('rejects transcripts that are too short and normalizes line breaks', () => {
    expect(normalizeTranscript('hola')).toBeNull()
    expect(normalizeTranscript(42)).toBeNull()
    const text = normalizeTranscript(`${longText}\r\n\r\n\r\n\r\nend`)
    expect(text).not.toContain('\r')
    expect(text).not.toContain('\n\n\n')
  })

  it('caps very long transcripts', () => {
    const huge = 'a'.repeat(TRANSCRIPT_MAX_CHARS + 500)
    expect(normalizeTranscript(huge)?.length).toBe(TRANSCRIPT_MAX_CHARS)
  })

  it('keeps start and end of a long transcript for the prompt', () => {
    const text = `INICIO${'x'.repeat(5000)}FINAL`
    const cut = transcriptForPrompt(text, 1000)
    expect(cut.startsWith('INICIO')).toBe(true)
    expect(cut.endsWith('FINAL')).toBe(true)
    expect(cut).toContain('omitida')
    expect(transcriptForPrompt('corto', 1000)).toBe('corto')
  })
})

describe('class tasks', () => {
  it('builds a prompt with the context, the previous tasks and the transcript', () => {
    const { system, prompt } = buildClassTasksPrompt(context, longText)
    expect(system).toContain('Entre 1 y 2 tareas')
    expect(prompt).toContain('Inglés')
    expect(prompt).toContain('Conectores')
    expect(prompt).toContain('Escribe 3 palabras nuevas de la clase')
    expect(prompt).toContain('I am agree with you')
  })

  it('accepts exactly 3 tasks and forces 1 or 2 audios', () => {
    const none = parseClassTasks({
      tasks: [
        { text: 'Escribe los 3 conectores que vimos', audio: false, why: 'min 18' },
        { text: 'En el minuto 34 te corregí una frase: ¿cuál?', audio: false, why: 'min 34' },
        { text: 'Cuéntame tu día usando however', audio: false, why: 'conectores' },
      ],
    })
    expect(none?.filter((task) => task.audio)).toHaveLength(1)
    expect(none?.[2].audio).toBe(true)

    const all = parseClassTasks({
      tasks: [
        { text: 'Cuéntame tu fin de semana', audio: true, why: '' },
        { text: 'Repite la frase del minuto 10', audio: true, why: '' },
        { text: 'Explícame el conector although', audio: true, why: '' },
      ],
    })
    expect(all?.filter((task) => task.audio)).toHaveLength(2)
    expect(all?.[0].audio).toBe(false)
  })

  it('rejects answers without 3 usable tasks', () => {
    expect(parseClassTasks(null)).toBeNull()
    expect(parseClassTasks({ tasks: [{ text: 'Escribe algo largo', audio: true }] })).toBeNull()
    expect(
      parseClassTasks({ tasks: [{ text: 'ok' }, { text: 'Escribe algo largo' }, { text: 'Otra tarea larga' }] }),
    ).toBeNull()
  })
})

describe('weekly report', () => {
  const raw = {
    headline: 'Una semana con mucha conversación',
    wins: ['Hablaste 10 minutos sin parar', '', 'Usaste el pasado bien'],
    corrections: [
      { said: 'I am agree', better: 'I agree', note: 'agree ya es verbo' },
      { said: 'same', better: 'same', note: 'no es un error' },
      { said: '', better: 'She doesn\'t like it', note: '' },
    ],
    suggestions: [{ title: 'Usa conectores', detail: 'Empieza por however' }, { title: '', detail: 'sin título' }],
    words: [
      { target: 'however', native: 'sin embargo' },
      { target: 'However', native: 'sin embargo' },
      { target: 'although', native: '' },
    ],
    focusNote: 'Vas bien con los conectores',
    // Old drafts may still carry it: the weekly challenge is gone (Luis, 16 Oct).
    challenge: 'Abre la próxima clase con dos conectores',
  }

  it('cleans the report and drops empty or repeated items', () => {
    const report = parseWeeklyReport(raw)
    expect(report).not.toBeNull()
    expect(report?.version).toBe(1)
    expect(report?.wins).toEqual(['Hablaste 10 minutos sin parar', 'Usaste el pasado bien'])
    expect(report?.corrections).toEqual([{ said: 'I am agree', better: 'I agree', note: 'agree ya es verbo' }])
    expect(report?.suggestions).toHaveLength(1)
    expect(report?.words).toEqual([{ target: 'however', native: 'sin embargo' }])
    expect(report).not.toHaveProperty('challenge')
  })

  it('needs a headline and something to show', () => {
    expect(parseWeeklyReport({ ...raw, headline: '' })).toBeNull()
    expect(parseWeeklyReport({ headline: 'Hola', corrections: [], suggestions: [], words: [] })).toBeNull()
    expect(parseWeeklyReport('texto')).toBeNull()
  })

  const context = { targetLang: 'Inglés', nativeLang: 'Español', level: 'B1', studentName: 'Ana', periodNumber: 3, focuses: [] }
  const classes = [
    { classIndex: 1 as const, teacherName: 'Luis', transcript: 'CLASE UNO' },
    { classIndex: 2 as const, teacherName: 'Marta', transcript: 'CLASE DOS' },
  ]

  it('builds the report prompt with both classes', () => {
    const { prompt } = buildWeeklyReportPrompt(context, classes)
    expect(prompt).toContain('CLASE UNO')
    expect(prompt).toContain('CLASE DOS')
    expect(prompt).toContain('con Marta')
    expect(prompt).not.toContain('El coach pide este cambio')
  })

  it('a change asked by the coach goes with the current report', () => {
    const current = parseWeeklyReport(raw)
    if (!current) throw new Error('no report')
    const { prompt } = buildWeeklyReportPrompt(context, classes, { current, request: 'Quita la corrección de agree' })
    expect(prompt).toContain('«Quita la corrección de agree»')
    expect(prompt).toContain('"better": "I agree"')
    expect(prompt).toContain('completo, ya cambiado')
  })
})

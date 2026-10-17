// COACHING: TASKS AND WEEKLY REPORT FROM THE CLASS TRANSCRIPT (Luis, 15 Oct)
//
// The coach pastes the Loom transcript of each class (only coaches see it).
//  - From one class, the AI proposes its 3 tasks. The coach reviews them and saves the class as
//    always, so nothing reaches the student before the coach publishes it.
//  - With the two classes of the week, the AI writes the weekly report as structured data
//    (corrections that can be listened to, suggestions, new words for the Baúl ICA, focos). It is
//    prepared and published on its own once the two classes have their Loom and transcript
//    (Luis, 16 Oct: no weekly challenge). The coach can edit it or ask the AI for a change.
//
// Pure code (no Deno APIs): prompts, tool schemas and the parsers that clean what the AI returns.
// The call itself is made in index.ts with createAnthropicToolCaller (_shared/coaching-focus-exercise.ts).

export const TRANSCRIPT_MIN_CHARS = 200
export const TRANSCRIPT_MAX_CHARS = 200_000
/** What is sent to the AI from each transcript. Longer ones keep the start and the end. */
export const TRANSCRIPT_PROMPT_CHARS = 120_000

export const TASK_TEXT_MAX = 320

type Json = Record<string, unknown>

function isRecord(value: unknown): value is Json {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

/** Normalizes line breaks and trims; null when it is too short to be a class. */
export function normalizeTranscript(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (text.length < TRANSCRIPT_MIN_CHARS) return null
  return text.slice(0, TRANSCRIPT_MAX_CHARS)
}

/** Keeps the start and the end of a very long transcript, saying that a part was left out. */
export function transcriptForPrompt(transcript: string, maxChars = TRANSCRIPT_PROMPT_CHARS): string {
  if (transcript.length <= maxChars) return transcript
  const half = Math.floor((maxChars - 60) / 2)
  return `${transcript.slice(0, half)}\n\n[… parte central omitida por longitud …]\n\n${transcript.slice(-half)}`
}

export type ClassAiContext = {
  targetLang: string
  nativeLang: string
  level: string
  studentName: string | null
  /** «Luis» or the native teacher, as it is shown to the student. */
  teacherName: string | null
  classIndex: 1 | 2
  periodNumber: number
  focuses: Array<{ title: string; comment: string | null; phase: string }>
  /** Tasks of the previous week, to avoid asking for the same thing two weeks in a row. */
  previousTasks: string[]
}

function contextBlock(context: ClassAiContext): string {
  const focusLines = context.focuses.length
    ? context.focuses
        .map((focus) => `- ${focus.title} (fase: ${focus.phase})${focus.comment ? ` · nota del coach: ${focus.comment}` : ''}`)
        .join('\n')
    : '- (sin focos abiertos)'
  return [
    `Idioma que aprende: ${context.targetLang}`,
    `Su idioma nativo (en el que se le escribe): ${context.nativeLang}`,
    `Nivel: ${context.level}`,
    `Alumno/a: ${context.studentName || 'sin nombre'}`,
    `Semana del coaching: ${context.periodNumber}`,
    `Focos gramaticales del coaching:\n${focusLines}`,
  ].join('\n')
}

/* ─────────────────────────── 3 tasks of one class ─────────────────────────── */

export const CLASS_TASKS_TOOL = {
  name: 'propose_class_tasks',
  description: 'Las 3 tareas que el alumno hará después de esta clase.',
  input_schema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        description: 'Exactamente 3 tareas, en el orden en que el alumno las verá.',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'La consigna que lee el alumno.' },
            audio: { type: 'boolean', description: 'true si el alumno responde grabando un audio.' },
            why: { type: 'string', description: 'Para el coach: de qué momento de la clase sale y qué entrena (1 frase).' },
          },
          required: ['text', 'audio', 'why'],
        },
      },
    },
    required: ['tasks'],
  },
}

export function buildClassTasksPrompt(context: ClassAiContext, transcript: string): { system: string; prompt: string } {
  const teacher = context.classIndex === 1 ? context.teacherName || 'Luis' : context.teacherName || 'la profesora nativa'
  const system = [
    'Eres el asistente de Luis en el Coaching ICA, un programa de idiomas 1:1 con clases semanales.',
    'Cada semana el alumno tiene dos clases grabadas en Loom. Después de cada clase ve la grabación y hace 3 tareas cortas en la app.',
    'Tu trabajo: leer muy bien la transcripción de la clase y proponer las 3 tareas de esa clase.',
    '',
    'Criterio (lo decides tú según lo que pasó en la clase):',
    '- Todo sale de algo concreto de esta clase: una corrección, una palabra o expresión nueva, una explicación, un tema del que se habló, una frase del alumno. Nada genérico que valdría para cualquier clase.',
    '- No hay un orden fijo ni un tipo obligatorio. Pueden ser de recordar, de volver a la grabación (las 3 si hace falta), de usar lo aprendido hablando, o mezclas (volver a la grabación y responder con un audio).',
    '- Si una tarea pide volver a la grabación, di a qué momento: el minuto si la transcripción tiene tiempos, o el momento («cuando hablamos de tu trabajo»). Nunca inventes un minuto que no salga en la transcripción.',
    '- Entre 1 y 2 tareas se responden con audio (nunca 0 ni 3). Audio cuando la tarea es hablar, pronunciar o contar algo; texto cuando es identificar, escribir o copiar.',
    '- Cada tarea se hace en unos 5 minutos como mucho. Una sola consigna clara por tarea, de una o dos frases.',
    '- La consigna va en el idioma nativo del alumno, tratándole de tú. Las palabras o frases del idioma que aprende van entre comillas, tal cual se dijeron en clase.',
    '- No repitas el tipo de tarea de la semana anterior si hay alternativa (te las paso abajo).',
    '- La transcripción es automática: puede tener errores y no dice quién habla. Deduce quién es el profesor y quién el alumno por el contexto. Si algo no se entiende, no lo uses.',
    '- No pidas transcribir trozos largos ni nada que necesite buscar fuera de la grabación.',
  ].join('\n')
  const previous = context.previousTasks.length
    ? context.previousTasks.map((task) => `- ${task}`).join('\n')
    : '- (no hay)'
  const prompt = [
    contextBlock(context),
    `Esta es la clase ${context.classIndex} de la semana, con ${teacher}.`,
    context.classIndex === 2
      ? 'La clase 2 suele ser más gramatical: si se trabajó una estructura, al menos una tarea la aplica a frases del propio alumno.'
      : 'La clase 1 suele ser de conversación y dinámicas.',
    `Tareas de la semana anterior (para no repetirse):\n${previous}`,
    '',
    'Transcripción de Loom:',
    '"""',
    transcriptForPrompt(transcript),
    '"""',
    '',
    `Devuelve las 3 tareas con la herramienta ${CLASS_TASKS_TOOL.name}.`,
  ].join('\n')
  return { system, prompt }
}

export type ProposedClassTask = { text: string; audio: boolean; why: string }

/** Exactly 3 tasks with text, and 1 or 2 of them with audio. Null when the answer is unusable. */
export function parseClassTasks(raw: unknown): ProposedClassTask[] | null {
  if (!isRecord(raw) || !Array.isArray(raw.tasks)) return null
  const tasks = raw.tasks
    .filter(isRecord)
    .map((task) => ({
      text: cleanText(task.text, TASK_TEXT_MAX),
      audio: task.audio === true,
      why: cleanText(task.why, 240),
    }))
    .filter((task) => task.text.length >= 8)
    .slice(0, 3)
  if (tasks.length < 3) return null

  const audioCount = tasks.filter((task) => task.audio).length
  if (audioCount === 0) tasks[2] = { ...tasks[2], audio: true }
  if (audioCount === 3) tasks[0] = { ...tasks[0], audio: false }
  return tasks
}

/* ─────────────────────────── weekly report ─────────────────────────── */

export type WeeklyReportCorrection = { said: string; better: string; note: string }
export type WeeklyReportSuggestion = { title: string; detail: string }
export type WeeklyReportWord = { target: string; native: string }

export type WeeklyReportData = {
  version: 1
  headline: string
  wins: string[]
  corrections: WeeklyReportCorrection[]
  suggestions: WeeklyReportSuggestion[]
  words: WeeklyReportWord[]
  focusNote: string
}

export const WEEKLY_REPORT_TOOL = {
  name: 'write_weekly_report',
  description: 'El reporte semanal del alumno, a partir de sus dos clases.',
  input_schema: {
    type: 'object',
    properties: {
      headline: { type: 'string', description: 'Una frase que resume su semana, en positivo y concreta.' },
      wins: { type: 'array', items: { type: 'string' }, description: '1 a 3 cosas que hizo bien esta semana, concretas.' },
      corrections: {
        type: 'array',
        description: '3 a 6 errores reales del alumno en clase, los más útiles de corregir.',
        items: {
          type: 'object',
          properties: {
            said: { type: 'string', description: 'Lo que dijo el alumno, en el idioma que aprende (literal o casi).' },
            better: { type: 'string', description: 'Cómo se dice bien, en el idioma que aprende. Frase completa y natural.' },
            note: { type: 'string', description: 'Por qué, en su idioma nativo, en una frase corta.' },
          },
          required: ['said', 'better', 'note'],
        },
      },
      suggestions: {
        type: 'array',
        description: '2 a 4 sugerencias y recomendaciones para la próxima semana.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'La sugerencia en pocas palabras.' },
            detail: { type: 'string', description: 'Cómo aplicarla, en una o dos frases.' },
          },
          required: ['title', 'detail'],
        },
      },
      words: {
        type: 'array',
        description: '4 a 8 palabras o expresiones nuevas de las clases que le conviene guardar.',
        items: {
          type: 'object',
          properties: {
            target: { type: 'string', description: 'En el idioma que aprende, como se guardaría en un diccionario (infinitivo, singular, sin artículo salvo que haga falta).' },
            native: { type: 'string', description: 'Traducción a su idioma nativo.' },
          },
          required: ['target', 'native'],
        },
      },
      focusNote: { type: 'string', description: 'Cómo va con sus focos esta semana y qué le falta, en una o dos frases. Vacío si no aplica.' },
    },
    required: ['headline', 'wins', 'corrections', 'suggestions', 'words', 'focusNote'],
  },
}

export function buildWeeklyReportPrompt(
  context: Omit<ClassAiContext, 'classIndex' | 'teacherName' | 'previousTasks'>,
  classes: Array<{ classIndex: 1 | 2; teacherName: string | null; transcript: string }>,
  /**
   * Luis, 16 Oct: the report is published on its own and the coach can ask the AI for a change
   * («quita la corrección del pasado»). Then the current report goes along and only that changes.
   */
  revision: { current: WeeklyReportData; request: string } | null = null,
): { system: string; prompt: string } {
  const system = [
    'Eres el asistente de Luis en el Coaching ICA, un programa de idiomas 1:1 con clases semanales.',
    'Escribes el reporte semanal del alumno a partir de las transcripciones de sus dos clases de la semana. El alumno lo desbloquea al terminar sus 6 tareas: tiene que merecer la pena abrirlo.',
    '',
    'Reglas:',
    '- Todo sale de las clases. Las correcciones son errores que el alumno dijo de verdad; nunca inventes frases suyas.',
    '- Escribe en el idioma nativo del alumno, tratándole de tú, cercano y directo, como lo escribiría Luis. Sin emojis.',
    '- Lo del idioma que aprende (correcciones, palabras) va bien escrito, aunque la transcripción automática lo tenga mal.',
    '- Correcciones: elige las más útiles (las que repite o las que más se notan), no todas. «better» es una frase completa y natural que se pueda escuchar y repetir.',
    '- Sugerencias: concretas y aplicables esta semana, sacadas de lo que se vio en clase (no consejos genéricos de estudio).',
    '- Palabras: las nuevas que salieron en clase y le conviene guardar, no las que ya domina.',
    '- La transcripción no dice quién habla. Deduce quién es el profesor y quién el alumno por el contexto. Si algo no se entiende, no lo uses.',
  ].join('\n')
  const parts = [contextBlock({ ...context, classIndex: 1, teacherName: null, previousTasks: [] })]
  for (const item of classes) {
    parts.push(
      '',
      `Clase ${item.classIndex}${item.teacherName ? ` (con ${item.teacherName})` : ''}:`,
      '"""',
      transcriptForPrompt(item.transcript, Math.floor(TRANSCRIPT_PROMPT_CHARS / Math.max(1, classes.length))),
      '"""',
    )
  }
  if (revision) {
    parts.push(
      '',
      'Este es el reporte que ya tiene publicado el alumno:',
      JSON.stringify(revision.current, null, 2),
      '',
      `El coach pide este cambio: «${revision.request}»`,
      'Haz solo lo que pide. Todo lo demás se queda exactamente igual (mismas frases, mismo orden). Si pide añadir algo, sácalo de las clases.',
    )
  }
  parts.push('', `Devuelve el reporte ${revision ? 'completo, ya cambiado, ' : ''}con la herramienta ${WEEKLY_REPORT_TOOL.name}.`)
  return { system, prompt: parts.join('\n') }
}

const REPORT_LIMITS = {
  headline: 220,
  win: 240,
  said: 220,
  better: 220,
  note: 240,
  title: 90,
  detail: 320,
  target: 80,
  native: 80,
  focusNote: 360,
}

/**
 * Cleans a weekly report (from the AI or edited by the coach). Null when it has nothing to show:
 * at least a headline and one correction, suggestion or word.
 */
export function parseWeeklyReport(raw: unknown): WeeklyReportData | null {
  if (!isRecord(raw)) return null
  const strings = (value: unknown, max: number, limit: number) =>
    Array.isArray(value)
      ? value.map((item) => cleanText(item, max)).filter(Boolean).slice(0, limit)
      : []
  const records = (value: unknown, limit: number) => (Array.isArray(value) ? value.filter(isRecord).slice(0, limit) : [])

  const corrections = records(raw.corrections, 8)
    .map((item) => ({
      said: cleanText(item.said, REPORT_LIMITS.said),
      better: cleanText(item.better, REPORT_LIMITS.better),
      note: cleanText(item.note, REPORT_LIMITS.note),
    }))
    .filter((item) => item.better && item.said && item.said !== item.better)
  const suggestions = records(raw.suggestions, 5)
    .map((item) => ({
      title: cleanText(item.title, REPORT_LIMITS.title),
      detail: cleanText(item.detail, REPORT_LIMITS.detail),
    }))
    .filter((item) => item.title)
  const seenWords = new Set<string>()
  const words = records(raw.words, 10)
    .map((item) => ({
      target: cleanText(item.target, REPORT_LIMITS.target),
      native: cleanText(item.native, REPORT_LIMITS.native),
    }))
    .filter((item) => {
      if (!item.target || !item.native) return false
      const key = item.target.toLowerCase()
      if (seenWords.has(key)) return false
      seenWords.add(key)
      return true
    })

  const report: WeeklyReportData = {
    version: 1,
    headline: cleanText(raw.headline, REPORT_LIMITS.headline),
    wins: strings(raw.wins, REPORT_LIMITS.win, 3),
    corrections,
    suggestions,
    words,
    focusNote: cleanText(raw.focusNote, REPORT_LIMITS.focusNote),
  }
  if (!report.headline) return null
  if (!report.corrections.length && !report.suggestions.length && !report.words.length) return null
  return report
}

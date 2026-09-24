/**
 * COACHING ICA — GENERADOR DEL EJERCICIO DE FOCO (fase Entrenado)
 *
 * El coach escribe un foco gramatical → este módulo pide a la IA un ejercicio
 * con la MISMA estructura que la plantilla oficial (coaching-exercise-template.ts),
 * lo comprueba con el MISMO corrector que usa el alumno y, si algo no cuadra,
 * se lo devuelve a la IA con la lista de fallos para que lo arregle (1 reintento).
 *
 * Lo usan:
 * - la Edge Function anthropic-proxy (Deno, en Supabase),
 * - el script de prueba local scripts/test-coaching-exercise.mjs (Node).
 * Solo importa archivos de _shared (con extensión .ts, como pide Deno).
 */
import { findForm, passThreshold, patternOf, type CorrectorLibre } from './coaching-exercise-corrector.ts'
import { COACHING_EXERCISE_TEMPLATE_EXAMPLE } from './coaching-exercise-template.ts'

type Json = Record<string, unknown>

export type FocusExerciseInput = {
  targetLang: string
  nativeLang: string
  focusTitle: string
  focusComment?: string
  level: string
  studentContext?: string
  studentName?: string
  focusSlot: string
  phase: string
}

export type ToolDefinition = {
  name: string
  description: string
  input_schema: Json
}

/** Llama a la IA forzando una tool y devuelve su input (o null). */
export type ToolCaller = (input: {
  system: string
  prompt: string
  tool: ToolDefinition
  maxTokens: number
  temperature: number
}) => Promise<Json | null>

export type FocusExerciseResult = {
  exercise: Json | null
  errorReason: string | null
  invalidJsonSnippet: string | null
  /** Avisos no graves (unidades descartadas, reintentos…) para el log. */
  warnings: string[]
}

const isRecord = (value: unknown): value is Json =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value.trim() || fallback : fallback

const strList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : []

const strMap = (value: unknown): Record<string, string> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value)
          .filter(([key, item]) => key.trim() && typeof item === 'string' && item.trim())
          .map(([key, item]) => [key.trim(), String(item).trim()]),
      )
    : {}

const snippet = (value: unknown): string | null => {
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    return text ? text.replace(/\s+/g, ' ').slice(0, 800) : null
  } catch {
    return null
  }
}

/* ─────────────────────────── llamada por defecto a Anthropic ─────────────────────────── */

export function createAnthropicToolCaller(input: {
  apiKey: string
  model: string
  baseUrl?: string
  timeoutMs?: number
  extraHeaders?: Record<string, string>
  /** Solo para pruebas locales detrás de un proxy. */
  fetchImpl?: typeof fetch
}): ToolCaller {
  const baseUrl = input.baseUrl || 'https://api.anthropic.com'
  const doFetch = input.fetchImpl || fetch
  return async ({ system, prompt, tool, maxTokens, temperature }) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 110_000)
    try {
      const response = await doFetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': input.apiKey,
          'anthropic-version': '2023-06-01',
          ...(input.extraHeaders || {}),
        },
        body: JSON.stringify({
          model: input.model,
          max_tokens: maxTokens,
          temperature,
          system,
          messages: [{ role: 'user', content: prompt }],
          tools: [tool],
          tool_choice: { type: 'tool', name: tool.name },
        }),
      })
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`Anthropic error ${response.status}: ${body.slice(0, 300)}`)
      }
      const data = (await response.json()) as {
        stop_reason?: string
        content?: Array<{ type: string; name?: string; input?: unknown }>
      }
      if (data.stop_reason === 'max_tokens') {
        throw new Error('La respuesta de la IA se cortó (max_tokens).')
      }
      const block = data.content?.find((item) => item.type === 'tool_use' && item.name === tool.name)
      return block && isRecord(block.input) ? block.input : null
    } finally {
      clearTimeout(timer)
    }
  }
}

/* ─────────────────────────── esquemas (tools) ─────────────────────────── */

const stringArray = { type: 'array', items: { type: 'string' } }

const PLAN_TOOL: ToolDefinition = {
  name: 'report_focus_plan',
  description: 'Cabecera y reglas del corrector del ejercicio de foco',
  input_schema: {
    type: 'object',
    properties: {
      foco_subtitulo: { type: 'string' },
      etiquetas: { type: 'object', additionalProperties: { type: 'string' } },
      equivalencias: { type: 'object', additionalProperties: { type: 'string' } },
      libre: {
        type: 'object',
        properties: {
          prohibidas: stringArray,
          no_verbo: stringArray,
          no_termina: stringArray,
          excepciones: stringArray,
        },
        required: ['prohibidas', 'no_verbo', 'no_termina', 'excepciones'],
      },
      escenario: {
        type: 'object',
        properties: {
          ambiente: { type: 'string' },
          personajes: stringArray,
        },
        required: ['ambiente', 'personajes'],
      },
    },
    required: ['foco_subtitulo', 'etiquetas', 'equivalencias', 'libre', 'escenario'],
  },
}

const RECONOCER_TOOL: ToolDefinition = {
  name: 'report_block_reconocer',
  description: 'Bloque 1 (Reconocer) del ejercicio de foco',
  input_schema: {
    type: 'object',
    properties: {
      instruccion: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            lead: { type: 'string' },
            tags: stringArray,
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  t: { type: 'string' },
                  ok: { type: 'boolean' },
                  why: { type: 'string' },
                },
                required: ['t', 'ok', 'why'],
              },
            },
          },
          required: ['lead', 'tags', 'options'],
        },
      },
    },
    required: ['instruccion', 'items'],
  },
}

const CONSTRUIR_TOOL: ToolDefinition = {
  name: 'report_block_construir',
  description: 'Bloque 2 (Construir) del ejercicio de foco',
  input_schema: {
    type: 'object',
    properties: {
      instruccion: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            situacion: { type: 'string' },
            ejemplo: { type: 'string' },
            verbos: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  nombre: { type: 'string' },
                  formas: stringArray,
                  mal: stringArray,
                  tags: stringArray,
                  nota: { type: 'string' },
                  trampas: stringArray,
                },
                required: ['nombre', 'formas', 'mal', 'tags', 'nota', 'trampas'],
              },
            },
          },
          required: ['situacion', 'ejemplo', 'verbos'],
        },
      },
    },
    required: ['instruccion', 'items'],
  },
}

const CONVERSACION_TOOL: ToolDefinition = {
  name: 'report_block_conversacion',
  description: 'Bloque 3 (En conversación) del ejercicio de foco',
  input_schema: {
    type: 'object',
    properties: {
      instruccion: { type: 'string' },
      lineas: {
        type: 'array',
        items: {
          type: 'object',
          properties: { quien: { type: 'string' }, texto: { type: 'string' } },
          required: ['quien', 'texto'],
        },
      },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            verbo: { type: 'string' },
            formas: stringArray,
            show: { type: 'string' },
            tags: stringArray,
            why: { type: 'string' },
            trampas: stringArray,
          },
          required: ['verbo', 'formas', 'show', 'tags', 'why', 'trampas'],
        },
      },
    },
    required: ['instruccion', 'lineas', 'items'],
  },
}

/* ─────────────────────────── prompts ─────────────────────────── */

const T = COACHING_EXERCISE_TEMPLATE_EXAMPLE
const templateBlock = (id: string): Json =>
  (T.bloques as unknown as Json[]).find((block) => block.id === id) || {}
const pretty = (value: unknown) => JSON.stringify(value, null, 1)

const PATTERN_RULES = [
  'CÓMO SE ESCRIBEN LAS FORMAS (el corrector las lee así, respétalo al pie de la letra):',
  '- Cada forma es un PATRÓN de palabras separadas por espacios, en minúsculas, sin tildes y sin signos.',
  '- Los apóstrofos se convierten en espacio: "can\'t" se escribe "can t", "I\'d" es "i d", "j\'ai" es "j ai".',
  '- palabra → tiene que aparecer tal cual.',
  '- a|b|c → vale cualquiera de esas palabras (would|d, like|love).',
  '- _ → UNA palabra cualquiera: el verbo que elige el alumno (nunca una palabra de "prohibidas" ni de "no_verbo", ni una que acabe en algo de "no_termina").',
  '- _ing, _ed, _er|ir|re → una palabra cualquiera que acabe así.',
  '- ~ → hueco de 0 a 2 palabras cualesquiera (el sujeto de una pregunta, un adverbio). Ponlo donde el alumno pueda meter algo en medio.',
  '- … → hueco de 0 a 6 palabras. Solo para piezas que van lejos una de otra (el prefijo de un verbo separable alemán al final, ne … pas con complementos).',
  '- Una forma debe tener al menos una palabra fija: nunca "_" sola ni "~ _".',
  '- "formas" = lo que está bien. "mal" = los errores típicos (mismo sistema de patrones) para decirle al alumno qué ha escrito.',
  '- Si el foco no deja elegir el verbo (p. ej. un tiempo de un verbo concreto), escribe el verbo concreto en lugar de _.',
].join('\n')

function contextPrompt(input: FocusExerciseInput): string {
  return [
    'Eres el generador de ejercicios del programa Coaching ICA (coaching lingüístico 1:1 de Luis, @luispolyglot).',
    'Generas UN ejercicio de un foco gramatical para un alumno concreto. El ejercicio tiene la estructura exacta de la plantilla oficial.',
    '',
    'ENCARGO',
    `- Idioma objetivo: ${input.targetLang}`,
    `- Foco gramatical: ${input.focusTitle}`,
    input.focusComment ? `- Nota del coach sobre el foco: ${input.focusComment}` : '',
    `- Nivel del alumno: ${input.level}`,
    input.studentName ? `- Nombre del alumno: ${input.studentName}` : '',
    `- Contexto del alumno: ${input.studentContext || 'sin contexto; usa situaciones cotidianas de trabajo y vida diaria'}`,
    `- Idioma de las explicaciones: ${input.nativeLang}`,
    '',
    `IMPORTANTE: el ejercicio se hace SIEMPRE en ${input.targetLang}. Si el título del foco usa palabras de otro idioma`,
    `(p. ej. "Can · Could · Should" en un coaching de polaco), entrena su equivalente en ${input.targetLang}`,
    '(en polaco: móc / umieć / powinien / chciałbym) y explícalo en foco_subtitulo. Nunca hagas el ejercicio en otro idioma.',
    '',
    'REGLAS DE ESTILO (como la plantilla)',
    '- Las frases en el idioma objetivo suenan reales y encajan con la vida del alumno.',
    '- Vocabulario dentro del nivel: se evalúa la gramática del foco, no palabras raras.',
    `- Todo lo que lee el alumno fuera de las frases (lead, situacion, instruccion, why, nota, nombre, verbo) va en ${input.nativeLang}, en segunda persona, tono cercano y directo, máximo dos frases.`,
    '- No uses las palabras "correcto" ni "incorrecto": explica el porqué (qué matiz da cada forma).',
    '- Sin emojis ni signos raros.',
  ]
    .filter(Boolean)
    .join('\n')
}

function planPrompt(input: FocusExerciseInput): string {
  return [
    contextPrompt(input),
    '',
    'TAREA: prepara la cabecera y las reglas del corrector. Así lo hizo la plantilla para inglés (foco de modales):',
    pretty({
      foco_subtitulo: T.foco_subtitulo,
      etiquetas: T.etiquetas,
      equivalencias: T.equivalencias,
      libre: T.libre,
    }),
    '',
    '- foco_subtitulo: una frase que dice qué se entrena y qué se corrige (estilo de la plantilla).',
    '- etiquetas: de 2 a 4 claves cortas en minúsculas y sin tildes → nombre corto de la dificultad. Son los "puntos débiles" del foco que luego verá el alumno en su resultado.',
    '- equivalencias: cifras 1-12 → palabra en el idioma objetivo (para no penalizar "3" frente a "three").',
    '- libre.prohibidas: palabras que NUNCA pueden ocupar el hueco del verbo libre en este foco (en la plantilla "to", porque detrás de un modal no va).',
    '- libre.no_verbo: palabras que no son verbos pero podrían colarse como tal: pronombres sujeto y objeto, artículos, posesivos, restos de contracciones y formas del verbo auxiliar que no toca.',
    '- libre.no_termina: terminaciones que el verbo libre NO puede tener en este foco (en la plantilla "ing"). Nunca una sola letra (una "s" rechazaría verbos como discuss o focus). Puede ir vacía.',
    '- libre.excepciones: palabras normales que acaban en esas terminaciones pero no son el error (bring, morning, need…). Vacía si no_termina está vacía.',
    '- Adapta TODO a este idioma y a este foco: no copies las listas del inglés si no aplican.',
    `- escenario: un ambiente concreto y coherente con el alumno para todo el ejercicio, y 2-3 nombres de personajes habituales en ${input.targetLang}${input.studentName ? ` (el alumno es ${input.studentName})` : ''}.`,
  ].join('\n')
}

function blockPrompt(
  input: FocusExerciseInput,
  plan: Json,
  id: 'reconocer' | 'construir' | 'conversacion',
): string {
  const tagKeys = Object.keys(strMap(plan.etiquetas))
  const shared = [
    contextPrompt(input),
    '',
    'CABECERA YA DECIDIDA (úsala):',
    pretty(plan),
    '',
    `En "tags" usa solo estas claves: ${tagKeys.join(', ')} (1 o 2 por unidad; entre todas las unidades del ejercicio deben aparecer todas).`,
  ]

  if (id === 'reconocer') {
    const example = templateBlock('reconocer')
    return [
      ...shared,
      '',
      'TAREA: bloque 1 "Reconocer". Así es el de la plantilla:',
      pretty({ instruccion: example.instruccion, items: example.items }),
      '',
      '- Exactamente 4 items. Cada uno: "lead" (una situación en una línea) y exactamente 3 options con UNA sola ok=true.',
      '- Las 3 opciones son casi iguales: cambian solo en el punto del foco. Los fallos son errores reales que comete un hispanohablante de este nivel, no disparates.',
      '- Cambia de sitio la opción buena (no siempre en medio).',
      '- "why" de cada opción: el porqué en una o dos frases, como en la plantilla.',
      '- Cada item trabaja una etiqueta; que salgan todas.',
    ].join('\n')
  }

  if (id === 'construir') {
    const example = templateBlock('construir')
    return [
      ...shared,
      '',
      PATTERN_RULES,
      '',
      'TAREA: bloque 2 "Construir" (escritura libre). Así es el de la plantilla:',
      pretty({ instruccion: example.instruccion, items: example.items }),
      '',
      '- Exactamente 4 items. Entre todos, de 5 a 7 unidades en "verbos"; al menos un item con 2 unidades que contrasten (como can / can\'t).',
      '- "situacion": qué tiene que decir el alumno, en su idioma, sin darle la frase hecha.',
      '- "ejemplo": una frase completa y natural en el idioma objetivo que cumple TODAS las unidades del item.',
      '- "nombre": la forma y para qué sirve ("can + verbo · lo que tú puedes").',
      '- "formas": patrones del núcleo que se corrige; el resto de la frase es libre. Da varias formas si hay alternativas válidas (contracciones, negación larga y corta…).',
      '- "mal": 2 o 3 patrones con los errores típicos de ese núcleo.',
      '- "nota": el porqué en una o dos frases.',
      '- "trampas": 2 frases completas y realistas con el error típico del núcleo que NO deben pasar la corrección (sirven para comprobar tus patrones; no las ve el alumno). Solo errores que tus patrones pueden ver: si el verbo es libre (_), no uses como trampa un error dentro de ese verbo.',
      '- Comprueba mentalmente: el "ejemplo" encaja con cada forma de su item, y ninguna "trampa" encaja con "formas".',
    ].join('\n')
  }

  const example = templateBlock('conversacion')
  return [
    ...shared,
    '',
    PATTERN_RULES,
    '',
    'TAREA: bloque 3 "En conversación". Así es el de la plantilla:',
    pretty({ instruccion: example.instruccion, lineas: example.lineas, items: example.items }),
    '',
    '- Un diálogo natural de 4 o 5 líneas entre el alumno ("Tú") y uno de los personajes del escenario.',
    '- Exactamente 5 huecos, escritos {0} {1} {2} {3} {4} dentro de "texto", cada uno una sola vez y en orden.',
    '- Cada hueco es UN trozo seguido (modal + verbo, auxiliar + participio…). Nunca partas una misma forma en dos huecos, y nunca pongas dos huecos seguidos o separados por una sola palabra. Evita huecos en preguntas donde el sujeto queda en medio de la forma (Could you bring…?).',
    '- items[i] corresponde al hueco {i}. "verbo" = el infinitivo en el idioma objetivo · la pista en el idioma del alumno ("finish · puedo").',
    '- "formas": patrones de TODO lo que va dentro del hueco (no más). Varias si hay alternativas válidas.',
    '- "show": la respuesta que se enseña si falla; tiene que encajar con sus "formas".',
    '- "why": el porqué en una o dos frases.',
    '- "trampas": 2 respuestas del hueco con el error típico que NO deben pasar.',
    '- El texto de alrededor del hueco no debe regalar la respuesta.',
  ].join('\n')
}

/* ─────────────────────────── limpieza + validación ─────────────────────────── */

type Plan = {
  foco_subtitulo: string
  etiquetas: Record<string, string>
  equivalencias: Record<string, string>
  libre: CorrectorLibre
  escenario: { ambiente: string; personajes: string[] }
}

function cleanPlan(raw: Json | null, input: FocusExerciseInput): Plan | null {
  if (!raw) return null
  const etiquetasRaw = strMap(raw.etiquetas)
  const etiquetas = Object.fromEntries(
    Object.entries(etiquetasRaw).map(([key, value]) => [
      key
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, ''),
      value,
    ]),
  )
  if (Object.keys(etiquetas).length < 1) return null
  const libreRaw = isRecord(raw.libre) ? raw.libre : {}
  const escenario = isRecord(raw.escenario) ? raw.escenario : {}
  return {
    foco_subtitulo: str(raw.foco_subtitulo, `Practicas ${input.focusTitle}.`),
    etiquetas,
    equivalencias: strMap(raw.equivalencias),
    libre: {
      prohibidas: strList(libreRaw.prohibidas).map((w) => w.toLowerCase()),
      no_verbo: strList(libreRaw.no_verbo).map((w) => w.toLowerCase()),
      // Una terminación de una letra ("s", "e") rechazaría demasiados verbos buenos.
      no_termina: strList(libreRaw.no_termina)
        .map((w) => w.toLowerCase().replace(/^-/, ''))
        .filter((w) => w.length >= 2),
      excepciones: strList(libreRaw.excepciones).map((w) => w.toLowerCase()),
    },
    escenario: {
      ambiente: str(escenario.ambiente),
      personajes: strList(escenario.personajes),
    },
  }
}

const cleanTags = (value: unknown, allowed: string[]): string[] => {
  const tags = strList(value)
    .map((tag) => tag.toLowerCase())
    .filter((tag) => allowed.includes(tag))
  return tags.length > 0 ? tags.slice(0, 2) : allowed.slice(0, 1)
}

/* Baraja las opciones para que la buena no caiga siempre en el mismo sitio (determinista por item). */
function shuffle<T>(list: T[], seed: number): T[] {
  const out = [...list]
  let state = (seed + 7) * 7919
  for (let i = out.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0
    const j = state % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/* problems = todo lo que se le pide arreglar a la IA; soft = los que no invalidan el bloque. */
type Check = { problems: string[]; block: Json | null; soft?: string[] }

function checkReconocer(raw: Json | null, plan: Plan): Check {
  const problems: string[] = []
  if (!raw) return { problems: ['No llegó el bloque.'], block: null }
  const allowed = Object.keys(plan.etiquetas)
  const items = (Array.isArray(raw.items) ? raw.items : []).filter(isRecord).map((item, i) => {
    const options = (Array.isArray(item.options) ? item.options : []).filter(isRecord).map((option) => ({
      t: str(option.t),
      ok: option.ok === true,
      why: str(option.why),
    }))
    const oks = options.filter((option) => option.ok).length
    if (options.length !== 3) problems.push(`Item ${i + 1}: tiene ${options.length} opciones y deben ser 3.`)
    if (oks !== 1) problems.push(`Item ${i + 1}: tiene ${oks} opciones con ok=true y debe ser exactamente 1.`)
    if (new Set(options.map((option) => option.t.toLowerCase())).size !== options.length) {
      problems.push(`Item ${i + 1}: hay dos opciones con el mismo texto.`)
    }
    if (options.some((option) => !option.t || !option.why)) problems.push(`Item ${i + 1}: falta "t" o "why" en alguna opción.`)
    if (!str(item.lead)) problems.push(`Item ${i + 1}: falta "lead".`)
    return { lead: str(item.lead), tags: cleanTags(item.tags, allowed), options: shuffle(options, i) }
  })
  if (items.length !== 4) problems.push(`Hay ${items.length} items y deben ser 4.`)
  return {
    problems,
    block: {
      id: 'reconocer',
      titulo: 'Reconocer',
      instruccion: str(raw.instruccion, 'Cuatro frases. Solo una versión de cada una aguanta.'),
      items,
    },
  }
}

const ctxOf = (plan: Plan) => ({ equivalencias: plan.equivalencias, libre: plan.libre })

function checkFormas(formas: string[], where: string, problems: string[], ctx: ReturnType<typeof ctxOf>) {
  if (formas.length === 0) problems.push(`${where}: "formas" está vacío.`)
  for (const forma of formas) {
    const tokens = patternOf(forma, ctx)
    if (tokens.length === 0 || tokens.every((token) => token === '_' || token === '~' || token === '…' || token.startsWith('_'))) {
      problems.push(`${where}: la forma "${forma}" no tiene ninguna palabra fija y aceptaría cualquier cosa.`)
    }
  }
}

function checkConstruir(raw: Json | null, plan: Plan): Check & { dropped: string[] } {
  const problems: string[] = []
  const dropped: string[] = []
  if (!raw) return { problems: ['No llegó el bloque.'], block: null, dropped }
  const allowed = Object.keys(plan.etiquetas)
  const ctx = ctxOf(plan)
  let units = 0
  const items = (Array.isArray(raw.items) ? raw.items : []).filter(isRecord).map((item, i) => {
    const ejemplo = str(item.ejemplo)
    if (!str(item.situacion)) problems.push(`Item ${i + 1}: falta "situacion".`)
    if (!ejemplo) problems.push(`Item ${i + 1}: falta "ejemplo".`)
    const verbos = (Array.isArray(item.verbos) ? item.verbos : []).filter(isRecord).map((verb, j) => {
      const where = `Item ${i + 1}, unidad ${j + 1} ("${str(verb.nombre)}")`
      const formas = strList(verb.formas)
      const mal = strList(verb.mal)
      // Graves: el alumno escribiría bien y se lo marcaríamos mal (o la forma lo acepta todo).
      const hardProblems: string[] = []
      checkFormas(formas, where, hardProblems, ctx)
      if (ejemplo && formas.length && !findForm(ejemplo, formas, ctx)) {
        hardProblems.push(`${where}: el ejemplo "${ejemplo}" NO encaja con sus formas ${JSON.stringify(formas)}.`)
      }
      if (!str(verb.nota)) hardProblems.push(`${where}: falta "nota".`)
      // Leves: una trampa que pasa = la corrección es algo permisiva. Se pide arreglarlo, pero no se descarta la unidad.
      for (const trampa of strList(verb.trampas)) {
        const hit = findForm(trampa, formas, ctx)
        if (hit) {
          problems.push(
            `${where}: la trampa "${trampa}" pasa la corrección (encaja "${hit}"). Si el error está en una palabra que tus patrones no pueden ver (p. ej. la concordancia de un participio libre), cambia la trampa por un error que sí detecten; si no, ajusta las formas.`,
          )
        }
      }
      problems.push(...hardProblems)
      return {
        unit: {
          nombre: str(verb.nombre, `Unidad ${j + 1}`),
          formas,
          mal,
          tags: cleanTags(verb.tags, allowed),
          nota: str(verb.nota),
        },
        ok: hardProblems.length === 0,
        where,
      }
    })
    units += verbos.length
    if (verbos.length === 0) problems.push(`Item ${i + 1}: no tiene unidades en "verbos".`)
    return { situacion: str(item.situacion), ejemplo, verbos }
  })
  if (items.length !== 4) problems.push(`Hay ${items.length} items y deben ser 4.`)
  if (units < 5 || units > 7) problems.push(`Hay ${units} unidades en total y deben ser de 5 a 7.`)

  return {
    problems,
    dropped,
    block: {
      id: 'construir',
      titulo: 'Construir',
      instruccion: str(
        raw.instruccion,
        'Escribe la frase como te salga: el verbo, el orden y los detalles los eliges tú. Solo se corrige el foco.',
      ),
      items: items.map((item) => ({
        situacion: item.situacion,
        ejemplo: item.ejemplo,
        verbos: item.verbos,
      })),
    },
  }
}

/* Tras el reintento: quita las unidades que siguen fallando en vez de tirar todo el ejercicio. */
function pruneConstruir(block: Json, dropped: string[]): Json {
  const items = (block.items as Array<{ situacion: string; ejemplo: string; verbos: Array<{ unit: Json; ok: boolean; where: string }> }>)
    .map((item) => {
      const kept = item.verbos.filter((verb) => {
        if (!verb.ok) dropped.push(verb.where)
        return verb.ok
      })
      return { situacion: item.situacion, ejemplo: item.ejemplo, verbos: kept.map((verb) => verb.unit) }
    })
    .filter((item) => item.verbos.length > 0 && item.situacion && item.ejemplo)
  return { ...block, items }
}

const flattenConstruir = (block: Json): Json => ({
  ...block,
  items: (block.items as Array<{ situacion: string; ejemplo: string; verbos: Array<{ unit: Json }> }>).map((item) => ({
    situacion: item.situacion,
    ejemplo: item.ejemplo,
    verbos: item.verbos.map((verb) => verb.unit),
  })),
})

function checkConversacion(raw: Json | null, plan: Plan): Check {
  const problems: string[] = []
  const soft: string[] = []
  if (!raw) return { problems: ['No llegó el bloque.'], block: null }
  const allowed = Object.keys(plan.etiquetas)
  const ctx = ctxOf(plan)
  const lineas = (Array.isArray(raw.lineas) ? raw.lineas : [])
    .filter(isRecord)
    .map((line) => ({ quien: str(line.quien), texto: str(line.texto) }))
    .filter((line) => line.texto)
  const items = (Array.isArray(raw.items) ? raw.items : []).filter(isRecord).map((item, i) => {
    const where = `Hueco {${i}}`
    const formas = strList(item.formas)
    const show = str(item.show, formas[0] || '')
    checkFormas(formas, where, problems, ctx)
    if (show && formas.length && !findForm(show, formas, ctx, undefined, true)) {
      problems.push(`${where}: "show" = "${show}" no encaja con sus formas ${JSON.stringify(formas)}.`)
    }
    for (const trampa of strList(item.trampas)) {
      if (findForm(trampa, formas, ctx, undefined, true)) {
        soft.push(`${where}: la trampa "${trampa}" pasa la corrección; ajusta las formas o cambia la trampa por un error que tus patrones sí detecten.`)
      }
    }
    if (!str(item.verbo)) problems.push(`${where}: falta "verbo".`)
    return { verbo: str(item.verbo), formas, show, tags: cleanTags(item.tags, allowed), why: str(item.why) }
  })
  if (lineas.length < 3) problems.push(`El diálogo tiene ${lineas.length} líneas; deben ser 4 o 5.`)
  if (items.length !== 5) problems.push(`Hay ${items.length} huecos en "items" y deben ser 5.`)
  const allText = lineas.map((line) => line.texto).join(' ')
  const found = [...allText.matchAll(/\{(\d+)\}/g)].map((match) => Number(match[1]))
  for (let i = 0; i < items.length; i++) {
    const count = found.filter((n) => n === i).length
    if (count !== 1) problems.push(`El hueco {${i}} aparece ${count} veces en el diálogo; debe aparecer una vez.`)
  }
  if (found.some((n) => n >= items.length)) problems.push('Hay huecos en el diálogo sin item que les corresponda.')
  for (const line of lineas) {
    if (/\{\d+\}\s*(\S+\s+)?\{\d+\}/.test(line.texto)) {
      problems.push(`La línea "${line.texto}" tiene dos huecos seguidos o separados por una sola palabra: cada forma va en un único hueco.`)
    }
    // Relleno con "show" y busco palabras repetidas ("could you bring you bring"): señal de hueco mal cortado.
    const filled = line.texto.replace(/\{(\d+)\}/g, (_, n) => items[Number(n)]?.show || '')
    const words = filled.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').split(/\s+/).filter(Boolean)
    for (let k = 0; k + 1 < words.length; k++) {
      const repeatedWord = words[k] === words[k + 1]
      const repeatedPair = k + 3 < words.length && words[k] === words[k + 2] && words[k + 1] === words[k + 3]
      if (repeatedWord || repeatedPair) {
        problems.push(`Con las respuestas puestas, la línea queda "${filled}": el texto de alrededor repite lo que va en el hueco.`)
        break
      }
    }
  }
  return {
    problems: [...problems, ...soft],
    soft,
    block: {
      id: 'conversacion',
      titulo: 'En conversación',
      instruccion: str(
        raw.instruccion,
        'Te doy el infinitivo y la pista en español; la forma la pones tú. Se corrige entera de una vez.',
      ),
      lineas,
      items,
    },
  }
}

/* ─────────────────────────── orquestación ─────────────────────────── */

const SYSTEM =
  'Eres un profesor de idiomas experto y un generador de ejercicios preciso. Respondes SIEMPRE usando la tool indicada, con JSON válido y completo.'

async function generateBlock(
  call: ToolCaller,
  input: FocusExerciseInput,
  plan: Plan,
  id: 'reconocer' | 'construir' | 'conversacion',
  warnings: string[],
  startedAt: number,
): Promise<{ block: Json | null; error: string | null; raw: Json | null }> {
  const tool = id === 'reconocer' ? RECONOCER_TOOL : id === 'construir' ? CONSTRUIR_TOOL : CONVERSACION_TOOL
  const check = (raw: Json | null) =>
    id === 'reconocer' ? checkReconocer(raw, plan) : id === 'construir' ? checkConstruir(raw, plan) : checkConversacion(raw, plan)
  const planJson = plan as unknown as Json
  const prompt = blockPrompt(input, planJson, id)

  let raw = await call({ system: SYSTEM, prompt, tool, maxTokens: 6000, temperature: 0.4 })
  let result = check(raw)

  // Reintento: siempre si hay problemas graves; si solo hay avisos leves, solo si vamos bien de tiempo
  // (la Edge Function tiene un límite de tiempo y el alumno no debe quedarse sin ejercicio).
  const hasHard = (check: Check) => check.problems.some((problem) => !(check.soft || []).includes(problem))
  const softOnly = (check: Check) => check.problems.length > 0 && !hasHard(check)
  const isConstruirSoft = (check: Check) =>
    id === 'construir' && check.problems.every((problem) => problem.includes('la trampa'))
  const onlyLight = softOnly(result) || isConstruirSoft(result)
  const shouldRetry = result.problems.length > 0 && (!onlyLight || Date.now() - startedAt < 45_000)

  if (shouldRetry) {
    warnings.push(`${id}: reintento por ${result.problems.length} problema(s): ${result.problems.slice(0, 4).join(' | ')}`)
    const retryPrompt = [
      prompt,
      '',
      'TU RESPUESTA ANTERIOR:',
      JSON.stringify(raw),
      '',
      'EL CORRECTOR AUTOMÁTICO HA ENCONTRADO ESTOS PROBLEMAS. Devuelve el bloque COMPLETO corregido:',
      ...result.problems.map((problem) => `- ${problem}`),
    ].join('\n')
    raw = await call({ system: SYSTEM, prompt: retryPrompt, tool, maxTokens: 6000, temperature: 0.2 })
    result = check(raw)
  }

  if (!result.block) return { block: null, error: `invalid_${id}_block`, raw }

  if (id === 'construir') {
    const dropped: string[] = []
    const pruned = result.problems.length > 0 ? pruneConstruir(result.block, dropped) : flattenConstruir(result.block)
    const unitCount = (pruned.items as Array<{ verbos: unknown[] }>).reduce((acc, item) => acc + item.verbos.length, 0)
    if (dropped.length) warnings.push(`construir: descartadas ${dropped.length} unidad(es): ${dropped.join(' | ')}`)
    if ((pruned.items as unknown[]).length < 3 || unitCount < 4) {
      return { block: null, error: `invalid_construir_block:${result.problems.slice(0, 3).join(' | ')}`, raw }
    }
    return { block: pruned, error: null, raw }
  }

  const hardLeft = result.problems.filter((problem) => !(result.soft || []).includes(problem))
  if (hardLeft.length === 0 && result.problems.length > 0) {
    warnings.push(`${id}: quedan avisos leves: ${result.problems.slice(0, 3).join(' | ')}`)
    return { block: result.block, error: null, raw }
  }

  if (result.problems.length > 0) {
    if (id === 'reconocer') {
      // Quita los items rotos si quedan al menos 3 buenos.
      const items = (result.block.items as Array<{ options: Array<{ ok: boolean }> }>).filter(
        (item) => item.options.length === 3 && item.options.filter((option) => option.ok).length === 1,
      )
      if (items.length >= 3) {
        warnings.push(`reconocer: se usan ${items.length} items tras descartar los rotos.`)
        return { block: { ...result.block, items }, error: null, raw }
      }
    }
    return { block: null, error: `invalid_${id}_block:${result.problems.slice(0, 3).join(' | ')}`, raw }
  }
  return { block: result.block, error: null, raw }
}

export async function generateCoachingFocusExercise(
  call: ToolCaller,
  input: FocusExerciseInput,
): Promise<FocusExerciseResult> {
  const warnings: string[] = []
  const startedAt = Date.now()

  let planRaw: Json | null = null
  try {
    planRaw = await call({ system: SYSTEM, prompt: planPrompt(input), tool: PLAN_TOOL, maxTokens: 2500, temperature: 0.3 })
  } catch (error) {
    return { exercise: null, errorReason: `plan_request_failed:${error instanceof Error ? error.message : 'unknown'}`, invalidJsonSnippet: null, warnings }
  }
  const plan = cleanPlan(planRaw, input)
  if (!plan) return { exercise: null, errorReason: 'invalid_plan', invalidJsonSnippet: snippet(planRaw), warnings }

  let results: Array<{ block: Json | null; error: string | null; raw: Json | null }>
  try {
    results = await Promise.all(
      (['reconocer', 'construir', 'conversacion'] as const).map((id) => generateBlock(call, input, plan, id, warnings, startedAt)),
    )
  } catch (error) {
    return { exercise: null, errorReason: `block_request_failed:${error instanceof Error ? error.message : 'unknown'}`, invalidJsonSnippet: null, warnings }
  }

  const failed = results.find((result) => !result.block)
  if (failed) return { exercise: null, errorReason: failed.error || 'invalid_block', invalidJsonSnippet: snippet(failed.raw), warnings }

  const [reconocer, construir, conversacion] = results.map((result) => result.block as Json)
  const units =
    (reconocer.items as unknown[]).length +
    (construir.items as Array<{ verbos: unknown[] }>).reduce((acc, item) => acc + item.verbos.length, 0) +
    (conversacion.items as unknown[]).length

  const exercise: Json = {
    idioma: input.targetLang,
    nivel: input.level,
    foco: input.focusTitle,
    foco_subtitulo: plan.foco_subtitulo,
    foco_slot: input.focusSlot,
    fase: input.phase,
    umbral: passThreshold(units),
    equivalencias: plan.equivalencias,
    libre: plan.libre,
    etiquetas: plan.etiquetas,
    bloques: [reconocer, construir, conversacion],
    generador: { version: 2, avisos: warnings.slice(0, 10) },
  }

  return { exercise, errorReason: null, invalidJsonSnippet: null, warnings }
}

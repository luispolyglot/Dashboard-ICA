import {
  findForm,
  normalizeText,
  passThreshold,
  readablePattern,
  type CorrectorContext,
  type CorrectorLibre,
} from '../../../supabase/functions/_shared/coaching-exercise-corrector'

export type { CorrectorContext, CorrectorLibre }
export { readablePattern }

export type RecoOption = { t: string; ok: boolean; why: string }
export type RecoItem = { lead: string; tags: string[]; options: RecoOption[] }
export type VerbUnit = {
  nombre: string
  formas: string[]
  mal: string[]
  tags: string[]
  nota: string
  libre?: CorrectorLibre
}
export type BuildItem = { situacion: string; ejemplo: string; verbos: VerbUnit[] }
export type DialogLine = { quien: string; texto: string }
export type DialogItem = {
  verbo: string
  formas: string[]
  show: string
  tags: string[]
  why: string
  libre?: CorrectorLibre
}

export type ExerciseData = {
  idioma: string
  nivel: string
  foco: string
  focoSubtitulo: string
  focoSlot: string
  fase: string
  umbral: number
  equivalencias: Record<string, string>
  etiquetas: Record<string, string>
  libre: CorrectorLibre
  reconocer: { titulo: string; instruccion: string; items: RecoItem[] }
  construir: { titulo: string; instruccion: string; items: BuildItem[] }
  conversacion: {
    titulo: string
    instruccion: string
    lineas: DialogLine[]
    items: DialogItem[]
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function asLibre(value: unknown): CorrectorLibre | undefined {
  if (!isRecord(value)) return undefined
  const out: CorrectorLibre = {}
  for (const key of [
    'prohibidas',
    'no_verbo',
    'no_termina',
    'excepciones',
    'no_precedido',
  ] as const) {
    const list = asStringArray(value[key])
    if (list.length > 0) out[key] = list
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function normalizeExercisePayload(payload: unknown): ExerciseData | null {
  if (!isRecord(payload)) return null
  const blocksRaw = Array.isArray(payload.bloques) ? payload.bloques : []
  const blocks = blocksRaw.filter(isRecord)

  const reconocer = blocks.find((block) => block.id === 'reconocer')
  const construir = blocks.find((block) => block.id === 'construir')
  const conversacion = blocks.find((block) => block.id === 'conversacion')
  if (!reconocer || !construir || !conversacion) return null

  const recoItems = (Array.isArray(reconocer.items) ? reconocer.items : [])
    .filter(isRecord)
    .map((item) => {
      const options = (Array.isArray(item.options) ? item.options : [])
        .filter(isRecord)
        .map((option) => ({
          t: asString(option.t),
          ok: Boolean(option.ok),
          why: asString(option.why),
        }))
        .filter((option) => option.t.length > 0)

      const fallbackText =
        options.find((option) => !option.t.includes('[SIN_ERROR_REAL]'))?.t ||
        'Frase con error típico del foco'

      return {
        lead: asString(item.lead),
        tags: asStringArray(item.tags),
        options: options.map((option) =>
          option.t.includes('[SIN_ERROR_REAL]')
            ? {
                ...option,
                t: fallbackText,
              }
            : option,
        ),
      }
    })
    .filter((item) => item.options.length > 0)

  const buildItems = (Array.isArray(construir.items) ? construir.items : [])
    .filter(isRecord)
    .map((item) => ({
      situacion: asString(item.situacion),
      ejemplo: asString(item.ejemplo),
      verbos: (Array.isArray(item.verbos) ? item.verbos : [])
        .filter(isRecord)
        .map((verb) => ({
          nombre: asString(verb.nombre),
          formas: asStringArray(verb.formas),
          mal: asStringArray(verb.mal),
          tags: asStringArray(verb.tags),
          nota: asString(verb.nota),
          libre: asLibre(verb.libre),
        }))
        .filter((verb) => verb.formas.length > 0),
    }))
    .filter((item) => item.verbos.length > 0)

  const dialogItems = (Array.isArray(conversacion.items) ? conversacion.items : [])
    .filter(isRecord)
    .map((item) => ({
      verbo: asString(item.verbo),
      formas: asStringArray(item.formas),
      show: asString(item.show),
      tags: asStringArray(item.tags),
      why: asString(item.why),
      libre: asLibre(item.libre),
    }))
    .filter((item) => item.formas.length > 0)

  const dialogLines = (Array.isArray(conversacion.lineas) ? conversacion.lineas : [])
    .filter(isRecord)
    .map((line) => ({
      quien: asString(line.quien),
      texto: asString(line.texto),
    }))
    .filter((line) => line.texto.length > 0)

  if (recoItems.length === 0 || buildItems.length === 0 || dialogItems.length === 0) {
    return null
  }

  const equivalenciasRaw = isRecord(payload.equivalencias) ? payload.equivalencias : {}
  const equivalencias = Object.fromEntries(
    Object.entries(equivalenciasRaw)
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => [key, String(value)]),
  )

  const etiquetasRaw = isRecord(payload.etiquetas) ? payload.etiquetas : {}
  const etiquetas = Object.fromEntries(
    Object.entries(etiquetasRaw)
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => [key, String(value)]),
  )

  return {
    idioma: asString(payload.idioma, 'Idioma objetivo'),
    nivel: asString(payload.nivel, 'A2'),
    foco: asString(payload.foco, 'Foco gramatical'),
    focoSubtitulo: asString(payload.foco_subtitulo),
    focoSlot: asString(payload.foco_slot, 'Foco'),
    fase: asString(payload.fase, 'Entrenado'),
    // La nota para superar se calcula siempre igual (75 %), también en ejercicios antiguos.
    umbral: passThreshold(
      recoItems.length +
        buildItems.reduce((total, item) => total + item.verbos.length, 0) +
        dialogItems.length,
    ),
    equivalencias,
    etiquetas,
    libre: asLibre(payload.libre) || {},
    reconocer: {
      titulo: asString(reconocer.titulo, 'Reconocer'),
      instruccion: asString(reconocer.instruccion),
      items: recoItems,
    },
    construir: {
      titulo: asString(construir.titulo, 'Construir'),
      instruccion: asString(construir.instruccion),
      items: buildItems,
    },
    conversacion: {
      titulo: asString(conversacion.titulo, 'En conversacion'),
      instruccion: asString(conversacion.instruccion),
      lineas: dialogLines,
      items: dialogItems,
    },
  }
}

export function correctorContextOf(data: ExerciseData): CorrectorContext {
  return { equivalencias: data.equivalencias, libre: data.libre }
}

export function normalizeLooseText(
  value: string,
  equivalencias: Record<string, string>,
): string {
  return normalizeText(value, { equivalencias })
}

/* Bloque 2 · devuelve el trozo de la frase que encaja con la forma buena (o null). */
export function findBuildVerbMatch(
  rawText: string,
  verb: VerbUnit,
  ctx: CorrectorContext,
): string | null {
  return findForm(rawText, verb.formas, ctx, verb)
}

export function scoreBuildVerbMatch(
  rawText: string,
  verb: VerbUnit,
  ctx: CorrectorContext,
): boolean {
  return Boolean(findBuildVerbMatch(rawText, verb, ctx))
}

/* Bloque 2 · si no encaja la buena, busca el error típico que ha escrito el alumno. */
export function detectWrongBuildCandidate(
  rawText: string,
  verb: VerbUnit,
  ctx: CorrectorContext,
): string | null {
  return findForm(rawText, verb.mal, ctx, verb)
}

/* Bloque 3 · el hueco entero tiene que encajar con alguna forma. */
export function scoreDialogItem(
  rawAnswer: string,
  item: DialogItem,
  ctx: CorrectorContext,
): boolean {
  if (!normalizeText(rawAnswer, ctx)) return false
  return Boolean(findForm(rawAnswer, item.formas, ctx, item, true))
}

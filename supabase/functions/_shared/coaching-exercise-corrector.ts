/* ══════════════════════════════════════════════════════════════════════
   COACHING ICA · CORRECTOR DEL EJERCICIO DE FOCO
   Copia fiel del corrector de la plantilla "EjercicioFoco". Se usa en:
   - la app del alumno (para corregir lo que escribe),
   - la Edge Function que genera el ejercicio (para comprobar que lo que
     genera la IA se corrige bien antes de dárselo al alumno).
   Sin dependencias de Deno ni del navegador.

   Cada forma del bloque "construir" y cada hueco de "conversacion" es un
   PATRÓN de palabras:

     palabra     → tiene que aparecer tal cual                    could
     a|b|c       → vale cualquiera de esas palabras               would|d
     _           → una palabra cualquiera: el verbo lo elige       could _
                   el alumno (nunca una de "prohibidas" ni de
                   "no_verbo", ni una que acabe en "no_termina")
     _ing, _ed   → una palabra cualquiera que acabe así            prefer _ing
     _er|ir|re   → que acabe en cualquiera de esos sufijos          peux ~ _er|ir|re
     ~           → hueco de 0 a 2 palabras (sujeto de una           can ~ _
                   pregunta, un adverbio…). Nunca rellena
                   "prohibidas" ni palabras que acaben en
                   "no_termina".
     …           → (ampliación) hueco de 0 a 6 palabras, con las     rufe … an
                   mismas reglas que ~. Para piezas que van lejos
                   (verbos separables del alemán, ne … pas).
   ══════════════════════════════════════════════════════════════════════ */

/* Nota para superar el ejercicio de Entrenado: el 75 % de las unidades, redondeando hacia arriba
   (9 de 12, 11 de 14, 12 de 15, 12 de 16). Superarlo pasa el foco a "Entrenado".
   Para cambiar la exigencia, cambia solo este número. */
export const PASS_RATIO = 0.75

export function passThreshold(totalUnits: number): number {
  return Math.max(1, Math.ceil(totalUnits * PASS_RATIO))
}

export type CorrectorLibre = {
  prohibidas?: string[]
  no_verbo?: string[]
  no_termina?: string[]
  excepciones?: string[]
  no_precedido?: string[]
}

export type CorrectorContext = {
  equivalencias?: Record<string, string>
  libre?: CorrectorLibre
}

type Reglas = {
  prohibidas: string[]
  no_verbo: string[]
  no_termina: string[]
  excepciones: string[]
  no_precedido: string[]
}

const lower = (list: string[] | undefined): string[] =>
  (list || []).map((item) => String(item).toLowerCase().trim()).filter(Boolean)

export function normalizeText(value: string, ctx?: CorrectorContext): string {
  const equivalencias = ctx?.equivalencias || {}
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/ł/g, 'l')
    .replace(/ß/g, 'ss')
    .replace(/[’‘`´]/g, "'")
    .replace(/[.,;:!?¿¡"«»…()\-–—]/g, ' ')
    .replace(/'/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => equivalencias[word] || word)
    .join(' ')
}

export function tokensOf(value: string, ctx?: CorrectorContext): string[] {
  return normalizeText(value, ctx).split(' ').filter(Boolean)
}

export function patternOf(pattern: string, ctx?: CorrectorContext): string[] {
  return (pattern || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((token) => {
      if (token === '~' || token === '_') return [token]
      if (token === '…' || token === '...') return ['…']
      if (token.startsWith('_')) {
        return [
          '_' +
            token
              .slice(1)
              .split('|')
              .map((part) => normalizeText(part.replace(/^_/, '')))
              .join('|'),
        ]
      }
      if (token.includes('|')) {
        return [
          token
            .split('|')
            .map((part) => normalizeText(part, ctx))
            .join('|'),
        ]
      }
      return tokensOf(token, ctx)
    })
}

function reglasDe(ctx?: CorrectorContext, unidad?: { libre?: CorrectorLibre }): Reglas {
  const g = ctx?.libre || {}
  const u = unidad?.libre || {}
  return {
    prohibidas: [...lower(g.prohibidas), ...lower(u.prohibidas)],
    no_verbo: [...lower(g.no_verbo), ...lower(u.no_verbo)],
    no_termina: [...lower(g.no_termina), ...lower(u.no_termina)],
    excepciones: [...lower(g.excepciones), ...lower(u.excepciones)],
    no_precedido: [...lower(u.no_precedido)],
  }
}

/* going o used sí cuentan; bring, morning o need acaban igual pero no lo son: van en "excepciones" */
const terminaEn = (word: string, suffix: string, r: Reglas): boolean =>
  word.endsWith(suffix) && word.length - suffix.length >= 2 && !r.excepciones.includes(word)

const rellenaHueco = (word: string, r: Reglas): boolean =>
  !r.prohibidas.includes(word) && !r.no_termina.some((suffix) => terminaEn(word, suffix, r))

const esVerboLibre = (word: string, r: Reglas): boolean =>
  rellenaHueco(word, r) && !r.no_verbo.includes(word)

/* Devuelve [inicio, fin) del trozo que encaja con el patrón, o null.
   anclado = true → el patrón tiene que cubrir el texto entero (huecos del diálogo). */
function encaja(T: string[], P: string[], r: Reglas, anclado: boolean): [number, number] | null {
  const rec = (ti: number, pi: number): number => {
    if (pi === P.length) return anclado && ti !== T.length ? -1 : ti
    const p = P[pi]
    if (p === '~' || p === '…') {
      const maxGap = p === '~' ? 2 : 6
      for (let k = 0; k <= maxGap && ti + k <= T.length; k++) {
        if (k > 0 && !rellenaHueco(T[ti + k - 1], r)) break
        const end = rec(ti + k, pi + 1)
        if (end >= 0) return end
      }
      return -1
    }
    if (ti >= T.length) return -1
    const w = T[ti]
    const ok =
      p === '_'
        ? esVerboLibre(w, r)
        : p.startsWith('_')
          ? !r.prohibidas.includes(w) &&
            !r.no_verbo.includes(w) &&
            p
              .slice(1)
              .split('|')
              .some((suffix) => terminaEn(w, suffix, r))
          : p.includes('|')
            ? p.split('|').includes(w)
            : w === p
    return ok ? rec(ti + 1, pi + 1) : -1
  }

  if (P.length === 0) return null
  const starts = anclado ? [0] : T.map((_, i) => i)
  for (const s of starts) {
    if (s > 0 && r.no_precedido.includes(T[s - 1])) continue
    const end = rec(s, 0)
    if (end > s) return [s, end]
  }
  return null
}

/* Primera forma de la lista que aparece en el texto.
   Devuelve el trozo tal y como lo escribió el alumno ("can't come"), o null. */
export function findForm(
  text: string,
  patterns: string[] | undefined,
  ctx?: CorrectorContext,
  unidad?: { libre?: CorrectorLibre },
  anclado = false,
): string | null {
  const words = (text || '').trim().split(/\s+/).filter(Boolean)
  const T: string[] = []
  const owner: number[] = []
  words.forEach((word, i) =>
    tokensOf(word, ctx).forEach((token) => {
      T.push(token)
      owner.push(i)
    }),
  )
  const r = reglasDe(ctx, unidad)
  for (const pattern of patterns || []) {
    const span = encaja(T, patternOf(pattern, ctx), r, anclado)
    if (span) {
      return words
        .slice(owner[span[0]], owner[span[1] - 1] + 1)
        .join(' ')
        .replace(/^[.,;:!?¿¡"«»…()]+|[.,;:!?¿¡"«»…()]+$/g, '')
    }
  }
  return null
}

/* "could _" → "could + verbo", para enseñar la forma al alumno sin símbolos */
export function readablePattern(pattern: string): string {
  return (pattern || '')
    .split(/\s+/)
    .filter((token) => token && token !== '~' && token !== '…' && token !== '...')
    .map((token) =>
      token === '_'
        ? '+ verbo'
        : token.startsWith('_')
          ? `verbo en -${token.slice(1).split('|').join('/-')}`
          : token.split('|')[0],
    )
    .join(' ')
}

/**
 * NOTA DESAFIANTE — lógica compartida de trozos (fase 1)
 *
 * Sin imports a propósito: este archivo lo usan
 * - la Edge Function anthropic-proxy (Deno, en Supabase), y
 * - el modo prueba local de Vite (Node, en el ordenador del equipo).
 * Así el prompt y las reglas son exactamente los mismos en los dos sitios.
 *
 * Documento de referencia: "Nota desafiante: documento para Nahuel" (sept. 2026).
 */

export type Chunk = { target: string; native: string }

export const MAX_CHUNK_WORDS = 10
// Con más de 8 palabras se intenta cortar; con 9 o 10, solo si el corte queda natural.
export const PREFERRED_MAX_CHUNK_WORDS = 8
// El mínimo lo pide el prompt, pero el código no lo exige:
// a veces no se puede cumplir sin pasar del máximo.
export const MIN_CHUNK_WORDS = 3

export const normalizeSpaces = (text: string): string => text.replace(/\s+/g, ' ').trim()

// Cuenta palabras reales: ignora tokens sin letras ni números ("-", "?", "¿", "!").
export const countWords = (text: string): number =>
  text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length

export const joinChunks = (chunks: Chunk[], side: keyof Chunk): string =>
  normalizeSpaces(chunks.map((chunk) => chunk[side]).join(' '))

export const parseJsonObject = (
  text: string | null | undefined,
): Record<string, unknown> | null => {
  if (!text) return null
  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export const sanitizeChunks = (value: unknown): Chunk[] | null => {
  if (!Array.isArray(value) || !value.length) return null
  const chunks: Chunk[] = []
  for (const item of value) {
    const record = (item ?? {}) as { target?: unknown; native?: unknown }
    const target = typeof record.target === 'string' ? normalizeSpaces(record.target) : ''
    const native = typeof record.native === 'string' ? normalizeSpaces(record.native) : ''
    if (!target || !native) return null
    chunks.push({ target, native })
  }
  return chunks
}

// Devuelve los problemas encontrados (lista vacía = trozos válidos).
// Los mensajes van en inglés porque se reenvían a la IA en el reintento.
export const getChunkProblems = (chunks: Chunk[], exactTarget?: string): string[] => {
  const problems: string[] = []
  chunks.forEach((chunk, index) => {
    const targetWords = countWords(chunk.target)
    const nativeWords = countWords(chunk.native)
    if (targetWords > MAX_CHUNK_WORDS) {
      problems.push(
        `Chunk ${index + 1} has ${targetWords} words on the target side (max ${MAX_CHUNK_WORDS}).`,
      )
    }
    if (nativeWords > MAX_CHUNK_WORDS) {
      problems.push(
        `Chunk ${index + 1} has ${nativeWords} words on the native side (max ${MAX_CHUNK_WORDS}).`,
      )
    }
  })
  if (exactTarget !== undefined && joinChunks(chunks, 'target') !== normalizeSpaces(exactTarget)) {
    problems.push(
      'Joining the target chunks does not reproduce the original target text exactly. Do not change it.',
    )
  }
  return problems
}

export const chunkSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      target: { type: 'string' },
      native: { type: 'string' },
    },
    required: ['target', 'native'],
  },
}

// Reglas de división acordadas. Se usan en los dos prompts.
export const buildChunkRules = (targetLang: string, nativeLang: string): string[] => [
  `CHUNKS (the learner hears each ${nativeLang} chunk and must say its ${targetLang} version from memory):`,
  `- Each chunk is a pair: "target" (${targetLang}) and "native" (${nativeLang}) with exactly the same meaning.`,
  `- Joining all "target" chunks with single spaces must reproduce the ${targetLang} text exactly. Do not add, remove or change any word or punctuation mark.`,
  '- Cut after every period, question mark, exclamation mark, colon and semicolon.',
  '- Cut at every comma, even if the comma exists in only one of the two languages.',
  `- No chunk may have more than ${MAX_CHUNK_WORDS} words in either language.`,
  `- If a chunk has more than ${PREFERRED_MAX_CHUNK_WORDS} words, cut it where a new part of the sentence begins (a subordinate or relative clause, "and", a prepositional phrase), at the same point in both languages. Above ${MAX_CHUNK_WORDS} words this is mandatory; with ${PREFERRED_MAX_CHUNK_WORDS + 1} or ${MAX_CHUNK_WORDS} words, cut only if the result sounds natural in both languages.`,
  `- If the ${nativeLang} side of a chunk has fewer than ${MIN_CHUNK_WORDS} words, merge it with the next chunk (the last chunk merges with the previous one), unless the result would exceed ${MAX_CHUNK_WORDS} words. In a dialogue, an answer is merged with its question.`,
  `- If needed, rephrase the ${nativeLang} side (never the ${targetLang} side) so that every pair matches in meaning.`,
  '- Keep the chunks in text order.',
]

export const buildRetryNote = (problems: string[]): string | null =>
  problems.length
    ? `Your previous answer was rejected. Fix these problems:\n- ${problems.join('\n- ')}`
    : null

// ===========================================================================
// activation_phrase: texto coherente y correcto + trozos
// ===========================================================================

// Más palabras ICA -> más espacio para conectarlas con sentido.
export const getLengthRule = (wordCount: number): string => {
  if (wordCount <= 4) return '15-25 words'
  if (wordCount === 5) return '20-28 words'
  if (wordCount === 6) return '22-30 words'
  if (wordCount === 7) return '25-34 words'
  if (wordCount === 8) return '28-38 words'
  return '30-40 words'
}

// Frases más cortas en niveles bajos: más fáciles de recordar y de trocear.
export const getMaxSentenceWords = (level: string): number => {
  const normalized = String(level).toUpperCase().replace(/\s+/g, '')
  if (normalized.startsWith('PRE') || normalized === '0' || normalized === 'A0') return 8
  const key = normalized.slice(0, 2)
  const byLevel: Record<string, number> = { A1: 8, A2: 10, B1: 12, B2: 15, C1: 15, C2: 15 }
  return byLevel[key] ?? 12
}

export const ACTIVATION_SYSTEM_PROMPT =
  'You write short, coherent and grammatically perfect texts for language learners, and split them into speaking chunks. Always answer by calling the provided tool.'

export const activationTool = {
  name: 'report_activation_text',
  description: 'Return the learner text, its translation, the ICA words used and the speaking chunks',
  input_schema: {
    type: 'object',
    properties: {
      phrase: { type: 'string', description: 'Full text in the target language' },
      translation: { type: 'string', description: 'Full translation in the native language' },
      words_used: { type: 'array', items: { type: 'string' } },
      chunks: chunkSchema,
    },
    required: ['phrase', 'translation', 'words_used', 'chunks'],
  },
}

export type ActivationPromptInput = {
  words: string[]
  intendedMeanings: string[]
  targetLang: string
  nativeLang: string
  normalizedLevel: string
  levelDescription: string
  previousPhrase: string
  retryProblems: string[]
}

export const buildActivationPrompt = (input: ActivationPromptInput): string => {
  const {
    words,
    intendedMeanings,
    targetLang,
    nativeLang,
    normalizedLevel,
    levelDescription,
    previousPhrase,
    retryProblems,
  } = input
  const retryNote = buildRetryNote(retryProblems)
  const lengthRule = getLengthRule(words.length)
  const maxSentenceWords = getMaxSentenceWords(normalizedLevel)

  return [
    `Task: write a short original text in ${targetLang} for a language learner, translate it into ${nativeLang} and split it into speaking chunks.`,
    `Required ICA words: ${words.join(', ')}`,
    intendedMeanings.length
      ? `Intended meanings (${targetLang} -> ${nativeLang}): ${intendedMeanings.join('; ')}`
      : null,
    `Learner level: CEFR ${normalizedLevel}. ${levelDescription}`,
    '',
    'CONTENT:',
    '- Write 2 to 5 short sentences about ONE realistic everyday situation (same people, same place, same moment).',
    '- Every sentence must make sense on its own and describe something that could really happen. No absurd or contradictory details (for example, a desk in the bathroom).',
    '- Use every ICA word with its intended meaning, where it fits naturally. Never cram unrelated words into one sentence: give each idea its own sentence.',
    '- You may inflect, decline or conjugate the ICA words when grammar requires it.',
    '- Prefer things the learner could really say in daily life: first or second person, everyday spoken language.',
    `- Total length: ${lengthRule}. Maximum ${maxSentenceWords} words per sentence.`,
    '',
    'CORRECTNESS:',
    `- The ${targetLang} text must be grammatically perfect and sound native. Before answering, check cases, gender, agreement, verb forms, prepositions and word order.`,
    '- Write numbers in words, never in digits.',
    '- No abbreviations, parentheses, quotation marks, slashes or emojis.',
    `- Use simple punctuation only: periods, commas, question marks and exclamation marks (plus the opening marks ${nativeLang} requires). A short question-and-answer exchange is allowed.`,
    '',
    'TRANSLATION:',
    `- Translate into natural ${nativeLang} with exactly the same meaning. Do not add or drop information.`,
    '',
    ...buildChunkRules(targetLang, nativeLang),
    previousPhrase
      ? `\nForbidden previous text: ${JSON.stringify(previousPhrase)}\n- Write a clearly different text: different situation, or different opening and structure.`
      : null,
    retryNote ? `\n${retryNote}` : null,
    '',
    'Answer by calling the tool report_activation_text.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

// ===========================================================================
// split_phrase: divide un texto que ya existe, sin cambiarlo
// ===========================================================================

export const SPLIT_SYSTEM_PROMPT =
  'You split bilingual texts into aligned speaking chunks without changing the target text. Always answer by calling the provided tool.'

export const splitTool = {
  name: 'report_chunks',
  description: 'Return the aligned speaking chunks and whether the target text is correct',
  input_schema: {
    type: 'object',
    properties: {
      chunks: chunkSchema,
      target_is_correct: {
        type: 'boolean',
        description: 'false if the target text has grammar mistakes or makes no sense in real life',
      },
      problem: {
        type: 'string',
        description: 'Short explanation when target_is_correct is false',
      },
    },
    required: ['chunks', 'target_is_correct'],
  },
}

export type SplitPromptInput = {
  targetPhrase: string
  nativePhrase: string
  targetLang: string
  nativeLang: string
  retryProblems: string[]
}

export const buildSplitPrompt = (input: SplitPromptInput): string => {
  const { targetPhrase, nativePhrase, targetLang, nativeLang, retryProblems } = input
  const retryNote = buildRetryNote(retryProblems)
  return [
    `Task: split an existing ${targetLang} text and its ${nativeLang} translation into speaking chunks for a memory game.`,
    `${targetLang} text (keep it exactly as it is, even if it contains mistakes): ${JSON.stringify(targetPhrase)}`,
    `${nativeLang} translation: ${JSON.stringify(nativePhrase)}`,
    '',
    ...buildChunkRules(targetLang, nativeLang),
    '',
    `Also set "target_is_correct" to false if the ${targetLang} text has grammar mistakes or describes something that makes no sense in real life, and explain why in "problem" (in ${nativeLang}).`,
    retryNote ? `\n${retryNote}` : null,
    '',
    'Answer by calling the tool report_chunks.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

// ===========================================================================
// Palabras ICA flexionadas (tarea 6 del documento)
// El prompt nuevo permite flexionar (ruhig -> ruhigen, szkoła -> szkole).
// Una búsqueda exacta rechazaría frases correctas en alemán y polaco,
// así que se acepta la palabra exacta o una forma que comparta su raíz.
// ===========================================================================

const normalizeForMatch = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const getStem = (part: string): string => {
  if (part.length <= 4) return part.slice(0, 3)
  return part.slice(0, Math.max(4, part.length - 3))
}

export const containsIcaWord = (phrase: string, word: string): boolean => {
  const tokens = normalizeForMatch(phrase).split(' ').filter(Boolean)
  const parts = normalizeForMatch(word).split(' ').filter(Boolean)
  if (!parts.length) return false
  return parts.every((part) => {
    if (tokens.includes(part)) return true
    if (part.length <= 3) return false
    const stem = getStem(part)
    return tokens.some((token) => token.startsWith(stem))
  })
}

export const hasAllIcaWords = (phrase: string, words: string[]): boolean =>
  words.every((word) => containsIcaWord(phrase, word))

// ===========================================================================
// Flujos completos (con reintentos). La llamada a Anthropic se inyecta,
// para que Supabase y el modo prueba local usen exactamente el mismo flujo.
// ===========================================================================

export type AnthropicToolDefinition = {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export type AnthropicCall = (
  system: string,
  prompt: string,
  options: { maxTokens: number; temperature: number; tool: AnthropicToolDefinition },
) => Promise<{ text: string | null; toolInput: Record<string, unknown> | null }>

export type ActivationTextResult = {
  phrase: string
  translation: string
  words_used?: string[]
  chunks: Chunk[] | null // null = esta frase no entra en el desafío
}

export type SplitTextResult = {
  chunks: Chunk[] | null
  translation: string
  targetIsCorrect: boolean | null // null = no se pudo comprobar
  problem: string | null
}

// Misma regla que ya usa la función: si se parece un 80 % o más, es "la misma frase".
export const isTooSimilarText = (nextText: string, previousText: string): boolean => {
  const a = normalizeForMatch(nextText)
  const b = normalizeForMatch(previousText)
  if (!a || !b) return false
  if (a === b) return true
  const setA = new Set(a.split(' '))
  const setB = new Set(b.split(' '))
  let intersection = 0
  setA.forEach((token) => {
    if (setB.has(token)) intersection += 1
  })
  const union = new Set([...setA, ...setB]).size
  return union > 0 && intersection / union >= 0.8
}

const readActivationFields = (
  output: Record<string, unknown> | null,
): { phrase: string; translation: string; words_used?: string[] } | null => {
  if (!output) return null
  if (typeof output.phrase !== 'string' || typeof output.translation !== 'string') return null
  return {
    phrase: normalizeSpaces(output.phrase),
    translation: normalizeSpaces(output.translation),
    words_used: Array.isArray(output.words_used)
      ? output.words_used.filter((word): word is string => typeof word === 'string')
      : undefined,
  }
}

export async function generateActivationText(
  input: Omit<ActivationPromptInput, 'retryProblems'>,
  call: AnthropicCall,
): Promise<ActivationTextResult | null> {
  let result: ActivationTextResult | null = null
  let fallbackCandidate: ActivationTextResult | null = null
  let retryProblems: string[] = []
  // Antes había un solo intento si no había frase previa.
  const maxAttempts = input.previousPhrase ? 3 : 2

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const raw = await call(
      ACTIVATION_SYSTEM_PROMPT,
      buildActivationPrompt({ ...input, retryProblems }),
      { maxTokens: 1000, temperature: 0.2, tool: activationTool }, // Antes 260: con los trozos no cabe
    )

    const output = raw.toolInput ?? parseJsonObject(raw.text)
    const parsed = readActivationFields(output)
    if (!parsed) {
      retryProblems = ['The answer did not follow the required format.']
      continue
    }

    const chunks = sanitizeChunks(output?.chunks)
    const chunkProblems = chunks ? getChunkProblems(chunks) : ['The chunks are missing or invalid.']

    // La frase y la traducción se reconstruyen a partir de los trozos:
    // lo que ve el alumno es exactamente lo que se le pregunta en el desafío.
    const candidate: ActivationTextResult = chunks
      ? {
          phrase: joinChunks(chunks, 'target'),
          translation: joinChunks(chunks, 'native'),
          words_used: parsed.words_used,
          chunks: chunkProblems.length ? null : chunks,
        }
      : { ...parsed, chunks: null }

    if (!fallbackCandidate) fallbackCandidate = candidate

    const problems = [...chunkProblems]
    if (!hasAllIcaWords(candidate.phrase, input.words)) {
      problems.push('Some required ICA words are missing.')
    }
    if (input.previousPhrase && isTooSimilarText(candidate.phrase, input.previousPhrase)) {
      problems.push('The text is too similar to the forbidden previous text.')
    }

    if (!problems.length) {
      result = candidate
      break
    }
    retryProblems = problems
  }

  // Si ningún intento sale perfecto, se devuelve el primero, como hasta ahora.
  // Si sus trozos no son válidos, llega con chunks: null y esa frase no entrará en el desafío.
  return result || fallbackCandidate
}

export async function splitExistingText(
  input: Omit<SplitPromptInput, 'retryProblems'>,
  call: AnthropicCall,
): Promise<SplitTextResult> {
  const targetPhrase = normalizeSpaces(input.targetPhrase)
  const nativePhrase = normalizeSpaces(input.nativePhrase)
  let retryProblems: string[] = []

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await call(
      SPLIT_SYSTEM_PROMPT,
      buildSplitPrompt({ ...input, targetPhrase, nativePhrase, retryProblems }),
      { maxTokens: 900, temperature: 0, tool: splitTool },
    )

    const output = raw.toolInput ?? parseJsonObject(raw.text)
    const chunks = sanitizeChunks(output?.chunks)
    const problems = chunks
      ? getChunkProblems(chunks, targetPhrase)
      : ['The chunks are missing or invalid.']

    if (chunks && !problems.length) {
      return {
        chunks,
        // Si la IA ha retocado el lado nativo para alinear, se guarda esta versión.
        translation: joinChunks(chunks, 'native'),
        targetIsCorrect: output?.target_is_correct !== false,
        problem: typeof output?.problem === 'string' ? output.problem : null,
      }
    }
    retryProblems = problems
  }

  // Sin trozos válidos: la frase se guarda tal cual y no entra en el desafío.
  return { chunks: null, translation: nativePhrase, targetIsCorrect: null, problem: null }
}

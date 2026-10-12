import { describe, expect, it } from 'vitest'
import { buildReviewQuestions } from '@/modules/game/monthlyReview/questions'
import {
  isLowReviewScore,
  REVIEW_ROUND_SIZE,
  REVIEW_TOTAL_QUESTIONS,
  arrangeKinds,
  gradeOrder,
  gradeTyped,
  maxRunOf,
  rememberedOfTen,
  scoreRounds,
  splitAlternatives,
  totalScore,
  weakestRound,
  type ReviewAnswer,
  type ReviewPool,
  type ReviewPoolItem,
} from '@/modules/game/monthlyReview/rules'

/** A repeatable random generator (mulberry32). */
function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WORDS: Array<[string, string]> = [
  ['dom', 'casa'], ['kot', 'gato'], ['pies', 'perro'], ['woda', 'agua'], ['chleb', 'pan'],
  ['mleko', 'leche'], ['szkoła', 'escuela'], ['książka', 'libro'], ['miasto', 'ciudad'], ['drzewo', 'árbol'],
  ['okno', 'ventana'], ['drzwi', 'puerta'], ['stół', 'mesa'], ['krzesło', 'silla'], ['samochód', 'coche'],
  ['Ja jestem tutaj', 'yo estoy aquí'], ['dzień dobry', 'buenos días'], ['do widzenia', 'adiós'],
  ['bardzo dobrze', 'muy bien'], ['nie wiem', 'no lo sé'], ['kocham cię', 'te quiero'], ['dziękuję bardzo', 'muchas gracias'],
]
const PHRASES: Array<[string, string]> = [
  ['Mój dom jest bardzo duży', 'Mi casa es muy grande'],
  ['Dzisiaj idę do szkoły', 'Hoy voy a la escuela'],
  ['Czy masz ochotę na kawę', '¿Te apetece un café?'],
  ['Mieszkam w małym mieście', 'Vivo en una ciudad pequeña'],
  ['Lubię czytać wieczorem', 'Me gusta leer por la noche'],
  ['Jutro będzie ładna pogoda', 'Mañana hará buen tiempo'],
]

const toItems = (list: Array<[string, string]>, prefix: string): ReviewPoolItem[] =>
  list.map(([target, native], index) => ({ id: `${prefix}${index}`, target, native }))

const POOL: ReviewPool = { words: toItems(WORDS, 'w'), phrases: toItems(PHRASES, 'p') }

describe('Repaso del mes · puntuación', () => {
  it('redondea hacia arriba a la decena (86 % → 9, 74 % → 8)', () => {
    expect(rememberedOfTen(12, 14)).toBe(9) // 85,7 %
    expect(rememberedOfTen(10, 14)).toBe(8) // 71,4 %
    expect(rememberedOfTen(14, 14)).toBe(10)
    expect(rememberedOfTen(0, 14)).toBe(0)
    expect(rememberedOfTen(1, 14)).toBe(1)
    expect(rememberedOfTen(7, 10)).toBe(7)
    expect(rememberedOfTen(9, 10)).toBe(9)
    expect(rememberedOfTen(5, 0)).toBe(0)
  })

  it('suma por ronda y no cuenta lo que no se pudo escuchar', () => {
    const answers: ReviewAnswer[] = [
      { questionId: 'a', round: 'reading', wordId: null, verdict: 'correct', skipped: false },
      { questionId: 'b', round: 'reading', wordId: null, verdict: 'wrong', skipped: false },
      { questionId: 'c', round: 'listening', wordId: null, verdict: 'wrong', skipped: true },
      { questionId: 'd', round: 'listening', wordId: null, verdict: 'almost', skipped: false },
      { questionId: 'e', round: 'writing', wordId: null, verdict: 'correct', skipped: false },
    ]
    const scores = scoreRounds(answers)
    expect(scores.reading).toEqual({ correct: 1, total: 2 })
    expect(scores.listening).toEqual({ correct: 1, total: 1 })
    expect(scores.writing).toEqual({ correct: 1, total: 1 })
    expect(totalScore(scores)).toEqual({ correct: 3, total: 4 })
    expect(weakestRound(scores)).toBe('reading')
  })

  it('no señala ronda floja si todo está perfecto', () => {
    const perfect = scoreRounds([{ questionId: 'a', round: 'writing', wordId: null, verdict: 'correct', skipped: false }])
    expect(weakestRound(perfect)).toBeNull()
  })
})

describe('Repaso del mes · corrección', () => {
  it('no cuentan tildes ni mayúsculas y la «ł» vale «l»', () => {
    expect(gradeTyped('SZKOŁA', ['szkoła'])).toBe('correct')
    expect(gradeTyped('szkola', ['szkoła'])).toBe('correct')
    expect(gradeTyped('Árbol', ['arbol'])).toBe('correct')
    expect(gradeTyped('  ventana ', ['ventana'])).toBe('correct')
  })

  it('una sola letra mal en una palabra de 6 o más letras es «¡Casi!»', () => {
    expect(gradeTyped('ventena', ['ventana'])).toBe('almost')
    expect(gradeTyped('ventan', ['ventana'])).toBe('almost')
    expect(gradeTyped('ventanas', ['ventana'])).toBe('almost')
  })

  it('en palabras cortas, una letra mal es fallo', () => {
    expect(gradeTyped('cosa', ['casa'])).toBe('wrong')
    expect(gradeTyped('pan', ['pen'])).toBe('wrong')
  })

  it('dos letras mal o vacío es fallo', () => {
    expect(gradeTyped('ventono', ['ventana'])).toBe('wrong')
    expect(gradeTyped('', ['ventana'])).toBe('wrong')
  })

  it('acepta cualquiera de los sinónimos', () => {
    expect(splitAlternatives('casa / hogar')).toEqual(['casa', 'hogar'])
    expect(splitAlternatives('aquí, acá (lugar)')).toEqual(['aquí', 'acá'])
    expect(gradeTyped('hogar', splitAlternatives('casa / hogar'))).toBe('correct')
  })

  it('ordenar: vale si las fichas, en orden, dicen la frase', () => {
    expect(gradeOrder(['Mój', 'dom', 'jest'], ['Mój', 'dom', 'jest'])).toBe('correct')
    expect(gradeOrder(['dom', 'Mój', 'jest'], ['Mój', 'dom', 'jest'])).toBe('wrong')
  })
})

describe('Repaso del mes · secuencia', () => {
  it('ningún tipo se repite más de dos veces seguidas', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const order = arrangeKinds(['a', 'a', 'b', 'b', 'c', 'c'], [], seeded(seed))
      expect(maxRunOf(order, (kind) => kind)).toBeLessThanOrEqual(2)
    }
  })

  it('con un tipo dominante busca la mejor mezcla posible', () => {
    const order = arrangeKinds(['w', 'w', 'w', 'w', 'c', 'c'], [], seeded(3))
    expect(maxRunOf(order, (kind) => kind)).toBeLessThanOrEqual(2)
  })

  it('cuenta también el final de la ronda anterior', () => {
    const order = arrangeKinds(['a', 'a', 'b'], ['a', 'a'], seeded(5))
    expect(order[0]).toBe('b')
  })
})

describe('Repaso del mes · las 14 preguntas', () => {
  it('son 14: 4 de lectura, 4 de escucha y 6 de escritura, en ese orden', () => {
    const questions = buildReviewQuestions(POOL, seeded(7))
    expect(questions).toHaveLength(REVIEW_TOTAL_QUESTIONS)
    expect(questions.slice(0, 4).every((question) => question.round === 'reading')).toBe(true)
    expect(questions.slice(4, 8).every((question) => question.round === 'listening')).toBe(true)
    expect(questions.slice(8).every((question) => question.round === 'writing')).toBe(true)
    expect(questions.filter((question) => question.round === 'reading')).toHaveLength(REVIEW_ROUND_SIZE.reading)
    expect(questions.filter((question) => question.round === 'writing')).toHaveLength(REVIEW_ROUND_SIZE.writing)
  })

  it('la lectura se elige, la escritura se escribe y la escucha mezcla las dos', () => {
    const questions = buildReviewQuestions(POOL, seeded(11))
    expect(questions.filter((question) => question.round === 'reading').every((question) => question.mode === 'choice')).toBe(true)
    expect(questions.filter((question) => question.round === 'writing').every((question) => question.mode !== 'choice')).toBe(true)
    const kinds = questions.filter((question) => question.round === 'listening').map((question) => question.kind).sort()
    expect(kinds).toEqual(['listen-meaning', 'listen-meaning', 'listen-write', 'listen-write'])
  })

  it('nunca hay más de dos del mismo tipo seguidas (en muchas partidas)', () => {
    for (let seed = 1; seed <= 80; seed += 1) {
      const questions = buildReviewQuestions(POOL, seeded(seed))
      expect(maxRunOf(questions, (question) => question.kind)).toBeLessThanOrEqual(2)
    }
  })

  it('cada pregunta de elegir tiene 3 opciones distintas y la buena está dentro', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const question of buildReviewQuestions(POOL, seeded(seed))) {
        if (question.mode !== 'choice') continue
        expect(question.options).toHaveLength(3)
        expect(new Set(question.options.map((option) => option.toLowerCase())).size).toBe(3)
        expect(question.correctIndex).toBeGreaterThanOrEqual(0)
        expect(question.options[question.correctIndex]).toBeTruthy()
      }
    }
  })

  it('«Completa tu frase» deja un hueco y la opción buena lo rellena', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const question of buildReviewQuestions(POOL, seeded(seed))) {
        if (question.kind !== 'cloze') continue
        expect(question.stem).toContain('____')
        const filled = question.stem.replace('____', question.options[question.correctIndex])
        expect(filled).toBe(question.target)
      }
    }
  })

  it('«Completa tu expresión» tapa una palabra de una expresión de varias palabras', () => {
    const question = buildReviewQuestions(POOL, seeded(2)).find((item) => item.kind === 'complete-expression')
    expect(question).toBeDefined()
    if (!question || question.mode !== 'type') return
    expect(question.shown).toContain('____')
    expect(question.target.split(' ').length).toBeGreaterThanOrEqual(2)
    expect(gradeTyped(question.accepted[0], question.accepted)).toBe('correct')
  })

  it('«Completa la palabra» enseña la primera y la última letra sin decir cuántas faltan', () => {
    const question = buildReviewQuestions(POOL, seeded(4)).find((item) => item.kind === 'complete-word')
    expect(question).toBeDefined()
    if (!question || question.mode !== 'type') return
    const letters = Array.from(question.target)
    expect(question.shown).toBe(`${letters[0]}…${letters[letters.length - 1]}`)
  })

  it('«Ordena tu frase» baraja las fichas de una frase y no empieza resuelta', () => {
    const question = buildReviewQuestions(POOL, seeded(9)).find((item) => item.kind === 'order-phrase')
    expect(question).toBeDefined()
    if (!question || question.mode !== 'order') return
    expect([...question.tiles].sort()).toEqual([...question.solution].sort())
    expect(question.tiles.join(' ')).not.toBe(question.solution.join(' '))
  })

  it('no repite la misma palabra ni la misma frase en dos preguntas', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const questions = buildReviewQuestions(POOL, seeded(seed))
      const targets = questions.map((question) => question.target)
      expect(new Set(targets).size).toBe(targets.length)
    }
  })

  it('con menos de 2 frases, las preguntas de frase pasan a ser de palabras', () => {
    const noPhrases: ReviewPool = { words: POOL.words, phrases: [] }
    const one: ReviewPool = { words: POOL.words, phrases: POOL.phrases.slice(0, 1) }
    for (const pool of [noPhrases, one]) {
      const questions = buildReviewQuestions(pool, seeded(13))
      expect(questions).toHaveLength(REVIEW_TOTAL_QUESTIONS)
      expect(questions.every((question) => question.source === 'word')).toBe(true)
      expect(questions.some((question) => question.kind === 'cloze' || question.kind === 'order-phrase')).toBe(false)
      expect(maxRunOf(questions, (question) => question.kind)).toBeLessThanOrEqual(2)
    }
  })

  it('aunque no haya expresiones, siguen saliendo 14 preguntas', () => {
    const onlySingles: ReviewPool = {
      words: toItems(WORDS.filter(([target]) => !target.includes(' ')), 'w'),
      phrases: [],
    }
    const questions = buildReviewQuestions(onlySingles, seeded(21))
    expect(questions).toHaveLength(REVIEW_TOTAL_QUESTIONS)
    expect(maxRunOf(questions, (question) => question.kind)).toBeLessThanOrEqual(2)
  })

  it('las palabras falladas se pueden potenciar: las de palabra llevan su id, las frases no', () => {
    const questions = buildReviewQuestions(POOL, seeded(17))
    for (const question of questions) {
      if (question.source === 'phrase') expect(question.wordId).toBeNull()
      else expect(question.wordId).toMatch(/^w\d+$/)
    }
  })

  it('con la misma semilla sale la misma partida', () => {
    const first = buildReviewQuestions(POOL, seeded(99)).map((question) => question.id + question.target)
    const second = buildReviewQuestions(POOL, seeded(99)).map((question) => question.id + question.target)
    expect(second).toEqual(first)
  })
})

describe('low score', () => {
  it('is 4 out of 10 or less', () => {
    expect(isLowReviewScore(4)).toBe(true)
    expect(isLowReviewScore(0)).toBe(true)
    expect(isLowReviewScore(5)).toBe(false)
    expect(isLowReviewScore(10)).toBe(false)
  })
})

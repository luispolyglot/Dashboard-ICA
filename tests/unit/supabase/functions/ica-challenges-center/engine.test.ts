import { describe, expect, it } from 'vitest'
import {
  activeSinceDay,
  isRecentlyActive,
  summarizeChallengeActivity,
  boardIndices,
  boardStart,
  buildModeSettings,
  buildQuestion,
  checkMixedAllowed,
  decideResult,
  evaluatePairsBoard,
  evaluateResponse,
  firstLetterHint,
  generateQuestions,
  isAnswerInTime,
  isCardEligible,
  isPendingQuestionStale,
  isRoundFinished,
  isSimilarOptionShape,
  levelFromTracker,
  levelGap,
  locateInPhrase,
  nextTurnUserId,
  normalizeTyped,
  optionWordCount,
  pickPromptCards,
  readGameState,
  readModeSettings,
  readPairMatches,
  wordsMissingToJoin,
  MIN_WORDS_TO_JOIN,
  type EngineCard,
  type SecretAnswer,
} from '../../../../../supabase/functions/ica-challenges-center/engine'

function seededRng(seed = 42) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

let cardCounter = 0
function card(target: string, native: string, extra: Partial<EngineCard> = {}): EngineCard {
  cardCounter += 1
  return {
    id: `card-${cardCounter}`,
    ownerUserId: 'user-a',
    target,
    native,
    examplePhrase: null,
    exampleTranslation: null,
    ...extra,
  }
}

function secret(target: string, accepted: string[] = []): SecretAnswer {
  return {
    cardId: 'x',
    ownerUserId: 'user-a',
    target,
    native: 'n',
    correctOptionIndex: null,
    accepted,
    phrase: null,
    phraseTranslation: null,
  }
}

const POLISH_POOL = [
  card('samochód', 'coche'),
  card('pies', 'perro'),
  card('kot', 'gato'),
  card('dom', 'casa'),
  card('książka', 'libro'),
  card('jabłko', 'manzana'),
]

describe('normalizeTyped', () => {
  it('ignora mayúsculas, espacios y puntuación de los bordes, pero respeta las tildes', () => {
    expect(normalizeTyped('  Samochód. ')).toBe('samochód')
    expect(normalizeTyped('¿Qué?')).toBe('qué')
    expect(normalizeTyped('samochod')).not.toBe(normalizeTyped('samochód'))
  })
})

describe('Escribe la palabra: corrección', () => {
  it('da por buena la palabra exacta, sin importar mayúsculas', () => {
    const answer = secret('samochód', ['samochód'])
    expect(evaluateResponse({ kind: 'write', answer, response: { text: 'Samochód' }, language: 'Polaco' })).toBe(true)
  })

  it('exige las tildes y letras especiales (el alumno usa el teclado del idioma)', () => {
    const answer = secret('jabłko', ['jabłko'])
    expect(evaluateResponse({ kind: 'write', answer, response: { text: 'jablko' }, language: 'Polaco' })).toBe(false)
  })

  it('acepta la palabra con o sin artículo', () => {
    const question = buildQuestion({
      kind: 'write',
      card: card('der Hund', 'perro'),
      optionPool: [],
      language: 'Alemán',
    })
    expect(question).not.toBeNull()
    const answer = question!.answer
    expect(evaluateResponse({ kind: 'write', answer, response: { text: 'Hund' }, language: 'Alemán' })).toBe(true)
    expect(evaluateResponse({ kind: 'write', answer, response: { text: 'der hund' }, language: 'Alemán' })).toBe(true)
    expect(evaluateResponse({ kind: 'write', answer, response: { text: 'Hunde' }, language: 'Alemán' })).toBe(false)
  })

  it('acepta cualquiera de las formas guardadas y los sinónimos del baúl', () => {
    const coche = card('samochód', 'coche')
    const cocheSynonym = card('auto', 'coche')
    const question = buildQuestion({
      kind: 'write',
      card: coche,
      optionPool: [coche, cocheSynonym, ...POLISH_POOL],
      language: 'Polaco',
    })!
    expect(evaluateResponse({ kind: 'write', answer: question.answer, response: { text: 'auto' }, language: 'Polaco' })).toBe(true)

    const slashed = buildQuestion({ kind: 'write', card: card('ciężarówka / tir', 'camión'), optionPool: [], language: 'Polaco' })!
    expect(evaluateResponse({ kind: 'write', answer: slashed.answer, response: { text: 'tir' }, language: 'Polaco' })).toBe(true)
  })

  it('una respuesta vacía nunca es correcta', () => {
    expect(evaluateResponse({ kind: 'write', answer: secret('pies', ['pies']), response: { text: '   ' }, language: 'Polaco' })).toBe(false)
  })

  it('solo entran palabras sueltas (el artículo no cuenta) y la pista es la primera letra', () => {
    expect(isCardEligible('write', card('der Hund', 'perro'), 'Alemán')).toBe(true)
    expect(isCardEligible('write', card('Guten Morgen', 'buenos días'), 'Alemán')).toBe(false)
    expect(firstLetterHint('der Hund', 'Alemán')).toBe('H…')
    expect(firstLetterHint('łyżka', 'Polaco')).toBe('ł…')
  })
})

describe('Dilo en voz alta: corrección', () => {
  const answer = secret('samochód', ['samochód'])

  it('encuentra la palabra dentro de lo que ha entendido el micrófono, sin tildes', () => {
    expect(evaluateResponse({ kind: 'speak', answer, response: { transcripts: ['to jest samochod'] }, language: 'Polaco' })).toBe(true)
  })

  it('no acepta otra forma de la palabra ni un número cualquiera', () => {
    expect(evaluateResponse({ kind: 'speak', answer, response: { transcripts: ['samochodem'] }, language: 'Polaco' })).toBe(false)
    expect(evaluateResponse({ kind: 'speak', answer, response: { transcripts: ['5'] }, language: 'Polaco' })).toBe(false)
  })

  it('funciona con expresiones de varias palabras y mira todas las alternativas', () => {
    const phrase = secret('dzień dobry', ['dzień dobry'])
    expect(
      evaluateResponse({ kind: 'speak', answer: phrase, response: { transcripts: ['dzień do bry', 'Dzień dobry!'] }, language: 'Polaco' }),
    ).toBe(true)
  })
})

describe('Tipo test y Escucha y elige', () => {
  it('construye 4 opciones distintas y nunca dos respuestas buenas', () => {
    const coche = card('samochód', 'coche')
    const cocheSynonym = card('auto', 'coche')
    const pool = [coche, cocheSynonym, ...POLISH_POOL]
    for (let seed = 1; seed < 30; seed += 1) {
      const question = buildQuestion({ kind: 'choice', card: coche, optionPool: pool, language: 'Polaco', rng: seededRng(seed) })!
      expect(question.question.kind).toBe('choice')
      if (question.question.kind !== 'choice') return
      expect(question.question.prompt).toBe('coche')
      expect(new Set(question.question.options).size).toBe(4)
      expect(question.question.options[question.answer.correctOptionIndex!]).toBe('samochód')
      expect(question.question.options).not.toContain('auto')
    }
  })

  it('en Escucha y elige suena la palabra y las opciones son significados', () => {
    const question = buildQuestion({ kind: 'listen', card: POLISH_POOL[1], optionPool: POLISH_POOL, language: 'Polaco', rng: seededRng(3) })!
    if (question.question.kind !== 'listen') throw new Error('kind')
    expect(question.question.audioText).toBe('pies')
    expect(question.question.options[question.answer.correctOptionIndex!]).toBe('perro')
    expect(evaluateResponse({ kind: 'listen', answer: question.answer, response: { optionIndex: question.answer.correctOptionIndex }, language: 'Polaco' })).toBe(true)
    expect(evaluateResponse({ kind: 'listen', answer: question.answer, response: { optionIndex: null }, language: 'Polaco' })).toBe(false)
  })

  it('no puede hacerse con menos de 4 palabras', () => {
    const result = generateQuestions({ kind: 'choice', pools: [POLISH_POOL.slice(0, 3)], count: 10, language: 'Polaco' })
    expect(result.ok).toBe(false)
  })
})

describe('Lectura y Escucha: opciones con la misma forma', () => {
  const singles = [
    card('pies', 'perro'),
    card('kot', 'gato'),
    card('dom', 'casa'),
    card('książka', 'libro'),
    card('jabłko', 'manzana'),
    card('woda', 'agua'),
  ]
  const expressions = [
    card('dzień dobry', 'buenos días'),
    card('na pewno', 'seguro que sí'),
    card('mieć ochotę na', 'tener ganas de'),
    card('trzymać kciuki', 'cruzar los dedos'),
    card('bez sensu', 'no tiene sentido'),
  ]
  const pool = [...singles, ...expressions]

  it('cuenta las palabras como se ven', () => {
    expect(optionWordCount('der Hund')).toBe(2)
    expect(optionWordCount('samochód / auto')).toBe(2)
    expect(optionWordCount("l'homme")).toBe(1)
    expect(optionWordCount('mieć ochotę na')).toBe(3)
    expect(isSimilarOptionShape(1, 1)).toBe(true)
    expect(isSimilarOptionShape(1, 2)).toBe(false)
    expect(isSimilarOptionShape(3, 4)).toBe(true)
    expect(isSimilarOptionShape(3, 1)).toBe(false)
    expect(isSimilarOptionShape(2, 4)).toBe(false)
  })

  it('si la respuesta es una palabra, las 4 opciones son de una palabra', () => {
    for (let seed = 1; seed < 40; seed += 1) {
      const question = buildQuestion({ kind: 'choice', card: singles[0], optionPool: pool, language: 'Polaco', rng: seededRng(seed) })!
      if (question.question.kind !== 'choice') throw new Error('kind')
      expect(question.question.options.every((option) => optionWordCount(option) === 1)).toBe(true)
    }
  })

  it('si la respuesta son varias palabras, las opciones también (una de diferencia como mucho)', () => {
    for (let seed = 1; seed < 40; seed += 1) {
      const question = buildQuestion({ kind: 'listen', card: expressions[1], optionPool: pool, language: 'Polaco', rng: seededRng(seed) })!
      if (question.question.kind !== 'listen') throw new Error('kind')
      const answerWords = optionWordCount('seguro que sí')
      for (const option of question.question.options) {
        const words = optionWordCount(option)
        expect(words).toBeGreaterThanOrEqual(2)
        expect(Math.abs(words - answerWords)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('si el baúl no tiene bastantes parecidas, sigue habiendo 4 opciones', () => {
    const small = [expressions[0], ...singles.slice(0, 4)]
    const question = buildQuestion({ kind: 'choice', card: expressions[0], optionPool: small, language: 'Polaco', rng: seededRng(2) })
    expect(question).not.toBeNull()
    if (question?.question.kind !== 'choice') throw new Error('kind')
    expect(new Set(question.question.options).size).toBe(4)
  })

  it('en Lectura y Escucha van primero las palabras sueltas', () => {
    const manySingles = Array.from({ length: 12 }, (_, i) => card(`słowo${i}`, `palabra${i}`))
    const manyExpressions = Array.from({ length: 12 }, (_, i) => card(`dwa słowa${i}`, `dos palabras${i}`))
    for (const kind of ['choice', 'listen'] as const) {
      const result = pickPromptCards({ kind, pools: [[...manyExpressions, ...manySingles]], count: 10, language: 'Polaco', rng: seededRng(4) })
      if (!result.ok) throw new Error('no')
      expect(result.cards.every((item) => optionWordCount(item.target) === 1)).toBe(true)
    }
  })

  it('la prioridad respeta la mezcla 5 + 5 de los dos baúles', () => {
    const mine = [...Array.from({ length: 6 }, (_, i) => card(`a b${i}`, `x y${i}`, { ownerUserId: 'me' })), ...Array.from({ length: 6 }, (_, i) => card(`moje${i}`, `mía${i}`, { ownerUserId: 'me' }))]
    const theirs = Array.from({ length: 12 }, (_, i) => card(`jego${i}`, `suya${i}`, { ownerUserId: 'rival' }))
    const result = pickPromptCards({ kind: 'choice', pools: [mine, theirs], count: 10, language: 'Polaco', rng: seededRng(6) })
    if (!result.ok) throw new Error('no')
    expect(result.cards.filter((item) => item.ownerUserId === 'me')).toHaveLength(5)
    expect(result.cards.every((item) => optionWordCount(item.target) === 1)).toBe(true)
  })
})

describe('Completa la frase', () => {
  it('encuentra la palabra aunque esté declinada', () => {
    const gap = locateInPhrase('Jadę samochodem do pracy.', 'samochód', 'Polaco')
    expect(gap).toEqual({ before: 'Jadę ', answer: 'samochodem', after: ' do pracy.' })
  })

  it('encuentra la palabra exacta y respeta el artículo', () => {
    const gap = locateInPhrase('Der Hund bellt jeden Morgen.', 'der Hund', 'Alemán')
    expect(gap?.answer).toBe('Der Hund')
  })

  it('no se inventa huecos: palabras cortas solo exactas y siempre con contexto', () => {
    expect(locateInPhrase('To jest kotek.', 'kot', 'Polaco')).toBeNull()
    expect(locateInPhrase('Samochód.', 'samochód', 'Polaco')).toBeNull()
    expect(locateInPhrase(null, 'samochód', 'Polaco')).toBeNull()
  })

  it('las opciones son palabras ICA y la frase no enseña la solución', () => {
    const withPhrase = card('samochód', 'coche', { examplePhrase: 'Jadę samochodem do pracy.' })
    const question = buildQuestion({ kind: 'cloze', card: withPhrase, optionPool: [withPhrase, ...POLISH_POOL], language: 'Polaco', rng: seededRng(9) })!
    if (question.question.kind !== 'cloze') throw new Error('kind')
    expect(question.question.before + question.question.after).not.toContain('samochod')
    expect(question.question.options[question.answer.correctOptionIndex!]).toBe('samochód')
  })
})

describe('Elegir palabras: cada uno las suyas o mezcla de baúles', () => {
  const mine = Array.from({ length: 12 }, (_, i) => card(`moje${i}`, `mía${i}`, { ownerUserId: 'me' }))
  const theirs = Array.from({ length: 12 }, (_, i) => card(`jego${i}`, `suya${i}`, { ownerUserId: 'rival' }))

  it('mezcla 5 palabras de cada baúl', () => {
    const result = pickPromptCards({ kind: 'choice', pools: [mine, theirs], count: 10, language: 'Polaco', rng: seededRng(5) })
    if (!result.ok) throw new Error('no')
    expect(result.cards).toHaveLength(10)
    expect(result.cards.filter((item) => item.ownerUserId === 'me')).toHaveLength(5)
    expect(result.cards.filter((item) => item.ownerUserId === 'rival')).toHaveLength(5)
    expect(new Set(result.cards.map((item) => item.id)).size).toBe(10)
  })

  it('si a un baúl le faltan palabras, completa con el otro', () => {
    const result = pickPromptCards({ kind: 'choice', pools: [mine.slice(0, 2), theirs], count: 10, language: 'Polaco', rng: seededRng(5) })
    if (!result.ok) throw new Error('no')
    expect(result.cards.filter((item) => item.ownerUserId === 'me')).toHaveLength(2)
    expect(result.cards.filter((item) => item.ownerUserId === 'rival')).toHaveLength(8)
  })

  it('una palabra que está en los dos baúles solo sale una vez', () => {
    const shared = [card('pies', 'perro', { ownerUserId: 'me' }), ...mine.slice(0, 4)]
    const sharedRival = [card('pies', 'perro', { ownerUserId: 'rival' }), ...theirs.slice(0, 4)]
    const result = pickPromptCards({ kind: 'choice', pools: [shared, sharedRival], count: 10, language: 'Polaco', rng: seededRng(1) })
    if (!result.ok) throw new Error('no')
    const uniqueTargets = new Set(result.cards.map((item) => item.target))
    expect(uniqueTargets.size).toBe(9)
  })

  it('genera 10 preguntas mezcladas para el mismo desafío', () => {
    const result = generateQuestions({ kind: 'write', pools: [mine, theirs], count: 10, language: 'Polaco', rng: seededRng(8) })
    if (!result.ok) throw new Error('no')
    expect(result.questions).toHaveLength(10)
    expect(result.questions.every((item) => item.question.kind === 'write')).toBe(true)
  })
})

describe('Nivel real y distancia', () => {
  it('calcula el nivel como la barra de progreso', () => {
    // Polaco: B2+ empieza en 2460 y C1 en 3090 palabras
    expect(
      levelFromTracker(
        { start_level: 'B1', prior_ica_words: 1000, activation_words_total: 692, confirmed_at: '2026-01-01' },
        'Polaco',
      ),
    ).toBe('B2+')
    expect(levelFromTracker({ start_level: 'A1', confirmed_at: null }, 'Polaco')).toBeNull()
  })

  it('cuenta escalones entre niveles', () => {
    expect(levelGap('A1', 'B1')).toBe(4)
    expect(levelGap('B2+', 'B2+')).toBe(0)
    expect(levelGap(null, 'B1')).toBeNull()
  })

  it('permite la mezcla de baúles hasta 3 escalones', () => {
    expect(checkMixedAllowed({ myLevel: 'A2', rivalLevel: 'B1+', maxGap: 3 }).allowed).toBe(true)
    expect(checkMixedAllowed({ myLevel: 'A1', rivalLevel: 'B2', maxGap: 3 }).allowed).toBe(false)
    expect(checkMixedAllowed({ myLevel: 'A1', rivalLevel: null, maxGap: 3 }).allowed).toBe(false)
  })
})

describe('Configuración, tiempo, rondas y turnos', () => {
  it('lee la configuración de los desafíos creados antes del cambio', () => {
    const settings = readModeSettings('ica-own-words', { mode: 'own_words_quiz', rounds: 5, responseSeconds: 4 })!
    expect(settings.kind).toBe('choice')
    expect(settings.questionsPerRound).toBe(2)
    expect(settings.secondsPerQuestion).toBe(4)
    expect(settings.wordSource).toBe('own')
  })

  it('el Modo Relámpago dura 60 segundos y Escribe la palabra 7 por palabra', () => {
    const lightning = buildModeSettings({ typeId: 'ica-lightning', typeConfig: {}, rounds: 2, responseSeconds: 5, wordSource: 'mixed' })!
    expect(lightning.format).toBe('lightning')
    expect(lightning.sessionSeconds).toBe(60)
    const writing = buildModeSettings({ typeId: 'ica-writing', typeConfig: { secondsPerQuestion: 7 }, rounds: 2, responseSeconds: 3, wordSource: 'own' })!
    expect(writing.secondsPerQuestion).toBe(7)
    expect(buildModeSettings({ typeId: 'ica-streak-battle', typeConfig: {}, rounds: 2, responseSeconds: 5, wordSource: 'own' })).toBeNull()
  })

  it('rechaza respuestas fuera de tiempo', () => {
    const settings = buildModeSettings({ typeId: 'ica-writing', typeConfig: {}, rounds: 2, responseSeconds: 5, wordSource: 'own' })!
    expect(isAnswerInTime({ settings, servedAtMs: 0, nowMs: 6000, clientMs: 5000, sessionEndsAtMs: null })).toBe(true)
    expect(isAnswerInTime({ settings, servedAtMs: 0, nowMs: 6000, clientMs: 9000, sessionEndsAtMs: null })).toBe(false)
    expect(isAnswerInTime({ settings, servedAtMs: 0, nowMs: 20000, clientMs: 3000, sessionEndsAtMs: null })).toBe(false)
    expect(isPendingQuestionStale({ settings, servedAtMs: 0, nowMs: 60000 })).toBe(true)

    const lightning = buildModeSettings({ typeId: 'ica-lightning', typeConfig: {}, rounds: 1, responseSeconds: 5, wordSource: 'own' })!
    expect(isAnswerInTime({ settings: lightning, servedAtMs: 0, nowMs: 59000, clientMs: null, sessionEndsAtMs: 60000 })).toBe(true)
    expect(isAnswerInTime({ settings: lightning, servedAtMs: 0, nowMs: 65000, clientMs: null, sessionEndsAtMs: 60000 })).toBe(false)
  })

  it('pasa el turno al acabar cada ronda', () => {
    const settings = buildModeSettings({ typeId: 'ica-listen', typeConfig: {}, rounds: 2, responseSeconds: 5, wordSource: 'own' })!
    expect(isRoundFinished(settings, 4)).toBe(false)
    expect(isRoundFinished(settings, 5)).toBe(true)
    expect(isRoundFinished(settings, 10)).toBe(true)
    expect(nextTurnUserId({ me: 'a', rival: 'b', meDone: false, rivalDone: false })).toBe('b')
    expect(nextTurnUserId({ me: 'a', rival: 'b', meDone: false, rivalDone: true })).toBe('a')
    expect(nextTurnUserId({ me: 'a', rival: 'b', meDone: true, rivalDone: true })).toBeNull()
  })

  it('entiende el progreso guardado con el formato antiguo', () => {
    const state = readGameState({ ownWords: { completedAt: '2026-09-20T10:00:00Z', score: 7, answeredQuestions: 10 } })
    expect(state.completedAt).toBe('2026-09-20T10:00:00Z')
    expect(state.correct).toBe(7)
  })
})

describe('Mínimo de palabras para entrar en los retos', () => {
  it('hacen falta 20 palabras en el baúl', () => {
    expect(MIN_WORDS_TO_JOIN).toBe(20)
    expect(wordsMissingToJoin(0)).toBe(20)
    expect(wordsMissingToJoin(12)).toBe(8)
    expect(wordsMissingToJoin(20)).toBe(0)
    expect(wordsMissingToJoin(350)).toBe(0)
    expect(wordsMissingToJoin(Number.NaN)).toBe(20)
  })
})

describe('Parejas', () => {
  const pool = Array.from({ length: 14 }, (_, i) => card(`słowo${i}`, `palabra${i}`))

  it('monta 2 tableros de 5 parejas sin significados repetidos en un tablero', () => {
    const withSynonym = [...pool, card('auto', 'palabra0')]
    for (let seed = 1; seed < 25; seed += 1) {
      const result = generateQuestions({ kind: 'pairs', pools: [withSynonym], count: 10, language: 'Polaco', rng: seededRng(seed) })
      if (!result.ok) throw new Error('no')
      expect(result.questions).toHaveLength(10)
      for (const start of [0, 5]) {
        const board = result.questions.slice(start, start + 5)
        const first = board[0].question
        if (first.kind !== 'pairs') throw new Error('kind')
        expect(first.words).toHaveLength(5)
        expect(new Set(first.options).size).toBe(5)
        board.forEach((item, position) => {
          if (item.question.kind !== 'pairs') throw new Error('kind')
          // Todas las parejas del tablero comparten el mismo tablero…
          expect(item.question.words).toEqual(first.words)
          // …y la solución de cada palabra es su significado.
          expect(first.words[position]).toBe(item.answer.target)
          expect(first.options[item.answer.correctOptionIndex!]).toBe(item.answer.native)
        })
      }
    }
  })

  it('necesita al menos 5 palabras distintas', () => {
    expect(generateQuestions({ kind: 'pairs', pools: [pool.slice(0, 4)], count: 10, language: 'Polaco' }).ok).toBe(false)
    expect(generateQuestions({ kind: 'pairs', pools: [pool.slice(0, 5)], count: 10, language: 'Polaco' }).ok).toBe(true)
  })

  it('las palabras muy largas no entran en el tablero', () => {
    expect(isCardEligible('pairs', card('pies', 'perro'), 'Polaco')).toBe(true)
    expect(isCardEligible('pairs', card('to jest bardzo długie wyrażenie', 'es una expresión muy larga'), 'Polaco')).toBe(false)
  })

  it('corrige el tablero entero y un significado no vale para dos palabras', () => {
    expect(readPairMatches([2, 2, '1', null, 9, 0])).toEqual([2, null, 1, null, null])
    const answers = [0, 1, 2, 3, 4].map((solution) => ({ ...secret('x'), correctOptionIndex: solution }))
    const board = evaluatePairsBoard({ answers, matches: [0, 1, 3, 2, null], inTime: true })
    expect(board.correct).toEqual([true, true, false, false, false])
    expect(board.solution).toEqual([0, 1, 2, 3, 4])
    expect(evaluatePairsBoard({ answers, matches: [0, 1, 2, 3, 4], inTime: false }).correct.every((ok) => !ok)).toBe(true)
  })

  it('cada tablero son 5 preguntas seguidas', () => {
    expect(boardStart(0)).toBe(0)
    expect(boardStart(7)).toBe(5)
    expect(boardIndices(5, 10)).toEqual([5, 6, 7, 8, 9])
  })

  it('se juega en 1 ronda (los 2 tableros) o en 2 (1 tablero cada una), con 40 s por tablero', () => {
    const two = buildModeSettings({ typeId: 'ica-pairs', typeConfig: { secondsPerQuestion: 40 }, rounds: 5, responseSeconds: null, wordSource: 'own' })!
    expect(two.kind).toBe('pairs')
    expect(two.rounds).toBe(2)
    expect(two.questionsPerRound).toBe(5)
    expect(two.secondsPerQuestion).toBe(40)
    const one = buildModeSettings({ typeId: 'ica-pairs', typeConfig: {}, rounds: 1, responseSeconds: null, wordSource: 'mixed' })!
    expect(one.questionsPerRound).toBe(10)
    expect(readModeSettings('ica-pairs', { rounds: 2, secondsPerQuestion: 40 })?.secondsPerQuestion).toBe(40)
    expect(isRoundFinished(two, 5)).toBe(true)
    expect(isRoundFinished(one, 5)).toBe(false)
  })

  it('si empatan, gana quien tardó menos', () => {
    expect(decideResult(8, 8, { challengerMs: 50000, challengedMs: 62000 })).toBe('challenger_win')
    expect(decideResult(8, 8, { challengerMs: 70000, challengedMs: 62000 })).toBe('challenged_win')
    expect(decideResult(8, 8, { challengerMs: 60000, challengedMs: 60000 })).toBe('draw')
    expect(decideResult(9, 8, { challengerMs: 90000, challengedMs: 10000 })).toBe('challenger_win')
    expect(decideResult(8, 8)).toBe('draw')
  })
})

describe('Lista de rivales: los que más juegan, su racha y quién está inactivo', () => {
  const now = Date.parse('2026-09-29T12:00:00Z')
  const day = (d: number) => new Date(now - d * 86400000).toISOString()
  const row = (a: string, b: string, status: string, resultType: string | null, winner: string | null, daysAgo: number) => ({
    challengerUserId: a, challengedUserId: b, status, resultType, winnerUserId: winner, finalizedAt: day(daysAgo), createdAt: day(daysAgo + 1),
  })

  it('cuenta los desafíos de los últimos 30 días y la racha de victorias seguidas', () => {
    const rows = [
      row('ana', 'x', 'completed', 'challenger_win', 'ana', 1),
      row('y', 'ana', 'completed', 'challenged_win', 'ana', 3),
      row('ana', 'z', 'completed', 'challenged_win', 'z', 5),
      row('ana', 'x', 'completed', 'challenger_win', 'ana', 8),
      row('ana', 'y', 'in_progress', null, null, 2),
      row('ana', 'y', 'cancelled', 'cancelled', null, 2),
      row('ana', 'x', 'completed', 'challenger_win', 'ana', 60),
    ]
    const summary = summarizeChallengeActivity(rows, 'ana', now)
    expect(summary.recentChallenges).toBe(5)
    expect(summary.winStreak).toBe(2)
    expect(summary.lastChallengeAtMs).toBe(Date.parse(day(1)))
    expect(summarizeChallengeActivity(rows, 'nadie', now)).toEqual({ recentChallenges: 0, winStreak: 0, lastChallengeAtMs: null })
  })

  it('30 días o más sin usar la app ni jugar = no sale en la lista', () => {
    expect(activeSinceDay(now)).toBe('2026-08-30')
    expect(isRecentlyActive({ lastAppActivityDay: '2026-09-20', lastChallengeAtMs: null, nowMs: now })).toBe(true)
    expect(isRecentlyActive({ lastAppActivityDay: '2026-08-20', lastChallengeAtMs: null, nowMs: now })).toBe(false)
    expect(isRecentlyActive({ lastAppActivityDay: null, lastChallengeAtMs: Date.parse(day(10)), nowMs: now })).toBe(true)
    expect(isRecentlyActive({ lastAppActivityDay: null, lastChallengeAtMs: null, nowMs: now })).toBe(false)
  })
})

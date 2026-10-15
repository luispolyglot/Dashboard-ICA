import { describe, expect, it } from 'vitest'
import { DAILY_GAME_MODES, DAILY_GAME_PASS, isDailyGamePassed } from '@/modules/game/dailyGame'

describe('reto del día', () => {
  it('tiene los modos de Desafíos ICA, Habla incluido', () => {
    expect(DAILY_GAME_MODES.map((mode) => mode.kind)).toEqual(['pairs', 'choice', 'write', 'listen', 'speak'])
  })

  it('solo cuenta como hecho con 5 aciertos o más', () => {
    expect(DAILY_GAME_PASS).toBe(5)
    expect(isDailyGamePassed(null)).toBe(false)
    expect(isDailyGamePassed({ correct: 4 })).toBe(false)
    expect(isDailyGamePassed({ correct: 5 })).toBe(true)
    expect(isDailyGamePassed({ correct: 10 })).toBe(true)
  })
})

import { reshuffleDailyGame } from '@/modules/game/dailyGame'
import { generatePairsQuestions, type GeneratedQuestion } from '../../../../supabase/functions/ica-challenges-center/engine'

function card(n: number) {
  return { id: `c${n}`, ownerUserId: 'me', target: `palabra${n}`, native: `word${n}`, phrase: null, phraseTranslation: null }
}

function seeded(seed: number) {
  let value = seed
  return () => {
    value = (value * 9301 + 49297) % 233280
    return value / 233280
  }
}

describe('repetir el reto del día', () => {
  it('Lectura: mismas palabras, otro orden, y cada respuesta sigue siendo la buena', () => {
    const questions: GeneratedQuestion[] = Array.from({ length: 10 }, (_, n) => ({
      kind: 'choice',
      question: { kind: 'choice', prompt: `palabra${n}`, options: [`word${n}`, 'a', 'b', 'c'] },
      answer: { cardId: `c${n}`, ownerUserId: 'me', target: `palabra${n}`, native: `word${n}`, correctOptionIndex: 0, accepted: [], phrase: null, phraseTranslation: null },
    }))
    const game = { mode: { kind: 'choice' as const, name: 'Lectura', pitch: '', icon: (() => null) as never }, questions }
    const next = reshuffleDailyGame(game, seeded(7))
    expect(next.questions.map((q) => q.answer.cardId).sort()).toEqual(questions.map((q) => q.answer.cardId).sort())
    expect(next.questions.map((q) => q.answer.cardId)).not.toEqual(questions.map((q) => q.answer.cardId))
    for (const q of next.questions) {
      if (q.question.kind !== 'choice') throw new Error('kind')
      expect(q.question.options[q.answer.correctOptionIndex as number]).toBe(q.answer.native)
    }
    expect(next.questions.some((q) => q.answer.correctOptionIndex !== 0)).toBe(true)
  })

  it('Parejas: cada palabra sigue unida a su significado', () => {
    const cards = Array.from({ length: 10 }, (_, n) => card(n))
    const questions = generatePairsQuestions({ picked: cards as never, pool: cards as never, count: 10, rng: seeded(3) })!
    const game = { mode: { kind: 'pairs' as const, name: 'Parejas', pitch: '', icon: (() => null) as never }, questions }
    const next = reshuffleDailyGame(game, seeded(11))
    expect(next.questions).toHaveLength(10)
    next.questions.forEach((q, index) => {
      if (q.question.kind !== 'pairs') throw new Error('kind')
      expect(q.question.words[index % 5]).toBe(q.answer.target)
      expect(q.question.options[q.answer.correctOptionIndex as number]).toBe(q.answer.native)
    })
  })
})

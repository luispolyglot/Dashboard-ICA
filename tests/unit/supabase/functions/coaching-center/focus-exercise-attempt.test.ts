import { describe, expect, it } from 'vitest'
import { evaluateCoachingFocusExerciseAttempt } from '../../../../../supabase/functions/_shared/coaching-focus-exercise'
import { COACHING_EXERCISE_TEMPLATE_EXAMPLE } from '../../../../../supabase/functions/_shared/coaching-exercise-template'

function validAnswers() {
  const blocks = COACHING_EXERCISE_TEMPLATE_EXAMPLE.bloques
  const recognize = blocks.find((block) => block.id === 'reconocer')!
  const build = blocks.find((block) => block.id === 'construir')!
  const conversation = blocks.find((block) => block.id === 'conversacion')!

  return [
    ...recognize.items.map((item, itemIndex) => ({
      block: 'reconocer',
      itemIndex,
      mine: item.options.find((option) => option.ok)!.t,
    })),
    ...build.items.flatMap((item, itemIndex) =>
      item.verbos.map((verb, unitIndex) => ({
        block: 'construir',
        itemIndex,
        unitIndex,
        mine: item.ejemplo,
      })),
    ),
    ...conversation.items.map((item, itemIndex) => ({
      block: 'conversacion',
      itemIndex,
      mine: item.show,
    })),
  ]
}

describe('evaluateCoachingFocusExerciseAttempt', () => {
  it('grades every submitted response against the stored exercise', () => {
    const evaluation = evaluateCoachingFocusExerciseAttempt({
      exercise: COACHING_EXERCISE_TEMPLATE_EXAMPLE,
      submittedAnswers: validAnswers(),
    })

    expect(evaluation.scoreTotal).toBe(15)
    expect(evaluation.scoreCorrect).toBe(15)
    expect(evaluation.scoreThreshold).toBe(12)
    expect(evaluation.passed).toBe(true)
  })

  it('does not trust a client-provided ok flag or claimed score', () => {
    const answers = validAnswers()
    const recognize = COACHING_EXERCISE_TEMPLATE_EXAMPLE.bloques.find(
      (block) => block.id === 'reconocer',
    )!

    for (const answer of answers.slice(0, recognize.items.length)) {
      const item = recognize.items[answer.itemIndex]
      answer.mine = item.options.find((option) => !option.ok)!.t
      Object.assign(answer, { ok: true, scoreCorrect: 15, passed: true })
    }

    const evaluation = evaluateCoachingFocusExerciseAttempt({
      exercise: COACHING_EXERCISE_TEMPLATE_EXAMPLE,
      submittedAnswers: answers,
    })

    expect(evaluation.scoreCorrect).toBe(11)
    expect(evaluation.passed).toBe(false)
  })

  it('rejects duplicate or incomplete answer coordinates', () => {
    const answers = validAnswers()

    expect(() =>
      evaluateCoachingFocusExerciseAttempt({
        exercise: COACHING_EXERCISE_TEMPLATE_EXAMPLE,
        submittedAnswers: [...answers, answers[0]],
      }),
    ).toThrow('Duplicate submitted answer')

    expect(() =>
      evaluateCoachingFocusExerciseAttempt({
        exercise: COACHING_EXERCISE_TEMPLATE_EXAMPLE,
        submittedAnswers: answers.slice(1),
      }),
    ).toThrow('The submitted answers do not cover the exercise')
  })
})

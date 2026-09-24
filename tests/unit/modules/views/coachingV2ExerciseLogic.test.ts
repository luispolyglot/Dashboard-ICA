import { describe, expect, it } from 'vitest'
import {
  correctorContextOf,
  detectWrongBuildCandidate,
  findBuildVerbMatch,
  normalizeExercisePayload,
  normalizeLooseText,
  readablePattern,
  scoreBuildVerbMatch,
  scoreDialogItem,
  type VerbUnit,
} from '@/modules/views/coachingV2ExerciseLogic'
import { COACHING_EXERCISE_TEMPLATE_EXAMPLE } from '../../../../supabase/functions/_shared/coaching-exercise-template'

const verb = (formas: string[], mal: string[] = []): VerbUnit => ({
  nombre: 'x',
  formas,
  mal,
  tags: [],
  nota: '',
})

describe('coachingV2ExerciseLogic · compatibilidad con ejercicios antiguos', () => {
  it('normalizes accents, apostrophes and applies equivalencias', () => {
    const normalized = normalizeLooseText("J’ai sorti 7 poubelles", { '7': 'sept' })
    expect(normalized).toBe('j ai sorti sept poubelles')
  })

  it('scores build item by checking a literal verb form inside free text', () => {
    expect(scoreBuildVerbMatch("Hier j'ai sorti les poubelles", verb(['ai sorti']), {})).toBe(true)
  })

  it('detects wrong build candidate when expected form is missing', () => {
    expect(
      detectWrongBuildCandidate('je suis sorti les poubelles', verb(['ai sorti'], ['suis sorti']), {}),
    ).toBe('suis sorti')
  })

  it('scores dialog item by the whole normalized value', () => {
    const item = { verbo: 'x', formas: ['suis sorti', 'suis sortie'], show: '', tags: [], why: '' }
    expect(scoreDialogItem('suis sortie', item, {})).toBe(true)
    expect(scoreDialogItem('ai sorti', item, {})).toBe(false)
    expect(scoreDialogItem('je suis sortie', item, {})).toBe(false)
  })
})

describe('coachingV2ExerciseLogic · plantilla oficial (patrones _, ~, a|b)', () => {
  const data = normalizeExercisePayload(COACHING_EXERCISE_TEMPLATE_EXAMPLE)
  if (!data) throw new Error('La plantilla oficial no se pudo leer')
  const ctx = correctorContextOf(data)
  const construir = data.construir.items

  it('reads the template, including libre rules', () => {
    expect(data.reconocer.items).toHaveLength(4)
    expect(construir).toHaveLength(4)
    expect(data.conversacion.items).toHaveLength(5)
    expect(data.libre.prohibidas).toContain('to')
  })

  it('lets the student choose the verb after the modal', () => {
    const can = construir[1].verbos[0] // can ~ _
    expect(findBuildVerbMatch('I can prepare the slides for Friday.', can, ctx)).toBe('can prepare')
    expect(scoreBuildVerbMatch('I can bring the coffee.', can, ctx)).toBe(true)
    expect(scoreBuildVerbMatch('Can you help me?', can, ctx)).toBe(true)
  })

  it('rejects to / -ing after the modal and reports what the student wrote', () => {
    const can = construir[1].verbos[0]
    expect(scoreBuildVerbMatch('I can to prepare the slides.', can, ctx)).toBe(false)
    expect(detectWrongBuildCandidate('I can to prepare the slides.', can, ctx)).toBe('can to prepare')
    expect(scoreBuildVerbMatch('I can preparing the slides.', can, ctx)).toBe(false)
  })

  it('accepts contractions and alternatives written with |', () => {
    const cant = construir[1].verbos[1] // cannot ~ _ | can t ~ _
    expect(scoreBuildVerbMatch("Marta can't come to the meeting.", cant, ctx)).toBe(true)
    expect(scoreBuildVerbMatch("Marta doesn't can come.", cant, ctx)).toBe(false)
    const wouldLike = construir[0].verbos[0] // would|d like|love to _
    expect(scoreBuildVerbMatch("I'd love to visit Japan.", wouldLike, ctx)).toBe(true)
    expect(scoreBuildVerbMatch('I will like to visit Japan.', wouldLike, ctx)).toBe(false)
  })

  it('every template example sentence passes its own forms', () => {
    for (const item of construir) {
      for (const unit of item.verbos) {
        expect(scoreBuildVerbMatch(item.ejemplo, unit, ctx)).toBe(true)
      }
    }
  })

  it('dialog gaps must match the whole answer', () => {
    const [finish, come] = data.conversacion.items
    expect(scoreDialogItem('can finish', finish, ctx)).toBe(true)
    expect(scoreDialogItem('could finish', finish, ctx)).toBe(true)
    expect(scoreDialogItem('can to finish', finish, ctx)).toBe(false)
    expect(scoreDialogItem("can't come", come, ctx)).toBe(true)
    expect(scoreDialogItem('', come, ctx)).toBe(false)
  })

  it('supports the long gap … for pieces that go far apart (German separable verbs)', () => {
    const anrufen = verb(['rufe … an'])
    expect(scoreBuildVerbMatch('Ich rufe heute Abend meine Mutter an.', anrufen, {})).toBe(true)
    expect(scoreBuildVerbMatch('Ich anrufe meine Mutter.', anrufen, {})).toBe(false)
    expect(readablePattern('rufe … an')).toBe('rufe an')
  })

  it('passes with 75% of the units (template: 12 of 15)', () => {
    expect(data.umbral).toBe(12)
  })

  it('shows patterns to the student without symbols', () => {
    expect(readablePattern('could ~ _')).toBe('could + verbo')
    expect(readablePattern('would|d like|love to _')).toBe('would like to + verbo')
  })
})

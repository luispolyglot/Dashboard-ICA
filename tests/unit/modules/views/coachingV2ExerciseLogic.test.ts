import { describe, expect, it } from 'vitest'
import {
  detectWrongBuildCandidate,
  normalizeExercisePayload,
  normalizeLooseText,
  scoreBuildVerbMatch,
  scoreDialogItem,
} from '@/modules/views/coachingV2ExerciseLogic'

describe('coachingV2ExerciseLogic', () => {
  it('normalizes accents, apostrophes and applies equivalencias', () => {
    const normalized = normalizeLooseText("J’ai sorti 7 poubelles", { '7': 'sept' })
    expect(normalized).toBe('j ai sorti sept poubelles')
  })

  it('scores build item by checking verb form inside free text', () => {
    const ok = scoreBuildVerbMatch(
      "Hier j'ai sorti les poubelles",
      ['ai sorti'],
      {},
    )
    expect(ok).toBe(true)
  })

  it('detects wrong build candidate when expected form is missing', () => {
    const wrong = detectWrongBuildCandidate('je suis sorti les poubelles', ['suis sorti'], {})
    expect(wrong).toBe('suis sorti')
  })

  it('scores dialog item by exact normalized value', () => {
    expect(scoreDialogItem('suis sortie', ['suis sorti', 'suis sortie'], {})).toBe(
      true,
    )
    expect(scoreDialogItem('ai sorti', ['suis sorti', 'suis sortie'], {})).toBe(
      false,
    )
  })

  it('parses minimal valid payload schema', () => {
    const payload = {
      idioma: 'Frances',
      nivel: 'A2',
      foco: 'Passe compose',
      foco_subtitulo: 'Subtitulo',
      foco_slot: 'Foco 1',
      fase: 'Entrenado',
      umbral: 10,
      equivalencias: { '7': 'sept' },
      etiquetas: { auxiliar: 'Auxiliar' },
      bloques: [
        {
          id: 'reconocer',
          titulo: 'Reconocer',
          instruccion: 'Instr',
          items: [
            {
              lead: 'Lead',
              tags: ['auxiliar'],
              options: [
                { t: 'a', ok: false, why: 'x' },
                { t: 'b', ok: true, why: 'y' },
              ],
            },
          ],
        },
        {
          id: 'construir',
          titulo: 'Construir',
          instruccion: 'Instr',
          items: [
            {
              situacion: 'Sit',
              ejemplo: 'Ex',
              verbos: [
                {
                  nombre: 'aller',
                  formas: ['suis alle'],
                  mal: ['ai alle'],
                  tags: ['auxiliar'],
                  nota: 'nota',
                },
              ],
            },
          ],
        },
        {
          id: 'conversacion',
          titulo: 'Conversacion',
          instruccion: 'Instr',
          lineas: [{ quien: 'Toi', texto: 'Je {0}' }],
          items: [
            {
              verbo: 'aller',
              formas: ['suis alle'],
              show: 'suis alle',
              tags: ['auxiliar'],
              why: 'why',
            },
          ],
        },
      ],
    }

    const parsed = normalizeExercisePayload(payload)
    expect(parsed).not.toBeNull()
    expect(parsed?.reconocer.items).toHaveLength(1)
    expect(parsed?.construir.items).toHaveLength(1)
    expect(parsed?.conversacion.items).toHaveLength(1)
  })
})

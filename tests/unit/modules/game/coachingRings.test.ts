import { describe, expect, it } from 'vitest'
import { buildWeekRings, countRings, isTaskAnswered } from '@/modules/game/coachingRings'
import { computeAchievements } from '@/modules/game/achievements'
import type { CoachingV2ClassSlot } from '@/modules/services/coaching'
import {
  buildTaskAudioPath,
  countAnsweredTasks,
  isTaskAudioPathFor,
  normalizeAudioMime,
} from '../../../../supabase/functions/coaching-center/task-audio'

type RingClass = Pick<
  CoachingV2ClassSlot,
  'periodNumber' | 'classIndex' | 'studentGuidelineResponse1' | 'studentGuidelineResponse2' | 'studentGuidelineResponse3' | 'audioAnswers'
>

const cls = (periodNumber: number, classIndex: 1 | 2, answers: Array<string | null>, audio: Array<1 | 2 | 3> = []): RingClass => ({
  periodNumber,
  classIndex,
  studentGuidelineResponse1: answers[0] ?? null,
  studentGuidelineResponse2: answers[1] ?? null,
  studentGuidelineResponse3: answers[2] ?? null,
  audioAnswers: audio.map((taskIndex) => ({
    taskIndex,
    studentAudioUrl: 'x',
    studentAudioSeconds: 20,
    studentSentAt: '2026-10-06T10:00:00Z',
    feedbackText: null,
    feedbackAudioUrl: null,
    feedbackAudioSeconds: null,
    feedbackAt: null,
  })),
})

describe('anillos del coaching', () => {
  it('una semana se sella con las 6 tareas, contando los audios enviados', () => {
    const classes = [
      cls(1, 1, ['a', 'b', 'c']),
      cls(1, 2, ['a', 'b', null], [3]),
      cls(2, 1, ['a', ' ', null]),
      cls(2, 2, ['a', 'b', 'c']),
    ]
    const rings = buildWeekRings({
      classes,
      durationPeriods: 10,
      activatedPeriods: new Set([1, 2, 3]),
      closedPeriods: new Set([1, 2]),
    })
    expect(rings).toHaveLength(10)
    expect(rings[0]).toMatchObject({ period: 1, answered: 6, complete: true, state: 'sealed' })
    expect(rings[1]).toMatchObject({ period: 2, answered: 4, complete: false, state: 'closed' })
    expect(rings[2]).toMatchObject({ period: 3, answered: 0, state: 'active' })
    expect(rings[3]).toMatchObject({ period: 4, state: 'locked' })
    expect(countRings(rings)).toBe(1)
    expect(isTaskAnswered(classes[1], 3)).toBe(true)
    expect(isTaskAnswered(classes[2], 2)).toBe(false)
  })

  it('la insignia Coaching: bronce 4, plata 5, oro 6, rubí 8, diamante 9 y Leyenda con 10, 20 y 30 anillos', () => {
    const levels = (bestRings: number, totalRings: number) =>
      computeAchievements({
        rachaICA: 0,
        rachaFlash: 0,
        eficacia: null,
        vocab: null,
        desafios: null,
        rankings: null,
        coaching: { bestRings, totalRings },
      }).byCategory.coaching.earned
    expect(levels(3, 3)).toBe(0)
    expect(levels(4, 4)).toBe(1)
    expect(levels(7, 7)).toBe(3)
    expect(levels(8, 8)).toBe(4)
    expect(levels(9, 9)).toBe(5)
    expect(levels(10, 10)).toBe(6)
    expect(levels(10, 19)).toBe(6)
    expect(levels(10, 20)).toBe(7)
    expect(levels(10, 30)).toBe(8)
    // 30 rings over several coachings without one full coaching stays at Diamante.
    expect(levels(9, 30)).toBe(5)
  })
})

describe('audios de las tareas (servidor)', () => {
  const target = { sessionId: 's1', periodNumber: 3, classIndex: 2, taskIndex: 3 as const }

  it('solo acepta rutas que la función dio para esa tarea y esa persona', () => {
    const path = buildTaskAudioPath({ ...target, who: 'student', mime: 'audio/webm', now: 1700 })
    expect(path).toBe('s1/3/2-3/student-1700.webm')
    expect(isTaskAudioPathFor(path, { ...target, who: 'student' })).toBe(true)
    expect(isTaskAudioPathFor(path, { ...target, who: 'coach' })).toBe(false)
    expect(isTaskAudioPathFor('s1/3/2-3/student-../x.webm', { ...target, who: 'student' })).toBe(false)
    expect(isTaskAudioPathFor('s2/3/2-3/student-1700.webm', { ...target, who: 'student' })).toBe(false)
  })

  it('normaliza el formato y cuenta las tareas respondidas', () => {
    expect(normalizeAudioMime('audio/webm;codecs=opus')).toBe('audio/webm')
    expect(normalizeAudioMime('video/mp4')).toBeNull()
    expect(countAnsweredTasks(['a', '', null], new Set([2, 3]))).toBe(3)
    expect(countAnsweredTasks(['a', '', null], new Set())).toBe(1)
  })
})

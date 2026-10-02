import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } } }))
vi.mock('../../../../src/modules/services/metaTracker', () => ({ loadMetaTrackerProfile: async () => null }))

import {
  localInvoke,
  localListChallenges,
  localListPlays,
  registerIcaChallengesLocalContext,
} from '../../../../src/modules/services/icaChallengesLocal'

const BASE_WORDS: Array<[string, string, string | null]> = [
  ['samochód', 'coche', 'Jadę samochodem do pracy.'], ['pies', 'perro', 'Mój pies lubi spacery.'], ['dom', 'casa', null],
  ['książka', 'libro', 'Czytam ciekawą książkę każdego dnia.'], ['jabłko', 'manzana', 'Jem jabłko na śniadanie.'],
  ['okno', 'ventana', 'Otwórz okno, proszę.'], ['woda', 'agua', null], ['mleko', 'leche', null],
]
const EXTRA_WORDS: Array<[string, string, string | null]> = [
  ['kot', 'gato', null], ['stół', 'mesa', null], ['krzesło', 'silla', null], ['ulica', 'calle', null],
  ['miasto', 'ciudad', null], ['rower', 'bici', null], ['chleb', 'pan', null], ['ser', 'queso', null],
  ['ryba', 'pescado', null], ['szkoła', 'escuela', null], ['praca', 'trabajo', null], ['lato', 'verano', null],
  ['zima', 'invierno', null], ['morze', 'mar', null],
]

function toCards(words: Array<[string, string, string | null]>) {
  return words.map(([target, native, phrase], i) => ({ id: 'c' + i, target, native, targetLang: 'Polaco', nativeLang: 'Español', examplePhrase: phrase, exampleTranslation: phrase ? 't' : null, importance: 'vital', interval: 1, easeFactor: 2.5, streak: 0, lastReviewed: null, createdAt: 0 })) as any
}

const fewCards = toCards(BASE_WORDS) // 8 palabras
const cards = toCards([...BASE_WORDS, ...EXTRA_WORDS]) // 22 palabras

function secretFor(challengeId: string, owner: string | null, index: number) {
  const state = JSON.parse(window.localStorage.getItem('ica-challenges-local-v1') || '{}')
  return state.questions.find((q: any) => q.challengeId === challengeId && q.owner === owner && q.index === index)
}
function good(q: any) {
  if (['choice', 'listen', 'cloze', 'pairs'].includes(q.kind)) return { optionIndex: q.answer.correctOptionIndex }
  if (q.kind === 'write') return { text: q.answer.target }
  return { transcripts: [q.answer.target] }
}
function boardSolution(challengeId: string, owner: string | null, start: number): number[] {
  return [0, 1, 2, 3, 4].map((p) => secretFor(challengeId, owner, start + p).answer.correctOptionIndex)
}

describe('Desafíos ICA · modo local de prueba', () => {
  it('flujo completo', async () => {
    // --- Con menos de 20 palabras no se puede retar ni aceptar ---
    registerIcaChallengesLocalContext({ cards: fewCards, targetLang: 'Polaco', nativeLang: 'Español' })
    const all = await localListChallenges()
    // Dos retos pendientes de ejemplo: Escucha (de Jorge) y Escritura (de Tomás).
    expect(all).toHaveLength(2)
    expect(all.map((c) => c.challengeSlug).sort()).toEqual(['ica-listen', 'ica-writing'])
    const initial = all.filter((c) => c.challengerUserId === 'local-bot-jorge')
    expect(initial).toHaveLength(1)
    expect(initial[0].status).toBe('created')

    let users: any = await localInvoke({ action: 'list-available-users', targetLang: 'Polaco', nativeLang: 'Español', scope: 'global' })
    expect(users.myWordCount).toBe(8)
    expect(users.minWordsToJoin).toBe(20)
    const blocked: any = await localInvoke({ action: 'create-challenge', challengeTypeId: 'ica-writing', challengedUserId: 'local-bot-marta', scope: 'language', targetLang: 'Polaco', nativeLang: 'Español', wordSource: 'mixed', rounds: 2 })
    expect(blocked.ok).toBe(false)
    expect(blocked.code).toBe('ICA_CHALLENGE_MIN_WORDS')
    expect(blocked.error).toContain('te faltan 12')
    const blockedAccept: any = await localInvoke({ action: 'respond-invitation', challengeId: initial[0].id, accept: true })
    expect(blockedAccept.ok).toBe(false)
    expect(blockedAccept.code).toBe('ICA_CHALLENGE_MIN_WORDS')

    // --- Con 22 palabras, sí ---
    registerIcaChallengesLocalContext({ cards, targetLang: 'Polaco', nativeLang: 'Español' })
    users = await localInvoke({ action: 'list-available-users', targetLang: 'Polaco', nativeLang: 'Español', scope: 'global' })
    expect(users.myWordCount).toBe(22)
    const marta = users.rows.find((r: any) => r.userId === 'local-bot-marta')
    const jorge = users.rows.find((r: any) => r.userId === 'local-bot-jorge')
    expect(users.myLevel).toBe('A2')
    expect(marta.mixedAllowed && marta.canChallenge).toBe(true)
    expect(jorge.mixedAllowed).toBe(false)
    expect(jorge.canChallenge).toBe(false)

    const types: any = await localInvoke({ action: 'list-challenge-types' })
    // Lectura, Escritura (2), Escucha, Habla y Parejas. Completa la frase está en Próximamente.
    expect(types.rows.filter((r: any) => r.isActive && r.isPlayable)).toHaveLength(6)
    expect(types.rows.find((r: any) => r.id === 'ica-own-words').name).toBe('Lectura')
    expect(types.rows.find((r: any) => r.id === 'ica-pairs').name).toBe('Parejas')

    const created: any = await localInvoke({ action: 'create-challenge', challengeTypeId: 'ica-writing', challengedUserId: 'local-bot-marta', scope: 'language', targetLang: 'Polaco', nativeLang: 'Español', wordSource: 'mixed', rounds: 2, durationSeconds: 86400 })
    expect(created.ok).toBe(true)
    const id = created.challengeId
    let state: any = await localInvoke({ action: 'play-state', challengeId: id })
    expect(state.challenge.status).toBe('in_progress')
    expect(state.challenge.isMyTurn).toBe(true)
    expect(state.rival.answered).toBe(5)

    let step: any = await localInvoke({ action: 'next-question', challengeId: id })
    let q = step.question
    for (let i = 0; i < 5; i++) {
      const s = secretFor(id, null, q.index)
      step = await localInvoke({ action: 'answer-question', challengeId: id, questionIndex: q.index, response: good(s), clientMs: 1000 })
      expect(step.result.isCorrect).toBe(true)
      q = step.next
    }
    expect(step.status).toBe('round_finished')
    expect(step.isMyTurn).toBe(true)
    step = await localInvoke({ action: 'next-question', challengeId: id })
    q = step.question
    for (let i = 0; i < 5; i++) {
      const s = secretFor(id, null, q.index)
      step = await localInvoke({ action: 'answer-question', challengeId: id, questionIndex: q.index, response: i === 0 ? { text: 'zzz' } : good(s), clientMs: 1000 })
      q = step.next
    }
    expect(step.status).toBe('done')
    state = await localInvoke({ action: 'play-state', challengeId: id })
    expect(state.challenge.status).toBe('completed')
    const review: any = await localInvoke({ action: 'review', challengeId: id })
    expect(review.items).toHaveLength(10)
    expect(review.items.some((it: any) => it.fromRival)).toBe(true)
    expect(review.items.some((it: any) => it.myAnswer === 'zzz')).toBe(true)
    expect(localListPlays([id]).length).toBe(20)

    const seeded = initial[0].id
    const accepted: any = await localInvoke({ action: 'respond-invitation', challengeId: seeded, accept: true })
    expect(accepted.ok).toBe(true)
    step = await localInvoke({ action: 'next-question', challengeId: seeded })
    expect(step.question.kind).toBe('listen')

    const light: any = await localInvoke({ action: 'create-challenge', challengeTypeId: 'ica-lightning', challengedUserId: 'local-bot-marta', scope: 'language', targetLang: 'Polaco', nativeLang: 'Español', wordSource: 'own' })
    expect(light.ok).toBe(true)
    step = await localInvoke({ action: 'next-question', challengeId: light.challengeId })
    expect(step.session.remainingMs).toBeGreaterThan(55000)
    q = step.question
    for (let i = 0; i < 3; i++) {
      const s = secretFor(light.challengeId, 'me', q.index)
      step = await localInvoke({ action: 'answer-question', challengeId: light.challengeId, questionIndex: q.index, response: good(s), clientMs: 800 })
      q = step.next
    }
    await localInvoke({ action: 'end-session', challengeId: light.challengeId })
    state = await localInvoke({ action: 'play-state', challengeId: light.challengeId })
    expect(state.challenge.status).toBe('completed')
    expect(state.me.correct).toBe(3)

    // «Completa la frase» está en Próximamente: todavía no se puede crear.
    const cloze: any = await localInvoke({ action: 'create-challenge', challengeTypeId: 'ica-cloze', challengedUserId: 'local-bot-marta', scope: 'language', targetLang: 'Polaco', nativeLang: 'Español', wordSource: 'mixed', rounds: 1 })
    expect(cloze.ok).toBe(false)

    // --- Parejas: 2 rondas de 1 tablero ---
    const pairs: any = await localInvoke({ action: 'create-challenge', challengeTypeId: 'ica-pairs', challengedUserId: 'local-bot-marta', scope: 'language', targetLang: 'Polaco', nativeLang: 'Español', wordSource: 'mixed', rounds: 2 })
    expect(pairs.ok).toBe(true)
    const pairsId = pairs.challengeId
    step = await localInvoke({ action: 'next-question', challengeId: pairsId })
    expect(step.question.kind).toBe('pairs')
    expect(step.question.index).toBe(0)
    expect(step.question.data.words).toHaveLength(5)
    expect(step.question.data.options).toHaveLength(5)
    expect(step.question.limitMs).toBeGreaterThan(35000)
    // Primer tablero: 3 bien y 2 cambiadas.
    const solution = boardSolution(pairsId, null, 0)
    const matches = solution.slice()
    ;[matches[3], matches[4]] = [matches[4], matches[3]]
    step = await localInvoke({ action: 'answer-question', challengeId: pairsId, questionIndex: 0, response: { matches }, clientMs: 12000 })
    expect(step.pairs.correct).toEqual([true, true, true, false, false])
    expect(step.pairs.solution).toEqual(solution)
    expect(step.status).toBe('round_finished')
    expect(step.progress.answered).toBe(5)
    expect(step.progress.correct).toBe(3)
    // Reintento del mismo tablero: devuelve lo guardado.
    const again: any = await localInvoke({ action: 'answer-question', challengeId: pairsId, questionIndex: 0, response: { matches: solution }, clientMs: 12000 })
    expect(again.duplicate).toBe(true)
    expect(again.pairs.correct.filter(Boolean)).toHaveLength(3)
    // Segundo tablero, perfecto.
    step = await localInvoke({ action: 'next-question', challengeId: pairsId })
    expect(step.question.index).toBe(5)
    step = await localInvoke({ action: 'answer-question', challengeId: pairsId, questionIndex: 5, response: { matches: boardSolution(pairsId, null, 5) }, clientMs: 9000 })
    expect(step.pairs.correct.every(Boolean)).toBe(true)
    expect(step.status).toBe('done')
    state = await localInvoke({ action: 'play-state', challengeId: pairsId })
    expect(state.challenge.status).toBe('completed')
    expect(state.me.correct).toBe(8)
    const pairsReview: any = await localInvoke({ action: 'review', challengeId: pairsId })
    expect(pairsReview.items).toHaveLength(10)
    expect(pairsReview.items.filter((it: any) => !it.isCorrect)).toHaveLength(2)
    expect(pairsReview.items.every((it: any) => it.kind === 'pairs')).toBe(true)
  })
})

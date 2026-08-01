import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { IcaTestResultCard } from '@/modules/components/IcaTestResultCard'

afterEach(() => {
  cleanup()
})

describe('IcaTestResultCard', () => {
  it('shows leaderboard points badge when provided', () => {
    render(
      <IcaTestResultCard
        monthLabel='Junio 2026'
        title='Excelente resultado'
        score={11}
        totalQuestions={12}
        message='Muy solido.'
        note='Nota de prueba'
        leaderboardPoints={1.1}
        actions={<button type='button'>Volver</button>}
      />,
    )

    expect(screen.getByText('+1.1 puntos al leaderboard mensual')).toBeTruthy()
  })

  it('does not show leaderboard points badge when missing', () => {
    render(
      <IcaTestResultCard
        monthLabel='Junio 2026'
        title='Excelente resultado'
        score={11}
        totalQuestions={12}
        message='Muy solido.'
        note='Nota de prueba'
        actions={<button type='button'>Volver</button>}
      />,
    )

    expect(screen.queryByText(/puntos al leaderboard mensual/i)).toBeNull()
  })

  it('renders error review action when provided', () => {
    render(
      <IcaTestResultCard
        monthLabel='Junio 2026'
        title='Buen avance'
        score={10}
        totalQuestions={12}
        message='Resultado de prueba'
        note='Nota de prueba'
        errorReviewAction={<button type='button'>Ver errores</button>}
        actions={<button type='button'>Volver</button>}
      />,
    )

    expect(screen.getByText('Ver errores')).toBeTruthy()
  })
})

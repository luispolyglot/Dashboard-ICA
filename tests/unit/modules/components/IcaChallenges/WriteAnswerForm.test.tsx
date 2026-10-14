import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WriteAnswerForm } from '@/modules/components/IcaChallenges/ChallengePlayParts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderForm(key: number, onTextChange: (text: string) => void) {
  return (
    <WriteAnswerForm
      hint='H…'
      targetLang='de'
      disabled={false}
      onSubmit={() => {}}
      onSkip={() => {}}
      onTextChange={onTextChange}
      autoFocusKey={key}
    />
  )
}

describe('WriteAnswerForm (Escritura)', () => {
  it('reports what is written, so it can be checked when the time runs out', () => {
    const onTextChange = vi.fn()
    render(renderForm(0, onTextChange))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Haus' } })
    expect(onTextChange).toHaveBeenLastCalledWith('Haus')
  })

  it('starts empty with each new word', () => {
    const onTextChange = vi.fn()
    const { rerender } = render(renderForm(0, onTextChange))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Haus' } })
    rerender(renderForm(1, onTextChange))
    expect(onTextChange).toHaveBeenLastCalledWith('')
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('')
  })

  it('does not keep the keyboard notice on screen during the game', () => {
    render(renderForm(0, () => {}))
    expect(screen.queryByRole('note')).toBeNull()
  })
})

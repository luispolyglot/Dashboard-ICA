import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImportantInfoModal } from '@/modules/components/ImportantInfoModal'

const dismissKey = 'important_info_calendar_notifications_modal_dismissed_masterclass_monday_v1'
const signupUrl = 'https://www.skool.com/icademy/masterclass-incominnn-apuntate'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

beforeEach(() => {
  window.localStorage.clear()
})

describe('ImportantInfoModal masterclass notice', () => {
  it('shows the masterclass image and Monday reminder', () => {
    render(<ImportantInfoModal />)

    expect(
      screen.getByRole('heading', { name: 'Hey, recuerda la masterclass que voy a hacer el lunes.' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('img', { name: 'Anuncio de la masterclass online de fluidez con Luis' }),
    ).toBeTruthy()
  })

  it('closes and remembers when the student is already signed up', () => {
    render(<ImportantInfoModal />)

    fireEvent.click(screen.getByRole('button', { name: 'Ya estoy apuntado' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.localStorage.getItem(dismissKey)).toBe('1')
  })

  it('opens the sign-up page in a new tab and closes the modal', () => {
    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<ImportantInfoModal />)

    fireEvent.click(screen.getByRole('button', { name: 'Apuntarme' }))

    expect(openWindow).toHaveBeenCalledWith(signupUrl, '_blank', 'noopener,noreferrer')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.localStorage.getItem(dismissKey)).toBe('1')
  })
})

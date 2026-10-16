import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImportantInfoModal, isImportantInfoOver } from '@/modules/components/ImportantInfoModal'

const dismissKey = 'important_info_calendar_notifications_modal_dismissed_masterclass_monday_v1'
const signupUrl = 'https://www.skool.com/icademy/masterclass-incominnn-apuntate'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

beforeEach(() => {
  window.localStorage.clear()
  // The day of the masterclass: the notice is still on.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
})

afterEach(() => {
  vi.useRealTimers()
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

  it('is not shown any more from the day after the event', () => {
    vi.setSystemTime(new Date(2026, 9, 13, 0, 5))
    render(<ImportantInfoModal />)

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stays on until the end of the last day, in the local time zone', () => {
    expect(isImportantInfoOver(new Date(2026, 9, 19, 23, 59), '2026-10-19')).toBe(false)
    expect(isImportantInfoOver(new Date(2026, 9, 20, 0, 0), '2026-10-19')).toBe(true)
  })
})

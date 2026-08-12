import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/modules/services/metaTracker', () => ({
  fetchWordActivationCounts: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/modules/components/ActivatePhraseInMasterNoteModal', () => ({
  ActivatePhraseInMasterNoteModal: () => null,
}))

vi.mock('@/modules/components/ExtractWordsToVaultModal', () => ({
  ExtractWordsToVaultModal: () => null,
}))

vi.mock('@/modules/components/ExplorePhraseTokenModal', () => ({
  ExplorePhraseTokenModal: () => null,
}))

vi.mock('@/modules/components/MetaTracker/MetaTrackerLevelUpModal', () => ({
  MetaTrackerLevelUpModal: () => null,
}))

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ value, onValueChange, children }: any) => (
    <div data-tabs-value={value}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child, {
              __tabsValue: value,
              __onTabsValueChange: onValueChange,
            })
          : child,
      )}
    </div>
  ),
  TabsList: ({ children, __tabsValue, __onTabsValueChange }: any) => (
    <div>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child, {
              __tabsValue,
              __onTabsValueChange,
            })
          : child,
      )}
    </div>
  ),
  TabsTrigger: ({ value, children, __tabsValue, __onTabsValueChange }: any) => (
    <button
      role='tab'
      aria-selected={__tabsValue === value}
      onClick={() => __onTabsValueChange?.(value)}
    >
      {children}
    </button>
  ),
}))

import { PhraseView } from '@/modules/views/PhraseView'
import type { AppConfig, Lexicard } from '@/modules/types'

function makeCard(partial: Partial<Lexicard>): Lexicard {
  return {
    id: partial.id || crypto.randomUUID(),
    target: partial.target || '',
    native: partial.native || '',
    targetLang: partial.targetLang || 'Francés',
    nativeLang: partial.nativeLang || 'Español',
    examplePhrase: null,
    exampleTranslation: null,
    importance: partial.importance || 'frequent',
    interval: 1,
    easeFactor: 2.5,
    streak: 0,
    activationCount: 0,
    firstActivatedAt: null,
    lastActivatedAt: null,
    lastReviewed: null,
    createdAt: Date.now(),
  }
}

describe('PhraseView manual phrase detection', () => {
  it('detects only exact target-language ICA words (case-insensitive)', () => {
    const config: AppConfig = {
      targetLang: 'Francés',
      nativeLang: 'Español',
    }

    const cards: Lexicard[] = [
      makeCard({ id: 'c-1', target: 'désert', native: 'desierto' }),
    ]

    render(
      <MemoryRouter>
        <PhraseView
          cards={cards}
          setCards={vi.fn()}
          config={config}
          onWordAdded={vi.fn().mockResolvedValue({
            wordsAdded: 0,
            phraseGenerated: false,
            reviewCorrect: 0,
            voiceActivationsCount: 0,
          })}
          onPhraseGenerated={vi.fn().mockResolvedValue({
            wordsAdded: 0,
            phraseGenerated: false,
            reviewCorrect: 0,
            voiceActivationsCount: 0,
          })}
          metaTrackerProfile={null}
          onActivationWordsTotalChange={vi.fn()}
          LevelBadge={() => <span>LEVEL</span>}
        />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Frase manual' }))

    const textareas = screen.getAllByRole('textbox')
    const targetInput = textareas[0]
    const nativeInput = textareas[1]

    fireEvent.change(targetInput, { target: { value: 'Je mange un desert.' } })
    fireEvent.change(nativeInput, { target: { value: 'Yo cruzo el desierto.' } })

    expect(screen.getByText(/Detectadas automáticamente: 0\./i)).toBeTruthy()

    fireEvent.change(targetInput, { target: { value: 'Je traverse le désert.' } })

    expect(screen.getByText(/Detectadas automáticamente: 1\./i)).toBeTruthy()
  })
})

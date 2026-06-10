import { describe, expect, it } from 'vitest'
import { getMasterNotesLoopAnnouncement } from '@/modules/views/masterNotesLoopAnnouncements'

describe('masterNotesLoopAnnouncements', () => {
  it('builds first announcement with note name', () => {
    const text = getMasterNotesLoopAnnouncement('Nota Maestra: 7', 'first')
    expect(text).toBe('Empezamos con Nota Maestra: 7')
  })

  it('builds next announcement with note name', () => {
    const text = getMasterNotesLoopAnnouncement('Nota Maestra: 12', 'next')
    expect(text).toBe('Siguiente Nota Maestra: 12')
  })

  it('uses safe fallback when note name is empty', () => {
    const firstText = getMasterNotesLoopAnnouncement('   ', 'first')
    const nextText = getMasterNotesLoopAnnouncement('', 'next')

    expect(firstText).toBe('Empezamos con nota maestra')
    expect(nextText).toBe('Siguiente nota maestra')
  })
})

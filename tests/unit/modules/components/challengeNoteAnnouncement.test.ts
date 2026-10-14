import { describe, expect, it } from 'vitest'
import { sequenceAnnouncement } from '@/modules/components/ChallengeNoteSequence'

describe('«Escuchar todas seguidas»: lo que dice la voz antes de cada nota', () => {
  it('en español, con voz española, para quien tiene el español como idioma nativo', () => {
    expect(sequenceAnnouncement(0, 'Español')).toEqual({ text: 'Primera nota maestra', voiceLang: 'Español' })
    expect(sequenceAnnouncement(11, 'Español')).toEqual({ text: 'Nota maestra 12', voiceLang: 'Español' })
  })

  it('en inglés, con voz inglesa, para cualquier otro idioma nativo', () => {
    expect(sequenceAnnouncement(2, 'Polaco')).toEqual({ text: 'Third master note', voiceLang: 'Inglés' })
    expect(sequenceAnnouncement(10, 'Inglés')).toEqual({ text: 'Master note 11', voiceLang: 'Inglés' })
  })
})

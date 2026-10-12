import { afterEach, describe, expect, it } from 'vitest'
import { holdMediaSession, mediaSessionHeld, setAudioSessionType } from '@/modules/services/audioSession'

const fakeSession = { type: 'auto' }
Object.defineProperty(navigator, 'audioSession', { value: fakeSession, configurable: true })

describe('audioSession', () => {
  afterEach(() => {
    fakeSession.type = 'auto'
  })

  it('holds «playback» while listening and ignores the game effects meanwhile', () => {
    const release = holdMediaSession()
    expect(fakeSession.type).toBe('playback')
    expect(mediaSessionHeld()).toBe(true)
    setAudioSessionType('ambient')
    expect(fakeSession.type).toBe('playback')
    release()
    release()
    expect(mediaSessionHeld()).toBe(false)
    expect(fakeSession.type).toBe('auto')
    setAudioSessionType('ambient')
    expect(fakeSession.type).toBe('ambient')
  })
})

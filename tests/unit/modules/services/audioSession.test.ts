import { afterEach, describe, expect, it } from 'vitest'
import { beginMicUse, holdMediaSession, mediaSessionHeld, micInUse, setAudioSessionType } from '@/modules/services/audioSession'

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

  it('opening the microphone puts the session back on «auto» and the effects cannot change it', () => {
    setAudioSessionType('ambient')
    expect(fakeSession.type).toBe('ambient')
    const release = beginMicUse()
    expect(fakeSession.type).toBe('auto')
    expect(micInUse()).toBe(true)
    setAudioSessionType('ambient')
    expect(fakeSession.type).toBe('auto')
    release()
    release()
    expect(micInUse()).toBe(false)
    setAudioSessionType('ambient')
    expect(fakeSession.type).toBe('ambient')
  })

  it('a master note playing does not switch to «playback» while recording', () => {
    const release = beginMicUse()
    const letGo = holdMediaSession()
    expect(fakeSession.type).toBe('auto')
    release()
    expect(fakeSession.type).toBe('playback')
    letGo()
    expect(fakeSession.type).toBe('auto')
  })
})

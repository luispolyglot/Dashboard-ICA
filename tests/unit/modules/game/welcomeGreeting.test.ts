import { describe, expect, it } from 'vitest'
import { buildWelcomeCandidates, buildWelcomeGreeting, buildWelcomeHello, firstNameFrom } from '../../../../src/modules/game/welcomeGreeting'

describe('buildWelcomeGreeting', () => {
  it('greets in the target language with a comma and an exclamation', () => {
    expect(buildWelcomeGreeting('Italiano', 'Clara')).toBe('Ciao, Clara!')
    expect(buildWelcomeGreeting('Polaco', 'Luis')).toBe('Cześć, Luis!')
    expect(buildWelcomeGreeting('Español', 'Clara')).toBe('¡Hola, Clara!')
    expect(buildWelcomeGreeting('Catalán', 'Clara')).toBe('¡Hola, Clara!')
  })

  it('uses the native comma and exclamation for Japanese and Chinese', () => {
    expect(buildWelcomeGreeting('Japonés', 'Clara')).toBe('こんにちは、Clara！')
    expect(buildWelcomeGreeting('Chino', 'Clara')).toBe('你好，Clara！')
  })

  it('falls back to Spanish for an unknown language', () => {
    expect(buildWelcomeGreeting('Klingon', 'Clara')).toBe('¡Hola, Clara!')
    expect(buildWelcomeGreeting(null, 'Clara')).toBe('¡Hola, Clara!')
  })

  it('returns null without a name', () => {
    expect(buildWelcomeGreeting('Italiano', '  ')).toBeNull()
    expect(buildWelcomeGreeting('Italiano', null)).toBeNull()
  })
})

describe('firstNameFrom', () => {
  it('takes the first word of the display name', () => {
    expect(firstNameFrom('Clara Martínez', 'x@y.com')).toBe('Clara')
  })

  it('falls back to the email user part', () => {
    expect(firstNameFrom('', 'clara@icademy.com')).toBe('clara')
    expect(firstNameFrom(undefined, null)).toBe('')
  })
})

describe('buildWelcomeHello', () => {
  it('returns only the hello of the target language', () => {
    expect(buildWelcomeHello('Polaco')).toBe('Cześć!')
    expect(buildWelcomeHello('Español')).toBe('¡Hola!')
    expect(buildWelcomeHello(undefined)).toBe('¡Hola!')
  })
})

describe('buildWelcomeCandidates', () => {
  it('says good morning in the morning, then falls back to hello', () => {
    expect(buildWelcomeCandidates('Italiano', 'Clara', 9)).toEqual(['Buongiorno, Clara!', 'Buongiorno!', 'Ciao, Clara!', 'Ciao!'])
    expect(buildWelcomeCandidates('Español', 'Clara', 12)).toEqual(['¡Buenos días, Clara!', '¡Buenos días!', '¡Hola, Clara!', '¡Hola!'])
  })

  it('only says hello in the afternoon and at night', () => {
    expect(buildWelcomeCandidates('Polaco', 'Luis', 13)).toEqual(['Cześć, Luis!', 'Cześć!'])
    expect(buildWelcomeCandidates('Polaco', 'Luis', 3)).toEqual(['Cześć, Luis!', 'Cześć!'])
  })

  it('works without a name', () => {
    expect(buildWelcomeCandidates('Francés', '', 8)).toEqual(['Bonjour!', 'Salut!'])
  })
})

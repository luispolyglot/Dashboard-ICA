import { describe, expect, it } from 'vitest'
import { canRespellLocally, polishToSpanishRespelling } from '@/modules/pronunciation/polish'

describe('pronunciación del polaco para hispanohablantes', () => {
  it.each([
    ['Postawiłem', 'postavíuem'],
    ['Prawidłowy sposób', 'praviduovi spósup'],
    ['dziękuję', 'yenkuye'],
    ['przepraszam', 'psheprásham'],
    ['dzień dobry', 'yeñ dobri'],
    ['wszystko', 'fshistko'],
    ['cześć', 'cheshch'],
    ['pięć', 'piench'],
    ['miasto', 'miasto'],
    ['rozmawiać', 'rosmáviach'],
    ['Kraków', 'krákuf'],
    ['Wrocław', 'vrótsuaf'],
    ['samochód', 'samójut'],
    ['nauka', 'naúka'],
    ['język', 'yénsik'],
    ['babcia', 'babcha'],
    ['gitara', 'guitara'],
    ['jabłko', 'yabko'],
  ])('%s → %s', (word, expected) => {
    expect(polishToSpanishRespelling(word)).toBe(expected)
  })

  it('solo se usa para polaco con español', () => {
    expect(canRespellLocally('Polaco', 'Español')).toBe(true)
    expect(canRespellLocally('Francés', 'Español')).toBe(false)
    expect(canRespellLocally('Polaco', 'Inglés')).toBe(false)
  })
})

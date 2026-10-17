import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageFlag } from '@/modules/components/LanguagePicker'
import { englishFlagKey } from '@/modules/game/englishAccent'
import React from 'react'

void React // JSX in this test needs React in scope

// Luis, 17 Oct: «Inglés» a secas sale con TU acento (americano por defecto); para otra persona,
// 'Inglés:us' o 'Inglés:uk'.
const US_BLUE = '#3C3B6E'
const UK_BLUE = '#012169'

describe('bandera del inglés', () => {
  it('«Inglés» a secas sale con tu acento (americano por defecto)', () => {
    const html = renderToStaticMarkup(<LanguageFlag language='Inglés' />)
    expect(html).toContain(US_BLUE)
    expect(html).not.toContain(UK_BLUE)
  })

  it('la de otra persona sale con su acento', () => {
    expect(renderToStaticMarkup(<LanguageFlag language={englishFlagKey('uk')} />)).toContain(UK_BLUE)
    expect(renderToStaticMarkup(<LanguageFlag language={englishFlagKey('us')} />)).toContain(US_BLUE)
  })

  it('los demás idiomas no cambian', () => {
    expect(renderToStaticMarkup(<LanguageFlag language='Polaco' />)).toContain('#DC143C')
  })
})

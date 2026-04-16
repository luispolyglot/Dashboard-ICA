import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LANGUAGES, LEVELS } from '../constants'
import type { AppConfig, CEFRLevel } from '../types'

const LEVEL_DESC: Record<CEFRLevel, string> = {
  '0': 'Sin conocimientos previos',
  A1: 'Entiendo frases muy basicas',
  A2: 'Me comunico en situaciones simples',
  B1: 'Me desenvuelvo en la mayoria de situaciones',
  B2: 'Me expreso con fluidez',
  C1: 'Uso avanzado y complejo',
  C2: 'Dominio casi nativo',
}

type LanguageSetupProps = {
  onSave: (config: AppConfig) => Promise<void>
}

export function LanguageSetup({ onSave }: LanguageSetupProps) {
  const [nativeLang, setNativeLang] = useState('Español')
  const [targetLang, setTargetLang] = useState('Polaco')
  const [level, setLevel] = useState<CEFRLevel>('A2')

  return (
    <section className='flex min-h-screen items-center justify-center p-4'>
      <Card className='w-full max-w-xl'>
        <CardHeader>
          <CardTitle className='text-3xl'>Configura tus idiomas</CardTitle>
          <CardDescription>
            Elige tu idioma materno, el que aprendes y tu nivel actual.
          </CardDescription>
        </CardHeader>

        <CardContent className='space-y-5'>
          <div className='space-y-2'>
            <Label>Tu idioma materno</Label>
            <Select value={nativeLang} onValueChange={setNativeLang}>
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Selecciona idioma' />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((language) => (
                  <SelectItem key={language} value={language}>
                    {language}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <Label>Idioma que aprendes</Label>
            <div className='flex gap-2'>
              <Select value={targetLang} onValueChange={setTargetLang}>
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder='Selecciona idioma' />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.filter((language) => language !== nativeLang).map((language) => (
                    <SelectItem key={language} value={language}>
                      {language}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={level} onValueChange={(value) => setLevel(value as CEFRLevel)}>
                <SelectTrigger className='w-[96px]'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((currentLevel) => (
                    <SelectItem key={currentLevel} value={currentLevel}>
                      {currentLevel === '0' ? 'Nivel 0' : currentLevel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className='space-y-2'>
            <div className='grid grid-cols-4 gap-1.5 sm:grid-cols-7'>
              {LEVELS.map((currentLevel) => (
                <Button
                  key={currentLevel}
                  type='button'
                  onClick={() => setLevel(currentLevel)}
                  variant={level === currentLevel ? 'default' : 'outline'}
                  size='sm'
                >
                  {currentLevel === '0' ? 'Nivel 0' : currentLevel}
                </Button>
              ))}
            </div>
            <p className='text-center text-xs text-muted-foreground'>{LEVEL_DESC[level]}</p>
          </div>

          <Button type='button' onClick={() => onSave({ nativeLang, targetLang, level })} className='w-full'>
            Empezar
          </Button>
        </CardContent>
      </Card>
    </section>
  )
}

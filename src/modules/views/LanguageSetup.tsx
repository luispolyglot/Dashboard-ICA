import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LANGUAGES } from '../constants'
import type { AppConfig } from '../types'

type LanguageSetupProps = {
  onSave: (config: AppConfig) => Promise<void>
}

export function LanguageSetup({ onSave }: LanguageSetupProps) {
  const [nativeLang, setNativeLang] = useState('Español')
  const [targetLang, setTargetLang] = useState('Polaco')

  const availableTargetLanguages = useMemo(
    () => LANGUAGES.filter((language) => language !== nativeLang),
    [nativeLang],
  )

  useEffect(() => {
    if (availableTargetLanguages.includes(targetLang)) return
    setTargetLang(availableTargetLanguages[0] ?? '')
  }, [availableTargetLanguages, targetLang])

  return (
    <section className='flex min-h-screen items-center justify-center p-4'>
      <Card className='w-full max-w-xl'>
        <CardHeader>
          <CardTitle className='text-3xl'>Configura tus idiomas</CardTitle>
          <CardDescription>
            Elige tu idioma materno y el que aprendes.
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
            <Select value={targetLang} onValueChange={setTargetLang}>
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Selecciona idioma' />
              </SelectTrigger>
              <SelectContent>
                {availableTargetLanguages.map((language) => (
                  <SelectItem key={language} value={language}>
                    {language}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type='button'
            onClick={() => onSave({ nativeLang, targetLang })}
            className='w-full'
          >
            Empezar
          </Button>
        </CardContent>
      </Card>
    </section>
  )
}

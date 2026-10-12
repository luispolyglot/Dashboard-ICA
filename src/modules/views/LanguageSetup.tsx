import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { LANGUAGES } from '../constants'
import { IcaLogo } from '../game/IcaLogo'
import { LanguageCard, LanguageListPicker } from '../components/LanguagePicker'
import type { AppConfig } from '../types'
import { t } from '@/i18n'

type LanguageSetupProps = {
  onSave: (config: AppConfig) => Promise<void>
}

// Qué se ve: el resumen con los dos idiomas o la lista para elegir uno
type SetupStep = 'overview' | 'target' | 'native'

export function LanguageSetup({ onSave }: LanguageSetupProps) {
  const [nativeLang, setNativeLang] = useState(t('Español'))
  const [targetLang, setTargetLang] = useState('Polaco')
  const [step, setStep] = useState<SetupStep>('overview')

  const availableTargetLanguages = useMemo(
    () => LANGUAGES.filter((language) => language !== nativeLang),
    [nativeLang],
  )

  useEffect(() => {
    if (availableTargetLanguages.includes(targetLang)) return
    setTargetLang(availableTargetLanguages[0] ?? '')
  }, [availableTargetLanguages, targetLang])

  return (
    <section className='flex min-h-screen items-center justify-center bg-background px-4 py-8'>
      <div className='flex w-full max-w-md flex-col gap-6'>
        <div className='flex flex-col items-center gap-4 text-center'>
          <IcaLogo size={44} />
          <div>
            <h1 className='m-0 font-display text-3xl leading-tight font-extrabold tracking-tight'>{t('Configura tus idiomas')}</h1>
            <p className='m-0 mt-1 text-base font-semibold text-muted-foreground'>
              {t('Elige el idioma que aprendes y tu idioma materno.')}
            </p>
          </div>
        </div>

        {step === 'target' ? (
          <LanguageListPicker
            title={t('¿Qué idioma aprendes?')}
            value={targetLang}
            options={availableTargetLanguages}
            listClassName='max-h-[60dvh]'
            onBack={() => setStep('overview')}
            onPick={(language) => {
              setTargetLang(language)
              setStep('overview')
            }}
          />
        ) : step === 'native' ? (
          <LanguageListPicker
            title={t('¿Cuál es tu idioma materno?')}
            value={nativeLang}
            options={LANGUAGES}
            listClassName='max-h-[60dvh]'
            onBack={() => setStep('overview')}
            onPick={(language) => {
              setNativeLang(language)
              setStep('overview')
            }}
          />
        ) : (
          <>
            <div className='flex flex-col gap-3'>
              <LanguageCard label={t('Idioma que aprendes')} language={targetLang} tone='primary' onClick={() => setStep('target')} />
              <LanguageCard label={t('Tu idioma materno')} language={nativeLang} onClick={() => setStep('native')} />
            </div>

            <Button type='button' size='xl' onClick={() => onSave({ nativeLang, targetLang })} className='w-full'>
              {t('Empezar')}
            </Button>
          </>
        )}
      </div>
    </section>
  )
}

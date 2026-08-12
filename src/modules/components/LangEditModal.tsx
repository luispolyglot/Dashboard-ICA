import { useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

type LangEditModalProps = {
  config: AppConfig
  setConfig: (config: AppConfig) => void
  onClose: () => void
}

export function LangEditModal({
  config,
  setConfig,
  onClose,
}: LangEditModalProps) {
  const availableTargetLanguages = useMemo(
    () => LANGUAGES.filter((language) => language !== config.nativeLang),
    [config.nativeLang],
  )

  useEffect(() => {
    if (availableTargetLanguages.includes(config.targetLang)) return
    const nextTargetLang = availableTargetLanguages[0] ?? ''
    if (nextTargetLang === config.targetLang) return
    setConfig({ ...config, targetLang: nextTargetLang })
  }, [availableTargetLanguages, config, setConfig])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar idiomas</DialogTitle>
          <DialogDescription>
            Actualiza tu idioma materno y objetivo.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-1.5'>
            <Label>Idioma materno</Label>
            <Select
              value={config.nativeLang}
              onValueChange={(nativeLang) =>
                setConfig({ ...config, nativeLang })
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
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

          <div className='space-y-1.5'>
            <Label>Idioma objetivo</Label>
            <Select
              value={config.targetLang}
              onValueChange={(targetLang) =>
                setConfig({ ...config, targetLang })
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
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
        </div>

        <DialogFooter>
          <Button type='button' onClick={onClose}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

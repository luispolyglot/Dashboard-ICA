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
import { LANGUAGES, LEVELS } from '../constants'
import type { AppConfig, CEFRLevel } from '../types'

type LangEditModalProps = {
  config: AppConfig
  setConfig: (config: AppConfig) => void
  onClose: () => void
}

export function LangEditModal({ config, setConfig, onClose }: LangEditModalProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar idiomas</DialogTitle>
          <DialogDescription>
            Actualiza tu idioma materno, objetivo y nivel.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-1.5'>
            <Label>Idioma materno</Label>
            <Select
              value={config.nativeLang}
              onValueChange={(nativeLang) => setConfig({ ...config, nativeLang })}
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
            <Label>Idioma objetivo + nivel</Label>
            <div className='flex gap-2'>
              <Select
                value={config.targetLang}
                onValueChange={(targetLang) => setConfig({ ...config, targetLang })}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.filter((language) => language !== config.nativeLang).map((language) => (
                    <SelectItem key={language} value={language}>
                      {language}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={config.level || 'A2'}
                onValueChange={(value) => setConfig({ ...config, level: value as CEFRLevel })}
              >
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
        </div>

        <DialogFooter>
          <Button type='button' onClick={onClose}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

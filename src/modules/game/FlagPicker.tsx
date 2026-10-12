import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckIcon, FlagIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { langName, t } from '@/i18n'
import { LanguageFlag } from '../components/LanguagePicker'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { IconTile, ListRow } from './ui'
import { useMyFlags } from './languageFlag'
import { FlagInitial } from './ranking'

/**
 * «Tu bandera» in the profile (Luis, 9 Oct): the flag you show could only be changed in the
 * shop. Now it also has its own row in «Tu cuenta», with a window to pick one of your flags.
 */
export function FlagPickerRow() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const flags = useMyFlags(user?.id)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const name: string = user?.user_metadata?.display_name || user?.email?.split('@')[0] || ''
  const initial = name.trim().charAt(0).toUpperCase() || '?'

  const choose = async (lang: string | null) => {
    if (saving || flags.shown === lang) return
    setSaving(true)
    try {
      await flags.show(lang)
    } catch {
      toast.error(t('No se pudo cambiar la bandera.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <ListRow
        onClick={() => setOpen(true)}
        icon={
          flags.shown ? (
            <FlagInitial initial={initial} flag={flags.shown} size={42} />
          ) : (
            <IconTile tone='gold' size={42}>
              <FlagIcon className='size-[22px]' strokeWidth={2.5} aria-hidden='true' />
            </IconTile>
          )
        }
        title={t('Tu bandera')}
        text={
          flags.shown
            ? t('{lang} · sale en tu inicial y en el ranking', { lang: langName(flags.shown) })
            : flags.owned.length > 0
              ? t('Ahora no muestras ninguna')
              : t('Consíguela en la tienda de ICA Coins')
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Tu bandera')}</DialogTitle>
            <DialogDescription>
              {flags.owned.length > 0
                ? t('Elige cuál sale de fondo en tu inicial, en tu perfil y en el ranking.')
                : t('Aún no tienes ninguna. La bandera de tu idioma se compra con ICA Coins en la tienda.')}
            </DialogDescription>
          </DialogHeader>

          {flags.owned.length > 0 ? (
            <div className='flex flex-col gap-2' role='radiogroup' aria-label={t('Tu bandera')}>
              {flags.owned.map((lang) => {
                const selected = flags.shown === lang
                return (
                  <button
                    key={lang}
                    type='button'
                    role='radio'
                    aria-checked={selected}
                    disabled={saving}
                    onClick={() => void choose(lang)}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left font-extrabold transition-colors',
                      selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted',
                    )}
                  >
                    <FlagInitial initial={initial} flag={lang} size={40} />
                    <span className='min-w-0 flex-1'>{langName(lang)}</span>
                    <span className='inline-flex overflow-hidden rounded-[5px] ring-1 ring-black/10'>
                      <LanguageFlag language={lang} size={30} />
                    </span>
                    {selected ? <CheckIcon className='size-5 text-primary' strokeWidth={3} aria-hidden='true' /> : null}
                  </button>
                )
              })}
              <button
                type='button'
                role='radio'
                aria-checked={flags.shown === null}
                disabled={saving}
                onClick={() => void choose(null)}
                className={cn(
                  'flex items-center justify-between rounded-2xl border-2 px-3 py-3 text-left font-extrabold transition-colors',
                  flags.shown === null ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted',
                )}
              >
                {t('Sin bandera')}
                {flags.shown === null ? <CheckIcon className='size-5 text-primary' strokeWidth={3} aria-hidden='true' /> : null}
              </button>
            </div>
          ) : null}

          <Button
            type='button'
            variant={flags.owned.length > 0 ? 'outline' : 'gold'}
            className='w-full'
            onClick={() => {
              setOpen(false)
              navigate(DASHBOARD_ROUTES.fichas)
            }}
          >
            {flags.owned.length > 0 ? t('Más banderas en la tienda') : t('Ir a la tienda')}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}

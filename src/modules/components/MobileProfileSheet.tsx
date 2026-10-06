import { CoachingInviteCard, useCoachingInviteSmall } from './CoachingInvite'
import { t, tn, langName } from '@/i18n'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRightIcon,
  BarChart3Icon,
  BellIcon,
  CalendarDaysIcon,
  CameraIcon,
  ChevronDownIcon,
  ClipboardCheckIcon,
  CoinsIcon,
  SpeechIcon,
  GraduationCapIcon,
  LineChartIcon,
  ListChecksIcon,
  LogOutIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  TrophyIcon,
  UsersIcon,
  Volume2Icon,
  VolumeXIcon,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/utils'
import { useTheme } from '@/theme/ThemeContext'
import { useDashboardContext } from '../context/DashboardContext'
import { fichasFormatter, useFichas } from '../game/fichas'
import { FichaIcon } from '../game/icons'
import { ChatProfileRow } from '../game/ChatProfileRow'
import { ChatQuickButton } from '../game/ChatQuickButton'
import {
  LevelAvatar,
  memberSinceLabel,
  MyFeaturedBadge,
  ProfileGameSummary,
} from '../game/ProfileGameSummary'
import { isGameSoundEnabled, setGameSoundEnabled } from '../game/sfx'
import { isPronunciationEnabled, setPronunciationEnabled } from '../pronunciation/pronunciation'
import { IconTile, ListRow, RowGroup, SectionLabel, type Tone } from '../game/ui'
import { useProfileAccess } from '../hooks/useProfileAccess'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { IcaTestGlyph } from './IcaTestParts'
import { LanguageFlag } from './LanguagePicker'
import { PendingReviewDot } from './PendingReviewDot'

/** Acceso rápido: tarjeta pulsable con icono grande de color (4 en fila). */
function QuickTile({
  to,
  icon,
  tone,
  label,
  alert,
  badge,
  onNavigate,
}: {
  to: string
  icon: ReactNode
  tone: Tone
  label: string
  alert?: ReactNode
  badge?: ReactNode
  onNavigate: () => void
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className='ica-panel ica-press relative flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-1 pt-2.5 pb-2 text-center'
    >
      {alert ? <span className='absolute top-2 right-2'>{alert}</span> : null}
      <span className='relative'>
        <IconTile tone={tone} size={40}>
          {icon}
        </IconTile>
        {badge ? <span className='absolute -right-2.5 -bottom-1.5'>{badge}</span> : null}
      </span>
      <span className='w-full truncate text-xs leading-tight font-extrabold'>{label}</span>
    </Link>
  )
}

/** Icono de lucide con el grosor de la app. */
function Glyph({ icon: Icon }: { icon: typeof BellIcon }) {
  return <Icon className='size-[22px]' strokeWidth={2.5} aria-hidden='true' />
}

/** ICA Coins como cuarto acceso rápido: solo se monta con el panel abierto (así no pide el saldo sin necesidad). */
function FichasQuickTile({ userId, onNavigate }: { userId: string | undefined; onNavigate: () => void }) {
  const { total } = useFichas(userId)
  return (
    <QuickTile
      to={DASHBOARD_ROUTES.fichas}
      tone='gold'
      icon={<FichaIcon size={26} />}
      label={t('ICA Coins')}
      badge={
        total === null ? null : (
          <span
            className='flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-black tabular-nums'
            style={{ background: 'var(--ica-gold)', color: '#4a3200', boxShadow: '0 2px 0 var(--ica-gold-edge)' }}
            aria-label={t('Tienes {n} ICA Coins', { n: fichasFormatter.format(total) })}
          >
            {fichasFormatter.format(total)}
          </span>
        )
      }
      onNavigate={onNavigate}
    />
  )
}

/**
 * Perfil en móvil: una pantalla completa (pestaña «Perfil» de la barra de abajo).
 * Arriba tu nombre, nivel e insignias; luego accesos rápidos, tu racha y el resto en bloques.
 * Lo menos usado (nombre, contraseña) está en «Ajustes de cuenta».
 */
export function MobileProfileScreen({
  hasIcaTestAlert,
  hasCoachingAlert,
}: {
  hasIcaTestAlert: boolean
  hasCoachingAlert: boolean
}) {
  const { user, signOut } = useAuth()
  const { resolvedTheme, setTheme } = useTheme()
  const { config, setShowLangModal } = useDashboardContext()
  const access = useProfileAccess(config?.targetLang, true)
  const [adminExpanded, setAdminExpanded] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [soundOn, setSoundOn] = useState(isGameSoundEnabled)
  const [pronunciationOn, setPronunciationOn] = useState(isPronunciationEnabled)

  const metadata = user?.user_metadata ?? {}
  const displayName: string =
    metadata.display_name || user?.email?.split('@')[0] || t('Usuario')
  const memberSince = memberSinceLabel(user?.created_at)

  // En una página no hay nada que cerrar: los enlaces navegan sin más.
  const close = () => undefined

  const handleLogout = async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      await signOut()
    } finally {
      setIsLoggingOut(false)
    }
  }

  const hasCoaching = access.canSeeCoachingPersonalized || access.canManageCoaching
  const hasAdmin = access.canSeeAdminAnalytics || access.isSuperAdmin
  const pendingCoachingNotes = access.pendingCoachingNotes
  const showCoachingInvite = access.loaded && (!hasCoaching || access.canManageCoaching)
  const [coachingInviteSmall, makeCoachingInviteSmall] = useCoachingInviteSmall()
  const showCoachingAlert =
    hasCoachingAlert || access.pendingCoachingSessions > 0

  return (
    <div className='mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-2 pb-8'>
          <div>
            <div className='flex items-center gap-3'>
              {/* El anillo tiene el color de tu nivel real. Al tocarlo: ajustes de cuenta. */}
              <Link
                to={DASHBOARD_ROUTES.profileAccount}
                className='shrink-0 rounded-full transition-transform active:scale-95'
                aria-label={t('Ajustes de cuenta')}
              >
                <LevelAvatar size={56} />
              </Link>
              <div className='min-w-0 flex-1'>
                <div className='flex min-w-0 items-center gap-2'>
                  {/* El nombre puede ocupar dos líneas: así la insignia siempre se ve entera */}
                  <h1 className='m-0 line-clamp-2 min-w-0 font-display text-[22px] leading-tight font-extrabold break-words'>
                    {displayName}
                  </h1>
                  <MyFeaturedBadge size={44} />
                </div>
                {memberSince ? (
                  <p className='truncate text-xs font-semibold text-muted-foreground'>
                    {memberSince}
                  </p>
                ) : null}
              </div>
            </div>

            <div className='mt-3 flex gap-2'>
              <ChatQuickButton className='size-11' onNavigate={close} />
              <button
                type='button'
                onClick={() => setShowLangModal(true)}
                className='ica-press flex h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl border-2 border-border bg-card px-3 text-sm font-extrabold dark:bg-transparent'
                style={{ boxShadow: '0 3px 0 var(--border)' }}
                aria-label={config ? t('Idiomas: {native} a {target}', { native: langName(config.nativeLang), target: langName(config.targetLang) }) : t('Idiomas')}
              >
                {config ? (
                  <>
                    <LanguageFlag language={config.nativeLang} size={24} />
                    <ArrowRightIcon className='size-3.5 shrink-0 text-muted-foreground' strokeWidth={2.8} aria-hidden='true' />
                    <LanguageFlag language={config.targetLang} size={24} />
                    <span className='truncate'>{langName(config.targetLang)}</span>
                  </>
                ) : (
                  <span className='truncate'>{t('Idiomas')}</span>
                )}
              </button>
              <button
                type='button'
                onClick={() =>
                  setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
                }
                className='ica-press flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border-2 border-border bg-card px-3 text-sm font-extrabold dark:bg-transparent'
                style={{ boxShadow: '0 3px 0 var(--border)' }}
                aria-label={t('Cambiar tema')}
              >
                {resolvedTheme === 'dark' ? (
                  <MoonIcon className='size-4' strokeWidth={2.6} style={{ color: 'var(--ica-c)' }} aria-hidden='true' />
                ) : (
                  <SunIcon className='size-4' strokeWidth={2.6} style={{ color: 'var(--ica-gold-edge)' }} aria-hidden='true' />
                )}
                {resolvedTheme === 'dark' ? t('Oscuro') : t('Claro')}
              </button>
            </div>
          </div>

          <div className='flex flex-col gap-4'>
            {/* Tu progreso: nivel real e insignias */}
            <ProfileGameSummary onNavigate={close} />

            {/* Accesos rápidos */}
            <div className='grid grid-cols-4 gap-2'>
              <QuickTile
                to={DASHBOARD_ROUTES.myAnalytics}
                tone='i'
                icon={<Glyph icon={BarChart3Icon} />}
                label={t('Estadísticas')}
                onNavigate={close}
              />
              <QuickTile
                to={DASHBOARD_ROUTES.testsIca}
                tone='c'
                icon={<IcaTestGlyph size={26} />}
                label={t('Tests ICA')}
                alert={
                  hasIcaTestAlert ? (
                    <PendingReviewDot title={t('Tienes un test ICA disponible este mes.')} />
                  ) : null
                }
                onNavigate={close}
              />
              <QuickTile
                to={DASHBOARD_ROUTES.calendarIcademy}
                tone='a'
                icon={<Glyph icon={CalendarDaysIcon} />}
                label={t('Calendario')}
                onNavigate={close}
              />
              <FichasQuickTile userId={user?.id} onNavigate={close} />
            </div>

            {/* Comunidad: el track de Instagram (la racha ya está arriba, en la barra; Luis, 6 oct) */}
            <div>
              <SectionLabel>{t('Comunidad')}</SectionLabel>
              <div className='flex flex-col gap-3'>
                <RowGroup>
                  <div onClick={close}>
                    <ListRow
                      to={DASHBOARD_ROUTES.instagramTrackPosts}
                      icon={
                        <IconTile tone='c' size={42}>
                          <Glyph icon={CameraIcon} />
                        </IconTile>
                      }
                      title={t('Track Instagram')}
                      text={t('Cada día con post suma puntos al ranking')}
                    />
                  </div>
                </RowGroup>
              </div>
            </div>

            {/* Quien no está en el coaching ve la invitación; los admins de coaching, como vista previa. */}
            {showCoachingInvite && !coachingInviteSmall && (
              <div>
                <SectionLabel>{access.canManageCoaching ? t('Coaching (vista de alumno)') : t('Coaching')}</SectionLabel>
                <CoachingInviteCard preview={access.canManageCoaching} onDismiss={makeCoachingInviteSmall} />
              </div>
            )}

            {hasCoaching && (
              <div>
                <SectionLabel>{t('Coaching')}</SectionLabel>
                <RowGroup>
                  {access.canSeeCoachingPersonalized && (
                    <div onClick={close}>
                      <ListRow
                        to={DASHBOARD_ROUTES.coachingPersonalized}
                        icon={
                          <IconTile tone='i' size={42}>
                            <Glyph icon={GraduationCapIcon} />
                          </IconTile>
                        }
                        title={t('Coaching personalizado')}
                        text={t('Clases, feedback y objetivos ICA')}
                      />
                    </div>
                  )}
                  {access.canManageCoaching && (
                    <div onClick={close}>
                      <ListRow
                        to={DASHBOARD_ROUTES.manageCoaching}
                        icon={
                          <IconTile tone='i' size={42}>
                            <Glyph icon={UsersIcon} />
                          </IconTile>
                        }
                        title={t('Administrar coaching')}
                        text={
                          access.pendingCoachingSessions > 0
                            ? tn(pendingCoachingNotes, '{n} nota pendiente de revisión', '{n} notas pendientes de revisión')
                            : t('Alumnos, feedback y objetivos')
                        }
                        right={
                          showCoachingAlert ? (
                            <PendingReviewDot
                              title={t('Tienes notas maestras pendientes de revisión.')}
                              useIconSpeaker
                            />
                          ) : undefined
                        }
                      />
                    </div>
                  )}
                </RowGroup>
              </div>
            )}

            {/* Más: lo que se usa menos */}
            <div>
              <SectionLabel>{t('Más')}</SectionLabel>
              <RowGroup>
                <div onClick={close}>
                  <ListRow
                    to={DASHBOARD_ROUTES.trackers}
                    icon={
                      <IconTile tone='i' size={42}>
                        <Glyph icon={LineChartIcon} />
                      </IconTile>
                    }
                    title={t('Trackers')}
                    text={t('Pronunciación, fluidez e improvisación')}
                  />
                </div>
                <div onClick={close}>
                  <ListRow
                    to={DASHBOARD_ROUTES.manageNotifications}
                    icon={
                      <IconTile tone='gold' size={42}>
                        <Glyph icon={BellIcon} />
                      </IconTile>
                    }
                    title={t('Notificaciones')}
                    text={t('Recordatorios de racha y hábitos')}
                  />
                </div>
                {config?.targetLang ? <ChatProfileRow targetLang={config.targetLang} onNavigate={close} /> : null}
                <button
                  type='button'
                  onClick={() => {
                    const next = !pronunciationOn
                    setPronunciationEnabled(next)
                    setPronunciationOn(next)
                  }}
                  className='flex w-full items-center gap-3 py-3 text-left'
                  aria-pressed={pronunciationOn}
                >
                  <IconTile tone={pronunciationOn ? 'i' : 'neutral'} size={42}>
                    <Glyph icon={SpeechIcon} />
                  </IconTile>
                  <span className='min-w-0 flex-1'>
                    <span className='block leading-tight font-extrabold'>{t('Pronunciación')}</span>
                    <span className='mt-0.5 block text-xs font-semibold text-muted-foreground'>
                      {pronunciationOn ? t('Visible · beaucoup → /bocú/') : t('Oculta · beaucoup → /bocú/')}
                    </span>
                  </span>
                  <span
                    className='relative h-7 w-12 shrink-0 rounded-full transition-colors'
                    style={{ background: pronunciationOn ? 'var(--ica-ok)' : 'var(--border-strong)' }}
                    aria-hidden='true'
                  >
                    <span
                      className={cn(
                        'absolute top-1 size-5 rounded-full bg-white shadow transition-[left]',
                        pronunciationOn ? 'left-6' : 'left-1',
                      )}
                    />
                  </span>
                </button>
                <button
                  type='button'
                  onClick={() => {
                    const next = !soundOn
                    setGameSoundEnabled(next)
                    setSoundOn(next)
                  }}
                  className='flex w-full items-center gap-3 py-3 text-left'
                  aria-pressed={soundOn}
                >
                  <IconTile tone={soundOn ? 'ok' : 'neutral'} size={42}>
                    <Glyph icon={soundOn ? Volume2Icon : VolumeXIcon} />
                  </IconTile>
                  <span className='min-w-0 flex-1'>
                    <span className='block leading-tight font-extrabold'>{t('Sonidos')}</span>
                    <span className='mt-0.5 block text-xs font-semibold text-muted-foreground'>
                      {soundOn ? t('Activados · al abrir el cofre y al completar el ciclo') : t('Apagados · al abrir el cofre y al completar el ciclo')}
                    </span>
                  </span>
                  {/* Interruptor */}
                  <span
                    className='relative h-7 w-12 shrink-0 rounded-full transition-colors'
                    style={{ background: soundOn ? 'var(--ica-ok)' : 'var(--border-strong)' }}
                    aria-hidden='true'
                  >
                    <span
                      className={cn(
                        'absolute top-1 size-5 rounded-full bg-white shadow transition-[left]',
                        soundOn ? 'left-6' : 'left-1',
                      )}
                    />
                  </span>
                </button>
                <div onClick={close}>
                  <ListRow
                    to={DASHBOARD_ROUTES.profileAccount}
                    icon={
                      <IconTile tone='neutral' size={42}>
                        <Glyph icon={SettingsIcon} />
                      </IconTile>
                    }
                    title={t('Ajustes de cuenta')}
                    text={t('Nombre y contraseña')}
                  />
                </div>
              </RowGroup>
            </div>

            {/* Closed with the X: it stays here, small, between account settings and log out. */}
            {showCoachingInvite && coachingInviteSmall ? <CoachingInviteCard compact /> : null}

            {hasAdmin && (
              <div>
                <button
                  type='button'
                  onClick={() => setAdminExpanded((value) => !value)}
                  className='mb-2 flex w-full items-center justify-between py-1'
                  aria-expanded={adminExpanded}
                >
                  <span className='ica-label'>{t('Administración')}</span>
                  <ChevronDownIcon
                    className={cn(
                      'size-5 text-muted-foreground transition-transform',
                      adminExpanded && 'rotate-180',
                    )}
                    strokeWidth={2.6}
                    aria-hidden='true'
                  />
                </button>
                {adminExpanded && (
                  <RowGroup>
                    {access.canSeeAdminAnalytics && (
                      <AdminRow to={DASHBOARD_ROUTES.analytics} icon={BarChart3Icon} label={t('Analíticas admin')} onNavigate={close} />
                    )}
                    {access.isSuperAdmin && (
                      <>
                        <AdminRow to={DASHBOARD_ROUTES.manageWhitelist} icon={ListChecksIcon} label={t('Whitelist')} onNavigate={close} />
                        <AdminRow to={DASHBOARD_ROUTES.managePregunticaQuestions} icon={ClipboardCheckIcon} label={t('PreguntICA')} onNavigate={close} />
                        <AdminRow to={DASHBOARD_ROUTES.managePregunticaTokens} icon={CoinsIcon} label={t('ICA Coins de usuarios')} onNavigate={close} />
                        <AdminRow to={DASHBOARD_ROUTES.calendarIcademyManage} icon={CalendarDaysIcon} label={t('Calendario ICADEMY')} onNavigate={close} />
                        <AdminRow to={DASHBOARD_ROUTES.calendarIcademyTeachers} icon={UsersIcon} label={t('Profesores ICADEMY')} onNavigate={close} />
                        <AdminRow to={DASHBOARD_ROUTES.historicLeaderboard} icon={TrophyIcon} label={t('Histórico leaderboard')} onNavigate={close} />
                      </>
                    )}
                  </RowGroup>
                )}
              </div>
            )}

            <button
              type='button'
              onClick={() => void handleLogout()}
              disabled={isLoggingOut}
              className='ica-press flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 text-base font-extrabold disabled:opacity-60'
              style={{
                borderColor: 'color-mix(in oklab, var(--ica-bad-strong) 35%, var(--border))',
                color: 'var(--ica-bad-ink)',
                boxShadow: '0 3px 0 color-mix(in oklab, var(--ica-bad-strong) 25%, var(--border))',
              }}
            >
              <LogOutIcon className='size-5' strokeWidth={2.6} aria-hidden='true' />
              {isLoggingOut ? t('Cerrando sesión...') : t('Cerrar sesión')}
            </button>
          </div>
    </div>
  )
}

/** Fila del bloque de administración (discreta, en gris). */
function AdminRow({
  to,
  icon,
  label,
  onNavigate,
}: {
  to: string
  icon: typeof BellIcon
  label: string
  onNavigate: () => void
}) {
  return (
    <div onClick={onNavigate}>
      <ListRow
        to={to}
        icon={
          <IconTile tone='neutral' size={38}>
            <Glyph icon={icon} />
          </IconTile>
        }
        title={label}
      />
    </div>
  )
}

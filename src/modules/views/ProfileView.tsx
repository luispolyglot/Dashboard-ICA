import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  BarChart3Icon,
  BellIcon,
  CalendarDaysIcon,
  //CameraIcon,
  CheckIcon,
  ClipboardCheckIcon,
  GraduationCapIcon,
  LanguagesIcon,
  LineChartIcon,
  ListChecksIcon,
  LogOutIcon,
  MoonIcon,
  PencilIcon,
  SunIcon,
  TrophyIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PendingReviewDot } from '../components/PendingReviewDot'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTheme } from '@/theme/ThemeContext'
import { useIcaTestsOverview } from '../hooks/useIcaTestsOverview'
import { fetchAdminRole } from '../services/adminAnalytics'
import {
  fetchCoachingAccess,
  fetchCoachingPendingReviewSummary,
  fetchMyCoachingDashboard,
} from '../services/coaching'
import { DASHBOARD_ROUTES } from '../routes/paths'
import {
  ICA_TEST_MAX_WORDS_PER_ITEM,
  ICA_TEST_REQUIRED_WORDS,
} from '../services/icaTests'
import type { AppConfig, Lexicard } from '../types'

type ProfileViewProps = {
  config: AppConfig | null
  cards: Lexicard[]
  onEditLanguages: () => void
}

function formatDate(value?: string): string {
  if (!value) return 'No disponible'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No disponible'
  return date.toLocaleString()
}

export function ProfileView({
  config,
  cards,
  onEditLanguages,
}: ProfileViewProps) {
  const { user, signOut, changePassword, updateDisplayName } = useAuth()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [confirmNextPassword, setConfirmNextPassword] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const [canSeeAdminAnalytics, setCanSeeAdminAnalytics] = useState(false)
  const [canManageWhitelist, setCanManageWhitelist] = useState(false)
  const [canManageCalendarIcademy, setCanManageCalendarIcademy] =
    useState(false)
  const [canSeeHistoricLeaderboard, setCanSeeHistoricLeaderboard] =
    useState(false)
  const [canSeeCoachingPersonalized, setCanSeeCoachingPersonalized] =
    useState(false)
  const [canManageCoaching, setCanManageCoaching] = useState(false)
  const [pendingCoachingSessions, setPendingCoachingSessions] = useState(0)
  const [pendingCoachingNotes, setPendingCoachingNotes] = useState(0)
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSuccess, setNameSuccess] = useState<string | null>(null)
  const [isSavingName, setIsSavingName] = useState(false)

  const {
    currentMonthCode,
    hasCurrentMonthTest,
    canTakeCurrentMonth,
    canHighlightCurrentMonth,
    featureAvailable,
    wordPool,
  } = useIcaTestsOverview({
    targetLang: config?.targetLang,
    nativeLang: config?.nativeLang,
    cards,
  })

  const metadata = useMemo(
    () => user?.user_metadata ?? {},
    [user?.user_metadata],
  )
  const displayName =
    metadata.display_name || user?.email?.split('@')[0] || 'Usuario'
  const cleanCurrentDisplayName = displayName.trim()
  const cleanNameDraft = nameDraft.trim()
  const isNameChanged = cleanNameDraft !== cleanCurrentDisplayName
  const canSaveName = cleanNameDraft.length >= 3 && isNameChanged

  useEffect(() => {
    if (!isEditingName) {
      setNameDraft(displayName)
    }
  }, [displayName, isEditingName])

  useEffect(() => {
    let isMounted = true

    const run = async () => {
      const [role, coachingAccess, coachingMemberships, pendingSummary] =
        await Promise.all([
          fetchAdminRole(),
          fetchCoachingAccess().catch(() => null),
          fetchMyCoachingDashboard(config?.targetLang).catch(() => []),
          fetchCoachingPendingReviewSummary().catch(() => ({
            hasPendingReviews: false,
            pendingSessions: 0,
            pendingNotes: 0,
          })),
        ])
      if (!isMounted) return

      setCanSeeAdminAnalytics(role === 'admin' || role === 'super_admin')
      setCanManageWhitelist(role === 'super_admin')
      setCanManageCalendarIcademy(role === 'super_admin')
      setCanSeeHistoricLeaderboard(role === 'super_admin')
      setCanSeeCoachingPersonalized(
        Array.isArray(coachingMemberships) && coachingMemberships.length > 0,
      )
      setCanManageCoaching(Boolean(coachingAccess?.isCoachingAdmin))
      setPendingCoachingSessions(pendingSummary.pendingSessions)
      setPendingCoachingNotes(pendingSummary.pendingNotes)
    }

    void run()

    return () => {
      isMounted = false
    }
  }, [user?.id, config?.targetLang])

  const handleLogout = async (): Promise<void> => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      await signOut()
    } finally {
      setIsLoggingOut(false)
    }
  }

  const handlePasswordChange = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(null)

    if (nextPassword.length < 6) {
      setPasswordError('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }

    if (nextPassword !== confirmNextPassword) {
      setPasswordError('Las nuevas contraseñas no coinciden.')
      return
    }

    setIsChangingPassword(true)
    try {
      await changePassword(currentPassword, nextPassword)
      setCurrentPassword('')
      setNextPassword('')
      setConfirmNextPassword('')
      setPasswordSuccess('Contraseña actualizada correctamente.')
      window.setTimeout(() => setIsPasswordModalOpen(false), 900)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar la contraseña'
      setPasswordError(message)
    } finally {
      setIsChangingPassword(false)
    }
  }

  const handleStartNameEdit = () => {
    setNameDraft(displayName)
    setNameError(null)
    setNameSuccess(null)
    setIsEditingName(true)
  }

  const handleCancelNameEdit = () => {
    if (isSavingName) return
    setNameDraft(displayName)
    setNameError(null)
    setIsEditingName(false)
  }

  const handleSaveName = async (): Promise<void> => {
    const cleanName = nameDraft.trim()
    if (cleanName === cleanCurrentDisplayName) {
      setNameError(null)
      setIsEditingName(false)
      return
    }

    if (cleanName.length < 3) {
      setNameError('El nombre debe tener al menos 3 caracteres.')
      return
    }

    setNameError(null)
    setNameSuccess(null)
    setIsSavingName(true)
    try {
      await updateDisplayName(cleanName)
      setIsEditingName(false)
      setNameSuccess('Nombre actualizado correctamente.')
      window.setTimeout(() => setNameSuccess(null), 2000)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo actualizar el nombre.'
      setNameError(message)
    } finally {
      setIsSavingName(false)
    }
  }

  const handleNameKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      handleCancelNameEdit()
    }
  }

  return (
    <section className='mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-5 py-8'>
      <h2 className='mb-1 font-serif text-3xl font-bold'>👤 Perfil</h2>
      <p className='mb-6 text-sm text-muted-foreground'>
        Gestiona tu cuenta, idioma y apariencia desde un solo lugar.
      </p>

      <div className='grid gap-4'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <UserIcon className='h-4 w-4' />
              Información de usuario
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-2 text-sm'>
            <div className='space-y-1'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='text-muted-foreground'>Nombre:</span>
                {!isEditingName && <span>{displayName}</span>}

                {isEditingName ? (
                  <form
                    className='flex min-w-0 flex-1 items-center gap-1.5'
                    onSubmit={(event) => {
                      event.preventDefault()
                      void handleSaveName()
                    }}
                  >
                    <Input
                      value={nameDraft}
                      onChange={(event) => {
                        setNameDraft(event.target.value)
                        setNameError(null)
                        setNameSuccess(null)
                      }}
                      onKeyDown={handleNameKeyDown}
                      minLength={3}
                      required
                      autoFocus
                      className='h-8 max-w-56'
                      aria-label='Editar nombre'
                    />
                    <Button
                      type='submit'
                      variant='outline'
                      size='icon'
                      className='h-8 w-8'
                      aria-label='Guardar nombre'
                      disabled={isSavingName || !canSaveName}
                    >
                      <CheckIcon className='h-4 w-4' />
                    </Button>
                    <Button
                      type='button'
                      variant='outline'
                      size='icon'
                      className='h-8 w-8'
                      aria-label='Cancelar edición de nombre'
                      onClick={handleCancelNameEdit}
                      disabled={isSavingName}
                    >
                      <XIcon className='h-4 w-4' />
                    </Button>
                  </form>
                ) : (
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className='h-7 w-7'
                    aria-label='Editar nombre'
                    onClick={handleStartNameEdit}
                  >
                    <PencilIcon className='h-4 w-4' />
                  </Button>
                )}
              </div>
              {nameError && (
                <p className='text-sm text-destructive'>{nameError}</p>
              )}
              {nameSuccess && (
                <p className='text-sm text-emerald-500'>{nameSuccess}</p>
              )}
            </div>
            <p>
              <span className='text-muted-foreground'>Email:</span>{' '}
              {user?.email || 'No disponible'}
            </p>
            <p>
              <span className='text-muted-foreground'>Creado:</span>{' '}
              {formatDate(user?.created_at)}
            </p>
            <p>
              <span className='text-muted-foreground'>Último acceso:</span>{' '}
              {formatDate(user?.last_sign_in_at)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <LanguagesIcon className='h-4 w-4' />
              Configurar idioma de estudio
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <p className='text-sm text-muted-foreground'>
              {config
                ? `${config.nativeLang} -> ${config.targetLang} (${config.level || 'A2'})`
                : 'No hay configuración de idiomas'}
            </p>
            <Button type='button' variant='outline' onClick={onEditLanguages}>
              <LanguagesIcon />
              Cambiar idiomas
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Tema ({resolvedTheme === 'dark' ? 'Oscuro' : 'Claro'})
            </CardTitle>
          </CardHeader>
          <CardContent className='flex flex-wrap gap-2'>
            <Button
              type='button'
              variant={theme === 'light' ? 'default' : 'outline'}
              onClick={() => setTheme('light')}
            >
              <SunIcon />
              Claro
            </Button>
            <Button
              type='button'
              variant={theme === 'dark' ? 'default' : 'outline'}
              onClick={() => setTheme('dark')}
            >
              <MoonIcon />
              Oscuro
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <BellIcon className='h-4 w-4' />
              Notificaciones
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <p className='text-sm text-muted-foreground'>
              Configura recordatorios de rachas y avisos de habito por push.
            </p>
            <Button type='button' variant='outline' asChild>
              <Link to={DASHBOARD_ROUTES.manageNotifications}>
                Gestionar notificaciones
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <LineChartIcon className='h-4 w-4' />
              Trackers de mejora
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <p className='text-sm text-muted-foreground'>
              Carga y revisa tus trackers mensuales de pronunciación, fluidez e
              improvisación.
            </p>
            <Button type='button' variant='outline' asChild>
              <Link to={DASHBOARD_ROUTES.trackers}>
                Abrir Trackers de mejora
              </Link>
            </Button>
          </CardContent>
        </Card>
        {/* disabled for now, as it is not fully implemented yet
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <CameraIcon className='h-4 w-4' />
              Track post Instagram
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <p className='text-sm text-muted-foreground'>
              Carga el link diario de Instagram en una tabla mensual de 28 días.
              Cada fila se edita solo durante 48 horas desde su desbloqueo.
            </p>
            <Button type='button' variant='outline' asChild>
              <Link to={DASHBOARD_ROUTES.instagramTrackPosts}>
                Abrir Track post Instagram
              </Link>
            </Button>
          </CardContent>
        </Card>
*/}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <CalendarDaysIcon className='h-4 w-4' />
              Calendario ICADEMY
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <p className='text-sm text-muted-foreground'>
              Consulta los horarios de clases por idioma y filtra las sesiones
              que quieres seguir.
            </p>
            <Button type='button' variant='outline' asChild>
              <Link to={DASHBOARD_ROUTES.calendarIcademy}>
                Abrir calendario de clases
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <BarChart3Icon className='h-4 w-4' />
              Mis estadísticas mensuales
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <p className='text-sm text-muted-foreground'>
              Revisa tu actividad mensual: palabras, frases, notas maestras y
              flashcards correctas.
            </p>
            <Button type='button' variant='outline' asChild>
              <Link to={DASHBOARD_ROUTES.myAnalytics}>
                Abrir mis estadísticas
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <ClipboardCheckIcon className='h-4 w-4' />
              Tests ICA
              {canHighlightCurrentMonth && !hasCurrentMonthTest && (
                <div className='ml-4 relative size-4'>
                  <div className='absolute top-0 size-4 rounded-full animate-pulse bg-amber-300 delay-300'></div>
                  <div className='absolute top-0 size-4 rounded-full animate-ping bg-primary'></div>
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <p className='text-sm text-muted-foreground'>
              Evalúa tu vocabulario mensual con 15 equivalencias (6 segundos por
              pregunta).
            </p>

            {!featureAvailable && (
              <p className='text-sm text-muted-foreground'>
                Disponible desde mayo de 2026.
              </p>
            )}

            {featureAvailable && hasCurrentMonthTest && (
              <p className='text-sm text-emerald-600'>
                Ya completaste el test del mes actual.
              </p>
            )}

            {featureAvailable && !hasCurrentMonthTest && !wordPool.eligible && (
              <p className='text-sm text-amber-600'>
                Necesitas {ICA_TEST_REQUIRED_WORDS} palabras ICA. Priorizamos
                frases de hasta {ICA_TEST_MAX_WORDS_PER_ITEM} palabras y, si no
                alcanza, ampliamos el filtro. Tienes {wordPool.availableWords}.
              </p>
            )}

            <div className='flex flex-wrap gap-2'>
              <Button type='button' variant='outline' asChild>
                <Link to={DASHBOARD_ROUTES.testsIca}>Abrir Tests ICA</Link>
              </Button>
              {canTakeCurrentMonth && (
                <Button type='button' asChild>
                  <Link to={`${DASHBOARD_ROUTES.testsIca}/${currentMonthCode}`}>
                    Hacer test del mes
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {canSeeCoachingPersonalized && (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <GraduationCapIcon className='h-4 w-4' />
                Coaching Personalizado
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <p className='text-sm text-muted-foreground'>
                Accede a tus clases semanales, feedback de Notas Maestras y
                objetivos ICA.
              </p>
              <Button type='button' variant='outline' asChild>
                <Link to={DASHBOARD_ROUTES.coachingPersonalized}>
                  Abrir Coaching Personalizado
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {canManageCoaching && (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <UsersIcon className='h-4 w-4' />
                Administrar Coaching
                {pendingCoachingSessions > 0 && (
                  <PendingReviewDot
                    title={`Tienes ${pendingCoachingNotes} notas pendientes de revision en ${pendingCoachingSessions} sesiones.`}
                    useIconSpeaker
                  />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <p className='text-sm text-muted-foreground'>
                Gestiona usuarios por idioma/nivel, feedback y objetivos
                personalizados.
              </p>
              {pendingCoachingSessions > 0 && (
                <p className='text-sm text-amber-600'>
                  Pendientes: {pendingCoachingNotes} nota
                  {pendingCoachingNotes === 1 ? '' : 's'} en{' '}
                  {pendingCoachingSessions} sesion
                  {pendingCoachingSessions === 1 ? '' : 'es'}.
                </p>
              )}
              <Button type='button' variant='outline' asChild>
                <Link to={DASHBOARD_ROUTES.manageCoaching}>
                  Abrir panel de Coaching
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {canSeeAdminAnalytics && (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <BarChart3Icon className='h-4 w-4' />
                Analíticas Admin
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <p className='text-sm text-muted-foreground'>
                Accede al panel de métricas globales. Esta sección exige
                permisos administrativos.
              </p>
              <Button type='button' variant='outline' asChild>
                <Link to={DASHBOARD_ROUTES.analytics}>Analíticas Admin</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {canManageWhitelist && (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <ListChecksIcon className='h-4 w-4' />
                Gestionar whitelist
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <p className='text-sm text-muted-foreground'>
                Administra qué emails pueden registrarse o iniciar sesión, y
                sincroniza el CSV oficial.
              </p>
              <Button type='button' variant='outline' asChild>
                <Link to={DASHBOARD_ROUTES.manageWhitelist}>
                  Gestionar whitelist
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {canManageWhitelist && (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <ClipboardCheckIcon className='h-4 w-4' />
                Gestionar preguntas PreguntICA
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <p className='text-sm text-muted-foreground'>
                Administra el banco de preguntas en español y su cache de
                traducciones para idioma objetivo.
              </p>
              <Button type='button' variant='outline' asChild>
                <Link to={DASHBOARD_ROUTES.managePregunticaQuestions}>
                  Gestionar preguntas PreguntICA
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {canManageCalendarIcademy && (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <CalendarDaysIcon className='h-4 w-4' />
                Gestionar calendario ICADEMY
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <p className='text-sm text-muted-foreground'>
                Administra las clases y los profesores del calendario visible
                para todos los alumnos.
              </p>
              <div className='flex flex-wrap gap-2'>
                <Button type='button' variant='outline' asChild>
                  <Link to={DASHBOARD_ROUTES.calendarIcademyManage}>
                    Gestionar calendario
                  </Link>
                </Button>
                <Button type='button' variant='outline' asChild>
                  <Link to={DASHBOARD_ROUTES.calendarIcademyTeachers}>
                    Gestionar profesores
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {canSeeHistoricLeaderboard && (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <TrophyIcon className='h-4 w-4' />
                Histórico leaderboard
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <p className='text-sm text-muted-foreground'>
                Consulta los rankings mensuales cerrados por mes y año.
              </p>
              <Button type='button' variant='outline' asChild>
                <Link to={DASHBOARD_ROUTES.historicLeaderboard}>
                  Ver histórico leaderboard
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Seguridad</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <p className='text-sm text-muted-foreground'>
              Puedes actualizar tu contraseña validando primero tu contraseña
              actual.
            </p>
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                setPasswordError(null)
                setPasswordSuccess(null)
                setCurrentPassword('')
                setNextPassword('')
                setConfirmNextPassword('')
                setIsPasswordModalOpen(true)
              }}
            >
              Cambiar contraseña
            </Button>
          </CardContent>
        </Card>

        <Dialog
          open={isPasswordModalOpen}
          onOpenChange={setIsPasswordModalOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cambiar contraseña</DialogTitle>
              <DialogDescription>
                Ingresa tu contraseña actual y define una nueva.
              </DialogDescription>
            </DialogHeader>

            <form
              id='change-password-form'
              className='space-y-3'
              onSubmit={handlePasswordChange}
            >
              <div className='space-y-1.5'>
                <Label htmlFor='profile-current-password'>
                  Contraseña actual
                </Label>
                <Input
                  id='profile-current-password'
                  type='password'
                  required
                  minLength={6}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </div>

              <div className='space-y-1.5'>
                <Label htmlFor='profile-next-password'>Nueva contraseña</Label>
                <Input
                  id='profile-next-password'
                  type='password'
                  required
                  minLength={6}
                  value={nextPassword}
                  onChange={(event) => setNextPassword(event.target.value)}
                />
              </div>

              <div className='space-y-1.5'>
                <Label htmlFor='profile-next-password-confirm'>
                  Confirmar nueva contraseña
                </Label>
                <Input
                  id='profile-next-password-confirm'
                  type='password'
                  required
                  minLength={6}
                  value={confirmNextPassword}
                  onChange={(event) =>
                    setConfirmNextPassword(event.target.value)
                  }
                />
              </div>

              {passwordError && (
                <p className='text-sm text-destructive'>{passwordError}</p>
              )}
              {passwordSuccess && (
                <p className='text-sm text-emerald-500'>{passwordSuccess}</p>
              )}
            </form>

            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setIsPasswordModalOpen(false)}
                disabled={isChangingPassword}
              >
                Cancelar
              </Button>
              <Button
                type='submit'
                form='change-password-form'
                disabled={isChangingPassword}
              >
                {isChangingPassword ? 'Guardando...' : 'Guardar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div>
          <Button
            type='button'
            variant='destructive'
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
          >
            <LogOutIcon />
            {isLoggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
          </Button>
        </div>
      </div>
    </section>
  )
}

import { useMemo, useState } from 'react'
import { CalendarDaysIcon, SparklesIcon, TimerIcon, UsersIcon, ZapIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIcaChallengesOverview } from '../hooks/useIcaChallengesOverview'
import { getIcaOwnWordsConfigLabel, hasOwnWordsResult } from '../services/icaChallenges'
import { getIcaChallengePlayRoute } from '../routes/paths'
import type { IcaChallengeScope } from '../types'

type IcaChallengesViewProps = {
  targetLang: string
  nativeLang: string
}

function getChallengeStatusLabel(status: string): string {
  switch (status) {
    case 'created':
      return 'Creado'
    case 'in_progress':
      return 'En curso'
    case 'completed':
      return 'Finalizado'
    case 'cancelled':
      return 'Cancelado'
    case 'expired':
      return 'Vencido'
    case 'not_accepted':
      return 'No aceptado'
    default:
      return status
  }
}

function getResultLabel(resultType: string): string {
  switch (resultType) {
    case 'challenger_win':
      return 'Ganó desafiante'
    case 'challenged_win':
      return 'Ganó desafiado'
    case 'draw':
      return 'Empate'
    case 'cancelled':
      return 'Cancelado'
    case 'expired':
      return 'Vencido'
    case 'not_accepted':
      return 'No aceptado'
    default:
      return 'Pendiente'
  }
}

export function IcaChallengesView({ targetLang, nativeLang }: IcaChallengesViewProps) {
  const {
    enrollment,
    challenges,
    availableUsers,
    myActiveChallengesCount,
    isLoading,
    isSavingEnrollment,
    isCreatingChallenge,
    isResponding,
    currentUserId,
    error,
    setEnrollmentActive,
    createOwnWordsChallenge,
    respondInvitation,
    refreshAvailableUsers,
  } = useIcaChallengesOverview({
    targetLang,
    nativeLang,
  })

  const isEnrolled = Boolean(enrollment?.isActive)
  const [challengeScope, setChallengeScope] = useState<IcaChallengeScope>('language')
  const [rounds, setRounds] = useState<3 | 5 | 10>(10)
  const [responseSeconds, setResponseSeconds] = useState(5)
  const [durationDays, setDurationDays] = useState<1 | 2 | 3>(1)
  const [isChallengeModalOpen, setIsChallengeModalOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  const activeChallenges = useMemo(
    () =>
      challenges.filter(
        (challenge) =>
          challenge.status === 'created' || challenge.status === 'in_progress',
      ),
    [challenges],
  )

  const canCreateMore = myActiveChallengesCount < 3
  const selectedUser =
    availableUsers.find((user) => user.userId === selectedUserId) ?? null
  const historyChallenges = useMemo(
    () =>
      challenges.filter(
        (challenge) =>
          challenge.status !== 'created' && challenge.status !== 'in_progress',
      ),
    [challenges],
  )

  const loadScope = async (scope: IcaChallengeScope) => {
    setChallengeScope(scope)
    await refreshAvailableUsers(scope)
  }

  const handleEnrollmentToggle = async (next: boolean) => {
    try {
      await setEnrollmentActive(next)
      toast.success(
        next
          ? 'Inscripción activa en Desafíos ICA.'
          : 'Te diste de baja de Desafíos ICA.',
      )
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar tu inscripción.',
      )
    }
  }

  const handleRespondInvitation = async (challengeId: string, accept: boolean) => {
    try {
      await respondInvitation(challengeId, accept)
      toast.success(accept ? 'Desafío aceptado.' : 'Desafío rechazado.')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'No se pudo responder el desafío.',
      )
    }
  }

  const handleCreateChallenge = async (challengedUserId: string) => {
    if (!isEnrolled) {
      toast.error('Activa tu inscripción antes de crear desafíos.')
      return
    }

    if (!canCreateMore) {
      toast.error('Ya tienes 3 desafíos activos. Cierra uno para crear otro.')
      return
    }

    try {
      await createOwnWordsChallenge({
        challengedUserId,
        scope: challengeScope,
        config: {
          rounds,
          responseSeconds,
        },
        durationSeconds: durationDays * 24 * 60 * 60,
      })
      setIsChallengeModalOpen(false)
      setSelectedUserId(null)
      toast.success('Desafío enviado. Avisamos al competidor por notificación.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear el desafío.'
      if (message.includes('ICA_CHALLENGE_ACTIVE_LIMIT_REACHED')) {
        toast.error('Ya alcanzaste el máximo de 3 desafíos activos.')
        return
      }
      if (message.includes('ICA_CHALLENGE_OPPONENT_ACTIVE_LIMIT_REACHED')) {
        toast.error('Ese usuario ya tiene 3 desafíos activos.')
        return
      }
      if (message.includes('ICA_CHALLENGE_ACTIVE_PAIR_EXISTS')) {
        toast.error('Ya existe un desafío activo entre ustedes.')
        return
      }
      toast.error(message)
    }
  }

  const openChallengeModal = (challengedUserId: string) => {
    setSelectedUserId(challengedUserId)
    setIsChallengeModalOpen(true)
  }

  return (
    <section className='mx-auto w-full max-w-5xl flex-1 p-4 pb-24 lg:pb-4'>
      <div className='mb-6 flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h2 className='font-serif text-3xl font-bold'>Desafíos ICA</h2>
          <p className='text-sm text-muted-foreground'>
            Competencias offline con turnos por notificaciones push.
          </p>
        </div>
      </div>

      <div className='flex flex-col gap-4'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <UsersIcon className='h-4 w-4' />
              Inscripción a desafíos
            </CardTitle>
            <CardDescription>
              Debes estar activo para aparecer como competidor y recibir retos.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3 text-sm'>
            <div className='flex items-center justify-between gap-3 rounded-lg border bg-muted/25 p-3'>
              <div>
                <p className='font-medium'>Estado de inscripción</p>
                <p className='text-xs text-muted-foreground'>
                  Idioma activo: {nativeLang} -&gt; {targetLang}
                </p>
              </div>
              <Switch
                checked={isEnrolled}
                disabled={isLoading || isSavingEnrollment}
                onCheckedChange={(checked) => void handleEnrollmentToggle(checked)}
                aria-label='Activar inscripción a desafíos ICA'
              />
            </div>

            {!isEnrolled && (
              <p className='text-amber-600'>
                Tu inscripción está inactiva. No podrás desafiar ni ser desafiado.
              </p>
            )}

            <p className='text-xs text-muted-foreground'>
              Desafíos activos: {myActiveChallengesCount}/3.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='pt-6'>
            <Tabs defaultValue={activeChallenges.length > 0 ? 'active' : 'discover'}>
              <TabsList className='grid w-full grid-cols-3'>
                <TabsTrigger value='active'>Activos</TabsTrigger>
                <TabsTrigger value='discover'>Buscar rivales</TabsTrigger>
                <TabsTrigger value='history'>Historial</TabsTrigger>
              </TabsList>

              <TabsContent value='active' className='mt-4 space-y-3'>
                <div className='rounded-lg border border-sky-300/45 bg-sky-50/40 p-3 text-sm dark:border-sky-900 dark:bg-sky-950/20'>
                  <p className='font-medium'>Panel operativo</p>
                  <p className='text-muted-foreground'>
                    Puedes tener máximo 3 desafíos activos y solo 1 activo por pareja.
                  </p>
                </div>

                {activeChallenges.length === 0 ? (
                  <p className='rounded-lg border px-3 py-4 text-sm text-muted-foreground'>
                    No tienes desafíos activos ahora.
                  </p>
                ) : (
                  activeChallenges.map((challenge) => {
                    const myCompetitor = challenge.competitors.find(
                      (item) => item.userId === currentUserId,
                    )
                    const canRespond =
                      challenge.status === 'created' &&
                      challenge.challengedUserId === currentUserId &&
                      myCompetitor?.invitationStatus === 'pending'
                    const canPlayNow =
                      challenge.status === 'in_progress' &&
                      !!currentUserId &&
                      myCompetitor?.invitationStatus === 'accepted' &&
                      !hasOwnWordsResult(challenge, currentUserId)

                    return (
                      <div key={challenge.id} className='rounded-lg border p-3 text-sm'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <p className='font-medium'>
                            {challenge.challengeSlug === 'ica-own-words'
                              ? 'Palabras ICA propias'
                              : challenge.challengeSlug}
                          </p>
                          <Badge variant='outline'>
                            {challenge.scope === 'global' ? 'Global' : 'Por idioma'}
                          </Badge>
                          <Badge variant='secondary'>
                            {getChallengeStatusLabel(challenge.status)}
                          </Badge>
                        </div>

                        <p className='mt-2 text-muted-foreground'>
                          Configuración: {getIcaOwnWordsConfigLabel(challenge.gameMetadata)}
                        </p>

                        {canRespond && (
                          <div className='mt-3 flex flex-wrap gap-2'>
                            <Button
                              type='button'
                              onClick={() => void handleRespondInvitation(challenge.id, true)}
                              disabled={isResponding}
                            >
                              Aceptar desafío
                            </Button>
                            <Button
                              type='button'
                              variant='outline'
                              onClick={() => void handleRespondInvitation(challenge.id, false)}
                              disabled={isResponding}
                            >
                              No aceptar
                            </Button>
                          </div>
                        )}

                        {canPlayNow && (
                          <div className='mt-3'>
                            <Button type='button' asChild>
                              <Link to={getIcaChallengePlayRoute(challenge.id)}>
                                Jugar ahora
                              </Link>
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </TabsContent>

              <TabsContent value='discover' className='mt-4 space-y-4'>
                <div className='rounded-lg border p-3 text-sm'>
                  <p className='font-medium'>Busca personas y desafía</p>
                  <p className='text-muted-foreground'>
                    Al tocar <strong>Desafiar</strong> se abre el modal con los desafíos disponibles.
                  </p>
                </div>

                <Tabs
                  value={challengeScope}
                  onValueChange={(value) => void loadScope(value as IcaChallengeScope)}
                >
                  <TabsList className='grid w-full grid-cols-2'>
                    <TabsTrigger value='language'>Por idioma</TabsTrigger>
                    <TabsTrigger value='global'>Global</TabsTrigger>
                  </TabsList>

                  <TabsContent value='language' className='mt-3'>
                    <p className='mb-2 text-xs text-muted-foreground'>
                      Mostrando usuarios con idioma activo {nativeLang} -&gt; {targetLang}.
                    </p>
                  </TabsContent>

                  <TabsContent value='global' className='mt-3'>
                    <p className='mb-2 text-xs text-muted-foreground'>
                      Mostrando usuarios activos en desafíos, sin filtrar por idioma.
                    </p>
                  </TabsContent>
                </Tabs>

                {!canCreateMore && (
                  <p className='text-sm text-amber-600'>
                    Ya tienes 3 desafíos activos. Finaliza alguno antes de crear otro.
                  </p>
                )}

                <div className='rounded-lg border'>
                  <div className='grid grid-cols-[1.4fr_1fr_auto] gap-2 border-b bg-muted/30 px-3 py-2 text-xs font-semibold'>
                    <span>Competidor</span>
                    <span>Activos</span>
                    <span>Acción</span>
                  </div>

                  {availableUsers.length === 0 ? (
                    <p className='px-3 py-4 text-sm text-muted-foreground'>
                      No hay competidores disponibles en esta modalidad.
                    </p>
                  ) : (
                    <div className='divide-y'>
                      {availableUsers.map((user) => {
                        const disabled =
                          !isEnrolled ||
                          !canCreateMore ||
                          !user.canChallenge ||
                          isCreatingChallenge

                        return (
                          <div
                            key={user.userId}
                            className='grid grid-cols-[1.4fr_1fr_auto] items-center gap-2 px-3 py-2 text-sm'
                          >
                            <div>
                              <p className='font-medium'>{user.displayName}</p>
                              {user.username && (
                                <p className='text-xs text-muted-foreground'>@{user.username}</p>
                              )}
                              {user.blockedReason && (
                                <p className='text-xs text-amber-600'>{user.blockedReason}</p>
                              )}
                            </div>
                            <p className='text-muted-foreground'>{user.activeChallengesCount}/3</p>
                            <Button
                              type='button'
                              size='sm'
                              variant='outline'
                              disabled={disabled}
                              onClick={() => openChallengeModal(user.userId)}
                            >
                              Desafiar
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value='history' className='mt-4 space-y-3'>
                {historyChallenges.length === 0 ? (
                  <p className='rounded-lg border px-3 py-4 text-sm text-muted-foreground'>
                    Aún no tienes historial de desafíos.
                  </p>
                ) : (
                  historyChallenges.map((challenge) => (
                    <div key={challenge.id} className='rounded-lg border p-3 text-sm'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <p className='font-medium'>
                          {challenge.challengeSlug === 'ica-own-words'
                            ? 'Palabras ICA propias'
                            : challenge.challengeSlug}
                        </p>
                        <Badge variant='outline'>
                          {challenge.scope === 'global' ? 'Global' : 'Por idioma'}
                        </Badge>
                        <Badge variant='secondary'>{getChallengeStatusLabel(challenge.status)}</Badge>
                      </div>
                      <p className='mt-2 text-muted-foreground'>
                        Resultado: {getResultLabel(challenge.resultType)}
                      </p>
                      <p className='text-muted-foreground'>
                        Configuración: {getIcaOwnWordsConfigLabel(challenge.gameMetadata)}
                      </p>
                    </div>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Dialog open={isChallengeModalOpen} onOpenChange={setIsChallengeModalOpen}>
          <DialogContent className='max-w-[calc(100%-2rem)] sm:max-w-2xl'>
            <DialogHeader>
              <DialogTitle>Elegir desafío</DialogTitle>
              <DialogDescription>
                {selectedUser
                  ? `Vas a desafiar a ${selectedUser.displayName}.`
                  : 'Selecciona un desafío para iniciar.'}
              </DialogDescription>
            </DialogHeader>

            <div className='space-y-3'>
              <div className='rounded-xl border border-sky-300/50 bg-[linear-gradient(160deg,rgba(14,165,233,0.12),rgba(125,211,252,0.08))] p-3 dark:border-sky-900 dark:bg-[linear-gradient(160deg,rgba(14,165,233,0.2),rgba(2,132,199,0.08))]'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <p className='inline-flex items-center gap-2 font-medium'>
                    <SparklesIcon className='h-4 w-4 text-sky-600 dark:text-sky-300' />
                    Palabras ICA propias
                  </p>
                  <Badge variant='secondary'>Disponible</Badge>
                </div>
                <p className='mt-1 text-sm text-muted-foreground'>
                  Quiz por turnos con tus palabras ICA. Configurable por rondas y tiempo.
                </p>

                <div className='mt-2 flex flex-wrap gap-2'>
                  <Badge variant='outline'>Dificultad adaptable</Badge>
                  <Badge variant='outline'>1 vs 1 asincrónico</Badge>
                </div>

                <div className='mt-3 grid gap-3 md:grid-cols-3'>
                  <div className='space-y-1'>
                    <Label>Rondas</Label>
                    <Select
                      value={String(rounds)}
                      onValueChange={(value) => setRounds(Number(value) as 3 | 5 | 10)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='3'>3</SelectItem>
                        <SelectItem value='5'>5</SelectItem>
                        <SelectItem value='10'>10</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className='space-y-1'>
                    <Label>Segundos</Label>
                    <Select
                      value={String(responseSeconds)}
                      onValueChange={(value) => setResponseSeconds(Number(value))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[3, 4, 5, 6, 7, 8].map((value) => (
                          <SelectItem key={value} value={String(value)}>
                            {value}s
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className='space-y-1'>
                    <Label>Duración</Label>
                    <Select
                      value={String(durationDays)}
                      onValueChange={(value) => setDurationDays(Number(value) as 1 | 2 | 3)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3].map((value) => (
                          <SelectItem key={value} value={String(value)}>
                            {value} día{value === 1 ? '' : 's'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <p className='mt-2 inline-flex items-center gap-2 text-xs font-medium text-sky-700 dark:text-sky-300'>
                  <TimerIcon className='h-3.5 w-3.5' />
                  Recomendado: 10 rondas y 5s por respuesta.
                </p>

                <p className='mt-1 inline-flex items-center gap-2 text-xs text-muted-foreground'>
                  <CalendarDaysIcon className='h-3.5 w-3.5' />
                  Duración del desafío: {durationDays} día{durationDays === 1 ? '' : 's'}.
                </p>

                <div className='mt-3'>
                  <Button
                    type='button'
                    disabled={!selectedUser || isCreatingChallenge}
                    onClick={() => selectedUser && void handleCreateChallenge(selectedUser.userId)}
                  >
                    Crear desafío
                  </Button>
                </div>
              </div>

              <div className='rounded-xl border border-dashed border-amber-300/70 bg-amber-50/40 p-3 opacity-90 dark:border-amber-900 dark:bg-amber-950/10'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <p className='inline-flex items-center gap-2 font-medium'>
                    <ZapIcon className='h-4 w-4 text-amber-600 dark:text-amber-300' />
                    Modo Relámpago
                  </p>
                  <Badge variant='outline'>Próximamente</Badge>
                </div>
                <p className='mt-1 text-sm text-muted-foreground'>
                  Duelo corto por velocidad y precisión con reglas especiales.
                </p>
                <div className='mt-2 flex flex-wrap gap-2'>
                  <Badge variant='outline'>Partidas exprés</Badge>
                  <Badge variant='outline'>Riesgo/Recompensa</Badge>
                </div>
              </div>

              <div className='rounded-xl border border-dashed border-emerald-300/70 bg-emerald-50/35 p-3 opacity-90 dark:border-emerald-900 dark:bg-emerald-950/10'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <p className='font-medium'>Batalla de Rachas</p>
                  <Badge variant='outline'>Llega pronto</Badge>
                </div>
                <p className='mt-1 text-sm text-muted-foreground'>
                  Competencia asincrónica por consistencia diaria durante varios días.
                </p>
                <div className='mt-2 flex flex-wrap gap-2'>
                  <Badge variant='outline'>Formato liga</Badge>
                  <Badge variant='outline'>Progreso por etapas</Badge>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {isLoading && <p className='text-sm text-muted-foreground'>Cargando desafíos...</p>}
        {error && <p className='text-sm text-destructive'>{error}</p>}
      </div>
    </section>
  )
}

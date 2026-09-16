import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDaysIcon,
  ChevronRightIcon,
  FlameIcon,
  Loader2Icon,
  SearchIcon,
  SparklesIcon,
  TimerIcon,
  Trash2Icon,
  UsersIcon,
  ZapIcon,
} from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIcaChallengesOverview } from '../hooks/useIcaChallengesOverview'
import { getIcaOwnWordsConfigLabel, hasOwnWordsResult } from '../services/icaChallenges'
import { getIcaChallengePlayRoute } from '../routes/paths'
import type { IcaChallengeRecord, IcaChallengeScope, IcaChallengeTypeRecord } from '../types'

type IcaChallengesViewProps = {
  targetLang: string
  nativeLang: string
}

type TabKey = 'active' | 'pending' | 'history'
type ModalStep = 'type' | 'rules'

const CHALLENGE_TYPE_ICONS = {
  sparkles: SparklesIcon,
  zap: ZapIcon,
  flame: FlameIcon,
} as const

function getChallengeStatusLabel(status: string): string {
  switch (status) {
    case 'created':
      return 'Pendiente'
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
      return 'Ganaste / ganó retador'
    case 'challenged_win':
      return 'Ganó retado'
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

function getChallengeTypePitch(type: IcaChallengeTypeRecord): string {
  const value = type.config.pitch
  return typeof value === 'string' && value.trim() ? value.trim() : 'Modo de desafío ICA.'
}

function formatTimeLeft(dateIso: string | null): string {
  if (!dateIso) return 'Sin plazo'
  const diffMs = new Date(dateIso).getTime() - Date.now()
  if (!Number.isFinite(diffMs)) return 'Sin plazo'
  if (diffMs <= 0) return 'Caducado'

  const totalMinutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours} h ${minutes} min`
  return `${minutes} min`
}

function getOpponentUserId(challenge: IcaChallengeRecord, currentUserId: string | null): string {
  if (!currentUserId) return challenge.challengedUserId
  return challenge.challengerUserId === currentUserId
    ? challenge.challengedUserId
    : challenge.challengerUserId
}

function getScores(challenge: IcaChallengeRecord, currentUserId: string | null): {
  mine: number
  rival: number
} {
  if (!currentUserId) return { mine: 0, rival: 0 }
  const myRow = challenge.competitors.find((item) => item.userId === currentUserId)
  const rivalRow = challenge.competitors.find((item) => item.userId !== currentUserId)
  return {
    mine: myRow?.score ?? 0,
    rival: rivalRow?.score ?? 0,
  }
}

function getInitials(name: string): string {
  const cleaned = name.trim()
  if (!cleaned) return 'IC'
  return cleaned
    .split(/\s+/)
    .map((chunk) => chunk[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 2)
}

function isSameLanguagePair(user: {
  nativeLang: string | null
  targetLang: string | null
}, nativeLang: string, targetLang: string): boolean {
  return (
    (user.nativeLang || '').trim().toLowerCase() === nativeLang.trim().toLowerCase() &&
    (user.targetLang || '').trim().toLowerCase() === targetLang.trim().toLowerCase()
  )
}

function getAutoScopeForType(input: {
  type: IcaChallengeTypeRecord
  user: { nativeLang: string | null; targetLang: string | null } | null
  nativeLang: string
  targetLang: string
}): IcaChallengeScope | null {
  const supportsGlobal = input.type.scopes.includes('global')
  const supportsLanguage = input.type.scopes.includes('language')
  const canUseLanguage =
    supportsLanguage &&
    !!input.user &&
    isSameLanguagePair(input.user, input.nativeLang, input.targetLang)

  if (canUseLanguage) return 'language'
  if (supportsGlobal) return 'global'
  if (supportsLanguage && canUseLanguage) return 'language'
  return null
}

const AVATAR_PALETTE = [
  'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800/50',
  'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-200 dark:border-sky-800/50',
  'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800/50',
  'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800/50',
  'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-200 dark:border-violet-800/50',
  'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-200 dark:border-cyan-800/50',
]

function hashText(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function renderAvatar(name: string, avatarUrl: string | null, seed: string) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className='h-10 w-10 rounded-full border object-cover'
      />
    )
  }

  const paletteClass = AVATAR_PALETTE[hashText(seed || name) % AVATAR_PALETTE.length]

  return (
    <span
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-xs font-semibold ${paletteClass}`}
    >
      {getInitials(name)}
    </span>
  )
}

export function IcaChallengesView({ targetLang, nativeLang }: IcaChallengesViewProps) {
  const {
    enrollment,
    challenges,
    playsByChallengeId,
    userProfiles,
    challengeTypes,
    availableUsers,
    myActiveChallengesCount,
    isLoading,
    isSavingEnrollment,
    isCreatingChallenge,
    isResponding,
    isCancelling,
    currentUserId,
    error,
    setEnrollmentActive,
    createOwnWordsChallenge,
    respondInvitation,
    cancelInvitation,
    refreshAvailableUsers,
  } = useIcaChallengesOverview({
    targetLang,
    nativeLang,
  })

  const [tab, setTab] = useState<TabKey>('active')
  const [search, setSearch] = useState('')
  const [rounds, setRounds] = useState<3 | 5 | 10>(10)
  const [responseSeconds, setResponseSeconds] = useState(5)
  const [durationDays, setDurationDays] = useState<1 | 2 | 3>(1)

  const [isChallengeModalOpen, setIsChallengeModalOpen] = useState(false)
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)
  const [modalStep, setModalStep] = useState<ModalStep>('type')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)
  const [selectedScope, setSelectedScope] = useState<IcaChallengeScope>('global')
  const [pendingChallengeToCancel, setPendingChallengeToCancel] =
    useState<IcaChallengeRecord | null>(null)

  const isEnrolled = Boolean(enrollment?.isActive)
  const selectedUser = availableUsers.find((user) => user.userId === selectedUserId) ?? null
  const selectedType = challengeTypes.find((type) => type.id === selectedTypeId) ?? null
  const maxActiveLimitReached = myActiveChallengesCount >= 3

  const challengeTypeById = useMemo(
    () =>
      challengeTypes.reduce<Record<string, IcaChallengeTypeRecord>>((acc, item) => {
        acc[item.id] = item
        return acc
      }, {}),
    [challengeTypes],
  )

  useEffect(() => {
    if (!isEnrolled) return
    void refreshAvailableUsers('global')
  }, [isEnrolled, refreshAvailableUsers])

  const incomingChallenges = useMemo(
    () =>
      challenges.filter((challenge) => {
        const myRow = challenge.competitors.find((item) => item.userId === currentUserId)
        return (
          challenge.status === 'created' &&
          challenge.challengedUserId === currentUserId &&
          myRow?.invitationStatus === 'pending'
        )
      }),
    [challenges, currentUserId],
  )

  const outgoingChallenges = useMemo(
    () =>
      challenges.filter(
        (challenge) =>
          challenge.status === 'created' && challenge.challengerUserId === currentUserId,
      ),
    [challenges, currentUserId],
  )

  const inProgressChallenges = useMemo(
    () => challenges.filter((challenge) => challenge.status === 'in_progress'),
    [challenges],
  )

  const historyChallenges = useMemo(
    () =>
      challenges.filter(
        (challenge) => challenge.status !== 'created' && challenge.status !== 'in_progress',
      ),
    [challenges],
  )

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase().replace(/^@/, '')
    if (!query) return availableUsers

    return availableUsers.filter((user) => {
      const display = user.displayName.toLowerCase()
      const username = (user.username || '').toLowerCase()
      return display.includes(query) || username.includes(query)
    })
  }, [availableUsers, search])

  const activePips = useMemo(
    () =>
      Array.from({ length: 3 }, (_, index) => index < myActiveChallengesCount).map(
        (isOn, index) => (
          <span
            key={`slot-${index}`}
            className={`h-1.5 w-6 rounded-full ${isOn ? 'bg-primary' : 'bg-muted-foreground/30'}`}
          />
        ),
      ),
    [myActiveChallengesCount],
  )

  const resolveUser = (
    userId: string,
  ): { displayName: string; username: string | null; avatarUrl: string | null } => {
    const fromMap = userProfiles[userId]
    if (fromMap) return fromMap

    const fromAvailable = availableUsers.find((item) => item.userId === userId)
    if (fromAvailable) {
      return {
        displayName: fromAvailable.displayName,
        username: fromAvailable.username,
        avatarUrl: null,
      }
    }

    return {
      displayName: 'Usuario',
      username: null,
      avatarUrl: null,
    }
  }

  const startChallengeFlow = (userId: string) => {
    const selected = availableUsers.find((item) => item.userId === userId) || null
    const firstAvailableType = challengeTypes.find((type) => {
      if (!type.isActive) return false
      return (
        getAutoScopeForType({
          type,
          user: selected,
          nativeLang,
          targetLang,
        }) !== null
      )
    })

    const autoScope = firstAvailableType
      ? getAutoScopeForType({
          type: firstAvailableType,
          user: selected,
          nativeLang,
          targetLang,
        })
      : null

    setSelectedUserId(userId)
    setSelectedTypeId(firstAvailableType?.id || null)
    setSelectedScope(autoScope || 'global')
    setModalStep('type')
    setIsChallengeModalOpen(true)
  }

  const handleEnrollmentToggle = async (next: boolean) => {
    try {
      await setEnrollmentActive(next)
      toast.success(next ? 'Inscripción activa en Desafíos ICA.' : 'Te diste de baja de Desafíos ICA.')
      if (next) {
        await refreshAvailableUsers('global')
      }
    } catch (toggleError) {
      toast.error(
        toggleError instanceof Error
          ? toggleError.message
          : 'No se pudo actualizar tu inscripción.',
      )
    }
  }

  const handleRespondInvitation = async (challengeId: string, accept: boolean) => {
    try {
      await respondInvitation(challengeId, accept)
      toast.success(accept ? 'Desafío aceptado.' : 'Desafío rechazado.')
    } catch (respondError) {
      toast.error(
        respondError instanceof Error
          ? respondError.message
          : 'No se pudo responder el desafío.',
      )
    }
  }

  const handleCreateChallenge = async () => {
    if (!selectedUser || !selectedType) {
      toast.error('Selecciona usuario y tipo antes de enviar.')
      return
    }

    const autoScope = getAutoScopeForType({
      type: selectedType,
      user: selectedUser,
      nativeLang,
      targetLang,
    })

    if (!autoScope) {
      toast.error('Este desafío no está disponible para este icademer.')
      return
    }

    try {
      await createOwnWordsChallenge({
        challengeTypeId: selectedType.id,
        challengedUserId: selectedUser.userId,
        scope: autoScope,
        config: {
          rounds,
          responseSeconds,
        },
        durationSeconds: durationDays * 24 * 60 * 60,
      })

      setIsChallengeModalOpen(false)
      setModalStep('type')
      setSelectedUserId(null)
      setSelectedTypeId(null)
      toast.success('Reto enviado. Avisamos al competidor por notificación.')
      setTab('pending')
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : 'No se pudo crear el desafío.'
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
      if (message.includes('ICA_CHALLENGE_SCOPE_NOT_SUPPORTED')) {
        toast.error('El tipo seleccionado no soporta este alcance.')
        return
      }
      if (message.includes('ICA_CHALLENGE_TYPE_NOT_PLAYABLE_YET')) {
        toast.error('Este tipo todavía no está habilitado para jugar.')
        return
      }
      toast.error(message)
    }
  }

  const openCancelModal = (challenge: IcaChallengeRecord) => {
    setPendingChallengeToCancel(challenge)
    setIsCancelModalOpen(true)
  }

  const confirmCancelInvitation = async () => {
    if (!pendingChallengeToCancel) return
    try {
      await cancelInvitation(pendingChallengeToCancel.id)
      setIsCancelModalOpen(false)
      setPendingChallengeToCancel(null)
      toast.success('Reto cancelado correctamente.')
    } catch (cancelError) {
      toast.error(
        cancelError instanceof Error ? cancelError.message : 'No se pudo cancelar el reto.',
      )
    }
  }

  const renderChallengeChip = (challenge: IcaChallengeRecord) => {
    const challengeType = challengeTypeById[challenge.challengeSlug]
    const label = challengeType?.name || challenge.challengeSlug
    return (
      <Badge variant='outline' className='text-xs'>
        {label}
        {challenge.scope === 'language' ? ` · ${targetLang}` : ''}
      </Badge>
    )
  }

  return (
    isLoading ? (
      <section className='mx-auto flex min-h-[55vh] w-full max-w-4xl items-center justify-center p-4'>
        <div className='inline-flex items-center gap-2 text-sm text-muted-foreground'>
          <Loader2Icon className='h-4 w-4 animate-spin' />
          Cargando desafíos...
        </div>
      </section>
    ) : (
    <section className='mx-auto w-full max-w-4xl flex-1 p-4 pb-24 lg:pb-4'>
      <div className='mb-6'>
        <h2 className='font-serif text-3xl font-bold'>Desafíos ICA</h2>
        <p className='text-sm text-muted-foreground'>
          Reta a otros icademers y juega en turnos asincrónicos.
        </p>
      </div>

      <Card className='mb-4'>
        <CardHeader>
          <CardTitle className='flex items-center justify-between gap-3'>
            <span className='inline-flex items-center gap-2'>
              <UsersIcon className='h-4 w-4' />
              Disponible para retos
            </span>
            <Switch
              checked={isEnrolled}
              disabled={isLoading || isSavingEnrollment}
              onCheckedChange={(checked) => void handleEnrollmentToggle(checked)}
              aria-label='Activar inscripción a desafíos ICA'
            />
          </CardTitle>
          <CardDescription>
            {nativeLang} -&gt; {targetLang}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center gap-3'>
            <div className='flex items-center gap-2'>{activePips}</div>
            <p className='text-xs text-muted-foreground'>{myActiveChallengesCount} de 3 desafíos en curso</p>
          </div>
          {!isEnrolled && (
            <p className='mt-3 rounded-lg border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/35 dark:text-amber-200'>
              Estás en pausa. No podrás desafiar ni recibir retos.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className={isEnrolled ? 'pt-6' : 'pt-0'}>
          {isEnrolled && (
            <div className='mb-4 space-y-3'>
              <div className='relative'>
                <SearchIcon className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder='Busca a un icademer por nombre o @usuario'
                  className='pl-9'
                />
              </div>

              <p className='px-1 text-xs font-medium text-muted-foreground'>Icademers disponibles ahora</p>

              {maxActiveLimitReached && (
                <p className='rounded-lg border border-sky-200/70 bg-sky-50/80 px-3 py-2 text-xs text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200'>
                  Ya alcanzaste el máximo de desafíos activos (3). Finaliza uno para volver a retar.
                </p>
              )}

              <div className='rounded-lg border'>
                {filteredUsers.length === 0 ? (
                  <p className='px-3 py-4 text-sm text-muted-foreground'>
                    {search.trim()
                      ? 'No encontramos icademers para esa búsqueda.'
                      : 'No hay icademers disponibles ahora mismo.'}
                  </p>
                ) : (
                  filteredUsers.map((user) => (
                    <div
                      key={user.userId}
                      className='grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b px-3 py-3 last:border-b-0'
                    >
                      {renderAvatar(
                        user.displayName,
                        userProfiles[user.userId]?.avatarUrl || null,
                        user.userId,
                      )}
                      <div>
                        <p className='font-medium leading-tight'>{user.displayName}</p>
                        <p className='text-xs text-muted-foreground'>
                          {user.username ? `@${user.username} · ` : ''}
                          {user.nativeLang && user.targetLang
                            ? `${user.nativeLang} -> ${user.targetLang}`
                            : `${nativeLang} -> ${targetLang}`}
                          {user.cefrLevel ? ` · ${user.cefrLevel}` : ''}
                        </p>
                        {user.blockedReason &&
                          user.blockedReason !== 'Tu máximo de desafíos activos es 3.' && (
                          <p className='text-xs text-amber-600'>{user.blockedReason}</p>
                          )}
                      </div>
                      <Button
                        type='button'
                        size='sm'
                        variant={user.canChallenge ? 'default' : 'outline'}
                        disabled={!isEnrolled || !user.canChallenge || isCreatingChallenge}
                        onClick={() => startChallengeFlow(user.userId)}
                      >
                        {user.canChallenge ? 'Desafiar' : 'No disponible'}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)} className='mb-4'>
            <TabsList className='grid w-full grid-cols-3'>
              <TabsTrigger value='active'>
                Activos ({inProgressChallenges.length})
              </TabsTrigger>
              <TabsTrigger value='pending'>
                Pendientes ({incomingChallenges.length + outgoingChallenges.length})
              </TabsTrigger>
              <TabsTrigger value='history'>Historial</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className='space-y-3'>
            {tab === 'active' && (
              <>
                {inProgressChallenges.length > 0 ? (
                  <>
                  <p className='pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                    En curso
                  </p>
                  {inProgressChallenges.map((challenge) => {
                    const rivalId = getOpponentUserId(challenge, currentUserId)
                    const rival = resolveUser(rivalId)
                    const isMyTurn = !challenge.turnUserId || challenge.turnUserId === currentUserId
                    const alreadyPlayed =
                      !!currentUserId &&
                      hasOwnWordsResult(challenge, currentUserId, playsByChallengeId[challenge.id])
                    const canOpenPlayView = alreadyPlayed || isMyTurn
                    const ctaLabel = alreadyPlayed ? 'Ver partida' : 'Jugar ahora'
                    const score = getScores(challenge, currentUserId)

                    return (
                      <div key={challenge.id} className='rounded-xl border p-3'>
                        <div className='mb-2 flex items-center justify-between gap-2'>
                          <div className='flex items-center gap-3'>
                            {renderAvatar(rival.displayName, rival.avatarUrl, rivalId)}
                            <div>
                              {renderChallengeChip(challenge)}
                              <p className='mt-1 font-medium'>{rival.displayName}</p>
                              <p className='text-xs text-muted-foreground'>
                                {isMyTurn
                                  ? `Te toca · ${formatTimeLeft(challenge.turnExpiresAt)}`
                                  : `Turno de tu rival · ${formatTimeLeft(challenge.turnExpiresAt)}`}
                              </p>
                            </div>
                          </div>
                          <div className='text-right'>
                            <p className='font-serif text-xl'>
                              {score.mine} · {score.rival}
                            </p>
                            <Badge variant='secondary'>{getChallengeStatusLabel(challenge.status)}</Badge>
                          </div>
                        </div>
                        <p className='mb-3 text-xs text-muted-foreground'>
                          {challenge.challengeSlug === 'ica-own-words'
                            ? `Configuración: ${getIcaOwnWordsConfigLabel(challenge.gameMetadata)}`
                            : 'Configuración disponible próximamente'}
                        </p>
                        <div className='mt-3 flex justify-end'>
                          {canOpenPlayView ? (
                            <Button type='button' size='sm' asChild>
                              <Link to={getIcaChallengePlayRoute(challenge.id)}>{ctaLabel}</Link>
                            </Button>
                          ) : (
                            <Button type='button' size='sm' disabled>
                              {ctaLabel}
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  </>
                ) : (
                  <p className='rounded-lg border px-3 py-4 text-sm text-muted-foreground'>
                    No tienes desafíos en curso ahora mismo.
                  </p>
                )}
              </>
            )}

            {tab === 'pending' && (
              <>
                {incomingChallenges.length > 0 && (
                  <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                    Te han retado
                  </p>
                )}
                {incomingChallenges.map((challenge) => {
                  const rivalId = getOpponentUserId(challenge, currentUserId)
                  const rival = resolveUser(rivalId)

                  return (
                    <div key={challenge.id} className='rounded-xl border border-amber-300/50 bg-amber-50/20 p-3 dark:border-amber-900/50 dark:bg-amber-950/10'>
                      <div className='mb-2 flex items-center justify-between gap-2'>
                        <div className='flex items-center gap-3'>
                          {renderAvatar(rival.displayName, rival.avatarUrl, rivalId)}
                          <div>
                            {renderChallengeChip(challenge)}
                            <p className='mt-1 font-medium'>{rival.displayName}</p>
                            <p className='text-xs text-muted-foreground'>
                              Pendiente de tu respuesta · {formatTimeLeft(challenge.acceptUntil)}
                            </p>
                          </div>
                        </div>
                        <Badge variant='secondary'>{getChallengeStatusLabel(challenge.status)}</Badge>
                      </div>

                      <div className='flex gap-2'>
                        <Button
                          type='button'
                          size='sm'
                          disabled={isResponding}
                          onClick={() => void handleRespondInvitation(challenge.id, true)}
                        >
                          Aceptar
                        </Button>
                        <Button
                          type='button'
                          size='sm'
                          variant='outline'
                          disabled={isResponding}
                          onClick={() => void handleRespondInvitation(challenge.id, false)}
                        >
                          Rechazar
                        </Button>
                      </div>
                    </div>
                  )
                })}

                {outgoingChallenges.length > 0 && (
                  <p className='pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                    Esperando aceptación
                  </p>
                )}
                {outgoingChallenges.map((challenge) => {
                  const rivalId = getOpponentUserId(challenge, currentUserId)
                  const rival = resolveUser(rivalId)

                  return (
                    <div key={challenge.id} className='rounded-xl border p-3'>
                      <div className='mb-2 flex items-center justify-between gap-2'>
                        <div className='flex items-center gap-3'>
                          {renderAvatar(rival.displayName, rival.avatarUrl, rivalId)}
                          <div>
                            {renderChallengeChip(challenge)}
                            <p className='mt-1 font-medium'>{rival.displayName}</p>
                            <p className='text-xs text-muted-foreground'>
                              Esperando aceptación · {formatTimeLeft(challenge.acceptUntil)}
                            </p>
                          </div>
                        </div>
                        <Badge variant='secondary'>{getChallengeStatusLabel(challenge.status)}</Badge>
                      </div>
                      <div className='mt-2 flex justify-end'>
                        <Button
                          type='button'
                          size='sm'
                          variant='destructive'
                          disabled={isCancelling}
                          onClick={() => openCancelModal(challenge)}
                        >
                          Cancelar reto
                          <Trash2Icon className='ml-1 h-3.5 w-3.5' />
                        </Button>
                      </div>
                    </div>
                  )
                })}

                {incomingChallenges.length === 0 && outgoingChallenges.length === 0 && (
                  <p className='rounded-lg border px-3 py-4 text-sm text-muted-foreground'>
                    No tienes retos pendientes.
                  </p>
                )}
              </>
            )}

            {tab === 'history' && (
              <>
                {historyChallenges.map((challenge) => {
                  const rivalId = getOpponentUserId(challenge, currentUserId)
                  const rival = resolveUser(rivalId)
                  const score = getScores(challenge, currentUserId)
                  const statusLabel = getChallengeStatusLabel(challenge.status)
                  const resultLabel = getResultLabel(challenge.resultType)
                  const footerLabel =
                    statusLabel === resultLabel
                      ? statusLabel
                      : `${statusLabel} · ${resultLabel}`

                  return (
                    <div key={challenge.id} className='rounded-xl border p-3'>
                      <div className='flex items-center justify-between gap-2'>
                        <div className='flex items-center gap-3'>
                          {renderAvatar(rival.displayName, rival.avatarUrl, rivalId)}
                          <div>
                            {renderChallengeChip(challenge)}
                            <p className='mt-1 font-medium'>{rival.displayName}</p>
                            <p className='text-xs text-muted-foreground'>
                              {footerLabel}
                            </p>
                          </div>
                        </div>
                        <p className='font-serif text-lg'>
                          {score.mine} · {score.rival}
                        </p>
                      </div>
                    </div>
                  )
                })}

                {historyChallenges.length === 0 && (
                  <p className='rounded-lg border px-3 py-4 text-sm text-muted-foreground'>
                    Aún no tienes historial de desafíos.
                  </p>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={isChallengeModalOpen}
        onOpenChange={(open) => {
          setIsChallengeModalOpen(open)
          if (!open) {
            setModalStep('type')
          }
        }}
      >
        <DialogContent className='max-w-[calc(100%-2rem)] sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>
              {selectedUser ? `Retar a ${selectedUser.displayName}` : 'Elegir desafío'}
            </DialogTitle>
            <DialogDescription>
              {modalStep === 'type' ? 'Paso 1: elige el tipo de desafío.' : 'Paso 2: revisa reglas y envía el reto.'}
            </DialogDescription>
          </DialogHeader>

          {modalStep === 'type' && (
            <div className='space-y-3'>
              {challengeTypes.map((type) => {
                const Icon =
                  CHALLENGE_TYPE_ICONS[type.iconKey as keyof typeof CHALLENGE_TYPE_ICONS] ||
                  SparklesIcon
                const autoScope = getAutoScopeForType({
                  type,
                  user: selectedUser,
                  nativeLang,
                  targetLang,
                })
                const canSelect = type.isActive && autoScope !== null

                return (
                  <button
                    type='button'
                    key={type.id}
                    disabled={!canSelect}
                    onClick={() => {
                      if (!canSelect) return
                      setSelectedTypeId(type.id)
                      setSelectedScope(autoScope || 'global')
                      setModalStep('rules')
                    }}
                    className={`relative w-full rounded-xl border p-3 pr-12 text-left transition ${
                      canSelect
                        ? 'border-border bg-muted/20 hover:border-primary/60 hover:bg-muted/35'
                        : 'border-dashed opacity-80'
                    }`}
                  >
                    <div className='flex items-center justify-between gap-2'>
                      <p className='inline-flex items-center gap-2 font-medium'>
                        <Icon className='h-4 w-4' />
                        {type.name}
                      </p>
                      <Badge variant={canSelect ? 'secondary' : 'outline'}>
                        {!type.isActive
                          ? 'Próximamente'
                          : autoScope === 'language'
                            ? 'Por idioma'
                            : autoScope === 'global'
                              ? 'Global'
                              : 'No disponible'}
                      </Badge>
                    </div>
                    <p className='mt-1 text-sm text-muted-foreground'>{getChallengeTypePitch(type)}</p>
                    {canSelect && (
                      <span className='absolute bottom-3 right-3 inline-flex h-7 w-7 items-center justify-center rounded-full border bg-background text-muted-foreground'>
                        <ChevronRightIcon className='h-4 w-4' />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {modalStep === 'rules' && selectedType && (
            <div className='space-y-3'>
              <div className='rounded-xl border bg-muted/20 p-3'>
                <p className='font-medium'>{selectedType.name}</p>
                <p className='text-sm text-muted-foreground'>{getChallengeTypePitch(selectedType)}</p>
              </div>

              <div className='flex flex-wrap gap-2'>
                <Badge variant='secondary'>
                  Alcance: {selectedScope === 'language' ? 'Por idioma' : 'Global'}
                </Badge>
                {selectedScope === 'language' && (
                  <Badge variant='outline'>
                    Mismo par: {nativeLang} -&gt; {targetLang}
                  </Badge>
                )}
              </div>

              {selectedType.id === 'ica-own-words' && (
                <>
                  <div className='grid gap-3 md:grid-cols-3'>
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

                  <p className='inline-flex items-center gap-2 text-xs font-medium text-muted-foreground'>
                    <TimerIcon className='h-3.5 w-3.5' />
                    Recomendado: 10 rondas y 5s por respuesta.
                  </p>

                  <p className='inline-flex items-center gap-2 text-xs text-muted-foreground'>
                    <CalendarDaysIcon className='h-3.5 w-3.5' />
                    Duración del desafío: {durationDays} día{durationDays === 1 ? '' : 's'}.
                  </p>
                </>
              )}

              <div className='flex gap-2'>
                <Button type='button' variant='outline' onClick={() => setModalStep('type')}>
                  Volver
                </Button>
                <Button
                  type='button'
                  disabled={!selectedUser || isCreatingChallenge || !selectedType.isPlayable}
                  onClick={() => void handleCreateChallenge()}
                >
                  Enviar reto
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCancelModalOpen}
        onOpenChange={(open) => {
          setIsCancelModalOpen(open)
          if (!open) setPendingChallengeToCancel(null)
        }}
      >
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>¿Cancelar este reto?</DialogTitle>
            <DialogDescription>
              Se quitará de pendientes y tu rival ya no podrá aceptarlo.
            </DialogDescription>
          </DialogHeader>
          <div className='flex gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                setIsCancelModalOpen(false)
                setPendingChallengeToCancel(null)
              }}
            >
              Volver
            </Button>
            <Button type='button' disabled={isCancelling} onClick={() => void confirmCancelInvitation()}>
              Sí, cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {error && <p className='mt-3 text-sm text-destructive'>{error}</p>}
    </section>
    )
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  InfoIcon,
  KeyboardIcon,
  Link2Icon,
  Loader2Icon,
  MicIcon,
  SearchIcon,
  SparklesIcon,
  TextCursorInputIcon,
  Trash2Icon,
  TrophyIcon,
  UsersIcon,
  Volume2Icon,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
import {
  getChallengeWordSource,
  getIcaChallengeConfigLabel,
  hasCompletedMyPart,
  isLightningChallenge,
} from '../services/icaChallenges'
import { getIcaChallengePlayRoute } from '../routes/paths'
import { ICA_CHALLENGES_LOCAL, resetIcaChallengesLocal } from '../services/icaChallengesLocal'
import {
  availableTypesForTile,
  CHALLENGE_MODE_TILES,
  ModeTileGrid,
  ScopeToggle,
  tileForTypeId,
  WritingVariantPicker,
  type ChallengeModeTileId,
} from '../components/IcaChallenges/ChallengeModePicker'
import { JoinWordsGate } from '../components/IcaChallenges/JoinWordsGate'
import { ChallengeStatsCard, WinStreakChip } from '../components/IcaChallenges/ChallengeStats'
import type {
  IcaChallengePlayRecord,
  IcaChallengeRecord,
  IcaChallengeScope,
  IcaChallengeTypeRecord,
  IcaChallengeWordSource,
} from '../types'

type IcaChallengesViewProps = {
  targetLang: string
  nativeLang: string
}

type TabKey = 'active' | 'pending' | 'history'
type ModalStep = 'type' | 'rules'

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

function getResultLabel(challenge: IcaChallengeRecord, currentUserId: string | null): string {
  const resultType = challenge.resultType
  if ((resultType === 'challenger_win' || resultType === 'challenged_win') && currentUserId) {
    return challenge.winnerUserId === currentUserId ? 'Ganaste' : 'Perdiste'
  }
  switch (resultType) {
    case 'challenger_win':
      return 'Ganó el retador'
    case 'challenged_win':
      return 'Ganó el retado'
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

type ChallengeOutcome = 'won' | 'lost' | 'draw' | null

function getOutcome(challenge: IcaChallengeRecord, currentUserId: string | null): ChallengeOutcome {
  if (challenge.resultType === 'draw') return 'draw'
  if ((challenge.resultType === 'challenger_win' || challenge.resultType === 'challenged_win') && currentUserId) {
    return challenge.winnerUserId === currentUserId ? 'won' : 'lost'
  }
  return null
}

/** Historial: azul si ganaste, rojo si perdiste (Luis). */
const OUTCOME_STYLE: Record<'won' | 'lost' | 'draw', { card: string; pill: string; score: string; label: string }> = {
  won: {
    card: 'border-blue-300 bg-blue-50 dark:border-blue-400/50 dark:bg-blue-500/15',
    pill: 'bg-blue-600 text-white dark:bg-blue-500',
    score: 'text-blue-700 dark:text-blue-300',
    label: 'Ganaste',
  },
  // Rojo suave (Luis: «demasiado fuerte»): se nota, pero no grita.
  lost: {
    card: 'border-rose-200 bg-rose-50/50 dark:border-rose-400/20 dark:bg-rose-500/[0.06]',
    pill: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    score: 'text-rose-600/90 dark:text-rose-300/80',
    label: 'Perdiste',
  },
  draw: {
    card: '',
    pill: 'bg-muted text-foreground',
    score: '',
    label: 'Empate',
  },
}

function getChallengeTypePitch(type: IcaChallengeTypeRecord): string {
  const value = type.config.pitch
  return typeof value === 'string' && value.trim() ? value.trim() : 'Modo de desafío ICA.'
}

function getChallengeTypeSeconds(type: IcaChallengeTypeRecord): number | null {
  const value = Math.round(Number(type.config.secondsPerQuestion))
  return Number.isFinite(value) && value > 0 ? value : null
}

function getChallengeTypeSessionSeconds(type: IcaChallengeTypeRecord): number {
  const value = Math.round(Number(type.config.sessionSeconds))
  return Number.isFinite(value) && value > 0 ? value : 60
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

function renderLightningProgress(input: {
  plays: IcaChallengePlayRecord[]
  userId: string | null
  rivalUserId: string
  rivalName: string
}) {
  const count = (userId: string | null) =>
    input.plays.filter((play) => play.userId === userId && play.isCorrect).length
  const played = (userId: string | null) => input.plays.some((play) => play.userId === userId)

  return (
    <div className='mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-center'>
      {[
        { label: 'Tú', userId: input.userId },
        { label: input.rivalName.split(' ')[0] || 'Rival', userId: input.rivalUserId },
      ].map((item) => (
        <div key={item.label} className='rounded-lg bg-muted/30 px-2 py-1.5'>
          <p className='truncate text-xs text-muted-foreground'>{item.label}</p>
          <p className='font-serif text-lg leading-tight'>
            {played(item.userId) ? count(item.userId) : '–'}
            <span className='ml-1 text-xs font-sans text-muted-foreground'>aciertos</span>
          </p>
        </div>
      ))}
    </div>
  )
}

function renderOwnWordsProgress(input: {
  plays: IcaChallengePlayRecord[]
  userId: string | null
  rivalUserId: string
  rivalName: string
}) {
  const renderRow = (label: string, userId: string | null) => {
    const userPlays = input.plays.filter((play) => play.userId === userId)
    const playByIndex = new Map(userPlays.map((play) => [play.index, play]))
    const correctCount = userPlays.reduce((total, play) => total + Number(play.isCorrect), 0)

    return (
      <div className='grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-2'>
        <span className='truncate text-xs text-muted-foreground'>{label}</span>
        <div className='grid grid-cols-10 gap-1'>
          {Array.from({ length: 10 }, (_, index) => {
            const play = playByIndex.get(index)
            const colorClass =
              play === undefined
                ? 'bg-muted'
                : play.isCorrect
                  ? 'bg-primary'
                  : 'bg-destructive'

            return <span key={index} className={`h-1.5 rounded-full ${colorClass}`} />
          })}
        </div>
        <span className='text-right text-xs text-muted-foreground'>{correctCount}/10</span>
      </div>
    )
  }

  return (
    <div className='mt-3 space-y-2 border-t pt-3'>
      {renderRow('Tú', input.userId)}
      {renderRow(input.rivalName.split(' ')[0] || 'Rival', input.rivalUserId)}
    </div>
  )
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
    myLevel,
    myWordCount,
    minWordsToJoin,
    stats,
    isLoading,
    isSavingEnrollment,
    isCreatingChallenge,
    isResponding,
    isCancelling,
    currentUserId,
    error,
    setEnrollmentActive,
    createChallenge,
    respondInvitation,
    cancelInvitation,
    refreshAvailableUsers,
    refresh,
  } = useIcaChallengesOverview({
    targetLang,
    nativeLang,
  })

  // ?tab=pending abre «Pendientes» (así llega el aviso de «reto nuevo»).
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [tab, setTab] = useState<TabKey>(
    tabParam === 'pending' || tabParam === 'history' ? tabParam : 'active',
  )
  const autoTabDoneRef = useRef(false)
  const [search, setSearch] = useState('')
  const [rounds, setRounds] = useState<1 | 2 | 5 | 10>(2)
  const [responseSeconds, setResponseSeconds] = useState(5)
  const [durationDays, setDurationDays] = useState<1 | 2 | 3>(1)
  // Global = cada uno con sus palabras · Por idioma = mezcla de baúles (mismo idioma y nivel parecido)
  const [challengeScope, setChallengeScope] = useState<IcaChallengeScope>('global')
  const [scopeTouched, setScopeTouched] = useState(false)
  const [showScopeInfo, setShowScopeInfo] = useState(false)

  const [isChallengeModalOpen, setIsChallengeModalOpen] = useState(false)
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)
  const [modalStep, setModalStep] = useState<ModalStep>('type')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)
  const [selectedTileId, setSelectedTileId] = useState<ChallengeModeTileId | null>(null)
  const [pendingChallengeToCancel, setPendingChallengeToCancel] =
    useState<IcaChallengeRecord | null>(null)

  const isEnrolled = Boolean(enrollment?.isActive)
  // Hacen falta 20 palabras en el Baúl ICA de este idioma para entrar en los retos.
  const wordsLocked = myWordCount !== null && myWordCount < minWordsToJoin
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

  useEffect(() => {
    if (tabParam === 'pending' || tabParam === 'history' || tabParam === 'active') setTab(tabParam)
  }, [tabParam])

  // Si al entrar alguien te ha retado, se abre «Pendientes» (no «Activos»).
  useEffect(() => {
    if (autoTabDoneRef.current || isLoading) return
    autoTabDoneRef.current = true
    if (!tabParam && incomingChallenges.length > 0) setTab('pending')
  }, [incomingChallenges.length, isLoading, tabParam])

  const historyChallenges = useMemo(
    () =>
      challenges.filter(
        (challenge) => challenge.status !== 'created' && challenge.status !== 'in_progress',
      ),
    [challenges],
  )

  // Por idioma: solo icademers de tu mismo idioma y con nivel parecido.
  const scopedUsers = useMemo(
    () =>
      challengeScope === 'language'
        ? availableUsers.filter((user) => user.samePair && user.mixedAllowed)
        : availableUsers,
    [availableUsers, challengeScope],
  )

  // Si hay gente de tu idioma y nivel, se empieza en «Por idioma» (la primera vez).
  useEffect(() => {
    if (scopeTouched) return
    if (availableUsers.some((user) => user.samePair && user.mixedAllowed)) setChallengeScope('language')
  }, [availableUsers, scopeTouched])

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase().replace(/^@/, '')
    if (!query) return scopedUsers

    return scopedUsers.filter((user) => {
      const display = user.displayName.toLowerCase()
      const username = (user.username || '').toLowerCase()
      return display.includes(query) || username.includes(query)
    })
  }, [scopedUsers, search])

  const activePips = useMemo(
    () =>
      Array.from({ length: 3 }, (_, index) => index < myActiveChallengesCount).map(
        (isOn, index) => (
          <span
            key={`slot-${index}`}
            className={`h-1.5 w-4 rounded-full ${isOn ? 'bg-primary' : 'bg-muted-foreground/30'}`}
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
    setSelectedUserId(userId)
    setSelectedTypeId(null)
    setSelectedTileId(null)
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
      toast.success(accept ? 'Desafío aceptado. ¡Te toca empezar!' : 'Desafío rechazado.')
      // Al aceptar, se pasa a «Activos», donde está el botón para jugar.
      if (accept) setTab('active')
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
      toast.error('Elige un modo antes de enviar.')
      return
    }

    // Por idioma = mezcla de baúles · Global = cada uno con sus palabras
    const wordSource: IcaChallengeWordSource = challengeScope === 'language' ? 'mixed' : 'own'

    try {
      await createChallenge({
        challengeTypeId: selectedType.id,
        challengedUserId: selectedUser.userId,
        scope: challengeScope,
        config: {
          rounds,
          responseSeconds,
          wordSource,
        },
        durationSeconds: durationDays * 24 * 60 * 60,
      })

      setIsChallengeModalOpen(false)
      setModalStep('type')
      setSelectedUserId(null)
      setSelectedTypeId(null)
      setSelectedTileId(null)
      toast.success('Reto enviado. Avisamos al competidor por notificación.')
      setTab('pending')
    } catch (createError) {
      // El servidor ya manda el motivo en castellano ("Nivel demasiado distinto", etc.).
      const message = createError instanceof Error ? createError.message : 'No se pudo crear el desafío.'
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
    const isMixed = getChallengeWordSource(challenge) === 'mixed'
    const tile = tileForTypeId(challenge.challengeSlug)
    const Icon = tile?.icon
    return (
      <Badge variant='outline' className='h-auto max-w-full gap-1 whitespace-normal text-left text-xs'>
        {Icon && <Icon className='h-3 w-3 shrink-0' />}
        {label}
        {isMixed ? ' · Por idioma' : ' · Global'}
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
      <div className='mb-6 flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h2 className='font-serif text-3xl font-bold'>Desafíos ICA</h2>
          <p className='text-sm text-muted-foreground'>
            Reta a otros icademers y juega en turnos asincrónicos.
          </p>
        </div>
        <WinStreakChip stats={stats} />
      </div>

      {ICA_CHALLENGES_LOCAL && (
        <div className='mb-4 rounded-xl border border-violet-400/50 bg-violet-500/10 px-3 py-2.5 text-sm'>
          <p className='font-medium'>Modo local de prueba</p>
          <p className='mt-0.5 text-xs text-muted-foreground'>
            Juegas contra rivales de prueba y los desafíos se guardan solo en este navegador (no en Supabase).
            «Añadir a mi baúl» sí guarda la palabra de verdad.
          </p>
          <Button
            type='button'
            size='sm'
            variant='outline'
            className='mt-2'
            onClick={() => {
              resetIcaChallengesLocal()
              void refresh()
            }}
          >
            Empezar de cero
          </Button>
        </div>
      )}

      {wordsLocked && myWordCount !== null && (
        <JoinWordsGate wordCount={myWordCount} minWords={minWordsToJoin} targetLang={targetLang} />
      )}

      <div className='mb-4 rounded-2xl border bg-card p-4'>
        <div className='flex items-center gap-3'>
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
              isEnrolled ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
            }`}
          >
            <UsersIcon className='h-5 w-5' />
          </span>
          <div className='min-w-0 flex-1'>
            <p className='font-serif text-lg font-semibold leading-tight'>Disponible para retos</p>
            <p className='text-xs text-muted-foreground'>
              {wordsLocked
                ? `Se activa al llegar a ${minWordsToJoin} palabras`
                : isEnrolled
                  ? 'Puedes retar y que te reten'
                  : 'En pausa · no puedes retar ni recibir retos'}
            </p>
          </div>
          <Switch
            checked={isEnrolled}
            disabled={isLoading || isSavingEnrollment || (wordsLocked && !isEnrolled)}
            onCheckedChange={(checked) => void handleEnrollmentToggle(checked)}
            aria-label='Activar inscripción a desafíos ICA'
          />
        </div>
        <div className='mt-3 flex flex-wrap items-center gap-2 text-xs'>
          <span className='rounded-full border bg-muted/30 px-2.5 py-1'>
            {nativeLang} → {targetLang}
          </span>
          {myLevel && (
            <span className='rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-medium text-primary'>
              Nivel {myLevel}
            </span>
          )}
          <span className='inline-flex items-center gap-2 rounded-full border bg-muted/30 px-2.5 py-1'>
            <span className='flex items-center gap-1'>{activePips}</span>
            {myActiveChallengesCount} de 3 en curso
          </span>
        </div>
      </div>

      <Card>
        <CardContent>
          {isEnrolled && !wordsLocked && (
            <div className='mb-4 space-y-3'>
              <ScopeToggle
                value={challengeScope}
                onChange={(scope) => {
                  setScopeTouched(true)
                  setChallengeScope(scope)
                }}
                targetLang={targetLang}
              />
              <div className='relative'>
                <SearchIcon className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder='Buscar por nombre o @usuario'
                  className='h-9 pl-9 text-sm'
                />
              </div>

              <div className='flex items-center justify-between gap-2 px-1'>
                <p className='text-xs font-medium text-muted-foreground'>Icademers disponibles ahora</p>
                {/* La explicación va plegada: en el móvil ocupaba media pantalla. */}
                <button
                  type='button'
                  onClick={() => setShowScopeInfo((value) => !value)}
                  aria-expanded={showScopeInfo}
                  className='inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground'
                >
                  <InfoIcon className='h-3.5 w-3.5' />
                  ¿Cómo funciona?
                </button>
              </div>
              {showScopeInfo && (
                <p className='rounded-lg bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground'>
                  {challengeScope === 'language'
                    ? `Juegan con las mismas palabras: la mitad de tu baúl y la mitad del suyo. Solo ves icademers con tu mismo nivel o uno parecido${myLevel ? ` (tú: ${myLevel})` : ''}, y sus palabras te sirven para la inmersión.`
                    : 'Cada uno juega con las palabras de su propio Baúl ICA, sea cual sea su idioma.'}
                </p>
              )}

              {maxActiveLimitReached && (
                <p className='rounded-lg border border-sky-200/70 bg-sky-50/80 px-3 py-2 text-xs text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200'>
                  Ya alcanzaste el máximo de desafíos activos (3). Finaliza uno para volver a retar.
                </p>
              )}

              <div className='max-h-[26rem] overflow-y-auto rounded-lg border'>
                {filteredUsers.length === 0 ? (
                  <p className='px-3 py-4 text-sm text-muted-foreground'>
                    {search.trim()
                      ? 'No encontramos icademers para esa búsqueda.'
                      : challengeScope === 'language'
                        ? `Ahora mismo no hay icademers de ${targetLang} con un nivel parecido al tuyo. Prueba en «Global».`
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
                        <p className='flex flex-wrap items-center gap-1.5 font-medium leading-tight'>
                          {user.displayName}
                          {user.winStreak > 0 && (
                            <span
                              className='inline-flex items-center gap-0.5 rounded-full border border-amber-300 bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:border-amber-400/40 dark:text-amber-200'
                              title={`${user.winStreak} ${user.winStreak === 1 ? 'victoria seguida' : 'victorias seguidas'}`}
                            >
                              🔥 {user.winStreak}
                            </span>
                          )}
                        </p>
                        <p className='text-xs text-muted-foreground'>
                          {user.username ? `@${user.username} · ` : ''}
                          {user.nativeLang && user.targetLang
                            ? `${user.nativeLang} -> ${user.targetLang}`
                            : `${nativeLang} -> ${targetLang}`}
                        </p>
                        {user.level && (
                          <span className='mt-1 inline-flex rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary'>
                            {user.level}
                          </span>
                        )}
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
                      hasCompletedMyPart(challenge, currentUserId, playsByChallengeId[challenge.id])
                    const knownType = Boolean(challengeTypeById[challenge.challengeSlug]?.isPlayable)
                    const canOpenPlayView = alreadyPlayed || isMyTurn
                    const ctaLabel = alreadyPlayed ? 'Ver partida' : 'Jugar ahora'
                    const score = getScores(challenge, currentUserId)

                    return (
                      <div key={challenge.id} className='rounded-xl border p-3'>
                        <div className='mb-2 flex items-center justify-between gap-2'>
                          <div className='flex min-w-0 items-center gap-3'>
                            {renderAvatar(rival.displayName, rival.avatarUrl, rivalId)}
                            <div className='min-w-0'>
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
                          {knownType
                            ? getIcaChallengeConfigLabel(challenge)
                            : 'Configuración disponible próximamente'}
                        </p>
                        {knownType &&
                          (isLightningChallenge(challenge)
                            ? renderLightningProgress({
                                plays: playsByChallengeId[challenge.id] || [],
                                userId: currentUserId,
                                rivalUserId: rivalId,
                                rivalName: rival.displayName,
                              })
                            : renderOwnWordsProgress({
                                plays: playsByChallengeId[challenge.id] || [],
                                userId: currentUserId,
                                rivalUserId: rivalId,
                                rivalName: rival.displayName,
                              }))}
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
                        <div className='flex min-w-0 items-center gap-3'>
                          {renderAvatar(rival.displayName, rival.avatarUrl, rivalId)}
                          <div className='min-w-0'>
                            {renderChallengeChip(challenge)}
                            <p className='mt-1 font-medium'>{rival.displayName}</p>
                            <p className='text-xs text-muted-foreground'>
                              Pendiente de tu respuesta · {formatTimeLeft(challenge.acceptUntil)}
                            </p>
                          </div>
                        </div>
                        <Badge variant='secondary'>{getChallengeStatusLabel(challenge.status)}</Badge>
                      </div>
                      <p className='mb-3 text-xs text-muted-foreground'>
                        {getIcaChallengeConfigLabel(challenge)}
                      </p>

                      {wordsLocked && (
                        <p className='mb-2 text-xs text-muted-foreground'>
                          Para aceptar necesitas {minWordsToJoin} palabras en tu Baúl ICA.
                        </p>
                      )}
                      <div className='flex gap-2'>
                        <Button
                          type='button'
                          size='sm'
                          disabled={isResponding || wordsLocked}
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
                        <div className='flex min-w-0 items-center gap-3'>
                          {renderAvatar(rival.displayName, rival.avatarUrl, rivalId)}
                          <div className='min-w-0'>
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
                {stats && <ChallengeStatsCard stats={stats} />}
                {historyChallenges.map((challenge) => {
                  const rivalId = getOpponentUserId(challenge, currentUserId)
                  const rival = resolveUser(rivalId)
                  const score = getScores(challenge, currentUserId)
                  const statusLabel = getChallengeStatusLabel(challenge.status)
                  const resultLabel = getResultLabel(challenge, currentUserId)
                  const outcome = getOutcome(challenge, currentUserId)
                  const outcomeStyle = outcome ? OUTCOME_STYLE[outcome] : null
                  const iPlayed = (playsByChallengeId[challenge.id] || []).some(
                    (play) => play.userId === currentUserId,
                  )
                  const canReview =
                    iPlayed && Boolean(challengeTypeById[challenge.challengeSlug]?.isPlayable)
                  const footerLabel =
                    outcomeStyle || statusLabel === resultLabel
                      ? statusLabel
                      : `${statusLabel} · ${resultLabel}`

                  return (
                    <div key={challenge.id} className={`rounded-xl border p-3 ${outcomeStyle?.card ?? ''}`}>
                      <div className='flex items-center justify-between gap-2'>
                        <div className='flex min-w-0 items-center gap-3'>
                          {renderAvatar(rival.displayName, rival.avatarUrl, rivalId)}
                          <div className='min-w-0'>
                            {renderChallengeChip(challenge)}
                            <p className='mt-1 font-medium'>{rival.displayName}</p>
                            <p className='text-xs text-muted-foreground'>
                              {footerLabel}
                            </p>
                          </div>
                        </div>
                        <div className='flex shrink-0 flex-col items-end gap-1'>
                          {outcomeStyle && (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${outcomeStyle.pill}`}
                            >
                              {outcome === 'won' && <TrophyIcon className='h-3 w-3' />}
                              {outcomeStyle.label}
                            </span>
                          )}
                          <p className={`font-serif text-lg ${outcomeStyle?.score ?? ''}`}>
                            {score.mine} · {score.rival}
                          </p>
                        </div>
                      </div>
                      {canReview && (
                        <div className='mt-2 flex justify-end'>
                          <Button type='button' size='sm' variant='outline' asChild>
                            <Link to={getIcaChallengePlayRoute(challenge.id)}>Ver palabras</Link>
                          </Button>
                        </div>
                      )}
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
        <DialogContent className='max-h-[88vh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>
              {selectedUser ? `Retar a ${selectedUser.displayName}` : 'Elegir desafío'}
            </DialogTitle>
            <DialogDescription className='flex flex-wrap items-center gap-1.5'>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  challengeScope === 'language'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted text-foreground'
                }`}
              >
                {challengeScope === 'language' ? 'Por idioma · mezcla de baúles ICA' : 'Global · cada uno con sus palabras'}
              </span>
              {challengeScope === 'language' && selectedUser?.level && (
                <span className='text-xs'>
                  Tú: {myLevel || '—'} · {selectedUser.displayName.split(' ')[0]}: {selectedUser.level}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {modalStep === 'type' && (
            <ModeTileGrid
              types={challengeTypes}
              scope={challengeScope}
              onPick={(tile) => {
                const available = availableTypesForTile(tile, challengeTypes, challengeScope)
                if (available.length === 0) return
                setSelectedTileId(tile.id)
                setSelectedTypeId(available[0].id)
                setModalStep('rules')
              }}
            />
          )}

          {modalStep === 'rules' && selectedType && (() => {
            const tile =
              CHALLENGE_MODE_TILES.find((item) => item.id === selectedTileId) ?? tileForTypeId(selectedType.id)
            const TileIcon = tile?.icon ?? SparklesIcon
            const isLightning = selectedType.format === 'lightning'
            const isPairs = selectedType.kind === 'pairs'
            const writingTypes = tile ? availableTypesForTile(tile, challengeTypes, challengeScope) : []
            const wordType = challengeTypes.find((type) => type.id === 'ica-writing')
            const countdownType = challengeTypes.find((type) => type.id === 'ica-lightning')
            return (
              <div className='space-y-4'>
                <div className={`flex items-center gap-3 rounded-2xl border p-3 ${tile?.tone.tile ?? 'bg-muted/20'}`}>
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tile?.tone.icon ?? ''}`}>
                    <TileIcon className='h-5 w-5' />
                  </span>
                  <div className='min-w-0'>
                    <p className='font-serif text-lg font-semibold leading-tight'>{tile?.label ?? selectedType.name}</p>
                    <p className='text-sm text-muted-foreground'>{getChallengeTypePitch(selectedType)}</p>
                  </div>
                </div>

                {tile?.id === 'escritura' && (
                  <WritingVariantPicker
                    value={selectedType.id}
                    onChange={(typeId) => setSelectedTypeId(typeId)}
                    wordTypeAvailable={writingTypes.some((type) => type.id === 'ica-writing')}
                    countdownTypeAvailable={writingTypes.some((type) => type.id === 'ica-lightning')}
                    secondsPerWord={(wordType && getChallengeTypeSeconds(wordType)) || 7}
                    countdownSeconds={countdownType ? getChallengeTypeSessionSeconds(countdownType) : 60}
                  />
                )}

                {isLightning ? (
                  <div className='space-y-1'>
                    <Label>Duración del desafío</Label>
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
                            {value} día{value === 1 ? '' : 's'} para jugar
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className='grid grid-cols-2 gap-3 md:grid-cols-3'>
                    <div className='space-y-1'>
                      <Label>Rondas</Label>
                      {isPairs ? (
                        <Select
                          value={rounds === 1 ? '1' : '2'}
                          onValueChange={(value) => setRounds(Number(value) as 1 | 2)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='1'>1 con los 2 tableros</SelectItem>
                            <SelectItem value='2'>2 de 1 tablero</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Select
                          value={String(rounds)}
                          onValueChange={(value) => setRounds(Number(value) as 1 | 2 | 5 | 10)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='1'>1 de 10 palabras</SelectItem>
                            <SelectItem value='2'>2 de 5 palabras</SelectItem>
                            <SelectItem value='5'>5 de 2 palabras</SelectItem>
                            <SelectItem value='10'>10 de 1 palabra</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {selectedType.id === 'ica-own-words' ? (
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
                                {value}s por palabra
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className='space-y-1'>
                        <Label>Segundos</Label>
                        <p className='flex h-9 items-center rounded-md border bg-muted/20 px-3 text-sm'>
                          {getChallengeTypeSeconds(selectedType) ?? '—'}s por {isPairs ? 'tablero' : 'palabra'}
                        </p>
                      </div>
                    )}

                    <div className='col-span-2 space-y-1 md:col-span-1'>
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
                              {value} día{value === 1 ? '' : 's'} para jugar
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {selectedType.kind === 'write' && (
                  <p className='flex items-start gap-2 text-xs text-muted-foreground'>
                    <KeyboardIcon className='mt-0.5 h-3.5 w-3.5 shrink-0' />
                    Las tildes y letras especiales cuentan. Añade el teclado de {targetLang} en tu móvil para
                    escribirlas rápido.
                  </p>
                )}
                {selectedType.kind === 'speak' && (
                  <p className='flex items-start gap-2 text-xs text-muted-foreground'>
                    <MicIcon className='mt-0.5 h-3.5 w-3.5 shrink-0' />
                    Los dos necesitan micrófono. Funciona en Chrome (Android y ordenador) y en Safari (iPhone).
                  </p>
                )}
                {selectedType.kind === 'listen' && (
                  <p className='flex items-start gap-2 text-xs text-muted-foreground'>
                    <Volume2Icon className='mt-0.5 h-3.5 w-3.5 shrink-0' />
                    Con sonido: cada palabra se escucha en {targetLang}.
                  </p>
                )}
                {isPairs && (
                  <p className='flex items-start gap-2 text-xs text-muted-foreground'>
                    <Link2Icon className='mt-0.5 h-3.5 w-3.5 shrink-0' />
                    Toca una palabra y luego su significado. Al unir la última pareja se corrige el tablero.
                  </p>
                )}
                {selectedType.kind === 'cloze' && (
                  <p className='flex items-start gap-2 text-xs text-muted-foreground'>
                    <TextCursorInputIcon className='mt-0.5 h-3.5 w-3.5 shrink-0' />
                    Sale una frase de ejemplo con un hueco y eliges la palabra que falta entre 4 opciones.
                  </p>
                )}

                <div className='grid grid-cols-[auto_1fr] gap-2'>
                  <Button type='button' variant='outline' onClick={() => setModalStep('type')}>
                    Volver
                  </Button>
                  <Button
                    type='button'
                    disabled={!selectedUser || isCreatingChallenge || !selectedType.isPlayable}
                    onClick={() => void handleCreateChallenge()}
                  >
                    {isCreatingChallenge && <Loader2Icon className='mr-2 h-4 w-4 animate-spin' />}
                    Enviar reto
                  </Button>
                </div>
              </div>
            )
          })()}
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

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowLeftRightIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  KeyboardIcon,
  Loader2Icon,
  SearchIcon,
  SparklesIcon,
  TextCursorInputIcon,
  TimerIcon,
  TrophyIcon,
  XIcon,
} from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { getUiLang, langName, t, tn } from '@/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useIcaChallengesOverview } from '../hooks/useIcaChallengesOverview'
import {
  getChallengeWordSource,
  getIcaChallengeConfigLabel,
  hasCompletedMyPart,
  isLightningChallenge,
  translateChallengeMessage,
} from '../services/icaChallenges'
import { getIcaChallengePlayRoute } from '../routes/paths'
import { resetIcaChallengesLocal } from '../services/icaChallengesLocalBridge'
import { ICA_CHALLENGES_LOCAL } from '../services/icaChallengesLocalMode'
import {
  availableTypesForTile,
  CHALLENGE_MODE_TILES,
  ModeGlyphBadge,
  ModeTileGrid,
  ScopeToggle,
  tileForTypeId,
  WritingVariantPicker,
  type ChallengeModeTileId,
} from '../components/IcaChallenges/ChallengeModePicker'
import { JoinWordsGate } from '../components/IcaChallenges/JoinWordsGate'
import { ChallengeStatsCard, WinStreakChip } from '../components/IcaChallenges/ChallengeStats'
import {
  buyChallengeSlot,
  coinsText,
  useFichas,
} from '../game/fichas'
import { FichaIcon, FlameIcon, SwordsIcon } from '../game/icons'
import { EXTRA_CHALLENGE_COST } from '../game/rules'
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

const USERS_PAGE = 5
const USERS_MORE = 10
type ModalStep = 'type' | 'rules'

function getChallengeStatusLabel(status: string): string {
  switch (status) {
    case 'created':
      return t('Pendiente')
    case 'in_progress':
      return t('En curso')
    case 'completed':
      return t('Finalizado')
    case 'cancelled':
      return t('Cancelado')
    case 'expired':
      return t('Vencido')
    case 'not_accepted':
      return t('No aceptado')
    default:
      return status
  }
}

function getResultLabel(challenge: IcaChallengeRecord, currentUserId: string | null): string {
  const resultType = challenge.resultType
  if ((resultType === 'challenger_win' || resultType === 'challenged_win') && currentUserId) {
    return challenge.winnerUserId === currentUserId ? t('Ganaste') : t('Perdiste')
  }
  switch (resultType) {
    case 'challenger_win':
      return t('Ganó el retador')
    case 'challenged_win':
      return t('Ganó el retado')
    case 'draw':
      return t('Empate')
    case 'cancelled':
      return t('Cancelado')
    case 'expired':
      return t('Vencido')
    case 'not_accepted':
      return t('No aceptado')
    default:
      return t('Pendiente')
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
  // El texto llega del catálogo de modos (en español): se traduce al pintar.
  return typeof value === 'string' && value.trim() ? t(value.trim()) : t('Modo de desafío ICA.')
}

/** Nombre del idioma dentro de una frase: «polaco» en español, «Polish» en inglés. */
function inLang(name: string): string {
  const label = langName(name)
  return getUiLang() === 'en' ? label : label.toLowerCase()
}

/**
 * Explicación de cada modo con los idiomas de quien reta («Ves la palabra en español y la
 * escribes en francés»). Sin datos de rondas ni de turnos: eso ya se ve en la ventana.
 */
function getModePitch(type: IcaChallengeTypeRecord, nativeLang: string, targetLang: string): string {
  const native = inLang(nativeLang)
  const target = inLang(targetLang)
  switch (type.id) {
    case 'ica-own-words':
      return t('Lees la palabra en {native} y eliges la correcta entre 4 opciones.', { native })
    case 'ica-writing':
      return t('Ves la palabra en {native} y la escribes en {target}.', { native, target })
    case 'ica-lightning':
      return t('Escribe en {target} todas las palabras que puedas antes de que acabe la cuenta atrás. Gana quien acierte más.', { target })
    case 'ica-listen':
      return t('Escuchas una palabra ICA en {target} y eliges qué significa.', { target })
    case 'ica-speak':
      return t('Ves la palabra en {native} y la dices en voz alta en {target}.', { native, target })
    case 'ica-pairs':
      return t('Une cada palabra ICA con su significado. Si empatan, gana quien tarde menos.')
    default:
      return getChallengeTypePitch(type)
  }
}

/** Reglas fijas de los desafíos (no se eligen): 5 s por palabra en Lectura y 1 día para jugar. */
const READING_SECONDS = 5
const CHALLENGE_DAYS = 1

/** Un dato fijo del desafío: un dibujo pequeño, el valor y debajo qué es («5 s · por palabra»). */
function FixedRule({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className='flex flex-col items-center gap-0.5 rounded-2xl border-2 border-border bg-card px-2 py-2.5 text-center'>
      <span className='text-primary' aria-hidden='true'>
        {icon}
      </span>
      <span className='font-display text-lg leading-tight font-extrabold tabular-nums'>{value}</span>
      <span className='text-[11px] leading-tight font-semibold text-muted-foreground'>{label}</span>
    </div>
  )
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
  if (!dateIso) return t('Sin plazo')
  const diffMs = new Date(dateIso).getTime() - Date.now()
  if (!Number.isFinite(diffMs)) return t('Sin plazo')
  if (diffMs <= 0) return t('Caducado')

  const totalMinutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours} h ${minutes} min`
  return `${minutes} min`
}

/** Plazo corto para las filas de Pendientes: «quedan 21 h» o «quedan 40 min». */
function formatAcceptWindow(dateIso: string | null): string {
  if (!dateIso) return t('Sin plazo')
  const diffMs = new Date(dateIso).getTime() - Date.now()
  if (!Number.isFinite(diffMs)) return t('Sin plazo')
  if (diffMs <= 0) return t('Caducado')
  const totalMinutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(totalMinutes / 60)
  return hours > 0 ? t('quedan {n} h', { n: hours }) : t('quedan {n} min', { n: totalMinutes })
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
        { label: t('Tú'), userId: input.userId },
        { label: input.rivalName.split(' ')[0] || t('Rival'), userId: input.rivalUserId },
      ].map((item) => (
        <div key={item.label} className='rounded-lg bg-muted/30 px-2 py-1.5'>
          <p className='truncate text-xs text-muted-foreground'>{item.label}</p>
          <p className='font-display font-extrabold text-lg leading-tight'>
            {played(item.userId) ? count(item.userId) : '–'}
            <span className='ml-1 text-xs font-sans text-muted-foreground'>{t('aciertos')}</span>
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
      {renderRow(t('Tú'), input.userId)}
      {renderRow(input.rivalName.split(' ')[0] || t('Rival'), input.rivalUserId)}
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

  // El mismo color para todos (como en el ranking).
  void seed
  return (
    <span className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-border bg-muted text-xs font-extrabold text-foreground'>
      {getInitials(name)}
    </span>
  )
}

export function IcaChallengesView({ targetLang, nativeLang }: IcaChallengesViewProps) {
  const navigate = useNavigate()
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
    refresh: refreshOverview,
  } = useIcaChallengesOverview({
    targetLang,
    nativeLang,
  })

  // ?tab=pending abre «Pendientes» (así llega el aviso de «reto nuevo»).
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [tab, setTab] = useState<TabKey>(
    tabParam === 'pending' || tabParam === 'history' ? tabParam : 'active',
  )
  const autoTabDoneRef = useRef(false)
  const [search, setSearch] = useState('')
  // Rondas: solo «1 ronda de 10 palabras» o «2 rondas de 5». Segundos y duración son fijos.
  const [rounds, setRounds] = useState<1 | 2>(2)
  // Global = cada uno con sus palabras · Por idioma = mezcla de baúles (mismo idioma y nivel parecido)
  const [challengeScope, setChallengeScope] = useState<IcaChallengeScope>('global')
  const [scopeTouched, setScopeTouched] = useState(false)

  const [isChallengeModalOpen, setIsChallengeModalOpen] = useState(false)
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)
  const [modalStep, setModalStep] = useState<ModalStep>('type')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)
  const [selectedTileId, setSelectedTileId] = useState<ChallengeModeTileId | null>(null)
  const [pendingChallengeToCancel, setPendingChallengeToCancel] =
    useState<IcaChallengeRecord | null>(null)

  // Desafío extra: con 3 en curso, EXTRA_CHALLENGE_COST ICA Coins para retar a una 4.ª persona.
  const { user: authUser } = useAuth()
  const { total: coinBalance, unusedPasses: extraPasses, refresh: refreshCoins } = useFichas(authUser?.id)
  const [useExtraForNext, setUseExtraForNext] = useState(false)
  const [extraOfferUserId, setExtraOfferUserId] = useState<string | null>(null)
  const [buyingExtraPass, setBuyingExtraPass] = useState(false)

  const isEnrolled = Boolean(enrollment?.isActive)
  // Hacen falta 20 palabras en el Baúl ICA de este idioma para entrar en los retos.
  const wordsLocked = myWordCount !== null && myWordCount < minWordsToJoin
  const selectedUser = availableUsers.find((user) => user.userId === selectedUserId) ?? null
  const selectedType = challengeTypes.find((type) => type.id === selectedTypeId) ?? null
  const maxActiveLimitReached = myActiveChallengesCount >= 3
  // Solo un hueco extra: la 4.ª persona.
  const extraSlotPossible = myActiveChallengesCount === 3

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

  // Con quién ya tienes un desafío en marcha (no se puede tener dos con la misma persona).
  const activeRivalIds = useMemo(() => {
    const ids = new Set<string>()
    for (const challenge of challenges) {
      if (challenge.status !== 'created' && challenge.status !== 'in_progress') continue
      ids.add(challenge.challengerUserId)
      ids.add(challenge.challengedUserId)
    }
    return ids
  }, [challenges])

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

  // Lista de personas: de 5 en 5 (con «Ver más personas»). Al buscar, se ven todas las que coinciden.
  const [userLimit, setUserLimit] = useState(USERS_PAGE)
  const visibleUsers = search.trim() ? filteredUsers : filteredUsers.slice(0, userLimit)
  const hiddenUsersCount = filteredUsers.length - visibleUsers.length

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
      displayName: t('Usuario'),
      username: null,
      avatarUrl: null,
    }
  }

  const startChallengeFlow = (userId: string, withExtraSlot = false) => {
    setUseExtraForNext(withExtraSlot)
    setSelectedUserId(userId)
    setSelectedTypeId(null)
    setSelectedTileId(null)
    setModalStep('type')
    setIsChallengeModalOpen(true)
  }

  // ?retar=<id>: llega desde el perfil de un icademer en el ranking. Se abre el reto con esa
  // persona (o se explica por qué ahora no se puede) y se quita el parámetro.
  const retarParam = searchParams.get('retar')
  const retarHandledRef = useRef<string | null>(null)
  // useLayoutEffect: la ventana «Retar a …» se abre antes de pintar la página (sin parpadeo).
  useLayoutEffect(() => {
    if (!retarParam || isLoading || retarHandledRef.current === retarParam) return
    retarHandledRef.current = retarParam
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.delete('retar')
        return next
      },
      { replace: true },
    )
    const rival = availableUsers.find((item) => item.userId === retarParam)
    if (!isEnrolled) {
      toast.error(t('Activa Desafíos ICA para poder retar.'))
      return
    }
    if (!rival) {
      toast.error(t('Ahora mismo no se puede desafiar a este icademer.'))
      return
    }
    const onlyMyLimit =
      !rival.canChallenge &&
      extraSlotPossible &&
      !activeRivalIds.has(rival.userId) &&
      (rival.blockedReason === 'Tu máximo de desafíos activos es 3.' || !rival.blockedReason)
    if (!rival.canChallenge && !onlyMyLimit) {
      toast.error(translateChallengeMessage(rival.blockedReason || t('Ahora mismo no se puede desafiar a este icademer.')))
      return
    }
    // Con alguien de tu idioma y nivel se juega «Por idioma»; si no, «Global».
    setScopeTouched(true)
    setChallengeScope(rival.samePair && rival.mixedAllowed ? 'language' : 'global')
    if (onlyMyLimit) {
      if (extraPasses > 0) startChallengeFlow(rival.userId, true)
      else setExtraOfferUserId(rival.userId)
      return
    }
    startChallengeFlow(rival.userId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retarParam, isLoading, availableUsers, isEnrolled])

  const handleEnrollmentToggle = async (next: boolean) => {
    try {
      await setEnrollmentActive(next)
      toast.success(next ? t('Inscripción activa en Desafíos ICA.') : t('Te diste de baja de Desafíos ICA.'))
      if (next) {
        await refreshAvailableUsers('global')
      }
    } catch (toggleError) {
      toast.error(
        toggleError instanceof Error
          ? translateChallengeMessage(toggleError.message)
          : t('No se pudo actualizar tu inscripción.'),
      )
    }
  }

  const handleRespondInvitation = async (challengeId: string, accept: boolean) => {
    try {
      await respondInvitation(challengeId, accept)
      toast.success(accept ? t('Desafío aceptado. ¡Te toca empezar!') : t('Desafío rechazado.'))
      // Accepting starts the game right away (Luis, 6 Oct), instead of going to «Activos» first.
      if (accept) navigate(getIcaChallengePlayRoute(challengeId))
    } catch (respondError) {
      toast.error(
        respondError instanceof Error
          ? translateChallengeMessage(respondError.message)
          : t('No se pudo responder el desafío.'),
      )
    }
  }

  const handleCreateChallenge = async () => {
    if (!selectedUser || !selectedType) {
      toast.error(t('Elige un modo antes de enviar.'))
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
          responseSeconds: READING_SECONDS,
          wordSource,
        },
        durationSeconds: CHALLENGE_DAYS * 24 * 60 * 60,
        extraSlot: useExtraForNext,
      })
      await refreshCoins()
      setUseExtraForNext(false)

      setIsChallengeModalOpen(false)
      setModalStep('type')
      setSelectedUserId(null)
      setSelectedTypeId(null)
      setSelectedTileId(null)
      toast.success(t('Reto enviado. Avisamos al competidor por notificación.'))
      setTab('pending')
    } catch (createError) {
      // El servidor ya manda el motivo en castellano ("Nivel demasiado distinto", etc.).
      const message = createError instanceof Error ? translateChallengeMessage(createError.message) : t('No se pudo crear el desafío.')
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
      toast.success(t('Reto cancelado correctamente.'))
    } catch (cancelError) {
      toast.error(
        cancelError instanceof Error ? translateChallengeMessage(cancelError.message) : t('No se pudo cancelar el reto.'),
      )
    }
  }

  const getChallengeTypeLabel = (challenge: IcaChallengeRecord): string => {
    const challengeType = challengeTypeById[challenge.challengeSlug]
    return challengeType?.name ? t(challengeType.name) : challenge.challengeSlug
  }

  const renderChallengeChip = (challenge: IcaChallengeRecord) => {
    const challengeType = challengeTypeById[challenge.challengeSlug]
    const label = challengeType?.name ? t(challengeType.name) : challenge.challengeSlug
    const isMixed = getChallengeWordSource(challenge) === 'mixed'
    const tile = tileForTypeId(challenge.challengeSlug)
    const Icon = tile?.icon
    return (
      <Badge variant='outline' className='h-auto max-w-full gap-1 whitespace-normal text-left text-xs'>
        {Icon && <Icon className='h-3 w-3 shrink-0' />}
        {label}
        {isMixed ? ` · ${t('Por idioma')}` : ` · ${t('Global')}`}
      </Badge>
    )
  }

  return (
    isLoading ? (
      <section className='mx-auto flex min-h-[55vh] w-full max-w-4xl items-center justify-center p-4'>
        <div className='inline-flex items-center gap-2 text-sm text-muted-foreground'>
          <Loader2Icon className='h-4 w-4 animate-spin' />
          {t('Cargando desafíos...')}
        </div>
      </section>
    ) : (
    <section className='mx-auto w-full max-w-2xl flex-1 px-4 pt-2 pb-28 lg:py-8'>
      <div className='mb-5 flex items-center gap-3'>
        <span className='flex size-12 shrink-0 items-center justify-center rounded-2xl' style={{ background: 'var(--ica-a-soft)' }}>
          <SwordsIcon size={32} />
        </span>
        <div className='min-w-0 flex-1'>
          <h1 className='m-0 font-display text-2xl leading-tight font-extrabold tracking-tight lg:text-3xl'>{t('Desafíos ICA')}</h1>
          <div className='mt-1'>
            <WinStreakChip stats={stats} />
          </div>
        </div>
        {/* Activo / en pausa: arriba, a la vista */}
        <label className='flex shrink-0 cursor-pointer flex-col items-center gap-1'>
          <Switch
            checked={isEnrolled && !wordsLocked}
            disabled={isLoading || isSavingEnrollment || wordsLocked}
            onCheckedChange={(checked) => void handleEnrollmentToggle(checked)}
            aria-label={t('Activar inscripción a desafíos ICA')}
          />
          <span className={cn('text-[11px] font-extrabold', isEnrolled && !wordsLocked ? 'text-primary' : 'text-muted-foreground')}>
            {wordsLocked ? t('Bloqueado') : isEnrolled ? t('Activo') : t('En pausa')}
          </span>
        </label>
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
              void resetIcaChallengesLocal().then(refreshOverview)
            }}
          >
            Empezar de cero
          </Button>
        </div>
      )}

      {wordsLocked && myWordCount !== null && (
        <JoinWordsGate wordCount={myWordCount} minWords={minWordsToJoin} targetLang={targetLang} />
      )}

      {!isEnrolled && !wordsLocked ? (
        <p className='mb-5 rounded-2xl bg-muted/70 px-4 py-3 text-sm font-semibold text-muted-foreground'>
          {t('Estás en pausa: activa el interruptor para retar y que te reten.')}
        </p>
      ) : null}

      <div>
          {isEnrolled && !wordsLocked && (
            <div className='mb-6'>
              <div className='mb-2 flex items-center justify-between gap-2'>
                <p className='ica-label m-0'>{t('Reta a un icademer')}</p>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold',
                    maxActiveLimitReached ? 'bg-[var(--ica-a-soft)] text-[var(--ica-a-ink)]' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <span className='flex items-center gap-1'>{activePips}</span>
                  {maxActiveLimitReached
                    ? t('{n} en curso (máximo)', { n: myActiveChallengesCount })
                    : t('{n} de 3 en curso', { n: myActiveChallengesCount })}
                </span>
              </div>
              <div className='mb-2 flex items-center gap-1.5'>
                <ScopeToggle
                  value={challengeScope}
                  onChange={(scope) => {
                    setScopeTouched(true)
                    setChallengeScope(scope)
                  }}
                  targetLang={targetLang}
                />
                <div className='relative ml-auto min-w-0 flex-1 sm:max-w-56'>
                  <SearchIcon className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('Buscar')}
                    aria-label={t('Buscar por nombre o @usuario')}
                    className='h-9 rounded-full pl-8 text-sm'
                  />
                </div>
              </div>
              <div className='ica-group'>
                {filteredUsers.length === 0 ? (
                  <p className='px-3 py-4 text-sm text-muted-foreground'>
                    {search.trim()
                      ? t('No encontramos icademers para esa búsqueda.')
                      : challengeScope === 'language'
                        ? t('Ahora mismo no hay icademers de {lang} con un nivel parecido al tuyo. Prueba en «Global».', { lang: langName(targetLang) })
                        : t('No hay icademers disponibles ahora mismo.')}
                  </p>
                ) : (
                  visibleUsers.map((user) => (
                    <div
                      key={user.userId}
                      className='grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b-2 border-border py-3 last:border-b-0'
                    >
                      {renderAvatar(
                        user.displayName,
                        userProfiles[user.userId]?.avatarUrl || null,
                        user.userId,
                      )}
                      <div>
                        <p className='flex flex-wrap items-center gap-1.5 font-bold leading-tight'>
                          {user.displayName}
                          {user.winStreak > 0 && (
                            <span
                              className='inline-flex items-center gap-0.5 rounded-full border-2 border-amber-300 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-extrabold text-amber-800 dark:border-amber-400/40 dark:text-amber-200'
                              aria-label={tn(user.winStreak, '{n} victoria seguida', '{n} victorias seguidas')}
                            >
                              <FlameIcon size={12} /> {user.winStreak}
                            </span>
                          )}
                        </p>
                        <p className='text-xs text-muted-foreground'>
                          {user.username ? `@${user.username} · ` : ''}
                          {user.nativeLang && user.targetLang
                            ? `${langName(user.nativeLang)} → ${langName(user.targetLang)}`
                            : `${langName(nativeLang)} → ${langName(targetLang)}`}
                        </p>
                        {user.level && (
                          <span className='mt-1 inline-flex rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary'>
                            {user.level}
                          </span>
                        )}
                        {user.blockedReason &&
                          user.blockedReason !== 'Tu máximo de desafíos activos es 3.' && (
                          <p className='text-xs text-amber-600'>{translateChallengeMessage(user.blockedReason)}</p>
                          )}
                      </div>
                      {(() => {
                        // Solo le frena tu máximo de 3: puede ser tu 4.º reto con un desafío extra.
                        const onlyMyLimit =
                          !user.canChallenge &&
                          extraSlotPossible &&
                          !activeRivalIds.has(user.userId) &&
                          (user.blockedReason === 'Tu máximo de desafíos activos es 3.' || !user.blockedReason)
                        if (onlyMyLimit) {
                          return (
                            <Button
                              type='button'
                              size='sm'
                              variant='outline'
                              className='gap-1 rounded-xl border-2 border-amber-300 font-extrabold text-amber-800 dark:border-amber-400/50 dark:text-amber-300'
                              disabled={!isEnrolled || isCreatingChallenge}
                              onClick={() => {
                                if (extraPasses > 0) startChallengeFlow(user.userId, true)
                                else setExtraOfferUserId(user.userId)
                              }}
                            >
                              <FichaIcon size={14} />
                              {extraPasses > 0 ? t('Desafío extra') : `${t('Extra')} · ${EXTRA_CHALLENGE_COST}`}
                            </Button>
                          )
                        }
                        return (
                          <Button
                            type='button'
                            size='sm'
                            variant={user.canChallenge ? 'default' : 'outline'}
                            className='rounded-xl font-extrabold'
                            disabled={!isEnrolled || !user.canChallenge || isCreatingChallenge}
                            onClick={() => startChallengeFlow(user.userId)}
                          >
                            {user.canChallenge ? t('Desafiar') : t('No disponible')}
                          </Button>
                        )
                      })()}
                    </div>
                  ))
                )}
              </div>
              {/* Con muchas personas no hace falta bajar hasta el final: se ven de 5 en 5 */}
              {hiddenUsersCount > 0 || userLimit > USERS_PAGE ? (
                <div className='mt-2 flex gap-2'>
                  {hiddenUsersCount > 0 ? (
                    <Button
                      type='button'
                      variant='outline'
                      className='h-11 flex-1 rounded-2xl font-extrabold'
                      onClick={() => setUserLimit((value) => value + USERS_MORE)}
                    >
                      <ChevronDownIcon className='size-4' strokeWidth={2.8} aria-hidden='true' />
                      {t('Ver más personas ({n})', { n: hiddenUsersCount })}
                    </Button>
                  ) : null}
                  {userLimit > USERS_PAGE ? (
                    <Button
                      type='button'
                      variant='ghost'
                      className='h-11 rounded-2xl font-extrabold text-muted-foreground'
                      onClick={() => setUserLimit(USERS_PAGE)}
                    >
                      <ChevronUpIcon className='size-4' strokeWidth={2.8} aria-hidden='true' />
                      {t('Ver menos')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          {/* Con el idioma bloqueado (menos de 20 palabras) no se ve ningún desafío. */}
          {!wordsLocked ? (
          <>
          <div className='mb-4 grid grid-cols-3 gap-2' role='tablist' aria-label={t('Tus desafíos')}>
            {(
              [
                { value: 'active', label: t('Activos ({n})', { n: inProgressChallenges.length }) },
                { value: 'pending', label: t('Pendientes ({n})', { n: incomingChallenges.length + outgoingChallenges.length }) },
                { value: 'history', label: t('Historial') },
              ] as const
            ).map((item) => (
              <button
                key={item.value}
                type='button'
                role='tab'
                aria-selected={tab === item.value}
                onClick={() => setTab(item.value)}
                className={cn(
                  'h-11 rounded-2xl border-2 px-1 text-xs font-extrabold transition-colors sm:text-sm',
                  tab === item.value
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className='space-y-3'>
            {tab === 'active' && (
              <>
                {inProgressChallenges.length > 0 ? (
                  <>
                  <p className='pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                    {t('En curso')}
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
                    const ctaLabel = alreadyPlayed ? t('Ver partida') : t('Jugar ahora')
                    const score = getScores(challenge, currentUserId)

                    return (
                      <div key={challenge.id} className='rounded-2xl border-2 border-border p-3'>
                        <div className='mb-2 flex items-center justify-between gap-2'>
                          <div className='flex min-w-0 items-center gap-3'>
                            {renderAvatar(rival.displayName, rival.avatarUrl, rivalId)}
                            <div className='min-w-0'>
                              {renderChallengeChip(challenge)}
                              <p className='mt-1 font-medium'>{rival.displayName}</p>
                              <p className='text-xs text-muted-foreground'>
                                {isMyTurn
                                  ? `${t('Te toca')} · ${formatTimeLeft(challenge.turnExpiresAt)}`
                                  : `${t('Turno de tu rival')} · ${formatTimeLeft(challenge.turnExpiresAt)}`}
                              </p>
                            </div>
                          </div>
                          <div className='text-right'>
                            <p className='font-display font-extrabold text-xl'>
                              {score.mine} · {score.rival}
                            </p>
                            <Badge variant='secondary'>{getChallengeStatusLabel(challenge.status)}</Badge>
                          </div>
                        </div>
                        <p className='mb-3 text-xs text-muted-foreground'>
                          {knownType
                            ? getIcaChallengeConfigLabel(challenge)
                            : t('Configuración disponible próximamente')}
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
                            <Button type='button' size='sm'
                          className='rounded-xl font-extrabold' asChild>
                              <Link to={getIcaChallengePlayRoute(challenge.id)}>{ctaLabel}</Link>
                            </Button>
                          ) : (
                            <Button type='button' size='sm'
                          className='rounded-xl font-extrabold' disabled>
                              {ctaLabel}
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  </>
                ) : (
                  <p className='rounded-2xl border-2 border-dashed border-border px-3 py-4 text-sm font-semibold text-muted-foreground'>
                    {t('No tienes desafíos en curso ahora mismo.')}
                  </p>
                )}
              </>
            )}

            {tab === 'pending' && (
              // Pendientes, en filas sencillas: quién, qué reto y cuánto queda; un botón por fila.
              <>
                {incomingChallenges.length > 0 && <p className='ica-label m-0'>{t('Te han retado')}</p>}
                {incomingChallenges.map((challenge) => {
                  const rivalId = getOpponentUserId(challenge, currentUserId)
                  const rival = resolveUser(rivalId)

                  return (
                    <div
                      key={challenge.id}
                      className='flex items-center gap-3 rounded-2xl border-2 p-3'
                      style={{
                        borderColor: 'color-mix(in oklab, var(--primary) 40%, transparent)',
                        background: 'color-mix(in oklab, var(--primary) 7%, var(--card))',
                      }}
                    >
                      {renderAvatar(rival.displayName, rival.avatarUrl, rivalId)}
                      <div className='min-w-0 flex-1'>
                        <p className='m-0 truncate font-extrabold'>{rival.displayName}</p>
                        <p className='m-0 truncate text-xs font-semibold text-muted-foreground'>
                          {formatAcceptWindow(challenge.acceptUntil)} · {getChallengeTypeLabel(challenge)}
                        </p>
                      </div>
                      <Button
                        type='button'
                        size='sm'
                        className='shrink-0 rounded-xl font-extrabold'
                        disabled={isResponding}
                        onClick={() => void handleRespondInvitation(challenge.id, true)}
                      >
                        {t('Aceptar')}
                      </Button>
                      <Button
                        type='button'
                        size='icon-sm'
                        variant='ghost'
                        className='shrink-0 text-muted-foreground'
                        disabled={isResponding}
                        aria-label={t('Rechazar el reto de {name}', { name: rival.displayName })}
                        onClick={() => void handleRespondInvitation(challenge.id, false)}
                      >
                        <XIcon className='size-4' strokeWidth={2.6} />
                      </Button>
                    </div>
                  )
                })}

                {outgoingChallenges.length > 0 && (
                  <p className={cn('ica-label m-0', incomingChallenges.length > 0 && 'pt-2')}>{t('Tus retos enviados')}</p>
                )}
                {outgoingChallenges.map((challenge) => {
                  const rivalId = getOpponentUserId(challenge, currentUserId)
                  const rival = resolveUser(rivalId)

                  return (
                    <div key={challenge.id} className='flex items-center gap-3 rounded-2xl border-2 border-border p-3'>
                      {renderAvatar(rival.displayName, rival.avatarUrl, rivalId)}
                      <div className='min-w-0 flex-1'>
                        <p className='m-0 truncate font-extrabold'>{rival.displayName}</p>
                        <p className='m-0 truncate text-xs font-semibold text-muted-foreground'>
                          {formatAcceptWindow(challenge.acceptUntil)} · {getChallengeTypeLabel(challenge)}
                        </p>
                      </div>
                      <Button
                        type='button'
                        size='sm'
                        variant='ghost'
                        className='shrink-0 rounded-xl font-extrabold text-muted-foreground'
                        disabled={isCancelling}
                        aria-label={t('Cancelar el reto a {name}', { name: rival.displayName })}
                        onClick={() => openCancelModal(challenge)}
                      >
                        {t('Cancelar')}
                      </Button>
                    </div>
                  )
                })}

                {incomingChallenges.length === 0 && outgoingChallenges.length === 0 && (
                  <p className='rounded-2xl border-2 border-dashed border-border px-3 py-4 text-sm font-semibold text-muted-foreground'>
                    {t('No tienes retos pendientes.')}
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
                    <div key={challenge.id} className={`rounded-2xl border-2 p-3 ${outcomeStyle?.card ?? 'border-border'}`}>
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
                              {t(outcomeStyle.label)}
                            </span>
                          )}
                          <p className={`font-display font-extrabold text-lg ${outcomeStyle?.score ?? ''}`}>
                            {score.mine} · {score.rival}
                          </p>
                        </div>
                      </div>
                      {canReview && (
                        <div className='mt-2 flex justify-end'>
                          <Button type='button' size='sm'
                          className='rounded-xl font-extrabold' variant='outline' asChild>
                            <Link to={getIcaChallengePlayRoute(challenge.id)}>{t('Ver palabras')}</Link>
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}

                {historyChallenges.length === 0 && (
                  <p className='rounded-2xl border-2 border-dashed border-border px-3 py-4 text-sm font-semibold text-muted-foreground'>
                    {t('Aún no tienes historial de desafíos.')}
                  </p>
                )}
              </>
            )}
          </div>
          </>
          ) : null}
      </div>

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
              {selectedUser ? t('Retar a {name}', { name: selectedUser.displayName }) : t('Elegir desafío')}
            </DialogTitle>
            <DialogDescription className='flex flex-wrap items-center gap-1.5'>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  challengeScope === 'language'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted text-foreground'
                }`}
              >
                {challengeScope === 'language' ? t('Por idioma · mezcla de baúles ICA') : t('Global · cada uno con sus palabras')}
              </span>
              {challengeScope === 'language' && selectedUser?.level && (
                <span className='text-xs'>
                  {t('Tú')}: {myLevel || '—'} · {selectedUser.displayName.split(' ')[0]}: {selectedUser.level}
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
                <div className='flex items-center gap-3 rounded-3xl border-2 border-border bg-card p-3'>
                  {tile ? (
                    <ModeGlyphBadge tile={tile} size='sm' />
                  ) : (
                    <span className='flex size-11 shrink-0 items-center justify-center rounded-2xl bg-muted'>
                      <TileIcon className='h-5 w-5' />
                    </span>
                  )}
                  <div className='min-w-0'>
                    <p className='font-display text-lg font-extrabold leading-tight'>{t(tile?.label ?? selectedType.name)}</p>
                    <p className='text-sm text-muted-foreground'>{getModePitch(selectedType, nativeLang, targetLang)}</p>
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

                {/* Rondas: las dos únicas opciones */}
                {!isLightning ? (
                  <div className='space-y-1.5'>
                    <p className='m-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>{t('Rondas')}</p>
                    <div className='grid grid-cols-2 gap-2' role='radiogroup' aria-label={t('Rondas')}>
                      {([1, 2] as const).map((value) => {
                        const active = rounds === value
                        return (
                          <button
                            key={value}
                            type='button'
                            role='radio'
                            aria-checked={active}
                            onClick={() => setRounds(value)}
                            className={`flex flex-col items-center rounded-2xl border-2 px-2 py-2.5 text-center transition-colors ${
                              active ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'
                            }`}
                          >
                            <span className='font-display text-base leading-tight font-extrabold'>
                              {value === 1 ? t('1 ronda') : t('2 rondas')}
                            </span>
                            <span className='text-xs font-semibold text-muted-foreground'>
                              {value === 1 ? t('de 10 palabras') : t('de 5 palabras')}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Lo que no se elige: los segundos y el día para jugar */}
                <div className='grid grid-cols-2 gap-2'>
                  <FixedRule
                    icon={<TimerIcon className='size-5' strokeWidth={2.4} />}
                    value={t('{n} s', {
                      n: isLightning
                        ? getChallengeTypeSessionSeconds(selectedType)
                        : selectedType.id === 'ica-own-words'
                          ? READING_SECONDS
                          : (getChallengeTypeSeconds(selectedType) ?? '—'),
                    })}
                    label={isLightning ? t('en total') : isPairs ? t('por tablero') : t('por palabra')}
                  />
                  <FixedRule
                    icon={<CalendarDaysIcon className='size-5' strokeWidth={2.4} />}
                    value={tn(CHALLENGE_DAYS, '{n} día', '{n} días')}
                    label={t('para jugar')}
                  />
                </div>

                {selectedType.kind === 'write' && (
                  // Importante para no perder puntos: va destacado.
                  <p className='m-0 flex items-start gap-2 rounded-2xl border-2 border-rose-300 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-800 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200'>
                    <KeyboardIcon className='mt-0.5 size-4 shrink-0' />
                    <span>
                      {t('Las tildes y letras especiales cuentan. Añade el teclado de {lang} en tu móvil para escribirlas rápido.', {
                        lang: inLang(targetLang),
                      })}
                    </span>
                  </p>
                )}
                {selectedType.kind === 'cloze' && (
                  <p className='flex items-start gap-2 text-xs text-muted-foreground'>
                    <TextCursorInputIcon className='mt-0.5 h-3.5 w-3.5 shrink-0' />
                    {t('Sale una frase de ejemplo con un hueco y eliges la palabra que falta entre 4 opciones.')}
                  </p>
                )}

                <div className='grid grid-cols-[auto_1fr] gap-2'>
                  {/* Vuelve a los modos sin cerrar la ventana (sigues retando a la misma persona). */}
                  <Button type='button' variant='outline' className='gap-1.5' onClick={() => setModalStep('type')}>
                    <ArrowLeftRightIcon className='size-4' aria-hidden='true' />
                    {t('Cambiar de modo')}
                  </Button>
                  <Button
                    type='button'
                    disabled={!selectedUser || isCreatingChallenge || !selectedType.isPlayable}
                    onClick={() => void handleCreateChallenge()}
                  >
                    {isCreatingChallenge && <Loader2Icon className='mr-2 h-4 w-4 animate-spin' />}
                    {t('Enviar reto')}
                  </Button>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={extraOfferUserId !== null} onOpenChange={(open) => (open ? null : setExtraOfferUserId(null))}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <SwordsIcon size={26} />
              {t('Desafío extra')}
            </DialogTitle>
            <DialogDescription>
              {t('Ya tienes 3 desafíos en curso. Por {coins} puedes retar a una 4.ª persona.', {
                coins: coinsText(EXTRA_CHALLENGE_COST),
              })}{' '}
              {t('Tienes {n} ICA Coins.', { n: coinBalance ?? 0 })}
            </DialogDescription>
          </DialogHeader>
          <div className='grid grid-cols-2 gap-2'>
            <Button type='button' variant='outline' className='h-11 rounded-2xl border-2 font-bold' onClick={() => setExtraOfferUserId(null)}>
              {t('Ahora no')}
            </Button>
            <Button
              type='button'
              className='h-11 gap-1.5 rounded-2xl font-extrabold'
              disabled={buyingExtraPass || (coinBalance ?? 0) < EXTRA_CHALLENGE_COST}
              onClick={async () => {
                if (buyingExtraPass) return
                const userId = extraOfferUserId
                if (!userId) return
                setBuyingExtraPass(true)
                try {
                  if (!(await buyChallengeSlot(authUser?.id, coinBalance ?? 0))) throw new Error('PURCHASE_FAILED')
                  await refreshCoins()
                } catch {
                  toast.error(t('Necesitas {coins}.', { coins: coinsText(EXTRA_CHALLENGE_COST) }))
                  return
                } finally {
                  setBuyingExtraPass(false)
                }
                setExtraOfferUserId(null)
                startChallengeFlow(userId, true)
              }}
            >
              <FichaIcon size={18} />
              {t('Usar {n}', { n: EXTRA_CHALLENGE_COST })}
            </Button>
          </div>
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
            <DialogTitle>{t('¿Cancelar este reto?')}</DialogTitle>
            <DialogDescription>
              {t('Se quitará de pendientes y tu rival ya no podrá aceptarlo.')}
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
              {t('Volver')}
            </Button>
            <Button type='button' disabled={isCancelling} onClick={() => void confirmCancelInvitation()}>
              {t('Sí, cancelar')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {error && <p className='mt-3 text-sm text-destructive'>{error}</p>}
    </section>
    )
  )
}

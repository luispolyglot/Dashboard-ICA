import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArchiveIcon,
  ArrowLeftIcon,
  CheckCheckIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SquareIcon,
  Trash2Icon,
  DownloadIcon,
  UserIcon,
  Volume2Icon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  deleteCoachingClassReportImage,
  deleteCoachingSession,
  fetchCoachingAccess,
  fetchCoachingAdmins,
  fetchCoachingUserInsights,
  fetchCoachingUserMemberships,
  type CoachingAdminRow,
  type CoachingUserInsights,
  type CoachingUserMembership,
  uploadCoachingClassReportImage,
  closeCoachingSession,
  hardDeleteCoachingSession,
  upsertMasterNoteFeedbackLoom,
  upsertCoachingUser,
} from '../services/coaching'
import { CoachingProgramPreview } from './CoachingProgramPreview'

type ManageCoachingUserViewProps = {
  userId: string
  initialSessionId?: string | null
}

type ClassSessionItem = {
  id: string
  key: string
  loomUrl: string | null
  report: string | null
  reportImagePath: string | null
  reportImageUrl: string | null
}

type ObjectiveDraft = {
  wordsTarget: string
  nmTarget: string
  icaStreakObjectivePct: string
  flashcardsStreakObjectivePct: string
  exerciseUrl: string
}

type ClassDraft = {
  loomUrl: string
  report: string
  imageFile: File | null
  removeImage: boolean
}

type SessionActionType = 'archive' | 'close' | 'hard-delete'
type CoachingViewMode = 'coach' | 'user-preview'

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No disponible'
  return date.toLocaleString()
}

function toString(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string') return value
  return ''
}

function normalizeProgramWeekKey(value: string): string {
  const normalized = value.trim().toUpperCase()
  const direct = normalized.match(/^W(\d{1,2})$/)
  if (direct) {
    const week = Number(direct[1])
    if (Number.isFinite(week) && week >= 1 && week <= 12) {
      return `W${String(week).padStart(2, '0')}`
    }
  }
  const legacy = normalized.match(/-S(\d)$/)
  if (legacy) {
    const week = Number(legacy[1])
    if (Number.isFinite(week) && week >= 1) {
      return `W${String(week).padStart(2, '0')}`
    }
  }
  return 'W01'
}

function weekKeyFromNumber(week: number): string {
  return `W${String(Math.min(12, Math.max(1, week))).padStart(2, '0')}`
}

function normalizeWeeklyObjectiveMap(
  value: unknown,
): Record<string, Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const output: Record<string, Record<string, unknown>> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    output[normalizeProgramWeekKey(key)] = raw as Record<string, unknown>
  }
  return output
}

function normalizeClassSessions(value: unknown): ClassSessionItem[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const row = item as Record<string, unknown>
      const id = toString(row.id) || `class-${index + 1}`
      const key = normalizeProgramWeekKey(
        toString(row.key || row.weekKey || row.week_key || row.week),
      )
      return {
        id,
        key,
        loomUrl: toString(row.loomUrl ?? row.loom_url) || null,
        report: toString(row.report) || null,
        reportImagePath:
          toString(row.reportImagePath ?? row.report_image_path) || null,
        reportImageUrl:
          toString(row.reportImageUrl ?? row.report_image_url) || null,
      }
    })
}

function draftFromObjective(value?: Record<string, unknown>): ObjectiveDraft {
  const exerciseRaw = value?.exercise
  const exerciseUrl =
    exerciseRaw &&
    typeof exerciseRaw === 'object' &&
    !Array.isArray(exerciseRaw)
      ? toString((exerciseRaw as Record<string, unknown>).url)
      : toString(value?.reportExerciseUrl)

  return {
    wordsTarget: toString(value?.wordsTarget),
    nmTarget: toString(value?.nmTarget),
    icaStreakObjectivePct: toString(
      value?.icaStreakObjectivePct ?? value?.icaStreakTargetPct,
    ),
    flashcardsStreakObjectivePct: toString(
      value?.flashcardsStreakObjectivePct ??
        value?.flashcardsStreakAchievedPct ??
        value?.icaStreakAchievedPct,
    ),
    exerciseUrl,
  }
}

function weekFromDate(
  activatedAt: string | null,
  value: string | null,
): number | null {
  if (!activatedAt || !value) return null
  const start = new Date(activatedAt)
  const current = new Date(value)
  if (Number.isNaN(start.getTime()) || Number.isNaN(current.getTime()))
    return null
  const week =
    Math.floor(
      (current.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000),
    ) + 1
  if (!Number.isFinite(week) || week < 1 || week > 12) return null
  return week
}

function formatSeconds(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

function SeekBack10Icon() {
  return (
    <div className='relative'>
      <RotateCcwIcon className='size-4' />
      <span className='absolute -right-1 -bottom-1 text-[9px] font-bold'>
        10
      </span>
    </div>
  )
}

function SeekForward10Icon() {
  return (
    <div className='relative'>
      <RotateCwIcon className='size-4' />
      <span className='absolute -right-1 -bottom-1 text-[9px] font-bold'>
        10
      </span>
    </div>
  )
}

function MasterNoteCoachAudioPlayer({
  noteId,
  audioUrl,
  audioChunks,
  totalDurationMs,
}: {
  noteId: string
  audioUrl: string | null
  audioChunks: Array<{ audioUrl: string | null; durationMs: number }>
  totalDurationMs: number
}) {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [positionSec, setPositionSec] = useState(0)
  const [durationSec, setDurationSec] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [trackIndex, setTrackIndex] = useState(0)
  const [trackBaseSec, setTrackBaseSec] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const tracks = useMemo(() => {
    if (audioUrl) {
      return [
        {
          url: audioUrl,
          durationSec: totalDurationMs > 0 ? totalDurationMs / 1000 : 0,
        },
      ]
    }

    return audioChunks
      .filter((chunk) => Boolean(chunk.audioUrl))
      .map((chunk) => ({
        url: chunk.audioUrl as string,
        durationSec: Math.max(0, chunk.durationMs) / 1000,
      }))
  }, [audioChunks, audioUrl, totalDurationMs])

  const expectedTotalSec = useMemo(() => {
    if (totalDurationMs > 0) return totalDurationMs / 1000
    return tracks.reduce(
      (sum, track) => sum + Math.max(0, track.durationSec),
      0,
    )
  }, [totalDurationMs, tracks])

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [])

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    audioRef.current = null
    setPlayingId(null)
    setIsPaused(false)
    setPositionSec(0)
    setDurationSec(expectedTotalSec)
    setTrackBaseSec(0)
    setTrackIndex(0)
  }

  const playTrack = useCallback(
    async (nextTrackIndex: number, baseSec: number) => {
      const track = tracks[nextTrackIndex]
      if (!track) return

      const nextAudio = new Audio(track.url)
      nextAudio.ontimeupdate = () => {
        setPositionSec(baseSec + (nextAudio.currentTime || 0))
      }
      nextAudio.onloadedmetadata = () => {
        if (expectedTotalSec > 0) {
          setDurationSec(expectedTotalSec)
          return
        }
        const remaining = tracks
          .slice(nextTrackIndex + 1)
          .reduce((sum, item) => sum + Math.max(0, item.durationSec), 0)
        const thisDuration = Number.isFinite(nextAudio.duration)
          ? nextAudio.duration
          : Math.max(0, track.durationSec)
        setDurationSec(baseSec + thisDuration + remaining)
      }
      nextAudio.onended = () => {
        const finishedDuration =
          track.durationSec > 0
            ? track.durationSec
            : Number.isFinite(nextAudio.duration)
              ? nextAudio.duration
              : 0
        const nextBase = baseSec + finishedDuration
        if (nextTrackIndex + 1 < tracks.length) {
          setTrackBaseSec(nextBase)
          void playTrack(nextTrackIndex + 1, nextBase)
          return
        }
        setPlayingId(null)
        setIsPaused(false)
        setPositionSec(expectedTotalSec > 0 ? expectedTotalSec : nextBase)
      }
      nextAudio.onerror = () => {
        setError('No se pudo reproducir el audio de la nota maestra.')
        setPlayingId(null)
        setIsPaused(false)
      }

      if (audioRef.current) {
        audioRef.current.pause()
      }

      audioRef.current = nextAudio
      setTrackIndex(nextTrackIndex)
      setTrackBaseSec(baseSec)

      try {
        await nextAudio.play()
        setPlayingId(noteId)
        setIsPaused(false)
        setError(null)
      } catch {
        setError('No se pudo reproducir el audio de la nota maestra.')
        setPlayingId(null)
      }
    },
    [expectedTotalSec, noteId, tracks],
  )

  const play = async () => {
    if (tracks.length === 0) return
    if (playingId === noteId) return
    setDurationSec(expectedTotalSec)
    void playTrack(0, 0)
  }

  const togglePause = async () => {
    const audio = audioRef.current
    if (!audio || playingId !== noteId) return
    if (audio.paused) {
      await audio.play()
      setIsPaused(false)
      return
    }
    audio.pause()
    setIsPaused(true)
  }

  const seekBy = (delta: number) => {
    const audio = audioRef.current
    if (!audio || playingId !== noteId) return
    const trackMaxSec =
      tracks[trackIndex]?.durationSec > 0
        ? tracks[trackIndex].durationSec
        : Number.isFinite(audio.duration)
          ? audio.duration
          : 0
    audio.currentTime = Math.max(
      0,
      Math.min((audio.currentTime || 0) + delta, trackMaxSec || 0),
    )
    setPositionSec(trackBaseSec + audio.currentTime)
  }

  return (
    <div className='rounded-md border p-2'>
      <div className='flex flex-wrap items-center gap-2'>
        {playingId !== noteId ? (
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() => void play()}
            disabled={tracks.length === 0}
          >
            <Volume2Icon className='mr-1 size-4' /> Escuchar
          </Button>
        ) : (
          <>
            <Button type='button' size='sm' variant='outline' onClick={stop}>
              <SquareIcon className='mr-1 size-4' /> Detener
            </Button>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => void togglePause()}
            >
              {isPaused ? (
                <PlayIcon className='mr-1 size-4' />
              ) : (
                <PauseIcon className='mr-1 size-4' />
              )}
              {isPaused ? 'Reanudar' : 'Pausar'}
            </Button>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => seekBy(-10)}
            >
              <SeekBack10Icon />
            </Button>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => seekBy(10)}
            >
              <SeekForward10Icon />
            </Button>
          </>
        )}
      </div>
      {playingId === noteId && (
        <p className='mt-2 text-xs text-muted-foreground'>
          {formatSeconds(positionSec)} / {formatSeconds(durationSec)}
        </p>
      )}
      {error && <p className='mt-1 text-xs text-destructive'>{error}</p>}
    </div>
  )
}

export function ManageCoachingUserView({
  userId,
  initialSessionId,
}: ManageCoachingUserViewProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [memberships, setMemberships] = useState<CoachingUserMembership[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string>('')
  const [insights, setInsights] = useState<CoachingUserInsights | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [coacherAdmins, setCoacherAdmins] = useState<CoachingAdminRow[]>([])
  const [savingCoacherUserId, setSavingCoacherUserId] = useState(false)
  const [changeCoacherModalOpen, setChangeCoacherModalOpen] = useState(false)
  const [nextCoacherUserId, setNextCoacherUserId] = useState('')

  const [objectiveDrafts, setObjectiveDrafts] = useState<
    Record<string, ObjectiveDraft>
  >({})
  const [classDrafts, setClassDrafts] = useState<Record<string, ClassDraft>>({})
  const [savingObjectiveWeek, setSavingObjectiveWeek] = useState<string | null>(
    null,
  )
  const [savingClassWeek, setSavingClassWeek] = useState<string | null>(null)
  const [classFeedbackByWeek, setClassFeedbackByWeek] = useState<
    Record<string, string>
  >({})
  const [feedbackLoomDraftByNoteId, setFeedbackLoomDraftByNoteId] = useState<
    Record<string, string>
  >({})
  const [feedbackNotesDraftByNoteId, setFeedbackNotesDraftByNoteId] = useState<
    Record<string, string>
  >({})
  const [savingFeedbackNoteId, setSavingFeedbackNoteId] = useState<
    string | null
  >(null)
  const [sessionActionModalOpen, setSessionActionModalOpen] = useState(false)
  const [sessionActionType, setSessionActionType] =
    useState<SessionActionType | null>(null)
  const [sessionActionReason, setSessionActionReason] = useState('')
  const [isApplyingSessionAction, setIsApplyingSessionAction] = useState(false)
  const [viewMode, setViewMode] = useState<CoachingViewMode>('coach')

  const selectedMembership = useMemo(
    () => memberships.find((row) => row.id === selectedSessionId) || null,
    [memberships, selectedSessionId],
  )

  const weekObjectives = useMemo(
    () => normalizeWeeklyObjectiveMap(insights?.weeklyObjectives),
    [insights?.weeklyObjectives],
  )

  const classSessions = useMemo(
    () => normalizeClassSessions(selectedMembership?.classSessions),
    [selectedMembership?.classSessions],
  )

  const classesByWeek = useMemo(() => {
    const map = new Map<string, ClassSessionItem[]>()
    for (const item of classSessions) {
      const existing = map.get(item.key) || []
      existing.push(item)
      map.set(item.key, existing)
    }
    return map
  }, [classSessions])

  useEffect(() => {
    const nextObjectives: Record<string, ObjectiveDraft> = {}
    const nextClassDrafts: Record<string, ClassDraft> = {}
    const nextFeedbackLoomDrafts: Record<string, string> = {}
    const nextFeedbackNotesDrafts: Record<string, string> = {}
    for (let week = 1; week <= 12; week += 1) {
      const key = weekKeyFromNumber(week)
      nextObjectives[key] = draftFromObjective(weekObjectives[key])
      const currentClass = (classesByWeek.get(key) || [])[0]
      nextClassDrafts[key] = {
        loomUrl: currentClass?.loomUrl || '',
        report: currentClass?.report || '',
        imageFile: null,
        removeImage: false,
      }
    }
    for (const note of insights?.masterNotes || []) {
      nextFeedbackLoomDrafts[note.id] = note.coachingFeedbackLoomUrl || ''
      nextFeedbackNotesDrafts[note.id] = note.coachingFeedbackNotes || ''
    }
    setObjectiveDrafts(nextObjectives)
    setClassDrafts(nextClassDrafts)
    setFeedbackLoomDraftByNoteId(nextFeedbackLoomDrafts)
    setFeedbackNotesDraftByNoteId(nextFeedbackNotesDrafts)
  }, [
    selectedMembership?.id,
    weekObjectives,
    classesByWeek,
    insights?.masterNotes,
  ])

  const loadAll = async () => {
    setLoading(true)
    setError(null)
    try {
      const [access, membershipRows] = await Promise.all([
        fetchCoachingAccess(),
        fetchCoachingUserMemberships(userId),
      ])
      setMemberships(membershipRows)
      const superAdmin = Boolean(access?.isCoachingSuperAdmin)
      setIsSuperAdmin(superAdmin)

      if (superAdmin) {
        const adminRows = await fetchCoachingAdmins()
        setCoacherAdmins(
          adminRows.filter(
            (row) =>
              row.isActive &&
              (row.role === 'coach_admin' || row.role === 'super_admin'),
          ),
        )
      } else {
        setCoacherAdmins([])
      }

      const sessionId =
        initialSessionId &&
        membershipRows.some((row) => row.id === initialSessionId)
          ? initialSessionId
          : membershipRows[0]?.id || ''

      setSelectedSessionId(sessionId)

      const selected = membershipRows.find((row) => row.id === sessionId)
      if (selected) {
        const insightsData = await fetchCoachingUserInsights({
          userId,
          sessionId: selected.id,
          targetLang: selected.targetLang,
        })
        setInsights(insightsData)
      } else {
        setInsights(null)
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar el usuario de coaching.',
      )
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChangeCoacherModal = () => {
    if (!selectedMembership || !isSuperAdmin) return
    setNextCoacherUserId(selectedMembership.coachUserId || '')
    setChangeCoacherModalOpen(true)
  }

  const handleChangeSessionCoacher = async () => {
    if (!selectedMembership || !isSuperAdmin || !isDirtySelectCoacher) return

    setSavingCoacherUserId(true)
    setFeedback(null)
    try {
      await upsertCoachingUser({
        sessionId: selectedMembership.id,
        userId: selectedMembership.userId,
        targetLang: selectedMembership.targetLang,
        nativeLang: selectedMembership.nativeLang,
        level: selectedMembership.level,
        coachUserId: nextCoacherUserId,
        feedbackNmUrl: selectedMembership.feedbackNmUrl,
        feedbackNmNotes: selectedMembership.feedbackNmNotes,
        notes: selectedMembership.notes,
      })

      setFeedback('Coacher de la sesión actualizado correctamente.')
      setChangeCoacherModalOpen(false)
      setNextCoacherUserId('')
      await loadAll()
    } catch (err) {
      setFeedback(
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar el coacher de la sesión.',
      )
    } finally {
      setSavingCoacherUserId(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [userId])

  useEffect(() => {
    if (!selectedSessionId || !selectedMembership) return
    let active = true
    setLoading(true)
    setError(null)

    void fetchCoachingUserInsights({
      userId,
      sessionId: selectedSessionId,
      targetLang: selectedMembership.targetLang,
    })
      .then((data) => {
        if (!active) return
        setInsights(data)
      })
      .catch((err) => {
        if (!active) return
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudo cargar el detalle del usuario.',
        )
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [selectedSessionId, selectedMembership?.targetLang, userId])

  const handleSaveObjective = async (weekKey: string) => {
    if (!selectedMembership || !insights) return
    const draft = objectiveDrafts[weekKey]
    if (!draft) return

    setSavingObjectiveWeek(weekKey)
    setFeedback(null)

    try {
      const existing = normalizeWeeklyObjectiveMap(insights.weeklyObjectives)
      const previousWeek = existing[weekKey] || {}
      const previousExercise =
        previousWeek.exercise && typeof previousWeek.exercise === 'object'
          ? (previousWeek.exercise as Record<string, unknown>)
          : {}
      const previousExerciseUrl = toString(previousExercise.url)
      const nextExerciseUrl = draft.exerciseUrl.trim() || null
      const shouldResetExerciseState = nextExerciseUrl !== previousExerciseUrl

      const nextWeekly = {
        ...existing,
        [weekKey]: {
          wordsTarget: draft.wordsTarget.trim()
            ? Number(draft.wordsTarget)
            : null,
          nmTarget: draft.nmTarget.trim() ? Number(draft.nmTarget) : null,
          icaStreakObjectivePct: draft.icaStreakObjectivePct.trim()
            ? Number(draft.icaStreakObjectivePct)
            : null,
          flashcardsStreakObjectivePct:
            draft.flashcardsStreakObjectivePct.trim()
              ? Number(draft.flashcardsStreakObjectivePct)
              : null,
          reportExerciseUrl: nextExerciseUrl,
          exercise: nextExerciseUrl
            ? {
                url: nextExerciseUrl,
                status: shouldResetExerciseState
                  ? 'pending'
                  : previousExercise.status === 'completed'
                    ? 'completed'
                    : 'pending',
                completedAt:
                  shouldResetExerciseState ||
                  previousExercise.status !== 'completed'
                    ? null
                    : toString(previousExercise.completedAt),
              }
            : null,
        },
      }

      await upsertCoachingUser({
        sessionId: selectedMembership.id,
        userId: selectedMembership.userId,
        targetLang: selectedMembership.targetLang,
        nativeLang: selectedMembership.nativeLang,
        level: selectedMembership.level,
        weeklyObjectives: nextWeekly,
      })

      setInsights((prev) =>
        prev ? { ...prev, weeklyObjectives: nextWeekly } : prev,
      )
      setFeedback(`Objetivos guardados para semana ${weekKey}.`)
    } catch (err) {
      setFeedback(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar el objetivo semanal.',
      )
    } finally {
      setSavingObjectiveWeek(null)
    }
  }

  const handleSaveClass = async (weekKey: string) => {
    if (!selectedMembership) return
    const draft = classDrafts[weekKey]
    if (!draft) return

    setSavingClassWeek(weekKey)
    setClassFeedbackByWeek((prev) => ({ ...prev, [weekKey]: '' }))

    try {
      const existingWeekClass = (classesByWeek.get(weekKey) || [])[0] || null
      const existingImagePath = existingWeekClass?.reportImagePath || null

      const nextLoomUrl = draft.loomUrl.trim() || null
      const nextReport = draft.report.trim() || null

      const previousLoomUrl = existingWeekClass?.loomUrl || null
      const previousReport = existingWeekClass?.report || null

      let nextImagePath = existingImagePath
      if (draft.imageFile) {
        nextImagePath = await uploadCoachingClassReportImage({
          file: draft.imageFile,
          userId: selectedMembership.userId,
          targetLang: selectedMembership.targetLang,
          weekKey,
        })
      } else if (draft.removeImage) {
        nextImagePath = null
      }

      const textChanged =
        nextLoomUrl !== previousLoomUrl || nextReport !== previousReport
      const imageChanged =
        Boolean(draft.imageFile) ||
        (draft.removeImage && Boolean(existingImagePath))

      if (!textChanged && !imageChanged) {
        setClassFeedbackByWeek((prev) => ({
          ...prev,
          [weekKey]: 'No hay cambios para guardar.',
        }))
        return
      }

      if (existingImagePath && nextImagePath !== existingImagePath) {
        await deleteCoachingClassReportImage(existingImagePath)
      }

      const nextWeekClass =
        nextLoomUrl || nextReport || nextImagePath
          ? {
              id: existingWeekClass?.id || crypto.randomUUID(),
              key: weekKey,
              weekKey,
              title: 'Clase semanal',
              loomUrl: nextLoomUrl,
              report: nextReport,
              reportImagePath: nextImagePath,
              reportImageUrl:
                nextImagePath && nextImagePath === existingImagePath
                  ? existingWeekClass?.reportImageUrl || null
                  : null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : null

      const otherWeeks = classSessions.filter((item) => item.key !== weekKey)
      const nextSessions = nextWeekClass
        ? [nextWeekClass, ...otherWeeks]
        : otherWeeks

      await upsertCoachingUser({
        sessionId: selectedMembership.id,
        userId: selectedMembership.userId,
        targetLang: selectedMembership.targetLang,
        nativeLang: selectedMembership.nativeLang,
        level: selectedMembership.level,
        classSessions: nextSessions,
      })

      setMemberships((prev) =>
        prev.map((membership) =>
          membership.id === selectedMembership.id
            ? { ...membership, classSessions: nextSessions }
            : membership,
        ),
      )

      setClassDrafts((prev) => ({
        ...prev,
        [weekKey]: {
          loomUrl: nextLoomUrl || '',
          report: nextReport || '',
          imageFile: null,
          removeImage: false,
        },
      }))
      setClassFeedbackByWeek((prev) => ({
        ...prev,
        [weekKey]: nextWeekClass
          ? existingWeekClass
            ? 'Clase actualizada correctamente.'
            : 'Clase guardada correctamente.'
          : 'Clase eliminada correctamente.',
      }))

      await loadAll()
    } catch (err) {
      setClassFeedbackByWeek((prev) => ({
        ...prev,
        [weekKey]:
          err instanceof Error ? err.message : 'No se pudo guardar la clase.',
      }))
    } finally {
      setSavingClassWeek(null)
    }
  }

  const handleSaveFeedback = async (
    masterNoteId: string,
    kind: 'video' | 'notes',
  ) => {
    if (!selectedMembership) return
    setSavingFeedbackNoteId(masterNoteId)
    setFeedback(null)

    try {
      await upsertMasterNoteFeedbackLoom({
        sessionId: selectedMembership.id,
        masterNoteId,
        feedbackLoomUrl:
          feedbackLoomDraftByNoteId[masterNoteId]?.trim() || null,
        feedbackNotes: feedbackNotesDraftByNoteId[masterNoteId]?.trim() || null,
      })

      setInsights((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          masterNotes: prev.masterNotes.map((note) =>
            note.id !== masterNoteId
              ? note
              : {
                  ...note,
                  coachingFeedbackLoomUrl:
                    feedbackLoomDraftByNoteId[masterNoteId]?.trim() || null,
                  coachingFeedbackNotes:
                    feedbackNotesDraftByNoteId[masterNoteId]?.trim() || null,
                },
          ),
        }
      })

      setFeedback(
        kind === 'video'
          ? 'Video de feedback guardado.'
          : 'Notas del coach guardadas.',
      )
    } catch (err) {
      setFeedback(
        err instanceof Error
          ? err.message
          : kind === 'video'
            ? 'No se pudo guardar el video de feedback.'
            : 'No se pudieron guardar las notas del coach.',
      )
    } finally {
      setSavingFeedbackNoteId(null)
    }
  }

  const closedNotesByWeek = useMemo(() => {
    const map = new Map<
      string,
      Array<{
        id: string
        name: string
        createdAt: string
        closedAt: string
        audioUrl: string | null
        audioChunks: Array<{ audioUrl: string | null; durationMs: number }>
        totalDurationMs: number
        feedbackLoomUrl: string | null
        feedbackNotes: string | null
      }>
    >()
    if (!insights || !selectedMembership?.activatedAt) return map

    for (const note of insights.masterNotes) {
      if (note.state !== 'closed') continue
      const weekNumber = weekFromDate(
        selectedMembership.activatedAt,
        note.closed_at || note.updated_at,
      )
      if (!weekNumber) continue
      const key = weekKeyFromNumber(weekNumber)
      const existing = map.get(key) || []
      existing.push({
        id: note.id,
        name: note.name,
        createdAt: note.created_at,
        closedAt: note.closed_at || note.updated_at,
        audioUrl: note.final_audio_path ? note.audioUrl : null,
        audioChunks: (note.audioChunks || []).map((item) => ({
          audioUrl: item.audioUrl || null,
          durationMs: item.duration_ms || 0,
        })),
        totalDurationMs: note.total_duration_ms || 0,
        feedbackLoomUrl: note.coachingFeedbackLoomUrl || null,
        feedbackNotes: note.coachingFeedbackNotes || null,
      })
      map.set(key, existing)
    }

    for (const [weekKey, notes] of map.entries()) {
      const sorted = [...notes].sort((a, b) =>
        a.name.localeCompare(b.name, 'es', {
          numeric: true,
          sensitivity: 'base',
        }),
      )
      map.set(weekKey, sorted)
    }

    return map
  }, [insights, selectedMembership?.activatedAt])

  const sessionCurrentWeek = useMemo(() => {
    if (!selectedMembership?.activatedAt) return null
    const activated = new Date(selectedMembership.activatedAt)
    if (Number.isNaN(activated.getTime())) return null
    return Math.min(
      12,
      Math.max(
        1,
        Math.floor(
          (Date.now() - activated.getTime()) / (7 * 24 * 60 * 60 * 1000),
        ) + 1,
      ),
    )
  }, [selectedMembership?.activatedAt])

  const previewMembership = useMemo(() => {
    if (!selectedMembership || !insights) return null

    const closedMasterNotesByWeek: Record<
      string,
      Array<{
        id: string
        name: string
        createdAt: string
        closedAt: string
        feedbackLoomUrl: string | null
        feedbackNotes?: string | null
      }>
    > = {}

    for (const [weekKey, notes] of closedNotesByWeek.entries()) {
      closedMasterNotesByWeek[weekKey] = notes.map((note) => ({
        id: note.id,
        name: note.name,
        createdAt: note.createdAt,
        closedAt: note.closedAt,
        feedbackLoomUrl: note.feedbackLoomUrl,
        feedbackNotes: note.feedbackNotes,
      }))
    }

    return {
      id: selectedMembership.id,
      targetLang: selectedMembership.targetLang,
      level: selectedMembership.level,
      status: selectedMembership.status,
      activatedAt: selectedMembership.activatedAt,
      durationWeeks: selectedMembership.durationWeeks,
      classSessions: selectedMembership.classSessions,
      weeklyObjectives: insights.weeklyObjectives,
      weekProgress: insights.weekProgress,
      closedMasterNotesByWeek,
    }
  }, [selectedMembership, insights, closedNotesByWeek])

  const coacherSelectOptions = useMemo(
    () =>
      [...coacherAdmins].sort((a, b) =>
        a.userDisplayName.localeCompare(b.userDisplayName, 'es', {
          sensitivity: 'base',
        }),
      ),
    [coacherAdmins],
  )

  const isDirtySelectCoacher = useMemo(() => {
    if (!selectedMembership || !nextCoacherUserId) return false
    return nextCoacherUserId !== (selectedMembership.coachUserId || '')
  }, [nextCoacherUserId, selectedMembership])

  const handleOpenSessionAction = (type: SessionActionType) => {
    setSessionActionType(type)
    setSessionActionReason('')
    setSessionActionModalOpen(true)
  }

  const handleConfirmSessionAction = async () => {
    if (!selectedMembership || !sessionActionType) return
    setIsApplyingSessionAction(true)
    setFeedback(null)

    try {
      if (sessionActionType === 'archive') {
        await deleteCoachingSession(selectedMembership.id)
        setFeedback('Sesión archivada correctamente.')
      } else if (sessionActionType === 'hard-delete') {
        await hardDeleteCoachingSession(selectedMembership.id)
        setFeedback('Sesión eliminada definitivamente.')
      } else {
        const result = await closeCoachingSession({
          sessionId: selectedMembership.id,
          closureReason: sessionActionReason.trim() || null,
        })
        setFeedback(
          `Sesión cerrada correctamente (semanas completadas: ${result.completedWeeks ?? 'n/d'}).`,
        )
      }

      setSessionActionModalOpen(false)
      await loadAll()
    } catch (err) {
      setFeedback(
        err instanceof Error
          ? err.message
          : 'No se pudo aplicar la accion sobre la sesión.',
      )
    } finally {
      setIsApplyingSessionAction(false)
    }
  }

  return (
    <section className='mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-5 py-8'>
      <div className='mb-5 flex flex-wrap items-center justify-between gap-2'>
        <Button type='button' variant='outline' onClick={() => navigate(-1)}>
          <ArrowLeftIcon className='h-4 w-4' />
          Volver
        </Button>

        <Button type='button' variant='ghost' onClick={() => void loadAll()}>
          Recargar
        </Button>
      </div>

      {(error || feedback) && (
        <p
          className={`mb-4 text-sm ${error ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {error || feedback}
        </p>
      )}

      <Card className='mb-4'>
        <CardHeader>
          <CardTitle>Sesión de coaching</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-wrap items-center gap-3'>
          <Select
            value={selectedSessionId}
            onValueChange={setSelectedSessionId}
          >
            <SelectTrigger className='min-w-72'>
              <SelectValue placeholder='Selecciona sesión coaching' />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {memberships.map((membership) => (
                  <SelectItem key={membership.id} value={membership.id}>
                    {membership.userDisplayName} · {membership.targetLang} (
                    {membership.level}) · {membership.status}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {selectedMembership && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type='button'
                  variant='outline'
                  size='icon'
                  aria-label='Acciones de sesión'
                >
                  <MoreHorizontalIcon className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                {selectedMembership.status !== 'draft' && (
                  <DropdownMenuItem
                    onClick={() => handleOpenSessionAction('close')}
                  >
                    <CheckCheckIcon className='h-4 w-4' />
                    Cerrar coaching
                  </DropdownMenuItem>
                )}
                {isSuperAdmin && (
                  <DropdownMenuItem onClick={handleOpenChangeCoacherModal}>
                    <UserIcon className='h-4 w-4' />
                    Cambiar coacher
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => handleOpenSessionAction('archive')}
                >
                  <ArchiveIcon className='h-4 w-4' />
                  Archivar sesión
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant='destructive'
                  onClick={() => handleOpenSessionAction('hard-delete')}
                >
                  <Trash2Icon className='h-4 w-4' />
                  Eliminar definitivo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {selectedMembership && (
            <p className='text-sm text-muted-foreground'>
              Idioma:{' '}
              <span className='font-medium text-foreground'>
                {selectedMembership.targetLang}
              </span>{' '}
              · Nivel:{' '}
              <span className='font-medium text-foreground'>
                {selectedMembership.level}
              </span>{' '}
              · Estado:{' '}
              <span className='font-medium text-foreground'>
                {selectedMembership.status}
              </span>
            </p>
          )}

          {selectedMembership && (
            <div className='ml-auto flex flex-wrap items-center gap-2'>
              <Button
                type='button'
                variant={viewMode === 'coach' ? 'default' : 'outline'}
                size='sm'
                onClick={() => setViewMode('coach')}
              >
                Edicion coach
              </Button>
              <Button
                type='button'
                variant={viewMode === 'user-preview' ? 'default' : 'outline'}
                size='sm'
                onClick={() => setViewMode('user-preview')}
              >
                Como lo ve el usuario
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <p className='text-sm text-muted-foreground'>Cargando detalle...</p>
      ) : !insights || !selectedMembership ? (
        <p className='text-sm text-muted-foreground'>
          No hay datos disponibles para este usuario.
        </p>
      ) : (
        <div className='grid gap-4'>
          {viewMode === 'user-preview' && previewMembership ? (
            <CoachingProgramPreview membership={previewMembership} />
          ) : (
            <>
              <Accordion
                type='multiple'
                className='w-full rounded-md border px-4'
              >
                {Array.from({ length: 12 }, (_, index) => {
                  const week = index + 1
                  const weekKey = weekKeyFromNumber(week)
                  const objectiveDraft =
                    objectiveDrafts[weekKey] || draftFromObjective()
                  const weekClasses = classesByWeek.get(weekKey) || []
                  const weekClass = weekClasses[0] || null
                  const classDraft = classDrafts[weekKey] || {
                    loomUrl: weekClass?.loomUrl || '',
                    report: weekClass?.report || '',
                    imageFile: null,
                    removeImage: false,
                  }
                  const draftLoom = classDraft.loomUrl.trim()
                  const draftReport = classDraft.report.trim()
                  const previousLoom = (weekClass?.loomUrl || '').trim()
                  const previousReport = (weekClass?.report || '').trim()
                  const hasExistingImage = Boolean(
                    weekClass?.reportImagePath || weekClass?.reportImageUrl,
                  )
                  const hasClassChanges =
                    draftLoom !== previousLoom ||
                    draftReport !== previousReport ||
                    Boolean(classDraft.imageFile) ||
                    (classDraft.removeImage && hasExistingImage)
                  const closedNotes = closedNotesByWeek.get(weekKey) || []

                  return (
                    <AccordionItem key={weekKey} value={weekKey}>
                      <AccordionTrigger>Semana {week}</AccordionTrigger>
                      <AccordionContent className='space-y-4'>
                        <Card>
                          <CardHeader>
                            <CardTitle>Clase de la semana</CardTitle>
                          </CardHeader>
                          <CardContent className='space-y-3'>
                            {classFeedbackByWeek[weekKey] && (
                              <p className='text-sm text-muted-foreground'>
                                {classFeedbackByWeek[weekKey]}
                              </p>
                            )}

                            <div className='space-y-1.5'>
                              <Label>Loom URL</Label>
                              <Input
                                value={classDraft.loomUrl}
                                onChange={(event) =>
                                  setClassDrafts((prev) => ({
                                    ...prev,
                                    [weekKey]: {
                                      ...(prev[weekKey] || {
                                        loomUrl: '',
                                        report: '',
                                        imageFile: null,
                                        removeImage: false,
                                      }),
                                      loomUrl: event.target.value,
                                    },
                                  }))
                                }
                                placeholder='Ej: https://www.loom.com/share/...'
                              />
                              {draftLoom && (
                                <a
                                  href={draftLoom}
                                  target='_blank'
                                  rel='noreferrer'
                                  className='inline-flex text-sm text-blue-600 underline underline-offset-2'
                                >
                                  Ver clase en Loom
                                </a>
                              )}
                            </div>

                            <div className='space-y-1.5'>
                              <Label>Reporte clase (opcional)</Label>
                              <Textarea
                                value={classDraft.report}
                                onChange={(event) =>
                                  setClassDrafts((prev) => ({
                                    ...prev,
                                    [weekKey]: {
                                      ...(prev[weekKey] || {
                                        loomUrl: '',
                                        report: '',
                                        imageFile: null,
                                        removeImage: false,
                                      }),
                                      report: event.target.value,
                                    },
                                  }))
                                }
                                placeholder='Ej: Practico speaking y corrigio errores clave'
                                rows={4}
                              />
                            </div>

                            <div className='space-y-1.5'>
                              <Label>Imagen de reporte</Label>
                              <Input
                                type='file'
                                accept='image/*'
                                onChange={(event) =>
                                  setClassDrafts((prev) => ({
                                    ...prev,
                                    [weekKey]: {
                                      ...(prev[weekKey] || {
                                        loomUrl: '',
                                        report: '',
                                        imageFile: null,
                                        removeImage: false,
                                      }),
                                      imageFile:
                                        event.target.files?.[0] || null,
                                      removeImage: false,
                                    },
                                  }))
                                }
                              />

                              {classDraft.imageFile && (
                                <div className='flex flex-wrap items-center gap-2 text-sm'>
                                  <p className='text-muted-foreground'>
                                    Nueva imagen: {classDraft.imageFile.name}
                                  </p>
                                  <Button
                                    type='button'
                                    variant='outline'
                                    size='sm'
                                    onClick={() =>
                                      setClassDrafts((prev) => ({
                                        ...prev,
                                        [weekKey]: {
                                          ...(prev[weekKey] || classDraft),
                                          imageFile: null,
                                        },
                                      }))
                                    }
                                  >
                                    Quitar seleccion
                                  </Button>
                                </div>
                              )}

                              {!classDraft.imageFile &&
                                hasExistingImage &&
                                !classDraft.removeImage && (
                                  <div className='flex flex-wrap items-center gap-2 text-sm'>
                                    {weekClass?.reportImageUrl && (
                                      <>
                                        <a
                                          href={weekClass.reportImageUrl}
                                          target='_blank'
                                          rel='noreferrer'
                                          className='text-blue-600 underline underline-offset-2'
                                        >
                                          Ver imagen actual
                                        </a>
                                        <a
                                          href={weekClass.reportImageUrl}
                                          download
                                          target='_blank'
                                          rel='noreferrer'
                                          className='inline-flex items-center gap-1 text-blue-600 underline underline-offset-2'
                                        >
                                          <DownloadIcon className='h-3.5 w-3.5' />
                                          Descargar imagen
                                        </a>
                                      </>
                                    )}
                                    <Button
                                      type='button'
                                      variant='destructive'
                                      size='sm'
                                      onClick={() =>
                                        setClassDrafts((prev) => ({
                                          ...prev,
                                          [weekKey]: {
                                            ...(prev[weekKey] || classDraft),
                                            removeImage: true,
                                          },
                                        }))
                                      }
                                    >
                                      <Trash2Icon className='h-3.5 w-3.5' />
                                      Quitar imagen
                                    </Button>
                                  </div>
                                )}

                              {classDraft.removeImage && (
                                <div className='flex flex-wrap items-center gap-2 text-sm'>
                                  <p className='text-muted-foreground'>
                                    La imagen actual se eliminara al guardar.
                                  </p>
                                  <Button
                                    type='button'
                                    variant='outline'
                                    size='sm'
                                    onClick={() =>
                                      setClassDrafts((prev) => ({
                                        ...prev,
                                        [weekKey]: {
                                          ...(prev[weekKey] || classDraft),
                                          removeImage: false,
                                        },
                                      }))
                                    }
                                  >
                                    Deshacer
                                  </Button>
                                </div>
                              )}
                            </div>

                            <Button
                              type='button'
                              variant='outline'
                              onClick={() => void handleSaveClass(weekKey)}
                              disabled={
                                savingClassWeek === weekKey || !hasClassChanges
                              }
                            >
                              {savingClassWeek === weekKey
                                ? 'Guardando...'
                                : weekClass
                                  ? 'Actualizar clase'
                                  : 'Guardar clase'}
                            </Button>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <CardTitle>Objetivos semanales</CardTitle>
                          </CardHeader>
                          <CardContent className='grid gap-2 md:grid-cols-2'>
                            <div className='space-y-1.5'>
                              <Label>Objetivo palabras ICA</Label>
                              <Input
                                type='number'
                                min={0}
                                step={1}
                                value={objectiveDraft.wordsTarget}
                                onChange={(event) =>
                                  setObjectiveDrafts((prev) => ({
                                    ...prev,
                                    [weekKey]: {
                                      ...prev[weekKey],
                                      wordsTarget: event.target.value,
                                    },
                                  }))
                                }
                                placeholder='Ej: 40'
                              />
                            </div>
                            <div className='space-y-1.5'>
                              <Label>Objetivo notas maestras cerradas</Label>
                              <Input
                                type='number'
                                min={0}
                                step={1}
                                value={objectiveDraft.nmTarget}
                                onChange={(event) =>
                                  setObjectiveDrafts((prev) => ({
                                    ...prev,
                                    [weekKey]: {
                                      ...prev[weekKey],
                                      nmTarget: event.target.value,
                                    },
                                  }))
                                }
                                placeholder='Ej: 2'
                              />
                            </div>
                            <div className='space-y-1.5'>
                              <Label>Objetivo % racha ICA</Label>
                              <Input
                                type='number'
                                min={0}
                                max={100}
                                step={1}
                                value={objectiveDraft.icaStreakObjectivePct}
                                onChange={(event) =>
                                  setObjectiveDrafts((prev) => ({
                                    ...prev,
                                    [weekKey]: {
                                      ...prev[weekKey],
                                      icaStreakObjectivePct: event.target.value,
                                    },
                                  }))
                                }
                                placeholder='Ej: 70'
                              />
                            </div>
                            <div className='space-y-1.5'>
                              <Label>Objetivo % racha flashcards</Label>
                              <Input
                                type='number'
                                min={0}
                                max={100}
                                step={1}
                                value={
                                  objectiveDraft.flashcardsStreakObjectivePct
                                }
                                onChange={(event) =>
                                  setObjectiveDrafts((prev) => ({
                                    ...prev,
                                    [weekKey]: {
                                      ...prev[weekKey],
                                      flashcardsStreakObjectivePct:
                                        event.target.value,
                                    },
                                  }))
                                }
                                placeholder='Ej: 55'
                              />
                            </div>

                            <div className='space-y-1.5 md:col-span-2'>
                              <Label>Objetivo Ejercicio (link)</Label>
                              <Input
                                value={objectiveDraft.exerciseUrl}
                                onChange={(event) =>
                                  setObjectiveDrafts((prev) => ({
                                    ...prev,
                                    [weekKey]: {
                                      ...prev[weekKey],
                                      exerciseUrl: event.target.value,
                                    },
                                  }))
                                }
                                placeholder='Ej: https://claude.ai/artifact/...'
                              />
                            </div>

                            <div className='md:col-span-2'>
                              <Button
                                type='button'
                                variant='outline'
                                onClick={() =>
                                  void handleSaveObjective(weekKey)
                                }
                                disabled={savingObjectiveWeek === weekKey}
                              >
                                {savingObjectiveWeek === weekKey
                                  ? 'Guardando...'
                                  : 'Guardar objetivos'}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <CardTitle>
                              Notas maestras cerradas de esta semana
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {closedNotes.length === 0 ? (
                              <p className='text-sm text-muted-foreground'>
                                No hay notas maestras cerradas en esta semana.
                              </p>
                            ) : (
                              <div className='space-y-3 text-sm'>
                                {closedNotes.map((note) => (
                                  <div
                                    key={note.id}
                                    className='space-y-2 rounded-md border p-3'
                                  >
                                    <p>
                                      {note.name} ·{' '}
                                      {formatDateTime(note.closedAt)}
                                    </p>

                                    <MasterNoteCoachAudioPlayer
                                      noteId={note.id}
                                      audioUrl={note.audioUrl}
                                      audioChunks={note.audioChunks}
                                      totalDurationMs={note.totalDurationMs}
                                    />

                                    <div className='space-y-1.5'>
                                      <Label>Video feedback (Loom)</Label>
                                      <div className='flex flex-wrap gap-2'>
                                        <Input
                                          value={
                                            feedbackLoomDraftByNoteId[
                                              note.id
                                            ] || ''
                                          }
                                          onChange={(event) =>
                                            setFeedbackLoomDraftByNoteId(
                                              (prev) => ({
                                                ...prev,
                                                [note.id]: event.target.value,
                                              }),
                                            )
                                          }
                                          placeholder='Ej: https://www.loom.com/share/...'
                                        />
                                        <Button
                                          type='button'
                                          variant='outline'
                                          onClick={() =>
                                            void handleSaveFeedback(
                                              note.id,
                                              'video',
                                            )
                                          }
                                          disabled={
                                            savingFeedbackNoteId === note.id
                                          }
                                        >
                                          {savingFeedbackNoteId === note.id
                                            ? 'Guardando...'
                                            : 'Guardar video'}
                                        </Button>
                                      </div>
                                      {note.feedbackLoomUrl && (
                                        <a
                                          href={note.feedbackLoomUrl}
                                          target='_blank'
                                          rel='noreferrer'
                                          className='text-blue-600 underline underline-offset-2'
                                        >
                                          Abrir video actual
                                        </a>
                                      )}
                                    </div>

                                    <div className='space-y-1.5'>
                                      <Label>Notas del coach</Label>
                                      <Textarea
                                        value={
                                          feedbackNotesDraftByNoteId[note.id] ||
                                          ''
                                        }
                                        onChange={(event) =>
                                          setFeedbackNotesDraftByNoteId(
                                            (prev) => ({
                                              ...prev,
                                              [note.id]: event.target.value,
                                            }),
                                          )
                                        }
                                        placeholder='Escribe observaciones mientras escuchas el audio...'
                                        rows={4}
                                      />
                                      <Button
                                        type='button'
                                        variant='outline'
                                        onClick={() =>
                                          void handleSaveFeedback(
                                            note.id,
                                            'notes',
                                          )
                                        }
                                        disabled={
                                          savingFeedbackNoteId === note.id
                                        }
                                      >
                                        {savingFeedbackNoteId === note.id
                                          ? 'Guardando...'
                                          : 'Guardar notas'}
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}
              </Accordion>

              <Card>
                <CardHeader>
                  <CardTitle>
                    Todas las palabras ICA ({insights.wordsCount})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {insights.words.length === 0 ? (
                    <p className='text-sm text-muted-foreground'>
                      Sin palabras ICA.
                    </p>
                  ) : (
                    <div className='max-h-72 space-y-1 overflow-y-auto rounded-md border p-2 text-sm'>
                      {insights.words.map((word) => (
                        <p key={word.id}>
                          {word.target} → {word.native} ({word.importance})
                        </p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      <Dialog
        open={changeCoacherModalOpen}
        onOpenChange={(open) => {
          if (savingCoacherUserId) return
          setChangeCoacherModalOpen(open)
          if (!open) setNextCoacherUserId('')
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar coacher</DialogTitle>
            <DialogDescription>
              Selecciona el coacher que tendrá asignada esta sesión.
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-3'>
            <p className='text-sm text-muted-foreground'>
              Sesión:{' '}
              <span className='font-medium text-foreground'>
                {selectedMembership?.userDisplayName || '-'} ·{' '}
                {selectedMembership?.targetLang || '-'}
              </span>
            </p>

            <div className='space-y-1.5'>
              <Label htmlFor='change-session-coacher'>Coacher</Label>
              <select
                id='change-session-coacher'
                className='h-10 w-full rounded-md border bg-background px-3 text-sm'
                value={nextCoacherUserId}
                onChange={(event) => setNextCoacherUserId(event.target.value)}
                disabled={savingCoacherUserId}
              >
                <option value=''>Selecciona coacher</option>
                {coacherSelectOptions.map((row) => (
                  <option key={row.userId} value={row.userId}>
                    {row.userDisplayName}{' '}
                    {row.role === 'super_admin' ? '(super_admin)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                setChangeCoacherModalOpen(false)
                setNextCoacherUserId('')
              }}
              disabled={savingCoacherUserId}
            >
              Cancelar
            </Button>
            <Button
              type='button'
              onClick={() => void handleChangeSessionCoacher()}
              disabled={savingCoacherUserId || !isDirtySelectCoacher}
            >
              {savingCoacherUserId ? 'Cambiando...' : 'Confirmar cambio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={sessionActionModalOpen}
        onOpenChange={setSessionActionModalOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {sessionActionType === 'archive'
                ? 'Archivar sesión'
                : sessionActionType === 'hard-delete'
                  ? 'Eliminar sesión definitivamente'
                  : 'Cerrar coaching'}
            </DialogTitle>
            <DialogDescription>
              {sessionActionType === 'archive'
                ? 'La sesión pasara a estado cancelled y se conservaran sus datos.'
                : sessionActionType === 'hard-delete'
                  ? 'Esta accion es irreversible y elimina toda la sesión.'
                  : `Se cerrara el coaching en la semana ${sessionCurrentWeek ?? 'n/d'} del programa.`}
            </DialogDescription>
          </DialogHeader>

          {sessionActionType === 'close' && (
            <div className='space-y-1.5'>
              <Label>Motivo de cierre (opcional)</Label>
              <Input
                value={sessionActionReason}
                onChange={(event) => setSessionActionReason(event.target.value)}
                placeholder='Ej: usuario finalizo antes por objetivos cumplidos'
              />
            </div>
          )}

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setSessionActionModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type='button'
              variant={
                sessionActionType === 'hard-delete' ? 'destructive' : 'default'
              }
              onClick={() => void handleConfirmSessionAction()}
              disabled={isApplyingSessionAction}
            >
              {isApplyingSessionAction ? 'Aplicando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeftIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SquareIcon,
  Trash2Icon,
  DownloadIcon,
  Volume2Icon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  deleteCoachingClassReportImage,
  fetchCoachingUserInsights,
  fetchCoachingUserMemberships,
  type CoachingUserInsights,
  type CoachingUserMembership,
  uploadCoachingClassReportImage,
  upsertMasterNoteFeedbackLoom,
  upsertCoachingUser,
} from '../services/coaching'

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
}

type ClassDraft = {
  loomUrl: string
  report: string
  imageFile: File | null
}

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
        reportImagePath: toString(row.reportImagePath ?? row.report_image_path) || null,
        reportImageUrl: toString(row.reportImageUrl ?? row.report_image_url) || null,
      }
    })
}

function draftFromObjective(value?: Record<string, unknown>): ObjectiveDraft {
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
  }
}

function weekFromDate(activatedAt: string | null, value: string | null): number | null {
  if (!activatedAt || !value) return null
  const start = new Date(activatedAt)
  const current = new Date(value)
  if (Number.isNaN(start.getTime()) || Number.isNaN(current.getTime())) return null
  const week = Math.floor((current.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
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
      <span className='absolute -right-1 -bottom-1 text-[9px] font-bold'>10</span>
    </div>
  )
}

function SeekForward10Icon() {
  return (
    <div className='relative'>
      <RotateCwIcon className='size-4' />
      <span className='absolute -right-1 -bottom-1 text-[9px] font-bold'>10</span>
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
    return tracks.reduce((sum, track) => sum + Math.max(0, track.durationSec), 0)
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
            <Button type='button' size='sm' variant='outline' onClick={() => void togglePause()}>
              {isPaused ? <PlayIcon className='mr-1 size-4' /> : <PauseIcon className='mr-1 size-4' />}
              {isPaused ? 'Reanudar' : 'Pausar'}
            </Button>
            <Button type='button' size='sm' variant='outline' onClick={() => seekBy(-10)}>
              <SeekBack10Icon />
            </Button>
            <Button type='button' size='sm' variant='outline' onClick={() => seekBy(10)}>
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

  const [objectiveDrafts, setObjectiveDrafts] = useState<Record<string, ObjectiveDraft>>({})
  const [classDrafts, setClassDrafts] = useState<Record<string, ClassDraft>>({})
  const [savingObjectiveWeek, setSavingObjectiveWeek] = useState<string | null>(null)
  const [savingClassWeek, setSavingClassWeek] = useState<string | null>(null)
  const [classFeedbackByWeek, setClassFeedbackByWeek] = useState<Record<string, string>>({})
  const [feedbackLoomDraftByNoteId, setFeedbackLoomDraftByNoteId] = useState<Record<string, string>>({})
  const [savingFeedbackNoteId, setSavingFeedbackNoteId] = useState<string | null>(null)

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
    for (let week = 1; week <= 12; week += 1) {
      const key = weekKeyFromNumber(week)
      nextObjectives[key] = draftFromObjective(weekObjectives[key])
      nextClassDrafts[key] = { loomUrl: '', report: '', imageFile: null }
    }
    for (const note of insights?.masterNotes || []) {
      nextFeedbackLoomDrafts[note.id] = note.coachingFeedbackLoomUrl || ''
    }
    setObjectiveDrafts(nextObjectives)
    setClassDrafts(nextClassDrafts)
    setFeedbackLoomDraftByNoteId(nextFeedbackLoomDrafts)
  }, [selectedMembership?.id, insights?.weeklyObjectives, insights?.masterNotes])

  const loadAll = async () => {
    setLoading(true)
    setError(null)
    try {
      const membershipRows = await fetchCoachingUserMemberships(userId)
      setMemberships(membershipRows)

      const sessionId =
        initialSessionId && membershipRows.some((row) => row.id === initialSessionId)
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
      const nextWeekly = {
        ...existing,
        [weekKey]: {
          wordsTarget: draft.wordsTarget.trim() ? Number(draft.wordsTarget) : null,
          nmTarget: draft.nmTarget.trim() ? Number(draft.nmTarget) : null,
          icaStreakObjectivePct: draft.icaStreakObjectivePct.trim()
            ? Number(draft.icaStreakObjectivePct)
            : null,
          flashcardsStreakObjectivePct: draft.flashcardsStreakObjectivePct.trim()
            ? Number(draft.flashcardsStreakObjectivePct)
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

      setInsights((prev) => (prev ? { ...prev, weeklyObjectives: nextWeekly } : prev))
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
      let reportImagePath: string | null = null
      if (draft.imageFile) {
        reportImagePath = await uploadCoachingClassReportImage({
          file: draft.imageFile,
          userId: selectedMembership.userId,
          targetLang: selectedMembership.targetLang,
          weekKey,
        })
      }

      const nextSessions = [
        {
          id: crypto.randomUUID(),
          key: weekKey,
          weekKey,
          title: 'Clase semanal',
          loomUrl: draft.loomUrl.trim() || null,
          report: draft.report.trim() || null,
          reportImagePath,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        ...classSessions,
      ]

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
        [weekKey]: { loomUrl: '', report: '', imageFile: null },
      }))
      setClassFeedbackByWeek((prev) => ({
        ...prev,
        [weekKey]: 'Clase guardada correctamente.',
      }))
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

  const handleDeleteClass = async (weekKey: string, classId: string) => {
    if (!selectedMembership) return
    setSavingClassWeek(weekKey)

    try {
      const sessionToDelete = classSessions.find((item) => item.id === classId)
      const nextSessions = classSessions.filter((item) => item.id !== classId)

      if (sessionToDelete?.reportImagePath) {
        await deleteCoachingClassReportImage(sessionToDelete.reportImagePath)
      }

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
      setClassFeedbackByWeek((prev) => ({
        ...prev,
        [weekKey]: 'Clase eliminada correctamente.',
      }))
    } catch (err) {
      setClassFeedbackByWeek((prev) => ({
        ...prev,
        [weekKey]:
          err instanceof Error ? err.message : 'No se pudo eliminar la clase.',
      }))
    } finally {
      setSavingClassWeek(null)
    }
  }

  const handleSaveFeedbackLoom = async (masterNoteId: string) => {
    if (!selectedMembership) return
    setSavingFeedbackNoteId(masterNoteId)
    setFeedback(null)

    try {
      await upsertMasterNoteFeedbackLoom({
        sessionId: selectedMembership.id,
        masterNoteId,
        feedbackLoomUrl: feedbackLoomDraftByNoteId[masterNoteId]?.trim() || null,
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
                },
          ),
        }
      })

      setFeedback('Video de feedback guardado.')
    } catch (err) {
      setFeedback(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar el video de feedback.',
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
        closedAt: string
        audioUrl: string | null
        audioChunks: Array<{ audioUrl: string | null; durationMs: number }>
        totalDurationMs: number
        feedbackLoomUrl: string | null
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
        closedAt: note.closed_at || note.updated_at,
        audioUrl:
          note.audioUrl ||
          note.audioChunks.find((item) => item.audioUrl)?.audioUrl ||
          null,
        audioChunks: (note.audioChunks || []).map((item) => ({
          audioUrl: item.audioUrl || null,
          durationMs: item.duration_ms || 0,
        })),
        totalDurationMs: note.total_duration_ms || 0,
        feedbackLoomUrl: note.coachingFeedbackLoomUrl || null,
      })
      map.set(key, existing)
    }

    return map
  }, [insights, selectedMembership?.activatedAt])

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
        <p className={`mb-4 text-sm ${error ? 'text-destructive' : 'text-muted-foreground'}`}>
          {error || feedback}
        </p>
      )}

      <Card className='mb-4'>
        <CardHeader>
          <CardTitle>Sesion de coaching</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-wrap items-center gap-3'>
          <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
            <SelectTrigger className='min-w-72'>
              <SelectValue placeholder='Selecciona sesion coaching' />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {memberships.map((membership) => (
                  <SelectItem key={membership.id} value={membership.id}>
                    {membership.userDisplayName} · {membership.targetLang} ({membership.level}) · {membership.status}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {selectedMembership && (
            <p className='text-sm text-muted-foreground'>
              Idioma: <span className='font-medium text-foreground'>{selectedMembership.targetLang}</span> · Nivel:{' '}
              <span className='font-medium text-foreground'>{selectedMembership.level}</span> · Estado:{' '}
              <span className='font-medium text-foreground'>{selectedMembership.status}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <p className='text-sm text-muted-foreground'>Cargando detalle...</p>
      ) : !insights || !selectedMembership ? (
        <p className='text-sm text-muted-foreground'>No hay datos disponibles para este usuario.</p>
      ) : (
        <div className='grid gap-4'>
          <Accordion type='multiple' className='w-full rounded-md border px-4'>
            {Array.from({ length: 12 }, (_, index) => {
              const week = index + 1
              const weekKey = weekKeyFromNumber(week)
              const objectiveDraft = objectiveDrafts[weekKey] || draftFromObjective()
              const weekClasses = classesByWeek.get(weekKey) || []
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
                            value={classDrafts[weekKey]?.loomUrl || ''}
                            onChange={(event) =>
                              setClassDrafts((prev) => ({
                                ...prev,
                                [weekKey]: {
                                  ...(prev[weekKey] || {
                                    loomUrl: '',
                                    report: '',
                                    imageFile: null,
                                  }),
                                  loomUrl: event.target.value,
                                },
                              }))
                            }
                            placeholder='Ej: https://www.loom.com/share/...'
                          />
                        </div>

                        <div className='space-y-1.5'>
                          <Label>Reporte clase (opcional)</Label>
                          <Input
                            value={classDrafts[weekKey]?.report || ''}
                            onChange={(event) =>
                              setClassDrafts((prev) => ({
                                ...prev,
                                [weekKey]: {
                                  ...(prev[weekKey] || {
                                    loomUrl: '',
                                    report: '',
                                    imageFile: null,
                                  }),
                                  report: event.target.value,
                                },
                              }))
                            }
                            placeholder='Ej: Practico speaking y corrigio errores clave'
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
                                  }),
                                  imageFile: event.target.files?.[0] || null,
                                },
                              }))
                            }
                          />
                        </div>

                        <Button
                          type='button'
                          variant='outline'
                          onClick={() => void handleSaveClass(weekKey)}
                          disabled={savingClassWeek === weekKey}
                        >
                          {savingClassWeek === weekKey ? 'Guardando...' : 'Guardar clase'}
                        </Button>

                        <div className='space-y-2 rounded-md border p-2'>
                          {weekClasses.length === 0 ? (
                            <p className='text-sm text-muted-foreground'>Sin clases cargadas.</p>
                          ) : (
                            weekClasses.map((session) => (
                              <div key={session.id} className='flex items-start justify-between gap-3 rounded border p-2 text-sm'>
                                <div className='min-w-0 space-y-1'>
                                  {session.loomUrl && (
                                    <a href={session.loomUrl} target='_blank' rel='noreferrer' className='text-blue-600 underline underline-offset-2'>
                                      Ver clase en Loom
                                    </a>
                                  )}
                                  {session.report && <p>{session.report}</p>}
                                  {session.reportImageUrl && (
                                    <div className='flex flex-wrap gap-2'>
                                      <a href={session.reportImageUrl} target='_blank' rel='noreferrer' className='text-blue-600 underline underline-offset-2'>
                                        Ver imagen de reporte
                                      </a>
                                      <a
                                        href={session.reportImageUrl}
                                        download
                                        target='_blank'
                                        rel='noreferrer'
                                        className='inline-flex items-center gap-1 text-blue-600 underline underline-offset-2'
                                      >
                                        <DownloadIcon className='h-3.5 w-3.5' />
                                        Descargar imagen
                                      </a>
                                    </div>
                                  )}
                                </div>
                                <Button
                                  type='button'
                                  variant='destructive'
                                  size='icon'
                                  onClick={() => void handleDeleteClass(weekKey, session.id)}
                                  disabled={savingClassWeek === weekKey}
                                >
                                  <Trash2Icon className='h-4 w-4' />
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
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
                                [weekKey]: { ...prev[weekKey], nmTarget: event.target.value },
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
                            value={objectiveDraft.flashcardsStreakObjectivePct}
                            onChange={(event) =>
                              setObjectiveDrafts((prev) => ({
                                ...prev,
                                [weekKey]: {
                                  ...prev[weekKey],
                                  flashcardsStreakObjectivePct: event.target.value,
                                },
                              }))
                            }
                            placeholder='Ej: 55'
                          />
                        </div>

                        <div className='md:col-span-2'>
                          <Button
                            type='button'
                            variant='outline'
                            onClick={() => void handleSaveObjective(weekKey)}
                            disabled={savingObjectiveWeek === weekKey}
                          >
                            {savingObjectiveWeek === weekKey ? 'Guardando...' : 'Guardar objetivos'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Notas maestras cerradas de esta semana</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {closedNotes.length === 0 ? (
                          <p className='text-sm text-muted-foreground'>
                            No hay notas maestras cerradas en esta semana.
                          </p>
                        ) : (
                          <div className='space-y-3 text-sm'>
                            {closedNotes.map((note) => (
                              <div key={note.id} className='space-y-2 rounded-md border p-3'>
                                <p>
                                  {note.name} · {formatDateTime(note.closedAt)}
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
                                      value={feedbackLoomDraftByNoteId[note.id] || ''}
                                      onChange={(event) =>
                                        setFeedbackLoomDraftByNoteId((prev) => ({
                                          ...prev,
                                          [note.id]: event.target.value,
                                        }))
                                      }
                                      placeholder='Ej: https://www.loom.com/share/...'
                                    />
                                    <Button
                                      type='button'
                                      variant='outline'
                                      onClick={() => void handleSaveFeedbackLoom(note.id)}
                                      disabled={savingFeedbackNoteId === note.id}
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
              <CardTitle>Todas las palabras ICA ({insights.wordsCount})</CardTitle>
            </CardHeader>
            <CardContent>
              {insights.words.length === 0 ? (
                <p className='text-sm text-muted-foreground'>Sin palabras ICA.</p>
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
        </div>
      )}
    </section>
  )
}

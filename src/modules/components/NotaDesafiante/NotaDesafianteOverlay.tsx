/**
 * NOTA DESAFIANTE — pantalla del juego (prototipo de la fase 2)
 *
 * 1. Suena un trozo de la frase en el idioma materno.
 * 2. Pitido: turno del alumno. Lo dice de memoria en el idioma que aprende.
 * 3. Se corta tras 4 s de silencio (máx. 30 s) y se compara.
 * 4. Si falla alguna palabra, suena la versión correcta. Al final: «18 de 25».
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangleIcon,
  CheckIcon,
  MicIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SkipForwardIcon,
  Volume2Icon,
  XIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { GameProgress, IconTile, Pill, tone } from '../../game/ui'
import { TargetGlyph, TrophyIcon } from '../../game/icons'
import { formatMasterNoteLabel } from '../../services/masterNotes'
import {
  prepareNoteChallenge,
  type ChallengePhraseInput,
  type PreparedChallenge,
} from '../../services/challengeChunks'
import { recordChallengePlay } from '../../services/challengeUnlocks'
import { prefetchSpeech, prefetchSpeechQueue } from '../../services/tts'
import {
  checkAnswer,
  isIOSDevice,
  isMicrophoneWarm,
  isSpeechRecognitionSupported,
  listenOnce,
  playBeep,
  playFailTone,
  playSuccessChime,
  speakAsync,
  stopSpeaking,
  unlockChallengeAudio,
  wait,
  waitMicrophoneReleased,
  warmUpMicrophone,
  type WordMark,
} from './challengeEngine'
import { getUiLang, langName, t, tn } from '@/i18n'

/** Nombre de idioma dentro de una frase: «en italiano» / "in Italian". */
const langInSentence = (name: string): string =>
  getUiLang() === 'en' ? langName(name) : name.toLowerCase()

type Props = {
  open: boolean
  /** Para guardar la partida (cuenta para el punto diario del ranking). */
  noteId?: string
  noteName: string
  phrases: ChallengePhraseInput[]
  targetLang: string
  nativeLang: string
  onClose: () => void
}

type Phase = 'preparing' | 'error' | 'intro' | 'mic' | 'running' | 'paused' | 'finished'
type Step = 'prompt' | 'listening' | 'feedback'

// Con al menos estas palabras bien (sin acertar el trozo entero) se dice «Casi».
const ALMOST_MIN_WORDS = 2

/** Lines of the game ready before it starts: the first 3 rounds (prompt + correct version). */
const VOICES_READY_BEFORE_START = 6
/** Never wait longer than this for the voices: the rest load while playing. */
const VOICES_MAX_WAIT_MS = 10_000
/** Fixed lines the game may say (prepared ahead too). */
const CHALLENGE_FIXED_LINES = ['Casi.', 'No te he entendido.']

/**
 * End of the game (Luis, 5 Oct): after «You got X out of Y», a few words that depend on the result.
 * All right: congratulations. Half or more: keep it up. Less than half: next time will be better.
 * None: a line to cheer them up.
 */
type ResultLevel = 'perfect' | 'good' | 'some' | 'none'
function resultLevel(score: number, total: number): ResultLevel {
  if (total > 0 && score >= total) return 'perfect'
  if (total > 0 && score >= total / 2) return 'good'
  return score > 0 ? 'some' : 'none'
}
const ENCOURAGEMENT_SPOKEN: Record<ResultLevel, string> = {
  perfect: '¡Enhorabuena por el trabajo!',
  good: '¡Sigue así, vas muy bien!',
  some: 'Seguro que la próxima vez sale mejor.',
  none: 'No pasa nada: cada intento cuenta. ¡A por la siguiente!',
}

type Feedback = {
  correct: boolean
  /** No es correcto, pero ha dicho bien varias palabras. Cuenta como fallo en la nota. */
  almost?: boolean
  marks: WordMark[]
  heard: string
  note?: string
}

type WakeLockSentinelLike = { release: () => Promise<void> }

export function NotaDesafianteOverlay({
  open,
  noteId,
  noteName,
  phrases,
  targetLang,
  nativeLang,
  onClose,
}: Props) {
  const [phase, setPhase] = useState<Phase>('preparing')
  const [prepared, setPrepared] = useState<PreparedChallenge | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showExcluded, setShowExcluded] = useState(false)
  const [index, setIndex] = useState(0)
  const [step, setStep] = useState<Step>('prompt')
  const [interim, setInterim] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [results, setResults] = useState<Array<boolean | null>>([])

  const runIdRef = useRef(0)
  const cancelListenRef = useRef<(() => void) | null>(null)
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null)
  const resultsRef = useRef<Array<boolean | null>>([])

  const rounds = prepared?.rounds ?? []
  const score = results.filter((value) => value === true).length

  // ---------------------------------------------------------------- preparar
  // Se prepara solo cuando cambian de verdad las frases, no cada vez que la página
  // de la nota se repinta (si no, el desafío podía volver a «Preparando…» a mitad).
  const phrasesKey = useMemo(
    () => phrases.map((item) => `${item.phraseId}|${item.target}|${item.native}`).join('§'),
    [phrases],
  )
  const phrasesRef = useRef(phrases)
  phrasesRef.current = phrases
  const langsRef = useRef({ nativeLang, targetLang })
  langsRef.current = { nativeLang, targetLang }
  const [preparingVoices, setPreparingVoices] = useState(false)

  useEffect(() => {
    if (!open) return
    const phrases = phrasesRef.current
    let active = true
    setPhase('preparing')
    setPrepared(null)
    setErrorMessage(null)
    setProgress({ done: 0, total: 0 })

    void prepareNoteChallenge({
      phrases,
      onProgress: (done, total) => {
        if (active) setProgress({ done, total })
      },
    })
      .then((result) => {
        if (!active) return
        setPrepared(result)
        if (!result.rounds.length) {
          setErrorMessage(t('Ninguna frase de esta nota puede entrar en el desafío.'))
          setPhase('error')
          return
        }
        // VOICES READY BEFORE PLAYING (Luis, 5 Oct): the premium voice takes 1-2 s the first time
        // it reads a text. All the game's lines are prepared now, in order, while «Preparing…» is
        // on screen; the game starts once the first rounds are ready (at most ~10 s of waiting)
        // and the rest keep loading ahead of the student. (On iPhone the game uses the device voice.)
        if (isIOSDevice()) {
          setPhase('intro')
          return
        }
        const { nativeLang: native, targetLang: target } = langsRef.current
        for (const line of [...CHALLENGE_FIXED_LINES, ...Object.values(ENCOURAGEMENT_SPOKEN)]) {
          void prefetchSpeech(t(line), native)
        }
        const ready = prefetchSpeechQueue(
          result.rounds.flatMap((round) => [
            { text: round.native, langName: native },
            { text: round.target, langName: target },
          ]),
        )
        setPreparingVoices(true)
        void Promise.race([Promise.all(ready.slice(0, VOICES_READY_BEFORE_START)), wait(VOICES_MAX_WAIT_MS)]).then(() => {
          if (!active) return
          setPreparingVoices(false)
          setPhase('intro')
        })
      })
      .catch((error) => {
        if (!active) return
        setErrorMessage(
          error instanceof Error ? error.message : t('No se pudo preparar el desafío.'),
        )
        setPhase('error')
      })

    return () => {
      active = false
    }
  }, [open, phrasesKey])

  // ---------------------------------------------------------------- utilidades
  const stopEverything = useCallback(() => {
    runIdRef.current += 1
    cancelListenRef.current?.()
    cancelListenRef.current = null
    stopSpeaking()
  }, [])

  const releaseWakeLock = useCallback(() => {
    void wakeLockRef.current?.release().catch(() => {})
    wakeLockRef.current = null
  }, [])

  const requestWakeLock = useCallback(async () => {
    try {
      const nav = navigator as unknown as {
        wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
      }
      if (nav.wakeLock) wakeLockRef.current = await nav.wakeLock.request('screen')
    } catch {
      // No pasa nada si el navegador no lo permite.
    }
  }, [])

  useEffect(() => {
    if (!open) {
      stopEverything()
      releaseWakeLock()
    }
    return () => {
      stopEverything()
      releaseWakeLock()
    }
  }, [open, stopEverything, releaseWakeLock])

  const setResultAt = (position: number, value: boolean) => {
    const next = [...resultsRef.current]
    next[position] = value
    resultsRef.current = next
    setResults(next)
  }

  // ---------------------------------------------------------------- un turno
  const runTurn = useCallback(
    async (position: number, runId: number): Promise<void> => {
      const cancelled = () => runIdRef.current !== runId
      const round = rounds[position]

      if (!round) {
        setPhase('finished')
        releaseWakeLock()
        const total = rounds.length
        const correct = resultsRef.current.filter((value) => value === true).length
        // Se guarda la partida: escuchar una nota + hacer su nota desafiante suma el punto del día.
        if (noteId) void recordChallengePlay(noteId, correct, total)
        await wait(300)
        if (!cancelled()) await speakAsync(`Has acertado ${correct} de ${total}.`, nativeLang)
        if (!cancelled()) await speakAsync(t(ENCOURAGEMENT_SPOKEN[resultLevel(correct, total)]), nativeLang)
        return
      }

      setIndex(position)
      setFeedback(null)
      setInterim('')

      let repeatedAfterSilence = false
      let usedFreeRetry = false
      let outcomeFeedback: Feedback | null = null

      while (!outcomeFeedback) {
        setStep('prompt')
        setInterim('')
        await speakAsync(round.native, nativeLang)
        if (cancelled()) return
        await playBeep()
        if (cancelled()) return

        setStep('listening')
        const listening = listenOnce(targetLang, { onInterim: setInterim })
        cancelListenRef.current = listening.cancel
        const outcome = await listening.promise
        cancelListenRef.current = null
        if (cancelled() || outcome.status === 'cancelled') return

        if (outcome.status === 'error') {
          setErrorMessage(outcome.message)
          setPhase('error')
          releaseWakeLock()
          return
        }

        if (outcome.status === 'silence') {
          // Si no empieza a hablar en 5 s, se repite el trozo una vez.
          if (!repeatedAfterSilence) {
            repeatedAfterSilence = true
            continue
          }
          outcomeFeedback = {
            correct: false,
            marks: round.target.split(/\s+/).map((word) => ({ word, ok: false })),
            heard: '',
            note: t('No has respondido.'),
          }
          break
        }

        if (outcome.status === 'unclear') {
          // Ruido: intento extra que no penaliza.
          if (!usedFreeRetry) {
            usedFreeRetry = true
            await speakAsync(t('No te he entendido.'), nativeLang)
            if (cancelled()) return
            continue
          }
          outcomeFeedback = {
            correct: false,
            marks: round.target.split(/\s+/).map((word) => ({ word, ok: false })),
            heard: '',
            note: t('No se ha entendido la respuesta.'),
          }
          break
        }

        const check = checkAnswer(round.target, outcome.candidates)
        outcomeFeedback = {
          correct: check.correct,
          almost: !check.correct && check.matchedWords >= ALMOST_MIN_WORDS,
          marks: check.marks,
          heard: check.heard,
        }
      }

      setResultAt(position, outcomeFeedback.correct)
      setFeedback(outcomeFeedback)
      setStep('feedback')

      if (outcomeFeedback.correct) {
        await playSuccessChime()
        await wait(600)
      } else {
        // «Casi» si ha dicho bien varias palabras; si no, tono de fallo.
        // Después, en los dos casos, suena la versión correcta como siempre.
        if (outcomeFeedback.almost) {
          await speakAsync(t('Casi.'), nativeLang)
        } else {
          await playFailTone()
        }
        if (cancelled()) return
        await wait(250)
        if (cancelled()) return
        await speakAsync(round.target, targetLang, 0.95)
        await wait(700)
      }
      if (cancelled()) return
      await runTurn(position + 1, runId)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rounds, nativeLang, targetLang, releaseWakeLock],
  )

  // ---------------------------------------------------------------- controles
  const start = async () => {
    // Primero, sin ningún await antes: desbloquear el audio dentro del toque.
    // (En iPhone, si no, la voz en el idioma materno no suena y solo se oyen los pitidos.)
    unlockChallengeAudio()
    stopEverything()
    const runId = runIdRef.current
    resultsRef.current = []
    setResults([])
    setFeedback(null)
    setErrorMessage(null)
    setIndex(0)
    void requestWakeLock()

    // Permisos del micrófono y del reconocimiento de voz ANTES del primer trozo,
    // para que no salten en mitad del juego.
    setPhase('mic')
    const wasWarm = isMicrophoneWarm()
    const mic = await warmUpMicrophone(targetLang)
    if (runIdRef.current !== runId) return
    if (!mic.ok) {
      setErrorMessage(mic.message)
      setPhase('error')
      releaseWakeLock()
      return
    }
    // Recién abierto y cerrado el micro, el móvil tarda un momento en volver a sacar el sonido
    // por el altavoz (y Android hace su propio «ding» al cerrarlo). Si la primera frase sonaba
    // ya, se cortaba y parecía que sonaba el aviso de hablar (Luis, 4 oct).
    if (!wasWarm) {
      await waitMicrophoneReleased()
      await wait(isIOSDevice() ? 600 : 900)
      if (runIdRef.current !== runId) return
    }

    setPhase('running')
    void runTurn(0, runId)
  }

  const pause = () => {
    stopEverything()
    setPhase('paused')
  }

  const resume = () => {
    unlockChallengeAudio()
    stopEverything()
    setPhase('running')
    const runId = runIdRef.current
    // Si el trozo actual ya tenía resultado, se sigue por el siguiente.
    const next = resultsRef.current[index] != null ? index + 1 : index
    void runTurn(next, runId)
  }

  const skip = () => {
    unlockChallengeAudio()
    stopEverything()
    setResultAt(index, false)
    setPhase('running')
    const runId = runIdRef.current
    void runTurn(index + 1, runId)
  }

  const close = () => {
    stopEverything()
    releaseWakeLock()
    onClose()
  }

  if (!open) return null

  const current = rounds[index]
  const phraseCount = new Set(rounds.map((round) => round.phraseId)).size
  const failedRounds = rounds
    .map((round, position) => ({ round, position }))
    .filter(({ position }) => results[position] === false)

  // ---------------------------------------------------------------- vista
  // Se pinta directamente en <body> para que nada de la página (cabecera, barra de
  // abajo, scroll) quede por encima y el botón «Salir» siempre se pueda tocar.
  return createPortal(
    <div
      className='fixed inset-0 z-100 flex flex-col bg-background text-foreground'
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className='flex shrink-0 items-center justify-between gap-3 border-b-2 border-border px-4 py-3'>
        <div className='flex min-w-0 items-center gap-3'>
          <IconTile tone='a' size={40} className='rounded-xl'>
            <TargetGlyph size={26} />
          </IconTile>
          <div className='min-w-0'>
            <p className='m-0 text-[11px] font-extrabold tracking-[0.1em] uppercase' style={{ color: tone('a').ink }}>
              {t('Nota desafiante')}
            </p>
            <p className='m-0 truncate font-display text-lg leading-tight font-extrabold tracking-tight'>
              {formatMasterNoteLabel(noteName)}
            </p>
          </div>
        </div>
        <Button type='button' variant='outline' onClick={close}>
          <XIcon className='size-4' strokeWidth={2.8} />
          {t('Salir')}
        </Button>
      </div>

      {/* m-auto centra cuando cabe, y cuando no cabe deja hacer scroll sin cortar la parte de arriba */}
      <div className='flex min-h-0 flex-1 overflow-y-auto px-5 py-8'>
        <div className='m-auto w-full max-w-xl'>
          {phase === 'preparing' && (
            <div className='flex flex-col items-center text-center'>
              <span className='ica-bob mb-5'>
                <TargetGlyph size={84} />
              </span>
              <p className='m-0 mb-2 font-display text-3xl font-black tracking-tight'>{t('Preparando tu desafío…')}</p>
              <p className='m-0 mb-6 text-base font-semibold text-muted-foreground'>
                {preparingVoices
                  ? t('Preparando las voces')
                  : progress.total > 0
                    ? t('Dividiendo frases en trozos: {done} de {total}', { done: progress.done, total: progress.total })
                    : t('Leyendo las frases de la nota')}
              </p>
              <GameProgress
                className='max-w-72'
                value={progress.total ? progress.done / progress.total : 0.15}
                color='var(--ica-a)'
                height={16}
              />
            </div>
          )}

          {phase === 'error' && (
            <div className='flex flex-col items-center text-center'>
              <IconTile tone='bad' size={80} className='mb-5 rounded-3xl'>
                <AlertTriangleIcon className='size-10' strokeWidth={2.4} />
              </IconTile>
              <p className='m-0 mb-2 font-display text-3xl font-black tracking-tight'>{t('No se puede empezar')}</p>
              <p className='m-0 mb-6 max-w-md text-base font-semibold text-muted-foreground'>{errorMessage}</p>
              {prepared && prepared.excluded.length > 0 && (
                <ExcludedList excluded={prepared.excluded} />
              )}
              <div className='flex w-full max-w-sm flex-col gap-3'>
                {rounds.length > 0 && (
                  <Button type='button' size='xl' variant='a' className='w-full' onClick={() => void start()}>
                    <RotateCcwIcon className='size-5' strokeWidth={2.6} />
                    {t('Reintentar')}
                  </Button>
                )}
                <Button
                  type='button'
                  size={rounds.length > 0 ? 'lg' : 'xl'}
                  variant={rounds.length > 0 ? 'outline' : 'a'}
                  className='w-full'
                  onClick={close}
                >
                  {t('Volver a la nota')}
                </Button>
              </div>
            </div>
          )}

          {phase === 'mic' && (
            <div className='flex flex-col items-center text-center'>
              <StatusCircle kind='listening' live className='mb-6' />
              <p className='m-0 mb-2 font-display text-3xl font-black tracking-tight'>{t('Preparando el micrófono…')}</p>
              <p className='m-0 max-w-md text-base font-semibold text-muted-foreground'>
                {t('Si te pide permiso para el micrófono o el reconocimiento de voz, pulsa «Permitir».')}
              </p>
            </div>
          )}

          {phase === 'intro' && prepared && (
            <div className='flex flex-col items-center text-center'>
              <span className='mb-4'>
                <TargetGlyph size={88} />
              </span>
              <p className='m-0 font-display text-3xl leading-tight font-black tracking-tight'>
                {t('¿Te la sabes de memoria?')}
              </p>

              <div className='mt-5 grid w-full grid-cols-3 gap-2'>
                <IntroStat value={rounds.length} label={t('trozos')} />
                <IntroStat value={phraseCount} label={phraseCount === 1 ? t('frase') : t('frases')} />
                <IntroStat value={`~${Math.max(1, Math.round((rounds.length * 12) / 60))}`} label={t('minutos')} />
              </div>

              <ol className='ica-group m-0 mt-5 w-full list-none divide-y-2 divide-border text-left'>
                <IntroStep
                  icon={<Volume2Icon className='size-6' strokeWidth={2.4} />}
                  toneName='i'
                  text={t('Oirás un trozo de tu frase en {lang}.', { lang: langInSentence(nativeLang) })}
                />
                <IntroStep
                  icon={<MicIcon className='size-6' strokeWidth={2.4} />}
                  toneName='a'
                  text={t('Tras el pitido, dilo en voz alta en {lang}, de memoria.', { lang: langInSentence(targetLang) })}
                />
                <IntroStep
                  icon={<CheckIcon className='size-6' strokeWidth={3} />}
                  toneName='ok'
                  text={t('Si no falla ninguna palabra, es correcto. Si no, oirás la versión buena.')}
                />
              </ol>

              {prepared.excluded.length > 0 && (
                <div className='mt-4 w-full'>
                  <button
                    type='button'
                    className='text-sm font-extrabold underline underline-offset-4'
                    style={{ color: 'var(--ica-gold-ink)' }}
                    onClick={() => setShowExcluded((value) => !value)}
                  >
                    {tn(prepared.excluded.length, '{n} frase queda fuera · ver por qué', '{n} frases quedan fuera · ver por qué')}
                  </button>
                  {showExcluded && <ExcludedList excluded={prepared.excluded} />}
                </div>
              )}

              {!isSpeechRecognitionSupported() ? (
                <p
                  className='m-0 mt-5 w-full rounded-2xl px-4 py-3 text-sm font-bold'
                  style={{ background: 'var(--ica-gold-soft)', color: 'var(--ica-gold-ink)' }}
                >
                  {isIOSDevice()
                    ? t('Aquí no funciona el reconocimiento de voz. Abre icademy.app en Safari.')
                    : t('Tu navegador no tiene reconocimiento de voz. Abre la app en Google Chrome.')}
                </p>
              ) : (
                <p className='m-0 mt-5 text-sm font-semibold text-muted-foreground'>
                  {t('Mejor con auriculares. Te pedirá permiso para usar el micrófono.')}
                </p>
              )}

              <Button
                type='button'
                size='xl'
                variant='a'
                className='mt-5 w-full'
                disabled={!isSpeechRecognitionSupported()}
                onClick={() => void start()}
              >
                {t('Empezar desafío')}
              </Button>
            </div>
          )}

          {(phase === 'running' || phase === 'paused') && current && (
            <ChallengeTurnView
              round={current}
              index={index}
              total={rounds.length}
              score={score}
              step={step}
              paused={phase === 'paused'}
              interim={interim}
              feedback={feedback}
              targetLang={targetLang}
              onPause={pause}
              onResume={resume}
              onSkip={skip}
            />
          )}

          {phase === 'finished' && (
            <ChallengeResultView
              score={score}
              total={rounds.length}
              failed={failedRounds}
              onRepeat={() => void start()}
              onClose={close}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------- piezas (solo presentación)

/** Resultado de un trozo (lo que se enseña tras contestar). */
export type ChallengeFeedback = Feedback

type ChallengeRound = { target: string; native: string }

/** Círculo grande del turno: altavoz (escucha), micrófono (tu turno) o pausa. */
function StatusCircle({
  kind,
  live = false,
  className,
}: {
  kind: 'prompt' | 'listening' | 'paused'
  live?: boolean
  className?: string
}) {
  const colors = kind === 'listening' ? tone('a') : kind === 'prompt' ? tone('i') : tone('neutral')
  const size = 112
  return (
    <span
      className={cn('relative flex items-center justify-center rounded-full', className)}
      style={{
        width: size,
        height: size,
        background: kind === 'paused' ? 'var(--muted)' : colors.solid,
        color: kind === 'paused' ? 'var(--muted-foreground)' : '#fff',
        boxShadow: `0 7px 0 ${kind === 'paused' ? 'var(--border)' : colors.edge}`,
      }}
      aria-hidden='true'
    >
      {live ? (
        <span
          className='absolute -inset-3 animate-pulse rounded-full border-[7px]'
          style={{ borderColor: `color-mix(in oklab, ${colors.solid} 28%, transparent)` }}
        />
      ) : null}
      {kind === 'listening' ? (
        <MicIcon className='size-12' strokeWidth={2.4} />
      ) : kind === 'prompt' ? (
        <Volume2Icon className='size-12' strokeWidth={2.4} />
      ) : (
        <PauseIcon className='size-11 fill-current' strokeWidth={2.4} />
      )}
    </span>
  )
}

function IntroStat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className='ica-panel flex flex-col items-center px-2 py-3'>
      <span className='text-3xl leading-none font-black tabular-nums' style={{ color: tone('a').ink }}>
        {value}
      </span>
      <span className='mt-1 text-xs font-extrabold text-muted-foreground'>{label}</span>
    </div>
  )
}

function IntroStep({ icon, toneName, text }: { icon: ReactNode; toneName: 'i' | 'a' | 'ok'; text: string }) {
  return (
    <li className='flex items-center gap-3 py-3'>
      <IconTile tone={toneName} size={44}>
        {icon}
      </IconTile>
      <span className='text-sm leading-snug font-bold'>{text}</span>
    </li>
  )
}

/** Un turno del desafío: progreso, el trozo que oyes, tu turno o la corrección, y los controles. */
export function ChallengeTurnView({
  round,
  index,
  total,
  score,
  step,
  paused,
  interim,
  feedback,
  targetLang,
  onPause,
  onResume,
  onSkip,
}: {
  round: ChallengeRound
  index: number
  total: number
  score: number
  step: Step
  paused: boolean
  interim: string
  feedback: ChallengeFeedback | null
  targetLang: string
  onPause: () => void
  onResume: () => void
  onSkip: () => void
}) {
  const verdict = feedback
    ? feedback.correct
      ? { tone: tone('ok'), label: `✓ ${t('Correcto')}` }
      : feedback.almost
        ? { tone: tone('gold'), label: t('Casi') }
        : { tone: tone('bad'), label: t('Incorrecto') }
    : null

  return (
    <div className='flex flex-col gap-6'>
      {/* Progreso */}
      <div>
        <div className='mb-2 flex items-center justify-between gap-3'>
          <p className='m-0 text-sm font-extrabold text-muted-foreground tabular-nums'>
            {t('Trozo {n} de {total}', { n: Math.min(index + 1, total), total })}
          </p>
          <Pill tone='ok' className='text-sm'>
            ✓ {score}
          </Pill>
        </div>
        <GameProgress
          value={total > 0 ? index / total : 0}
          color='var(--ica-a)'
          height={16}
          label={t('Progreso del desafío')}
        />
      </div>

      {/* Lo que oyes, en tu idioma */}
      <div className='ica-panel px-5 py-4'>
        <p className='ica-label m-0 mb-1'>{t('Oye')}</p>
        <p className='m-0 font-display text-2xl leading-snug font-extrabold tracking-tight'>{round.native}</p>
      </div>

      {step !== 'feedback' || !feedback || !verdict ? (
        <div className='flex flex-col items-center gap-4 py-2 text-center'>
          <StatusCircle
            kind={paused ? 'paused' : step === 'listening' ? 'listening' : 'prompt'}
            live={!paused && step === 'listening'}
          />
          <p
            className='m-0 text-xl font-black tracking-tight'
            style={{ color: paused ? undefined : step === 'listening' ? tone('a').ink : tone('i').ink }}
          >
            {paused ? t('En pausa') : step === 'listening' ? t('Tu turno: dilo en {lang}', { lang: langInSentence(targetLang) }) : t('Escucha…')}
          </p>
          {interim && step === 'listening' && (
            <p className='m-0 text-base font-semibold text-muted-foreground italic'>{interim}</p>
          )}
        </div>
      ) : (
        <div
          className='rounded-3xl border-2 px-5 py-4'
          style={{
            background: verdict.tone.soft,
            borderColor: `color-mix(in oklab, ${verdict.tone.solid} 40%, transparent)`,
            boxShadow: `0 4px 0 color-mix(in oklab, ${verdict.tone.solid} 30%, transparent)`,
          }}
        >
          <span
            className='inline-flex rounded-full px-3 py-1 text-sm font-black text-white'
            style={{ background: verdict.tone.solid }}
          >
            {verdict.label}
          </span>
          <p className='m-0 mt-3 text-xs font-extrabold tracking-[0.08em] uppercase' style={{ color: verdict.tone.ink }}>
            {feedback.correct ? t('Has dicho') : t('Correcto sería')}
          </p>
          <p className='m-0 mt-1 font-display text-2xl leading-snug font-black tracking-tight'>
            {feedback.marks.map((mark, position) => (
              <span
                key={`${position}-${mark.word}`}
                className={cn(!mark.ok && 'underline decoration-[3px] underline-offset-4')}
                style={!mark.ok ? { color: 'var(--ica-bad-ink)', textDecorationColor: 'var(--ica-bad-strong)' } : undefined}
              >
                {mark.word}{' '}
              </span>
            ))}
          </p>
          {!feedback.correct && (
            <p className='m-0 mt-2 text-sm font-semibold text-muted-foreground'>
              {feedback.note || t('Has dicho: «{heard}»', { heard: feedback.heard })}
            </p>
          )}
        </div>
      )}

      <div className='flex flex-wrap justify-center gap-3'>
        {!paused ? (
          <Button type='button' size='lg' variant='outline' onClick={onPause}>
            <PauseIcon className='size-4 fill-current' strokeWidth={2.4} />
            {t('Pausa')}
          </Button>
        ) : (
          <Button type='button' size='lg' variant='a' onClick={onResume}>
            <PlayIcon className='size-4 fill-current' strokeWidth={2.4} />
            {t('Seguir')}
          </Button>
        )}
        <Button type='button' size='lg' variant='outline' onClick={onSkip}>
          <SkipForwardIcon className='size-4' strokeWidth={2.6} />
          {t('Saltar trozo')}
        </Button>
      </div>
    </div>
  )
}

/** Pantalla final: aciertos en grande y los trozos para repasar. */
export function ChallengeResultView({
  score,
  total,
  failed,
  onRepeat,
  onClose,
}: {
  score: number
  total: number
  failed: Array<{ round: ChallengeRound; position: number }>
  onRepeat: () => void
  onClose: () => void
}) {
  const level = resultLevel(score, total)
  const perfect = level === 'perfect'
  const good = level === 'good'
  const ink = perfect || good ? tone('ok').ink : tone('a').ink

  return (
    <div className='flex flex-col items-center text-center'>
      <span className='mb-4'>{perfect ? <TrophyIcon size={88} /> : <TargetGlyph size={84} />}</span>
      <p className='ica-label m-0'>{t('Resultado')}</p>
      <p className='m-0 mt-1 text-7xl leading-none font-black tracking-tight tabular-nums' style={{ color: ink }}>
        {score}
        <span className='ml-2 text-3xl font-extrabold text-muted-foreground'>{t('de {total}', { total })}</span>
      </p>
      <GameProgress
        className='mt-5 max-w-72'
        value={total > 0 ? score / total : 0}
        color={perfect || good ? 'var(--ica-ok)' : 'var(--ica-a)'}
        height={16}
      />
      <p className='m-0 mt-4 max-w-md text-base font-bold text-muted-foreground'>
        {perfect
          ? t('¡Enhorabuena por el trabajo! Te sabes tu nota maestra de memoria.')
          : good
            ? t('¡Sigue así, vas muy bien! Repasa los trozos que han fallado.')
            : level === 'some'
              ? t('Seguro que la próxima vez sale mejor. Escucha otra vez tu nota maestra y vuelve a intentarlo.')
              : t('No pasa nada: cada intento cuenta. Escucha otra vez tu nota maestra y vuelve a por ella.')}
      </p>

      {failed.length > 0 && (
        <div className='mt-6 w-full text-left'>
          <p className='ica-label m-0 mb-2'>{t('Para repasar')}</p>
          <ul className='ica-group m-0 list-none divide-y-2 divide-border'>
            {failed.map(({ round, position }) => (
              <li key={position} className='py-3'>
                <span className='block leading-snug font-extrabold'>{round.target}</span>
                <span className='mt-0.5 block text-sm font-semibold text-muted-foreground'>{round.native}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className='mt-6 flex w-full max-w-sm flex-col gap-3'>
        <Button type='button' size='xl' variant='a' className='w-full' onClick={onRepeat}>
          <RotateCcwIcon className='size-5' strokeWidth={2.6} />
          {t('Repetir desafío')}
        </Button>
        <Button type='button' size='lg' variant='outline' className='w-full' onClick={onClose}>
          {t('Volver a la nota')}
        </Button>
      </div>
    </div>
  )
}

function ExcludedList({ excluded }: { excluded: PreparedChallenge['excluded'] }) {
  return (
    <ul
      className='m-0 mt-3 mb-6 w-full max-w-md list-none space-y-2 rounded-2xl p-4 text-left text-sm'
      style={{ background: 'var(--ica-gold-soft)' }}
    >
      {excluded.map((item) => (
        <li key={item.phraseIndex}>
          <span className='font-extrabold'>
            #{item.phraseIndex + 1} {item.target}
          </span>
          <br />
          <span className='font-semibold' style={{ color: 'var(--ica-gold-ink)' }}>
            {t(item.reason)}
          </span>
        </li>
      ))}
    </ul>
  )
}

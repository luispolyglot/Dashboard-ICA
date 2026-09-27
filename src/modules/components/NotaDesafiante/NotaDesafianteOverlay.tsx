/**
 * NOTA DESAFIANTE — pantalla del juego (prototipo de la fase 2)
 *
 * 1. Suena un trozo de la frase en el idioma materno.
 * 2. Pitido: turno del alumno. Lo dice de memoria en el idioma que aprende.
 * 3. Se corta tras 4 s de silencio (máx. 30 s) y se compara.
 * 4. Si falla alguna palabra, suena la versión correcta. Al final: «18 de 25».
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  prepareNoteChallenge,
  type ChallengePhraseInput,
  type PreparedChallenge,
} from '../../services/challengeChunks'
import {
  checkAnswer,
  isSpeechRecognitionSupported,
  listenOnce,
  playBeep,
  playFailTone,
  playSuccessChime,
  speakAsync,
  stopSpeaking,
  wait,
  type WordMark,
} from './challengeEngine'

type Props = {
  open: boolean
  noteName: string
  phrases: ChallengePhraseInput[]
  targetLang: string
  nativeLang: string
  onClose: () => void
}

type Phase = 'preparing' | 'error' | 'intro' | 'running' | 'paused' | 'finished'
type Step = 'prompt' | 'listening' | 'feedback'

// Con al menos estas palabras bien (sin acertar el trozo entero) se dice «Casi».
const ALMOST_MIN_WORDS = 2

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
  useEffect(() => {
    if (!open) return
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
          setErrorMessage('Ninguna frase de esta nota puede entrar en el desafío.')
          setPhase('error')
          return
        }
        setPhase('intro')
      })
      .catch((error) => {
        if (!active) return
        setErrorMessage(
          error instanceof Error ? error.message : 'No se pudo preparar el desafío.',
        )
        setPhase('error')
      })

    return () => {
      active = false
    }
  }, [open, phrases, targetLang, nativeLang])

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
        await wait(300)
        if (!cancelled()) await speakAsync(`Has acertado ${correct} de ${total}.`, nativeLang)
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
            note: 'No has respondido.',
          }
          break
        }

        if (outcome.status === 'unclear') {
          // Ruido: intento extra que no penaliza.
          if (!usedFreeRetry) {
            usedFreeRetry = true
            await speakAsync('No te he entendido.', nativeLang)
            if (cancelled()) return
            continue
          }
          outcomeFeedback = {
            correct: false,
            marks: round.target.split(/\s+/).map((word) => ({ word, ok: false })),
            heard: '',
            note: 'No se ha entendido la respuesta.',
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
          await speakAsync('Casi.', nativeLang)
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
    stopEverything()
    resultsRef.current = []
    setResults([])
    setFeedback(null)
    setIndex(0)
    setPhase('running')
    await requestWakeLock()
    const runId = runIdRef.current
    void runTurn(0, runId)
  }

  const pause = () => {
    stopEverything()
    setPhase('paused')
  }

  const resume = () => {
    stopEverything()
    setPhase('running')
    const runId = runIdRef.current
    // Si el trozo actual ya tenía resultado, se sigue por el siguiente.
    const next = resultsRef.current[index] != null ? index + 1 : index
    void runTurn(next, runId)
  }

  const skip = () => {
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
  return (
    <div className='fixed inset-0 z-100 flex flex-col bg-[#0A1128] text-slate-100'>
      <div className='flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-3'>
        <div className='min-w-0'>
          <p className='text-[11px] font-semibold tracking-[0.12em] text-sky-300 uppercase'>
            🎯 Nota desafiante
          </p>
          <p className='truncate font-serif text-lg font-bold'>{noteName}</p>
        </div>
        <Button
          type='button'
          variant='ghost'
          className='text-slate-300 hover:text-white'
          onClick={close}
        >
          ✕ Salir
        </Button>
      </div>

      {/* m-auto centra cuando cabe, y cuando no cabe deja hacer scroll sin cortar la parte de arriba */}
      <div className='flex min-h-0 flex-1 overflow-y-auto px-5 py-8'>
        <div className='m-auto w-full max-w-xl'>
          {phase === 'preparing' && (
            <div className='text-center'>
              <p className='mb-3 font-serif text-2xl font-bold'>Preparando tu desafío…</p>
              <p className='mb-5 text-sm text-slate-400'>
                {progress.total > 0
                  ? `Dividiendo frases en trozos: ${progress.done} de ${progress.total}`
                  : 'Leyendo las frases de la nota'}
              </p>
              <div className='mx-auto h-2 w-64 overflow-hidden rounded-full bg-white/10'>
                <div
                  className='h-full rounded-full bg-sky-400 transition-all'
                  style={{
                    width: `${progress.total ? (progress.done / progress.total) * 100 : 15}%`,
                  }}
                />
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className='text-center'>
              <p className='mb-3 font-serif text-2xl font-bold'>No se puede empezar</p>
              <p className='mb-6 text-sm text-slate-300'>{errorMessage}</p>
              {prepared && prepared.excluded.length > 0 && (
                <ExcludedList excluded={prepared.excluded} />
              )}
              <Button type='button' onClick={close}>
                Volver a la nota
              </Button>
            </div>
          )}

          {phase === 'intro' && prepared && (
            <div className='text-center'>
              <p className='mb-2 font-serif text-3xl font-bold'>
                {rounds.length} trozos · {phraseCount}{' '}
                {phraseCount === 1 ? 'frase' : 'frases'}
              </p>
              <p className='mb-6 text-sm text-slate-400'>Unos {Math.max(1, Math.round((rounds.length * 12) / 60))} minutos</p>

              <ol className='mx-auto mb-6 max-w-md space-y-2 text-left text-sm text-slate-300'>
                <li>🔊 Oirás un trozo de tu frase en {nativeLang.toLowerCase()}.</li>
                <li>🔔 Tras el pitido, dilo en voz alta en {targetLang.toLowerCase()}, de memoria.</li>
                <li>✅ Si no falla ninguna palabra, es correcto. Si no, oirás la versión buena.</li>
              </ol>

              {prepared.excluded.length > 0 && (
                <div className='mb-6'>
                  <button
                    type='button'
                    className='text-xs text-amber-300 underline underline-offset-2'
                    onClick={() => setShowExcluded((value) => !value)}
                  >
                    {prepared.excluded.length}{' '}
                    {prepared.excluded.length === 1 ? 'frase queda fuera' : 'frases quedan fuera'} ·
                    ver por qué
                  </button>
                  {showExcluded && <ExcludedList excluded={prepared.excluded} />}
                </div>
              )}

              {!isSpeechRecognitionSupported() ? (
                <p className='mb-4 text-sm text-amber-300'>
                  Tu navegador no tiene reconocimiento de voz. Abre la app en Google Chrome.
                </p>
              ) : (
                <p className='mb-4 text-xs text-slate-500'>
                  Mejor con auriculares. Te pedirá permiso para usar el micrófono.
                </p>
              )}

              <Button
                type='button'
                className='h-12 px-10 text-base font-bold'
                disabled={!isSpeechRecognitionSupported()}
                onClick={() => void start()}
              >
                Empezar desafío
              </Button>
            </div>
          )}

          {(phase === 'running' || phase === 'paused') && current && (
            <div>
              <div className='mb-6 flex items-center justify-between text-xs text-slate-400'>
                <span>
                  Trozo {Math.min(index + 1, rounds.length)} de {rounds.length}
                </span>
                <span className='font-semibold text-emerald-300'>✓ {score}</span>
              </div>
              <div className='mb-8 h-1.5 overflow-hidden rounded-full bg-white/10'>
                <div
                  className='h-full rounded-full bg-sky-400 transition-all'
                  style={{ width: `${(index / rounds.length) * 100}%` }}
                />
              </div>

              <p className='mb-1 text-xs tracking-wider text-slate-400 uppercase'>Oye</p>
              <p className='mb-8 text-xl leading-snug text-slate-100'>{current.native}</p>

              {step !== 'feedback' ? (
                <div className='flex flex-col items-center gap-3 py-4'>
                  <div
                    className={cn(
                      'flex h-20 w-20 items-center justify-center rounded-full border-2 text-3xl transition-all',
                      step === 'listening' && phase === 'running'
                        ? 'animate-pulse border-sky-400 bg-sky-400/15 shadow-[0_0_40px_rgba(56,189,248,0.45)]'
                        : 'border-white/15 bg-white/5',
                    )}
                    aria-hidden='true'
                  >
                    {step === 'listening' ? '🎙️' : '🔊'}
                  </div>
                  <p className='text-sm text-slate-300'>
                    {phase === 'paused'
                      ? 'En pausa'
                      : step === 'listening'
                        ? `Tu turno: dilo en ${targetLang.toLowerCase()}`
                        : 'Escucha…'}
                  </p>
                  {interim && step === 'listening' && (
                    <p className='text-center text-sm text-slate-500 italic'>{interim}</p>
                  )}
                </div>
              ) : (
                feedback && (
                  <div className='py-2'>
                    <span
                      className={cn(
                        'mb-4 inline-block rounded-full border-[1.5px] px-3 py-0.5 text-sm font-bold',
                        feedback.correct
                          ? 'border-emerald-400 text-emerald-300'
                          : feedback.almost
                            ? 'border-amber-400 text-amber-300'
                            : 'border-rose-400 text-rose-300',
                      )}
                    >
                      {feedback.correct ? '✓ Correcto' : feedback.almost ? 'Casi' : 'Incorrecto'}
                    </span>
                    <p className='mb-1 text-xs tracking-wider text-slate-400 uppercase'>
                      {feedback.correct ? 'Has dicho' : 'Correcto sería'}
                    </p>
                    <p className='mb-3 font-serif text-2xl leading-snug font-bold'>
                      {feedback.marks.map((mark, position) => (
                        <span
                          key={`${position}-${mark.word}`}
                          className={cn(!mark.ok && 'text-rose-300 underline decoration-rose-400/70 underline-offset-4')}
                        >
                          {mark.word}{' '}
                        </span>
                      ))}
                    </p>
                    {!feedback.correct && (
                      <p className='text-sm text-slate-400'>
                        {feedback.note || `Has dicho: «${feedback.heard}»`}
                      </p>
                    )}
                  </div>
                )
              )}

              <div className='mt-8 flex flex-wrap justify-center gap-2'>
                {phase === 'running' ? (
                  <Button type='button' variant='outline' className='border-white/20 bg-transparent text-slate-200' onClick={pause}>
                    ⏸ Pausa
                  </Button>
                ) : (
                  <Button type='button' onClick={resume}>
                    ▶ Seguir
                  </Button>
                )}
                <Button type='button' variant='outline' className='border-white/20 bg-transparent text-slate-200' onClick={skip}>
                  Saltar trozo
                </Button>
              </div>
            </div>
          )}

          {phase === 'finished' && (
            <div className='text-center'>
              <p className='mb-1 text-xs tracking-wider text-slate-400 uppercase'>Resultado</p>
              <p className='mb-2 font-serif text-6xl font-bold'>
                {score} <span className='text-3xl text-slate-400'>de {rounds.length}</span>
              </p>
              <p className='mb-8 text-sm text-slate-300'>
                {score === rounds.length
                  ? '¡Perfecto! Te sabes tu nota maestra de memoria.'
                  : score >= rounds.length * 0.7
                    ? 'Muy bien. Repasa los trozos que han fallado.'
                    : 'Escucha otra vez tu nota maestra y vuelve a intentarlo.'}
              </p>

              {failedRounds.length > 0 && (
                <div className='mx-auto mb-8 max-w-md rounded-xl border border-white/10 bg-white/5 p-4 text-left'>
                  <p className='mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase'>
                    Para repasar
                  </p>
                  <ul className='space-y-2 text-sm'>
                    {failedRounds.map(({ round, position }) => (
                      <li key={position}>
                        <span className='font-semibold'>{round.target}</span>
                        <span className='text-slate-400'> — {round.native}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className='flex flex-wrap justify-center gap-2'>
                <Button type='button' onClick={() => void start()}>
                  Repetir desafío
                </Button>
                <Button type='button' variant='outline' className='border-white/20 bg-transparent text-slate-200' onClick={close}>
                  Volver a la nota
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ExcludedList({ excluded }: { excluded: PreparedChallenge['excluded'] }) {
  return (
    <ul className='mx-auto mt-3 mb-6 max-w-md space-y-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-left text-xs text-slate-300'>
      {excluded.map((item) => (
        <li key={item.phraseIndex}>
          <span className='font-semibold text-slate-100'>
            #{item.phraseIndex + 1} {item.target}
          </span>
          <br />
          <span className='text-amber-200/90'>{item.reason}</span>
        </li>
      ))}
    </ul>
  )
}

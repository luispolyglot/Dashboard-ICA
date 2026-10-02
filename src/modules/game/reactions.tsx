import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

// EXPRESIONES AL TERMINAR UN DESAFÍO: 6 caritas dibujadas con el estilo ICA y 4 frases
// cortas. Nada de emojis del móvil ni texto libre.
// Vista previa: se guardan en este dispositivo. En el modo de prueba, el rival de
// prueba contesta. Para que lleguen a rivales reales, el servidor tiene que guardarlas
// y avisar (ver MODO_JUEGO_NOTAS.md).

export type ReactionFace = 'feliz' | 'risa' | 'guino' | 'sorpresa' | 'gafas' | 'lagrima'
// 'que-nivel', 'por-poco' y 'buena-partida' ya no se pueden mandar; se siguen leyendo
// por si quedaban guardadas de antes.
export type ReactionPhrase = 'bien-jugado' | 'revancha' | 'vamos' | 'gracias' | 'que-nivel' | 'por-poco' | 'buena-partida'
export type Reaction = { kind: 'face'; value: ReactionFace } | { kind: 'phrase'; value: ReactionPhrase }

export const REACTION_FACES: Array<{ value: ReactionFace; label: string }> = [
  { value: 'feliz', label: 'Contento' },
  { value: 'risa', label: 'Risa' },
  { value: 'guino', label: 'Guiño' },
  { value: 'sorpresa', label: 'Sorpresa' },
  { value: 'gafas', label: 'Chulo' },
  { value: 'lagrima', label: 'Lagrimita' },
]

export const REACTION_PHRASES: Array<{ value: ReactionPhrase; text: string }> = [
  { value: 'bien-jugado', text: '¡Bien jugado!' },
  { value: 'revancha', text: '¿Revancha?' },
  { value: 'vamos', text: '¡Vamos!' },
  { value: 'gracias', text: '¡Gracias!' },
]

// Textos de frases antiguas (solo para enseñar las que ya estaban guardadas).
const OLD_PHRASES: Partial<Record<ReactionPhrase, string>> = {
  'que-nivel': '¡Qué nivel!',
  'por-poco': '¡Uf, por poco!',
  'buena-partida': '¡Buena partida!',
}

/** Máximo de expresiones que puedes mandar en cada desafío (sin spam). */
/** Como mucho 2 seguidas: para mandar más, el rival tiene que contestar. */
export const MAX_REACTIONS_IN_A_ROW = 2
const MAX_BOT_REPLIES = 3

const INK = '#3a2a00'
const MOUTH = '#8a1c2b'

/** Una carita dibujada (40 × 40). */
export function ReactionFaceIcon({ face, size = 40 }: { face: ReactionFace; size?: number }) {
  const eyes = (
    <>
      <ellipse cx='14' cy='17' rx='2.1' ry='2.8' fill={INK} />
      <ellipse cx='26' cy='17' rx='2.1' ry='2.8' fill={INK} />
    </>
  )
const cheeks = (
    <>
      <circle cx='10.5' cy='24' r='2.6' fill='#ff8a8a' opacity='0.55' />
      <circle cx='29.5' cy='24' r='2.6' fill='#ff8a8a' opacity='0.55' />
    </>
  )
  let features
  switch (face) {
    case 'risa':
      features = (
        <>
          <path d='M10.5 18.5q3.5-4.5 7 0M22.5 18.5q3.5-4.5 7 0' stroke={INK} strokeWidth='2.4' strokeLinecap='round' fill='none' />
          <path d='M11 23h18q0 9-9 9t-9-9z' fill={MOUTH} />
          <path d='M15 29.2q5-3 10 0q-2 2.8-5 2.8t-5-2.8z' fill='#ff7a8c' />
          <path d='M11.5 23.2h17' stroke='#ffffff' strokeWidth='1.6' />
        </>
      )
break
case 'guino': features = (
        <>
          <ellipse cx='14' cy='17' rx='2.1' ry='2.8' fill={INK} />
          <path d='M22.5 17.5q3.5 2.5 7 0' stroke={INK} strokeWidth='2.4' strokeLinecap='round' fill='none' />
          <path d='M12.5 24.5q7.5 7 15 0' stroke={INK} strokeWidth='2.4' strokeLinecap='round' fill='none' />
          {cheeks}
        </>
      )
break
case 'sorpresa': features = (
        <>
          <path d='M10.5 11.5q3.5-2.5 7-0.5M22.5 11q3.5-2 7 0.5' stroke={INK} strokeWidth='1.8' strokeLinecap='round' fill='none' />
          <circle cx='14' cy='17.5' r='2.6' fill={INK} />
          <circle cx='26' cy='17.5' r='2.6' fill={INK} />
          <ellipse cx='20' cy='27.5' rx='3.6' ry='4.4' fill={MOUTH} />
        </>
      )
break
case 'gafas': features = (
        <>
          <rect x='7.5' y='13.5' width='11' height='7.5' rx='3' fill='#1e2a3a' />
          <rect x='21.5' y='13.5' width='11' height='7.5' rx='3' fill='#1e2a3a' />
          <path d='M18.5 16h3' stroke='#1e2a3a' strokeWidth='2' />
          <path d='M9.5 15.5l3.5 0' stroke='#ffffff' strokeWidth='1.2' strokeLinecap='round' opacity='0.7' />
          <path d='M14 26.5q6 3.5 12-1.5' stroke={INK} strokeWidth='2.4' strokeLinecap='round' fill='none' />
        </>
      )
break
case 'lagrima': features = (
        <>
          <path d='M10.5 14.5l5-2.2M29.5 14.5l-5-2.2' stroke={INK} strokeWidth='1.8' strokeLinecap='round' />
          <ellipse cx='14' cy='18.5' rx='2' ry='2.4' fill={INK} />
          <ellipse cx='26' cy='18.5' rx='2' ry='2.4' fill={INK} />
          <path d='M13.5 29q6.5-5.5 13 0' stroke={INK} strokeWidth='2.4' strokeLinecap='round' fill='none' />
          <path d='M28.5 21.5q2.6 3.6 2.6 5.2a2.6 2.6 0 0 1-5.2 0q0-1.6 2.6-5.2z' fill='#5db8ff' />
        </>
      )
break
default: features = (
        <>
          {eyes}
          <path d='M12 23.5q8 8 16 0' stroke={INK} strokeWidth='2.4' strokeLinecap='round' fill='none' />
          {cheeks}
        </>
      )
  }
  return (
    <svg viewBox='0 0 40 40' width={size} height={size} aria-hidden='true' style={{ flexShrink: 0 }}>
      <circle cx='20' cy='21.5' r='17' fill='#E0A500' />
      <circle cx='20' cy='20' r='17' fill='#FFC72C' />
      <ellipse cx='14' cy='9.5' rx='5' ry='2.4' fill='#ffffff' opacity='0.35' />
      {features}
    </svg>
  )
}

export function reactionPhraseText(value: ReactionPhrase): string {
  return REACTION_PHRASES.find((item) => item.value === value)?.text ?? OLD_PHRASES[value] ?? ''
}

/** La expresión dentro de un bocadillo. */
export function ReactionBubble({ reaction, from, mine }: { reaction: Reaction; from: string; mine: boolean }) {
  return (
    <div className={cn('flex items-end gap-2', mine ? 'flex-row-reverse' : '')}>
      <div
        className={cn(
          'ica-pop flex items-center gap-2 rounded-3xl border-2 px-3 py-2',
          mine ? 'rounded-br-md border-primary/40 bg-primary/10' : 'rounded-bl-md border-border bg-card',
        )}
      >
        {reaction.kind === 'face' ? (
          <ReactionFaceIcon face={reaction.value} size={40} />
        ) : (
          <span className='text-base font-extrabold'>{t(reactionPhraseText(reaction.value))}</span>
        )}
      </div>
      <span className='pb-1 text-[11px] font-bold text-muted-foreground'>{from}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Guardado (vista previa en este dispositivo)
// ---------------------------------------------------------------------------

type StoredReaction = Reaction & { from: 'me' | 'rival'; at: number }

const STORAGE_KEY = 'ica-challenge-reactions-v1'
export const REACTIONS_CHANGED_EVENT = 'ica:challenge-reactions-changed'

function readAll(): Record<string, StoredReaction[]> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, StoredReaction[]>) : {}
  } catch {
    return {}
  }
}

function writeAll(all: Record<string, StoredReaction[]>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // Sin almacenamiento: dura esta sesión.
  }
  window.dispatchEvent(new Event(REACTIONS_CHANGED_EVENT))
}

export function readChallengeReactions(challengeId: string): StoredReaction[] {
  return readAll()[challengeId] ?? []
}

function pushReaction(challengeId: string, reaction: StoredReaction): void {
  const all = readAll()
  all[challengeId] = [...(all[challengeId] ?? []), reaction]
  writeAll(all)
}

const BOT_REPLIES: Reaction[] = [
  { kind: 'phrase', value: 'revancha' },
  { kind: 'phrase', value: 'bien-jugado' },
  { kind: 'face', value: 'risa' },
  { kind: 'face', value: 'guino' },
  { kind: 'phrase', value: 'vamos' },
  { kind: 'face', value: 'gafas' },
]

// Respuestas del rival de prueba ya en camino (para que no conteste dos veces a lo mismo).
const botReplyScheduled = new Set<string>()

/** Cuántas expresiones seguidas llevas tú al final de la conversación. */
function myStreakAtEnd(items: StoredReaction[]): number {
  let count = 0
  for (let index = items.length - 1; index >= 0 && items[index].from === 'me'; index -= 1) count += 1
  return count
}

/** Hook: las expresiones de un desafío y cómo mandar una. */
export function useChallengeReactions(challengeId: string, options: { rivalIsTestBot: boolean }) {
  const [items, setItems] = useState<StoredReaction[]>(() => readChallengeReactions(challengeId))

  useEffect(() => {
    const refresh = () => setItems(readChallengeReactions(challengeId))
    refresh()
    window.addEventListener(REACTIONS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(REACTIONS_CHANGED_EVENT, refresh)
  }, [challengeId])

  const left = Math.max(0, MAX_REACTIONS_IN_A_ROW - myStreakAtEnd(items))

  const send = useCallback(
    (reaction: Reaction) => {
      const current = readChallengeReactions(challengeId)
      if (myStreakAtEnd(current) >= MAX_REACTIONS_IN_A_ROW) return false
      pushReaction(challengeId, { ...reaction, from: 'me', at: Date.now() })
      // El rival de prueba contesta cuando llegas a 2 seguidas (unas pocas veces como mucho).
      const after = readChallengeReactions(challengeId)
      const botReplies = after.filter((item) => item.from === 'rival').length
      const key = `${challengeId}:${after.length}`
      if (
        options.rivalIsTestBot &&
        myStreakAtEnd(after) >= MAX_REACTIONS_IN_A_ROW &&
        botReplies < MAX_BOT_REPLIES &&
        !botReplyScheduled.has(key)
      ) {
        botReplyScheduled.add(key)
        window.setTimeout(() => {
          const reply = BOT_REPLIES[Math.floor(Math.random() * BOT_REPLIES.length)]
          pushReaction(challengeId, { ...reply, from: 'rival', at: Date.now() })
        }, 1400)
      }
      return true
    },
    [challengeId, options.rivalIsTestBot],
  )

  return { items, send, left, canSend: left > 0 }
}

/** Panel de expresiones de la pantalla de resultado. */
export function ReactionPanel({
  challengeId,
  rivalName,
  rivalIsTestBot,
}: {
  challengeId: string
  rivalName: string
  rivalIsTestBot: boolean
}) {
  const { items, send, canSend, left } = useChallengeReactions(challengeId, { rivalIsTestBot })

  return (
    <div className='mb-4 rounded-3xl border-2 border-border p-4'>
      <p className='m-0 text-sm font-extrabold'>{t('Manda algo a {name}', { name: rivalName })}</p>
      <p className='m-0 mb-3 text-xs font-semibold text-muted-foreground'>
        {canSend
          ? t('Una carita o una frase (puedes mandar {n} seguidas).', { n: left })
          : t('Espera a que {name} conteste para mandar más.', { name: rivalName })}
      </p>

      {items.length > 0 ? (
        <div className='mb-3 flex flex-col gap-2'>
          {items.map((item, index) => (
            <ReactionBubble
              key={`${item.at}-${index}`}
              reaction={item}
              from={item.from === 'me' ? t('Tú') : rivalName}
              mine={item.from === 'me'}
            />
          ))}
        </div>
      ) : null}

      <div className='grid grid-cols-6 gap-1.5'>
        {REACTION_FACES.map((face) => (
          <button
            key={face.value}
            type='button'
            disabled={!canSend}
            onClick={() => send({ kind: 'face', value: face.value })}
            className='flex aspect-square items-center justify-center rounded-2xl border-2 border-border transition-transform active:scale-90 disabled:opacity-40'
            aria-label={t('Mandar carita: {label}', { label: t(face.label) })}
          >
            <ReactionFaceIcon face={face.value} size={34} />
          </button>
        ))}
      </div>
      <div className='mt-2 grid grid-cols-2 gap-1.5'>
        {REACTION_PHRASES.map((phrase) => (
          <button
            key={phrase.value}
            type='button'
            disabled={!canSend}
            onClick={() => send({ kind: 'phrase', value: phrase.value })}
            className='h-10 rounded-2xl border-2 border-border px-2 text-sm font-extrabold transition-transform active:scale-95 disabled:opacity-40'
          >
            {t(phrase.text)}
          </button>
        ))}
      </div>
    </div>
  )
}

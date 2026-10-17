import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { toast } from 'sonner'
import { CheckIcon, ChevronDownIcon, PencilIcon, PlusIcon, RotateCcwIcon, XIcon } from 'lucide-react'
import { SpeakButton } from '../SpeakButton'
import { useDashboardContext } from '../../context/DashboardContext'
import { useDailyLimits } from '../../game/limits'
import { insertWord } from '../../services/storage'
import { recordWordAddedEvent } from '../../services/gamification'
import type { CoachingV2Focus, CoachingWeeklyReportData } from '../../services/coaching'
import type { Lexicard } from '../../types'
import { generateId } from '../../utils'
import {
  BoltIcon,
  BulbGlyph,
  PadlockGlyph,
  ReportGlyph,
  SealGlyph,
  SpeechGlyph,
  StarGlyph,
  TargetGlyph,
  TrunkIcon,
  TRUNK_WOOD,
} from '../../game/icons'
import { GameProgress, IconTile, type Tone } from '../../game/ui'
import { t, tn } from '@/i18n'
import { FocusStairs } from './FocusStairs'
import { focusWeek, type FocusBaseline } from './weeklyReportFocus'

export { focusBaselineFromSnapshot, type FocusBaseline } from './weeklyReportFocus'

/* ══════════════════════════════════════════════════════════════════════
   Reporte semanal del coaching (Luis, 15–16 Oct). Lo escribe la IA con las
   transcripciones de las dos clases y se publica solo. Como un juego:
   - Antes de las 6 tareas: «tu reporte» con candado y lo que hay dentro
     (sin números: a principio de semana aún no está hecho).
   - Con las 6: una ficha «reporte conseguido» (17 Oct): arriba el resumen
     (cada casilla abre su parte) y debajo cada parte cerrada en una fila;
     solo una abierta a la vez para que no sea una página larga. Dentro:
     correcciones como cartas que se giran, palabras para el Baúl ICA,
     consejos y focos en escalón.
   El coach lo ve igual, con lápiz y X en cada cosa.
   ══════════════════════════════════════════════════════════════════════ */

function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
}

/** Coach view: every change (edit or remove) is saved and goes live. */
type Editable = {
  onChange: (next: CoachingWeeklyReportData) => void
}

type EditorField = { key: string; label: string; value: string; long?: boolean }

/** Small form to change one item of the report. */
function ItemEditor({
  fields,
  onSave,
  onCancel,
}: {
  fields: EditorField[]
  onSave: (values: Record<string, string>) => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.key, field.value])),
  )
  return (
    <div className='flex w-full flex-col gap-2 rounded-xl border p-2.5' style={{ borderColor: 'var(--v3-cyan)', background: 'var(--v3-card)' }}>
      {fields.map((field) => (
        <label key={field.key} className='flex flex-col gap-1 text-[11px] font-black' style={{ color: 'var(--v3-muted)' }}>
          {field.label}
          <textarea
            value={values[field.key] || ''}
            onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: event.target.value }))}
            rows={field.long ? 3 : 1}
            className='w-full resize-y rounded-lg border px-2.5 py-1.5 text-sm font-semibold'
            style={{ borderColor: 'var(--v3-line)', background: 'var(--v3-card)', color: 'var(--v3-text)' }}
          />
        </label>
      ))}
      <div className='flex gap-2'>
        <button
          type='button'
          onClick={() => onSave(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()])))}
          className='rounded-lg px-3 py-1.5 text-xs font-black'
          style={{ background: 'var(--v3-cyan)', color: '#031522' }}
        >
          {t('Guardar')}
        </button>
        <button type='button' onClick={onCancel} className='rounded-lg border px-3 py-1.5 text-xs font-bold' style={{ borderColor: 'var(--v3-line)' }}>
          {t('Cancelar')}
        </button>
      </div>
    </div>
  )
}

function EditButton({ onClick, onDark = false }: { onClick: () => void; onDark?: boolean }) {
  return (
    <button
      type='button'
      onClick={onClick}
      aria-label={t('Editar')}
      className='inline-flex size-7 shrink-0 items-center justify-center rounded-full border transition hover:opacity-80'
      style={onDark ? { borderColor: 'rgb(255 255 255 / 0.35)', color: '#ffffff' } : { borderColor: 'var(--v3-line)', color: 'var(--v3-muted)' }}
    >
      <PencilIcon className='size-3.5' />
    </button>
  )
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type='button'
      onClick={onClick}
      aria-label={t('Quitar')}
      className='inline-flex size-7 shrink-0 items-center justify-center rounded-full border transition hover:opacity-80'
      style={{ borderColor: 'var(--v3-line)', color: 'var(--v3-muted)' }}
    >
      <XIcon className='size-3.5' />
    </button>
  )
}

/**
 * Student: each word of the report goes to the Baúl ICA with its own button, one by one, like any
 * word of the Baúl (Luis, 16 Oct: no «add all»). Words count for today's limit.
 */
function useVaultWords(targetLang: string) {
  const { config, cards, setCards, handleWordAdded } = useDashboardContext()
  const dailyLimits = useDailyLimits()
  const [adding, setAdding] = useState<string | null>(null)
  const [addedNow, setAddedNow] = useState<Set<string>>(() => new Set())

  const owned = useMemo(() => {
    const set = new Set<string>()
    if (!config) return set
    // The coaching language, which may not be the language selected in the dashboard right now.
    for (const card of cards) {
      if ((card.targetLang || config.targetLang) !== targetLang) continue
      set.add(normalize(card.target))
    }
    return set
  }, [cards, config, targetLang])

  const has = (word: CoachingWeeklyReportData['words'][number]) =>
    owned.has(normalize(word.target)) || addedNow.has(normalize(word.target))

  async function add(word: CoachingWeeklyReportData['words'][number]) {
    if (!config || adding || has(word)) return
    if (dailyLimits.used.words >= dailyLimits.limits.words) {
      toast.error(t('Hoy ya has llegado al límite de palabras. Añádela mañana.'))
      return
    }
    const key = normalize(word.target)
    setAdding(key)
    try {
      const card: Lexicard = {
        id: generateId(),
        target: word.target,
        native: word.native,
        targetLang,
        nativeLang: config.nativeLang,
        examplePhrase: null,
        exampleTranslation: null,
        importance: 'frequent',
        interval: 1,
        easeFactor: 2.5,
        streak: 0,
        activationCount: 0,
        firstActivatedAt: null,
        lastActivatedAt: null,
        lastReviewed: null,
        createdAt: Date.now(),
      }
      await insertWord(card)
      setCards((prev) => [...prev, card])
      setAddedNow((prev) => new Set([...prev, key]))
      void recordWordAddedEvent().catch(() => undefined)
      void handleWordAdded().catch(() => undefined)
      toast.success(t('«{word}» ya está en tu Baúl ICA', { word: word.target }))
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      toast.error(
        /DAILY_LIMIT/i.test(message)
          ? t('Hoy ya has llegado al límite de palabras. Añádela mañana.')
          : message || t('No se pudo añadir la palabra'),
      )
    } finally {
      setAdding(null)
    }
  }

  return { ready: Boolean(config), has, add, adding }
}

function VaultWordButton({ word, vault }: { word: CoachingWeeklyReportData['words'][number]; vault: ReturnType<typeof useVaultWords> }) {
  const inVault = vault.has(word)
  const busy = vault.adding === normalize(word.target)
  if (inVault) {
    return (
      <span
        className='inline-flex size-9 shrink-0 items-center justify-center rounded-full'
        style={{ background: 'var(--ica-ok-soft)', color: 'var(--ica-ok-ink)' }}
        aria-label={t('Ya está en tu Baúl ICA')}
      >
        <CheckIcon className='size-5' strokeWidth={3} />
      </span>
    )
  }
  return (
    <button
      type='button'
      onClick={() => void vault.add(word)}
      disabled={vault.adding !== null}
      aria-label={t('Añadir «{word}» a mi Baúl ICA', { word: word.target })}
      className='ica-press inline-flex size-9 shrink-0 items-center justify-center rounded-full disabled:opacity-60'
      style={{ background: 'var(--ica-gold)', color: '#4a3200', boxShadow: '0 3px 0 var(--ica-gold-edge)' }}
    >
      {busy ? <span className='size-3 animate-spin rounded-full border-2 border-current border-t-transparent' /> : <PlusIcon className='size-5' strokeWidth={3} />}
    </button>
  )
}


/** Ica, the app's guide (public/guia-ica.png), with a speech bubble. */
function IcaSays({ children, dark = false, size = 58 }: { children: ReactNode; dark?: boolean; size?: number }) {
  return (
    <div className='flex items-end gap-2'>
      <img src='/guia-ica.png' alt='' aria-hidden='true' draggable={false} className='ica-bob shrink-0 select-none' style={{ width: size, height: 'auto' }} />
      <div
        className='relative mb-3 min-w-0 flex-1 rounded-2xl border-2 px-4 py-3 text-left'
        style={{
          background: dark ? 'rgb(255 255 255 / 0.1)' : 'var(--card)',
          borderColor: dark ? 'rgb(255 255 255 / 0.25)' : 'var(--border)',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** A correction as a card: what the student said; turned over, how it is said (and listen to it). */
function FlipCard({
  item,
  flipped,
  onFlip,
  targetLang,
}: {
  item: CoachingWeeklyReportData['corrections'][number]
  flipped: boolean
  onFlip: () => void
  targetLang: string
}) {
  const face: CSSProperties = { backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', position: 'absolute', inset: 0 }
  return (
    <div className='relative h-44' style={{ perspective: 1000 }}>
      <div
        className='absolute inset-0 transition-transform duration-500 motion-reduce:transition-none'
        style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'none' }}
      >
        <button
          type='button'
          onClick={onFlip}
          disabled={flipped}
          aria-hidden={flipped}
          tabIndex={flipped ? -1 : 0}
          className='ica-press flex flex-col justify-between rounded-3xl border-2 p-4 text-left'
          style={{
            ...face,
            background: 'var(--ica-bad-soft)',
            borderColor: 'color-mix(in oklab, var(--ica-bad-strong) 40%, transparent)',
            boxShadow: '0 4px 0 color-mix(in oklab, var(--ica-bad-strong) 35%, transparent)',
          }}
          aria-label={t('Dijiste «{said}». Toca para ver cómo se dice', { said: item.said })}
        >
          <span className='text-[11px] font-black tracking-[0.1em] uppercase' style={{ color: 'var(--ica-bad-ink)' }}>
            {t('Dijiste')}
          </span>
          <span className='font-display text-lg leading-snug font-extrabold'>«{item.said}»</span>
          <span className='inline-flex items-center gap-1.5 text-xs font-black' style={{ color: 'var(--ica-bad-ink)' }}>
            <RotateCcwIcon className='size-3.5' /> {t('¿Cómo se dice bien? Toca la carta')}
          </span>
        </button>
        <div
          className='flex flex-col justify-between rounded-3xl border-2 p-4'
          aria-hidden={!flipped}
          style={{
            ...face,
            transform: 'rotateY(180deg)',
            background: 'var(--ica-ok-soft)',
            borderColor: 'color-mix(in oklab, var(--ica-ok) 45%, transparent)',
            boxShadow: '0 4px 0 color-mix(in oklab, var(--ica-ok) 40%, transparent)',
          }}
        >
          <div className='flex items-center justify-between gap-2'>
            <span className='text-[11px] font-black tracking-[0.1em] uppercase' style={{ color: 'var(--ica-ok-ink)' }}>
              {t('Se dice así')}
            </span>
            {flipped ? <SpeakButton text={item.better} langName={targetLang} color='#3B82F6' variant='icon' label={t('Escuchar')} /> : null}
          </div>
          <span className='font-display text-lg leading-snug font-extrabold'>{item.better}</span>
          <span className='text-xs font-semibold text-muted-foreground'>{item.note}</span>
        </div>
      </div>
    </div>
  )
}

const goldPanel: CSSProperties = {
  background: 'var(--ica-gold-soft)',
  borderColor: 'color-mix(in oklab, var(--ica-gold) 45%, transparent)',
  boxShadow: '0 4px 0 color-mix(in oklab, var(--ica-gold) 40%, transparent)',
}

/** The report is one card («ficha»): a frame with an edge, like the locked one. */
const fichaFrame: CSSProperties = {
  background: 'var(--card)',
  borderColor: 'color-mix(in oklab, var(--ica-gold) 55%, transparent)',
  boxShadow: '0 6px 0 color-mix(in oklab, var(--ica-gold) 45%, transparent)',
}

type PartKey = 'wins' | 'corrections' | 'tips' | 'words' | 'focos'
type Part = {
  key: PartKey
  icon: ReactNode
  tone: Tone
  title: string
  /** Number on the index tile, and what it counts. */
  n: string
  label: string
  right?: ReactNode
  body: ReactNode
}

/** The summary at the top of the card: each tile opens its part below. */
function IndexTiles({ parts, onPick }: { parts: Part[]; onPick: (key: PartKey) => void }) {
  return (
    <div
      className='relative -mx-5 mt-4 flex snap-x gap-2 overflow-x-auto px-5 pt-1.5 pb-1 @2xl:mx-0 @2xl:grid @2xl:overflow-visible @2xl:px-0'
      style={{ gridTemplateColumns: `repeat(${parts.length}, minmax(0, 1fr))`, scrollbarWidth: 'none' }}
    >
      {parts.map((part) => (
        <button
          key={part.key}
          type='button'
          onClick={() => onPick(part.key)}
          className='ica-press relative flex min-w-[148px] shrink-0 snap-start items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left @2xl:min-w-0'
          style={{ background: 'rgb(255 255 255 / 0.1)', border: '1px solid rgb(255 255 255 / 0.18)', boxShadow: '0 4px 0 rgb(0 0 0 / 0.25)' }}
        >
          <span className='shrink-0'>{part.icon}</span>
          <span className='min-w-0 leading-tight'>
            <b className='block text-xl' style={{ color: 'var(--ica-gold)' }}>
              {part.n}
            </b>
            <span className='text-xs font-bold opacity-85'>{part.label}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

export function CoachingWeeklyReportView({
  data,
  targetLang,
  focuses,
  baseline,
  periodNumber,
  canAddWords,
  editable,
}: {
  data: CoachingWeeklyReportData
  targetLang: string
  focuses: CoachingV2Focus[]
  /** The focos when the week opened, to tell apart what was won this week. */
  baseline: FocusBaseline
  periodNumber: number
  /** Only the student adds the words to their own Baúl ICA. */
  canAddWords: boolean
  /** Coach view: edit or remove items (it goes live). */
  editable?: Editable
}) {
  const vault = useVaultWords(targetLang)
  const [flipped, setFlipped] = useState<Set<number>>(() => new Set())
  // Coach: which item is open in the editor («wins-0», «headline»...).
  const [editing, setEditing] = useState<string | null>(null)
  // The part that is open (one at a time, so the card stays short).
  const [open, setOpen] = useState<PartKey | null>(null)
  const rowRefs = useRef<Partial<Record<PartKey, HTMLDivElement | null>>>({})
  const weeks = focuses.filter((focus) => !focus.archivedAt).map((focus) => focusWeek(focus, baseline))
  // Mastered this week first: it is the big news.
  weeks.sort((a, b) => Number(b.masteredThisWeek) - Number(a.masteredThisWeek))
  const gainedTotal = weeks.reduce((sum, item) => sum + item.gained, 0)

  const save = (next: CoachingWeeklyReportData) => {
    setEditing(null)
    editable?.onChange(next)
  }
  const removeAt = <K extends 'wins' | 'corrections' | 'suggestions' | 'words'>(section: K, index: number) =>
    save({ ...data, [section]: (data[section] as unknown[]).filter((_, i) => i !== index) } as CoachingWeeklyReportData)
  const replaceAt = <K extends 'wins' | 'corrections' | 'suggestions' | 'words'>(section: K, index: number, value: CoachingWeeklyReportData[K][number]) =>
    save({ ...data, [section]: (data[section] as unknown[]).map((item, i) => (i === index ? value : item)) } as CoachingWeeklyReportData)
  const tools = (key: string, section: 'wins' | 'corrections' | 'suggestions' | 'words', index: number) =>
    editable ? (
      <span className='flex shrink-0 gap-1'>
        <EditButton onClick={() => setEditing(key)} />
        <RemoveButton onClick={() => removeAt(section, index)} />
      </span>
    ) : null

  const parts: Part[] = []

  if (data.wins.length) {
    parts.push({
      key: 'wins',
      icon: <StarGlyph size={30} />,
      tone: 'gold',
      title: t('Lo que hiciste bien'),
      n: String(data.wins.length),
      label: tn(data.wins.length, 'cosa que hiciste bien', 'cosas que hiciste bien'),
      body: (
        <ul className='m-0 flex list-none flex-col gap-2.5 p-0'>
          {data.wins.map((win, index) => (
            <li key={`win-${index}`} className='flex items-start gap-2.5 rounded-2xl p-3 text-[15px] font-bold' style={goldPanel}>
              {editing === `wins-${index}` ? (
                <ItemEditor
                  fields={[{ key: 'text', label: t('Lo que hizo bien'), value: win, long: true }]}
                  onSave={(values) => (values.text ? replaceAt('wins', index, values.text) : removeAt('wins', index))}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <>
                  <StarGlyph size={22} />
                  <span className='min-w-0 flex-1'>{win}</span>
                  {tools(`wins-${index}`, 'wins', index)}
                </>
              )}
            </li>
          ))}
        </ul>
      ),
    })
  }

  if (data.corrections.length) {
    const all = flipped.size === data.corrections.length
    parts.push({
      key: 'corrections',
      icon: <SpeechGlyph size={30} />,
      tone: 'bad',
      title: editable ? tn(data.corrections.length, '{n} corrección', '{n} correcciones') : t('Frases para escuchar'),
      n: String(data.corrections.length),
      label: tn(data.corrections.length, 'frase para escuchar', 'frases para escuchar'),
      right: editable ? null : (
        <span className='text-sm font-black whitespace-nowrap' style={{ color: 'var(--ica-gold-ink)' }}>
          {flipped.size}/{data.corrections.length}
        </span>
      ),
      body: editable ? (
        // Coach: a plain list, to edit or remove each correction.
        <ul className='m-0 flex list-none flex-col gap-2 p-0'>
          {data.corrections.map((item, index) => (
            <li key={`fix-${index}`} className='flex items-center gap-3 rounded-2xl border-2 p-3' style={{ borderColor: 'var(--border)' }}>
              {editing === `fix-${index}` ? (
                <ItemEditor
                  fields={[
                    { key: 'said', label: t('Lo que dijo'), value: item.said },
                    { key: 'better', label: t('Cómo se dice bien'), value: item.better },
                    { key: 'note', label: t('Por qué'), value: item.note, long: true },
                  ]}
                  onSave={(values) => replaceAt('corrections', index, { said: values.said, better: values.better, note: values.note })}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <>
                  <div className='min-w-0 flex-1'>
                    <p className='m-0 text-[13px] font-bold line-through' style={{ color: 'var(--ica-bad-ink)' }}>
                      {item.said}
                    </p>
                    <p className='m-0 text-base leading-snug font-black'>{item.better}</p>
                    {item.note ? <p className='m-0 mt-0.5 text-xs font-semibold text-muted-foreground'>{item.note}</p> : null}
                  </div>
                  <SpeakButton text={item.better} langName={targetLang} color='#3B82F6' variant='icon' label={t('Escuchar')} />
                  {tools(`fix-${index}`, 'corrections', index)}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className='flex flex-col gap-3'>
          <div className='flex flex-col gap-2 @xl:flex-row @xl:items-center @xl:justify-between'>
            <p className='m-0 text-sm font-bold text-muted-foreground'>{t('Intenta decirla bien antes de girar la carta. Luego, escúchala.')}</p>
            <div className='w-full @xl:w-48'>
              <GameProgress value={flipped.size / data.corrections.length} color='var(--ica-gold)' height={10} label={t('Cartas descubiertas')} />
            </div>
          </div>
          <div className='grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3'>
            {data.corrections.map((item, index) => (
              <FlipCard
                key={`fix-${index}`}
                item={item}
                targetLang={targetLang}
                flipped={flipped.has(index)}
                onFlip={() => setFlipped((prev) => new Set([...prev, index]))}
              />
            ))}
          </div>
          {all ? (
            <div className='ica-pop flex items-center gap-3 rounded-2xl p-3' style={{ background: 'var(--ica-gold-soft)' }}>
              <SealGlyph size={56} />
              <p className='m-0 font-display text-base font-extrabold'>{t('¡Todas descubiertas! Ahora dilas en voz alta.')}</p>
            </div>
          ) : null}
        </div>
      ),
    })
  }

  if (data.words.length) {
    parts.push({
      key: 'words',
      icon: <TrunkIcon size={30} />,
      tone: 'fire',
      title: t('Para tu Baúl ICA'),
      n: String(data.words.length),
      label: tn(data.words.length, 'palabra nueva', 'palabras nuevas'),
      right:
        canAddWords && vault.ready ? (
          <span className='text-sm font-black whitespace-nowrap' style={{ color: 'var(--ica-fire-ink)' }}>
            {data.words.filter((word) => vault.has(word)).length}/{data.words.length}
          </span>
        ) : null,
      body: (
        <div className='grid grid-cols-1 gap-2 @md:grid-cols-2 @3xl:grid-cols-3'>
          {data.words.map((word, index) =>
            editing === `word-${index}` ? (
              <ItemEditor
                key={`word-${index}`}
                fields={[
                  { key: 'target', label: t('Palabra'), value: word.target },
                  { key: 'native', label: t('Traducción'), value: word.native },
                ]}
                onSave={(values) =>
                  values.target && values.native ? replaceAt('words', index, { target: values.target, native: values.native }) : removeAt('words', index)
                }
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div
                key={`word-${index}`}
                className='flex items-center justify-between gap-1 rounded-2xl p-2.5 pl-3'
                style={{
                  background: canAddWords && vault.has(word) ? 'var(--ica-ok-soft)' : '#FBF3EA',
                  border: `2px solid ${canAddWords && vault.has(word) ? 'color-mix(in oklab, var(--ica-ok) 40%, transparent)' : TRUNK_WOOD.light}`,
                  boxShadow: `0 3px 0 ${canAddWords && vault.has(word) ? 'color-mix(in oklab, var(--ica-ok) 35%, transparent)' : TRUNK_WOOD.base}`,
                  color: canAddWords && vault.has(word) ? undefined : '#3b2612',
                }}
              >
                <span className='min-w-0 leading-tight'>
                  <b className='block text-[15px]'>{word.target}</b>
                  <span className='text-xs font-semibold' style={{ color: canAddWords && vault.has(word) ? 'var(--ica-ok-ink)' : TRUNK_WOOD.ink }}>
                    {word.native}
                  </span>
                </span>
                {canAddWords && vault.ready ? <VaultWordButton word={word} vault={vault} /> : null}
                {tools(`word-${index}`, 'words', index)}
              </div>
            ),
          )}
        </div>
      ),
    })
  }

  if (data.suggestions.length) {
    parts.push({
      key: 'tips',
      icon: <BulbGlyph size={30} />,
      tone: 'gold',
      title: t('Consejos para tu semana'),
      n: String(data.suggestions.length),
      label: tn(data.suggestions.length, 'consejo', 'consejos'),
      body: (
        <ul className='m-0 grid list-none gap-3 p-0 @3xl:grid-cols-2'>
          {data.suggestions.map((item, index) => (
            <li key={`tip-${index}`} className='flex items-start gap-2.5 rounded-2xl border-2 p-3' style={{ borderColor: 'var(--border)' }}>
              {editing === `tip-${index}` ? (
                <ItemEditor
                  fields={[
                    { key: 'title', label: t('Sugerencia'), value: item.title },
                    { key: 'detail', label: t('Cómo aplicarla'), value: item.detail, long: true },
                  ]}
                  onSave={(values) =>
                    values.title ? replaceAt('suggestions', index, { title: values.title, detail: values.detail }) : removeAt('suggestions', index)
                  }
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <>
                  <BoltIcon size={20} />
                  <div className='min-w-0 flex-1'>
                    <p className='m-0 text-[15px] font-black'>{item.title}</p>
                    {item.detail ? <p className='m-0 text-sm font-semibold text-muted-foreground'>{item.detail}</p> : null}
                  </div>
                  {tools(`tip-${index}`, 'suggestions', index)}
                </>
              )}
            </li>
          ))}
        </ul>
      ),
    })
  }

  if (weeks.length || data.focusNote) {
    parts.push({
      key: 'focos',
      icon: <TargetGlyph size={30} />,
      tone: 'i',
      title: t('Tus focos esta semana'),
      n: baseline !== null && weeks.length ? `+${gainedTotal}` : String(weeks.length),
      label: baseline !== null && weeks.length ? t('fases en tus focos') : tn(weeks.length, 'foco', 'focos'),
      right:
        baseline !== null && weeks.length ? (
          <span
            className='rounded-full px-2.5 py-1 text-xs font-black whitespace-nowrap'
            style={gainedTotal ? { background: 'var(--ica-gold)', color: '#4a3200' } : { background: 'var(--muted)', color: 'var(--muted-foreground)' }}
          >
            {gainedTotal ? tn(gainedTotal, '+{n} fase', '+{n} fases') : t('Sin fases nuevas')}
          </span>
        ) : null,
      body: (
        <div className='flex flex-col gap-3'>
          {weeks.length ? (
            <div className='grid gap-3 @3xl:grid-cols-3'>
              {weeks.map(({ focus, states, gained, masteredThisWeek, isNew }) => (
                <div
                  key={focus.id}
                  className='flex flex-col gap-2 rounded-2xl border-2 p-3'
                  style={{
                    borderColor: gained ? 'color-mix(in oklab, var(--ica-gold) 55%, transparent)' : 'var(--border)',
                    background: gained ? 'color-mix(in oklab, var(--ica-gold-soft) 60%, var(--card))' : 'var(--card)',
                  }}
                >
                  <div className='flex items-start justify-between gap-2'>
                    <b className='min-w-0 text-[15px] leading-tight'>{focus.focusTitle}</b>
                    {baseline === null ? null : masteredThisWeek ? (
                      <span className='shrink-0 rounded-full px-2 py-0.5 text-xs font-black whitespace-nowrap' style={{ background: 'var(--ica-gold)', color: '#4a3200' }}>
                        {t('¡Dominado!')}
                      </span>
                    ) : gained ? (
                      <span className='shrink-0 rounded-full px-2 py-0.5 text-xs font-black whitespace-nowrap' style={{ background: 'var(--ica-gold)', color: '#4a3200' }}>
                        {t('+{n} esta semana', { n: gained })}
                      </span>
                    ) : (
                      <span className='shrink-0 text-xs font-bold whitespace-nowrap text-muted-foreground'>
                        {isNew ? t('Nuevo esta semana') : t('Sin cambios')}
                      </span>
                    )}
                  </div>
                  <FocusStairs states={states} mastered={states.every((state) => state !== 'pending')} compact />
                </div>
              ))}
            </div>
          ) : null}
          {baseline !== null && weeks.length ? (
            <div className='flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold text-muted-foreground'>
              <span className='inline-flex items-center gap-1.5'>
                <span className='size-2.5 rounded-full' style={{ background: 'var(--ica-i)' }} /> {t('Ya lo tenías')}
              </span>
              <span className='inline-flex items-center gap-1.5'>
                <span className='size-2.5 rounded-full' style={{ background: 'var(--ica-gold)' }} /> {t('Conseguido esta semana')}
              </span>
              <span className='inline-flex items-center gap-1.5'>
                <TargetGlyph size={14} /> {t('Arriba del todo: foco dominado')}
              </span>
            </div>
          ) : null}
          {editable && editing === 'focusNote' ? (
            <ItemEditor
              fields={[{ key: 'note', label: t('Comentario sobre sus focos'), value: data.focusNote, long: true }]}
              onSave={(values) => save({ ...data, focusNote: values.note })}
              onCancel={() => setEditing(null)}
            />
          ) : data.focusNote || editable ? (
            <div className='flex items-start gap-2'>
              <p className='m-0 min-w-0 flex-1 text-sm font-semibold text-muted-foreground'>{data.focusNote || t('Sin comentario de la IA.')}</p>
              {editable ? <EditButton onClick={() => setEditing('focusNote')} /> : null}
            </div>
          ) : null}
        </div>
      ),
    })
  }

  // A tile at the top opens its part and takes you there; a row opens or closes it.
  const openPart = (key: PartKey, fromTile: boolean) => {
    setOpen(open === key && !fromTile ? null : key)
    if (fromTile) requestAnimationFrame(() => rowRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <div className='@container'>
      <div className='overflow-hidden rounded-[28px] border-2' style={fichaFrame}>
        {/* Top of the card: «Semana N · reporte conseguido», Ika and the summary. */}
        <div className='coaching-hero relative overflow-hidden px-5 pt-5 pb-5 text-white' style={{ borderRadius: 0, boxShadow: 'none' }}>
          <span className='coaching-hero-glow pointer-events-none absolute -top-24 -right-10 size-72 rounded-full' aria-hidden='true' />
          <p className='relative m-0 text-xs font-black tracking-[0.12em] uppercase' style={{ color: 'var(--ica-gold)' }}>
            {t('Semana {n} · reporte conseguido', { n: periodNumber })}
          </p>
          <div className='relative mt-3 flex flex-col gap-3 @2xl:flex-row @2xl:items-center'>
            <span className='ica-pop hidden shrink-0 @2xl:block'>
              <ReportGlyph size={88} />
            </span>
            <div className='min-w-0 flex-1'>
              {editing === 'headline' ? (
                <ItemEditor
                  fields={[{ key: 'headline', label: t('Título'), value: data.headline, long: true }]}
                  onSave={(values) => values.headline && save({ ...data, headline: values.headline })}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <IcaSays dark size={52}>
                  <div className='flex items-start gap-2'>
                    <p className='m-0 min-w-0 flex-1 font-display text-lg leading-snug font-extrabold text-balance'>{data.headline}</p>
                    {editable ? <EditButton onDark onClick={() => setEditing('headline')} /> : null}
                  </div>
                </IcaSays>
              )}
            </div>
          </div>
          <IndexTiles parts={parts} onPick={(key) => openPart(key, true)} />
        </div>

        {/* Each part closed in its own row: only one open at a time. */}
        <div className='flex flex-col gap-2 p-3 @2xl:p-4'>
          {parts.map((part) => {
            const isOpen = open === part.key
            return (
              <div
                key={part.key}
                ref={(node) => {
                  rowRefs.current[part.key] = node
                }}
                className='scroll-mt-4 rounded-2xl border-2'
                style={{ borderColor: isOpen ? 'color-mix(in oklab, var(--ica-gold) 55%, transparent)' : 'var(--border)' }}
              >
                <button type='button' onClick={() => openPart(part.key, false)} aria-expanded={isOpen} className='flex w-full items-center gap-3 p-3 text-left'>
                  <IconTile tone={part.tone} size={40}>
                    {part.icon}
                  </IconTile>
                  <span className='min-w-0 flex-1 font-display text-base leading-tight font-extrabold'>{part.title}</span>
                  {part.right ?? <span className='text-sm font-black text-muted-foreground'>{part.n}</span>}
                  <ChevronDownIcon className='size-5 shrink-0 text-muted-foreground transition-transform' style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                </button>
                {isOpen ? <div className='ica-pop px-3 pb-3'>{part.body}</div> : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Before the 6 tasks: «tu reporte», locked, and what is inside (no numbers: it may not exist yet). */
export function CoachingWeeklyReportTeaser({
  periodNumber,
  hasReport,
  pendingTasks,
}: {
  periodNumber: number
  /** A report exists: it is ready, just locked. */
  hasReport: boolean
  pendingTasks: number
}) {
  const done = Math.max(0, 6 - pendingTasks)
  const inside = [
    { key: 'corrections', icon: <SpeechGlyph size={30} />, label: t('Frases para escuchar') },
    { key: 'words', icon: <TrunkIcon size={30} />, label: t('Palabras nuevas') },
    { key: 'tips', icon: <BulbGlyph size={30} />, label: t('Consejos para tu semana') },
    { key: 'focos', icon: <TargetGlyph size={30} />, label: t('Fases en tus focos') },
  ]
  return (
    <div className='@container coaching-hero relative overflow-hidden rounded-[28px] px-5 pt-6 pb-6 text-center text-white'>
      <span className='coaching-hero-glow pointer-events-none absolute -top-20 left-1/2 size-72 -translate-x-1/2 rounded-full' aria-hidden='true' />
      <p className='relative m-0 text-xs font-black tracking-[0.12em] uppercase' style={{ color: 'var(--ica-gold)' }}>
        {t('Semana {n} · tu reporte', { n: periodNumber })}
      </p>
      <div className='relative mx-auto mt-3 w-fit'>
        <ReportGlyph size={128} locked />
        <span className='absolute -right-2 bottom-2'>
          <PadlockGlyph size={44} />
        </span>
      </div>
      <h3 className='relative m-0 mt-3 font-display text-2xl leading-tight font-extrabold text-balance'>
        {pendingTasks > 0
          ? tn(pendingTasks, 'Te falta {n} tarea para desbloquear tu reporte', 'Te faltan {n} tareas para desbloquear tu reporte')
          : t('Tu reporte se abre con las seis tareas')}
      </h3>
      <div className='relative mx-auto mt-3 flex w-fit gap-1.5' role='img' aria-label={t('{n} de 6 tareas', { n: done })}>
        {Array.from({ length: 6 }, (_, index) => (
          <span
            key={index}
            className='size-4 rounded-full'
            style={{ background: index < done ? 'var(--ica-gold)' : 'rgb(255 255 255 / 0.2)', boxShadow: index < done ? '0 2px 0 var(--ica-gold-edge)' : undefined }}
          />
        ))}
      </div>
      {hasReport ? (
        <p className='relative m-0 mt-2 text-sm font-bold opacity-80'>{t('Ya está listo: termina tus tareas para verlo.')}</p>
      ) : null}
      <p className='relative m-0 mt-5 text-xs font-black tracking-[0.1em] uppercase opacity-70'>{t('Dentro te espera')}</p>
      <div className='relative mt-2 grid grid-cols-2 gap-2 @2xl:grid-cols-4'>
        {inside.map((item) => (
          <div
            key={item.key}
            className='flex items-center gap-2.5 rounded-2xl px-3 py-3 text-left'
            style={{ background: 'rgb(255 255 255 / 0.08)', border: '1px solid rgb(255 255 255 / 0.14)' }}
          >
            {item.icon}
            <span className='min-w-0 text-sm leading-tight font-black'>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

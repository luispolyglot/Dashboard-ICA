import { useEffect, useRef, useState } from 'react'
import { CheckIcon, LoaderCircleIcon, MicIcon, SearchIcon, TrophyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { IconTile, ListRow, PageTitle, Panel, RowGroup, SectionLabel } from '../game/ui'
import {
  fetchWinnerNotes,
  saveWinnerFeedback,
  searchWinners,
  type WinnerNote,
  type WinnerSearchRow,
} from '../services/winnerFeedback'

// FEEDBACK A GANADORES (Luis, 11 Oct): super admins only, Spanish only like the other admin pages.
// Flow: find the student, listen to their latest master note, write the feedback next to it, record
// the Loom and keep its link here (it is sent by WhatsApp).

const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'sin notas maestras'

const formatDuration = (ms: number | null) => {
  if (!ms || ms <= 0) return null
  const seconds = Math.round(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const personName = (row: { displayName: string | null; username: string | null }) =>
  row.displayName || row.username || 'Sin nombre'

export function AdminWinnerFeedbackView() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<WinnerSearchRow[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<WinnerSearchRow | null>(null)
  const [notes, setNotes] = useState<WinnerNote[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const searchId = useRef(0)

  useEffect(() => {
    const text = query.trim()
    if (text.length < 2) {
      setResults([])
      return
    }
    const id = (searchId.current += 1)
    setSearching(true)
    const timer = window.setTimeout(() => {
      searchWinners(text)
        .then((rows) => {
          if (id === searchId.current) setResults(rows)
        })
        .catch((reason: unknown) => {
          if (id === searchId.current) setError(reason instanceof Error ? reason.message : 'No se pudo buscar.')
        })
        .finally(() => {
          if (id === searchId.current) setSearching(false)
        })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const open = (row: WinnerSearchRow) => {
    setSelected(row)
    setNotes(null)
    setError(null)
    fetchWinnerNotes(row.userId)
      .then(setNotes)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudieron cargar sus notas.'))
  }

  return (
    <section className='mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 pt-2 pb-8 lg:py-8'>
      <PageTitle
        icon={
          <IconTile tone='gold' size={48}>
            <TrophyIcon className='size-6' strokeWidth={2.4} />
          </IconTile>
        }
        subtitle='Busca al ganador, escucha su última nota maestra y escribe el feedback al lado. El enlace de Loom se queda guardado aquí.'
      >
        Feedback a ganadores
      </PageTitle>

      {selected ? (
        <div className='flex flex-col gap-4'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div>
              <p className='m-0 text-xl font-extrabold'>{personName(selected)}</p>
              {selected.username ? <p className='m-0 text-sm font-semibold text-muted-foreground'>@{selected.username}</p> : null}
            </div>
            <Button type='button' variant='outline' onClick={() => setSelected(null)}>
              Buscar a otra persona
            </Button>
          </div>
          {error ? <p className='m-0 text-sm font-bold text-destructive'>{error}</p> : null}
          {notes === null && !error ? (
            <p className='m-0 flex items-center gap-2 text-sm font-semibold text-muted-foreground'>
              <LoaderCircleIcon className='size-4 animate-spin' /> Cargando sus notas maestras…
            </p>
          ) : null}
          {notes && notes.length === 0 ? (
            <p className='m-0 text-sm font-semibold text-muted-foreground'>Todavía no tiene notas maestras.</p>
          ) : null}
          {notes?.map((note, index) => (
            <NoteFeedback key={note.id} userId={selected.userId} note={note} latest={index === 0} />
          ))}
        </div>
      ) : (
        <div className='flex flex-col gap-3'>
          <div className='relative'>
            <SearchIcon className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder='Nombre o usuario del ganador…'
              className='h-12 rounded-2xl pl-9 text-base'
              autoFocus
            />
          </div>
          {error ? <p className='m-0 text-sm font-bold text-destructive'>{error}</p> : null}
          {searching ? <p className='m-0 text-sm font-semibold text-muted-foreground'>Buscando…</p> : null}
          {results.length > 0 ? (
            <RowGroup>
              {results.map((row) => (
                <ListRow
                  key={row.userId}
                  onClick={() => open(row)}
                  title={personName(row)}
                  text={`${row.username ? `@${row.username} · ` : ''}Última nota maestra: ${formatDate(row.lastMasterNoteAt)}`}
                />
              ))}
            </RowGroup>
          ) : query.trim().length >= 2 && !searching ? (
            <p className='m-0 text-sm font-semibold text-muted-foreground'>No hay nadie con ese nombre.</p>
          ) : null}
        </div>
      )}
    </section>
  )
}

function NoteFeedback({ userId, note, latest }: { userId: string; note: WinnerNote; latest: boolean }) {
  const [loomUrl, setLoomUrl] = useState(note.feedbackLoomUrl || '')
  const [text, setText] = useState(note.feedbackNotes || '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const duration = formatDuration(note.totalDurationMs)

  const save = () => {
    setState('saving')
    saveWinnerFeedback({ userId, masterNoteId: note.id, feedbackLoomUrl: loomUrl.trim(), feedbackNotes: text.trim() })
      .then(() => setState('saved'))
      .catch(() => setState('error'))
  }

  return (
    <Panel className='flex flex-col gap-4 p-4'>
      <div className='flex flex-wrap items-baseline justify-between gap-2'>
        <p className='m-0 text-base font-extrabold'>
          {latest ? 'Última nota maestra' : 'Nota anterior'}
          {note.name ? ` · ${note.name}` : ''}
        </p>
        <p className='m-0 text-xs font-bold text-muted-foreground'>
          {formatDate(note.createdAt)}
          {duration ? ` · ${duration}` : ''}
          {note.targetLang ? ` · ${note.targetLang}` : ''}
          {note.closedAt ? '' : ' · sin cerrar'}
        </p>
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        <div className='flex flex-col gap-3'>
          <SectionLabel className='mb-0'>Escuchar</SectionLabel>
          {note.audioUrl ? <audio controls preload='metadata' src={note.audioUrl} className='w-full' /> : null}
          {note.parts.length > 0 ? (
            <ol className='m-0 flex list-none flex-col gap-2 p-0'>
              {note.parts.map((part, index) => (
                <li key={part.id} className='rounded-2xl bg-muted/60 px-3 py-2'>
                  <p className='m-0 flex items-start gap-2 text-sm font-bold'>
                    <MicIcon className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
                    <span>
                      {index + 1}. {part.phrase || 'Frase sin texto'}
                    </span>
                  </p>
                  {part.translation ? <p className='m-0 mt-0.5 pl-6 text-xs font-semibold text-muted-foreground'>{part.translation}</p> : null}
                  {!note.audioUrl && part.audioUrl ? (
                    <audio controls preload='none' src={part.audioUrl} className='mt-2 w-full' />
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
          {!note.audioUrl && note.parts.every((part) => !part.audioUrl) ? (
            <p className='m-0 text-sm font-semibold text-muted-foreground'>Esta nota no tiene audio.</p>
          ) : null}
        </div>

        <div className='flex flex-col gap-3'>
          <SectionLabel className='mb-0'>Tu feedback</SectionLabel>
          <Textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setState('idle')
            }}
            placeholder='Lo que vas a comentarle: pronunciación, frases, lo que hace bien…'
            className='min-h-40 rounded-2xl text-base'
          />
          <Input
            value={loomUrl}
            onChange={(event) => {
              setLoomUrl(event.target.value)
              setState('idle')
            }}
            placeholder='Enlace del vídeo de Loom'
            className='h-11 rounded-2xl'
            inputMode='url'
          />
          <div className='flex items-center gap-3'>
            <Button type='button' variant='i' onClick={save} disabled={state === 'saving'}>
              {state === 'saving' ? <LoaderCircleIcon className='animate-spin' /> : state === 'saved' ? <CheckIcon /> : null}
              {state === 'saved' ? 'Guardado' : 'Guardar'}
            </Button>
            {state === 'error' ? <span className='text-sm font-bold text-destructive'>No se pudo guardar.</span> : null}
          </div>
        </div>
      </div>
    </Panel>
  )
}

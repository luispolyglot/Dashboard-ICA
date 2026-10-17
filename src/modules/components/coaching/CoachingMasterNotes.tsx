import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import type { CoachingV2MasterNote } from '../../services/coaching'
import { getMasterNoteNumber } from '../../services/masterNotes'
import { MicGlyph } from '../../game/icons'
import { IconTile } from '../../game/ui'
import { t, tn, uiLocale } from '@/i18n'

/* ══════════════════════════════════════════════════════════════════════
   Notas maestras en el coaching v2 (Luis, 17 Oct). El coach deja su
   feedback (Loom y notas) en cada nota maestra cerrada; el alumno lo ve
   aquí, en su tablero, con el mismo estilo de ficha que el reporte:
   una fila por nota, la más nueva arriba, y se abre una a la vez.
   ══════════════════════════════════════════════════════════════════════ */

/** Loom share link → the player that can go inside the page. */
export function masterNoteLoomEmbed(value: string | null | undefined): string | null {
  if (!value || !/loom\.com/i.test(value)) return null
  return value.replace('/share/', '/embed/').replace('/shared/', '/embed/')
}

/** The week (period) in which a note was closed, from the weeks' opening dates. */
export function masterNotePeriod(
  closedAt: string,
  periods: Array<{ periodNumber: number; activatedAt: string }>,
): number | null {
  const closed = new Date(closedAt).getTime()
  if (Number.isNaN(closed)) return null
  let found: number | null = null
  let foundAt = -Infinity
  for (const period of periods) {
    const opened = new Date(period.activatedAt).getTime()
    if (Number.isNaN(opened) || opened > closed || opened < foundAt) continue
    found = period.periodNumber
    foundAt = opened
  }
  return found
}

export function masterNoteDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' })
}

/** The note's number in a medal (like the ranking places). */
export function MasterNoteBadge({ name, done }: { name: string; done: boolean }) {
  const number = getMasterNoteNumber(name)
  return (
    <span
      className='grid size-11 shrink-0 place-items-center rounded-2xl font-display text-lg font-black'
      style={
        done
          ? { background: 'var(--ica-gold)', color: '#4a3200', boxShadow: '0 3px 0 var(--ica-gold-edge)' }
          : { background: 'var(--ica-a-soft)', color: 'var(--ica-a-ink)', boxShadow: '0 3px 0 color-mix(in oklab, var(--ica-a) 35%, transparent)' }
      }
      aria-hidden='true'
    >
      {number ?? '·'}
    </span>
  )
}

export function MasterNoteChip({ tone, children }: { tone: 'gold' | 'muted' | 'ok'; children: ReactNode }) {
  const style: CSSProperties =
    tone === 'gold'
      ? { background: 'var(--ica-gold)', color: '#4a3200' }
      : tone === 'ok'
        ? { background: 'var(--ica-ok-soft)', color: 'var(--ica-ok-ink)' }
        : { background: 'var(--muted)', color: 'var(--muted-foreground)' }
  return (
    <span className='inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-black whitespace-nowrap' style={style}>
      {children}
    </span>
  )
}

/** Same frame as the weekly report: one card with an edge. */
export const masterNotesFrame: CSSProperties = {
  background: 'var(--card)',
  borderColor: 'color-mix(in oklab, var(--ica-a) 45%, transparent)',
  boxShadow: '0 6px 0 color-mix(in oklab, var(--ica-a) 35%, transparent)',
}

/** «tu coach» at the start of a sentence: «Tu coach». */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function displayName(name: string): string {
  const number = getMasterNoteNumber(name)
  return number ? t('Nota maestra {n}', { n: number }) : name
}

/** Student (and the coach's «vista de alumno»): every master note closed during the coaching. */
export function StudentMasterNotes({
  notes,
  periods,
  coachName,
}: {
  notes: CoachingV2MasterNote[]
  periods: Array<{ periodNumber: number; activatedAt: string }>
  coachName: string | null
}) {
  const withFeedback = notes.filter((note) => note.feedbackLoomUrl || note.feedbackNotes)
  // The newest note with feedback starts open: it is what the student comes for.
  const [open, setOpen] = useState<string | null>(() => withFeedback[0]?.id ?? null)
  const coach = coachName?.trim() || t('tu coach')

  return (
    <section className='@container'>
      <div className='overflow-hidden rounded-[28px] border-2' style={masterNotesFrame}>
        <header className='flex flex-wrap items-center gap-3 p-4 @2xl:px-5'>
          <IconTile tone='a' size={48}>
            <MicGlyph size={32} />
          </IconTile>
          <div className='min-w-[12rem] flex-1'>
            <h3 className='m-0 font-display text-xl leading-tight font-extrabold'>{t('Tus notas maestras')}</h3>
            <p className='m-0 text-sm font-semibold text-muted-foreground'>
              {t('Cada nota maestra que cierras, {coach} la escucha y te deja su feedback aquí.', { coach })}
            </p>
          </div>
          {notes.length ? (
            <MasterNoteChip tone={withFeedback.length ? 'gold' : 'muted'}>
              {tn(withFeedback.length, '{n} con feedback', '{n} con feedback')}
            </MasterNoteChip>
          ) : null}
        </header>

        <div className='flex flex-col gap-2 px-3 pb-3 @2xl:px-4 @2xl:pb-4'>
          {notes.length === 0 ? (
            <p className='m-0 rounded-2xl border-2 border-dashed p-4 text-sm font-semibold text-muted-foreground' style={{ borderColor: 'var(--border)' }}>
              {t('Cuando cierres tu primera nota maestra, aquí verás el feedback de {coach}.', { coach })}
            </p>
          ) : (
            notes.map((note) => {
              const hasFeedback = Boolean(note.feedbackLoomUrl || note.feedbackNotes)
              const isOpen = open === note.id
              const week = masterNotePeriod(note.closedAt, periods)
              const embed = masterNoteLoomEmbed(note.feedbackLoomUrl)
              return (
                <div
                  key={note.id}
                  className='rounded-2xl border-2'
                  style={{ borderColor: isOpen ? 'color-mix(in oklab, var(--ica-gold) 55%, transparent)' : 'var(--border)' }}
                >
                  <button
                    type='button'
                    onClick={() => setOpen(isOpen ? null : note.id)}
                    aria-expanded={isOpen}
                    className='flex w-full items-center gap-3 p-3 text-left'
                  >
                    <MasterNoteBadge name={note.name} done={hasFeedback} />
                    <span className='min-w-0 flex-1 leading-tight'>
                      <b className='block font-display text-base font-extrabold'>{displayName(note.name)}</b>
                      <span className='text-xs font-bold text-muted-foreground'>
                        {week
                          ? t('Semana {week} · cerrada el {date}', { week, date: masterNoteDate(note.closedAt) })
                          : t('Cerrada el {date}', { date: masterNoteDate(note.closedAt) })}
                      </span>
                    </span>
                    <span className='hidden @md:inline-flex'>
                      {hasFeedback ? (
                        <MasterNoteChip tone='gold'>{t('Feedback de {coach}', { coach })}</MasterNoteChip>
                      ) : (
                        <MasterNoteChip tone='muted'>{t('Esperando feedback')}</MasterNoteChip>
                      )}
                    </span>
                    <ChevronDownIcon
                      className='size-5 shrink-0 text-muted-foreground transition-transform'
                      style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}
                    />
                  </button>
                  {isOpen ? (
                    <div className='ica-pop flex flex-col gap-3 px-3 pb-3'>
                      {hasFeedback ? (
                        <div className='grid items-start gap-3 @3xl:grid-cols-[1.4fr_1fr]'>
                          {embed ? (
                            <div className='overflow-hidden rounded-2xl border-2' style={{ borderColor: 'var(--border)' }}>
                              <iframe
                                src={embed}
                                title={t('Feedback de {name}', { name: displayName(note.name) })}
                                className='aspect-video w-full'
                                allow='autoplay; fullscreen; picture-in-picture'
                                allowFullScreen
                              />
                            </div>
                          ) : note.feedbackLoomUrl ? (
                            <a
                              href={note.feedbackLoomUrl}
                              target='_blank'
                              rel='noopener noreferrer'
                              className='ica-press inline-flex w-fit items-center rounded-xl px-4 py-2.5 text-sm font-black'
                              style={{ background: 'var(--ica-gold)', color: '#3d2a00', boxShadow: '0 4px 0 var(--ica-gold-edge)' }}
                            >
                              {t('Ver el vídeo de tu feedback')}
                            </a>
                          ) : null}
                          {note.feedbackNotes ? (
                            <div
                              className='rounded-2xl border-2 p-3'
                              style={{ background: 'var(--ica-gold-soft)', borderColor: 'color-mix(in oklab, var(--ica-gold) 45%, transparent)' }}
                            >
                              <p className='m-0 mb-1 text-[11px] font-black tracking-[0.1em] uppercase' style={{ color: 'var(--ica-gold-ink)' }}>
                                {t('Notas de {coach}', { coach })}
                              </p>
                              <p className='m-0 text-[15px] leading-relaxed font-semibold whitespace-pre-wrap'>{note.feedbackNotes}</p>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <p className='m-0 rounded-2xl p-3 text-sm font-semibold text-muted-foreground' style={{ background: 'var(--muted)' }}>
                          {sentence(t('{coach} aún no la ha escuchado. Te llegará un aviso cuando deje su feedback.', { coach }))}
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </div>
      </div>
    </section>
  )
}

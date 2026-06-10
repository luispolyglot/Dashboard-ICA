export type LoopAnnouncementType = 'first' | 'next'

export function getMasterNotesLoopAnnouncement(
  noteName: string,
  type: LoopAnnouncementType,
): string {
  const safeName = noteName.trim().length > 0 ? noteName.trim() : 'nota maestra'
  if (type === 'first') {
    return `Empezamos con ${safeName}`
  }
  return `Siguiente ${safeName}`
}

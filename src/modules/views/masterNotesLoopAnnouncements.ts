export type LoopAnnouncementType = 'first' | 'next'

export function getMasterNotesLoopAnnouncement(
  noteName: string,
  type: LoopAnnouncementType,
): string {
  const normalizedName = noteName.replace(/:/g, ' ').replace(/\s+/g, ' ').trim()
  const safeName = normalizedName.length > 0 ? normalizedName : 'nota maestra'
  if (type === 'first') {
    return `Empezamos con ${safeName}`
  }
  return `Siguiente ${safeName}`
}

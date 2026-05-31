export type CalendarIcademyCatalogEntry = {
  classKey: string
  className: string
  languageCode: 'pl' | 'fr' | 'en' | 'it' | 'de'
  flag: string
}

const CATALOG: CalendarIcademyCatalogEntry[] = [
  { classKey: 'polaco', className: 'Polaco', languageCode: 'pl', flag: '🇵🇱' },
  { classKey: 'fr_basico', className: 'FR básico', languageCode: 'fr', flag: '🇫🇷' },
  {
    classKey: 'fr_conv',
    className: 'FR conversacional',
    languageCode: 'fr',
    flag: '🇫🇷',
  },
  { classKey: 'en_basico', className: 'EN básico', languageCode: 'en', flag: '🇬🇧' },
  {
    classKey: 'en_intermedio',
    className: 'EN intermedio',
    languageCode: 'en',
    flag: '🇬🇧',
  },
  {
    classKey: 'en_avanzado',
    className: 'EN avanzado',
    languageCode: 'en',
    flag: '🇬🇧',
  },
  { classKey: 'it_basico', className: 'IT básico', languageCode: 'it', flag: '🇮🇹' },
  {
    classKey: 'it_intermedio',
    className: 'IT intermedio',
    languageCode: 'it',
    flag: '🇮🇹',
  },
  {
    classKey: 'it_avanzado',
    className: 'IT avanzado',
    languageCode: 'it',
    flag: '🇮🇹',
  },
  { classKey: 'de_basico', className: 'DE básico', languageCode: 'de', flag: '🇩🇪' },
  {
    classKey: 'de_conv',
    className: 'DE conversacional',
    languageCode: 'de',
    flag: '🇩🇪',
  },
]

const CATALOG_BY_KEY = new Map(CATALOG.map((item) => [item.classKey, item]))

export const CALENDAR_ICADEMY_CATALOG = CATALOG

export function getCalendarIcademyCatalogEntry(
  classKey: string,
): CalendarIcademyCatalogEntry | null {
  return CATALOG_BY_KEY.get(classKey) || null
}

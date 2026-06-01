export type CalendarIcademyCatalogItem = {
  classKey: string
  className: string
  languageCode:
    | 'pl'
    | 'fr'
    | 'en'
    | 'it'
    | 'de'
    | 'destripando_niveles'
}

const CATALOG: CalendarIcademyCatalogItem[] = [
  { classKey: 'polaco', className: 'Polaco', languageCode: 'pl' },
  { classKey: 'fr_basico', className: 'FR básico', languageCode: 'fr' },
  {
    classKey: 'fr_conv',
    className: 'FR conversacional',
    languageCode: 'fr',
  },
  { classKey: 'en_basico', className: 'EN básico', languageCode: 'en' },
  {
    classKey: 'en_intermedio',
    className: 'EN intermedio',
    languageCode: 'en',
  },
  {
    classKey: 'en_avanzado',
    className: 'EN avanzado',
    languageCode: 'en',
  },
  { classKey: 'it_basico', className: 'IT básico', languageCode: 'it' },
  {
    classKey: 'it_intermedio',
    className: 'IT intermedio',
    languageCode: 'it',
  },
  {
    classKey: 'it_avanzado',
    className: 'IT avanzado',
    languageCode: 'it',
  },
  { classKey: 'de_basico', className: 'DE básico', languageCode: 'de' },
  {
    classKey: 'de_conv',
    className: 'DE conversacional',
    languageCode: 'de',
  },
  {
    classKey: 'destripando_niveles',
    className: '🔪 Destripando Niveles',
    languageCode: 'destripando_niveles',
  },
]

const CATALOG_MAP = new Map(CATALOG.map((item) => [item.classKey, item]))

export function getCalendarIcademyCatalogByClassKey(
  classKey: string,
): CalendarIcademyCatalogItem | null {
  return CATALOG_MAP.get(classKey) || null
}

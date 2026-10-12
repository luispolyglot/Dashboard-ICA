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
  /** Ya no se imparte: la app la oculta a los alumnos (el admin la sigue viendo). */
  retired?: boolean
}

const CATALOG: CalendarIcademyCatalogItem[] = [
  { classKey: 'polaco', className: 'Polaco', languageCode: 'pl' },
  { classKey: 'fr_basico', className: 'Francés', languageCode: 'fr' },
  {
    classKey: 'fr_conv',
    className: 'FR conversacional',
    languageCode: 'fr',
    retired: true,
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
    retired: true,
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
    retired: true,
  },
  { classKey: 'de_basico', className: 'DE básico', languageCode: 'de', retired: true },
  {
    classKey: 'de_conv',
    className: 'DE conversacional',
    languageCode: 'de',
    retired: true,
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

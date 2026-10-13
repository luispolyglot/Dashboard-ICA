export type CalendarIcademyCatalogEntry = {
  classKey: string
  className: string
  languageCode:
    | 'pl'
    | 'fr'
    | 'en'
    | 'it'
    | 'de'
    | 'destripando_niveles'
  flag: string
  /**
   * Clase que ya no se imparte: los alumnos no la ven (ni sus sesiones),
   * pero sigue en el admin y en la base de datos.
   */
  retired?: boolean
}

const CATALOG: CalendarIcademyCatalogEntry[] = [
  { classKey: 'polaco', className: 'Polaco', languageCode: 'pl', flag: '🇵🇱' },
  // Desde octubre de 2026 solo hay una clase de francés: usa la clave de FR básico
  // (así se mantienen sus sesiones y los avisos de quien ya la tenía) con el nombre «Francés».
  { classKey: 'fr_basico', className: 'Francés', languageCode: 'fr', flag: '🇫🇷' },
  {
    classKey: 'fr_conv',
    className: 'FR conversacional',
    languageCode: 'fr',
    flag: '🇫🇷',
    retired: true,
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
    retired: true,
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
    retired: true,
  },
  {
    classKey: 'de_basico',
    className: 'DE básico',
    languageCode: 'de',
    flag: '🇩🇪',
    retired: true,
  },
  {
    classKey: 'de_conv',
    className: 'DE conversacional',
    languageCode: 'de',
    flag: '🇩🇪',
    retired: true,
  },
  {
    classKey: 'destripando_niveles',
    className: 'Destripando Niveles',
    languageCode: 'destripando_niveles',
    flag: '🔪',
  },
]

const CATALOG_BY_KEY = new Map(CATALOG.map((item) => [item.classKey, item]))

export const CALENDAR_ICADEMY_CATALOG = CATALOG

/** Clases que se siguen impartiendo (las que ve el alumno). */
export const ACTIVE_CALENDAR_ICADEMY_CATALOG = CATALOG.filter((item) => !item.retired)

/** true si la clase ya no se imparte y hay que ocultarla a los alumnos. */
export function isCalendarIcademyClassRetired(classKey: string): boolean {
  return CATALOG_BY_KEY.get(classKey)?.retired === true
}

export function getCalendarIcademyCatalogEntry(
  classKey: string,
): CalendarIcademyCatalogEntry | null {
  return CATALOG_BY_KEY.get(classKey) || null
}

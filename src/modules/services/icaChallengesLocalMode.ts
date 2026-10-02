/** El simulador local solo está disponible en desarrollo; no se empaqueta en producción. */
export const ICA_CHALLENGES_LOCAL =
  import.meta.env.DEV &&
  String(import.meta.env.VITE_ICA_CHALLENGES_LOCAL || '').trim().toLowerCase() === 'true'

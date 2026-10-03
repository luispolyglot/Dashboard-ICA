import { useCallback, useRef, useState } from 'react'

/**
 * Estado de carga "suave": sustituye a `useState(true)` en los flags de carga.
 *
 * - La primera vez que se carga, `loading` es true (se enseña el esqueleto).
 * - Las recargas siguientes (después de guardar, borrar, pulsar «Recargar»…)
 *   NO vuelven a poner `loading` a true: el contenido se queda en pantalla y
 *   solo se activa `refreshing`, que sirve para hacer girar el icono de recargar.
 * - Si cambia `resetKey` (otro idioma, otra nota, otro alumno…), la siguiente
 *   carga vuelve a contar como primera y se enseña otra vez el esqueleto.
 *
 * Uso: `const [loading, setLoading, refreshing] = useSoftLoading(true)`
 */
export function useSoftLoading(
  initial = true,
  resetKey?: unknown,
): [boolean, (value: boolean) => void, boolean] {
  const [loading, setLoadingState] = useState(initial)
  const [refreshing, setRefreshing] = useState(false)
  const loadedForRef = useRef<{ key: unknown } | null>(null)
  const resetKeyRef = useRef(resetKey)
  resetKeyRef.current = resetKey

  const setLoading = useCallback((value: boolean) => {
    if (value) {
      const alreadyLoaded =
        loadedForRef.current !== null &&
        Object.is(loadedForRef.current.key, resetKeyRef.current)
      if (alreadyLoaded) {
        setRefreshing(true)
      } else {
        setLoadingState(true)
      }
      return
    }

    loadedForRef.current = { key: resetKeyRef.current }
    setLoadingState(false)
    setRefreshing(false)
  }, [])

  return [loading, setLoading, refreshing]
}

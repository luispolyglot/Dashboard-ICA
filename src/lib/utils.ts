import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Tamaño máximo de lote para filtros `.in()` de PostgREST enviados por GET.
 * Cada UUID ocupa ~39 caracteres codificado en la URL; con listas grandes el
 * gateway de Supabase responde 431/414 sin cabeceras CORS y el navegador lo
 * reporta como un error de red (TypeError), disparando el modo offline.
 */
export const POSTGREST_IN_BATCH_SIZE = 100

export function chunkArray<T>(items: readonly T[], size: number = POSTGREST_IN_BATCH_SIZE): T[][] {
  if (size <= 0) return [items.slice()]
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

/**
 * Ejecuta `run` por lotes en paralelo y concatena los resultados.
 * Si algún lote falla, se propaga el error (mismo contrato que una sola query).
 * El orden relativo dentro de cada lote se conserva.
 */
export async function runInBatches<T, R>(
  items: readonly T[],
  run: (batch: T[]) => Promise<R[]>,
  size: number = POSTGREST_IN_BATCH_SIZE,
): Promise<R[]> {
  if (items.length === 0) return []
  const results = await Promise.all(chunkArray(items, size).map(run))
  return results.flat()
}

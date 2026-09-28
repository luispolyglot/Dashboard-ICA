import { describe, expect, it, vi } from 'vitest'

import { POSTGREST_IN_BATCH_SIZE, chunkArray, runInBatches } from '@/lib/utils'

describe('chunkArray', () => {
  it('parte la lista en lotes del tamaño indicado', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('devuelve lista vacía si no hay elementos', () => {
    expect(chunkArray([], 10)).toEqual([])
  })
})

describe('runInBatches', () => {
  it('nunca envía más IDs por request que el tamaño de lote (evita el 431)', async () => {
    const ids = Array.from({ length: 450 }, (_, index) => `id-${index}`)
    const run = vi.fn(async (batch: string[]) => batch.map((id) => ({ id })))

    const rows = await runInBatches(ids, run)

    expect(run).toHaveBeenCalledTimes(Math.ceil(450 / POSTGREST_IN_BATCH_SIZE))
    for (const [batch] of run.mock.calls) {
      expect(batch.length).toBeLessThanOrEqual(POSTGREST_IN_BATCH_SIZE)
    }
    expect(rows.map((row) => row.id)).toEqual(ids)
  })

  it('no llama a run si no hay elementos', async () => {
    const run = vi.fn(async () => [])
    expect(await runInBatches([], run)).toEqual([])
    expect(run).not.toHaveBeenCalled()
  })

  it('propaga el error si falla un lote', async () => {
    const ids = Array.from({ length: 250 }, (_, index) => index)
    const run = vi.fn(async (batch: number[]) => {
      if (batch[0] === 100) throw new Error('boom')
      return batch
    })

    await expect(runInBatches(ids, run)).rejects.toThrow('boom')
  })
})

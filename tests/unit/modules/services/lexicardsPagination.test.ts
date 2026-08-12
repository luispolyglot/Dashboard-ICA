import { describe, expect, it, vi } from 'vitest'

import { fetchAllPages } from '@/modules/services/lexicardsPagination'

describe('lexicardsPagination', () => {
  it('fetches all pages until a short page is returned', async () => {
    const fetchPage = vi
      .fn<
        (from: number, to: number) => Promise<{ data: Array<{ id: number }>; error: null }>
      >()
      .mockResolvedValueOnce({
        data: Array.from({ length: 3 }, (_, index) => ({ id: index + 1 })),
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: 4 }],
        error: null,
      })

    const rows = await fetchAllPages(fetchPage, 3)

    expect(rows.map((row) => row.id)).toEqual([1, 2, 3, 4])
    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 2)
    expect(fetchPage).toHaveBeenNthCalledWith(2, 3, 5)
  })

  it('performs an additional request when previous page is exactly full', async () => {
    const fetchPage = vi
      .fn<
        (from: number, to: number) => Promise<{ data: Array<{ id: number }>; error: null }>
      >()
      .mockResolvedValueOnce({
        data: [{ id: 1 }, { id: 2 }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [],
        error: null,
      })

    const rows = await fetchAllPages(fetchPage, 2)

    expect(rows.map((row) => row.id)).toEqual([1, 2])
    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2, 3)
  })

  it('throws when page query returns an error', async () => {
    const pageError = new Error('db error')
    const fetchPage = vi.fn().mockResolvedValue({ data: null, error: pageError })

    await expect(fetchAllPages(fetchPage, 10)).rejects.toThrow('db error')
  })
})

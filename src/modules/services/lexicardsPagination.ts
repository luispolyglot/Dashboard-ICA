type PageResult<T> = {
  data: T[] | null
  error: unknown
}

export const DEFAULT_LEXICARDS_PAGE_SIZE = 1000

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<PageResult<T>>,
  pageSize: number = DEFAULT_LEXICARDS_PAGE_SIZE,
): Promise<T[]> {
  const safePageSize = Math.max(1, Math.floor(pageSize))
  const rows: T[] = []
  let from = 0

  while (true) {
    const to = from + safePageSize - 1
    const { data, error } = await fetchPage(from, to)

    if (error) {
      throw error
    }

    const pageRows = data || []
    rows.push(...pageRows)

    if (pageRows.length < safePageSize) {
      break
    }

    from += safePageSize
  }

  return rows
}

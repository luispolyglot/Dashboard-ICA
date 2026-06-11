type BuildPlaylistItemsByPlaylistIdParams<TItem> = {
  items: TItem[]
  getPlaylistId: (item: TItem) => string
  getSortOrder: (item: TItem) => number
  getCreatedAt: (item: TItem) => string | null | undefined
}

export function buildPlaylistItemsByPlaylistId<TItem>({
  items,
  getPlaylistId,
  getSortOrder,
  getCreatedAt,
}: BuildPlaylistItemsByPlaylistIdParams<TItem>): Map<string, TItem[]> {
  const map = new Map<string, TItem[]>()

  for (const item of items) {
    const playlistId = getPlaylistId(item)
    const list = map.get(playlistId) || []
    list.push(item)
    map.set(playlistId, list)
  }

  for (const [playlistId, list] of map.entries()) {
    list.sort((a, b) => {
      const aSortOrder = getSortOrder(a)
      const bSortOrder = getSortOrder(b)

      if (aSortOrder === bSortOrder) {
        const aTime = new Date(getCreatedAt(a) || 0).getTime()
        const bTime = new Date(getCreatedAt(b) || 0).getTime()
        if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0
        if (Number.isNaN(aTime)) return 1
        if (Number.isNaN(bTime)) return -1
        return aTime - bTime
      }

      return aSortOrder - bSortOrder
    })

    map.set(playlistId, list)
  }

  return map
}

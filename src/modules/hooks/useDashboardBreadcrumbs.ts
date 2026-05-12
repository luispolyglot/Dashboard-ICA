import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { DASHBOARD_LABELS } from '../routes/paths'
import { fetchMasterNoteById } from '../services/masterNotes'

type BreadcrumbItem = {
  href: string
  label: string
  current: boolean
}

export function useDashboardBreadcrumbs(): BreadcrumbItem[] {
  const location = useLocation()
  const [masterNoteLabel, setMasterNoteLabel] = useState<string | null>(null)

  useEffect(() => {
    const path = location.pathname
    const match = path.match(/^\/master-notes\/note\/([^/]+)/)

    if (!match) {
      setMasterNoteLabel(null)
      return
    }

    let active = true
    const noteId = match[1]

    void fetchMasterNoteById(noteId)
      .then((note) => {
        if (!active) return
        if (!note?.name) {
          setMasterNoteLabel(DASHBOARD_LABELS['/master-notes/note'])
          return
        }

        const formatted = note.name
          .replace(/^nota maestra:\s*/i, 'Nota Maestra ')
          .trim()

        setMasterNoteLabel(formatted || DASHBOARD_LABELS['/master-notes/note'])
      })
      .catch(() => {
        if (!active) return
        setMasterNoteLabel(DASHBOARD_LABELS['/master-notes/note'])
      })

    return () => {
      active = false
    }
  }, [location.pathname])

  return useMemo(() => {
    const path = location.pathname

    if (path === '/') {
      return [{ href: '/', label: '✦ Dashboard ICA', current: true }]
    }

    const isMasterNoteDetail = /^\/master-notes\/note\/[^/]+$/.test(path)
    const isMasterNoteActivate =
      /^\/master-notes\/note\/[^/]+\/activate\/[^/]+$/.test(path)

    if (isMasterNoteDetail) {
      return [
        { href: '/', label: DASHBOARD_LABELS['/'], current: false },
        {
          href: '/master-notes',
          label: DASHBOARD_LABELS['/master-notes'],
          current: false,
        },
        {
          href: path,
          label: masterNoteLabel || DASHBOARD_LABELS['/master-notes/note'],
          current: true,
        },
      ]
    }

    if (isMasterNoteActivate) {
      const notePath = path.split('/activate/')[0]
      return [
        { href: '/', label: DASHBOARD_LABELS['/'], current: false },
        {
          href: '/master-notes',
          label: DASHBOARD_LABELS['/master-notes'],
          current: false,
        },
        {
          href: notePath,
          label: masterNoteLabel || DASHBOARD_LABELS['/master-notes/note'],
          current: false,
        },
        {
          href: path,
          label: DASHBOARD_LABELS['/master-notes/note/activate'],
          current: true,
        },
      ]
    }

    const exactLabel = DASHBOARD_LABELS[path]
    const dynamicLabel = exactLabel
      ? null
      : Object.entries(DASHBOARD_LABELS)
          .sort((a, b) => b[0].length - a[0].length)
          .find(([basePath]) => path.startsWith(`${basePath}/`))?.[1]

    const label = exactLabel || dynamicLabel || path
    return [
      { href: '/', label: DASHBOARD_LABELS['/'], current: false },
      { href: path, label, current: true },
    ]
  }, [location.pathname, masterNoteLabel])
}

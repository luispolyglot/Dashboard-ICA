import { supabase } from '@/lib/supabase'
import type { MasterNote } from '../types'

const DB_NAME = 'dashboard-ica-offline'
const DB_VERSION = 2
const CLOSED_NOTES_STORE = 'master-notes-closed'
const CLOSED_NOTES_AUDIO_STORE = 'master-notes-closed-audio'

type OfflineClosedMasterNoteAudioRecord = {
  id: string
  noteId: string
  userId: string
  noteUpdatedAt: string
  closeType: 'final' | 'temporal'
  mimeType: string
  blob: Blob
  sizeBytes: number
  cachedAt: string
}

export type OfflineClosedMasterNote = {
  noteId: string
  userId: string
  name: string
  state: 'closed'
  closeType: 'final' | 'temporal'
  closedLevel: string | null
  totalDurationMs: number
  finalAudioPath: string | null
  targetLang: string | null
  nativeLang: string | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  cachedAt: string
  audioAvailable?: boolean
}

function isBrowserIndexedDbAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined'
}

function getCurrentIsoNow(): string {
  return new Date().toISOString()
}

function getAudioRecordId(userId: string, noteId: string): string {
  return `${userId}:${noteId}`
}

async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id || null
}

async function openOfflineDb(): Promise<IDBDatabase | null> {
  if (!isBrowserIndexedDbAvailable()) return null

  return await new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(CLOSED_NOTES_STORE)) {
        const store = db.createObjectStore(CLOSED_NOTES_STORE, {
          keyPath: 'noteId',
        })
        store.createIndex('by_user', 'userId', { unique: false })
        store.createIndex('by_user_target_native', ['userId', 'targetLang', 'nativeLang'], {
          unique: false,
        })
        store.createIndex('by_user_closed_at', ['userId', 'closedAt'], {
          unique: false,
        })
      }

      if (!db.objectStoreNames.contains(CLOSED_NOTES_AUDIO_STORE)) {
        const audioStore = db.createObjectStore(CLOSED_NOTES_AUDIO_STORE, {
          keyPath: 'id',
        })
        audioStore.createIndex('by_user', 'userId', { unique: false })
        audioStore.createIndex('by_user_note', ['userId', 'noteId'], { unique: true })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB'))
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Fallo de IndexedDB'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('Transaccion fallida'))
    transaction.onabort = () => reject(transaction.error || new Error('Transaccion abortada'))
  })
}

function mapClosedNoteToOfflineRecord(note: MasterNote, userId: string): OfflineClosedMasterNote {
  return {
    noteId: note.id,
    userId,
    name: note.name,
    state: 'closed',
    closeType: note.close_type,
    closedLevel: note.closed_level,
    totalDurationMs: note.total_duration_ms,
    finalAudioPath: note.final_audio_path,
    targetLang: note.target_lang,
    nativeLang: note.native_lang,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    closedAt: note.closed_at,
    cachedAt: getCurrentIsoNow(),
  }
}

export async function syncClosedMasterNotesOfflineSnapshot(
  allFetchedNotes: MasterNote[],
  targetLang?: string,
  nativeLang?: string,
): Promise<void> {
  const userId = await getCurrentUserId()
  if (!userId) return

  const db = await openOfflineDb()
  if (!db) return

  try {
    const closedNotes = allFetchedNotes.filter((note) => note.state === 'closed')
    const closedNoteIds = new Set(closedNotes.map((note) => note.id))

    const tx = db.transaction([CLOSED_NOTES_STORE, CLOSED_NOTES_AUDIO_STORE], 'readwrite')
    const store = tx.objectStore(CLOSED_NOTES_STORE)
    const audioStore = tx.objectStore(CLOSED_NOTES_AUDIO_STORE)
    const existing = await requestToPromise(store.getAll()) as OfflineClosedMasterNote[]

    for (const row of existing) {
      if (row.userId !== userId) continue

      const matchesTarget = targetLang ? row.targetLang === targetLang : true
      const matchesNative = nativeLang ? row.nativeLang === nativeLang : true
      if (!matchesTarget || !matchesNative) continue

      if (!closedNoteIds.has(row.noteId)) {
        store.delete(row.noteId)
        audioStore.delete(getAudioRecordId(userId, row.noteId))
      }
    }

    for (const note of closedNotes) {
      const record = mapClosedNoteToOfflineRecord(note, userId)
      store.put(record)
    }

    await transactionDone(tx)
  } finally {
    db.close()
  }
}

export async function listOfflineClosedMasterNotes(): Promise<OfflineClosedMasterNote[]> {
  const userId = await getCurrentUserId()
  if (!userId) return []

  const db = await openOfflineDb()
  if (!db) return []

  try {
    const tx = db.transaction([CLOSED_NOTES_STORE, CLOSED_NOTES_AUDIO_STORE], 'readonly')
    const store = tx.objectStore(CLOSED_NOTES_STORE)
    const audioStore = tx.objectStore(CLOSED_NOTES_AUDIO_STORE)
    const allRows = await requestToPromise(store.getAll()) as OfflineClosedMasterNote[]
    const audioRows = await requestToPromise(audioStore.getAll()) as OfflineClosedMasterNoteAudioRecord[]

    const audioByNoteId = new Map<string, OfflineClosedMasterNoteAudioRecord>()
    for (const row of audioRows) {
      if (row.userId !== userId) continue
      audioByNoteId.set(row.noteId, row)
    }

    const rows = allRows
      .filter((row) => row.userId === userId)
      .map((row) => {
        const audio = audioByNoteId.get(row.noteId)
        const audioAvailable = Boolean(
          audio
          && audio.noteUpdatedAt === row.updatedAt
          && audio.closeType === row.closeType,
        )

        return {
          ...row,
          audioAvailable,
        }
      })
      .sort((a, b) => {
        const aTime = new Date(a.closedAt || a.createdAt || 0).getTime()
        const bTime = new Date(b.closedAt || b.createdAt || 0).getTime()
        if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0
        if (Number.isNaN(aTime)) return 1
        if (Number.isNaN(bTime)) return -1
        return bTime - aTime
      })

    await transactionDone(tx)
    return rows
  } finally {
    db.close()
  }
}

export async function getOfflineClosedMasterNoteAudio(note: MasterNote): Promise<Blob | null> {
  if (note.state !== 'closed') return null

  const userId = await getCurrentUserId()
  if (!userId) return null

  const db = await openOfflineDb()
  if (!db) return null

  try {
    const tx = db.transaction(CLOSED_NOTES_AUDIO_STORE, 'readonly')
    const store = tx.objectStore(CLOSED_NOTES_AUDIO_STORE)
    const recordId = getAudioRecordId(userId, note.id)
    const row = await requestToPromise(
      store.get(recordId),
    ) as OfflineClosedMasterNoteAudioRecord | undefined

    await transactionDone(tx)

    if (!row) return null
    if (row.noteUpdatedAt !== note.updated_at) return null
    if (row.closeType !== note.close_type) return null
    return row.blob
  } finally {
    db.close()
  }
}

export async function upsertOfflineClosedMasterNoteAudio(
  note: MasterNote,
  blob: Blob,
): Promise<void> {
  if (note.state !== 'closed') return

  const userId = await getCurrentUserId()
  if (!userId) return

  const db = await openOfflineDb()
  if (!db) return

  try {
    const tx = db.transaction(CLOSED_NOTES_AUDIO_STORE, 'readwrite')
    const store = tx.objectStore(CLOSED_NOTES_AUDIO_STORE)
    const recordId = getAudioRecordId(userId, note.id)
    const mimeType = blob.type || 'audio/wav'

    const record: OfflineClosedMasterNoteAudioRecord = {
      id: recordId,
      noteId: note.id,
      userId,
      noteUpdatedAt: note.updated_at,
      closeType: note.close_type,
      mimeType,
      blob,
      sizeBytes: blob.size,
      cachedAt: getCurrentIsoNow(),
    }

    store.put(record)
    await transactionDone(tx)
  } finally {
    db.close()
  }
}

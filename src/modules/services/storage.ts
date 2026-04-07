import type { BridgeStorage } from '../types'

const memoryStore = new Map<string, string>()

function getBridgeStorage(): BridgeStorage | null {
  if (typeof window === 'undefined' || !window.storage) {
    return null
  }

  return window.storage
}

function getLocal(key: string) {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem(key)
  }
  return memoryStore.get(key) ?? null
}

function setLocal(key: string, value: string) {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(key, value)
    return
  }
  memoryStore.set(key, value)
}

export async function loadData<T>(key: string, fallback: T): Promise<T> {
  try {
    const bridgeStorage = getBridgeStorage()
    if (bridgeStorage) {
      const r = await bridgeStorage.get(key)
      return r ? JSON.parse(r.value) : fallback
    }
    const value = getLocal(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

export async function saveData<T>(key: string, value: T): Promise<void> {
  try {
    const json = JSON.stringify(value)
    const bridgeStorage = getBridgeStorage()
    if (bridgeStorage) {
      await bridgeStorage.set(key, json)
      return
    }
    setLocal(key, json)
  } catch (error) {
    console.error(error)
  }
}

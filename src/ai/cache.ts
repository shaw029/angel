/**
 * IndexedDB metadata store for model cache state.
 *
 * Transformers.js caches model weights via the browser Cache API.
 * This module tracks *whether* a model has been successfully downloaded
 * so we can suppress the progress UI on subsequent loads.
 */

const DB_NAME = 'ca-runtime'
const DB_VERSION = 1
const STORE = 'model-cache'

interface CacheRecord {
  key: string            // `${modelId}:${device}`
  modelId: string
  device: 'webgpu' | 'wasm'
  cachedAt: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror  = () => reject(req.error)
  })
}

function dbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror  = () => reject(req.error)
  })
}

function dbPut(db: IDBDatabase, record: CacheRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(record)
    req.onsuccess = () => resolve()
    req.onerror  = () => reject(req.error)
  })
}

export async function isCached(modelId: string, device: 'webgpu' | 'wasm'): Promise<boolean> {
  try {
    const db = await openDB()
    const record = await dbGet<CacheRecord>(db, `${modelId}:${device}`)
    return record !== undefined
  } catch {
    return false
  }
}

export async function markCached(modelId: string, device: 'webgpu' | 'wasm'): Promise<void> {
  try {
    const db = await openDB()
    await dbPut(db, { key: `${modelId}:${device}`, modelId, device, cachedAt: Date.now() })
  } catch {
    // Non-critical — worst case the progress bar shows again on next load
  }
}


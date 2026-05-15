const DB_NAME    = 'ca-memory'
const DB_VERSION = 2

export const STORE = {
  PATTERNS:          'patterns',
  WEEKLY_SUMMARIES:  'weekly-summaries',
  COGNITIVE_PROFILE: 'cognitive-profile',
} as const

// ─── Singleton ────────────────────────────────────────────────────────────────

let _db: Promise<IDBDatabase> | null = null

export function openMemoryDB(): Promise<IDBDatabase> {
  if (_db) return _db
  _db = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = (event) => {
      const db         = (event.target as IDBOpenDBRequest).result
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion

      // v1 stores — created on fresh install or migration from nothing
      if (oldVersion < 1) {
        db.createObjectStore(STORE.PATTERNS,         { keyPath: 'key'  })
        db.createObjectStore(STORE.WEEKLY_SUMMARIES, { keyPath: 'week' })
      }

      // v2 stores — additive migration; safe to run on existing v1 databases
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(STORE.COGNITIVE_PROFILE)) {
          db.createObjectStore(STORE.COGNITIVE_PROFILE, { keyPath: 'id' })
        }
      }
    }

    req.onsuccess  = ()  => resolve((req as IDBOpenDBRequest).result)
    req.onerror    = ()  => { _db = null; reject(req.error) }
    req.onblocked  = ()  => reject(new Error('IDB blocked'))
  })
  return _db
}

// ─── Promise wrappers ─────────────────────────────────────────────────────────

export function dbGet<T>(
  db:    IDBDatabase,
  store: string,
  key:   IDBValidKey,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror   = () => reject(req.error)
  })
}

export function dbPut(
  db:    IDBDatabase,
  store: string,
  value: unknown,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).put(value)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

export function dbGetAll<T>(
  db:    IDBDatabase,
  store: string,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror   = () => reject(req.error)
  })
}

export function dbGetAllKeys(
  db:    IDBDatabase,
  store: string,
): Promise<IDBValidKey[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAllKeys()
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

export function dbDelete(
  db:    IDBDatabase,
  store: string,
  key:   IDBValidKey,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).delete(key)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

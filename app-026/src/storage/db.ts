/** 轻量 IndexedDB Promise 封装（无第三方依赖）。全部数据本地存储，不上传唱词。 */

const DB_NAME = 'opera-teleprompter'
const DB_VERSION = 1

export const STORE_SCRIPTS = 'scripts'
export const STORE_TEMPLATES = 'templates'
export const STORE_SETTINGS = 'settings'
export const STORE_PRACTICE = 'practice'

let dbPromise: Promise<IDBDatabase> | null = null

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_SCRIPTS)) db.createObjectStore(STORE_SCRIPTS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE_TEMPLATES)) db.createObjectStore(STORE_TEMPLATES, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) db.createObjectStore(STORE_SETTINGS)
      if (!db.objectStoreNames.contains(STORE_PRACTICE)) db.createObjectStore(STORE_PRACTICE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
  return dbPromise
}

function runReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

export const idb = {
  async get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
    const db = await openDb()
    return runReq(db.transaction(store, 'readonly').objectStore(store).get(key))
  },
  async put(store: string, value: unknown, key?: IDBValidKey): Promise<void> {
    const db = await openDb()
    const os = db.transaction(store, 'readwrite').objectStore(store)
    await runReq(key !== undefined ? os.put(value, key) : os.put(value))
  },
  async delete(store: string, key: IDBValidKey): Promise<void> {
    const db = await openDb()
    await runReq(db.transaction(store, 'readwrite').objectStore(store).delete(key))
  },
  async getAll<T>(store: string): Promise<T[]> {
    const db = await openDb()
    return runReq(db.transaction(store, 'readonly').objectStore(store).getAll()) as Promise<T[]>
  },
}

export interface TxOps {
  put: (store: string, value: unknown, key?: IDBValidKey) => Promise<void>
  delete: (store: string, key: IDBValidKey) => Promise<void>
}

/**
 * 跨 store 单事务批量写：任一操作失败即 abort，全部改动回滚（IndexedDB 事务原生保证），
 * 用于导入等「不允许只进来一半」的场景。
 * 注意：fn 内只能 await 本事务的 put/delete——等待外部 Promise 会让事务提前提交。
 */
export async function idbTx(stores: string[], fn: (ops: TxOps) => Promise<void>): Promise<void> {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    const ops: TxOps = {
      put: async (store, value, key) => {
        const os = tx.objectStore(store)
        await runReq(key !== undefined ? os.put(value, key) : os.put(value))
      },
      delete: async (store, key) => {
        await runReq(tx.objectStore(store).delete(key))
      },
    }
    fn(ops).catch(() => {
      // fn 内任何一步抛错：回滚整个事务（onabort 负责 reject）
      try {
        tx.abort()
      } catch {
        /* 事务可能已结束，onerror/onabort 会 settle */
      }
    })
  })
}

export type KeyAction =
  | 'playPause'
  | 'speedUp'
  | 'speedDown'
  | 'prevSegment'
  | 'nextSegment'
  | 'toggleLoop'
  | 'skipHold'
  | 'unlock'
  | 'jumpSegment' // 数字键 1~9 固定触发，不参与自定义

export const KEY_ACTIONS: { action: RemappableAction; label: string }[] = [
  { action: 'playPause', label: '播放 / 暂停' },
  { action: 'speedUp', label: '加速' },
  { action: 'speedDown', label: '减速' },
  { action: 'prevSegment', label: '上一段' },
  { action: 'nextSegment', label: '下一段' },
  { action: 'toggleLoop', label: '循环本段' },
  { action: 'skipHold', label: '跳过过门' },
  { action: 'unlock', label: '解锁 / 退出锁定' },
]

export type RemappableAction = Exclude<KeyAction, 'jumpSegment'>
export type Keymap = Record<RemappableAction, string>

export const DEFAULT_KEYMAP: Keymap = {
  playPause: ' ',
  speedUp: 'ArrowUp',
  speedDown: 'ArrowDown',
  prevSegment: 'ArrowLeft',
  nextSegment: 'ArrowRight',
  toggleLoop: 'l',
  skipHold: 's',
  unlock: 'Escape',
}

const STORE_KEY = 'otp-keymap-v1'

/** localStorage 安全访问（jsdom/隐私模式等无 localStorage 时退化为内存） */
const memStore = new Map<string, string>()
function storageGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : (memStore.get(key) ?? null)
  } catch {
    return memStore.get(key) ?? null
  }
}
function storageSet(key: string, value: string) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
    else memStore.set(key, value)
  } catch {
    memStore.set(key, value)
  }
}
function storageRemove(key: string) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key)
    else memStore.delete(key)
  } catch {
    memStore.delete(key)
  }
}

export function loadKeymap(): Keymap {
  try {
    const raw = storageGet(STORE_KEY)
    if (!raw) return { ...DEFAULT_KEYMAP }
    const parsed = JSON.parse(raw) as Partial<Keymap>
    return { ...DEFAULT_KEYMAP, ...parsed }
  } catch {
    return { ...DEFAULT_KEYMAP }
  }
}

export function saveKeymap(map: Keymap) {
  storageSet(STORE_KEY, JSON.stringify(map))
}

export function resetKeymap() {
  storageRemove(STORE_KEY)
}

export function normalizeKey(e: KeyboardEvent): string {
  if (e.key === ' ') return ' '
  if (e.key.length === 1) return e.key.toLowerCase()
  return e.key // ArrowUp / Escape / Enter ...
}

export interface KeyHit {
  action: KeyAction
  digit?: number
}

/**
 * 键 → 动作。数字键 1~9 固定映射「跳段」（不参与自定义）。
 */
export function actionForKey(e: KeyboardEvent, map: Keymap): KeyHit | null {
  const key = normalizeKey(e)
  if (/^[1-9]$/.test(key)) return { action: 'jumpSegment', digit: Number(key) }
  for (const action of Object.keys(map) as RemappableAction[]) {
    if (map[action] === key) return { action }
  }
  return null
}

export function keyLabel(key: string): string {
  if (key === ' ') return 'Space'
  return key
}

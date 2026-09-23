/**
 * 遥控：同屏双端（同一浏览器多窗口/标签）经 BroadcastChannel 通信。
 * 配对码 4 位，频道名含配对码；提词端广播状态，遥控端发送指令。
 */

export type RemoteCommand =
  | { type: 'toggle' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'speed'; dir: 1 | -1 }
  | { type: 'segment'; dir: 1 | -1 }
  | { type: 'jump'; index: number } // 段序号，从 0 开始
  | { type: 'skipHold' }
  | { type: 'loop' }

export interface RemoteStatus {
  playing: boolean
  holding: boolean
  holdRemaining: number
  line: number
  lineCount: number
  segment: number
  segmentCount: number
  speed: number
  loop: boolean
}

interface RemoteMessage {
  __otp: true
  kind: 'cmd' | 'status'
  payload: RemoteCommand | RemoteStatus
}

export const remoteChannelName = (code: string) => `otp-remote-${code.trim().toUpperCase()}`

export function openChannel(code: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  try {
    return new BroadcastChannel(remoteChannelName(code))
  } catch {
    return null
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function genRemoteCode(): string {
  let s = ''
  for (let i = 0; i < 4; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return s
}

export const REMOTE_CODE_KEY = 'otp-remote-code'

export function loadRemoteCode(): string {
  try {
    const v = localStorage.getItem(REMOTE_CODE_KEY)
    if (v && /^[A-Z0-9]{4}$/.test(v)) return v
  } catch {
    /* ignore */
  }
  const code = genRemoteCode()
  saveRemoteCode(code)
  return code
}

export function saveRemoteCode(code: string) {
  try {
    localStorage.setItem(REMOTE_CODE_KEY, code.trim().toUpperCase())
  } catch {
    /* ignore */
  }
}

export function isRemoteCommand(m: unknown): m is RemoteMessage & { kind: 'cmd'; payload: RemoteCommand } {
  return !!m && typeof m === 'object' && (m as RemoteMessage).__otp === true && (m as RemoteMessage).kind === 'cmd'
}
export function isRemoteStatus(m: unknown): m is RemoteMessage & { kind: 'status'; payload: RemoteStatus } {
  return !!m && typeof m === 'object' && (m as RemoteMessage).__otp === true && (m as RemoteMessage).kind === 'status'
}

export function postCommand(ch: BroadcastChannel, cmd: RemoteCommand) {
  const msg: RemoteMessage = { __otp: true, kind: 'cmd', payload: cmd }
  ch.postMessage(msg)
}
export function postStatus(ch: BroadcastChannel, st: RemoteStatus) {
  const msg: RemoteMessage = { __otp: true, kind: 'status', payload: st }
  ch.postMessage(msg)
}

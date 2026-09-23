export interface WakeLockSentinelLike {
  release: () => Promise<void>
  addEventListener?: (type: string, fn: () => void) => void
}

type WakeLockNav = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
}

/**
 * 屏幕常亮守卫：获取/释放严格配对，防止 Wake Lock 泄漏耗电。
 * 不支持（或非 HTTPS/localhost）时 acquire 返回 false，由 UI 提示手动设置。
 */
export class WakeLockGuard {
  private sentinel: WakeLockSentinelLike | null = null

  supported(): boolean {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator
  }

  async acquire(): Promise<boolean> {
    if (this.sentinel) return true
    const nav = navigator as WakeLockNav | undefined
    if (!nav || !nav.wakeLock) return false
    try {
      const sentinel = await nav.wakeLock.request('screen')
      sentinel.addEventListener?.('release', () => {
        if (this.sentinel === sentinel) this.sentinel = null
      })
      this.sentinel = sentinel
      return true
    } catch {
      return false
    }
  }

  async release(): Promise<void> {
    const s = this.sentinel
    this.sentinel = null
    if (s) {
      try {
        await s.release()
      } catch {
        /* 已释放则忽略 */
      }
    }
  }

  get active() {
    return this.sentinel != null
  }
}

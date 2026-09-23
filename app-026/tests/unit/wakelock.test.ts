import { describe, expect, it, beforeEach } from 'vitest'
import { WakeLockGuard } from '../../src/engine/wakelock'

beforeEach(() => {
  // 清掉上一 case 的 stub
  const nav = navigator as unknown as Record<string, unknown>
  delete nav.wakeLock
})

describe('Wake Lock（验收：获取与释放正确，无泄漏）', () => {
  it('支持时 acquire 成功、release 真正释放且可再次获取', async () => {
    let released = 0
    const sentinel = {
      release: async () => {
        released++
      },
      addEventListener: (_t: string, _f: () => void) => {},
    }
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: async () => sentinel },
    })

    const g = new WakeLockGuard()
    expect(g.supported()).toBe(true)
    expect(await g.acquire()).toBe(true)
    expect(g.active).toBe(true)

    await g.release()
    expect(released).toBe(1)
    expect(g.active).toBe(false)

    // 释放后可再次获取（不重复持有）
    expect(await g.acquire()).toBe(true)
    expect(await g.acquire()).toBe(true) // 幂等：已持有时直接 true
    await g.release()
    expect(released).toBe(2)
  })

  it('request 拒绝时 acquire 返回 false 而不抛出', async () => {
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: async () => { throw new Error('NotAllowedError') } },
    })
    const g = new WakeLockGuard()
    expect(await g.acquire()).toBe(false)
  })

  it('不支持的环境返回 false（提示手动设置）', async () => {
    const g = new WakeLockGuard()
    expect(g.supported()).toBe(false)
    expect(await g.acquire()).toBe(false)
    await g.release() // 不抛
  })
})

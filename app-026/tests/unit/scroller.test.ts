import { describe, expect, it } from 'vitest'
import { ScrollEngine } from '../../src/engine/scroller'

function makeEngine(opts: { lines?: number; holds?: number[]; lineHeight?: number } = {}) {
  const e = new ScrollEngine()
  e.setLayout({
    lineHeight: opts.lineHeight ?? 50,
    viewport: 400,
    lineCount: opts.lines ?? 100,
    holds: opts.holds ?? [],
  })
  return e
}

/** 以固定帧率喂帧，返回累计时间 */
function runFor(e: ScrollEngine, seconds: number, fps: number): number {
  const dt = 1 / fps
  const steps = Math.round(seconds * fps)
  for (let i = 0; i < steps; i++) e.tick(dt)
  return steps * dt
}

describe('滚动引擎 · dt 累加（验收：60/120fps 每秒滚过行数一致）', () => {
  it('60Hz 与 120Hz 下 1 秒滚过的位移与行数一致', () => {
    const a = makeEngine()
    const b = makeEngine()
    a.setSpeed(120)
    b.setSpeed(120)
    a.play()
    b.play()
    runFor(a, 1, 60)
    runFor(b, 1, 120)
    expect(a.pos).toBeCloseTo(120, 6)
    expect(b.pos).toBeCloseTo(120, 6)
    expect(a.pos / 50).toBeCloseTo(b.pos / 50, 9) // 行数一致
  })

  it('混合帧率（模拟掉帧）速度依然守恒', () => {
    const e = makeEngine()
    e.setSpeed(90)
    e.play()
    const dts = [1 / 60, 1 / 120, 1 / 45, 0.2, 1 / 60] // 含一次大掉帧
    for (const dt of dts) e.tick(dt)
    const total = dts.reduce((s, d) => s + d, 0)
    expect(e.pos).toBeCloseTo(90 * total, 6)
  })
})

describe('过门停顿（验收：5 秒 ±100ms；手动跳过生效）', () => {
  it('5 秒过门：停止 5s±100ms 再继续', () => {
    const holds = new Array(100).fill(0)
    holds[3] = 5
    const e = makeEngine({ holds })
    e.setSpeed(50) // 1 行/秒，1s 后到达第 3 行中心
    e.play()

    let elapsed = 0
    let holdStart = -1
    while (elapsed < 10) {
      e.tick(1 / 60)
      elapsed += 1 / 60
      if (e.state === 'holding' && holdStart < 0) holdStart = elapsed
      if (holdStart >= 0 && e.state === 'playing') break
    }
    expect(holdStart).toBeGreaterThan(0)
    const heldFor = elapsed - holdStart
    expect(heldFor).toBeGreaterThanOrEqual(4.9)
    expect(heldFor).toBeLessThanOrEqual(5.1)
    expect(e.state).toBe('playing')
  })

  it('手动跳过（skipHold）立即恢复滚动', () => {
    const holds = new Array(100).fill(0)
    holds[0] = 5
    const e = makeEngine({ holds })
    e.setSpeed(50)
    e.play()
    e.tick(1 / 60) // 触发停留（此帧已位移 50/60 px）
    expect(e.state).toBe('holding')
    e.skipHold()
    expect(e.state).toBe('playing')
    e.tick(0.5)
    expect(e.pos).toBeCloseTo(50 / 60 + 25, 6)
  })

  it('holdOnCue=false 时不停留；同一行不会重复停留', () => {
    const holds = new Array(100).fill(0)
    holds[0] = 5
    const off = makeEngine({ holds })
    off.holdOnCue = false
    off.play()
    off.tick(0.5)
    expect(off.state).toBe('playing')

    const e = makeEngine({ holds })
    e.setSpeed(50)
    e.play()
    e.tick(1 / 60) // 触发停留并消耗
    e.skipHold()
    e.tick(2)
    expect(e.state).toBe('playing') // 已消费，不再停留
  })
})

describe('段落循环（验收：循环 10 次后位置与耗时符合预期）', () => {
  it('单段循环 10 次：耗时 = 10 × 段长/速度，位置回到段首', () => {
    const e = makeEngine({ lines: 60 })
    // 段：第 10~19 行 → 500px~1000px，段长 500px
    e.seekIndex(10)
    e.setLoopRange({ startPos: 500, endPos: 1000 })
    e.setSpeed(100) // 每圈 5s? 不：500px / 100px/s = 5s
    e.play()

    const ITER = 10
    const expected = ITER * (500 / 100)
    const actual = runFor(e, expected, 100)
    expect(actual).toBeCloseTo(expected, 6)
    expect(e.loopCount).toBe(10)
    expect(e.pos).toBeGreaterThanOrEqual(500)
    expect(e.pos).toBeLessThan(510) // 回到段首附近（半行内）
  })

  it('循环圈内过门标记每圈重新生效（可手动跳过）', () => {
    const holds = new Array(60).fill(0)
    holds[10] = 2
    const e = makeEngine({ lines: 60, holds })
    e.seekIndex(10)
    e.setLoopRange({ startPos: 500, endPos: 1000 })
    e.setSpeed(100)
    e.play()
    let iterations = 0
    e.onLoopIteration = () => {
      iterations++
    }
    // 每帧喂帧并手动跳过停留（模拟连续按空格）
    const steps = Math.round((5 * 3 + 1) * 100)
    for (let i = 0; i < steps; i++) {
      e.tick(1 / 100)
      if (e.state === 'holding') e.skipHold()
    }
    expect(iterations).toBeGreaterThanOrEqual(3)
    expect(e.pos).toBeGreaterThanOrEqual(500)
    expect(e.pos).toBeLessThan(1000)
  })
})

describe('寻址与结束', () => {
  it('seekIndex 精确定位且清除已消费标记（重新停留）', () => {
    const holds = new Array(100).fill(0)
    holds[5] = 3
    const e = makeEngine({ holds })
    e.setSpeed(50)
    e.play()
    e.seekIndex(5)
    e.tick(1 / 60)
    expect(e.state).toBe('holding')
    e.skipHold()
    e.seekIndex(5)
    e.tick(1 / 60)
    expect(e.state).toBe('holding')
  })

  it('滚到结尾进入 ended，pos 夹紧 maxPos；再播放回到开头', () => {
    const e = makeEngine({ lines: 10 })
    e.setSpeed(500)
    e.play()
    runFor(e, 5, 60)
    expect(e.state).toBe('ended')
    expect(e.pos).toBe(e.maxPos)
    e.play()
    expect(e.pos).toBe(0)
    expect(e.state).toBe('playing')
  })
})

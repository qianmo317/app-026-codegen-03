import { describe, expect, it } from 'vitest'
import { visibleRange } from '../../src/engine/virtual'

describe('虚拟列表窗口', () => {
  it('当前行居中，上下留预览行', () => {
    const r = visibleRange(1000, 50, 600, 100 * 50, 6) // 当前行 100
    expect(r.start).toBeLessThanOrEqual(100 - 6)
    expect(r.end).toBeGreaterThanOrEqual(100 + 7)
    expect(r.end - r.start).toBeLessThan(40) // 远小于全量
  })

  it('首尾不越界', () => {
    expect(visibleRange(100, 50, 600, 0, 6)).toMatchObject({ start: 0 })
    const tail = visibleRange(100, 50, 600, 99 * 50, 6)
    expect(tail.end).toBe(100)
    expect(tail.start).toBeGreaterThanOrEqual(0)
  })

  it('空文稿安全', () => {
    expect(visibleRange(0, 50, 600, 0)).toEqual({ start: 0, end: 0 })
  })
})

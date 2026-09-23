import { describe, expect, it } from 'vitest'
import { fitFontSize } from '../../src/engine/autofit'

/** 确定性伪随机 */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 线性测宽：w(text, size) = ratio(text) × size */
function makeLinearMeasurer(ratios: Map<string, number>) {
  return (text: string, size: number) => (ratios.get(text) ?? 100) * size * 0.01
}

describe('自动字号（验收：200 条不同长度唱词 100% 不换行且字号最大）', () => {
  const rnd = mulberry32(20260917)
  const texts: string[] = []
  const ratios = new Map<string, number>()
  for (let i = 0; i < 200; i++) {
    const t = `唱词第${i}行：西皮流水二六快板原板散板导板回龙`.repeat(1 + Math.floor(rnd() * 3)) + i
    texts.push(t)
    ratios.set(t, 120 + Math.floor(rnd() * 800)) // 参考字号 100px 时宽 120~920
  }
  const measure = makeLinearMeasurer(ratios)
  const W = 800

  const size = fitFontSize({ texts, containerWidth: W, minSize: 14, maxSize: 200, measure })

  it('全部 200 行都不换行（宽度 ≤ 容器宽）', () => {
    for (const t of texts) {
      expect(measure(t, size)).toBeLessThanOrEqual(W)
    }
  })

  it('字号尽可能大（再大 1px 就会有行溢出）', () => {
    const maxRatio = Math.max(...texts.map((t) => ratios.get(t)!))
    const expected = Math.floor((W / maxRatio) * 100)
    expect(size).toBe(expected)
    expect(measure(texts.find((t) => ratios.get(t) === maxRatio)!, size + 1)).toBeGreaterThan(W)
  })

  it('二分结果落在 [min, max] 内', () => {
    expect(size).toBeGreaterThanOrEqual(14)
    expect(size).toBeLessThanOrEqual(200)
  })

  it('极窄容器时钳制到 minSize', () => {
    const s = fitFontSize({ texts: texts.slice(0, 5), containerWidth: 10, minSize: 14, maxSize: 200, measure })
    expect(s).toBe(14)
  })

  it('空文本返回 minSize', () => {
    const s = fitFontSize({ texts: [], containerWidth: 800, minSize: 14, maxSize: 200, measure })
    expect(s).toBe(14)
  })
})

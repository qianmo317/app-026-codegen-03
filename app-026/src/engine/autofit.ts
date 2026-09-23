export interface FitOptions {
  texts: string[]
  containerWidth: number
  minSize?: number
  maxSize?: number
  measure: (text: string, fontSize: number) => number
  paddingPerLine?: number
}

/**
 * 自动字号：按容器宽度与最长行做二分，求「最大可读且不换行」的字号（整数 px）。
 * 保证所有行 measure(text, size) + padding ≤ containerWidth（即不换行）。
 */
export function fitFontSize(opts: FitOptions): number {
  const { texts, containerWidth, measure } = opts
  const minSize = opts.minSize ?? 14
  const maxSize = opts.maxSize ?? 200
  const pad = opts.paddingPerLine ?? 0
  if (texts.length === 0 || containerWidth <= 0) return minSize

  const REF = 100
  let longest = texts[0]
  let longestW = -1
  for (const t of texts) {
    const w = measure(t, REF)
    if (w > longestW) {
      longestW = w
      longest = t
    }
  }
  if (longestW <= 0) return maxSize

  const fits = (size: number) => measure(longest, size) + pad <= containerWidth
  if (!fits(minSize)) return minSize

  let lo = minSize
  let hi = maxSize
  let best = minSize
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (fits(mid)) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

/** 用共享 canvas 的 measureText 构造测量函数（需要 DOM） */
export function canvasMeasurer(fontFamily: string, weight = '700') {
  let ctx: CanvasRenderingContext2D | null = null
  return (text: string, size: number): number => {
    if (ctx === null) {
      const c = document.createElement('canvas')
      ctx = c.getContext('2d')
      if (ctx === null) return 0
    }
    ctx.font = `${weight} ${size}px ${fontFamily}`
    return ctx.measureText(text).width
  }
}

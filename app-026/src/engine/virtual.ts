/**
 * 虚拟列表窗口计算：当前行按「视窗中心」确定，上下各渲染预览行（overscan）。
 */
export interface VirtualWindow {
  start: number // 含
  end: number // 不含
}

export function visibleRange(
  lineCount: number,
  lineHeight: number,
  viewport: number,
  pos: number,
  overscan = 6,
): VirtualWindow {
  if (lineCount === 0 || lineHeight <= 0) return { start: 0, end: 0 }
  const centerIdx = Math.round(pos / lineHeight)
  const half = Math.ceil(viewport / lineHeight / 2) + 1
  const start = Math.max(0, centerIdx - half - overscan)
  const end = Math.min(lineCount, centerIdx + half + overscan)
  return { start, end }
}

import type { Script } from '../types'
import type { ScrollEngine } from './scroller'

export interface SegRange {
  title: string
  start: number
  end: number // 不含
  loop?: boolean
  lineIds: string[]
}

/** 计算各唱段在行数组（或按角色过滤后的行数组）中的起止范围 */
export function segmentRanges(script: Script, filter?: (idx: number) => boolean): SegRange[] {
  const indexOfLine = new Map(script.lines.map((l, i) => [l.id, i] as const))
  const out: SegRange[] = []
  for (const seg of script.segments) {
    const idxs = seg.lineIds
      .map((id) => indexOfLine.get(id))
      .filter((v): v is number => v !== undefined)
      .filter((i) => (filter ? filter(i) : true))
    if (idxs.length === 0) continue
    const sorted = filter ? idxs.slice().sort((a, b) => a - b) : idxs
    out.push({ title: seg.title, start: sorted[0], end: sorted[sorted.length - 1] + 1, loop: seg.loop, lineIds: seg.lineIds })
  }
  if (!filter && out.length === 0 && script.lines.length > 0) {
    out.push({ title: '全篇', start: 0, end: script.lines.length, lineIds: script.lines.map((l) => l.id) })
  }
  return out
}

/** 跳转到第 k 段（保持播放状态），自动应用该段的循环标记 */
export function jumpToSegment(engine: ScrollEngine, ranges: SegRange[], k: number): boolean {
  if (!ranges.length) return false
  const kk = Math.max(0, Math.min(ranges.length - 1, k))
  const wasPlaying = engine.state === 'playing'
  engine.seekIndex(ranges[kk].start)
  if (wasPlaying) engine.play()
  const r = ranges[kk]
  engine.setLoopRange(r.loop ? { startPos: engine.posForIndex(r.start), endPos: engine.posForIndex(r.end) } : null)
  return true
}

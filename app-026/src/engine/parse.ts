import type { Cue, Line, Segment } from '../types'
import { DEFAULT_CUE_SECONDS } from '../constants'

const NUM = '(\\d+(?:\\.\\d+)?)'

/** 行内标记语法：【过门5】/【过门:5】/【过门5秒】、【锣鼓】、【停顿3秒】、【注:xxx】 */
const CUE_PATTERNS: { kind: Cue['kind']; re: RegExp }[] = [
  { kind: 'pause', re: new RegExp(`【(?:停顿|间歇)(?:[:：]${NUM}|${NUM}秒?)?】`, 'g') },
  { kind: 'interlude', re: new RegExp(`【过门(?:[:：]${NUM}|${NUM}秒?)?】`, 'g') },
  { kind: 'drum', re: new RegExp(`【(?:锣鼓|亮相)(?:[:：]${NUM}|${NUM}秒?)?】`, 'g') },
  { kind: 'note', re: /【注[:：]([^\】]*)】/g },
]

export interface ParsedResult {
  lines: Line[]
  segments: Segment[]
}

let idSeq = 0
function nextId(prefix: string) {
  idSeq += 1
  return `${prefix}_${idSeq}_${Math.random().toString(36).slice(2, 7)}`
}

/** 解析单行文本：抽取标记、剥离角色前缀「角色：」 */
export function parseContentLine(raw: string): { role?: string; text: string; cues: Cue[] } {
  let text = raw.trim()
  const cues: Cue[] = []

  for (const { kind, re } of CUE_PATTERNS) {
    text = text.replace(re, (match, n1?: string, n2?: string, n3?: string) => {
      if (kind === 'note') {
        // 注意：【注:xxx】只有一个捕获组 → xxx 落在 n1
        cues.push({ id: nextId('c'), kind, label: (n1 ?? '').trim() || undefined })
      } else {
        const secs = parseFloat(n1 ?? n2 ?? '')
        cues.push({
          id: nextId('c'),
          kind,
          seconds: Number.isFinite(secs) && secs > 0 ? secs : DEFAULT_CUE_SECONDS[kind as 'pause'],
        })
      }
      void match
      void n3
      return ' '
    })
  }
  text = text.replace(/\s{2,}/g, ' ').trim()

  // 角色前缀：冒号前 ≤6 字、不含标记括号，才算角色
  let role: string | undefined
  const m = text.match(/^([^【】：：]{1,6})[:：]\s*(.+)$/)
  if (m) {
    role = m[1].trim()
    text = m[2].trim()
  }

  return { role, text, cues }
}

const SEG_HEADER_RE = /^(?:#{1,3}\s*(.+)|【段[:：](.+?)】)\s*$/

/**
 * 粘贴文本 → { lines, segments }。
 * - 「## 标题」或「【段：标题】」为唱段头
 * - 空行自动分段（autoSegmentOnBlank，默认开）
 * - 行内标记见 CUE_PATTERNS
 */
export function parseScriptText(
  raw: string,
  opts: { autoSegmentOnBlank?: boolean } = {},
): ParsedResult {
  const autoBlank = opts.autoSegmentOnBlank !== false
  const lines: Line[] = []
  const segments: Segment[] = []
  let current: Segment | null = null
  let autoIdx = 0

  const closeCurrent = () => {
    if (current && current.lineIds.length >= 0) segments.push(current)
    current = null
  }
  const openSegment = (title?: string) => {
    closeCurrent()
    autoIdx += 1
    current = { id: nextId('s'), title: title?.trim() || `第${autoIdx}段`, lineIds: [] }
  }

  for (const rawLine of raw.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (trimmed === '') {
      if (autoBlank) closeCurrent()
      continue
    }
    const header = trimmed.match(SEG_HEADER_RE)
    if (header) {
      openSegment(header[1] ?? header[2])
      continue
    }
    const parsed = parseContentLine(trimmed)
    const line: Line = {
      id: nextId('l'),
      role: parsed.role,
      text: parsed.text,
      cues: parsed.cues,
      marks: [],
    }
    lines.push(line)
    if (!current) {
      autoIdx += 1
      current = { id: nextId('s'), title: `第${autoIdx}段`, lineIds: [] }
    }
    current.lineIds.push(line.id)
  }
  closeCurrent()

  // 空文本行的过门标记补个占位文本，避免渲染空行
  for (const line of lines) {
    if (line.text === '' && line.cues.some((c) => c.kind !== 'note')) {
      line.text = '—— 过门 ——'
    }
  }
  if (lines.length === 0) {
    const seg: Segment = { id: nextId('s'), title: '第1段', lineIds: [] }
    return { lines, segments: [seg] }
  }
  return { lines, segments }
}

export function buildScriptFromText(
  title: string,
  raw: string,
  style: 'opera' | 'speech',
  troupe?: string,
): { id: string; title: string; troupe?: string; lines: Line[]; segments: Segment[]; style: 'opera' | 'speech'; updatedAt: number } {
  const { lines, segments } = parseScriptText(raw)
  return {
    id: `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    troupe,
    lines,
    segments,
    style,
    updatedAt: Date.now(),
  }
}

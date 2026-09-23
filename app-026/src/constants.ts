/** 全局常量：字体、标记、唱段标记类型 */
export const FONT_STACK =
  "-apple-system, 'PingFang SC', 'Noto Sans CJK SC', 'Noto Sans SC', 'Microsoft YaHei', 'Source Han Sans SC', sans-serif"

export interface MarkDef {
  key: string
  label: string
  color: string
}

/** 句子颜色标记（只存 key，展示时映射颜色） */
export const MARK_DEFS: MarkDef[] = [
  { key: 'hard', label: '易错句', color: '#ff5d5d' },
  { key: 'power', label: '需加力', color: '#ffb020' },
  { key: 'drag', label: '需拖腔', color: '#4da3ff' },
]

export const MARK_MAP: Record<string, MarkDef> = Object.fromEntries(
  MARK_DEFS.map((m) => [m.key, m]),
)

import type { CueKind } from './types'

export const HOLDABLE_KINDS: CueKind[] = ['pause', 'interlude', 'drum']

export const KIND_LABELS: Record<CueKind, string> = {
  pause: '停顿',
  interlude: '过门',
  drum: '锣鼓',
  note: '注',
}

export const DEFAULT_CUE_SECONDS: Record<'pause' | 'interlude' | 'drum', number> = {
  pause: 2,
  interlude: 4,
  drum: 2,
}

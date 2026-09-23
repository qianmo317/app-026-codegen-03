import type { Cue, Line } from '../types'
import { DEFAULT_CUE_SECONDS, HOLDABLE_KINDS, KIND_LABELS } from '../constants'

/** 某行需要停留的秒数（过门/锣鼓/停顿之和），note 不停留 */
export function lineHoldSeconds(line: Line): number {
  return line.cues
    .filter((c) => HOLDABLE_KINDS.includes(c.kind))
    .reduce((sum, c) => sum + (c.seconds ?? DEFAULT_CUE_SECONDS[c.kind as 'pause'] ?? 0), 0)
}

/** 停留标记的展示名，如「过门·锣鼓」 */
export function lineHoldLabel(line: Line): string {
  const labels = line.cues
    .filter((c) => HOLDABLE_KINDS.includes(c.kind))
    .map((c) => c.label ?? KIND_LABELS[c.kind])
  return labels.join('·')
}

export function cueLabel(cue: Cue): string {
  if (cue.kind === 'note') return cue.label ? `注:${cue.label}` : '注'
  const name = KIND_LABELS[cue.kind]
  const secs = cue.seconds ?? DEFAULT_CUE_SECONDS[cue.kind]
  return `${name}${secs}s`
}

export function makeCue(kind: Cue['kind'], seconds?: number, label?: string): Cue {
  return {
    id: `c_${Math.random().toString(36).slice(2, 9)}`,
    kind,
    seconds: kind === 'note' ? undefined : (seconds ?? DEFAULT_CUE_SECONDS[kind as 'pause']),
    label,
  }
}

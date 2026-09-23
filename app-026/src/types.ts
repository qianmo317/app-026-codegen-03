export type CueKind = 'pause' | 'interlude' | 'drum' | 'note'

export interface Cue {
  id: string
  kind: CueKind
  seconds?: number
  label?: string
}

export interface Line {
  id: string
  role?: string
  text: string
  cues: Cue[]
  marks: string[]
  note?: string
}

export interface Segment {
  id: string
  title: string
  lineIds: string[]
  loop?: boolean
}

export type ScriptStyle = 'opera' | 'speech'

export interface Script {
  id: string
  title: string
  troupe?: string
  lines: Line[]
  segments: Segment[]
  style: ScriptStyle
  updatedAt: number
}

export type ThemeName = 'dark' | 'light' | 'highContrast'

export interface PromptSettings {
  fontSizePx: number
  autoFit: boolean
  autoScroll: boolean
  speedPxPerSec: number
  theme: ThemeName
  holdOnCue: boolean
  lockStage: boolean
}

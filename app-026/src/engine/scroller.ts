export type PlayState = 'idle' | 'playing' | 'holding' | 'ended'

export interface EngineLayout {
  lineHeight: number
  viewport: number
  lineCount: number
  /** 每行需要停留的秒数（过门等），索引 = 行号 */
  holds: number[]
}

export interface LoopRange {
  startPos: number
  endPos: number
}

/**
 * 滚动引擎：requestAnimationFrame 逐帧累加位移 pos += speed × dt。
 * 不用 CSS 动画 / setInterval，保证 60Hz 与 120Hz 屏每秒滚过的行数一致；
 * 遇到过门/停顿标记进入 holding 状态倒计时，支持手动跳过与单段循环。
 */
export class ScrollEngine {
  pos = 0
  speed = 90 // px/s
  state: PlayState = 'idle'
  holdOnCue = true
  holdRemaining = 0
  holdTotal = 0
  holdLabel = ''
  loopCount = 0
  onLoopIteration: ((count: number) => void) | null = null

  private layout: EngineLayout = { lineHeight: 48, viewport: 400, lineCount: 0, holds: [] }
  private loop: LoopRange | null = null
  private consumed = new Set<number>()
  private lastIdx = -1
  private listeners = new Set<() => void>()

  setLayout(l: EngineLayout) {
    this.layout = l
    this.seekTo(this.pos)
  }

  setSpeed(v: number) {
    this.speed = Math.max(10, Math.min(600, v))
    this.emitChange()
  }

  get speedValue() {
    return this.speed
  }

  setLoopRange(loop: LoopRange | null) {
    if (loop && loop.endPos <= loop.startPos) loop = null
    this.loop = loop
    this.loopCount = 0
    this.emitChange()
  }

  get looping() {
    return this.loop != null
  }

  get maxPos() {
    const { lineHeight, lineCount } = this.layout
    return Math.max(0, (lineCount - 1) * lineHeight)
  }

  indexAt(pos = this.pos) {
    const { lineHeight, lineCount } = this.layout
    if (lineHeight <= 0 || lineCount === 0) return 0
    return Math.max(0, Math.min(lineCount - 1, Math.round(pos / lineHeight)))
  }

  posForIndex(idx: number) {
    return idx * this.layout.lineHeight
  }

  play() {
    if (this.state === 'ended') this.seekTo(0)
    this.state = 'playing'
    this.lastIdx = -1 // 强制重新评估当前行（可能在段首立刻触发停留）
    this.emitChange()
  }

  pause() {
    if (this.state === 'playing' || this.state === 'holding') {
      this.state = 'idle'
      this.emitChange()
    }
  }

  toggle() {
    if (this.state === 'playing' || this.state === 'holding') this.pause()
    else this.play()
  }

  /** 手动跳过停留（空格） */
  skipHold() {
    if (this.state === 'holding') {
      this.holdRemaining = 0
      this.state = 'playing'
      this.emitChange()
    }
  }

  seekTo(pos: number) {
    this.pos = Math.max(0, Math.min(this.maxPos, pos))
    this.consumed.clear()
    this.lastIdx = -1 // 强制下帧重新评估当前行（落地行若有标记且在播放，则触发停留）
    if (this.state === 'ended') this.state = 'idle'
    this.emitChange()
  }

  seekIndex(idx: number, opts: { play?: boolean } = {}) {
    const clamped = Math.max(0, Math.min(this.layout.lineCount - 1, idx))
    this.seekTo(this.posForIndex(clamped))
    if (opts.play) this.play()
  }

  nudge(deltaPx: number) {
    this.seekTo(this.pos + deltaPx)
  }

  /** 每帧推进；dt 单位秒。纯函数式（除内部状态），可在测试中手动喂帧。 */
  tick(dt: number): void {
    if (dt <= 0) return
    if (this.state === 'holding') {
      this.holdRemaining -= dt
      if (this.holdRemaining <= 0) {
        this.holdRemaining = 0
        this.state = 'playing'
        this.emitChange()
      }
      return
    }
    if (this.state !== 'playing') return

    this.pos += this.speed * dt

    const idx = this.indexAt()
    if (idx !== this.lastIdx) {
      this.lastIdx = idx
      const hold = this.layout.holds[idx] ?? 0
      if (this.holdOnCue && hold > 0 && !this.consumed.has(idx)) {
        this.consumed.add(idx)
        this.state = 'holding'
        this.holdTotal = hold
        this.holdRemaining = hold
        this.emitChange()
        return
      }
    }

    if (this.loop && this.pos >= this.loop.endPos) {
      this.pos = this.loop.startPos
      this.loopCount += 1
      this.consumed.clear()
      this.lastIdx = -1 // 回段首后重新评估（段首有过门则每圈都停留）
      this.onLoopIteration?.(this.loopCount)
      this.emitChange()
      return
    }

    if (this.pos >= this.maxPos) {
      this.pos = this.maxPos
      this.state = 'ended'
      this.emitChange()
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private emitChange() {
    this.listeners.forEach((f) => f())
  }
}

/**
 * rAF 驱动器：dt 用真实时间戳差值累加，并夹紧 250ms（切后台回来不跳位）。
 */
export function attachDriver(engine: ScrollEngine): () => void {
  let raf = 0
  let last = performance.now()
  const frame = (t: number) => {
    const dt = Math.min(250, Math.max(0, t - last)) / 1000
    last = t
    engine.tick(dt)
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  return () => cancelAnimationFrame(raf)
}

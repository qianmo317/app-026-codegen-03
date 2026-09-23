import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { PromptSettings, Script } from '../types'
import type { ScrollEngine } from '../engine/scroller'
import { fitFontSize, canvasMeasurer } from '../engine/autofit'
import { FONT_STACK, MARK_MAP } from '../constants'

const measurer = canvasMeasurer(FONT_STACK)
const PAD_X = 24

interface UiSnapshot {
  idx: number
  state: ScrollEngine['state']
  holdSec: number
  loopCount: number
}

export interface PromptCanvasProps {
  script: Script
  settings: PromptSettings
  engine: ScrollEngine
  /** 分栏模式：只渲染这些行（按原行号） */
  lineFilter?: Set<number>
  practice?: Record<string, number>
  onLongPress?: () => void
  testId?: string
}

/**
 * 提词视窗：虚拟列表 + 当前行高亮（等宽高亮条）+ 视窗居中 + 触屏手势。
 * transform 每帧直接写 DOM（不走 React state），只有离散状态变化才触发渲染。
 */
export function PromptCanvas({
  script,
  settings,
  engine,
  lineFilter,
  practice,
  onLongPress,
  testId,
}: PromptCanvasProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState({ w: 800, h: 600 })
  const [ui, setUi] = useState<UiSnapshot>({ idx: 0, state: engine.state, holdSec: 0, loopCount: 0 })

  // 视窗尺寸
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setVp({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setVp({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const lines = useMemo(() => {
    if (!lineFilter) return script.lines.map((l, i) => ({ line: l, origIdx: i }))
    return script.lines
      .map((l, i) => ({ line: l, origIdx: i }))
      .filter((x) => lineFilter.has(x.origIdx))
  }, [script, lineFilter])

  const texts = useMemo(() => lines.map((x) => (x.line.role ? `${x.line.role}：${x.line.text}` : x.line.text)), [lines])

  // 自动字号：最大可读且不换行（二分），否则手动字号
  const fontSize = useMemo(() => {
    if (settings.autoFit) {
      return fitFontSize({
        texts,
        containerWidth: Math.max(80, vp.w - PAD_X * 2),
        minSize: 14,
        maxSize: 200,
        measure: measurer,
      })
    }
    return settings.fontSizePx
  }, [settings.autoFit, settings.fontSizePx, texts, vp.w])

  const lineHeight = Math.max(20, Math.round(fontSize * 1.55))

  // 引擎布局：行高、视窗、停留秒数（过滤后的索引）
  useEffect(() => {
    engine.setLayout({
      lineHeight,
      viewport: vp.h,
      lineCount: lines.length,
      holds: lines.map((x) => {
        const s = x.line.cues.filter((c) => c.kind !== 'note').reduce((acc, c) => acc + (c.seconds ?? 0), 0)
        return s
      }),
    })
  }, [engine, lineHeight, vp.h, lines])

  // 渲染循环：每帧写 transform；离散变化才 setState
  useEffect(() => {
    let raf = 0
    const frame = () => {
      const el = contentRef.current
      if (el) {
        const ty = (vp.h - lineHeight) / 2 - engine.pos
        el.style.transform = `translate3d(0, ${ty}px, 0)`
      }
      const holdSec = Math.ceil(engine.holdRemaining * 10) / 10
      const idx = engine.indexAt()
      setUi((prev) => {
        if (prev.idx !== idx || prev.state !== engine.state || prev.holdSec !== holdSec || prev.loopCount !== engine.loopCount) {
          return { idx, state: engine.state, holdSec, loopCount: engine.loopCount }
        }
        return prev
      })
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [engine, vp.h, lineHeight])

  // 手势：单指拖拽滚动；双击播放/暂停；长按回调
  const drag = useRef<{ y: number; moved: boolean } | null>(null)
  const pressTimer = useRef<number | undefined>(undefined)

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!e.isPrimary) return
    drag.current = { y: e.clientY, moved: false }
    if (onLongPress) {
      pressTimer.current = window.setTimeout(() => {
        drag.current = null
        onLongPress()
      }, 600)
    }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current) return
    const dy = e.clientY - drag.current.y
    if (Math.abs(dy) > 4) {
      if (pressTimer.current) {
        window.clearTimeout(pressTimer.current)
        pressTimer.current = undefined
      }
      if (engine.state === 'playing' || engine.state === 'holding') engine.pause() // 手动拖拽时暂停自动滚动
      engine.nudge(-dy)
      drag.current.y = e.clientY
      drag.current.moved = true
    }
  }
  const onPointerUp = () => {
    drag.current = null
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = undefined
    }
  }
  const onDoubleClick = () => engine.toggle()

  // 渲染窗口（基于当前行，天然留出上下预览行）
  const half = Math.ceil(vp.h / lineHeight / 2) + 1
  const start = Math.max(0, ui.idx - half - 6)
  const end = Math.min(lines.length, ui.idx + half + 6)
  const view = lines.slice(start, end)

  return (
    <div
      className="prompt-canvas"
      data-testid={testId ?? 'prompt-canvas'}
      data-state={ui.state}
      ref={boxRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      <div
        ref={contentRef}
        className="prompt-content"
        style={{ fontSize, lineHeight: `${lineHeight}px` }}
        data-fontsize={fontSize}
        data-lineheight={lineHeight}
      >
        {view.map((x, k) => {
          const i = start + k
          const isCurrent = i === ui.idx
          const mark = x.line.marks.map((m) => MARK_MAP[m]).find(Boolean)
          const holdSecs = x.line.cues.filter((c) => c.kind !== 'note').reduce((a, c) => a + (c.seconds ?? 0), 0)
          const pract = practice?.[x.line.id] ?? 0
          return (
            <div
              key={x.line.id}
              className={`pline${isCurrent ? ' current' : ''}`}
              style={{ top: i * lineHeight, height: lineHeight, paddingLeft: PAD_X, paddingRight: PAD_X }}
              data-line-index={x.origIdx}
              data-current={isCurrent || undefined}
              data-marks={x.line.marks.join(',') || undefined}
            >
              {mark && <span className="mark-flag" style={{ background: mark.color }} title={mark.label} />}
              {x.line.role && <span className="prole">{x.line.role}：</span>}
              <span className="ptext">{x.line.text}</span>
              {holdSecs > 0 && <span className="pcue">⏸{holdSecs}s</span>}
              {x.line.note && <span className="pnote" title={x.line.note}>✎</span>}
              {isCurrent && pract > 0 && <span className="ppract" data-testid="practice-badge">已练 {pract} 次</span>}
            </div>
          )
        })}
      </div>

      {ui.state === 'holding' && (
        <div className="hold-overlay" data-testid="hold-overlay" data-remaining={ui.holdSec.toFixed(1)}>
          <span className="hold-label">{engine.holdLabel || '过门'}</span>
          <span className="hold-count">剩余 {ui.holdSec.toFixed(1)}s</span>
          <button
            className="btn btn-small"
            data-testid="btn-skip-hold"
            onClick={(e) => {
              e.stopPropagation()
              engine.skipHold()
            }}
          >
            继续（空格）
          </button>
        </div>
      )}

      {ui.state === 'ended' && (
        <div className="end-overlay" data-testid="end-overlay">
          已到结尾 · 双击或按空格重新开始
        </div>
      )}

      {lineCountHint(lines.length, view.length) && (
        <div className="virtual-hint" data-testid="virtual-hint">
          {view.length} / {lines.length} 行
        </div>
      )}
    </div>
  )
}

function lineCountHint(total: number, rendered: number) {
  return total >= 200 && rendered < total
}

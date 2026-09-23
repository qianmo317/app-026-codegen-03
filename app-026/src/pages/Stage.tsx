import { useEffect, useRef, useState } from 'react'
import { Link } from '../router'
import { useSettingsCtx } from '../App'
import { useEngine, useScript } from '../state/hooks'
import { PromptCanvas } from '../components/PromptCanvas'
import { WakeLockGuard } from '../engine/wakelock'
import { segmentRanges, jumpToSegment } from '../engine/segments'
import { Pause, Play, Plus, Minus, ChevronRight, Lock, X, Contrast } from 'lucide-react'

const HOLD_MS = 2000

export function Stage({ id }: { id: string }) {
  const { settings, patch } = useSettingsCtx()
  const { script } = useScript(id)
  const engine = useEngine(settings)
  const [locked, setLocked] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [wakeOk, setWakeOk] = useState<boolean | null>(null)
  const [pressProgress, setPressProgress] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const wakeRef = useRef<WakeLockGuard>(new WakeLockGuard())
  const hideTimer = useRef<number | undefined>(undefined)
  const pressRaf = useRef<number>(0)
  const autoStarted = useRef(false)

  // 进入演出模式：全屏 + 常亮；退出时正确释放（防泄漏）
  useEffect(() => {
    const g = wakeRef.current
    g.acquire().then(setWakeOk)
    rootRef.current?.requestFullscreen?.().catch(() => {})
    return () => {
      void g.release()
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [])

  // 默认锁定（可用设置控制）
  useEffect(() => {
    if (settings?.lockStage) setLocked(true)
  }, [settings?.lockStage])

  // 控件自动隐藏
  const poke = () => {
    setControlsVisible(true)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), 2500)
  }
  useEffect(() => {
    poke()
    return () => window.clearTimeout(hideTimer.current)
  }, [])

  const autoStartedRef = autoStarted
  useEffect(() => {
    if (script && settings?.autoScroll && !autoStartedRef.current) {
      autoStartedRef.current = true
      engine.play()
    }
  }, [script, settings?.autoScroll, engine, autoStartedRef])

  // 长按 2 秒解锁：进度环
  const startPress = () => {
    if (!locked) return
    const t0 = performance.now()
    cancelAnimationFrame(pressRaf.current)
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / HOLD_MS)
      setPressProgress(p)
      if (p >= 1) {
        setLocked(false)
        setPressProgress(0)
        poke()
        return
      }
      pressRaf.current = requestAnimationFrame(step)
    }
    pressRaf.current = requestAnimationFrame(step)
  }
  const cancelPress = () => {
    cancelAnimationFrame(pressRaf.current)
    setPressProgress(0)
  }

  // Esc 解锁
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && locked) {
        setLocked(false)
        poke()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [locked])

  const changeSpeed = (d: number) => {
    engine.setSpeed(engine.speedValue + d)
    patch({ speedPxPerSec: engine.speedValue }) // 已是调速后的值，勿再加 d
  }

  if (!script || !settings) return <div className="page center">加载中…</div>

  return (
    <div className="stage-root" data-testid="stage-root" ref={rootRef} onPointerMove={poke}>
      <PromptCanvas script={script} settings={settings} engine={engine} />

      {!locked && (
        <div className={`stage-controls${controlsVisible ? '' : ' hidden'}`} data-testid="stage-controls">
          <Link className="tbtn" to={`/prompt/${id}`} aria-label="退出演出模式" data-testid="btn-exit"><X size={18} /></Link>
          <button className="tbtn" data-testid="btn-lock" onClick={() => { setLocked(true); poke() }} aria-label="锁定防误触"><Lock size={16} /></button>
          <button className="tbtn" data-testid="btn-stage-play" onClick={() => engine.toggle()} aria-label="播放暂停">
            {engine.state === 'playing' || engine.state === 'holding' ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button className="tbtn" onClick={() => changeSpeed(-10)} aria-label="减速"><Minus size={16} /></button>
          <button className="tbtn" onClick={() => changeSpeed(10)} aria-label="加速"><Plus size={16} /></button>
          <button className="tbtn" onClick={() => jumpToSegment(engine, segmentRanges(script), curSegOf(engine, script) + 1)} aria-label="下一段"><ChevronRight size={18} /></button>
          <button className="tbtn" onClick={() => patch({ theme: settings.theme === 'highContrast' ? 'dark' : 'highContrast' })} aria-label="高对比切换"><Contrast size={16} /></button>
          {wakeOk === false && <span className="wake-tip muted">屏幕常亮不可用，请手动设置系统不休屏</span>}
        </div>
      )}

      {locked && (
        <div
          className="lock-shield"
          data-testid="lock-shield"
          data-locked="true"
          onPointerDown={startPress}
          onPointerUp={cancelPress}
          onPointerCancel={cancelPress}
          onPointerLeave={cancelPress}
          onContextMenu={(e) => e.preventDefault()}
        >
          <svg className="unlock-ring" data-testid="unlock-ring" viewBox="0 0 64 64" data-progress={pressProgress.toFixed(2)}>
            <circle cx="32" cy="32" r="26" className="ring-bg" />
            <circle
              cx="32" cy="32" r="26"
              className="ring-fg"
              strokeDasharray={2 * Math.PI * 26}
              strokeDashoffset={2 * Math.PI * 26 * (1 - pressProgress)}
            />
          </svg>
          <span className="lock-tip">已锁定 · 长按 2 秒解锁（或按 Esc）</span>
        </div>
      )}
    </div>
  )
}

function curSegOf(engine: ReturnType<typeof useEngine>, script: NonNullable<ReturnType<typeof useScript>['script']>): number {
  const ranges = segmentRanges(script)
  const k = ranges.findIndex((r) => engine.indexAt() >= r.start && engine.indexAt() < r.end)
  return k === -1 ? 0 : k
}

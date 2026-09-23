import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, navigate } from '../router'
import { useSettingsCtx } from '../App'
import { useEngine, usePractice, useScript } from '../state/hooks'
import { PromptCanvas } from '../components/PromptCanvas'
import { ScrollEngine, attachDriver } from '../engine/scroller'
import { actionForKey, loadKeymap, keyLabel } from '../engine/keys'
import type { KeyHit } from '../engine/keys'
import { openChannel, loadRemoteCode, isRemoteCommand, postStatus } from '../engine/remote'
import type { RemoteCommand, RemoteStatus } from '../engine/remote'
import { segmentRanges } from '../engine/segments'
import { MARK_DEFS } from '../constants'
import { Play, Pause, Plus, Minus, ChevronLeft, ChevronRight, Repeat, Maximize, Sun, Moon, Contrast, Columns2, StickyNote, ChevronLeft as Back } from 'lucide-react'

function useEngineSnap(engine: ScrollEngine) {
  const [snap, setSnap] = useState({ idx: 0, state: engine.state, speed: engine.speedValue, loopCount: 0 })
  useEffect(() => {
    let raf = 0
    const frame = () => {
      const idx = engine.indexAt()
      setSnap((prev) =>
        prev.idx !== idx || prev.state !== engine.state || prev.speed !== engine.speedValue || prev.loopCount !== engine.loopCount
          ? { idx, state: engine.state, speed: engine.speedValue, loopCount: engine.loopCount }
          : prev,
      )
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [engine])
  return snap
}

export function Prompt({ id }: { id: string }) {
  const { settings, patch } = useSettingsCtx()
  const { script } = useScript(id)
  const { counts, bump } = usePractice(id)
  const engine = useEngine(settings)
  const snap = useEngineSnap(engine)
  const keymap = useMemo(() => loadKeymap(), [])
  const [dual, setDual] = useState(false)
  const [roleA, setRoleA] = useState<string>('')
  const [roleB, setRoleB] = useState<string>('')
  const [showCards, setShowCards] = useState(false)
  const [remoteCode] = useState(() => loadRemoteCode())
  const containerRef = useRef<HTMLDivElement>(null)

  // 第二引擎（对戏分栏）
  const engineBRef = useRef<ScrollEngine | null>(null)
  if (dual && !engineBRef.current) engineBRef.current = new ScrollEngine()
  const engineB = dual ? engineBRef.current : null
  useEffect(() => {
    if (!engineB) return
    const stop = attachDriver(engineB)
    return stop
  }, [engineB])

  const roles = useMemo(() => {
    if (!script) return []
    return [...new Set(script.lines.map((l) => l.role).filter(Boolean) as string[])]
  }, [script])

  useEffect(() => {
    if (roles.length >= 2 && !roleA && !roleB) {
      setRoleA(roles[0])
      setRoleB(roles[1])
    }
  }, [roles, roleA, roleB])

  const ranges = useMemo(() => (script ? segmentRanges(script) : []), [script])
  const rangesA = useMemo(
    () => (script && dual ? segmentRanges(script, (i) => script.lines[i].role === roleA) : ranges),
    [script, dual, roleA, ranges],
  )
  const rangesB = useMemo(
    () => (script && dual ? segmentRanges(script, (i) => script.lines[i].role === roleB) : ranges),
    [script, dual, roleB, ranges],
  )

  const filterA = useMemo(() => {
    if (!script || !dual) return undefined
    return new Set(script.lines.map((l, i) => (l.role === roleA ? i : -1)).filter((i) => i >= 0))
  }, [script, dual, roleA])
  const filterB = useMemo(() => {
    if (!script || !dual) return undefined
    return new Set(script.lines.map((l, i) => (l.role === roleB ? i : -1)).filter((i) => i >= 0))
  }, [script, dual, roleB])

  const curSegIdx = useMemo(() => {
    const k = rangesA.findIndex((r) => snap.idx >= r.start && snap.idx < r.end)
    return k === -1 ? 0 : k
  }, [rangesA, snap.idx])

  const activeEngines = () => (engineB ? [engine, engineB] : [engine])

  const applyEngines = (fn: (e: ScrollEngine) => void) => activeEngines().forEach(fn)

  // 当前循环段的行 id（ref：回调触发时不能依赖会因四舍五入越界而抖动的 curSegIdx）
  const loopLineIdsRef = useRef<string[]>([])

  const jumpSegment = (k: number) => {
    applyEngines((e) => {
      const rs = e === engineB ? rangesB : rangesA
      if (!rs.length) return
      const kk = Math.max(0, Math.min(rs.length - 1, k))
      const wasPlaying = e.state === 'playing'
      e.seekIndex(rs[kk].start)
      if (wasPlaying) e.play()
      if (e === engine) loopLineIdsRef.current = rs[kk].loop ? rs[kk].lineIds : []
      e.setLoopRange(
        rs[kk].loop ? { startPos: e.posForIndex(rs[kk].start), endPos: e.posForIndex(rs[kk].end) } : null,
      )
    })
  }

  const toggleLoopCurrent = () => {
    const e0 = engine
    const r = rangesA[curSegIdx]
    if (!r) return
    if (e0.looping) {
      applyEngines((e) => e.setLoopRange(null))
      loopLineIdsRef.current = []
    } else {
      applyEngines((e) => {
        const rs = e === engineB ? rangesB : rangesA
        const rr = rs[Math.min(curSegIdx, rs.length - 1)]
        if (rr) {
          if (e === engine) loopLineIdsRef.current = rr.lineIds
          e.setLoopRange({ startPos: e.posForIndex(rr.start), endPos: e.posForIndex(rr.end) })
        }
      })
      void e0
    }
  }

  // 循环计数 → 练习次数
  useEffect(() => {
    engine.onLoopIteration = () => {
      if (loopLineIdsRef.current.length) bump(loopLineIdsRef.current)
    }
    return () => {
      engine.onLoopIteration = null
    }
  }, [engine, bump])

  // 自动开始
  const autoStarted = useRef(false)
  useEffect(() => {
    if (script && settings?.autoScroll && !autoStarted.current) {
      autoStarted.current = true
      engine.play()
    }
  }, [script, settings?.autoScroll, engine])

  // 键盘
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
      const hit: KeyHit | null = actionForKey(e, keymap)
      if (!hit) return
      e.preventDefault()
      handleAction(hit)
    }
    const handleAction = (hit: KeyHit) => {
      switch (hit.action) {
        case 'playPause':
          if (engine.state === 'holding') engine.skipHold()
          else applyEngines((en) => en.toggle())
          break
        case 'skipHold':
          applyEngines((en) => en.skipHold())
          break
        case 'speedUp':
          changeSpeed(10)
          break
        case 'speedDown':
          changeSpeed(-10)
          break
        case 'nextSegment':
          jumpSegment(curSegIdx + 1)
          break
        case 'prevSegment':
          if (snap.idx > rangesA[curSegIdx].start + 1) jumpSegment(curSegIdx)
          else jumpSegment(curSegIdx - 1)
          break
        case 'toggleLoop':
          toggleLoopCurrent()
          break
        case 'jumpSegment':
          if (hit.digit) jumpSegment(hit.digit - 1)
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, engineB, keymap, curSegIdx, snap.idx, rangesA, rangesB])

  const changeSpeed = (d: number) => {
    applyEngines((e) => e.setSpeed(e.speedValue + d))
    patch({ speedPxPerSec: engine.speedValue }) // 已是调速后的值，勿再加 d
  }

  // 遥控接收 + 状态广播
  useEffect(() => {
    const ch = openChannel(remoteCode)
    if (!ch) return
    ch.onmessage = (ev) => {
      const msg = ev.data
      if (!isRemoteCommand(msg)) return
      const cmd: RemoteCommand = msg.payload
      switch (cmd.type) {
        case 'toggle': engine.toggle(); break
        case 'play': engine.play(); break
        case 'pause': engine.pause(); break
        case 'speed': changeSpeed(cmd.dir * 10); break
        case 'segment': jumpSegment(curSegIdx + cmd.dir); break
        case 'jump': jumpSegment(cmd.index); break
        case 'skipHold': engine.skipHold(); break
        case 'loop': toggleLoopCurrent(); break
      }
      void 0
    }
    const timer = window.setInterval(() => {
      const st: RemoteStatus = {
        playing: engine.state === 'playing',
        holding: engine.state === 'holding',
        holdRemaining: engine.holdRemaining,
        line: snap.idx,
        lineCount: script?.lines.length ?? 0,
        segment: curSegIdx,
        segmentCount: rangesA.length,
        speed: engine.speedValue,
        loop: engine.looping,
      }
      postStatus(ch, st)
    }, 800)
    return () => {
      window.clearInterval(timer)
      ch.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteCode, engine, curSegIdx, snap.idx, rangesA.length, script])

  const cycleTheme = () => {
    const next = settings?.theme === 'dark' ? 'light' : settings?.theme === 'light' ? 'highContrast' : 'dark'
    patch({ theme: next })
  }

  const toggleFullscreen = () => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen?.().catch(() => {})
  }

  if (!script || !settings) return <div className="page center">加载中…</div>

  const themeIcon = settings.theme === 'dark' ? <Moon size={16} /> : settings.theme === 'light' ? <Sun size={16} /> : <Contrast size={16} />

  return (
    <div className="prompt-page" ref={containerRef}>
      <header className="prompt-bar">
        <Link className="btn btn-ghost" to={`/script/${id}`} aria-label="返回编辑"><Back size={16} /></Link>
        <span className="prompt-title">{script.title}</span>
        <div className="seg-chips" data-testid="seg-chips">
          {rangesA.map((r, k) => (
            <button
              key={k}
              className={`chip${k === curSegIdx ? ' active' : ''}`}
              data-testid="segment-chip"
              onClick={() => jumpSegment(k)}
              title={r.title}
            >
              {k < 9 ? k + 1 : '·'} {r.title}
            </button>
          ))}
        </div>
        <div className="transport">
          <button className="tbtn" data-testid="btn-prev-seg" onClick={() => jumpSegment(curSegIdx - 1)} aria-label="上一段"><ChevronLeft size={18} /></button>
          <button className="tbtn big" data-testid="btn-play" onClick={() => (snap.state === 'holding' ? engine.skipHold() : engine.toggle())} aria-label="播放暂停">
            {snap.state === 'playing' || snap.state === 'holding' ? <Pause size={22} /> : <Play size={22} />}
          </button>
          <button className="tbtn" data-testid="btn-next-seg" onClick={() => jumpSegment(curSegIdx + 1)} aria-label="下一段"><ChevronRight size={18} /></button>
          <button className="tbtn" data-testid="btn-slower" onClick={() => changeSpeed(-10)} aria-label="减速"><Minus size={16} /></button>
          <span className="speed" data-testid="speed-value">{snap.speed}px/s</span>
          <button className="tbtn" data-testid="btn-faster" onClick={() => changeSpeed(10)} aria-label="加速"><Plus size={16} /></button>
          <button
            className={`tbtn${engine.looping ? ' on' : ''}`}
            data-testid="btn-loop"
            onClick={toggleLoopCurrent}
            aria-label="循环本段"
          ><Repeat size={16} /></button>
          {engine.looping && <span className="loop-count" data-testid="loop-count">×{snap.loopCount}</span>}
          <button className="tbtn" data-testid="btn-dual" onClick={() => setDual((v) => !v)} aria-label="对戏分栏"><Columns2 size={16} /></button>
          <button className="tbtn" onClick={() => setShowCards((v) => !v)} aria-label="提醒卡"><StickyNote size={16} /></button>
          <button className="tbtn" onClick={cycleTheme} aria-label="切换主题">{themeIcon}</button>
          <button className="tbtn" onClick={toggleFullscreen} aria-label="全屏"><Maximize size={16} /></button>
          <Link className="tbtn" to={`/prompt/${id}/stage`} data-testid="btn-stage" aria-label="演出模式"><Maximize size={16} /></Link>
        </div>
        <span className="remote-code" data-testid="remote-code" title="遥控配对码">遥控 {remoteCode}</span>
      </header>

      {dual && (
        <div className="dual-roles">
          <select data-testid="role-a" value={roleA} onChange={(e) => setRoleA(e.target.value)}>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <span className="muted">对戏分栏 · 左右角色各自跟随</span>
          <select data-testid="role-b" value={roleB} onChange={(e) => setRoleB(e.target.value)}>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      )}

      <div className={`prompt-body${dual ? ' dual' : ''}`}>
        <PromptCanvas script={script} settings={settings} engine={engine} practice={counts} lineFilter={filterA} />
        {dual && engineB && <PromptCanvas script={script} settings={settings} engine={engineB} lineFilter={filterB} testId="prompt-canvas-b" />}
      </div>

      {showCards && (
        <div className="modal" data-testid="reminder-modal" onClick={() => setShowCards(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>提醒卡 · 易错句</h3>
            {script.lines.filter((l) => l.marks.length > 0).length === 0 && <p className="muted">暂无标记句（编辑页可标记）。</p>}
            <ul className="reminder-list">
              {script.lines.map((l, i) =>
                l.marks.length > 0 ? (
                  <li key={l.id}>
                    <button
                      className="reminder-jump"
                      onClick={() => {
                        engine.seekIndex(i)
                        setShowCards(false)
                      }}
                    >
                      <span className="mark-dots">
                        {l.marks.map((mk) => {
                          const def = MARK_DEFS.find((d) => d.key === mk)
                          return def ? <i key={mk} style={{ background: def.color }} /> : null
                        })}
                      </span>
                      第{i + 1}行 {l.role ? `${l.role}：` : ''}{l.text}
                    </button>
                  </li>
                ) : null,
              )}
            </ul>
            <button className="btn" onClick={() => setShowCards(false)}>关闭</button>
          </div>
        </div>
      )}

      <footer className="prompt-help muted">
        空格 播放/暂停/跳过过门 · ↑↓ 调速 · ←→ 段间跳转 · 1~9 跳段 · L 循环本段 · 双击屏 播放暂停 · 拖拽滚动
        （自定义键位见 <Link to="/settings">设置</Link>，当前播放键：{keyLabel(keymap.playPause)}）
        <button className="btn btn-ghost btn-small" onClick={() => navigate('/')}>首页</button>
      </footer>
    </div>
  )
}

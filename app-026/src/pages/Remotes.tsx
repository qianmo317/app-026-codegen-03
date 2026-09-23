import { useEffect, useRef, useState } from 'react'
import { Link } from '../router'
import { openChannel, loadRemoteCode, isRemoteStatus } from '../engine/remote'
import type { RemoteCommand, RemoteStatus } from '../engine/remote'
import { Play, Pause, Plus, Minus, ChevronLeft, ChevronRight, Repeat, Smartphone } from 'lucide-react'

/** 遥控端：与提词端在同一浏览器（同源）打开，输入相同配对码即可控制。 */
export function Remotes() {
  const [code, setCode] = useState(() => loadRemoteCode())
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  const [lastMsgAt, setLastMsgAt] = useState(0)
  const chRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    const ch = openChannel(code)
    chRef.current = ch
    if (!ch) return
    ch.onmessage = (ev) => {
      const msg = ev.data
      if (isRemoteStatus(msg)) {
        setStatus(msg.payload)
        setLastMsgAt(Date.now())
        setConnected(true)
      }
    }
    return () => {
      ch.close()
      chRef.current = null
    }
  }, [code])

  // 超过 3 秒没有状态视为未连接
  useEffect(() => {
    const t = window.setInterval(() => {
      if (lastMsgAt && Date.now() - lastMsgAt > 3000) setConnected(false)
    }, 1000)
    return () => window.clearInterval(t)
  }, [lastMsgAt])

  const send = (cmd: RemoteCommand) => {
    const ch = chRef.current
    if (ch) (ch as BroadcastChannel).postMessage({ __otp: true, kind: 'cmd', payload: cmd })
  }

  const seg = status?.segment ?? 0

  return (
    <div className="page narrow">
      <header className="page-head">
        <h1><Smartphone size={22} /> 遥控器</h1>
        <Link className="btn btn-ghost" to="/">首页</Link>
      </header>

      <section className="panel">
        <h2>配对</h2>
        <p className="muted">在提词端（排练/演出页面）查看配对码，在此输入相同 4 位码（需同一浏览器双窗口）。</p>
        <div className="form-row">
          <input
            data-testid="remote-code-input"
            value={code}
            maxLength={4}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            style={{ width: 120, textTransform: 'uppercase', fontSize: 24, textAlign: 'center', letterSpacing: 8 }}
          />
          <span className={connected ? 'ok' : 'muted'} data-testid="remote-status">
            {connected ? '● 已连接提词端' : '○ 等待提词端…'}
          </span>
        </div>
      </section>

      <section className="panel">
        <h2>控制</h2>
        {status && (
          <p className="muted" data-testid="remote-info">
            段 {seg + 1}/{status.segmentCount} · 行 {status.line + 1}/{status.lineCount} · {status.speed}px/s
            {status.loop ? ' · 循环中' : ''}
            {status.holding ? ` · 过门 剩余${status.holdRemaining.toFixed(1)}s` : ''}
          </p>
        )}
        <div className="remote-grid">
          <button className="rbtn" data-testid="remote-prev" onClick={() => send({ type: 'segment', dir: -1 })}><ChevronLeft size={20} /></button>
          <button className="rbtn big" data-testid="remote-play" onClick={() => send({ type: 'toggle' })}>
            {status?.playing ? <Pause size={26} /> : <Play size={26} />}
          </button>
          <button className="rbtn" data-testid="remote-next" onClick={() => send({ type: 'segment', dir: 1 })}><ChevronRight size={20} /></button>
          <button className="rbtn" data-testid="remote-slower" onClick={() => send({ type: 'speed', dir: -1 })}><Minus size={20} /></button>
          <button className="rbtn" data-testid="remote-skip" onClick={() => send({ type: 'skipHold' })}>跳过过门</button>
          <button className="rbtn" data-testid="remote-faster" onClick={() => send({ type: 'speed', dir: 1 })}><Plus size={20} /></button>
          <button className="rbtn" data-testid="remote-loop" onClick={() => send({ type: 'loop' })}><Repeat size={18} /> 循环本段</button>
        </div>
        <div className="remote-digits" data-testid="remote-digits">
          {Array.from({ length: 9 }, (_, i) => (
            <button key={i} className="rbtn digit" data-testid={`remote-digit-${i + 1}`} onClick={() => send({ type: 'jump', index: i })}>
              {i + 1}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

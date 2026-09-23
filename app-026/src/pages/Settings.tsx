import { useEffect, useState } from 'react'
import { Link } from '../router'
import { useSettingsCtx } from '../App'
import { KEY_ACTIONS, keyLabel, loadKeymap, saveKeymap, resetKeymap } from '../engine/keys'
import type { Keymap, RemappableAction } from '../engine/keys'
import { loadRemoteCode, genRemoteCode, saveRemoteCode } from '../engine/remote'
import { WakeLockGuard } from '../engine/wakelock'
import { Keyboard, Smartphone } from 'lucide-react'

export function Settings() {
  const { settings, patch } = useSettingsCtx()
  const [keymap, setKeymap] = useState<Keymap>(() => loadKeymap())
  const [capturing, setCapturing] = useState<RemappableAction | null>(null)
  const [remoteCode, setRemoteCode] = useState(() => loadRemoteCode())
  const [wakeSupported, setWakeSupported] = useState<boolean | null>(null)

  useEffect(() => {
    setWakeSupported(new WakeLockGuard().supported())
  }, [])

  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      const key = e.key === ' ' ? ' ' : e.key.length === 1 ? e.key.toLowerCase() : e.key
      const next = { ...keymap, [capturing]: key }
      setKeymap(next)
      saveKeymap(next)
      setCapturing(null)
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [capturing, keymap])

  if (!settings) return <div className="page center">加载中…</div>

  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>设置</h1>
        <Link className="btn btn-ghost" to="/">首页</Link>
      </header>

      <section className="panel">
        <h2>字号与滚动</h2>
        <label className="set-row">
          <span>自动字号（按屏宽二分求最大不换行字号）</span>
          <input type="checkbox" data-testid="set-autofit" checked={settings.autoFit} onChange={(e) => patch({ autoFit: e.target.checked })} />
        </label>
        <label className="set-row">
          <span>手动字号（px）</span>
          <input
            type="range" min={16} max={160} step={2}
            data-testid="set-fontsize"
            disabled={settings.autoFit}
            value={settings.fontSizePx}
            onChange={(e) => patch({ fontSizePx: Number(e.target.value) })}
          />
          <b>{settings.fontSizePx}px</b>
        </label>
        <label className="set-row">
          <span>进入页面自动滚动</span>
          <input type="checkbox" data-testid="set-autoscroll" checked={settings.autoScroll} onChange={(e) => patch({ autoScroll: e.target.checked })} />
        </label>
        <label className="set-row">
          <span>滚动速度（px/秒）</span>
          <input
            type="range" min={20} max={400} step={10}
            data-testid="set-speed"
            value={settings.speedPxPerSec}
            onChange={(e) => patch({ speedPxPerSec: Number(e.target.value) })}
          />
          <b data-testid="speed-display">{settings.speedPxPerSec}</b>
        </label>
        <label className="set-row">
          <span>遇到过门/停顿自动停留</span>
          <input type="checkbox" data-testid="set-holdoncue" checked={settings.holdOnCue} onChange={(e) => patch({ holdOnCue: e.target.checked })} />
        </label>
        <label className="set-row">
          <span>进入演出模式自动锁定（防误触）</span>
          <input type="checkbox" data-testid="set-lockstage" checked={settings.lockStage} onChange={(e) => patch({ lockStage: e.target.checked })} />
        </label>
      </section>

      <section className="panel">
        <h2>主题</h2>
        <div className="form-row">
          {(['dark', 'light', 'highContrast'] as const).map((t) => (
            <button
              key={t}
              className={`btn${settings.theme === t ? ' primary' : ''}`}
              data-testid={`theme-${t}`}
              onClick={() => patch({ theme: t })}
            >
              {t === 'dark' ? '深色' : t === 'light' ? '浅色' : '高对比（黑底黄字）'}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2><Keyboard size={18} /> 快捷键映射</h2>
        <p className="muted">点击「修改」后按下新键。数字键 1~9 固定用于跳段。</p>
        <table className="keymap-table" data-testid="keymap-table">
          <tbody>
            {KEY_ACTIONS.map(({ action, label }) => (
              <tr key={action}>
                <td>{label}</td>
                <td className="key-cell">{keyLabel(keymap[action])}</td>
                <td>
                  <button className="btn btn-small" data-testid={`remap-${action}`} onClick={() => setCapturing(action)}>
                    {capturing === action ? '按键中…' : '修改'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          className="btn btn-ghost"
          data-testid="keymap-reset"
          onClick={() => {
            resetKeymap()
            setKeymap(loadKeymap())
          }}
        >
          恢复默认
        </button>
      </section>

      <section className="panel">
        <h2><Smartphone size={18} /> 遥控与常亮</h2>
        <label className="set-row">
          <span>遥控配对码</span>
          <b data-testid="settings-remote-code">{remoteCode}</b>
          <button
            className="btn btn-small"
            onClick={() => {
              const c = genRemoteCode()
              saveRemoteCode(c)
              setRemoteCode(c)
            }}
          >
            重新生成
          </button>
        </label>
        <p className="muted">屏幕常亮（Wake Lock）：{wakeSupported === null ? '检测中…' : wakeSupported ? '当前环境支持 ✓（需 HTTPS 或 localhost）' : '当前环境不支持，请在演出设备上手动设置不休屏'}</p>
        <p className="muted">所有文稿数据仅存本机 IndexedDB，不上传。</p>
      </section>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link } from '../router'
import { useSettingsCtx } from '../App'
import { KEY_ACTIONS, keyLabel, loadKeymap, saveKeymap, resetKeymap } from '../engine/keys'
import type { Keymap, RemappableAction } from '../engine/keys'
import { loadRemoteCode, genRemoteCode, saveRemoteCode } from '../engine/remote'
import { WakeLockGuard } from '../engine/wakelock'
import * as repo from '../storage/repo'
import * as transfer from '../storage/transfer'
import { Keyboard, Smartphone, Package } from 'lucide-react'

export function Settings() {
  const { settings, patch } = useSettingsCtx()
  const [keymap, setKeymap] = useState<Keymap>(() => loadKeymap())
  const [capturing, setCapturing] = useState<RemappableAction | null>(null)
  const [remoteCode, setRemoteCode] = useState(() => loadRemoteCode())
  const [wakeSupported, setWakeSupported] = useState<boolean | null>(null)

  /* 数据搬迁 */
  const [bundle, setBundle] = useState<transfer.ExportBundle | null>(null)
  const [analysis, setAnalysis] = useState<transfer.ImportAnalysis | null>(null)
  const [report, setReport] = useState<transfer.ImportReport | null>(null)
  const [ioError, setIoError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setWakeSupported(new WakeLockGuard().supported())
  }, [])

  /* ---------- 数据搬迁 ---------- */

  const onExport = async () => {
    const b = await transfer.buildExportBundle()
    const blob = new Blob([transfer.serializeBundle(b)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `opera-teleprompter-backup-${fileStamp(b.exportedAt)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = '' // 允许重复选同一文件
    setIoError('')
    setReport(null)
    setAnalysis(null)
    setBundle(null)
    if (!f) return
    try {
      const b = transfer.parseBundle(await f.text())
      const local = await repo.listScripts()
      setBundle(b)
      setAnalysis(transfer.analyzeBundle(b, local))
    } catch (err) {
      setIoError(err instanceof Error ? err.message : '文件读取失败')
    }
  }

  const runImport = async (mode: transfer.ImportMode) => {
    if (!bundle) return
    setBusy(true)
    setIoError('')
    try {
      const r = await transfer.applyImport(bundle, mode)
      setReport(r)
      setAnalysis(null)
      setBundle(null)
      if (r.settingsApplied && bundle.settings) patch(bundle.settings) // 同步全局设置 UI
    } catch (err) {
      setIoError(`导入失败：${err instanceof Error ? err.message : String(err)}。所有数据已回滚到导入前的状态，未做任何改动。`)
    } finally {
      setBusy(false)
    }
  }

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

      <section className="panel">
        <h2><Package size={18} /> 数据搬迁（导出 / 导入）</h2>
        <p className="muted">换设备或借电脑演出时：在本机导出全部内容成一个文件，拷到那台设备上导入即可。文件含全部剧目、模板、应用设置与练习记录。</p>
        <div className="form-row">
          <button className="btn" data-testid="btn-export" onClick={onExport}>导出全部数据</button>
          <label className="btn btn-ghost">
            选择备份文件导入…
            <input data-testid="import-file" type="file" accept=".json,application/json" hidden onChange={onPickFile} />
          </label>
        </div>

        {ioError && <p className="io-error" data-testid="io-error">{ioError}</p>}

        {analysis && (
          <div className="import-preview" data-testid="import-preview">
            <h3>备份文件清单</h3>
            <p className="muted">
              导出于 {fmtTime(analysis.exportedAt)} · 格式 v{analysis.version} · 剧目 {analysis.items.length} 个 · 模板 {analysis.templates} 个 · 练习记录 {analysis.practiceRecords} 条
              {analysis.hasSettings ? ' · 含应用设置（导入后替换本机设置）' : ''}
            </p>
            <ul className="import-list" data-testid="import-list">
              {analysis.items.map((it, i) => (
                <li key={i} data-conflict={it.conflict || undefined}>
                  《{it.title}》 {it.segments} 段 {it.lines} 行{it.conflict && <b className="conflict-tag">与本机同名</b>}
                </li>
              ))}
            </ul>
            {analysis.conflicts.length > 0 && (
              <p className="io-warn" data-testid="conflict-list">与本机同名：{analysis.conflicts.map((t) => `《${t}》`).join('、')}</p>
            )}
            <div className="import-modes">
              <p data-testid="merge-desc">
                <b>整份并入</b>：新增 {analysis.merge.add} 个剧目
                {analysis.merge.skip > 0 ? `；${analysis.merge.skip} 个同名剧目保持本机现状不动` : ''}。
              </p>
              <p data-testid="overwrite-desc">
                <b>同名替换</b>：新增 {analysis.overwrite.add} 个剧目
                {analysis.overwrite.replace > 0 ? `；用文件内容替换 ${analysis.overwrite.replace} 个本机同名剧目` : ''}。
              </p>
            </div>
            <div className="form-row">
              <button className="btn" data-testid="btn-import-merge" disabled={busy} onClick={() => runImport('merge')}>
                {busy ? '导入中…' : '整份并入（同名跳过）'}
              </button>
              <button className="btn btn-danger" data-testid="btn-import-overwrite" disabled={busy} onClick={() => runImport('overwrite')}>
                {busy ? '导入中…' : '同名替换导入'}
              </button>
              <button className="btn btn-ghost" data-testid="btn-import-cancel" disabled={busy} onClick={() => { setAnalysis(null); setBundle(null) }}>取消</button>
            </div>
          </div>
        )}

        {report && (
          <div className="import-report" data-testid="import-report">
            <h3>导入完成</h3>
            <p>
              新增 {report.added.length} 个 · 替换 {report.replaced.length} 个 · 同名跳过 {report.skipped.length} 个
              {report.templatesAdded + report.templatesReplaced + report.templatesSkipped > 0 &&
                ` · 模板：增 ${report.templatesAdded} / 替 ${report.templatesReplaced} / 跳 ${report.templatesSkipped}`}
              {report.practiceRecords > 0 && ` · 练习记录 ${report.practiceRecords} 条`}
              {report.settingsApplied && ' · 应用设置已更新'}
            </p>
            <ul className="import-list" data-testid="report-list">
              {report.added.map((e, i) => (
                <li key={`a${i}`} data-kind="added">＋ 新增《{e.title}》（{e.lines} 行）</li>
              ))}
              {report.replaced.map((e, i) => (
                <li key={`r${i}`} data-kind="replaced">⇄ 替换《{e.title}》（{e.lines} 行）</li>
              ))}
              {report.skipped.map((e, i) => (
                <li key={`s${i}`} data-kind="skipped">— 跳过《{e.title}》（与本机同名，本机内容未改动）</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}

function fmtTime(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fileStamp(ts: number) {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

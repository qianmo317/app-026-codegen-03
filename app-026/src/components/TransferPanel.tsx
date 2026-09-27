import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import * as repo from '../storage/repo'
import { applyImport, buildBackup, buildImportPreview, parseBackup, serializeBackup } from '../storage/transfer'
import type { BackupFile, ImportMode, ImportPreview, ImportReport } from '../storage/transfer'
import { useSettingsCtx } from '../App'

/** 换机迁移面板：整机导出为一个文件；导入先给清单再动手，失败整体回滚 */
export function TransferPanel({ onImported }: { onImported: () => void }) {
  const { reload: reloadSettings } = useSettingsCtx()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ backup: BackupFile; preview: ImportPreview } | null>(null)
  const [mode, setMode] = useState<ImportMode>('merge')
  const [report, setReport] = useState<ImportReport | null>(null)

  const doExport = async () => {
    setBusy(true)
    setError(null)
    try {
      const backup = await buildBackup()
      const d = new Date(backup.exportedAt)
      const pad = (n: number) => String(n).padStart(2, '0')
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
      const url = URL.createObjectURL(new Blob([serializeBackup(backup)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `提词器备份-${stamp}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(`导出失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const onPickFile = async (f: File) => {
    setBusy(true)
    setError(null)
    setReport(null)
    try {
      const backup = parseBackup(await f.text())
      const local = await repo.listScripts()
      setMode('merge')
      setPending({ backup, preview: buildImportPreview(backup, local) })
    } catch (e) {
      setError(e instanceof Error ? e.message : '文件读取失败')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const doImport = async () => {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      const rep = await applyImport(pending.backup, mode)
      setReport(rep)
      setPending(null)
      if (rep.settingsApplied) reloadSettings()
      onImported()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <h2>换机迁移（导出 / 导入）</h2>
      <p className="muted">把本机的剧目、模板、设置与练习次数打成一个文件带走；在别的设备上导入即可整份搬过去。</p>
      <div className="form-row">
        <button className="btn" data-testid="btn-export" disabled={busy} onClick={doExport}>
          <Download size={16} /> 导出全部内容
        </button>
        <button className="btn btn-ghost" data-testid="btn-import" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Upload size={16} /> 选择备份文件导入
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          data-testid="import-file"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onPickFile(f)
          }}
        />
      </div>
      {error && (
        <p className="err" data-testid="import-error">
          {error}
        </p>
      )}

      {pending && (
        <div className="modal" data-testid="import-preview">
          <div className="modal-box">
            <h3>导入清单</h3>
            <div className="import-summary">
              <span>格式版本 v{pending.preview.version}</span>
              <span>导出于 {fmtDateTime(pending.preview.exportedAt)}</span>
              <span>剧目 {pending.preview.total} 个</span>
              <span>模板 {pending.preview.templateCount} 个</span>
              <span>{pending.preview.hasSettings ? '含设置' : '不含设置'}</span>
            </div>
            <p className="muted">
              其中 {pending.preview.newCount} 个本机没有，{pending.preview.clashCount} 个与本机同名：
            </p>
            <div className="import-list">
              {pending.preview.items.map((it, i) => (
                <div className="import-item" key={i} data-clash={it.clash || undefined}>
                  <span>{it.title}</span>
                  <span className="muted">{it.lineCount} 行</span>
                  <span className={`tag ${it.clash ? 'clash' : 'ok'}`}>{it.clash ? '与本机同名' : '新剧目'}</span>
                </div>
              ))}
            </div>

            <label className={`mode-option${mode === 'merge' ? ' selected' : ''}`} data-testid="mode-merge">
              <input type="radio" name="import-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />
              <span>
                <b>整份并入（同名跳过）</b>
                <br />
                <span className="muted">
                  将新增 {pending.preview.merge.add} 个剧目；{pending.preview.merge.skip} 个同名剧目跳过不导入，本机原有内容一字不动。
                </span>
              </span>
            </label>
            <label className={`mode-option${mode === 'replace' ? ' selected' : ''}`} data-testid="mode-replace">
              <input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
              <span>
                <b>同名用文件里的替换本机</b>
                <br />
                <span className="muted">
                  将新增 {pending.preview.replace.add} 个剧目；本机 {pending.preview.replace.replace} 个同名剧目会被文件版本替换（含练习次数），替换不可恢复。
                </span>
              </span>
            </label>

            <div className="form-row">
              <button className="btn" data-testid="btn-import-confirm" disabled={busy} onClick={doImport}>
                开始导入
              </button>
              <button className="btn btn-ghost" data-testid="btn-import-cancel" disabled={busy} onClick={() => setPending(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {report && (
        <div className="modal" data-testid="import-report">
          <div className="modal-box">
            <h3>导入完成</h3>
            <div className="import-summary">
              <span>新增 {report.added} 个</span>
              <span>替换 {report.replaced} 个</span>
              <span>同名跳过 {report.skipped} 个</span>
            </div>
            <div className="import-list">
              {report.items.map((it, i) => (
                <div className="import-item" key={i} data-action={it.action}>
                  <span>{it.title}</span>
                  <span className="muted">{it.lineCount} 行</span>
                  <span className={`tag ${it.action === 'skipped' ? 'clash' : 'ok'}`}>
                    {it.action === 'added' ? `新增 ${it.lineCount} 行` : it.action === 'replaced' ? `替换 ${it.lineCount} 行` : '同名跳过'}
                  </span>
                </div>
              ))}
            </div>
            <p className="muted">
              模板：新增 {report.templatesAdded} 个{report.templatesSkipped ? `，${report.templatesSkipped} 个同名跳过` : ''}。
              {report.settingsApplied ? '设置已按备份更新。' : '备份不含设置，本机设置未变。'}
            </p>
            <div className="form-row">
              <button className="btn" data-testid="btn-report-close" onClick={() => setReport(null)}>
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function fmtDateTime(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

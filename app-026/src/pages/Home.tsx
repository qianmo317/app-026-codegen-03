import { useState } from 'react'
import { Link, navigate } from '../router'
import { useAsync } from '../state/hooks'
import * as repo from '../storage/repo'
import { buildScriptFromText } from '../engine/parse'
import type { Script, ScriptStyle } from '../types'
import { FileText, Pencil, Play, Printer, Trash2, Maximize, Upload, Download } from 'lucide-react'

export function Home() {
  const { data: scripts, reload } = useAsync(repo.listScripts, [])
  const { data: templates, reload: reloadTpl } = useAsync(repo.listTemplates, [])
  const [title, setTitle] = useState('')
  const [style, setStyle] = useState<ScriptStyle>('opera')
  const [paste, setPaste] = useState('')
  const [troupe, setTroupe] = useState('')

  const create = async (s: Script) => {
    await repo.saveScript(s)
    navigate(`/script/${s.id}`)
  }

  const onCreateEmpty = async () => {
    const t = title.trim() || '新剧目'
    const s: Script = { id: gen(), title: t, troupe: troupe.trim(), lines: [], segments: [], style, updatedAt: Date.now() }
    await create(s)
  }

  const onCreateFromPaste = async () => {
    const t = title.trim() || '粘贴导入'
    const s = buildScriptFromText(t, paste, style, troupe.trim())
    await create(s)
  }

  const importSample = async (file: string, name: string, st: ScriptStyle) => {
    const res = await fetch(file)
    const text = await res.text()
    const s = buildScriptFromText(name, text, st)
    await create(s)
  }

  const del = async (id: string) => {
    if (!confirm('删除该剧目？此操作不可恢复。')) return
    await repo.deleteScript(id)
    reload()
  }

  const instantiate = async (tpl: Script) => {
    await repo.saveScript(repo.newScriptFrom(tpl))
    reloadTpl()
    reload()
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1><FileText size={22} /> 戏曲演出提词器</h1>
        <div className="head-actions">
          <Link className="btn btn-ghost" to="/remotes"><Upload size={16} /> 遥控配对</Link>
          <Link className="btn btn-ghost" to="/settings"><Download size={16} /> 设置</Link>
        </div>
      </header>

      <section className="panel">
        <h2>新建剧目</h2>
        <div className="form-row">
          <input data-testid="new-title" placeholder="剧目名称，如《文昭关》" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input placeholder="剧团（可选）" value={troupe} onChange={(e) => setTroupe(e.target.value)} />
          <select data-testid="new-style" value={style} onChange={(e) => setStyle(e.target.value as ScriptStyle)}>
            <option value="opera">戏曲</option>
            <option value="speech">演讲 / 司仪</option>
          </select>
          <button className="btn" data-testid="btn-create" onClick={onCreateEmpty}>空白新建</button>
        </div>
        <div className="form-row">
          <textarea
            data-testid="paste-box"
            placeholder="粘贴唱词导入：每行一句，支持「角色：唱词」；标记语法【过门5】【锣鼓】【停顿3】【注:轻一点】；「## 标题」为唱段头；空行自动分段。"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={3}
          />
          <button className="btn" data-testid="btn-paste-create" disabled={!paste.trim()} onClick={onCreateFromPaste}>解析并导入</button>
        </div>
        <div className="form-row samples">
          <span className="muted">示例：</span>
          <button className="btn btn-ghost" data-testid="btn-sample-opera" onClick={() => importSample('/samples/opera-demo.txt', '示例·京剧选段', 'opera')}>戏曲示例</button>
          <button className="btn btn-ghost" data-testid="btn-sample-speech" onClick={() => importSample('/samples/speech-demo.txt', '示例·年会主持稿', 'speech')}>主持稿示例</button>
        </div>
      </section>

      <section className="panel">
        <h2>剧目列表 {scripts ? `(${scripts.length})` : ''}</h2>
        {!scripts?.length && <p className="muted" data-testid="empty-tip">还没有剧目，先新建或导入示例。</p>}
        <div className="card-list" data-testid="script-list">
          {scripts?.map((s) => (
            <div className="card" key={s.id} data-testid="script-card">
              <div className="card-main">
                <div className="card-title">{s.title}</div>
                <div className="card-sub muted">
                  {s.troupe ? `${s.troupe} · ` : ''}{s.style === 'opera' ? '戏曲' : '演讲'} · {s.segments.length} 段 {s.lines.length} 行 · {fmtDate(s.updatedAt)}
                </div>
              </div>
              <div className="card-actions">
                <Link className="btn btn-small" to={`/script/${s.id}`}><Pencil size={14} /> 编辑</Link>
                <Link className="btn btn-small" to={`/prompt/${s.id}`}><Play size={14} /> 排练</Link>
                <Link className="btn btn-small" to={`/prompt/${s.id}/stage`}><Maximize size={14} /> 演出</Link>
                <Link className="btn btn-small btn-ghost" to={`/print/${s.id}`}><Printer size={14} /> 打印</Link>
                <button className="btn btn-small btn-danger" data-testid="btn-delete" onClick={() => del(s.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {!!templates?.length && (
        <section className="panel">
          <h2>模板 {`(${templates.length})`}</h2>
          <div className="card-list">
            {templates.map((t) => (
              <div className="card" key={t.id}>
                <div className="card-main">
                  <div className="card-title">{t.title}</div>
                  <div className="card-sub muted">{t.lines.length} 行</div>
                </div>
                <div className="card-actions">
                  <button className="btn btn-small" onClick={() => instantiate(t)}>用模板新建</button>
                  <button
                    className="btn btn-small btn-danger"
                    onClick={async () => {
                      if (!confirm('删除该模板？')) return
                      await repo.deleteTemplate(t.id)
                      reloadTpl()
                    }}
                  ><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function gen() {
  return `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function fmtDate(ts: number) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

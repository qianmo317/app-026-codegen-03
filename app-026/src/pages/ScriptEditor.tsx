import { useState } from 'react'
import { Link, navigate } from '../router'
import { useScript } from '../state/hooks'
import { parseScriptText } from '../engine/parse'
import { makeCue, cueLabel } from '../engine/cues'
import { MARK_DEFS, KIND_LABELS } from '../constants'
import * as repo from '../storage/repo'
import type { Cue, Line } from '../types'
import { Play, Maximize, Printer, Save, Layers, StickyNote } from 'lucide-react'

export function ScriptEditor({ id }: { id: string }) {
  const { script, mutate, saved, saveNow } = useScript(id)
  const [paste, setPaste] = useState('')
  const [autoBlank, setAutoBlank] = useState(true)
  const [showCards, setShowCards] = useState(false)

  if (!script) return <div className="page center">加载中…</div>

  // 行 id → 段索引（非 hook，避免条件渲染下 hooks 数量变化）
  const segOfLine = new Map<string, number>()
  script.segments.forEach((seg, si) => {
    for (const lid of seg.lineIds) segOfLine.set(lid, si)
  })

  const doParse = (mode: 'replace' | 'append') => {
    const parsed = parseScriptText(paste, { autoSegmentOnBlank: autoBlank })
    mutate((s) => {
      if (mode === 'replace') return { ...s, lines: parsed.lines, segments: parsed.segments }
      // 解析出的 id 已全局唯一，可直接追加
      return { ...s, lines: [...s.lines, ...parsed.lines], segments: [...s.segments, ...parsed.segments] }
    })
    setPaste('')
  }

  const updateLine = (idx: number, p: Partial<Line>) => {
    mutate((s) => {
      const lines = s.lines.slice()
      lines[idx] = { ...lines[idx], ...p }
      return { ...s, lines }
    })
  }

  const toggleMark = (idx: number, mark: string) => {
    const line = script.lines[idx]
    const marks = line.marks.includes(mark) ? line.marks.filter((m) => m !== mark) : [...line.marks, mark]
    updateLine(idx, { marks })
  }

  const addCue = (idx: number, kind: Cue['kind']) => {
    const line = script.lines[idx]
    updateLine(idx, { cues: [...line.cues, makeCue(kind)] })
  }
  const removeCue = (idx: number, cueId: string) => {
    const line = script.lines[idx]
    updateLine(idx, { cues: line.cues.filter((c) => c.id !== cueId) })
  }
  const setCueSeconds = (idx: number, cueId: string, seconds: number) => {
    const line = script.lines[idx]
    updateLine(idx, { cues: line.cues.map((c) => (c.id === cueId ? { ...c, seconds } : c)) })
  }

  const deleteLine = (idx: number) => {
    mutate((s) => {
      const target = s.lines[idx]
      const lines = s.lines.slice()
      lines.splice(idx, 1)
      const segments = s.segments
        .map((seg) => ({ ...seg, lineIds: seg.lineIds.filter((lid) => lid !== target.id) }))
        .filter((seg) => seg.lineIds.length > 0)
      return { ...s, lines, segments }
    })
  }

  const insertLineAfter = (idx: number) => {
    mutate((s) => {
      const nid = `l_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
      const nl: Line = { id: nid, text: '', cues: [], marks: [] }
      const lines = s.lines.slice()
      lines.splice(idx + 1, 0, nl)
      const segments = s.segments.map((seg) => {
        const at = seg.lineIds.indexOf(s.lines[idx].id)
        if (at === -1) return seg
        const lineIds = seg.lineIds.slice()
        lineIds.splice(at + 1, 0, nid)
        return { ...seg, lineIds }
      })
      return { ...s, lines, segments }
    })
  }

  const splitSegmentAt = (idx: number) => {
    mutate((s) => {
      const target = s.lines[idx]
      const segIdx = s.segments.findIndex((seg) => seg.lineIds.includes(target.id))
      if (segIdx === -1) return s
      const seg = s.segments[segIdx]
      const at = seg.lineIds.indexOf(target.id)
      if (at === 0) return s
      const newSeg = {
        id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        title: `第${s.segments.length + 1}段`,
        lineIds: seg.lineIds.slice(at),
      }
      const segments = s.segments.slice()
      segments[segIdx] = { ...seg, lineIds: seg.lineIds.slice(0, at) }
      segments.splice(segIdx + 1, 0, newSeg)
      return { ...s, segments }
    })
  }

  const renameSegment = (segIdx: number, title: string) => {
    mutate((s) => {
      const segments = s.segments.slice()
      segments[segIdx] = { ...segments[segIdx], title }
      return { ...s, segments }
    })
  }

  const toggleLoop = (segIdx: number) => {
    mutate((s) => {
      const segments = s.segments.slice()
      segments[segIdx] = { ...segments[segIdx], loop: !segments[segIdx].loop }
      return { ...s, segments }
    })
  }

  const saveTemplate = async () => {
    await saveNow()
    if (script) {
      await repo.saveAsTemplate(script)
      alert('已保存为模板')
    }
  }

  const markedLines = script.lines.filter((l) => l.marks.length > 0)

  return (
    <div className="page">
      <header className="page-head">
        <input
          className="title-input"
          data-testid="edit-title"
          value={script.title}
          onChange={(e) => mutate((s) => ({ ...s, title: e.target.value }))}
        />
        <input
          className="title-input small"
          placeholder="剧团（可选）"
          value={script.troupe ?? ''}
          onChange={(e) => mutate((s) => ({ ...s, troupe: e.target.value }))}
        />
        <span className="muted" data-testid="save-state">{saved ? '已保存' : '保存中…'}</span>
        <div className="head-actions">
          <button className="btn btn-ghost" onClick={() => setShowCards((v) => !v)}><StickyNote size={16} /> 提醒卡</button>
          <button className="btn btn-ghost" onClick={saveTemplate}><Layers size={16} /> 存模板</button>
          <Link className="btn btn-ghost" to={`/print/${script.id}`}><Printer size={16} /> 打印</Link>
          <Link className="btn" to={`/prompt/${script.id}`}><Play size={16} /> 排练</Link>
          <Link className="btn" to={`/prompt/${script.id}/stage`}><Maximize size={16} /> 演出</Link>
        </div>
      </header>

      {showCards && (
        <section className="panel" data-testid="reminder-cards">
          <h2>提醒卡（易错句速览）</h2>
          {!markedLines.length && <p className="muted">还没有标记的句子。用行内彩色按钮标记「易错句 / 需加力 / 需拖腔」。</p>}
          <ul className="reminder-list">
            {markedLines.map((l) => {
              const idx = script.lines.indexOf(l)
              return (
                <li key={l.id}>
                  <span className="reminder-idx">第 {idx + 1} 行</span>
                  <span className="reminder-text">{l.role ? `${l.role}：` : ''}{l.text}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2>粘贴导入</h2>
        <textarea
          data-testid="paste-input"
          rows={3}
          placeholder={'支持「角色：唱词」；标记【过门5】【锣鼓】【停顿3】【注:xxx】；「## 标题」为唱段头'}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <div className="form-row">
          <label className="chk">
            <input type="checkbox" checked={autoBlank} onChange={(e) => setAutoBlank(e.target.checked)} />
            空行自动分段
          </label>
          <button className="btn" data-testid="btn-parse-replace" disabled={!paste.trim()} onClick={() => doParse('replace')}>解析并替换全篇</button>
          <button className="btn" data-testid="btn-parse-append" disabled={!paste.trim()} onClick={() => doParse('append')}>追加到末尾</button>
        </div>
      </section>

      <section className="panel">
        <h2>唱段与唱词 {`(${script.lines.length} 行)`}</h2>
        {!script.lines.length && <p className="muted">暂无内容：在上方粘贴唱词解析，或回首页导入示例。</p>}
        <div data-testid="line-list">
          {script.lines.map((line, idx) => {
            const si = segOfLine.get(line.id)
            const segStart = si !== undefined && script.segments[si].lineIds[0] === line.id
            return (
              <div key={line.id}>
                {segStart && si !== undefined && (
                  <div className="seg-header" data-testid="segment-header">
                    <input
                      className="seg-title"
                      value={script.segments[si].title}
                      onChange={(e) => renameSegment(si, e.target.value)}
                      aria-label="唱段名称"
                    />
                    <label className="chk">
                      <input type="checkbox" checked={!!script.segments[si].loop} onChange={() => toggleLoop(si)} />
                      循环
                    </label>
                    <span className="muted">{script.segments[si].lineIds.length} 句</span>
                  </div>
                )}
                <div
                  className="line-row"
                  data-testid="line-row"
                  data-idx={idx}
                  data-marks={line.marks.length ? line.marks.join(' ') : undefined}
                >
                  <span className="line-no">{idx + 1}</span>
                  <input
                    className="line-role"
                    placeholder="角色"
                    value={line.role ?? ''}
                    onChange={(e) => updateLine(idx, { role: e.target.value || undefined })}
                  />
                  <input
                    className="line-text"
                    placeholder="唱词"
                    value={line.text}
                    onChange={(e) => updateLine(idx, { text: e.target.value })}
                  />
                  <div className="line-marks">
                    {MARK_DEFS.map((md) => (
                      <button
                        key={md.key}
                        className={`mark-btn${line.marks.includes(md.key) ? ' on' : ''}`}
                        style={line.marks.includes(md.key) ? { background: md.color } : { borderColor: md.color }}
                        data-testid={`mark-${md.key}`}
                        title={md.label}
                        onClick={() => toggleMark(idx, md.key)}
                      >{md.label}</button>
                    ))}
                  </div>
                  <div className="line-cues">
                    {line.cues.map((c) => (
                      <span className="cue-chip" key={c.id} data-testid="cue-chip" data-kind={c.kind}>
                        {cueLabel(c)}
                        {c.kind !== 'note' && (
                          <input
                            type="number"
                            min={0.5}
                            step={0.5}
                            value={c.seconds ?? 0}
                            onChange={(e) => setCueSeconds(idx, c.id, Number(e.target.value) || 0)}
                            aria-label="秒数"
                          />
                        )}
                        <button className="cue-x" onClick={() => removeCue(idx, c.id)}>×</button>
                      </span>
                    ))}
                    <button className="cue-add" data-testid={`add-cue-interlude`} onClick={() => addCue(idx, 'interlude')}>+过门</button>
                    <button className="cue-add" onClick={() => addCue(idx, 'drum')}>+锣鼓</button>
                    <button className="cue-add" onClick={() => addCue(idx, 'pause')}>+停顿</button>
                    <button className="cue-add" onClick={() => addCue(idx, 'note')}>+{KIND_LABELS.note}</button>
                  </div>
                  <input
                    className="line-note"
                    placeholder="批注（只对本人可见）"
                    value={line.note ?? ''}
                    onChange={(e) => updateLine(idx, { note: e.target.value || undefined })}
                  />
                  <div className="line-ops">
                    <button className="op" title="下一行前插入" onClick={() => insertLineAfter(idx)}>＋</button>
                    <button className="op" title="从此行分为新唱段" onClick={() => splitSegmentAt(idx)}>✂</button>
                    <button className="op op-danger" title="删除本行" onClick={() => deleteLine(idx)}>✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <footer className="editor-foot">
        <button className="btn" onClick={async () => { await saveNow(); navigate('/') }}>返回首页</button>
        <Save size={14} className="muted" />
      </footer>
    </div>
  )
}

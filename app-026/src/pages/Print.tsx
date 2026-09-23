import { Link } from '../router'
import { useScript } from '../state/hooks'
import { MARK_MAP } from '../constants'
import { Printer } from 'lucide-react'

/** 打印版唱词：大字、含标记与批注，供无设备场合 */
export function PrintView({ id }: { id: string }) {
  const { script } = useScript(id)
  if (!script) return <div className="page center">加载中…</div>

  return (
    <div className="print-page">
      <div className="print-bar no-print">
        <Link className="btn btn-ghost" to={`/script/${id}`}>返回编辑</Link>
        <button className="btn" data-testid="btn-print" onClick={() => window.print()}><Printer size={16} /> 打印</button>
      </div>
      <h1 className="print-title">{script.title}</h1>
      {script.troupe && <p className="print-troupe">{script.troupe}</p>}
      {script.segments.map((seg) => (
        <section key={seg.id} className="print-seg">
          <h2>{seg.title}{seg.loop ? '（循环段）' : ''}</h2>
          {seg.lineIds.map((lid) => {
            const line = script.lines.find((l) => l.id === lid)
            if (!line) return null
            const mark = line.marks.map((m) => MARK_MAP[m]).find(Boolean)
            return (
              <p key={lid} className="print-line" style={mark ? { borderLeft: `4px solid ${mark.color}`, paddingLeft: 8 } : undefined}>
                {line.role && <b>{line.role}：</b>}
                {line.text}
                {line.note && <small>（{line.note}）</small>}
              </p>
            )
          })}
        </section>
      ))}
      <div className="print-legend no-print">
        标记图例：{Object.values(MARK_MAP).map((m) => (
          <span key={m.key} style={{ color: m.color }}>■{m.label} </span>
        ))}
      </div>
    </div>
  )
}

import { describe, expect, it } from 'vitest'
import { parseScriptText, parseContentLine } from '../../src/engine/parse'
import { lineHoldSeconds } from '../../src/engine/cues'

describe('「角色：唱词」解析', () => {
  it('识别短角色前缀', () => {
    const { role, text } = parseContentLine('旦：尊一声驸马爷细听咱言')
    expect(role).toBe('旦')
    expect(text).toBe('尊一声驸马爷细听咱言')
  })

  it('冒号前过长则不算角色', () => {
    const { role, text } = parseContentLine('这一句太长了不应该算角色：后面的字')
    expect(role).toBeUndefined()
    expect(text).toContain('：')
  })
})

describe('行内标记解析', () => {
  it('【过门5】【锣鼓】【停顿3】与默认秒数', () => {
    const { text, cues } = parseContentLine('唱一句【过门5】再唱【锣鼓】收【停顿3秒】')
    expect(text).toBe('唱一句 再唱 收')
    expect(cues.map((c) => [c.kind, c.seconds])).toEqual([
      ['pause', 3],
      ['interlude', 5],
      ['drum', 2], // 默认 2s
    ])
  })

  it('【过门:6】冒号写法；【注:xxx】不停留', () => {
    const a = parseContentLine('老娘亲来到白马关【过门:6】')
    expect(a.cues[0]).toMatchObject({ kind: 'interlude', seconds: 6 })

    const b = parseContentLine('听罢言来吃一惊【注:瞪眼、起身】')
    expect(b.text).toBe('听罢言来吃一惊')
    expect(b.cues[0]).toMatchObject({ kind: 'note', label: '瞪眼、起身' })
    expect(lineHoldSeconds({ id: 'x', text: '', cues: b.cues, marks: [] })).toBe(0)
  })

  it('独立过门行生成占位文本且可停留', () => {
    const { lines } = parseScriptText('生：第一句\n【过门5】\n生：第二句', { autoSegmentOnBlank: false })
    expect(lines[1].text).toContain('过门')
    expect(lineHoldSeconds(lines[1])).toBe(5)
  })
})

describe('唱段切分', () => {
  it('「## 标题」分段 + 空行自动分段', () => {
    const { lines, segments } = parseScriptText(
      '## 第一段\n生：A1\n生：A2\n\n旦：B1\n【段：过场】\n生：C1',
    )
    expect(lines.length).toBe(4)
    expect(segments.map((s) => s.title)).toEqual(['第一段', '第2段', '过场'])
    expect(segments[0].lineIds.length).toBe(2)
    expect(segments[1].lineIds).toEqual([lines[2].id])
  })

  it('关闭空行分段则全文一段', () => {
    const { segments } = parseScriptText('生：A\n\n旦：B', { autoSegmentOnBlank: false })
    expect(segments.length).toBe(1)
  })

  it('空输入返回单空段', () => {
    const { lines, segments } = parseScriptText('   \n  \n')
    expect(lines.length).toBe(0)
    expect(segments.length).toBe(1)
  })

  it('lineIds 与 lines 一一对应', () => {
    const { lines, segments } = parseScriptText('生：A\n\n旦：B\n生：C')
    const all = segments.flatMap((s) => s.lineIds)
    expect(all.slice().sort()).toEqual(lines.map((l) => l.id).slice().sort())
  })
})

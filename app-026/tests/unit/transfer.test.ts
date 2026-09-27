import { describe, expect, it } from 'vitest'
import * as repo from '../../src/storage/repo'
import * as transfer from '../../src/storage/transfer'
import { idb, STORE_PRACTICE, STORE_SCRIPTS, STORE_TEMPLATES } from '../../src/storage/db'
import type { PracticeRecord } from '../../src/storage/repo'
import type { Script } from '../../src/types'

let seq = 0
function makeScript(over: Partial<Script> = {}): Script {
  seq++
  return {
    id: `sc_t${seq}_${Math.random().toString(36).slice(2, 8)}`,
    title: `剧目${seq}`,
    lines: [
      { id: 'l1', text: '第一句', cues: [], marks: [] },
      { id: 'l2', role: '旦', text: '第二句', cues: [], marks: ['hard'], note: '轻一点' },
    ],
    segments: [{ id: 's1', title: '第一段', lineIds: ['l1', 'l2'] }],
    style: 'opera',
    updatedAt: Date.now(),
    ...over,
  }
}

function makeBundle(over: Partial<transfer.ExportBundle> = {}): transfer.ExportBundle {
  return {
    format: transfer.EXPORT_FORMAT,
    version: transfer.EXPORT_VERSION,
    exportedAt: Date.now(),
    scripts: [],
    templates: [],
    settings: null,
    practice: [],
    ...over,
  }
}

const allScripts = () => idb.getAll<Script>(STORE_SCRIPTS)
const allPractice = () => idb.getAll<PracticeRecord>(STORE_PRACTICE)

describe('数据搬迁：导出', () => {
  it('打包全部内容，带格式版本与导出时间', async () => {
    const a = makeScript({ title: '文昭关' })
    const b = makeScript({ title: '年会主持稿', style: 'speech' })
    await repo.saveScript(a)
    await repo.saveScript(b)
    const tpl = await repo.saveAsTemplate(a)
    await repo.bumpPractice(a.id, ['l1'])
    repo.saveSettings({ ...repo.DEFAULT_SETTINGS, speedPxPerSec: 123 })

    const bundle = await transfer.buildExportBundle()
    expect(bundle.format).toBe('opera-teleprompter-backup')
    expect(bundle.version).toBe(transfer.EXPORT_VERSION)
    expect(bundle.exportedAt).toBeGreaterThan(0)
    const titles = bundle.scripts.map((s) => s.title)
    expect(titles).toContain('文昭关')
    expect(titles).toContain('年会主持稿')
    expect(bundle.templates.some((t) => t.id === tpl.id)).toBe(true)
    expect(bundle.practice.some((p) => p.id === a.id && p.counts.l1 === 1)).toBe(true)
    expect(bundle.settings?.speedPxPerSec).toBe(123)
  })

  it('序列化后可解析往返', () => {
    const s = makeScript({ title: '往返剧目' })
    const bundle = makeBundle({ scripts: [s], settings: { ...repo.DEFAULT_SETTINGS } })
    const back = transfer.parseBundle(transfer.serializeBundle(bundle))
    expect(back.scripts[0].title).toBe('往返剧目')
    expect(back.scripts[0].lines[1].marks).toEqual(['hard'])
    expect(back.settings?.fontSizePx).toBe(repo.DEFAULT_SETTINGS.fontSizePx)
  })
})

describe('数据搬迁：文件校验', () => {
  it('坏文件给出中文错误', () => {
    expect(() => transfer.parseBundle('not json')).toThrow('JSON')
    expect(() => transfer.parseBundle('{"format":"other-app"}')).toThrow('格式标识')
    expect(() => transfer.parseBundle(JSON.stringify(makeBundle({ version: 99 })))).toThrow('v99')
    expect(() => transfer.parseBundle(JSON.stringify({ ...makeBundle(), version: 'x' }))).toThrow('版本号')
    expect(() => transfer.parseBundle(JSON.stringify({ ...makeBundle(), scripts: undefined }))).toThrow('剧目数据')
    expect(() => transfer.parseBundle(JSON.stringify(makeBundle({ scripts: [{ id: 'x' }] as never[] })))).toThrow('剧名')
    expect(() =>
      transfer.parseBundle(JSON.stringify(makeBundle({ scripts: [makeScript({ lines: [{ id: 'l' }] as never[] })] }))),
    ).toThrow('唱词行')
  })
})

describe('数据搬迁：清单分析', () => {
  it('列出剧目数与同名，两种选法各会改动多少条', () => {
    const local = [makeScript({ title: '文昭关' }), makeScript({ title: '本地独有' })]
    const bundle = makeBundle({
      scripts: [makeScript({ title: '文昭关' }), makeScript({ title: '新戏A' }), makeScript({ title: '新戏B' })],
      templates: [makeScript({ title: '模板·一' })],
      practice: [{ id: 'x', counts: { l1: 1 } }],
      settings: { ...repo.DEFAULT_SETTINGS },
    })
    const a = transfer.analyzeBundle(bundle, local)
    expect(a.items).toHaveLength(3)
    expect(a.conflicts).toEqual(['文昭关'])
    expect(a.items[0].conflict).toBe(true)
    expect(a.merge).toEqual({ add: 2, skip: 1 })
    expect(a.overwrite).toEqual({ add: 2, replace: 1 })
    expect(a.templates).toBe(1)
    expect(a.practiceRecords).toBe(1)
    expect(a.hasSettings).toBe(true)
  })
})

describe('数据搬迁：导入', () => {
  it('整份并入：同名跳过，其余新增，练习记录随剧目走', async () => {
    const localScript = makeScript({ title: '文昭关' })
    await repo.saveScript(localScript)
    const fileConflict = makeScript({ title: '文昭关', lines: [{ id: 'x', text: '文件版', cues: [], marks: [] }] })
    const fileNew = makeScript({ title: '新戏' })
    const bundle = makeBundle({
      scripts: [fileConflict, fileNew],
      practice: [
        { id: fileConflict.id, counts: { l1: 9 } }, // 被跳过剧目的记录不进
        { id: fileNew.id, counts: { l1: 3 } },
      ],
    })

    const report = await transfer.applyImport(bundle, 'merge')
    expect(report.added.map((e) => e.title)).toEqual(['新戏'])
    expect(report.skipped.map((e) => e.title)).toEqual(['文昭关'])
    expect(report.replaced).toHaveLength(0)
    expect(report.practiceRecords).toBe(1)

    // 本机同名未被改动
    expect((await repo.getScript(localScript.id))?.lines[0].text).toBe('第一句')
    // 新增剧目保留文件 id，练习记录关联得上
    expect((await repo.getScript(fileNew.id))?.title).toBe('新戏')
    expect(await repo.getPracticeCounts(fileNew.id)).toEqual({ l1: 3 })
    // 被跳过剧目的练习记录没进来
    expect(await repo.getPracticeCounts(fileConflict.id)).toEqual({})
  })

  it('同名替换：用文件内容替换本机同名剧目', async () => {
    const localScript = makeScript({ title: '锁麟囊' })
    await repo.saveScript(localScript)
    const fileVer = makeScript({ title: '锁麟囊', lines: [{ id: 'f1', text: '文件版唱词', cues: [], marks: [] }] })
    const bundle = makeBundle({ scripts: [fileVer], practice: [{ id: fileVer.id, counts: { f1: 7 } }] })

    const report = await transfer.applyImport(bundle, 'overwrite')
    expect(report.replaced.map((e) => e.title)).toEqual(['锁麟囊'])
    expect(report.added).toHaveLength(0)

    // 本机只剩一个《锁麟囊》，内容与 id 以文件为准
    const same = (await allScripts()).filter((s) => s.title === '锁麟囊')
    expect(same).toHaveLength(1)
    expect(same[0].id).toBe(fileVer.id)
    expect(same[0].lines[0].text).toBe('文件版唱词')
    expect(await repo.getPracticeCounts(fileVer.id)).toEqual({ f1: 7 })
  })

  it('文件 id 撞上本机不同名剧目：换新 id 且练习记录跟随', async () => {
    const localScript = makeScript({ title: '本地戏' })
    await repo.saveScript(localScript)
    const fileScript = makeScript({ id: localScript.id, title: '外地戏' }) // id 撞车、剧名不同
    const bundle = makeBundle({ scripts: [fileScript], practice: [{ id: localScript.id, counts: { l1: 5 } }] })

    const report = await transfer.applyImport(bundle, 'merge', () => 'sc_remapped_1')
    expect(report.added.map((e) => e.title)).toEqual(['外地戏'])
    expect((await repo.getScript(localScript.id))?.title).toBe('本地戏') // 本机原剧目不动
    expect((await repo.getScript('sc_remapped_1'))?.title).toBe('外地戏')
    expect(await repo.getPracticeCounts('sc_remapped_1')).toEqual({ l1: 5 })
  })

  it('模板并入：merge 跳过同 id，overwrite 覆盖', async () => {
    await idb.put(STORE_TEMPLATES, makeScript({ id: 'tpl_x', title: '模板·旧' }))
    const fileTpl = makeScript({ id: 'tpl_x', title: '模板·新' })
    const fileTpl2 = makeScript({ id: 'tpl_y', title: '模板·全新' })

    const r1 = await transfer.applyImport(makeBundle({ templates: [fileTpl, fileTpl2] }), 'merge')
    expect(r1.templatesSkipped).toBe(1)
    expect(r1.templatesAdded).toBe(1)
    expect((await idb.get<Script>(STORE_TEMPLATES, 'tpl_x'))?.title).toBe('模板·旧')

    const r2 = await transfer.applyImport(makeBundle({ templates: [fileTpl] }), 'overwrite')
    expect(r2.templatesReplaced).toBe(1)
    expect((await idb.get<Script>(STORE_TEMPLATES, 'tpl_x'))?.title).toBe('模板·新')
  })

  it('导入应用文件中的设置', async () => {
    const bundle = makeBundle({ settings: { ...repo.DEFAULT_SETTINGS, speedPxPerSec: 222, theme: 'light' } })
    const report = await transfer.applyImport(bundle, 'merge')
    expect(report.settingsApplied).toBe(true)
    const s = await repo.loadSettings()
    expect(s.speedPxPerSec).toBe(222)
    expect(s.theme).toBe('light')
  })
})

describe('数据搬迁：失败回滚（不允许只进来一半）', () => {
  /** 构造一条写不进 IndexedDB 的剧目（Symbol 无法结构化克隆 → put 抛 DataCloneError） */
  function makeBadScript(title: string): Script {
    const s = makeScript({ title })
    ;(s.lines[0] as unknown as Record<string, unknown>).corrupt = Symbol('boom')
    return s
  }

  it('整份并入中途失败：全部回滚到导入前', async () => {
    const localScript = makeScript({ title: '文昭关' })
    await repo.saveScript(localScript)
    await repo.bumpPractice(localScript.id, ['l1'])
    const beforeScripts = await allScripts()
    const beforePractice = await allPractice()

    const good = makeScript({ title: '能进的戏' })
    const bad = makeBadScript('坏戏')
    const bundle = makeBundle({ scripts: [good, bad], practice: [{ id: good.id, counts: { l1: 1 } }] })

    await expect(transfer.applyImport(bundle, 'merge')).rejects.toThrow()
    // 能进的戏也没进来，本机数据与导入前完全一致
    expect(await allScripts()).toEqual(beforeScripts)
    expect(await allPractice()).toEqual(beforePractice)
  })

  it('同名替换中途失败：本机被替换的剧目也回滚还原', async () => {
    const localScript = makeScript({ title: '霸王别姬' })
    await repo.saveScript(localScript)
    const fileVer = makeScript({ title: '霸王别姬', lines: [{ id: 'f1', text: '文件版', cues: [], marks: [] }] })
    const bad = makeBadScript('坏戏')
    const bundle = makeBundle({ scripts: [fileVer, bad] })

    await expect(transfer.applyImport(bundle, 'overwrite')).rejects.toThrow()
    expect((await repo.getScript(localScript.id))?.lines[0].text).toBe('第一句') // 本机原样还在
    const titles = (await allScripts()).map((s) => s.title)
    expect(titles.filter((t) => t === '霸王别姬')).toHaveLength(1)
    expect(titles).not.toContain('坏戏')
  })
})

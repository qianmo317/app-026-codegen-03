import { beforeEach, describe, expect, it } from 'vitest'
import * as repo from '../../src/storage/repo'
import { idb, STORE_PRACTICE, STORE_SCRIPTS, STORE_SETTINGS, STORE_TEMPLATES } from '../../src/storage/db'
import {
  applyImport,
  buildBackup,
  buildImportPreview,
  EXPORT_VERSION,
  parseBackup,
  serializeBackup,
} from '../../src/storage/transfer'
import type { BackupFile } from '../../src/storage/transfer'
import type { Script } from '../../src/types'

function makeScript(over: Partial<Script> = {}): Script {
  return {
    id: `sc_${Math.random().toString(36).slice(2, 8)}`,
    title: '测试剧目',
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

async function resetDb() {
  for (const s of await idb.getAll<Script>(STORE_SCRIPTS)) await idb.delete(STORE_SCRIPTS, s.id)
  for (const t of await idb.getAll<Script>(STORE_TEMPLATES)) await idb.delete(STORE_TEMPLATES, t.id)
  for (const p of await idb.getAll<{ id: string }>(STORE_PRACTICE)) await idb.delete(STORE_PRACTICE, p.id)
  await idb.delete(STORE_SETTINGS, 'app')
  localStorage.removeItem('otp-settings')
}

beforeEach(resetDb)

describe('整机导出', () => {
  it('导出文件带格式版本与导出时间，且能整份解析回来', async () => {
    await repo.saveScript(makeScript({ title: '文昭关' }))
    await repo.saveScript(makeScript({ title: '贵妃醉酒' }))
    await repo.saveAsTemplate(makeScript({ title: '样板戏' }))
    await repo.saveSettings({ ...repo.DEFAULT_SETTINGS, speedPxPerSec: 222, theme: 'light' })
    await repo.bumpPractice('sc_keep', ['l1'])

    const backup = await buildBackup()
    expect(backup.version).toBe(EXPORT_VERSION)
    expect(typeof backup.exportedAt).toBe('number')
    expect(backup.scripts).toHaveLength(2)
    expect(backup.templates).toHaveLength(1)
    expect(backup.settings?.speedPxPerSec).toBe(222)
    expect(backup.practice.some((p) => p.id === 'sc_keep')).toBe(true)

    const parsed = parseBackup(serializeBackup(backup))
    expect(parsed.scripts.map((s) => s.title).sort()).toEqual(['文昭关', '贵妃醉酒'])
    expect(parsed.settings?.theme).toBe('light')
    expect(parsed.practice.find((p) => p.id === 'sc_keep')?.counts.l1).toBe(1)
  })

  it('拒绝非法文件：非 JSON / 格式不符 / 版本过高 / 数据缺项', async () => {
    expect(() => parseBackup('not json{{')).toThrow('JSON')
    expect(() => parseBackup(JSON.stringify({ format: 'other' }))).toThrow('不是本应用的备份文件')

    const good = await buildBackup()
    expect(() => parseBackup(JSON.stringify({ ...good, version: EXPORT_VERSION + 1 }))).toThrow('版本')
    expect(() =>
      parseBackup(JSON.stringify({ ...good, scripts: [{ id: 'x', lines: [] }] })),
    ).toThrow('缺少剧目名')
  })
})

describe('导入清单', () => {
  it('列明剧目数、同名项，并给出两种选法各改动多少', async () => {
    await repo.saveScript(makeScript({ title: '文昭关' }))
    const local = await repo.listScripts()

    const backup = await buildBackup()
    const file: BackupFile = {
      ...backup,
      scripts: [
        makeScript({ title: '文昭关' }), // 同名
        makeScript({ title: '新戏' }), // 本机没有
        makeScript({ title: ' 文昭关 ' }), // 首尾空格也算同名
      ],
    }
    const preview = buildImportPreview(file, local)
    expect(preview.total).toBe(3)
    expect(preview.clashCount).toBe(2)
    expect(preview.newCount).toBe(1)
    expect(preview.merge).toEqual({ add: 1, skip: 2 })
    expect(preview.replace).toEqual({ add: 1, replace: 2 })
    expect(preview.items.find((i) => i.title === '新戏')?.clash).toBe(false)
    expect(preview.items.find((i) => i.title === '文昭关')?.clash).toBe(true)
  })
})

describe('执行导入', () => {
  it('整份并入：同名跳过且本机原内容不动，报告标出被跳过的剧目', async () => {
    const localScript = makeScript({ title: '文昭关', lines: [{ id: 'old', text: '本机原版', cues: [], marks: [] }] })
    await repo.saveScript(localScript)

    const base = await buildBackup()
    const file: BackupFile = {
      ...base,
      scripts: [
        makeScript({ title: '文昭关', lines: [{ id: 'new', text: '文件新版', cues: [], marks: [] }] }),
        makeScript({ title: '新戏' }),
      ],
    }
    const report = await applyImport(file, 'merge')

    expect(report.added).toBe(1)
    expect(report.skipped).toBe(1)
    expect(report.replaced).toBe(0)
    expect(report.items.find((i) => i.title === '文昭关')?.action).toBe('skipped')
    expect(report.items.find((i) => i.title === '新戏')?.action).toBe('added')

    const all = await repo.listScripts()
    expect(all).toHaveLength(2)
    const kept = all.find((s) => s.title === '文昭关')
    expect(kept?.id).toBe(localScript.id)
    expect(kept?.lines[0].text).toBe('本机原版') // 本机内容未被改动
  })

  it('同名替换：本机同名剧目被文件版本替换（含练习次数），其余新增', async () => {
    const localScript = makeScript({ title: '文昭关', lines: [{ id: 'old', text: '本机原版', cues: [], marks: [] }] })
    await repo.saveScript(localScript)
    await repo.bumpPractice(localScript.id, ['old'])

    const fileScript = makeScript({
      title: '文昭关',
      lines: [
        { id: 'n1', text: '文件新版一', cues: [], marks: [] },
        { id: 'n2', text: '文件新版二', cues: [], marks: [] },
      ],
    })
    const base = await buildBackup()
    const file: BackupFile = {
      ...base,
      scripts: [fileScript, makeScript({ title: '新戏' })],
      practice: [{ id: fileScript.id, counts: { n1: 3 } }],
    }
    const report = await applyImport(file, 'replace')

    expect(report.added).toBe(1)
    expect(report.replaced).toBe(1)
    expect(report.skipped).toBe(0)
    const rep = report.items.find((i) => i.title === '文昭关')
    expect(rep?.action).toBe('replaced')
    expect(rep?.lineCount).toBe(2)

    const all = await repo.listScripts()
    expect(all).toHaveLength(2)
    expect(all.some((s) => s.id === localScript.id)).toBe(false) // 本机旧记录已删
    const now = all.find((s) => s.title === '文昭关')
    expect(now?.id).toBe(fileScript.id)
    expect(now?.lines.map((l) => l.text)).toEqual(['文件新版一', '文件新版二'])

    // 练习次数：旧记录随旧剧目删除，文件里的记录落到新 id 上
    expect(await repo.getPracticeCounts(localScript.id)).toEqual({})
    expect(await repo.getPracticeCounts(fileScript.id)).toEqual({ n1: 3 })
  })

  it('设置随导入覆盖本机；文件里的 id 撞上本机不同名剧目时换新 id', async () => {
    const mine = makeScript({ id: 'sc_local_fixed', title: '本机独有' })
    await repo.saveScript(mine)

    const base = await buildBackup()
    const file: BackupFile = {
      ...base,
      scripts: [makeScript({ id: 'sc_local_fixed', title: '外来戏' })], // id 撞车但不同名
      settings: { ...repo.DEFAULT_SETTINGS, speedPxPerSec: 333 },
    }
    const report = await applyImport(file, 'merge')
    expect(report.added).toBe(1)
    expect(report.settingsApplied).toBe(true)

    const all = await repo.listScripts()
    expect(all).toHaveLength(2)
    expect(all.find((s) => s.title === '本机独有')?.id).toBe('sc_local_fixed') // 未被覆盖
    expect(all.find((s) => s.title === '外来戏')?.id).not.toBe('sc_local_fixed')

    const s = await repo.loadSettings()
    expect(s.speedPxPerSec).toBe(333)
  })

  it('中途任何一条失败：整体回滚到导入前的样子，不会只进来一半', async () => {
    const localScript = makeScript({ title: '文昭关' })
    await repo.saveScript(localScript)
    await repo.saveSettings({ ...repo.DEFAULT_SETTINGS, speedPxPerSec: 111 })
    const before = await repo.listScripts()

    const base = await buildBackup()
    const good = makeScript({ title: '会先写入的新戏' })
    const broken = makeScript({ title: '坏记录' }) as Partial<Script>
    delete broken.id // 缺 id：put 时触发 DataError，模拟中途失败
    const file = {
      ...base,
      scripts: [good, broken as Script],
      settings: { ...repo.DEFAULT_SETTINGS, speedPxPerSec: 999 },
    } as BackupFile

    await expect(applyImport(file, 'merge')).rejects.toThrow('回滚')

    // 剧目：一条都没进来，本机原样
    const after = await repo.listScripts()
    expect(after.map((s) => s.id).sort()).toEqual(before.map((s) => s.id).sort())
    expect(after.some((s) => s.title === '会先写入的新戏')).toBe(false)
    // 设置：也未被覆盖
    expect((await repo.loadSettings()).speedPxPerSec).toBe(111)
  })
})

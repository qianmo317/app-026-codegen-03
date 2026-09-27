/**
 * 整机导出 / 导入（换机迁移）。
 *
 * 导出：把本机全部内容（剧目、模板、设置、练习次数）打成一个 JSON 文件，
 *       文件头带格式标识、格式版本与导出时间。
 * 导入：先解析文件生成清单（多少剧目、哪些与本机同名、两种选法各改动多少），
 *       由操作者确认后执行；所有写入放在单个 IndexedDB 事务内完成——
 *       任何一条失败整个事务回滚，本机数据保持导入前的样子，不会只导入一半。
 */
import type { Cue, Line, PromptSettings, Script, Segment } from '../types'
import { idb, openDb, STORE_PRACTICE, STORE_SCRIPTS, STORE_SETTINGS, STORE_TEMPLATES } from './db'
import type { PracticeRecord } from './repo'
import { DEFAULT_SETTINGS } from './repo'

export const EXPORT_FORMAT = 'opera-teleprompter-backup'
export const EXPORT_VERSION = 1

export interface BackupFile {
  format: typeof EXPORT_FORMAT
  version: number
  exportedAt: number
  scripts: Script[]
  templates: Script[]
  settings: PromptSettings | null
  practice: PracticeRecord[]
}

export type ImportMode = 'merge' | 'replace'

export interface PreviewItem {
  title: string
  lineCount: number
  /** 与本机已有剧目同名 */
  clash: boolean
}

export interface ImportPreview {
  version: number
  exportedAt: number
  total: number
  newCount: number
  clashCount: number
  items: PreviewItem[]
  /** 整份并入：新增 add 个、同名跳过 skip 个 */
  merge: { add: number; skip: number }
  /** 同名替换：新增 add 个、替换本机 replace 个 */
  replace: { add: number; replace: number }
  templateCount: number
  hasSettings: boolean
}

export type ReportAction = 'added' | 'replaced' | 'skipped'

export interface ReportItem {
  title: string
  action: ReportAction
  lineCount: number
}

export interface ImportReport {
  mode: ImportMode
  items: ReportItem[]
  added: number
  replaced: number
  skipped: number
  templatesAdded: number
  templatesSkipped: number
  settingsApplied: boolean
}

/* ================= 导出 ================= */

export async function buildBackup(): Promise<BackupFile> {
  const [scripts, templates, rawSettings, practice] = await Promise.all([
    idb.getAll<Script>(STORE_SCRIPTS),
    idb.getAll<Script>(STORE_TEMPLATES),
    idb.get<PromptSettings & { savedAt?: number }>(STORE_SETTINGS, 'app'),
    idb.getAll<PracticeRecord>(STORE_PRACTICE),
  ])
  let settings: PromptSettings | null = null
  if (rawSettings) {
    const merged = { ...DEFAULT_SETTINGS, ...rawSettings } as PromptSettings & { savedAt?: number }
    delete merged.savedAt
    settings = merged
  }
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    scripts,
    templates,
    settings,
    practice,
  }
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2)
}

/* ================= 解析与校验 ================= */

function fail(msg: string): never {
  throw new Error(msg)
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

const CUE_KINDS = new Set(['pause', 'interlude', 'drum', 'note'])

function normalizeCue(raw: unknown): Cue | null {
  const o = asRecord(raw)
  if (!o || typeof o.id !== 'string' || typeof o.kind !== 'string' || !CUE_KINDS.has(o.kind)) return null
  return {
    id: o.id,
    kind: o.kind as Cue['kind'],
    seconds: typeof o.seconds === 'number' ? o.seconds : undefined,
    label: typeof o.label === 'string' ? o.label : undefined,
  }
}

function normalizeLine(raw: unknown, where: string): Line {
  const o = asRecord(raw) ?? fail(`备份文件损坏：${where}不是有效的唱句`)
  if (typeof o.text !== 'string') fail(`备份文件损坏：${where}缺少唱词文本`)
  return {
    id: typeof o.id === 'string' && o.id ? o.id : genId('ln'),
    role: typeof o.role === 'string' ? o.role : undefined,
    text: o.text,
    cues: Array.isArray(o.cues) ? o.cues.map(normalizeCue).filter((c): c is Cue => c !== null) : [],
    marks: Array.isArray(o.marks) ? o.marks.filter((m): m is string => typeof m === 'string') : [],
    note: typeof o.note === 'string' ? o.note : undefined,
  }
}

function normalizeSegment(raw: unknown): Segment {
  const o = asRecord(raw) ?? {}
  return {
    id: typeof o.id === 'string' && o.id ? o.id : genId('sg'),
    title: typeof o.title === 'string' ? o.title : '',
    lineIds: Array.isArray(o.lineIds) ? o.lineIds.filter((x): x is string => typeof x === 'string') : [],
    loop: typeof o.loop === 'boolean' ? o.loop : undefined,
  }
}

function normalizeScript(raw: unknown, where: string): Script {
  const o = asRecord(raw) ?? fail(`备份文件损坏：${where}不是有效的剧目`)
  if (typeof o.id !== 'string' || !o.id) fail(`备份文件损坏：${where}缺少 id`)
  if (typeof o.title !== 'string' || !o.title.trim()) fail(`备份文件损坏：${where}缺少剧目名`)
  if (!Array.isArray(o.lines)) fail(`备份文件损坏：${where}的唱词数据不完整`)
  return {
    id: o.id,
    title: o.title,
    troupe: typeof o.troupe === 'string' ? o.troupe : undefined,
    lines: o.lines.map((l, i) => normalizeLine(l, `${where}第${i + 1}句`)),
    segments: Array.isArray(o.segments) ? o.segments.map(normalizeSegment) : [],
    style: o.style === 'speech' ? 'speech' : 'opera',
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : Date.now(),
  }
}

function normalizePractice(raw: unknown): PracticeRecord[] {
  if (raw == null) return []
  if (!Array.isArray(raw)) fail('备份文件损坏：练习记录格式不对')
  const out: PracticeRecord[] = []
  for (const p of raw) {
    const o = asRecord(p)
    const counts = o ? asRecord(o.counts) : null
    if (!o || typeof o.id !== 'string' || !counts) continue
    const clean: Record<string, number> = {}
    for (const [k, v] of Object.entries(counts)) if (typeof v === 'number') clean[k] = v
    out.push({ id: o.id, counts: clean })
  }
  return out
}

/** 解析并校验备份文件；文件不合法时抛出带中文说明的错误 */
export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    fail('文件不是有效的 JSON，无法导入')
  }
  const o = asRecord(raw) ?? fail('这不是本应用的备份文件')
  if (o.format !== EXPORT_FORMAT) fail('这不是本应用的备份文件（格式标识不符）')
  if (typeof o.version !== 'number') fail('备份文件缺少格式版本号')
  if (o.version > EXPORT_VERSION) {
    fail(`备份文件版本（v${o.version}）高于本应用支持的 v${EXPORT_VERSION}，请升级应用后再导入`)
  }
  if (typeof o.exportedAt !== 'number') fail('备份文件缺少导出时间')

  const scripts = o.scripts == null ? [] : o.scripts
  const templates = o.templates == null ? [] : o.templates
  if (!Array.isArray(scripts)) fail('备份文件损坏：剧目数据格式不对')
  if (!Array.isArray(templates)) fail('备份文件损坏：模板数据格式不对')

  let settings: PromptSettings | null = null
  if (o.settings != null) {
    const s = asRecord(o.settings) ?? fail('备份文件损坏：设置数据无效')
    settings = { ...DEFAULT_SETTINGS, ...(s as Partial<PromptSettings>) }
  }

  return {
    format: EXPORT_FORMAT,
    version: o.version,
    exportedAt: o.exportedAt,
    scripts: scripts.map((s, i) => normalizeScript(s, `第${i + 1}个剧目`)),
    templates: templates.map((s, i) => normalizeScript(s, `第${i + 1}个模板`)),
    settings,
    practice: normalizePractice(o.practice),
  }
}

/* ================= 导入清单 ================= */

export function buildImportPreview(backup: BackupFile, local: Script[]): ImportPreview {
  const localTitles = new Set(local.map((s) => s.title.trim()))
  const items: PreviewItem[] = backup.scripts.map((s) => ({
    title: s.title,
    lineCount: s.lines.length,
    clash: localTitles.has(s.title.trim()),
  }))
  const clashCount = items.filter((i) => i.clash).length
  const newCount = items.length - clashCount
  return {
    version: backup.version,
    exportedAt: backup.exportedAt,
    total: items.length,
    newCount,
    clashCount,
    items,
    merge: { add: newCount, skip: clashCount },
    replace: { add: newCount, replace: clashCount },
    templateCount: backup.templates.length,
    hasSettings: backup.settings !== null,
  }
}

/* ================= 执行导入（单事务，失败整体回滚） ================= */

/**
 * 在单个 IndexedDB 事务内完成全部读与写：
 * 任何一条写入失败（或中途抛错）都会中止事务，本机数据保持导入前的样子。
 */
export async function applyImport(backup: BackupFile, mode: ImportMode): Promise<ImportReport> {
  const db = await openDb()
  return new Promise<ImportReport>((resolve, reject) => {
    const tx = db.transaction([STORE_SCRIPTS, STORE_TEMPLATES, STORE_SETTINGS, STORE_PRACTICE], 'readwrite')
    let report: ImportReport | null = null
    let settingsToCache: (PromptSettings & { savedAt: number }) | null = null

    tx.oncomplete = () => {
      // 事务已提交，再同步 localStorage 设置缓存，保证两边一致
      if (settingsToCache) {
        try {
          localStorage.setItem('otp-settings', JSON.stringify(settingsToCache))
        } catch {
          /* ignore */
        }
      }
      resolve(report as ImportReport)
    }
    tx.onabort = () => {
      reject(new Error(`导入失败：${tx.error?.message ?? '未知错误'}。已回滚到导入前的状态，本机数据未改动`))
    }

    const scriptsOS = tx.objectStore(STORE_SCRIPTS)
    const templatesOS = tx.objectStore(STORE_TEMPLATES)
    const practiceOS = tx.objectStore(STORE_PRACTICE)

    const getScripts = scriptsOS.getAll()
    const getTemplates = templatesOS.getAll()
    let localScripts: Script[] = []
    getScripts.onsuccess = () => {
      localScripts = getScripts.result as Script[]
    }
    getTemplates.onsuccess = () => {
      try {
        report = runPlan(getTemplates.result as Script[])
      } catch {
        // 计划阶段出错：主动中止事务，由 onabort 统一报错回滚
        try {
          tx.abort()
        } catch {
          /* already finished */
        }
      }
    }

    function runPlan(localTemplates: Script[]): ImportReport {
      const localByTitle = new Map<string, Script[]>()
      const usedIds = new Set<string>()
      for (const s of localScripts) {
        usedIds.add(s.id)
        const key = s.title.trim()
        const arr = localByTitle.get(key)
        if (arr) arr.push(s)
        else localByTitle.set(key, [s])
      }

      const practiceById = new Map(backup.practice.map((p) => [p.id, p]))
      const items: ReportItem[] = []
      let added = 0
      let replaced = 0
      let skipped = 0

      for (const fileScript of backup.scripts) {
        const key = fileScript.title.trim()
        const clashes = localByTitle.get(key) ?? []

        if (clashes.length && mode === 'merge') {
          items.push({ title: fileScript.title, action: 'skipped', lineCount: fileScript.lines.length })
          skipped++
          continue
        }

        if (clashes.length && mode === 'replace') {
          // 同名替换：先删掉本机同名剧目及其练习记录，再写入文件里的版本
          for (const old of clashes) {
            scriptsOS.delete(old.id)
            practiceOS.delete(old.id)
            usedIds.delete(old.id)
          }
        }

        const incoming = structuredClone(fileScript)
        // 文件里的 id 若撞上本机其他（不同名）剧目，换新 id，避免误覆盖
        if (usedIds.has(incoming.id)) incoming.id = genId('sc')
        usedIds.add(incoming.id)
        scriptsOS.put(incoming)

        const pr = practiceById.get(fileScript.id)
        if (pr) practiceOS.put({ id: incoming.id, counts: { ...pr.counts } }, incoming.id)

        const action: ReportAction = clashes.length ? 'replaced' : 'added'
        if (action === 'added') added++
        else replaced++
        items.push({ title: incoming.title, action, lineCount: incoming.lines.length })

        // 文件内部若有重名剧目，后续条目应与刚导入的这条也算同名
        localByTitle.set(key, [incoming])
      }

      // 模板：同名跳过，其余并入
      const tplTitles = new Set(localTemplates.map((t) => t.title.trim()))
      const usedTplIds = new Set(localTemplates.map((t) => t.id))
      let templatesAdded = 0
      let templatesSkipped = 0
      for (const tpl of backup.templates) {
        if (tplTitles.has(tpl.title.trim())) {
          templatesSkipped++
          continue
        }
        const copy = structuredClone(tpl)
        if (usedTplIds.has(copy.id)) copy.id = genId('tpl')
        usedTplIds.add(copy.id)
        tplTitles.add(copy.title.trim())
        templatesOS.put(copy)
        templatesAdded++
      }

      // 设置：备份里带了就随导入覆盖本机
      let settingsApplied = false
      if (backup.settings) {
        const rec = { ...DEFAULT_SETTINGS, ...backup.settings, savedAt: Date.now() }
        tx.objectStore(STORE_SETTINGS).put(rec, 'app')
        settingsToCache = rec
        settingsApplied = true
      }

      return { mode, items, added, replaced, skipped, templatesAdded, templatesSkipped, settingsApplied }
    }
  })
}

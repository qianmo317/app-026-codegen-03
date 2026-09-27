/**
 * 数据搬迁：整份导出 / 清单预览 / 事务式导入。
 * 换设备或借电脑演出时，把本机全部内容（剧目、模板、设置、练习记录）打成一个 JSON 文件搬走。
 * 导入在单个 IndexedDB 事务内完成：任何一条失败整体回滚，不允许只进来一半。
 */
import type { PromptSettings, Script } from '../types'
import { idb, idbTx, STORE_PRACTICE, STORE_SCRIPTS, STORE_SETTINGS, STORE_TEMPLATES } from './db'
import { DEFAULT_SETTINGS, listScripts, listTemplates, loadSettings, saveSettings } from './repo'
import type { PracticeRecord } from './repo'

export const EXPORT_FORMAT = 'opera-teleprompter-backup'
export const EXPORT_VERSION = 1

export interface ExportBundle {
  format: typeof EXPORT_FORMAT
  version: number
  exportedAt: number
  scripts: Script[]
  templates: Script[]
  settings: PromptSettings | null
  practice: PracticeRecord[]
}

/** merge = 整份并入（同名跳过，本机已有内容不动）；overwrite = 同名时用文件里的替换本机的 */
export type ImportMode = 'merge' | 'overwrite'

export interface ImportItemPlan {
  title: string
  lines: number
  segments: number
  /** 与本机已有剧目同名 */
  conflict: boolean
}

export interface ImportAnalysis {
  version: number
  exportedAt: number
  items: ImportItemPlan[]
  /** 与本机同名的剧目名（保持文件内顺序） */
  conflicts: string[]
  /** 整份并入：新增 add 个，skip 个同名保持本机现状 */
  merge: { add: number; skip: number }
  /** 同名替换：新增 add 个，替换 replace 个本机同名剧目 */
  overwrite: { add: number; replace: number }
  templates: number
  practiceRecords: number
  hasSettings: boolean
}

export interface ImportReportEntry {
  title: string
  lines: number
}

export interface ImportReport {
  mode: ImportMode
  added: ImportReportEntry[]
  replaced: ImportReportEntry[]
  skipped: ImportReportEntry[]
  templatesAdded: number
  templatesReplaced: number
  templatesSkipped: number
  practiceRecords: number
  settingsApplied: boolean
}

/* ---------- 导出 ---------- */

export async function buildExportBundle(): Promise<ExportBundle> {
  const [scripts, templates, practice, settings] = await Promise.all([
    idb.getAll<Script>(STORE_SCRIPTS),
    idb.getAll<Script>(STORE_TEMPLATES),
    idb.getAll<PracticeRecord>(STORE_PRACTICE),
    loadSettings(),
  ])
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

export function serializeBundle(bundle: ExportBundle): string {
  return JSON.stringify(bundle, null, 2)
}

/* ---------- 解析与校验 ---------- */

export function parseBundle(text: string): ExportBundle {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('文件不是有效的 JSON，无法导入')
  }
  const b = raw as Partial<ExportBundle> | null
  if (!b || typeof b !== 'object') throw new Error('文件内容不是有效的备份数据')
  if (b.format !== EXPORT_FORMAT) throw new Error('这不是本应用的备份文件（缺少格式标识）')
  if (typeof b.version !== 'number') throw new Error('备份文件缺少格式版本号')
  if (b.version > EXPORT_VERSION) {
    throw new Error(`备份文件格式为 v${b.version}，高于本应用支持的 v${EXPORT_VERSION}，请在新版本应用中打开`)
  }
  if (typeof b.exportedAt !== 'number') throw new Error('备份文件缺少导出时间')
  if (!Array.isArray(b.scripts)) throw new Error('备份文件缺少剧目数据')
  if (!Array.isArray(b.templates)) throw new Error('备份文件缺少模板数据')
  if (!Array.isArray(b.practice)) throw new Error('备份文件缺少练习记录数据')
  b.scripts.forEach((s, i) => assertScript(s, `第 ${i + 1} 个剧目`))
  b.templates.forEach((s, i) => assertScript(s, `第 ${i + 1} 个模板`))
  if (b.settings !== null && (typeof b.settings !== 'object' || Array.isArray(b.settings))) {
    throw new Error('备份文件中的应用设置数据损坏')
  }
  return b as ExportBundle
}

function assertScript(s: unknown, where: string): asserts s is Script {
  const o = s as Partial<Script> | null
  if (!o || typeof o !== 'object') throw new Error(`${where}：数据不是有效对象`)
  if (typeof o.id !== 'string' || !o.id) throw new Error(`${where}：缺少 id`)
  if (typeof o.title !== 'string' || !o.title) throw new Error(`${where}：缺少剧名`)
  if (o.style !== 'opera' && o.style !== 'speech') throw new Error(`${where}「${o.title}」：类型无效`)
  if (!Array.isArray(o.lines)) throw new Error(`${where}「${o.title}」：唱词数据损坏`)
  if (!Array.isArray(o.segments)) throw new Error(`${where}「${o.title}」：唱段数据损坏`)
  if (typeof o.updatedAt !== 'number') throw new Error(`${where}「${o.title}」：缺少更新时间`)
  for (const line of o.lines) {
    if (!line || typeof line.id !== 'string' || typeof line.text !== 'string') {
      throw new Error(`${where}「${o.title}」：存在损坏的唱词行`)
    }
    if (!Array.isArray(line.cues) || !Array.isArray(line.marks)) {
      throw new Error(`${where}「${o.title}」：唱词行的标记数据损坏`)
    }
  }
  for (const seg of o.segments) {
    if (!seg || typeof seg.id !== 'string' || typeof seg.title !== 'string' || !Array.isArray(seg.lineIds)) {
      throw new Error(`${where}「${o.title}」：存在损坏的唱段`)
    }
  }
}

/* ---------- 清单分析 ---------- */

export function analyzeBundle(bundle: ExportBundle, localScripts: Script[]): ImportAnalysis {
  const localTitles = new Set(localScripts.map((s) => s.title))
  const items: ImportItemPlan[] = bundle.scripts.map((s) => ({
    title: s.title,
    lines: s.lines.length,
    segments: s.segments.length,
    conflict: localTitles.has(s.title),
  }))
  const conflicts = items.filter((i) => i.conflict).map((i) => i.title)
  const add = items.length - conflicts.length
  return {
    version: bundle.version,
    exportedAt: bundle.exportedAt,
    items,
    conflicts,
    merge: { add, skip: conflicts.length },
    overwrite: { add, replace: conflicts.length },
    templates: bundle.templates.length,
    practiceRecords: bundle.practice.length,
    hasSettings: bundle.settings !== null,
  }
}

/* ---------- 导入 ---------- */

interface WritePlan {
  putScripts: Script[]
  deleteScriptIds: string[]
  putTemplates: Script[]
  putPractice: PracticeRecord[]
  deletePracticeIds: string[]
  settings: (PromptSettings & { savedAt: number }) | null
  report: ImportReport
}

/**
 * 纯函数：根据文件内容与本机现状算出写入计划（不写库，便于测试）。
 * 剧目 id 策略：新增时保留文件 id（练习记录关联不断）；仅当文件 id 撞上本机「不同名」
 * 剧目时重新生成，并把对应练习记录 remap 到新 id。
 */
export function planImport(
  bundle: ExportBundle,
  localScripts: Script[],
  localTemplates: Script[],
  mode: ImportMode,
  newId: () => string,
  now: number,
): WritePlan {
  const localByTitle = new Map(localScripts.map((s) => [s.title, s]))
  const takenIds = new Set(localScripts.map((s) => s.id))
  const plan: WritePlan = {
    putScripts: [],
    deleteScriptIds: [],
    putTemplates: [],
    putPractice: [],
    deletePracticeIds: [],
    settings: null,
    report: {
      mode,
      added: [],
      replaced: [],
      skipped: [],
      templatesAdded: 0,
      templatesReplaced: 0,
      templatesSkipped: 0,
      practiceRecords: 0,
      settingsApplied: false,
    },
  }
  const idRemap = new Map<string, string>() // 文件剧目 id → 写入后的最终 id

  for (const raw of bundle.scripts) {
    const s: Script = { ...raw }
    const local = localByTitle.get(s.title)
    if (local && mode === 'merge') {
      plan.report.skipped.push({ title: s.title, lines: s.lines.length })
      continue
    }
    if (local) {
      // overwrite：删除本机同名（连同其练习记录），以文件内容为准
      plan.deleteScriptIds.push(local.id)
      plan.deletePracticeIds.push(local.id)
      takenIds.delete(local.id)
      plan.report.replaced.push({ title: s.title, lines: s.lines.length })
    } else {
      plan.report.added.push({ title: s.title, lines: s.lines.length })
    }
    if (takenIds.has(s.id)) s.id = newId() // 撞了本机不同名剧目的 id → 换新 id
    takenIds.add(s.id)
    idRemap.set(raw.id, s.id)
    plan.putScripts.push(s)
  }

  // 练习记录只随本次实际写入的剧目走（被跳过的剧目及其记录都不动）
  for (const p of bundle.practice) {
    const target = idRemap.get(p.id)
    if (!target) continue
    plan.putPractice.push({ id: target, counts: { ...p.counts } })
  }
  plan.report.practiceRecords = plan.putPractice.length

  const localTplIds = new Set(localTemplates.map((t) => t.id))
  for (const raw of bundle.templates) {
    const t: Script = { ...raw }
    if (localTplIds.has(t.id)) {
      if (mode === 'merge') {
        plan.report.templatesSkipped++
        continue
      }
      plan.report.templatesReplaced++
    } else {
      plan.report.templatesAdded++
    }
    plan.putTemplates.push(t)
  }

  if (bundle.settings) {
    plan.settings = { ...DEFAULT_SETTINGS, ...bundle.settings, savedAt: now }
    plan.report.settingsApplied = true
  }
  return plan
}

/**
 * 事务式导入：全部写入在一个 IndexedDB 事务内完成，
 * 任何一条失败 → 事务 abort → 回滚到导入前的样子，不会只进来一半。
 */
export async function applyImport(
  bundle: ExportBundle,
  mode: ImportMode,
  newId: () => string = genScriptId,
): Promise<ImportReport> {
  const [localScripts, localTemplates] = await Promise.all([listScripts(), listTemplates()])
  const plan = planImport(bundle, localScripts, localTemplates, mode, newId, Date.now())
  await idbTx([STORE_SCRIPTS, STORE_TEMPLATES, STORE_PRACTICE, STORE_SETTINGS], async (ops) => {
    for (const id of plan.deleteScriptIds) await ops.delete(STORE_SCRIPTS, id)
    for (const id of plan.deletePracticeIds) await ops.delete(STORE_PRACTICE, id)
    for (const s of plan.putScripts) await ops.put(STORE_SCRIPTS, s)
    for (const t of plan.putTemplates) await ops.put(STORE_TEMPLATES, t)
    for (const p of plan.putPractice) await ops.put(STORE_PRACTICE, p, p.id)
    if (plan.settings) await ops.put(STORE_SETTINGS, plan.settings, 'app')
  })
  // 事务提交成功后才补 localStorage 同步直写（LS 无法纳入 IDB 事务；若事务失败回滚，LS 保持原样）
  if (plan.settings) saveSettings(plan.settings)
  return plan.report
}

function genScriptId() {
  return `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

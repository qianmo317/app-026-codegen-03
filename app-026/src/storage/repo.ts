import type { PromptSettings, Script } from '../types'
import { idb, STORE_PRACTICE, STORE_SCRIPTS, STORE_SETTINGS, STORE_TEMPLATES } from './db'

export const DEFAULT_SETTINGS: PromptSettings = {
  fontSizePx: 48,
  autoFit: true,
  autoScroll: true,
  speedPxPerSec: 90,
  theme: 'dark',
  holdOnCue: true,
  lockStage: false,
}

/* ---------- Scripts ---------- */

export async function listScripts(): Promise<Script[]> {
  const all = await idb.getAll<Script>(STORE_SCRIPTS)
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getScript(id: string): Promise<Script | undefined> {
  return idb.get<Script>(STORE_SCRIPTS, id)
}

export async function saveScript(script: Script): Promise<void> {
  await idb.put(STORE_SCRIPTS, { ...script, updatedAt: Date.now() })
}

export async function deleteScript(id: string): Promise<void> {
  await idb.delete(STORE_SCRIPTS, id)
}

/* ---------- Templates ---------- */

export async function listTemplates(): Promise<Script[]> {
  return idb.getAll<Script>(STORE_TEMPLATES)
}

export async function saveAsTemplate(script: Script): Promise<Script> {
  const copy: Script = {
    ...structuredClone(script),
    id: `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: `模板·${script.title}`,
    updatedAt: Date.now(),
  }
  await idb.put(STORE_TEMPLATES, copy)
  return copy
}

export async function deleteTemplate(id: string): Promise<void> {
  await idb.delete(STORE_TEMPLATES, id)
}

export function newScriptFrom(template: Script): Script {
  return {
    ...structuredClone(template),
    id: `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: template.title.replace(/^模板·/, ''),
    updatedAt: Date.now(),
  }
}

/* ---------- Settings ---------- */

/** localStorage 直写缓存键：页面卸载时 IndexedDB 写入不可靠，用同步缓存兜底 */
const LS_SETTINGS = 'otp-settings'

export async function loadSettings(): Promise<PromptSettings> {
  const saved = await idb.get<PromptSettings & { savedAt?: number }>(STORE_SETTINGS, 'app')
  let best: (PromptSettings & { savedAt?: number }) | undefined = saved ?? undefined
  try {
    const raw = localStorage.getItem(LS_SETTINGS)
    if (raw) {
      const cached = JSON.parse(raw) as PromptSettings & { savedAt?: number }
      if (!best || (cached.savedAt ?? 0) >= (best.savedAt ?? 0)) best = cached
    }
  } catch {
    /* ignore */
  }
  if (!best) return { ...DEFAULT_SETTINGS }
  const rec = { ...best } as PromptSettings & Record<string, unknown>
  delete rec.savedAt
  return { ...DEFAULT_SETTINGS, ...rec }
}

/** 立即持久化：localStorage 同步直写 + IndexedDB 异步落盘（不做防抖，避免卸载丢设置） */
export function saveSettings(s: PromptSettings): void {
  const rec = { ...s, savedAt: Date.now() }
  try {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(rec))
  } catch {
    /* ignore */
  }
  void idb.put(STORE_SETTINGS, rec, 'app')
}

/* ---------- Practice（本条已练 N 次） ---------- */

export interface PracticeRecord {
  id: string
  counts: Record<string, number>
}

export async function getPracticeCounts(scriptId: string): Promise<Record<string, number>> {
  const rec = await idb.get<PracticeRecord>(STORE_PRACTICE, scriptId)
  return rec?.counts ?? {}
}

export async function bumpPractice(scriptId: string, lineIds: string[]): Promise<Record<string, number>> {
  const counts = await getPracticeCounts(scriptId)
  for (const id of lineIds) counts[id] = (counts[id] ?? 0) + 1
  await idb.put(STORE_PRACTICE, { id: scriptId, counts } satisfies PracticeRecord, scriptId)
  return counts
}

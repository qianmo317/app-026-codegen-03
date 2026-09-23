import { useCallback, useEffect, useRef, useState } from 'react'
import type { Line, PromptSettings, Script } from '../types'
import { ScrollEngine, attachDriver } from '../engine/scroller'
import { lineHoldSeconds, lineHoldLabel } from '../engine/cues'
import * as repo from '../storage/repo'

/** 简易异步加载 hook */
export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[]): { data: T | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    fetcher().then((d) => {
      if (alive) setData(d)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, reload }
}

/** 全局设置：加载 + 立即保存（repo 内含 localStorage 同步兜底，防卸载丢数据） */
export function useSettings() {
  const [settings, setSettings] = useState<PromptSettings | null>(null)

  useEffect(() => {
    repo.loadSettings().then(setSettings)
  }, [])

  const patch = useCallback((p: Partial<PromptSettings>) => {
    setSettings((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...p }
      repo.saveSettings(next)
      return next
    })
  }, [])

  return { settings, patch }
}

/** 单个剧本：加载 + 防抖自动保存 */
export function useScript(id: string | undefined) {
  const [script, setScript] = useState<Script | null>(null)
  const [saved, setSaved] = useState(true)
  const timer = useRef<number | undefined>(undefined)
  const scriptRef = useRef(script)
  scriptRef.current = script

  useEffect(() => {
    if (!id) return
    setScript(null)
    repo.getScript(id).then((s) => setScript(s ?? null))
  }, [id])

  const mutate = useCallback((fn: (s: Script) => Script) => {
    setScript((prev) => {
      if (!prev) return prev
      const next = fn(prev)
      next.updatedAt = Date.now()
      window.clearTimeout(timer.current)
      setSaved(false)
      timer.current = window.setTimeout(() => {
        repo.saveScript(next).then(() => setSaved(true))
      }, 400)
      return next
    })
  }, [])

  const saveNow = useCallback(async () => {
    if (scriptRef.current) await repo.saveScript(scriptRef.current)
  }, [])

  return { script, mutate, saved, saveNow }
}

/** 循环练习计数 */
export function usePractice(scriptId: string | undefined) {
  const [counts, setCounts] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!scriptId) return
    repo.getPracticeCounts(scriptId).then(setCounts)
  }, [scriptId])
  const bump = useCallback(
    (lineIds: string[]) => {
      if (!scriptId) return
      repo.bumpPractice(scriptId, lineIds).then(setCounts)
    },
    [scriptId],
  )
  return { counts, bump }
}

/** 滚动引擎实例 + rAF 驱动 + 设置同步 */
export function useEngine(settings: PromptSettings | null) {
  const ref = useRef<ScrollEngine | null>(null)
  if (!ref.current) ref.current = new ScrollEngine()
  const engine = ref.current

  useEffect(() => {
    const stop = attachDriver(engine)
    return stop
  }, [engine])

  useEffect(() => {
    if (!settings) return
    engine.setSpeed(settings.speedPxPerSec)
    engine.holdOnCue = settings.holdOnCue
  }, [engine, settings?.speedPxPerSec, settings?.holdOnCue, settings !== null])

  return engine
}

export function engineHolds(lines: Line[]): number[] {
  return lines.map(lineHoldSeconds)
}

export function engineHoldLabelFor(lines: Line[], idx: number): string {
  const line = lines[idx]
  return line ? lineHoldLabel(line) : ''
}

/** 主题应用到 <html data-theme> */
export function applyTheme(theme: PromptSettings['theme']) {
  document.documentElement.dataset.theme = theme
}

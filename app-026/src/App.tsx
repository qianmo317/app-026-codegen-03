import { createContext, useContext, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useRoute, matchRoute, navigate } from './router'
import { useSettings, applyTheme } from './state/hooks'
import { Home } from './pages/Home'
import { ScriptEditor } from './pages/ScriptEditor'
import { Prompt } from './pages/Prompt'
import { Stage } from './pages/Stage'
import { Remotes } from './pages/Remotes'
import { Settings } from './pages/Settings'
import { PrintView } from './pages/Print'
import type { PromptSettings } from './types'

interface Ctx {
  settings: PromptSettings | null
  patch: (p: Partial<PromptSettings>) => void
}
const SettingsCtx = createContext<Ctx>({ settings: null, patch: () => {} })
export const useSettingsCtx = () => useContext(SettingsCtx)

export default function App() {
  const path = useRoute()
  const { settings, patch } = useSettings()

  useEffect(() => {
    if (settings) applyTheme(settings.theme)
  }, [settings?.theme])

  let page: ReactNode = null
  let m: Record<string, string> | null

  if ((m = matchRoute(path, '/script/:id'))) page = <ScriptEditor id={m.id} />
  else if ((m = matchRoute(path, '/prompt/:id/stage'))) page = <Stage id={m.id} />
  else if ((m = matchRoute(path, '/prompt/:id'))) page = <Prompt id={m.id} />
  else if ((m = matchRoute(path, '/print/:id'))) page = <PrintView id={m.id} />
  else if ((m = matchRoute(path, '/remotes'))) page = <Remotes />
  else if ((m = matchRoute(path, '/settings'))) page = <Settings />
  else if (path === '/') page = <Home />
  else {
    page = (
      <div className="page center">
        <p>页面不存在</p>
        <button className="btn" onClick={() => navigate('/')}>返回首页</button>
      </div>
    )
  }

  return (
    <SettingsCtx.Provider value={{ settings, patch }}>
      {settings ? page : <div className="page center">加载中…</div>}
    </SettingsCtx.Provider>
  )
}

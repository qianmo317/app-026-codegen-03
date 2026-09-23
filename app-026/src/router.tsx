import { useEffect, useState } from 'react'
import type { AnchorHTMLAttributes, MouseEvent } from 'react'

const listeners = new Set<() => void>()

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) history.replaceState(null, '', to)
  else history.pushState(null, '', to)
  listeners.forEach((f) => f())
}

export function useRoute(): string {
  const [path, setPath] = useState(() => location.pathname)
  useEffect(() => {
    const on = () => setPath(location.pathname)
    window.addEventListener('popstate', on)
    listeners.add(on)
    return () => {
      window.removeEventListener('popstate', on)
      listeners.delete(on)
    }
  }, [])
  return path
}

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string
}

export function Link({ to, onClick, ...rest }: LinkProps) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    navigate(to)
  }
  return <a href={to} onClick={handle} {...rest} />
}

/** 匹配 /prefix/:id 形式的路径，返回参数或 null */
export function matchRoute(path: string, pattern: string): Record<string, string> | null {
  const pp = pattern.split('/').filter(Boolean)
  const aa = path.split('/').filter(Boolean)
  if (pp.length !== aa.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(aa[i])
    else if (pp[i] !== aa[i]) return null
  }
  return params
}

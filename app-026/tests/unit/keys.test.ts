import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  DEFAULT_KEYMAP,
  actionForKey,
  loadKeymap,
  saveKeymap,
  resetKeymap,
  normalizeKey,
  keyLabel,
} from '../../src/engine/keys'
import type { Keymap } from '../../src/engine/keys'

function keyEv(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, bubbles: true })
}

beforeEach(() => resetKeymap())

describe('快捷键映射（验收：全部生效、可自定义、持久化）', () => {
  it('默认映射：空格播放、↑↓调速、←→跳段、L 循环、Esc 解锁', () => {
    expect(actionForKey(keyEv(' '), DEFAULT_KEYMAP)?.action).toBe('playPause')
    expect(actionForKey(keyEv('ArrowUp'), DEFAULT_KEYMAP)?.action).toBe('speedUp')
    expect(actionForKey(keyEv('ArrowDown'), DEFAULT_KEYMAP)?.action).toBe('speedDown')
    expect(actionForKey(keyEv('ArrowLeft'), DEFAULT_KEYMAP)?.action).toBe('prevSegment')
    expect(actionForKey(keyEv('ArrowRight'), DEFAULT_KEYMAP)?.action).toBe('nextSegment')
    expect(actionForKey(keyEv('l'), DEFAULT_KEYMAP)?.action).toBe('toggleLoop')
    expect(actionForKey(keyEv('Escape'), DEFAULT_KEYMAP)?.action).toBe('unlock')
    expect(actionForKey(keyEv('x'), DEFAULT_KEYMAP)).toBeNull()
  })

  it('数字键 1~9 固定跳段', () => {
    expect(actionForKey(keyEv('5'), DEFAULT_KEYMAP)).toEqual({ action: 'jumpSegment', digit: 5 })
  })

  it('自定义映射生效并持久化到 localStorage', () => {
    const custom: Keymap = { ...DEFAULT_KEYMAP, playPause: 'p', toggleLoop: 'r' }
    saveKeymap(custom)
    const loaded = loadKeymap()
    expect(loaded.playPause).toBe('p')
    expect(actionForKey(keyEv('p'), loaded)?.action).toBe('playPause')
    expect(actionForKey(keyEv('r'), loaded)?.action).toBe('toggleLoop')
    expect(actionForKey(keyEv(' '), loaded)).toBeNull() // 原键已让出
  })

  it('损坏的存储内容回退默认', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{broken json', setItem() {}, removeItem() {} })
    try {
      expect(loadKeymap()).toEqual(DEFAULT_KEYMAP)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('normalizeKey 大写转小写；keyLabel 空格显示 Space', () => {
    expect(normalizeKey(keyEv('P'))).toBe('p')
    expect(keyLabel(' ')).toBe('Space')
  })
})

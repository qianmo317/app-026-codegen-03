// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  genRemoteCode,
  isRemoteCommand,
  isRemoteStatus,
  openChannel,
  postCommand,
  postStatus,
  remoteChannelName,
} from '../../src/engine/remote'

describe('遥控通道（BroadcastChannel 配对）', () => {
  it('配对码为 4 位无歧义字符', () => {
    for (let i = 0; i < 20; i++) expect(genRemoteCode()).toMatch(/^[A-Z2-9]{4}$/)
  })

  it('指令：遥控端 → 提词端', () => {
    const code = 'TEST'
    const prompter = openChannel(code)!
    const remote = openChannel(code)!
    expect(remoteChannelName(code)).toContain('otp-remote-')
    const received: unknown[] = []
    prompter.onmessage = (ev) => received.push(ev.data)
    postCommand(remote, { type: 'toggle' })
    postCommand(remote, { type: 'jump', index: 2 })
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(received.length).toBe(2)
        expect(isRemoteCommand(received[0])).toBe(true)
        expect(isRemoteStatus(received[0])).toBe(false)
        expect((received[1] as { payload: { type: string; index: number } }).payload).toEqual({ type: 'jump', index: 2 })
        prompter.close()
        remote.close()
        resolve()
      }, 50)
    })
  })

  it('状态：提词端 → 遥控端', () => {
    const prompter = openChannel('STAT')!
    const remote = openChannel('STAT')!
    const received: unknown[] = []
    remote.onmessage = (ev) => received.push(ev.data)
    postStatus(prompter, {
      playing: true,
      holding: false,
      holdRemaining: 0,
      line: 3,
      lineCount: 10,
      segment: 1,
      segmentCount: 2,
      speed: 90,
      loop: false,
    })
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(received.length).toBe(1)
        expect(isRemoteStatus(received[0])).toBe(true)
        const payload = (received[0] as { payload: { playing: boolean; line: number } }).payload
        expect(payload.playing).toBe(true)
        expect(payload.line).toBe(3)
        prompter.close()
        remote.close()
        resolve()
      }, 50)
    })
  })
})

import { test, expect, chromium } from '@playwright/test'
import { createScriptViaUI, ensurePlaying, SAMPLE_SCRIPT } from './helpers'

test('遥控端通过配对码控制提词端（BroadcastChannel）', async () => {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const prompter = await context.newPage()

  const id = await createScriptViaUI(prompter, '遥控E2E', SAMPLE_SCRIPT)
  await prompter.goto(`/prompt/${id}`)
  const canvas = prompter.getByTestId('prompt-canvas')
  await ensurePlaying(prompter)

  const codeText = await prompter.getByTestId('remote-code').innerText()
  const code = codeText.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  expect(code).toHaveLength(4)

  const remote = await context.newPage()
  await remote.goto('/remotes')
  await remote.getByTestId('remote-code-input').fill(code)
  await expect(remote.getByTestId('remote-status')).toContainText('已连接', { timeout: 10000 })

  // 暂停 / 播放
  await remote.getByTestId('remote-play').click()
  await expect(canvas).toHaveAttribute('data-state', 'idle', { timeout: 5000 })
  await remote.getByTestId('remote-play').click()
  await expect(canvas).toHaveAttribute('data-state', 'playing', { timeout: 5000 })

  // 数字 2 → 提词端跳到第二段（行索引 4）
  await remote.getByTestId('remote-digit-2').click()
  await expect(canvas.locator('.pline[data-current]')).toHaveAttribute('data-line-index', '4', { timeout: 5000 })

  // 提速 → 提词端速度变化
  const before = await prompter.getByTestId('speed-value').innerText()
  await remote.getByTestId('remote-faster').click()
  await expect(prompter.getByTestId('speed-value')).not.toHaveText(before, { timeout: 5000 })

  // 遥控端状态面板显示提词端进度
  await expect(remote.getByTestId('remote-info')).toContainText('段', { timeout: 5000 })

  await context.close()
  await browser.close()
})

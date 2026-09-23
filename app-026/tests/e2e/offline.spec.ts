import { test, expect } from '@playwright/test'
import { createScriptViaUI, ensurePlaying, SAMPLE_SCRIPT } from './helpers'

test('断网可用：加载后所有操作纯本地（IndexedDB），SPA 内跳转与保存正常', async ({ page, context }) => {
  const id = await createScriptViaUI(page, '断网E2E', SAMPLE_SCRIPT)

  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await context.setOffline(true)

  // 客户端路由跳转（不发起网络请求）
  await page.getByRole('link', { name: '排练' }).click()
  await page.waitForURL(`**/prompt/${id}`)
  const canvas = page.getByTestId('prompt-canvas')
  await ensurePlaying(page)

  // 交互：暂停/继续
  await page.keyboard.press('Space')
  await expect(canvas).toHaveAttribute('data-state', 'idle')

  // 返回编辑页（客户端路由）并新增标记
  await page.locator('a[href*="/script/"]').first().click()
  await page.waitForURL(`**/script/${id}`)
  await page.getByTestId('mark-power').first().click()
  await expect(page.locator('[data-testid=line-row][data-marks*=power]').first()).toBeVisible()
  await expect(page.getByTestId('save-state')).toHaveText('已保存', { timeout: 6000 })

  expect(errors, '断网时不应有页面错误').toEqual([])
})

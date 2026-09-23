import { test, expect } from '@playwright/test'
import { createScriptViaUI, blurActive, ensurePlaying, setInputValue, SAMPLE_SCRIPT } from './helpers'

test('全流程：粘贴导入 → 标记批注 → 排练（停留/跳过/调速/跳段/循环）→ 演出锁定长按 → 持久化', async ({ page }) => {
  const id = await createScriptViaUI(page, '文昭关E2E', SAMPLE_SCRIPT)

  // ---- 编辑页：解析结果 ----
  await expect(page.getByTestId('segment-header')).toHaveCount(2)
  await expect(page.getByTestId('line-row')).toHaveCount(8)
  // 过门标记解析为 cue chip
  await expect(page.locator('[data-testid=cue-chip][data-kind=interlude]').first()).toBeVisible()

  // 标记「易错句」+ 批注
  await page.getByTestId('mark-hard').first().click()
  await expect(page.locator('[data-testid=line-row][data-marks*=hard]').first()).toBeVisible()
  await page.locator('.line-note').first().fill('这句要拖腔')
  await expect(page.getByTestId('save-state')).toHaveText('已保存', { timeout: 6000 })

  // ---- 排练页 ----
  await page.getByRole('link', { name: '排练' }).click()
  await page.waitForURL(`**/prompt/${id}`)
  const canvas = page.getByTestId('prompt-canvas')
  await ensurePlaying(page) // 自动滚动已开始（开场命中过门会先跳过）

  // 空格：暂停 / 继续
  await blurActive(page)
  await page.keyboard.press('Space')
  await expect(canvas).toHaveAttribute('data-state', 'idle')
  await page.keyboard.press('Space')
  await expect(canvas).not.toHaveAttribute('data-state', 'idle')

  // 过门 5 秒：第一行触发停留；停留期间位置不动；手动跳过
  const overlay = page.getByTestId('hold-overlay')
  await expect(overlay).toBeVisible({ timeout: 8000 })
  await expect(overlay).toContainText('剩余')
  const t1 = await canvas.evaluate((el) => (el.querySelector('.prompt-content') as HTMLElement).style.transform)
  await page.waitForTimeout(600)
  const t2 = await canvas.evaluate((el) => (el.querySelector('.prompt-content') as HTMLElement).style.transform)
  expect(t1).toBe(t2) // holding 状态下不滚动
  await page.getByTestId('btn-skip-hold').click()
  await expect(overlay).toBeHidden()

  // ↑ 加速生效
  await blurActive(page)
  const before = Number((await page.getByTestId('speed-value').innerText()).replace(/px\/s/, ''))
  await page.keyboard.press('ArrowUp')
  await expect
    .poll(
      async () => Number((await page.getByTestId('speed-value').innerText()).replace(/px\/s/, '')),
      { timeout: 3000 },
    )
    .toBe(before + 10)

  // 数字键 2 → 跳到第二段（第 5 行，索引 4）
  await page.keyboard.press('2')
  await expect(canvas.locator('.pline[data-current]')).toHaveAttribute('data-line-index', '4', { timeout: 8000 })

  // ← 上一段回到第一段
  await page.keyboard.press('ArrowLeft')
  await expect(canvas.locator('.pline[data-current]')).toHaveAttribute('data-line-index', '0', { timeout: 8000 })

  // 循环本段：等真正跑完一圈（loop-count 从 ×0 变为 ×1）
  await page.getByTestId('btn-loop').click()
  await expect(page.getByTestId('loop-count')).toHaveText(/×[1-9]/, { timeout: 25000 })
  await page.getByTestId('btn-loop').click()

  // 当前行的练习次数徽标（循环计数后）
  await expect(page.getByTestId('practice-badge')).toContainText('已练', { timeout: 8000 })

  // 主题循环：dark → light
  await page.locator('[aria-label="切换主题"]').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  // ---- 演出模式 ----
  await page.getByTestId('btn-stage').click()
  await page.waitForURL(`**/prompt/${id}/stage`)
  const stage = page.getByTestId('stage-root')
  await expect(stage).toBeVisible()

  // 锁定：所有点击无效
  await page.getByTestId('btn-lock').click()
  await expect(page.getByTestId('lock-shield')).toBeVisible()
  await expect(page.getByTestId('stage-controls')).toHaveCount(0)
  const shield = page.getByTestId('lock-shield')
  const box = (await shield.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2) // 点击无效
  await expect(page.getByTestId('stage-controls')).toHaveCount(0)

  // 长按 2 秒解锁（进度环走满后盾层直接卸载，故断言盾层消失而非 "1.00"）
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  const ring = page.getByTestId('unlock-ring')
  await expect(ring).toBeVisible()
  await page.waitForTimeout(300)
  const p1 = Number(await ring.getAttribute('data-progress'))
  expect(p1).toBeGreaterThan(0)
  await expect(page.getByTestId('lock-shield')).toHaveCount(0, { timeout: 4000 })
  await page.mouse.up()
  await expect(page.getByTestId('lock-shield')).toHaveCount(0)
  await expect(page.getByTestId('stage-controls')).toBeVisible()

  // 退出演出模式
  await page.getByTestId('btn-exit').click()
  await page.waitForURL(`**/prompt/${id}`)

  // ---- 持久化：刷新后剧本与标记仍在 ----
  await page.goto(`/script/${id}`)
  await expect(page.locator('[data-testid=line-row][data-marks*=hard]').first()).toBeVisible()
  await expect(page.locator('.line-note').first()).toHaveValue('这句要拖腔')
})

test('设置：手动字号生效、键位自定义并持久化、数字键跳段', async ({ page }) => {
  const id = await createScriptViaUI(page, '设置E2E', SAMPLE_SCRIPT)
  await page.goto('/settings')

  // 关闭自动字号 → 手动 40px
  await page.getByTestId('set-autofit').uncheck()
  await setInputValue(page, 'set-fontsize', '40')
  await page.getByTestId('speed-display').waitFor()

  // 键位：播放/暂停 改为 p
  await page.getByTestId('remap-playPause').click()
  await page.keyboard.press('p')
  await expect(page.locator('.key-cell').first()).toHaveText('p')

  // 排练页：字号 40 生效，p 键可控（空格已不再绑定播放）
  await page.goto(`/prompt/${id}`)
  const canvas = page.getByTestId('prompt-canvas')
  await expect(canvas.locator('.prompt-content')).toHaveAttribute('data-fontsize', '40')
  await ensurePlaying(page, 'p')
  await blurActive(page)
  await page.keyboard.press('p')
  await expect(canvas).toHaveAttribute('data-state', 'idle')
  await page.keyboard.press('p')
  await expect(canvas).toHaveAttribute('data-state', 'playing')

  // 刷新后键位仍在（localStorage 持久化）
  await page.goto('/settings')
  await expect(page.locator('.key-cell').first()).toHaveText('p')
  await expect(page.getByTestId('set-autofit')).not.toBeChecked() // IndexedDB 设置持久化
})

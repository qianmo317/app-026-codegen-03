import { test, expect } from '@playwright/test'
import { createScriptViaUI, SAMPLE_SCRIPT } from './helpers'

test('数据搬迁：导出 → 清单预览（同名标注）→ 整份并入 → 同名替换 → 坏文件报错', async ({ page }) => {
  // 建两个剧目作为「本机全部资料」
  await createScriptViaUI(page, '搬迁甲', SAMPLE_SCRIPT)
  await createScriptViaUI(page, '搬迁乙', SAMPLE_SCRIPT)

  // ---- 导出：打成一个文件 ----
  await page.goto('/settings')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('btn-export').click()])
  expect(download.suggestedFilename()).toMatch(/^opera-teleprompter-backup-.*\.json$/)
  const filePath = (await download.path())!

  // ---- 模拟另一台设备：本机删掉「搬迁乙」----
  page.on('dialog', (d) => d.accept()) // 删除确认框
  await page.goto('/')
  const cardB = page.locator('[data-testid=script-card]', { hasText: '搬迁乙' })
  await cardB.getByTestId('btn-delete').click()
  await expect(cardB).toHaveCount(0)

  // ---- 导入：清单列明数量、格式版本、导出时间与同名，两种选法各会改动多少条 ----
  await page.goto('/settings')
  await page.getByTestId('import-file').setInputFiles(filePath)
  await expect(page.getByTestId('import-preview')).toBeVisible()
  await expect(page.getByTestId('import-preview')).toContainText('格式 v1')
  await expect(page.getByTestId('import-preview')).toContainText('导出于 20')
  await expect(page.getByTestId('import-preview')).toContainText('剧目 2 个')
  await expect(page.getByTestId('import-list').locator('li')).toHaveCount(2)
  await expect(page.getByTestId('import-list').locator('li[data-conflict]')).toHaveCount(1)
  await expect(page.getByTestId('conflict-list')).toContainText('搬迁甲')
  await expect(page.getByTestId('merge-desc')).toContainText('新增 1 个剧目')
  await expect(page.getByTestId('merge-desc')).toContainText('1 个同名剧目保持本机现状不动')
  await expect(page.getByTestId('overwrite-desc')).toContainText('新增 1 个剧目')
  await expect(page.getByTestId('overwrite-desc')).toContainText('替换 1 个本机同名剧目')

  // ---- 整份并入：新增搬迁乙、跳过同名搬迁甲 ----
  await page.getByTestId('btn-import-merge').click()
  await expect(page.getByTestId('import-report')).toBeVisible()
  await expect(page.getByTestId('import-report')).toContainText('新增 1 个')
  await expect(page.getByTestId('import-report')).toContainText('同名跳过 1 个')
  await expect(page.getByTestId('report-list').locator('li[data-kind=added]')).toContainText('搬迁乙')
  await expect(page.getByTestId('report-list').locator('li[data-kind=skipped]')).toContainText('搬迁甲')

  // 首页两个剧目都在
  await page.goto('/')
  await expect(page.locator('[data-testid=script-card]', { hasText: '搬迁甲' })).toHaveCount(1)
  await expect(page.locator('[data-testid=script-card]', { hasText: '搬迁乙' })).toHaveCount(1)

  // ---- 再导同一文件选「同名替换」：两个都被替换 ----
  await page.goto('/settings')
  await page.getByTestId('import-file').setInputFiles(filePath)
  await expect(page.getByTestId('overwrite-desc')).toContainText('替换 2 个本机同名剧目')
  await page.getByTestId('btn-import-overwrite').click()
  await expect(page.getByTestId('import-report')).toContainText('替换 2 个')
  await expect(page.getByTestId('report-list').locator('li[data-kind=replaced]')).toHaveCount(2)

  // ---- 坏文件：给出错误提示，不动数据（samples 里的唱词文本不是备份 JSON）----
  await page.getByTestId('import-file').setInputFiles('public/samples/opera-demo.txt')
  await expect(page.getByTestId('io-error')).toBeVisible()
  await page.goto('/')
  await expect(page.locator('[data-testid=script-card]', { hasText: '搬迁甲' })).toHaveCount(1)
})

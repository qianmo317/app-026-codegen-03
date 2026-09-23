import { test, expect } from '@playwright/test'
import { createScriptViaUI, blurActive, ensurePlaying } from './helpers'

test('自动字号：不同长度唱词不换行、字号尽可能大、虚拟列表只渲染窗口', async ({ page }) => {
  const lines = Array.from(
    { length: 200 },
    (_, i) => `生：第${i + 1}句唱词内容长短不一${'西皮流水二六快板'.repeat(i % 7)}`,
  ).join('\n')
  const id = await createScriptViaUI(page, '字号E2E', lines)

  await page.goto(`/prompt/${id}`)
  await ensurePlaying(page)
  await blurActive(page)

  const canvas = page.getByTestId('prompt-canvas')
  const fontSize = Number(await canvas.locator('.prompt-content').getAttribute('data-fontsize'))
  expect(fontSize).toBeGreaterThan(14)

  // 采样多个滚动位置：所有可见行都不换行（scrollWidth ≤ clientWidth）
  const sampleNoWrap = () =>
    canvas.evaluate((el) => {
      const out: boolean[] = []
      el.querySelectorAll<HTMLElement>('.pline').forEach((p) => {
        out.push(p.scrollWidth <= p.clientWidth + 1)
      })
      return out
    })
  const positions = 6
  for (let i = 0; i < positions; i++) {
    const results = await sampleNoWrap()
    expect(results.length, `位置 ${i} 有可见行`).toBeGreaterThan(3)
    expect(results.every(Boolean), `位置 ${i} 存在换行`).toBe(true)
    await page.keyboard.press('ArrowUp') // 提速让位置推进
    await page.waitForTimeout(400)
  }

  // 全页无横向滚动（换行会撑出横向滚动条）
  const hOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(hOverflow).toBeLessThanOrEqual(0)

  // 虚拟列表：200 行只渲染窗口附近（≥55fps 的前提）
  const rendered = await canvas.locator('.pline').count()
  expect(rendered).toBeLessThan(120)
  expect(rendered).toBeGreaterThan(3)
})

import { test, expect } from '@playwright/test'
import { createScriptViaUI } from './helpers'

test.describe('5000 行性能（验收：滚动 ≥55fps）', () => {
  test.describe.configure({ retries: 2 })

  test('5000 行文稿滚动流畅且只渲染虚拟窗口', async ({ page }) => {
    const lines = Array.from({ length: 5000 }, (_, i) => `生：第${i + 1}句，这一句唱词用来做性能压测滚动。`).join('\n')
    const id = await createScriptViaUI(page, '性能E2E-5000行', lines)

    await page.goto(`/prompt/${id}`)
    const canvas = page.getByTestId('prompt-canvas')
    await expect(canvas).toHaveAttribute('data-state', 'playing')

    // 提速，保证滚动明显
    for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowUp')

    // 采样 3 秒的 rAF 帧率
    const fps = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let frames = 0
          const start = performance.now()
          const loop = () => {
            frames++
            const elapsed = performance.now() - start
            if (elapsed >= 3000) resolve((frames / elapsed) * 1000)
            else requestAnimationFrame(loop)
          }
          requestAnimationFrame(loop)
        }),
    )
    expect(fps, '5000 行滚动应 ≥55fps').toBeGreaterThanOrEqual(55)

    // 虚拟列表生效：DOM 中行数远小于 5000
    const rendered = await canvas.locator('.pline').count()
    expect(rendered).toBeLessThan(120)

    // 滚动位置确实推进了（dt 累加在真实 rAF 下工作）
    const idx = await canvas.locator('.pline[data-current]').getAttribute('data-line-index')
    expect(Number(idx)).toBeGreaterThan(0)
  })
})

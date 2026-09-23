import { expect, type Page } from '@playwright/test'

export const SAMPLE_SCRIPT = `## 第一段
生：杨延辉坐宫院自思自叹【过门5】
生：想起了当年事好不惨然
旦：夫妻们打坐在皇宫院【锣鼓】
旦：尊一声驸马爷细听咱言【停顿3】

## 第二段
生：听罢言来吃一惊【注:瞪眼】
生：老娘亲来到白马关【过门:6】
旦：倘若还娘娘把命断
生：拼却乌纱不做脱袍赴黄泉`

/** 通过 UI 创建剧本（粘贴导入），返回剧本 id，并停留在编辑页 */
export async function createScriptViaUI(page: Page, title: string, text: string): Promise<string> {
  await page.goto('/')
  await page.getByTestId('new-title').fill(title)
  await page.getByTestId('paste-box').fill(text)
  await page.getByTestId('btn-paste-create').click()
  await page.waitForURL(/\/script\//)
  const id = page.url().split('/').filter(Boolean).pop()!
  await page.getByTestId('line-row').first().waitFor()
  return id
}

/** 失焦，避免快捷键误触按钮 */
export async function blurActive(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
}

/**
 * 等待排练开始；若开场就命中过门/停顿标记（holding），按空格跳过。
 * 这是对「自动滚动遇到过门要停留」这一产品行为的测试侧适配。
 */
export async function ensurePlaying(page: Page, key = 'Space') {
  const canvas = page.getByTestId('prompt-canvas')
  await expect(canvas).toBeVisible()
  for (let i = 0; i < 6; i++) {
    const state = await canvas.getAttribute('data-state')
    if (state === 'playing') return
    await page.keyboard.press(key) // holding→跳过；idle/ended→重播
    await page.waitForTimeout(200)
  }
  await expect(canvas).toHaveAttribute('data-state', 'playing')
}

/** 以 React 兼容方式设置 range/number 输入值 */
export async function setInputValue(page: Page, testId: string, value: string) {
  await page.getByTestId(testId).evaluate((el, v) => {
    const input = el as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, v)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}

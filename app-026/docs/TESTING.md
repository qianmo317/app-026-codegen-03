# 测试与验收 · TESTING

> 戏曲演出提词器 · Opera Teleprompter
> 关联文档：[README](../README.md)｜[架构设计](./ARCHITECTURE.md)｜[开发指南](./DEVELOPMENT.md)

## 1. 测试体系总览

```
单元测试 (vitest, 41 例)      → 引擎/解析/存储/协议的确定性断言
        ↓
E2E (Playwright, 6 组 spec)   → 真实浏览器全旅程与性能
        ↓
浏览器点测 (人工代理, 7 项)    → 视觉/交互/Console 巡检
        ↓
Docker 自检                   → 镜像体积/healthz/SPA 回退/容器健康
```

运行方式（均在 `app-026/`）：

```bash
npm test                          # 单元测试，一次性 41 例
npx vitest                        # watch 模式
npm run e2e                       # 全部 E2E（webServer 自动起 preview :4173）
npx playwright test tests/e2e/journey.spec.ts    # 单个 spec
npx playwright test --headed      # 有头模式观察执行
```

## 2. 单元测试（tests/unit/，41 例全绿）

| 文件 | 环境 | 覆盖点 |
|---|---|---|
| `scroller.test.ts` | node | 60/120fps 每秒滚过行数一致；混合帧率位移守恒；5s 过门停留 **±100ms**；`skipHold` 立即恢复；`holdOnCue=false` 不停留；单段循环 10 次位置/耗时符合预期；循环圈内标记重触发；`seekTo` 后停留重新生效；播完 `ended` |
| `autofit.test.ts` | node | mulberry32 生成 200 条随机长度唱词：100% 不换行 + 字号尽可能大 + 极窄容器钳制最小字号 |
| `parse.test.ts` | node | 「角色：唱词」解析（前缀 ≤6 字）；【过门N】【停顿N】【锣鼓】【注：x】（label 落点）；`##` 段头；空行分段；空过门行补占位 |
| `virtual.test.ts` | node | 可视窗口计算边界（首/尾/越界/窗口收缩） |
| `keys.test.ts` | jsdom | 默认键位表；自定义持久化；损坏 JSON 回退默认；localStorage 不可用时内存回退（vi.stubGlobal） |
| `db.test.ts` | node | fake-indexeddb：四 store 建库、get/put/delete/getAll；设置保存读取往返（含 savedAt 剥离与默认值合并） |
| `wakelock.test.ts` | jsdom | WakeLockGuard 获取/释放**配对**（防泄漏）；不支持环境静默降级 |
| `remote.test.ts` | node | 4 位配对码生成；`isRemoteCommand`/`isRemoteStatus` 类型守卫拒绝非法消息；合法消息往返 |

工具：`tests/unit/setup.ts` 加载 fake-indexeddb（auto 注册），jsdom 环境文件按文件头注释 `// @vitest-environment jsdom` 切换。

## 3. E2E 测试（tests/e2e/，6 组全绿）

| Spec | 场景 |
|---|---|
| `journey.spec.ts` ①主旅程 | 首页新建 → 粘贴导入解析 → 编辑页标记（易错/加力）+ 批注 + 唱段头渲染 → 排练页：过门停留 → 空格跳过 → 播放/暂停恢复 → `↑` 调速 +10 → 数字键 `2` 跳段（断言行索引）→ `←` 回上一段 → 开启循环等到 `×1` → 练习徽标「已练 N 次」→ 演出页：锁定后点击无效 → 长按解锁（盾层消失）→ `Esc` → 刷新后标记/文稿仍在 |
| `journey.spec.ts` ②设置与键位 | 关闭自动字号 → 手动 40px → 排练页字号生效 → 键位改 `p` 后旧键失效新键可控 → 刷新持久化 |
| `autofit.spec.ts` | 200 行随机长度唱词：不换行（无横向溢出）+ 字号合理 + 虚拟列表 DOM 行数 < 120 |
| `perf.spec.ts` | 5000 行文稿滚动 ≥ 55fps（rAF 计时采样，retries=2） |
| `offline.spec.ts` | 断网后所有操作纯本地：SPA 内跳转、编辑保存、排练播放（客户端路由不 reload） |
| `remote.spec.ts` | 双 context：提词端显示 4 位配对码（字母数字混合）→ 遥控端连接 → 播放/暂停/调速/跳段指令生效 + 状态回报 |

`playwright.config.ts`：`workers: 1`（计时断言稳定性）、baseURL `:4173`、webServer 自动起 `vite preview`（`reuseExistingServer: true`）。

### E2E 辅助函数（tests/e2e/helpers.ts）

| 函数 | 作用 / 为什么需要 |
|---|---|
| `createScriptViaUI` | 走真实 UI 新建粘贴导入，返回剧目 id |
| `ensurePlaying(page, key?)` | 开场命中【过门】会先停留（**产品行为**）：按跳过键直到 `data-state=playing`，避免「打开即断言播放中」的误判 |
| `setInputValue` | React 受控 range/number 输入用原生 value setter + input/change 事件赋值 |
| `blurActive` | 断言键盘行为前失焦，避免焦点在按钮上吞按键 |

## 4. 验收标准对照表（md §10 → 实测）

| # | 验收标准 | 断言位置 | 结果 |
|---|---|---|---|
| 1 | 60/120fps 每秒滚过行数一致（dt 累加） | `scroller.test.ts` 帧率守恒断言 | ✅ |
| 2 | 200 条随机唱词 100% 不换行且字号最大 | `autofit.test.ts` + `autofit.spec.ts` | ✅ |
| 3 | 5s 过门停 5s（±100ms），可手动跳过 | `scroller.test.ts` ±100ms + journey 主旅程 | ✅ |
| 4 | 单段循环 10 次位置与耗时符合预期 | `scroller.test.ts` 循环断言 | ✅ |
| 5 | 演出模式锁定点击无效、长按 2s 退出 | journey 主旅程（盾层消失断言） | ✅ |
| 6 | Wake Lock 获取/释放无泄漏 | `wakelock.test.ts` 配对断言 | ✅ |
| 7 | 5000 行 ≥ 55fps | `perf.spec.ts` | ✅ |
| 8 | 刷新后文稿与标记仍在 | journey 主旅程持久化段 | ✅ |
| 9 | 快捷键全部生效、可自定义并持久化 | `keys.test.ts` + journey 设置与键位 | ✅ |
| 10 | Docker：8106:80、healthz、镜像 < 60MB | 构建实测：21.2MB、healthz=ok、容器 healthy、深链 200 | ✅ |
| 11 | 构建上下文 < 5MB | 实测约 388KB | ✅ |

## 5. 缺陷记录（测试发现 → 修复）

| # | 现象 | 根因 | 修复 |
|---|---|---|---|
| 1 | 编辑页整页白屏，console 报 React #310 | hooks（useMemo）位于条件 `return` 之后，两次渲染 hooks 数量不一致 | `ScriptEditor.tsx`：条件 return 后改普通计算（Map 构建） |
| 2 | 行标记在行级 DOM 无体现，E2E `line-row[data-marks*=…]` 找不到 | `line-row` 未渲染 `data-marks` 属性 | 补 `data-marks={line.marks.join(' ')}`（空数组不渲染） |
| 3 | 设置修改后立即刷新/关页会丢失（E2E：排练页字号仍是自动值 94） | IndexedDB 写入在页面卸载时不可靠 + 300ms 防抖窗口 | 改为**无防抖**：localStorage 同步直写 + IndexedDB 双写，读侧 `savedAt` 取新合并（`repo.ts`） |
| 4 | 按一次 `↑` 速度 +20（E2E：期望 100 实得 110） | `changeSpeed` 在 `setSpeed(speed+10)` 后又 `patch({speedPxPerSec: engine.speedValue + d})` 多加一次 `d`，设置同步回引擎放大 | `Prompt.tsx` / `Stage.tsx`：patch 改为 `engine.speedValue`（已是调速后值） |
| 5 | 循环练习计数记到**下一段**的行（E2E：徽标不出现） | `indexAt()` 四舍五入使 pos ≥ 3.5×行高时 idx 已越界到下一段 → `onLoopIteration` 闭包捕获错误段索引 | `Prompt.tsx`：开启循环时把本段 `lineIds` 存入 `loopLineIdsRef`，回调直接使用（见架构 D5） |

> 复盘：#3/#4/#5 均由 E2E 在真实浏览器中暴露，静态审查与单元测试未覆盖——**「写完单测不等于功能正确」**；#1 由浏览器点测诊断脚本抓到 console error 定位。

## 6. 测试编写约定

1. **先 build 再跑 E2E**：`vite preview` 服务 `dist/`，源码改动不 build 就是测旧代码。
2. **跑 E2E 前清理 4173 端口**：`pkill -f "vite preview"`，防双 server 抢端口（ERR_CONNECTION_REFUSED 全军覆没教训）。
3. 引擎类单测用 node 环境（确定性时钟/无 DOM 噪音）；涉及 localStorage 的用 jsdom 或 `vi.stubGlobal`。
4. 断言「真实可观察行为」而非实现细节：如解锁断言用**盾层消失**（解锁瞬间不渲染 `data-progress=1.00`），循环计数等 `loop-count` 文本从 `×0` 变 `×[1-9]`（元素 ×0 时即可见，`toBeVisible` 不代表跑完一圈）。
5. 涉及开场停留的用例统一走 `ensurePlaying`；计时类 E2E 关闭并行（workers=1）。
6. `test-results/`、`playwright-report/` 已入 `.gitignore` 与 `.dockerignore`。

# 开发指南 · DEVELOPMENT

> 戏曲演出提词器 · Opera Teleprompter
> 关联文档：[README](../README.md)｜[架构设计](./ARCHITECTURE.md)｜[测试与验收](./TESTING.md)

## 1. 环境要求

| 依赖 | 版本 | 用途 |
|---|---|---|
| Node.js | 20+ | 构建/测试 |
| npm | 10+ | 包管理 |
| Docker | 任意现代版本 | 容器化验收（可选） |
| Playwright 浏览器 | `npx playwright install` 首次安装 | E2E |

核心依赖（无其他运行时依赖，**不得新增第三方库**——项目约定）：react 18.3.1、react-dom 18.3.1、lucide-react 0.469.x；开发依赖：vite 6.x、typescript ~5.8、vitest 3.x、@playwright/test 1.54.x、fake-indexeddb 6.x、jsdom 26.x。

## 2. 常用命令

所有命令在 `app-026/` 下执行。

```bash
npm install            # 安装依赖
npm run dev            # 开发服务器（Vite，热更新）
npm run build          # tsc --noEmit 类型检查 + 生产构建 → dist/
npm run preview        # 预览生产构建（注意：服务的是 dist/，改源码需先 build）
npm test               # 单元测试（vitest run，一次性）
npx vitest             # 单元测试（watch 模式，开发时用）
npm run e2e            # Playwright E2E（自动起 preview 服务器 :4173）
npx playwright test tests/e2e/journey.spec.ts   # 只跑某个 spec
```

Docker：

```bash
docker compose up -d --build     # 构建并启动（:8106）
curl http://localhost:8106/healthz
docker compose down
```

## 3. 代码约定

- **TypeScript 严格模式**；构建前置 `tsc --noEmit`，类型错误即构建失败。
- **函数组件 + hooks**；状态逻辑集中（引擎状态在 `engine/`，编排逻辑在 `state/hooks.ts`），UI 组件只负责显示与动作分发。
- **禁止新增第三方运行时依赖**；需要图标用 lucide-react，需要能力优先手写小型封装（如路由、IDB wrapper、BroadcastChannel 协议）。
- 注释与 UI 文案使用中文。
- DOM 可测性：关键节点带 `data-testid`（E2E 依赖），行级元素带 `data-line-index` / `data-marks` / `data-current` 等属性——改渲染结构时必须同步测试。

## 4. 目录职责速查

| 路径 | 职责 | 改动时注意 |
|---|---|---|
| `src/engine/scroller.ts` | 滚动引擎（状态机/停留/循环/定位） | 纯逻辑无 DOM；改动必须跑单测（停留精度、循环、seek 重触发） |
| `src/engine/parse.ts` | 粘贴文本解析（角色/标记/段头） | 正则改动会影响单测 parse.test.ts 与真实用户文本兼容性 |
| `src/engine/autofit.ts` | 二分自动字号 | 结果须「不换行且尽可能大」，单测有 200 行随机断言 |
| `src/engine/keys.ts` | 键位映射与持久化 | `1~9` 跳段不可重映射（RemappableAction 类型约束） |
| `src/engine/remote.ts` | 遥控消息协议 | 消息结构变更需同步遥控端与类型守卫 |
| `src/storage/repo.ts` | 仓库函数；设置双写 | 新增设置字段：DEFAULT_SETTINGS + loadSettings 合并逻辑都要动 |
| `src/state/hooks.ts` | hooks 编排 | useScript 防抖 400ms、useSettings 立即保存（勿改回防抖，会丢数据） |
| `src/components/PromptCanvas.tsx` | 提词画布渲染 | 每帧 transform 直写路径不要绕回 React setState |
| `src/pages/*` | 七个页面 | 键盘处理统一走 Prompt 的 handleAction（窗口级 keydown） |
| `tests/unit` `tests/e2e` | 测试 | 见 [TESTING.md](./TESTING.md) 约定 |

## 5. 常见开发任务

### 5.1 新增一个设置项

1. `src/types.ts`：`PromptSettings` 加字段；
2. `src/storage/repo.ts`：`DEFAULT_SETTINGS` 加默认值（`loadSettings` 会用默认值合并旧数据，旧用户自动迁移）；
3. `src/pages/Settings.tsx`：加控件（受控组件，onChange 调 `patch({ field: value })`）；
4. 消费端（通常 `PromptCanvas` 或 `useEngine`）读取并生效；
5. 如影响渲染，补 E2E 断言。

### 5.2 新增一个快捷键

1. `src/engine/keys.ts`：`KeyAction` 加动作名；若可自定义，自动进入 `RemappableAction`；`DEFAULT_KEYMAP` 加默认键；
2. `src/pages/Prompt.tsx` 的 `handleAction`：实现动作分支；
3. 设置页键位表**自动**渲染新动作（数据驱动），无需改 Settings；
4. `tests/unit/keys.test.ts` 补映射单测。

### 5.3 新增一种标记（Cue）

1. `src/engine/parse.ts`：`CUE_PATTERNS` 加正则（注意捕获组与 label 落点，参考历史缺陷）；
2. `src/engine/cues.ts`：`cueLabel` 加显示文案；是否参与停留决定是否加入 `lineHoldSeconds` 求和；
3. `PromptCanvas` 的 hold-overlay 逻辑通常无需改（读 `lineHoldSeconds` 求和结果）；
4. `parse.test.ts` 补解析用例。

### 5.4 新增页面

1. `src/pages/` 建组件；2. `src/router.tsx` 的路由表加 match 规则；3. 相关页面加入口链接。

## 6. 测试

测试体系、运行方式、编写约定与历史缺陷记录见 **[TESTING.md](./TESTING.md)**。

两条最容易踩的坑：

- **改了源码必须先 `npm run build` 再跑 E2E**——Playwright 的 webServer 是 `vite preview`，服务的是 `dist/` 旧产物，忘记 rebuild 会出现「测试测的是旧代码」的诡异结果。
- **E2E 起跑前确认 4173 端口干净**：`pkill -f "vite preview"`，避免两套 server 抢端口导致 ERR_CONNECTION_REFUSED。

## 7. Docker 细节

- 四件套：`Dockerfile`（多阶段：`node:20-alpine` 构建 → `nginx:1.27-alpine-slim` 运行）、`docker-compose.yml`（服务 `app-026`、`8106:80`、healthcheck `/healthz`）、`nginx.default.conf`（healthz/SPA 回退/缓存/gzip）、`.dockerignore`。
- **为什么运行层用 `alpine-slim`**：完整版 `nginx:1.27-alpine` 新版捆绑 njs 动态模块，实测基础镜像 78.2MB，突破「镜像 < 60MB」验收线；slim 为官方精简变体（21.4MB），本配置仅用核心指令，无兼容性差异。
- **为什么 nginx 配置文件名为 `nginx.default.conf`**：md 要求 `.dockerignore` 排除 `nginx.conf`，而构建需要 COPY 该文件，故换名规避（`.dockerignore` 仍按要求保留 `nginx.conf` 条目）。
- 构建上下文要求 < 5MB（`test-results`、`playwright-report`、`node_modules`、`dist` 均已排除）。

## 8. 发布清单

1. `npm run build` 通过（含类型检查）；
2. `npm test` 41 例全绿；
3. `npm run e2e` 6 组全绿；
4. `docker compose up -d --build` 后：healthz=ok、容器 healthy、镜像 < 60MB、`/prompt/:id` 等深链 200；
5. `docker compose down` 清理。

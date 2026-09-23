# 戏曲演出提词器 · Opera Teleprompter

> 纯前端 Web 应用｜技术栈：**React 18 + TypeScript + Vite**（手写 CSS，不引入 UI 库）
> 状态：**已完成并通过全部验收**（单元测试 41 例、E2E 6 组、浏览器点测、Docker 容器化）

## 1. 项目简介

把唱词按唱段切好，排练时用手机/平板当提词器：大字滚动、可暂停跟进、可标「谁进谁出」，并支持遥控翻页与演出中的快速跳段。

### 真实场景与痛点

- 民间剧团排练常缺词：老演员记不全、新演员刚学的段子记不住，靠人举着手机念，字太小、跟不上。
- 唱词有板式与过门：**该停的地方要停、该进的地方要进**，平铺一页纸看不出节奏，容易抢拍。
- 排练时想「只练这一段、反复练」，现有提词 App 都是整篇滚动，无法按唱段循环。
- 舞台上需要大字远距离可读，还要能一键切到下一段（有人临时忘词时救场）。

### 目标用户

- 民间剧团、票友社、戏曲班的排练与演出。
- 主持人/司仪（流程提词，通用场景）。
- 演讲与朗诵排练（同样需求）。

## 2. 功能特性

### 核心功能（MVP）

| 功能 | 说明 |
|---|---|
| 文稿与唱段管理 | 按剧目组织；支持粘贴导入，按「角色：唱词」格式解析；`## 标题` 为唱段头；保存模板 |
| 提词显示 | 大字模式（手动字号 + 按屏宽二分自动适配，保证**不换行**）；当前行等宽高亮、视窗居中、上下各留预览 |
| 滚动控制 | 匀速自动滚动（速度可调）、单指拖拽手动滚动、双击播放/暂停、逐段跳转 |
| 段落与循环 | 单段循环播放（反复练一段）、段落间跳转（数字键 `1~9` 或遥控） |
| 进场/过门标记 | 词句中插入【过门 N】【锣鼓】【停顿 N】，自动滚动遇到标记时**停留 N 秒再继续**（可跳过），显示剩余秒数 |
| 标记与批注 | 句子加颜色标记（易错句 / 需加力 / 需拖腔）、批注；标记只对本人可见 |
| 演出模式 | 全屏、控件 2.5 秒自动隐藏、防误触（锁定后点击无效，长按 2 秒带进度环解锁，`Esc` 也可）、屏幕常亮（Wake Lock） |
| 主题 | 深色 / 浅色 / 高对比（黑底黄字） |

### 进阶功能

- **遥控**：同浏览器双窗口，遥控端凭 4 位配对码经 `BroadcastChannel` 控制提词端（播放/暂停、调速、跳段、跳过停留、循环）。
- **双人提词**：左角色右角色分栏（对戏排练）。
- **提醒卡**：易错句单独抽成卡片，排练前速览。
- **打印版**：大字唱词 + 标记 + 批注，供无设备场合。
- **练习计数**：循环练习自动累计，当前行显示「本条已练 N 次」。

## 3. 快速开始

### 本地开发

```bash
cd app-026
npm install

npm run dev        # 开发服务器
npm run build      # 类型检查 + 生产构建（产物 dist/）
npm run preview    # 预览生产构建
npm test           # 单元测试（vitest）
npm run e2e        # E2E 测试（Playwright）
```

### Docker 部署

```bash
cd app-026
docker compose up -d --build
curl http://localhost:8106/healthz   # 返回 ok
# 浏览器打开 http://localhost:8106
docker compose down                  # 停止并清理
```

- 多阶段构建：`node:20-alpine` 构建 → nginx 运行层只拷 `dist/` 与 nginx 配置，**镜像 21.2MB（验收要求 < 60MB）**。
- 运行基座采用 `nginx:1.27-alpine-slim`：完整版 `nginx:1.27-alpine` 自带 njs 等动态模块（实测 78.2MB）会突破 60MB 验收线；slim 为同一 nginx 1.27 的官方精简变体，本配置仅用核心指令，无兼容性差异（见 `Dockerfile` 注释）。
- nginx 配置：SPA 回退（`try_files … /index.html`）；`/assets/` 哈希资源 `immutable` 一年缓存；`index.html` no-cache；开启 gzip；`/healthz` 健康检查端点。
- 无后端、无外部资源请求，断网可用（剧场后台常无网）。

## 4. 使用指南

### 页面结构

```
/                  剧目列表（新建、粘贴导入、示例导入、模板实例化、删除）
/script/:id        文稿编辑（粘贴替换/追加、行编辑、标记、过门标记秒数、批注、分段/拆分/重命名/循环勾选、提醒卡、存模板）
/prompt/:id        排练模式（自动滚动、循环、暂停、调速、跳段、双人分栏、遥控、提醒卡、主题切换）
/prompt/:id/stage  演出模式（全屏大字、控件自动隐藏、锁定防误触）
/remotes           遥控器（输入提词端配对码连接）
/settings          字号、自动滚动、速度、过门停留、锁定舞台、主题、键位自定义、遥控配对码
/print/:id         打印版唱词（含标记与批注图例）
```

### 粘贴导入格式

```
## 第二段                  ← 唱段头（也可空行自动分段）
生：听罢言来吃一惊【注:瞪眼】  ← 「角色：唱词」，句尾可带标记
生：老娘亲来到白马关【过门:6】 ← 过门 6 秒：滚动到此停留 6 秒
旦：倘若还娘娘把命断【停顿3】  ← 停顿 3 秒
生：拼却乌纱不做脱袍赴黄泉【锣鼓】
```

标记语法：`【过门N】`（或 `【过门:N】`）、`【停顿N】`、`【锣鼓】`、`【注:xxx】`（本人可见批注性提示）。角色前缀不超过 6 个字。内置示例见 `app-026/public/samples/`（`opera-demo.txt`、`speech-demo.txt`）。

### 默认快捷键（可在设置页自定义并持久化，`1~9` 跳段固定不可改）

| 按键 | 动作 |
|---|---|
| `空格` | 播放 / 暂停（停留期间按下 = 跳过停留） |
| `↑` / `↓` | 加速 / 减速（±10px/s） |
| `←` / `→` | 上一段 / 下一段 |
| `1` ~ `9` | 跳到第 N 段（固定） |
| `l` | 循环当前段 开/关 |
| `s` | 跳过当前停留 |
| `Esc` | 演出模式解锁 / 返回 |

### 触屏手势（排练页）

- 单指上下拖 = 手动滚动（播放中拖拽会先暂停）。
- 双击 = 播放 / 暂停。
- 演出模式锁定后所有点击无效，**长按 2 秒**（进度环走满）解锁。

### 遥控使用

1. 提词端进入排练页（或演出页），工具栏显示 4 位配对码（设置页也可查看/重置）。
2. 同一浏览器再开一个窗口，打开 `/remotes`，输入配对码连接。
3. 遥控端可播放/暂停、± 调速、上/下一段、数字键跳段、跳过停留、开关循环，并实时显示提词端进度。

### 数据与隐私

- 全部数据（剧目、标记、批注、设置、练习计数）存 **IndexedDB + localStorage**，**不上传唱词**（涉及未公开演出内容与版权）。
- 设置采用「localStorage 同步直写 + IndexedDB 双写」：即使刷新或关闭页面，刚修改的设置也不会丢失。
- `.gitignore` 排除真实剧本与唱词（`scripts/`、`exports/`、`*.docx`）——未公开演出内容与版权内容绝不入库。

> ⚠️ **Wake Lock（屏幕常亮）需要 HTTPS 或 localhost 才能生效**：容器映射端口即为 localhost，可直接验收；**局域网 HTTP 访问（如手机访问电脑 IP）时 Wake Lock 可能受限**，此时应用会提示手动设置屏幕常亮。

## 5. 测试与验收

### 验收标准与实测结果

| 验收标准 | 实测结果 |
|---|---|
| 滚动平滑：60fps 与 120fps 屏每秒滚过行数一致（dt 累加） | ✅ 单测通过（混合帧率守恒断言） |
| 过门停顿：5 秒过门停止 5s（±100ms）再继续，可手动跳过 | ✅ 单测通过（±100ms 断言） |
| 段落循环：单段循环 10 次位置与耗时符合预期 | ✅ 单测通过 |
| 自动字号：200 条不同长度唱词 100% 不换行且字号尽可能大 | ✅ 单测 + E2E 双重断言 |
| 演出模式：锁定后点击无效，长按 2 秒退出；Wake Lock 获取/释放无泄漏 | ✅ 单测 + E2E 通过 |
| 5000 行文稿滚动 ≥ 55fps（虚拟列表） | ✅ E2E 实测通过（DOM 行数 < 120） |
| 快捷键全部生效，可自定义并持久化 | ✅ E2E 通过 |
| 刷新后文稿与标记仍在 | ✅ E2E 通过 |
| Docker：`8106:80`、healthz、镜像 < 60MB | ✅ 21.2MB、healthz=ok、容器 healthy |
| 构建上下文 < 5MB | ✅ 约 388KB |

### 测试组成

- **单元测试（vitest，41 例）**：滚动引擎（帧率一致性、停留精度、跳过、循环、seek 重触发）、自动字号二分、解析器、虚拟列表窗口、键位映射（损坏存储回退）、IndexedDB 仓库、Wake Lock 守卫、遥控消息协议。
- **E2E（Playwright，6 组）**：全流程旅程（粘贴 → 标记批注 → 排练停留/跳过/调速/跳段/循环 → 演出锁定长按 → 持久化）、设置持久化与键位自定义、自动字号与虚拟列表、5000 行性能、断网可用、双端遥控。
- **浏览器点测**：首页/编辑/排练/演出/设置/打印全页面实际点击验证，Console 无报错。

### 测试中发现并修复的真实缺陷

1. 编辑页 React #310 白屏（hooks 位于条件 return 之后）。
2. 行标记缺少 `data-marks` 行级属性。
3. 设置防抖保存遇刷新/关页丢失 → 改为 localStorage 同步直写 + IndexedDB 双写（savedAt 取新合并）。
4. 一次调速 +20（`changeSpeed` 在 setSpeed 后又多加一次增量写回设置）。
5. 循环练习计数记错唱段（wrap 时派生的段索引因四舍五入越界抖动）→ 改为开启循环时缓存本段行 id。

## 6. 技术实现要点

- **平滑滚动**：`requestAnimationFrame` 累加位移（`pos += speed × dt`），dt 夹紧防后台跳位——CSS 动画或 `setInterval` 在 60/120Hz 屏速度不一致、暂停后位置会跳。
- **过门/停顿**：滚动遇到 `Cue` 进入 `holding` 状态倒计时（界面显示剩余秒数），到点自动恢复；排练时可用 `空格`/`s` 手动跳过。
- **自动字号**：按容器宽度与最长行做**二分**求最大不换行字号——换行会打乱「一行一句」的对应关系。
- **虚拟列表**：只渲染视窗附近的行（绝对定位 + 每帧直写 `transform`，离散变化才走 React 状态），支撑 5000 行 ≥55fps。
- **常亮与全屏**：`navigator.wakeLock.request('screen')`（配对获取/释放，防泄漏；不支持时提示）；`requestFullscreen()`。
- **防误触**：演出模式锁定后全屏盾层拦截点击；长按 2 秒显示进度环解锁。
- **遥控**：`BroadcastChannel`（频道名含配对码），指令/状态双消息协议，3 秒无状态判离线。

## 7. 目录结构

```
.
├── README.md                     # 本文档
└── app-026/                      # 前端项目
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    ├── playwright.config.ts
    ├── Dockerfile                # 多阶段构建（node:20-alpine → nginx:1.27-alpine-slim）
    ├── docker-compose.yml        # 服务 app-026，8106:80，healthcheck
    ├── nginx.default.conf        # healthz / SPA 回退 / 缓存策略 / gzip
    ├── .dockerignore / .gitignore
    ├── public/samples/           # 示例剧目（opera-demo.txt、speech-demo.txt）
    ├── src/
    │   ├── engine/               # scroller(滚动引擎) / autofit / parse / cues / virtual / keys / segments / remote / wakelock
    │   ├── storage/              # db(IndexedDB 封装) / repo(仓库与默认设置)
    │   ├── state/hooks.ts        # useSettings / useScript / usePractice / useEngine 等
    │   ├── components/           # PromptCanvas（提词画布核心渲染）
    │   ├── pages/                # Home / ScriptEditor / Prompt / Stage / Remotes / Settings / Print
    │   ├── router.tsx / App.tsx / styles.css / types.ts
    ├── tests/unit/               # vitest 单元测试
    └── tests/e2e/                # Playwright E2E
```

## 8. 边界（刻意不做）

不做录音与音视频播放（不做音乐播放器）、不做演出票务与排期、不做字幕投屏协议对接（如 DMX/视频服务器）、不做社交分享——核心只做**唱词提词 + 段落实用工具**。

## 9. 数据模型（附录）

```ts
type Cue = { id: string; kind: 'pause'|'interlude'|'drum'|'note'; seconds?: number; label?: string };
type Line = { id: string; role?: string; text: string; cues: Cue[]; marks: string[]; note?: string };
type Segment = { id: string; title: string; lineIds: string[]; loop?: boolean };
type Script = { id: string; title: string; troupe?: string; lines: Line[]; segments: Segment[];
                style: 'opera'|'speech'; updatedAt: number };
type PromptSettings = { fontSizePx: number; autoFit: boolean; autoScroll: boolean; speedPxPerSec: number;
                        theme: 'dark'|'light'|'highContrast'; holdOnCue: boolean; lockStage: boolean };
```

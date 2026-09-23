# 架构设计 · ARCHITECTURE

> 戏曲演出提词器 · Opera Teleprompter
> 关联文档：[README](../README.md)｜[开发指南](./DEVELOPMENT.md)｜[测试与验收](./TESTING.md)

## 1. 总体架构

纯前端单页应用，无后端、无外部资源请求（断网可用）。所有数据存浏览器本地（IndexedDB + localStorage）。

```
┌─────────────────────────────────────────────────────┐
│  pages/   Home · ScriptEditor · Prompt · Stage ·    │
│           Remotes · Settings · Print                │  ← 页面（路由 + 交互编排）
├─────────────────────────────────────────────────────┤
│  components/PromptCanvas                            │  ← 提词画布（渲染核心）
├─────────────────────────────────────────────────────┤
│  state/hooks.ts   useSettings / useScript /         │  ← 状态与副作用编排
│                   usePractice / useEngine 等        │
├──────────────────────┬──────────────────────────────┤
│  engine/             │  storage/                    │
│  scroller · autofit  │  db（IndexedDB 封装）         │  ← 无 UI 的纯逻辑层
│  parse · cues ·      │  repo（仓库 + 默认设置 +      │
│  virtual · keys ·    │     设置双写持久化）           │
│  segments · remote · │                              │
│  wakelock            │                              │
├──────────────────────┴──────────────────────────────┤
│  types.ts（数据模型） · router.tsx（手写 history 路由）│
└─────────────────────────────────────────────────────┘
```

技术选型：React 18 + TypeScript + Vite 6，手写 CSS（CSS 变量实现三主题），图标 lucide-react，**不引入其他运行时依赖**（用户约定）。

## 2. 核心模块职责

### 2.1 滚动引擎 `src/engine/scroller.ts`

全应用的「心脏」：一个与 React 解耦的 `ScrollEngine` 类。

- **状态机**：`idle → playing ⇄ holding → ended`。`holding` 为过门/停顿停留态。
- **推进模型**：`tick(dt)` 由 rAF 驱动（`attachDriver` 注入），`pos += speed × dt`，dt 夹紧 250ms（后台切回不跳位）。60Hz 与 120Hz 屏每秒滚过的行数一致。
- **停留（Cue hold）**：pos 越过带标记行时进入 `holding` 并倒计 `lineHoldSeconds`（多标记求和）；`consumed: Set` 防止同一次停留重复触发；`空格`/`s` 调 `skipHold` 立即恢复。
- **段落循环**：`setLoopRange({startPos, endPos})`，pos 越过 `endPos` 即回卷 `startPos` 并 `loopCount++`，触发 `onLoopIteration` 回调（练习计数的数据源）。
- **定位**：`setLayout({lineHeight, holds})` 建立行号↔位置映射；`posForIndex` / `indexAt` / `seekTo` / `seekIndex`；seek 与循环回卷后 `lastIdx = -1` 强制下一帧重新评估当前行（保证停留与高亮重触发）。
- **订阅**：`subscribe/emitChange` 供 React 侧按需同步。

### 2.2 自动字号 `src/engine/autofit.ts`

`fitFontSize`：以 canvas `measureText` 度量最长行（参考宽 100px 归一化），在 `[min, max]` 区间**二分**求最大不换行字号。换行会打乱「一行一句」的提词对应关系，是硬约束。

### 2.3 解析器 `src/engine/parse.ts` + 标记 `cues.ts`

- 行格式：`角色：唱词【标记】`；角色前缀 ≤ 6 字。
- 标记正则（CUE_PATTERNS）：`【过门N】`/`【停顿N】`（秒数）、`【锣鼓】`、`【注:xxx】`（label）。
- `## 标题` 为段头；空行自动分段；空文本过门行补占位。
- `cues.ts`：`lineHoldSeconds`（该行所有 holdable 标记秒数求和）、`cueLabel`、`makeCue`。

### 2.4 虚拟列表 `src/engine/virtual.ts`

`visibleRange(pos, lineHeight, viewportH)` 只计算视窗附近的行窗口；画布层对窗口外行不做渲染。5000 行文稿滚动 ≥55fps（实测见 [TESTING.md](./TESTING.md)）。

### 2.5 键位映射 `src/engine/keys.ts`

- `KeyAction` 共 8 个动作；`RemappableAction = Exclude<KeyAction, 'jumpSegment'>`——**`1~9` 数字跳段固定不可改**（产品约定）。
- `DEFAULT_KEYMAP`：空格=播放暂停、`↑/↓`=调速、`←/→`=跳段、`l`=循环、`s`=跳过停留、`Esc`=解锁。
- localStorage 安全 wrapper（不可用时回退内存，单测环境无 localStorage 也不崩）；损坏 JSON 回退默认键位。

### 2.6 遥控协议 `src/engine/remote.ts`

- 传输：`BroadcastChannel('otp-remote-<4位配对码>')`，同浏览器双窗口零依赖通信（md 允许的简化方案，未用 WebRTC）。
- 消息双通道：`RemoteCommand`（遥控端→提词端指令）与 `RemoteStatus`（提词端→遥控端状态回报，800ms 节流）。
- `isRemoteCommand` / `isRemoteStatus` 类型守卫隔离非法消息；遥控端 3 秒未收到 status 判离线。

### 2.7 存储 `src/storage/db.ts` + `repo.ts`

- IndexedDB v1，四个 store：`scripts` / `templates` / `settings` / `practice`（keyPath `id`）。
- `repo.ts` 暴露领域仓库函数；**设置采用双写持久化**（见 §3 设计决策 D4）：
  - 写：localStorage **同步**直写（含 `savedAt` 时间戳）+ IndexedDB 异步落盘；
  - 读：两侧各取一份，`savedAt` 较新者胜，用默认值合并补齐缺省字段。

### 2.8 状态编排 `src/state/hooks.ts`

| Hook | 职责 |
|---|---|
| `useSettings` | 全局设置加载；`patch` 立即经 repo 持久化（无防抖，防卸载丢失） |
| `useScript` | 单剧目加载；`mutate` 防抖 400ms 自动保存 + `saved` 状态 + `saveNow` 立即保存 |
| `usePractice` | 练习计数加载与 `bump`（逐行 +1 后整对象回写） |
| `useEngine` | 创建引擎 + `attachDriver(rAF)`；settings 变化同步到引擎（速度/字号布局等） |
| `applyTheme` | 把主题写入 `<html data-theme>` |

### 2.9 渲染核心 `src/components/PromptCanvas.tsx`

- ResizeObserver 跟踪视口；`autoFit` 开时按容器自适应字号，否则用手动值；`lineHeight = round(fontSize × 1.55)`。
- **性能关键**：滚动位移每帧**直写**容器 `transform`（不经 React）；当前行等离散 UI 状态变化才 `setState` 走 React 渲染。
- 覆盖层：`hold-overlay`（剩余秒数，`data-remaining` 一位小数）、`end-overlay`（播完）、虚拟列表提示。
- 手势：单指拖拽（播放/停留中先暂停再 nudge）、双击播放暂停、长按 600ms 回调（演出页用）。
- 行 DOM 带可测属性：`data-line-index`（原始行号）、`data-current`、`data-marks`（空格分隔）、练习徽标 `practice-badge`、`.prompt-content[data-fontsize]`。

### 2.10 页面 `src/pages/`

| 页面 | 路由 | 职责 |
|---|---|---|
| Home | `/` | 剧目列表/新建/粘贴导入/示例导入（fetch `/samples/*.txt`）/模板实例化/删除 |
| ScriptEditor | `/script/:id` | 粘贴替换/追加、行编辑与标记（hard/power/drag）、cue chips（秒数编辑）、批注、增删行、分段（✂ 拆分/重命名/循环勾选）、提醒卡、存模板 |
| Prompt | `/prompt/:id` | 排练：双引擎分栏（双人）、跳段（保播放状态 + 段循环标记自动续圈）、循环开关、调速、主题循环、全屏、提醒卡、遥控监听、**循环计时（见 §3 D5）** |
| Stage | `/prompt/:id/stage` | 演出：Wake Lock 配对获取/释放、全屏、控件 2.5s 自动隐藏、锁定盾层（长按 2s SVG 进度环、Esc 解锁） |
| Remotes | `/remotes` | 配对码输入、连接状态、遥控按钮（含数字跳段） |
| Settings | `/settings` | 全部设置项 + 键位自定义表（remap 捕获 keydown）+ 恢复默认 + 遥控码 |
| Print | `/print/:id` | 打印版（段落 + 标记色条 + 批注 + 图例，`@media print`） |

路由为手写 history 路由（`navigate` / `useRoute` / `Link` / `matchRoute`），不依赖 react-router。

## 3. 关键数据流

```
【编辑流】编辑器 mutate → useScript 防抖 400ms → repo.saveScript(IDB) → '已保存' 提示

【播放流】rAF driver ──→ engine.tick(dt) ──→ pos 累加 / holding 倒计 / loop 回卷
                 └─→ PromptCanvas rAF：每帧直写 transform（位移）
                     useEngineSnap（页面级 rAF）：离散采样 idx/speed/loopCount → setState

【练习流】engine.onLoopIteration ──→ bump(本段 lineIds) ──→ repo.bumpPractice(IDB)
                 ──→ setCounts ──→ 当前行「已练 N 次」徽标

【设置流】Settings 页 patch ──→ localStorage 同步直写 + IDB put ──→ App 级 Context 分发
                 ──→ useEngine 同步引擎参数 ──→ PromptCanvas 重新布局

【遥控流】遥控端 postCommand ──→ BroadcastChannel ──→ 提词端 handleAction
                 ←── postStatus（800ms 节流）──  状态回报（进度/速度/循环/段号）
```

## 4. 设计决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 滚动用 rAF dt 累加，不用 CSS 动画/`setInterval` | 后者 60/120Hz 屏速度不一致、暂停后位置会跳；dt 累加可精确断言与测试 |
| D2 | 自动字号用二分且强制不换行 | 「一行一句」是提词器核心对应关系；二分在 200 行长度随机分布下仍有确定性结果可测 |
| D3 | 虚拟列表每帧直写 `transform`，绕过 React | React 60fps 重渲染整棵行树无法稳定 55fps；位移是纯数值变化，DOM 直写最廉价 |
| D4 | 设置「localStorage 同步直写 + IndexedDB 双写」，读侧 savedAt 取新 | IndexedDB 写入在页面卸载时不可靠（实测丢设置）；LS 原子同步兜底，IDB 提供结构化主存储 |
| D5 | 循环练习计时用 `loopLineIdsRef` 缓存本段行 id，不依赖派生段索引 | `indexAt()` 四舍五入会在段边界（pos ≥ 3.5×行高）提前「越界」到下一段，wrap 回调闭包读到错误段索引（真实缺陷 #5） |
| D6 | 遥控用 BroadcastChannel 而非 WebRTC | md 允许「同屏双端 + 手势映射」简化；零依赖、无信令服务器、同浏览器场景完全够用 |
| D7 | 手写 history 路由 | 避免 react-router 依赖（用户约定：无新第三方依赖）；页面仅 7 个，路由需求简单 |
| D8 | 演出解锁用长按 2s + SVG 进度环 | 舞台误触退出是灾难；进度环给用户确定性反馈，`Esc` 保留桌面端逃生口 |

## 5. 性能预算与实测

| 指标 | 预算 | 实测 |
|---|---|---|
| 5000 行滚动帧率 | ≥ 55fps | ✅ 通过（E2E 计时断言） |
| 虚拟列表 DOM 行数 | < 120 行 | ✅ 通过 |
| 混合帧率速度守恒 | 60/120Hz 每秒行数一致 | ✅ 通过（单测） |
| 过门停留精度 | 5s ± 100ms | ✅ 通过（单测） |
| 生产构建体积 | — | gzip 后约 65KB |
| Docker 镜像 | < 60MB | 21.2MB |

## 6. 数据模型

见 [README §9 附录](../README.md#9-数据模型附录)。存储布局：`scripts`/`templates` 以 `Script.id` 为 key；`settings` 固定 key `'app'`（记录含 `savedAt`）；`practice` 以 `scriptId` 为 key（值为 `{ id, counts: Record<lineId, number> }`）。

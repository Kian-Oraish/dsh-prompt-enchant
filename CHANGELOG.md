# Changelog

本文件记录 dsh-prompt-enhance(提示词附魔棒)的版本变更。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.7.0] — 2026-09-19

面向 **DSH 0.1.6-alpha.2** 的安全性与兼容性升级。**含对调用方可见的行为变更**(新增必需请求头、新增限流、selftest 工具默认关闭),故升 minor 版本。

事实基础:两份契约漂移审计(宿主半 / 客户端半),均以 0.1.5-rc.2 的真实 npm tarball 与 0.1.6-alpha.2 安装树**逐字节 diff** 得出,并配合本机只读探针实测。

### 修复(框架漂移导致,均为静默缺陷)

- **@ 引用保护闸门曾被静默关闭(P0)**:旧版用版本嗅探 `newFramework = (typeof useSession !== 'function') && (typeof useConversation === 'function')` 判定是否处于新框架;0.1.6-alpha.2 **同时**提供这两个 hook,该值恒为 `false`,于是含 @ 引用的草稿照样被送去增强,而回填走 `setDraft(纯文本)` 会把 Lexical 的引用 chip 重建为样式化文本。现改为**事实判定**(只看 occurrence 表里是否真有引用),失败方向 fail-closed。
- **多轮上下文曾静默降级为单轮**:旧版从客户端会话快照取历史,但 `SessionSnapshot` 与 `ConversationSnapshot` 都**没有** `nodes` 字段,三条取用分支全部落空,`extractHistory` 恒返回 `[]`。现改由**宿主侧** `ctx.get('sessions').get(sessionId).deriveMessages()` 派生 —— 那是框架自己喂给模型的权威历史(感知 compaction、已缓存、深冻结)。客户端只需发送 `sessionId`。
  - 附:客户端另有一条可行但未采用的路(`props.useTrajectory` → `TrajectorySnapshot.eventNodes`)。它形状够用但属**事件窗口**视图,不是权威派生历史,故不采用。已在代码注释与 README 中记录,避免后人重复论证。
- **`ctx.on('service', …)` 死兜底(客户端半)**:`'service'` 事件在 cordis 4.x 不存在(真实名 `internal/service`),该兜底从未生效。宿主半在 0.6.0 已修,客户端半本轮补齐,改用 `ctx.inject(['slots','settingsScope'], …)`。
- **切换会话后旧请求仍会写草稿**:在途增强请求现随组件卸载 / 会话切换被 abort,结果作废,不再把增强文写进**别的会话**的草稿。

### 安全

- **进程级令牌(第二道闸)**:每进程随机 32 字节令牌,经带栅栏的 `GET /prompt-enhance/api/token` 下发,客户端**仅存内存**(不写 Web Storage),此后请求带 `X-Prompt-Enhance-Token`,服务端 `timingSafeEqual` 常量时间比对。**边界如实声明**:它挡得住浏览器侧攻击面(XSS/被诱导页面/扩展)与跨重启重放,**挡不住**以你身份运行的本地进程(那类进程能读 `~/.dsh/.credentials.yaml` 自取 cookie)。令牌是纵深防御,不是特权边界。
- **删除两条绕过鉴权的死路由**:`GET /prompt-enhance/icons/{black,white}.png` —— 客户端早已改用内联 SVG、全文件零引用,而它们是当时**唯一**不调用 `authorizeRoute` 的路径。一并删除启动期读盘。
- **错误响应不再回显内部原文**:改为稳定 `code` + 白名单文案(如 `TIMEOUT` / `MODEL_ERROR` / `INPUT_TOO_LONG`),provider 错误细节只进 console 与诊断日志。
- 路由注册改用 `ctx.effect(() => ctx.webServer.register(route), …)`,与框架惯例一致、卸载可逆。

### 成本与滥用闸门

- **拆成两道闸**:`httpInflight`(上限 4)与 `modelInflight`(上限 2,仅真正调模型时持有)。旧版只有一道且只统计 HTTP 请求,导致**弹窗等确认最长 90 秒占着名额**,两次确认并发就能把第三个真实请求 429 掉。
- **确认等待让出名额**;`CONFIRM_TIMEOUT_MS` 90s → **45s**。
- **超时真正取消旧流**:改用框架正解 `@deepseek-ai/dsh-timeout` 的 `deadline()`,其 signal 交给 `llm.stream`,`Symbol.dispose()` 在 `finally` 释放(不再用会把定时器挂进 fiber disposables 的 `ctx.timeout()`)。
- **上游取消绝不重试**:用户 ESC / 请求 socket 关闭 / `exec.signal` 触发时立即上抛 —— 旧逻辑会把它当超时**再重试一次**,白烧一次模型调用。
- **请求 socket 关闭即 abort**:浏览器关标签、切换会话不再空占 45/90 秒。
- **滑动窗口限流**:20 次 / 60 秒。
- **`prompt_enhance_selftest` 默认不注册**:它是任何 agent 都能调用的工具,一跑就是 12 个真实模型调用。需要时在组合行加 `config: { debugTools: true }` 打开。两个工具均补声明 `timeoutMs` 并透传 `exec.signal`,框架的 `dsh-tool-call-timeout-policy` 因此真正生效。

### 兼容性与声明

- **`dsh.engines.dsh` 是幽灵字段**:它不在官方 `DshManifest` schema 上(正确位置是**顶层** `engines.dsh`),且框架内**没有任何 reader** —— 0.1.5 起就从未生效。现挪到顶层 `engines.dsh`,并补 `dsh.manifestVersion: 1`。
- **semver 区间曾把当前框架排除在外**:`>=0.1.5-rc.2 <0.2.0` 因 npm 的 prerelease 规则**不匹配** `0.1.6-alpha.2`(也不匹配任何 `0.1.6-alpha.x`)。现为 `>=0.1.6-alpha.0 <0.2.0`,同时覆盖 alpha 与将来的正式 0.1.6。
- **`dsh.client.inject` 补 `@deepseek-ai/dsh-client-ui-settings`**:客户端消费其 `settingsScope` 服务却不声明它。
- devDependencies 由 `dsh-tools@0.1.5-rc.2` 升到 `0.1.6-alpha.2`;新增 peer `dsh-timeout`、`dsh-util-crypto`。
- id 生成改用 `@deepseek-ai/dsh-util-crypto` 的 `randomUUID()`(缺失时退回 `node:crypto`)。
- 导航图标替换的 `MutationObserver` **作用域收敛**:不再常驻观察 `document.body` 且 `subtree: true`(流式输出/长会话列表会造成持续全站级重扫),改为 body 只看直接子节点发现面板 + 面板打开期间才细粒度观察 + 关闭即断开。

### 新增

- **框架契约哨兵 `tests/contract-sentinel.mjs`**:把插件依赖的框架契约写成 8 条可执行断言(安全栅栏签名、关键包与签名、`GenerateOptions` 字段与 `purpose` 取值域、两个快照仍无 `nodes`、`useTrajectory` 存在但窗口语义未被误用、`dsh.client.inject` 可解析、槽位与主题令牌、`engines.dsh` 覆盖当前版本)。`npm test` 默认包含,`PE_SKIP_SENTINEL=1` 可跳过,`npm run sentinel` 单跑。**框架升级后跑一次即可** —— 失败即特征,不是噪音。
- `tests/host-contract.test.mjs` 扩至覆盖:令牌闸门(缺失/错误/长度不等/令牌端点自身需栅栏/不缓存)、会话历史派生的 8 条断言(含上限、截断、缺服务降级、派生抛错降级、显式 history 优先)、错误码白名单不回显、输入过长映射、selftest 默认关闭、diag 自报状态。
- `install.sh` 支持 `--check`(只读校验链接 / 组合 / 哨兵,不一致 exit 1),已接入 `dsh-upgrade` 的 `4c/6` 步作为**失败即中止、绝不重启**的一环。
- `CHANGELOG.md`。

### 变更(安装形态)

- **`install.sh` 由「整目录复制」改为「符号链接到本仓库」**:旧式实体副本会在首次运行时自动备份为 `.bak` 并迁移。**改源码后只需重启 DSH,不必重跑 install.sh** —— 这消除了「改了源码忘了重跑脚本,于是跑的还是旧字节」这一整类事故(该漂移已真实发生过)。
- 已验证符号链接不影响框架包解析:Node 的 loader 在 import 时 canonical 化到真实路径后再上溯 `node_modules`,四个框架包均解析成功。

### 文档

- **README 新增「安全模型与威胁边界」**:明确列出两道闸门、**挡得住什么**与**挡不住什么**(不夸大令牌的作用),并给出 401 排障提示(cookie 名绑定 `Host` 头,`localhost` 与 `127.0.0.1` 不通用)。
- **README 新增「未采纳的官方件」**:`connection.fetch.register`(要求路径位于 `/api/` 下,采用需改名四处路由)、`installSection`(面向「有组合 entry 作 base」的消费者,收益为零)、`useTrajectory`(事件窗口而非权威历史)、npm 发布。逐条附理由,避免后人重复建议。
- **README 新增「已知风险与未来兼容」**:PTC 模式未实测、`patchReload` 已空转、框架无官方 CHANGELOG。
- README 版本兼容矩阵补 0.1.6-alpha.2 行与「v0.7.0 修复」小节;目录结构更正(移除已删除的 `dynamic/`,补 `tests/`、`CHANGELOG.md`)。

### 未采用(明确记录)

- `settings.installSection(...)`:旧的审计报告把它建议为「更正确」属**过度建议** —— 它面向的是「有组合 entry 作为 base/fallback 的可选设置消费者」,本插件的 `base` 本就是 schema 默认值,收益为零。
- `ctx.connection.fetch.register(...)`:见 README「未采纳的官方件」。

---

## [0.6.0] — 2026-09-12

安全与兼容性修复。**破坏性**:路由新增鉴权,行为变更如下。

### 安全(首要)

- **`/prompt-enhance/api/{enhance,modes}` 此前零鉴权**:框架自带路由由 `dsh-client-connection` 的 SPA fallback 统一 401,但 `webServer` 注册的路由在 fallback **之前**匹配,那道门不经过。实测:未带 cookie 的 POST 能驱动真模型调用并回传增强结果;`Host`/`Origin` 同为攻击者域名(DNS-rebinding 形态)亦放行。
- 改用框架官方栅栏 `ctx.connection.requestRejection(request)`,等价于 `isTrustedApiRequest`(Host/Origin 信任)+ `browserAuth.isAuthenticated`(绑定 Host 的签名 cookie),一次调用同时挡住未鉴权访问与 rebinding。
- **失败关闭**:栅栏服务缺席 → 503;栅栏抛错 → 403;绝不降级为放行。`connection` 进 `inject` 硬依赖(缺它即不挂载,而非裸奔)。
- 图标路由保持公开可缓存(客户端 `<img>` 语义,无凭据依赖)。

### 兼容性(0.1.5-rc.2 单目标)

- 删除 `ctx.on('service', …)` 竞态兜底 —— cordis 4.x **不存在**名为 `'service'` 的事件(真实名 `'internal/service'`),`ctx.on()` 对未知事件名静默容忍,该兜底从未生效;命名空间此前实际靠每次请求顺带惰性注册。改用框架惯用法 `ctx.inject(['settings'], cb)`。
- `ctx.timeout()` → 原生定时器 + `AbortController`:前者每次调用都往 fiber disposables 挂一个 effect、仅插件卸载时清理,等于每请求泄漏一个定时器;后者在 `finally` 清理,并把 signal 交给 `llm.stream`(超时即真正取消旧流)。
- schemastery 由「按需加载 + 手写降级」改为静态硬依赖:手写实现不满足 `register(ns, schema: z<T>)` 契约,与其静默降级出错误行为,不如缺失即失败。
- `temperature` 仅在未指定推理档时发送:框架不校验、原样透传,thinking 开启的推理模型常直接拒收。
- `inject` 收窄为 `['llm','webServer','tools','connection']`:宣告未用的 `timer` 只会平白增加不挂载风险。

### 交付与文档

- `package.json`:补版本区间;`peerDependencies` 的 `"*"` 改为明确区间(npm 语义下 `"*"` 其实排除全部 prerelease,原声明静默失效);声明此前未声明却被裸导入的 `@deepseek-ai/schemastery`。
- `files` 数组补齐 `lib/modes.js`、`lib/suggest.js`、`lib/confirm.js` —— 原先遗漏,真发布出去会 `ERR_MODULE_NOT_FOUND`。
- 删除已冻结的 `dynamic/` 粘贴镜像(与 README 描述不符)。

---

## [0.5.1] — 2026-09-07

- 设计层升级为**总公式**(判型→定锚→译话→补槽→成型):图像/视频双要素槽、分镜时间轴(各镜时长相加=总时长)、首尾帧过渡、白话翻译词典与渠道画幅词典;【待确认】统一严格格式(候选间「/」、候选内禁顿号/逗号/斜杠/括号、并列「+」)。
- 设计层自检用例扩至 7 个(六子模式 + 提问兜底);新增 `tests/design-layer.test.mjs` 关键词锁定与两源逐字一致断言。
- 提示词事实源收缩为 `lib/modes.js` + `config/enhance-prompt.md` 两源。

## [0.5.0] — 2026-09-05

- **【待确认】弹窗确认**:基于官方 `ctx.userQuestions` seam —— 客户端经槽位注入携带当前 `sessionId`,宿主校验其为活根 agent 后弹出官方确认卡(接管当前会话输入区);答案经同一 Promise 回流,代入原文重跑(内层抑制再弹窗,防循环);绑定失败/超时/取消/无客户端一律降级为文本标注。

## [0.4.0] — 2026-09-04

- **人设双模式里程碑**:「通用 / 设计」两种增强人设,基于官方 `ctx.settings` 落盘 `settings.yaml`,即选即存、重启保留;旧框架无设置服务时自动降级为「通用」。
- 模式建议机制:通用模式下识别到图像/视频创作内容时,输入框上方出现建议条,一键切换并自动重跑。
- 模式图标体系(内联 SVG `currentColor`,单文件双主题)。

## [0.3.0] — 2026-08-27

- **模式(人设)切换底座**:提示词 = 共享核心硬规则 + 模式专属层;设置后台左侧一级栏目「提示词附魔棒」(槽位 `settings.section`,order 19),单选模式、即选即存。

## [0.2.3] — 2026-08-25

- 兼容 DSH 0.1.2-alpha.2 新框架,加固 @ 引用保护。

## [0.2.1] — 2026-08-24

- 首个可分发版本:输入框魔法棒按钮、独立 LLM 增强调用、回填与撤销。

# Changelog

本文件记录 dsh-prompt-enhance(提示词附魔棒)的版本变更。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.7.7] — 2026-11-17

通用模式的**功能优化与缺陷修复**版本:解决模式建议与【待确认】弹窗互相抢占、含 @ 引用草稿无法增强、提问闸门误判、`__init__` 被当作粗体剥离、确认后二次重跑残留【待确认】等问题;新增双向模式建议与多轮历史工具摘要。`engines.dsh` 与框架契约不变。

### 修复

- **「模式建议」与「【待确认】弹窗」流程抢占(P1,交互级)**。增强结果同时带 `suggestedMode` 与【待确认】标记时,宿主会先在**旧模式**下弹确认卡,用户作答重跑后客户端才提示切换模式 —— 用户可能被连弹两次,而且在错误的人设下补充要素。现在 `result.suggestedMode !== null` 时**跳过**旧模式的 `confirmEnhance`,优先由客户端展示模式切换建议条;切换后按新模式重跑,只在该模式下再按需弹窗。
- **提问闸门把任务构建类祈使句误判为提问(P1,输出质量)**。旧 `isQuestion` 用 `[吗呢么]` 等宽字符匹配,「帮我写个脚本,看看**这么**做行不行」这类任务指令会被判成提问,触发校验重试、甚至按「提问」方式增强。新增 `detectQuestionInput()`:以「编写/写一个/写一份/写个/实现/开发/生成/制作/构建/设计一个/重构/整理/统计」等祈使动词开头且不以问号结尾的输入直接判为非提问;同时补齐 `QUESTION_TOKEN` 缺失的 `多少` / `哪些` / `\b(when|where|who)\b`,避免真提问被漏判。
- **`stripDecorativeFormatting` 把编程标识符当 Markdown 粗体剥离(P1,输出损坏)**。旧实现无差别删除 `__`,会把 `__init__` / `__main__` / `__dirname` / `__name__` 砍成 `init` / `main` / `dirname` —— 对代码类提示词是实质性破坏。现在只剥离**成对**的 `__…__`,且跳过纯 ASCII 标识符(前后不能是字母数字下划线);`hasFormatTokens` / `hasEmoji` 同步扩充识别 `markdown` / `加粗` / `代码块` / `表格`、`emoji` / `表情包` / `表情符号` 等文字排版意图,避免「用户要求排版」时反而把排版剥光。
- **确认弹窗二次重跑仍残留【待确认】(P1,收口不净)**。用户在弹窗作答后,二次增强仍可能产出新的【待确认】标记(模型没收到「已经确认」的信号),而二次调用带 `suppressConfirm`,这些标记会原样留在最终文本里。现在二次调用传 `finalPolish: true`:系统提示词追加 `FINAL_POLISH_SEGMENT` 收口指令(未作答占位符替换为合理默认表述、禁止再产出标记),返回前再用新增的 `stripConfirmTags()` 确定性净除兜底;收口阶段不注入模式建议段,`suggestedMode` 恒为 `null`,避免重跑又触发一次切换建议。
- **含 @ 引用的草稿被整体禁用增强(P1,能力缺失)**。v0.7.0 的闸门是「只要 occurrence 表非空就禁用」,虽然保护了引用,却让「@文件 + 一句需求」这种最常见用法完全用不了。0.2.x 的 `actions.setDraft({ text, references, command })` 会经 `draftEditor.restoreDraft` **原生重建 `ReferenceChipNode`**,因此新增 `canRestoreStructuredRefs()` / `applyStructuredRefDraft()`:occurrence 携带 `clipboardText` 时,按增强后文本重新定位每个引用并重写 `offset` / `length`,一次性交结构化快照,引用芯片与发送时的文件序列化注入完整保留;撤销同样走结构化快照恢复原文与原始坐标。闸门改为**事实判定**:仅当引用坐标损坏(`refs === null`)或草稿含固定消息引用块(`quotes`,需逐字匹配、不可改写)时仍 fail-closed;无 `clipboardText` 的旧框架退化为原有的间隙分段回填。
- **多轮历史截断丢掉末尾结论、且看不到上一轮操作过什么(P2,上下文质量)**。单条消息超 800 字时旧实现只 `slice(0, 800)`,长回复末尾的结论/修复点正好被切掉,追问时模型容易锚错重点。改为头尾双向保留 `sliceHeadTail()`(前 350 字 + ` … ` + 后 447 字,总长恒为 800);新增 `summarizeToolBlock()`,把 `tool-call` / `tool_use` 块压成 `[工具:name:target]` 摘要(目标取 path/file/filePath/command/CommandLine/Path 之一,截断 60 字,每条消息最多 3 条)拼在正文前,让「上一轮用什么工具改了哪个文件」进入上下文。

### 变更

- **双向模式建议(通用 ⇄ 设计)**。此前只在通用模式注入 `SUGGEST_SEGMENT`(通用→设计);新增 `DESIGN_SUGGEST_SEGMENT`,设计模式下识别到日常非创作任务(编程开发、文本写作、数据分析、办公问答)时建议切回通用。两个方向都只在标记合法且 ≠ 当前模式时生效,收口阶段不注入。
- **提示词两源同步**。`lib/modes.js` 的通用模式 `B. 补缺` 与 `config/enhance-prompt.md` 对齐设计层已有的**候选字符集约束**(候选间用「/」分隔、候选内禁顿号/逗号/斜杠/括号、并列用「+」连接);共享核心 `CORE_B` 新增第 9 条**多轮上下文承接规则**,使通用与设计模式共享多轮能力。
- **`confirm.js` 放宽规范方括号形态的候选嵌套括号匹配**,支持 `【待确认:篇幅(简短(300字)/详细(1000字))】` 这类候选自身带括号的写法;新增并导出 `stripConfirmTags()` 供收口阶段确定性净除。
- 版本 `0.7.6 → 0.7.7`;`engines.dsh` 不变(`>=0.2.1-rc.2 <0.3.0`),框架契约与兼容闸判定不变。

### 测试

- `node --test tests/*.test.mjs`:**87/87**(改前 81/81)。新增回归:跨模式建议时不抢先弹窗且只调一次模型;`__init__` / `__dirname` 不被剥离、任务指令不触发提问重试;工具历史摘要 + 首尾截取(总长仍严格 800、保留末尾结论);候选嵌套括号解析;`stripConfirmTags` 净除;通用模式与 `config/enhance-prompt.md` 的**两源逐字一致**断言。
- 工作区级 `check-plugin-compat.mjs`:**40/40**(4 个插件 × 10 项,失败 0、提示 0)。
- 本次为纯插件侧改动,不涉及框架升级;已安装实例需重启 DSH 才会加载新的宿主半与客户端 bundle(宿主模块在启动时缓存 `package.json` 与插件模块)。

## [0.7.6] — 2026-11-16

面向 **DSH 0.2.2-rc.3** 的复验版本:增强管线行为不变,修的是**契约哨兵对压缩客户端 bundle 的假失败**。

### 修复

- **哨兵在 0.2.2-rc.2+ 上把「契约没变」误报成「契约漂移」(P1,测试级)**。0.2.2-rc.2 起框架的客户端 bundle 改用新的压缩产物:字符串字面量从 `"…"` 变成 `` `…` ``、`return {` 变成 `return{`。旧哨兵把引号与空白写死,于是:
  - 第 4 条:`findTypeDeclaration(..., 'SessionSnapshot', '"')` 找不到 `name: \`SessionSnapshot\`` → 误报「找不到声明」;`currentSnapshot() { return {...} }` 的正则也因 `return{` 失配。
  - 第 6 条:`renderer.includes('super(ctx, "slots")')` 与 `signature: "…"` 等文本断言全部失配 → 误报「ui-renderer 不再提供 slots 服务」。
  - **实测两项契约其实都在**:`SessionSnapshot` 声明无 `nodes`;`slots` 服务签名 `declare readonly register: SlotCore['register']` 未变;`conversation.input.right` 仍是 list/session、`settings.section` 仍是 list/root;`configForms` 仍在 `dsh-client-ui-settings`。
  - **改法**:客户端 manifest 改为**结构化读取**(按 `const XXX_API=[…]` 括号配对求值 `TYPE_API`/`SERVICE_API`/`CLIENT_SLOT_API`),文本断言一律改成**引号无关**的正则(接受 `"` `'` `` ` ``);宿主 api-catalog 的读法不变(仍格式化)。断言一条未删、未削弱,只是不再依赖压缩器的排版。
- 版本 `0.7.5 → 0.7.6`;`engines.dsh` 不变(`>=0.2.1-rc.2 <0.3.0`,覆盖 0.2.2-rc.3)。

### 测试

- DSH **0.2.2-rc.3**(桌面版 0.2.2-rc.3、Node 24.21)实测:`node --test tests/*.test.mjs` **81/81**;`node tests/contract-sentinel.mjs` **8/8**(改前 6/8,两条即上述压缩产物假失败)。
- 工作区级体检 `03_工具与工作流/plugin-compat-check/check-plugin-compat.mjs`:3 个自研插件 30/30 通过。

## [0.7.5] — 2026-10-17

面向 **DSH 0.2.1-rc.2** 的适配版本:恢复被新版本闸跳过的加载 + 契约哨兵载体迁移。增强管线行为不变。

### 修复

- **0.2.1 新增的插件兼容闸把整个插件跳过(P0,功能整体消失)**。0.2.1 起 profile 启动/重组时读取插件包 manifest:若声明 `engines.dsh` 则按该 semver 区间判定(prerelease 参与),不满足的 **bundle 整包不加载**。旧区间 `>=0.1.6-alpha.0 <0.2.0` 因此被判 `incompatible-version`(requirements `{"engines.dsh":">=0.1.6-alpha.0 <0.2.0"}`),`/prompt-enhance/api/modes` 直接 404。
  - `version` 0.7.4 → 0.7.5;`engines.dsh` → `>=0.2.1-rc.2 <0.3.0`。
  - `peerDependencies` 中 `@deepseek-ai/dsh-tools` / `@deepseek-ai/dsh-timeout` / `@deepseek-ai/dsh-util-crypto` 的旧 `<0.2.0` 区间同步改为 `>=0.2.1-rc.2 <0.3.0`(`schemastery` 区间不变,`devDependencies` 不动)。
  - **验收**:框架自带 `evaluatePluginCompatibility(pkg, {}, '0.2.1-rc.2')`(实现在 `dsh-app-boot`,`semver.satisfies(runtime, range, { includePrerelease: true })`)返回 `undefined`。

### 契约哨兵:0.2.1 不再随包发 .d.ts,断言载体迁移(8 条断言一条未删)

0.2.1 的每个包只有 `lib/index.js`(宿主)/ `lib/client.js`(客户端),`lib/types/*.js` 变成运行时模块(纯类型文件只剩 `export {}`)—— 旧哨兵读 `.d.ts` 的第 1/2/3/4/6 条全部报「文件不存在」。0.2.1 把类型级契约放进框架自己生成的**机器可读目录**(以字符串字面量保存 TS 声明,是运行时会真正用到的数据),哨兵改读这些载体,断言仍落在声明层(未改成「出现过某个词」的弱断言):

- **宿主侧**:`dsh-tool-cordis/lib/types/api-catalog.js` 的 `SERVICE_API` / `TYPE_API`(cordis_inspect 的服务与类型目录,由 `scripts/gen-cordis-api.ts` 从源码 AST 生成);
- **客户端侧**:`dsh-cordis-client-runner/lib/client.js` 内嵌的 client inspect manifest(`SERVICE_API` / `TYPE_API` / `CLIENT_SLOT_API`)。

逐条迁移与 0.2.1 实测契约漂移点:

- **[1]** `connection.requestRejection(request: ConnectionTrustRequest): ConnectionRequestRejection` 签名与 `ConnectionRequestRejection = 401 | 403 | undefined` 改由 api-catalog 断言;实现里 401/403 两条拒绝分支仍在(`dsh-client-connection/lib/index.js`)。
- **[2]** webServer `register(route: WebRoute)`;settings `configure(presentation, owner = this.ctx.fiber)` 且旧 `register(ns, …)` 未回归(声明与实现双向断言);schemastery `Schema.prototype.volatile`;tools 的 `timeoutMs` 在 `ToolDefinition`、`signal` 在 `ToolExecutionInput`(0.2.1 的拆分,经 `ToolExecution` 继承给 `ToolRunContext`),并保留实现级「timeoutMs 正数校验 / exec.signal 透传」断言;`deadline()` + `[Symbol.dispose]`;`randomUUID()`;`Session.deriveMessages(): Message[]` 与 `sessions.get(id: SessionId)`(旧 .d.ts 里的 `SessionStore.get`)。
- **[3]** `GenerateOptions` 字段名未变,`purpose` 取值域仍为且仅为 `'compaction' | 'session-title'`。
- **[4]** `SessionSnapshot` 声明**仍无 `nodes`**(反向断言保持)。`ConversationSnapshot` 在 0.2.1 客户端类型注册表里没有声明,改用其构造器 `currentSnapshot()` 的返回形状(`{ views, activeTargets }`) + 同版本 `README.zh.md` 的契约文字佐证(代码注释已注明原因)。旧的 `declare module '@deepseek-ai/dsh-client-ui-slots'` 类型增强被擦除,`useTrajectory` 在 client manifest 里物化为每个 session 槽位 `standardProps` 的 `"useTrajectory: UseTrajectory"`。
- **[6]** 槽位契约改读 `CLIENT_SLOT_API`(`conversation.input.right` = list/session;`settings.section` = list/root),并交叉断言两个客户端 bundle 仍在 `renderSlot(...)` 实际渲染;`slots` 服务仍由 `ui-renderer` 提供;客户端 `configForms` 服务仍在、`settingsScope` 未回归。
- **[8]** engines 断言保留;区间求值改为与 0.2.1 兼容闸**同语义**(`includePrerelease: true`),否则 `0.2.1-rc.2` 这类 prerelease 运行时会像 0.1.6 那样被区间误判。

### 测试

- `node --test tests/*.test.mjs`:**81/81**(改前 80/81);`node tests/contract-sentinel.mjs`:**8/8**(改前 2/8)。
- 哨兵自检(非恒真验证):在可篡改的框架副本上分别改坏 `GenerateOptions.purpose` 取值域、给 `SessionSnapshot` 加 `nodes`、改坏 `settings.configure` 签名、回退 `engines.dsh` 区间 —— 对应第 3/4/2/8 条断言分别变红,其余仍绿。

## [0.7.4] — 2026-09-30

修复设置导航星标在热重载后被**撑成 128px、把整栏顶出可视区**的缺陷(用户截图报障)。

### 修复

- **星标尺寸不再依赖样式表(P0,视觉级)**。`buildNavSvg()` 原先只给 `viewBox 0 0 1024 1024` + `class="pwe-nav-star"`,16px 完全由 CSS 那条 `.pwe-nav-star { width:16px; height:16px }` 提供,svg 自身没有 `width`/`height` 属性。
  - **触发链**:编辑 `lib/client.js` → 客户端 HMR 卸载旧模块 → 卸载钩子 `ctx.effect` 移除它注入的 `<style>`(CSS 规则随之消失)→ 而**已经换进导航的那个 svg 没人回收**,新模块的 `apply()` 又在 `ctx.get('slots') === undefined` 时直接 `return`(样式可能压根没重新注入)→ 星标失去唯一尺寸来源,按 viewBox 比例撑满 flex 容器。
  - **实测复现**:在真实页面里删掉那一条 CSS 规则,星标从 `16×16` 变成 `128×128`,与用户截图一致;加上 `width`/`height` 属性后同一实验仍是 `16×16`。
  - **改法**:`buildNavSvg()` 直接设 `width="16" height="16"`(框架自带 `navIcon` 也是这个写法),尺寸不再依赖任何样式表,样式只负责观感。
- **坏星标自愈**:`swapOnce()` 原先只要 `classList` 含 `pwe-nav-star` 就跳过。旧版本留下的无尺寸星标因此永远等不到替换,必须手动刷新页面。现在把「缺 `width`/`height`」也视为待修状态,设置面板下次打开即自动换成新标。

## [0.7.3] — 2026-09-30

纯文案变更:设置页签名与页内标题改名,行为与增强管线不变。

### 变更

- **设置页签名「提示词附魔棒」→「提示词增强」**,页内标题同步改为「提示词增强 · 人设模式」。原因是页签名是设置导航里唯一的自造词,可读性差;改后与输入框按钮「增强提示词」用同一套措辞。
  - **同源必须同步的一处**:`mountSettingsNavIcon()` 里的 `SETTINGS_LABEL` 按页签文字做 `textContent` 精确匹配来替换导航图标。页签名一改,若常量不同步,星形图标会**静默失效**(纯装饰,无报错)。本次已同步,并在两处各留注释互指。

## [0.7.2] — 2026-09-25

面向 **DSH 0.1.7-rc.2** 的 settings 契约适配。修复「增强模式在设置里完全不可见、不可改」的静默缺陷;纯兼容修复,增强管线行为不变。

### 修复

- **rc.2 改写了 settings 契约,旧注册路径静默失效(P0,全程零报错)**。0.1.7-rc.2 起框架不再提供 `ctx.settings.register(ns, schema, { base, validate })`,改为「设置表单以 **profile 条目 id** 标识插件,只投影该条目 Config 的 `.volatile()` 字段;写入经当前 profile 的 Cordis patch 持久化」(见 `@deepseek-ai/dsh-settings` README,框架自带的 `dsh-agent-default-model` 即此写法);客户端也不再提供 `settingsScope`,取而代之的是 `configForms.get(条目 id)`。旧代码的守门是 `typeof settingsService.register !== 'function'` 就静默 `return`,于是 `settings.registered` 与 `failed` 双双为 false:模式恒走 `generic` 兜底,设置栏目因 `settingsScope` 缺席从未挂载 —— 而这一切**没有任何日志或报错**,属本项目反复踩的「声明与现实脱节」同一类债。
  - **宿主半**:导出 `Config = z.object({ mode: … .volatile() })`;模式改从 `apply(ctx, config)` 的**反应式 Config 引用**读取(改设置即刻生效,无需重载);`configure({ auto: false }, ctx.fiber)` 策略按 rc.2 惯用法注册(本插件自带设置栏目)。旧命名空间注册路径保留为兜底,两条路径互不干扰。
  - **客户端半**:新增 `resolveSettingsScope()`,优先 `configForms.get('prompt-enhance')`,回退旧 `settingsScope.bind({ namespace })`。两者接口同形(`getSnapshot()` / `set(field, value)` / `subscribe()`),因此模式卡片 UI 无需改写。重试等待里也从 `ctx.inject(['slots','settingsScope'])` 收敛为 `['slots']` —— rc.2 没有 `settingsScope` 这个服务名,写进 inject 会永不回调。
- **同源静默缺陷:插件配置项在 rc.2 下被整体忽略**。`diagFile` / `maxInputChars` / `maxOutputChars` / `historySanitize` / `temperature` / `debugTools` 原先用 `config?.x` 直读,而 rc.2 的 Config 是**反应式引用**(`{ get() }`),直读拿到的是引用对象 → 所有 `typeof`/`Number.isFinite` 判断恒假,选项全部回落到硬编码默认值。现统一走 `cfg(key, fallback)` 兼容引用与普通值两种形态。
- **诊断工具如实报告新契约**:`prompt_enhance_diag` 的 `settings` 段新增 `configBound`(rc.2 的 Config 引用是否绑定)与 `policy`(`configure({auto:false})` 是否注册),`registered`/`failed` 保留但含义收窄为「旧契约命名空间」。

### 测试与契约哨兵

- **哨兵的 settings 断言同步到新契约**(否则它会永远报「漂移」):`check('2')` 由 `settings.register< / base? / validate?` 改为「`settings.configure(` 存在 + `register<` 不回归 + `schemastery` 有 `.volatile()`」;`check('6')` 由 `settingsScope` 改为 `configForms`(并加负向断言:旧的 `settingsScope` 不应再出现)。
- **修正哨兵的两处假失败**:
  - `check('7')` 原先只查 `ui-layout` / `ui-settings-plugins` 两个载体的客户端 JS —— 0.1.7-rc.2 起主题令牌定义在 **`dsh-client-ui-theme`**,于是「载体换了」被误报成「令牌没了」。现按三个载体依次探测。
  - 顺带核实:rc.2 的令牌表里 **`--dsw-alias-label-error` 已被移除**,只剩 `--dsw-alias-state-error-primary/-secondary`;本插件 CSS 已是链式兜底,自动落到第二跳,行为不受影响,仅更正了那句「仍然有效」的过期注释。
- **哨兵恢复可运行(此前已静默失效)**:终端版 DSH 卸载后,磁盘上不再有框架安装树,而 Electron 包内**不含任何 `.d.ts`**(哨兵按类型源码断言),于是 `npm test` 里的哨兵一直报「无法定位完整的 DSH 框架安装树」。现在可用 `DSH_FRAMEWORK_DIR` 指向一份**发布版镜像**运行:
  ```bash
  # 镜像已生成(20 个包, 6.1MB, 含 270 个 .d.ts),与桌面版同版本 0.1.7-rc.2
  DSH_FRAMEWORK_DIR="$HOME/.dsh/framework-mirror-0.1.7-rc.2/node_modules/@deepseek-ai" npm test
  ```
  实测:**哨兵 8/8 通过**,插件自身测试除哨兵外全部通过。镜像需随桌面版升级重建(`npm pack` 同版本包后解包即可)。

### 说明

- `engines.dsh` 范围不变(`>=0.1.6-alpha.0 <0.2.0`):两条 settings 路径都在,旧框架行为与 0.7.1 一致。
- 模式值在 rc.2 下落盘于**当前 profile 的 Cordis patch**(`profiles/<profile>/cordis.patch.yml` 中该条目的 `config.mode`),不再写 `settings.yaml`;旧文件 `settings.yaml.imported` 里的 `prompt-enhance:` 段落已不再生效,可留存作历史。

## [0.7.1] — 2026-09-19

**严重缺陷修复:每次点击增强都会永久卡在「呼吸加载」,永不返回结果。** 纯 bugfix,无行为变更。

### 修复

- **健康请求被自己 abort,随后拒绝回写响应 → 客户端永久挂住(P0)**。0.7.0 为「浏览器关标签即中止」装了监听,但监听错了对象:写成 `req.on('close')`。Node 在**请求体读完时**就触发 req 的 `'close'`(不是等连接关闭),于是**每一个健康的增强请求**都在读完 body 的瞬间把自己 abort 掉;而 v0.7.0 的 catch 分支在「已 abort 且尚未回写」时判定客户端已离开、**静默跳过响应** —— 两边叠加的结果是请求被中止且没有任何回写,客户端只能永远等待。
  - 为什么之前"修过两次"都没修好:每一次修复都只动了**一半**。第一次改 abort 触发条件(加 `writableEnded` 守卫),但 req 的 `'close'` 触发得**比 body 读完还早**,守卫那一刻必然为假;真正错的是**监听对象**。
  - 正解:监听 **`res` 的 `'close'`**。它在「响应结束」或「连接断开」时恰好触发一次,届时 `res.writableEnded` 已能可靠区分两种情况。健康请求不再被 abort,真实断开仍能中止。
  - 该缺陷**与模型调用无关**:一个连模型都不需要碰的请求(如 `POST /enhance {}`)同样挂死 —— 这正是它无法靠「换个模型/重试」绕过、且单测抓不到的原因。
- **回归防线直接建在真实 `node:http` server 上**。旧的两条用例用替身模拟 req/res,而替身模拟不出这套事件时序 —— 两版错误修复都能"通过测试"却在生产翻车,根因就在这里。现在新增的两条用例起一个真正的 HTTP 服务器,一条断言健康请求必须拿到 200,一条断言中途断开必须能中止且不挂住连接。
- **运行期探针自身不再可能挂死**。`scripts/verify-runtime.mjs` 原先没有逐请求超时,服务端一旦不回写响应,探针会自己静默卡住(实测以 `last exit 142` 告终且无任何输出)。现改为每请求 8 秒上限 + **无缓冲**输出:任何一步挂起都会立刻指名道姓地报出是哪一个请求。

### 变更

- **诊断工具的版本号不再硬编码**:`prompt_enhance_diag` 的 `version` 改为从 `package.json` 读取(读不到时如实报 `unknown`),对应测试也改为与 `package.json` 比对。硬编码版本号与本项目反复踩的「声明与现实脱节」是同一类债。

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

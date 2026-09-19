# dsh-prompt-enchant · 提示词附魔棒

**🌐 Language | 语言:[English](./README.en.md) · 中文**

在 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai) Web 对话界面中,为输入框添加一个**四角闪光星魔法棒按钮**:点击后把用户口语化、零散、可能含错别字的输入,经**独立 LLM 调用**增强为更精准、更易被 AI 理解和执行的表达,回填输入框供人工确认后发送。

> 本功能为原创实现的通用「提示词增强」能力,不涉及任何第三方产品商标或图标。

## 🚀 快速安装(磁盘常驻版,重启自动加载)

1. 克隆仓库到本地:
   ```bash
   git clone https://github.com/Kian-Oraish/dsh-prompt-enchant.git
   cd dsh-prompt-enchant
   ```
2. 执行安装脚本(幂等,可重复执行;会**把插件目录符号链接到本仓库**并注册组合配置):
   ```bash
   ./install.sh
   ```
   脚本做的事:
   - 把 `$HOME/.dsh/profiles/web/node_modules/dsh-prompt-enhance` 做成指向本仓库的**符号链接**(v0.7.0 起;若该位置是旧式实体副本会先备份为 `.bak` 再迁移);
   - 在 `$HOME/.dsh/profiles/web/cordis.patch.yml` 中注册 `- insert: - id: prompt-enhance` 组合行。
3. **重启 DSH**(Web 界面所属的 dsh 进程)即可生效——无需每次粘贴代码;
4. 输入框右下角出现星星魔法棒:输入口语化需求 → 点星星 → 增强回填 → 编辑后发送。

> ⚠️ **改了 `lib/client.js` 必须重启 DSH,浏览器刷新不够**。客户端 bundle 在服务端按**内容哈希(rev)** 缓存在内存里,不重启就继续发旧字节。Host 半(路由/工具)同理。

**更新 / 卸载**:
- 更新:因为装的是符号链接,**只需重启 DSH**(`launchctl kickstart -k gui/501/com.deepseek.dsh.web`)即可生效,不必重跑 `install.sh`;
- 自检:`./install.sh --check`(只读校验链接 / 组合 / 契约哨兵,不一致时 exit 1);
- 卸载:删除该符号链接,并从 `cordis.patch.yml` 移除 `id: prompt-enhance` 的 insert 块,重启即可;
- 回滚:若迁移时产生过 `.bak`,`rm -f` 符号链接后 `mv` 回去即可。

> v0.6.0 起已移除「动态插件」形态(其粘贴镜像早已冻结,与 README 描述不符),本插件只提供磁盘常驻安装。

## ✨ 特性

1. **设置后台一级栏目入口**:在 DSH 设置后台左侧导航以「提示词附魔棒」一级栏目呈现(粒子生成星图标),与提示词库同款形态。
2. **双模式人设底座**:「通用 / 设计」两种增强人设,基于官方 `ctx.settings` 落盘 `settings.yaml`,即选即存、重启保留;旧框架无设置服务时自动降级为「通用」。
3. **设计模式专业层**(v0.5.1 总公式):面向 AI 图像创作(文生图/图生图/交互编辑)与视频创作(文生视频/图生视频/首尾帧),按「判型→定锚→译话→补槽→成型」通用公式组织——图像/视频双要素槽、分镜时间轴(各镜时长相加=总时长)、首尾帧过渡、白话翻译词典与渠道画幅词典,未确认要素以规范格式【待确认:要素(候选)】标注并可直接弹窗补全;非创作输入自动按通用方式增强(层内兜底)。
4. **模式建议机制**:通用模式下增强到图像/视频创作内容时,输入框上方出现建议条「检测到当前内容更适合 设计 模式」;一键切换即持久化模式,并自动用新模式对原始输入重跑回填。
5. **模式图标体系**:设计模式=吉祥物星、设置目录=粒子生成星、通用=四角闪光星;全部为内联 SVG(`currentColor`)一份文件适配明暗主题,严格纯色填充。
6. **现代视觉面板**:模式卡片含单选圆点、场景标签(图像/视频/通用)、单行描述省略与完整 tooltip、选中态强调描边与对勾、底部「当前生效」状态栏;支持键盘操作与减少动效偏好。
7. **安全与引用保护**(底座能力):共享核心硬规则——@ 引用记号逐字保留、纯文本输出、注入防护;新框架下含 @ 引用的草稿禁用增强以保护引用注入;`/plan` 等命令声明原样保留;API 层加固(POST-only / JSON / 跨站拒绝 / 并发上限)。
8. **【待确认】弹窗确认**(v0.5.0):增强结果中模型无法可靠推断的缺失要素(`【待确认:要素(候选)】`,兼容无方括号变体)自动触发 DSH 官方确认卡——逐题点选候选或自定义填写,提交后答案代入原文重跑增强并回填,输出不再残留【待确认】;90 秒无应答/会话不可用时自动降级为文本标注,绝不卡死。
9. **设计层总公式升级**(v0.5.1):设计层从两张要素清单重构为一道总公式 + 双要素槽 + 六子模式差异卡 + 两词典 + 输出骨架;【待确认】统一严格格式(候选间用「/」分隔、候选内禁顿号/逗号/斜杠/括号、并列用「+」),四个锚点小节标题与通用模式行为零变化;粘贴形态 `dynamic/` 镜像自本版起冻结,提示词事实源收缩为 `lib/modes.js` + `config/enhance-prompt.md` 两源。

## 操作演示

| 设置面板 · 浅色(选中「设计」) | 设置面板 · 深色(选中「设计」) |
| --- | --- |
| ![浅色面板](./assets/screenshots/v6-panel-light.png) | ![深色面板](./assets/screenshots/v6-panel-dark.png) |

| 卡片细节(场景标签 / 底部状态栏) | 模式建议条(输入框上方) |
| --- | --- |
| ![卡片细节](./assets/screenshots/v6-card-detail.png) | ![建议条](./assets/screenshots/v6-suggest-bar.png) |

| 魔棒 · 通用模式(闪光星) | 魔棒 · 设计模式(吉祥物星) | 一键切换后 · 设计模式输出 |
| --- | --- | --- |
| ![通用魔棒](./assets/screenshots/v6-wand-generic.png) | ![设计魔棒](./assets/screenshots/v6-wand-design.png) | ![设计输出](./assets/screenshots/v6-design-output.png) |

**模式建议全流程**(增强 → 建议条 → 一键切换 → 自动重跑):

![建议流程](./assets/screenshots/demo-mode-suggest-flow-v6.gif)

引用保真、命令声明保留等安全行为的详细说明见「兼容性与安全」章节。

## 工作原理

两段式管线(确定性代码 + 单次 LLM 自适应调用):

```
用户输入(可带历史上下文)
        │
        ▼
[① 确定性] 输入解析:语言检测 · 代码围栏 · 格式记号 · 长度拦截
        │
        ▼
[②③④ 单次 LLM] 自适应增强:四档增强度自选 + 多轮模式 + 五条硬性规则
        │
        ▼
[⑤ 确定性] 终校验:语言一致 / 长度 / 代码块 → 失败重试一次 → 兜底(剔码/截断保围栏)
        │
        ▼
回填输入框(可编辑)→ 用户确认 → 发送执行
```

架构形态:Host 半(ESM Cordis 插件)挂载于 DSH 组合,提供 `/prompt-enhance/api/{enhance,modes,token}` 三条鉴权路由;Client 半为预构建 web bundle,由 DSH clientModules 自动伺服与加载(URL 带内容哈希 `rev`,故改客户端代码后必须重启守护),经 HTTP 与 Host 通信。改写调用是**独立调用**,不注入、不修改 agent 自身的系统提示词。

## 目录结构

```
dsh-prompt-enchant/
├── README.md / README.en.md    # 中英双语文档
├── CHANGELOG.md                # 版本变更记录
├── LICENSE
├── package.json                # 插件包元信息(顶层 engines.dsh + dsh.bundle + dsh.client 声明)
├── cordis.patch.yml            # 组合补丁:注册 id: prompt-enhance 行
├── install.sh                  # 一键安装(符号链接到本仓库 + 配置引用 + 提示重启;支持 --check)
├── lib/
│   ├── index.js                # Host 半:增强管线、HTTP 路由、会话历史派生、自检工具
│   └── client.js               # Client 半(预构建 bundle):魔法棒按钮与交互
├── config/
│   └── enhance-prompt.md       # 可调优:改写系统提示词全文
├── tests/                      # 离线单测(node --test)
│   ├── contract-sentinel.mjs   # 框架契约哨兵(8 条断言,框架升级后跑一次)
│   ├── contract-sentinel.test.mjs
│   └── host-contract.test.mjs  # 路由鉴权/令牌闸门/会话历史派生/成本闸门/错误码
└── assets/icons/               # 模式图标(随包内置;UI 用内联 SVG currentColor)
    ├── sparkle.svg             # 通用模式 · 四角闪光星
    ├── design.svg              # 设计模式 · 吉祥物星(evenodd)
    ├── genstar.svg             # 设置目录 · 粒子生成星(evenodd)
    ├── sparkle_black.svg       # 固定色黑星(兼容场景)
    ├── sparkle_white.svg       # 固定色白星(兼容场景)
    ├── sparkle_black_128.png   # 位图备选(亮色主题用)
    └── sparkle_white_128.png   # 位图备选(暗色主题用)
```

> v0.7.0 起 `/prompt-enhance/icons/*.png` 两条路由**已删除**(客户端早已改用内联 SVG,从不请求它们;它们是当时唯一绕过鉴权栅栏的路径)。`assets/icons/` 仍随包保留备用,但不再有任何路由消费。

## 配置项

磁盘常驻版通过组合行 `config` 传参(可选,全部有默认值):

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| `diagFile` | 空(关闭) | 诊断日志绝对路径,开启后追加写入 |
| `maxInputChars` / `maxOutputChars` | 20000 / 6000 | 输入/输出长度上限 |
| `historySanitize` | `true` | 多轮历史 Markdown 记号净化开关 |
| `temperature` | `0.3` | 增强调用的采样温度 |
| 改写提示词 | `config/enhance-prompt.md` | 语义资产,调优即替换 `lib/index.js` 中的 `FLEXIBLE_SYSTEM_PROMPT` |

## 图标资源

`assets/icons` 下为模式图标(与 `~/.dsh` 之外的图标资产指南一致的成套资产):通用模式 = `sparkle.svg`(四角闪光星);设计模式 = `design.svg`(吉祥物星,`fill-rule="evenodd"` 负空间细节);设置目录 = `genstar.svg`(粒子生成星,`evenodd`)。**全部首选 currentColor 内联 SVG**:颜色跟随按钮文字色,一份文件同时适配明暗主题(随 DSH 主题开关 `body[data-ds-dark-theme]`);固定色 SVG 与透明底 PNG(128×128)为兼容备选;JPEG 一律不接 UI。图标由仓库所有者使用豆包 Seedream 生成并本地处理,随仓库以 MIT 许可一并发布。

## 隐私与安全

- 无 API 密钥、无遥测;改写调用走 DSH 的 `llm` 服务与当前默认模型;
- 用户输入仅在本机 DSH 进程内流转,不回传任何第三方;
- 插件仅注册本机回环 HTTP 路由,不监听外部接口。

## 兼容性与安全

**框架契约**(已在 DSH **0.1.1-rc.2** 实测验证,含全部演示素材;并已按 **0.1.2-alpha.2 / alpha.5** 磁盘类型契约逐项核对):`conversation.input.right` 槽位注册(`id/order/label`,kind=list/scope=session)与 InputZone 标准 props;`defineTool` 属性映射参数;`dsh.client` 声明与 clientModules 预构建 bundle 格式;主题开关 `body[data-ds-dark-theme]`;v0.3.0 起额外使用官方 `ctx.settings`(命名空间 `prompt-enhance`)与设置后台左侧一级栏目槽位 `settings.section`(order 19,与「提示词库」同款),均按 alpha.5 源码逐行核对。

**版本兼容矩阵**:

| DSH 版本 | 增强 | 多轮上下文 | @ 引用处理 | 设置后台(模式切换) |
| --- | --- | --- | --- | --- |
| 0.1.1-rc.2(已实测) | ✅ | ✅(`useSession` 快照) | ✅ 增强后引用逐字保留、chip 状态与发送序列化注入完整保留 | ❌ 无设置入口,恒用「通用」模式 |
| 0.1.2-alpha.x(alpha.5 契约已核对) | ✅ | ⚠️ 降级为单轮(`useSession` 已移除,`useConversation` 不含消息历史) | ⚠️ 输入机改为 Lexical 编辑器,公开 API 无引用重插动词,`setDraft` 会把引用 chip 退化为文本提及(发送时不再注入文件内容)——因此**含 @ 引用的草稿在该版本下按钮禁用**(悬停可见说明),以保护引用完整性;无引用草稿正常增强 | ✅ 「设置」左侧一级栏目「提示词附魔棒」:单选模式、即选即存(当前仅「通用」;垂类模式后续随注册表扩充) |
| **0.1.6-alpha.2(v0.7.0 实测)** | ✅ | ✅ **宿主侧派生历史**(`sessions.deriveMessages()`),感知 compaction | ✅ 含 @ 引用时**按钮禁用**(fail-closed);见下方「v0.7.0 修复」 | ✅ 同上,并补声明 `dsh-client-ui-settings` |
| 更早版本(无客户端槽位系统) | ⚠️ 按钮不渲染 | — | — | — |

**v0.7.0 修复(针对 0.1.6 的实测漂移)**:

1. **引用保护闸门曾被静默关闭(重要)**:旧版用**版本嗅探**判断是否处于新框架——`newFramework = (typeof useSession !== 'function') && (typeof useConversation === 'function')`。0.1.6-alpha.2 **同时**提供这两个 hook,于是该值为 `false`,闸门**一直没生效**:含 @ 引用的草稿照样被送去增强。现改为**事实判定**(只看 occurrence 表里是否真有引用),不再嗅探版本。
2. **多轮上下文曾静默降级为单轮**:旧版从客户端会话快照取历史,但 `SessionSnapshot` 与 `ConversationSnapshot` 都**没有** `nodes` 字段,三条取用分支全部落空、`extractHistory` 恒返回 `[]`。现改为**宿主侧**用 `ctx.get('sessions').get(sessionId).deriveMessages()`——那是框架自己喂给模型的**权威派生历史**(感知 compaction、已缓存、深冻结),客户端只需发送 `sessionId`。
3. **`dsh.engines.dsh` 曾是幽灵字段**:它不在官方 `DshManifest` schema 上(正确位置是**顶层** `engines.dsh`),且框架内**没有任何 reader**。0.1.5 起就从未生效。现挪到顶层并加强断言。
4. **semver 区间曾把当前框架排除在外**:`>=0.1.5-rc.2 <0.2.0` 因 npm 的 prerelease 规则**不匹配** `0.1.6-alpha.2`(也不匹配任何 0.1.6-alpha.x)。现为 `>=0.1.6-alpha.0 <0.2.0`。
5. **客户端死兜底**:`ctx.on('service', …)` 中的 `'service'` 事件在 cordis 4.x **不存在**(真实名 `internal/service`),该兜底从未生效;已换成 `ctx.inject(['slots','settingsScope'], …)`。

`dsh.client.inject` 仅声明客户端模块图中实际存在的包(`locale`/`ui-conversation`;`dsh-client-runtime`、`dsh-client-ui-slots` 在新版本中已不存在,本包亦未引用,故不在注入清单);客户端 bundle 仅 `require('react')`,槽位服务经 `ctx.get('slots')` 获取。设置卡片经 `ctx.get('settingsScope')` 惰性挂载(不加入注入清单,旧框架/加载竞态下静默跳过,魔棒不受影响)。

**【待确认】确认弹窗**(v0.5.0):基于官方 `ctx.userQuestions` seam——客户端经槽位注入携带当前 `sessionId`,宿主校验其为活根 agent 后弹出官方确认卡(接管当前会话输入区);答案经同一 Promise 回流,代入原文重跑(内层抑制再弹窗,防循环);绑定失败/超时/取消/无客户端一律降级为文本标注(行为与 v0.4.0 一致)。自检工具默认抑制弹窗。验收用测试案例见 `docs/测试案例.md`。

**设计层总公式**(v0.5.1):`DESIGN_LAYER` 升级为「判型→定锚→译话→补槽→成型」通用公式,含图像/视频双要素槽、分镜时间轴、六子模式差异卡、白话翻译词典与渠道画幅词典;【输出格式】锁定待确认规范格式与候选字符集约束(候选间「/」、候选内禁顿号/逗号/斜杠/括号、并列「+」),保证弹窗候选可解析。自检设计用例扩至 7 个(六子模式 + 提问兜底),新增 `tests/design-layer.test.mjs` 关键词锁定与两源逐字一致断言;`dynamic/` 粘贴镜像冻结(停留旧层,仅作参照)。验收用例见 `docs/测试案例.md` 0.5.1 节。

**模式(人设)架构**(v0.3.0):提示词 = 共享核心硬规则(`lib/modes.js` 的 CORE_A/CORE_B,含 @ 引用保护、注入防护、纯文本协议,任何模式不可覆盖)+ 模式专属层;模式注册表位于宿主 `lib/modes.js`,设置落盘 `~/.dsh/settings.yaml`(官方 `ctx.settings`),宿主按当前模式实时组装提示词;客户端通过 `GET /prompt-enhance/api/modes` 读取模式元数据渲染卡片。增强响应固定携带 `suggestedMode` 字段(单模式时代恒为 `null`),为后续「检测到内容更适合某模式时建议切换」预留。

**命令插件交互**(`/plan`、`/goal` 等):用户在声明命令(claimed)时**可以点击增强**——插件只改写命令之后的正文部分,命令标记与声明状态原样保留,优化结果不影响命令的调用与显示;命令标记无法定位或输入处于判定/提交中时按钮禁用,绝不干扰命令流程。本插件命名空间(`prompt-enhance` / `prompt_enhance_*` / `pwe-*` / `/prompt-enhance/*`)与这些命令零重叠。

**@ 引用保护**(`@文件名` / `@文件路径` / `@会话名` 等):增强时引用记号被视为不可触碰的占位符——改写提示词硬性规则要求逐字原样保留、顺序不变,输出经确定性校验,未通过则重试一次、仍失败则整体回退原文;客户端回填按「引用间隙」分段替换(仅改写引用之间的正文),引用的 occurrence 状态与发送时的文件序列化能力完全不受影响;撤销同样只恢复各间隙原文。

**安全模型与威胁边界**(v0.6.0 起建立,v0.7.0 补第二道闸):

API 路由经**两道**闸门,全部失败关闭(fail-closed):

1. **框架栅栏**:复用官方 `ctx.connection.requestRejection(req)`,等价于 `isTrustedApiRequest`(Host 必须是回环或显式可信主机、`Sec-Fetch-Site` 非 cross-site、`Origin` 必须与 `Host` 同源)+ 浏览器会话鉴权(绑定 Host 的签名 `HttpOnly` cookie)。未鉴权 → 401,Host/Origin 不受信 → 403。`connection` 服务缺席 → **503 拒绝**,绝不降级为放行。
2. **进程级令牌**(v0.7.0):Host 每进程随机生成 32 字节令牌,客户端经 `GET /prompt-enhance/api/token`(过框架栅栏)取一次、**仅存内存**(不写 `localStorage`/`sessionStorage`),此后每个请求带 `X-Prompt-Enhance-Token`,服务端用 `timingSafeEqual` 常量时间比对。缺令牌/错令牌 → 403。

> ✅ **挡得住**:未鉴权的本机其他用户/进程、DNS-rebinding 页面、跨站表单与脚本、浏览器侧 XSS/被诱导页面/扩展(它们能借到 cookie 但读不到 DSH 进程内存)、跨 DSH 重启的重放(令牌每进程轮换)。
>
> ❌ **挡不住**:**以你本人身份运行的本地进程**。它能读 `~/.dsh/.credentials.yaml` 自取会话 cookie,也就同样能自己走完这两道闸。令牌是**纵深防御的一层,不是特权边界**——请不要把它当作"本机沙箱"。
>
> **排障**:若浏览器里增强报 401,先看地址栏是 `localhost:3080` 还是 `127.0.0.1:3080`——cookie 名由 `Host` 头哈希而来,两者**不通用**,换地址需用 `dsh web` 打印的带 `?token=` 的 URL 重新换 cookie。

其余请求级防护:仅接受 `application/json`(挡简单跨站表单);`POST`-only;滑动窗口限流 20 次/分钟;并发两道上限(模型调用 2、HTTP 请求 4);请求体上限 4MB;响应 `Cache-Control: no-store` + `X-Content-Type-Options: nosniff`;错误响应只回**稳定 code + 白名单文案**,绝不回显 provider/内部原文;输出净化(剥离 Markdown 装饰、emoji、双向控制符与零宽字符)。

**成本闸门**(v0.7.0):单次增强最坏触发 4 次模型调用(首调 + 空正文重试 + 校验重试 + 弹窗后重跑)。因此:模型调用数独立计数(`MAX_MODEL_INFLIGHT=2`),**弹窗等待期间释放 HTTP 名额**(旧版 90 秒占着名额会把第三个真实请求 429 掉,已降到 45 秒);45 秒超时走框架 `deadline()` 并**真正取消旧流**;浏览器关标签 / 切换会话 → 中止在途增强,不再空占;用户取消**绝不重试**。Agent 可见的 `prompt_enhance_selftest` 工具**默认关闭**(它一跑就是 12 个真实模型调用),需要时在组合行加 `config: { debugTools: true }`。

> **「客户端断开即中止」的监听对象(v0.7.1 勘误)**:必须监听 **`res` 的 `'close'`**,不能监听 `req` 的。Node 在**请求体读完时**就触发 req 的 `'close'`,监听它会让**每一个健康请求**在读完 body 的瞬间自我中止;而中止后 catch 分支会判定「客户端已离开」而**不回写响应**,结果是客户端永久停在加载态。`res` 的 `'close'` 在响应结束或连接断开时恰好触发一次,届时 `res.writableEnded` 才能可靠区分二者。这条时序**替身模拟不出来**,对应的回归测试因此建在真实 `node:http` server 上。

## 未采纳的官方件(附理由,避免后人重复建议)

框架里确实存在「更框架化」的替代品,但本插件**刻意不采用**,理由如下 —— 它们不是技术债,是权衡结果:

| 官方件 | 本插件现状 | 不采纳的理由 |
| --- | --- | --- |
| `ctx.connection.fetch.register({path, methods, fetch})` | 自建 exact 路由 + 显式调用 `requestRejection` | 该 API 的 `assertFetchRoute` 要求路径**必须位于 `/api/` 之下**且每段匹配 `/^[A-Za-z0-9_$.-]+$/`。采用它意味着把四处路由从 `/prompt-enhance/*` 改名为 `/api/prompt-enhance/*` 并同步改写客户端——用**已经实测验证过**的栅栏(401/403 行为已固化进测试)去换一个尚未实测的通道,风险不对称。 |
| `settings.installSection(owner, ns, schema, entry, hooks)` | `ctx.inject(['settings'], cb)` + `register(ns, schema, {base, validate})` | `installSection` 面向的是「有组合 entry 作为 base/fallback 的可选设置消费者」;本插件的 `base` 本来就是 schema 默认值,用它收益为零,反而会改动当前**唯一零漂移**的部分(设置卡片)。 |
| `props.useTrajectory`(客户端取消息历史) | 宿主侧 `sessions.deriveMessages()` | `TrajectorySnapshot.eventNodes` 确实带 `kind`/`content`/`blocks`,形状够用;但它是**事件窗口**视图(还带 `eventLocations`/`partial`),不是权威派生历史,长会话下会缺头部,且要在客户端重做角色/预算/压缩裁剪。宿主侧那份就是框架喂给模型的历史,并且能用纯单测覆盖。 |
| npm 发布 + `dsh plugin add` | 磁盘常驻 + `install.sh` 符号链接 | `dsh plugin add` 转发给 pnpm,会引入 peerDependencies 解析面(且 prerelease 语义坑多)。当前只服务本机一个 profile,收益不足。 |

## 已知风险与未来兼容

1. **`dsh-tools` 的 PTC 模式(未实测)**:0.1.6 新增 `mode: 'ptc' | 'both'`。类型注释明确:**PTC 模式下,模型直接发起的原生工具调用会被拒绝**(只有带 parent 的调用才允许执行原生工具名)。当前 profile 是默认 `native`,风险**惰性**;若将来启用 PTC,本插件的工具将只能经 `run_code` 抵达。**本插件未在 PTC 模式下实测过**。
2. **`patchReload` 已空转**:`~/.dsh/profiles/web/package.json` 里的 `"patchReload": "live"` 在 0.1.6 已从 `DshProfileManifest` 类型中移除,且全树 grep 无 reader。**不要依赖 patch 热重载**——改完配置请重启守护。
3. **框架无官方 CHANGELOG / 迁移说明**:本插件的兼容性结论全部来自对已安装框架源码的**逐字节 diff 与 grep**,不是官方发布说明。这也是为什么需要有下面的契约哨兵。

## 契约哨兵(框架漂移的自动报警器)

本次升级暴露的真正问题不是「框架改了一个 API」,而是「**框架改了,而没有任何东西会告诉你**」——引用闸门静默失效、多轮上下文静默降级,48 个单测全部通过。所以本插件把依赖的框架契约写成**可执行断言**:

```bash
npm test          # 默认包含哨兵(框架漂移会红)
npm run sentinel  # 只跑哨兵
PE_SKIP_SENTINEL=1 npm test   # 只验插件自身逻辑时跳过
```

哨兵逐条断言(共 8 条):`connection.requestRejection` 仍在且 401/403 语义未变;8 个关键框架包与签名齐全;`GenerateOptions` 字段名与 `purpose` 取值域未变;两个会话快照仍**不含** `nodes`;`useTrajectory` 仍在但其窗口语义未被误用;`dsh.client.inject` 四项在框架树中可解析;`slots` 与两个槽位声明仍在;`data-ds-dark-theme` 与错误色令牌仍有效;顶层 `engines.dsh` 区间覆盖当前框架版本。

**框架升级后跑一次即可**:失败即特征(契约漂移),不是噪音 —— 失败信息直接指向要改哪一处。若框架装在非默认位置,用 `DSH_FRAMEWORK_DIR` 指向 `…/node_modules/@deepseek-ai`。

## License

[MIT](./LICENSE) © 2026 Kian-Oraish

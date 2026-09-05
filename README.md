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
2. 执行安装脚本(幂等,可重复执行;会把插件复制到 DSH 插件目录并注册组合配置):
   ```bash
   ./install.sh
   ```
   脚本做的事:
   - 复制插件到 `$HOME/.dsh/profiles/web/node_modules/dsh-prompt-enhance/`;
   - 在 `$HOME/.dsh/profiles/web/cordis.patch.yml` 中注册 `- insert: - id: prompt-enhance` 组合行。
3. **重启 DSH**(Web 界面所属的 dsh 进程)即可生效——无需每次粘贴代码;
4. 输入框右下角出现星星魔法棒:输入口语化需求 → 点星星 → 增强回填 → 编辑后发送。

**更新 / 卸载**:
- 更新:修改仓库代码后重新执行 `./install.sh` 并重启;
- 卸载:删除 `$HOME/.dsh/profiles/web/node_modules/dsh-prompt-enhance/`,并从 `cordis.patch.yml` 移除 `id: prompt-enhance` 的 insert 块,重启即可。

> 备选「动态插件」方式(免重启、进程内临时生效):把 `dynamic/host.js` 与 `dynamic/client.js` 分别粘贴进 DSH Web GUI 的插件面板运行;重启后需重新粘贴。磁盘常驻版与动态版功能一致,推荐使用常驻版。

## ✨ 特性

1. **设置后台一级栏目入口**:在 DSH 设置后台左侧导航以「提示词附魔棒」一级栏目呈现(粒子生成星图标),与提示词库同款形态。
2. **双模式人设底座**:「通用 / 设计」两种增强人设,基于官方 `ctx.settings` 落盘 `settings.yaml`,即选即存、重启保留;旧框架无设置服务时自动降级为「通用」。
3. **设计模式专业层**:面向 AI 图像创作(文生图/图生图/交互编辑)与视频创作(文生视频/图生视频/首尾帧)——主体、风格、构图、光照、运镜、首尾帧等专业要素的术语化与补全,未确认要素标注【待确认】;非创作输入自动按通用方式增强(层内兜底)。
4. **模式建议机制**:通用模式下增强到图像/视频创作内容时,输入框上方出现建议条「检测到当前内容更适合 设计 模式」;一键切换即持久化模式,并自动用新模式对原始输入重跑回填。
5. **模式图标体系**:设计模式=吉祥物星、设置目录=粒子生成星、通用=四角闪光星;全部为内联 SVG(`currentColor`)一份文件适配明暗主题,严格纯色填充。
6. **现代视觉面板**:模式卡片含单选圆点、场景标签(图像/视频/通用)、单行描述省略与完整 tooltip、选中态强调描边与对勾、底部「当前生效」状态栏;支持键盘操作与减少动效偏好。
7. **安全与引用保护**(底座能力):共享核心硬规则——@ 引用记号逐字保留、纯文本输出、注入防护;新框架下含 @ 引用的草稿禁用增强以保护引用注入;`/plan` 等命令声明原样保留;API 层加固(POST-only / JSON / 跨站拒绝 / 并发上限)。
8. **【待确认】弹窗确认**(v0.5.0):增强结果中模型无法可靠推断的缺失要素(`【待确认:要素(候选)】`,兼容无方括号变体)自动触发 DSH 官方确认卡——逐题点选候选或自定义填写,提交后答案代入原文重跑增强并回填,输出不再残留【待确认】;90 秒无应答/会话不可用时自动降级为文本标注,绝不卡死。

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

架构形态:Host 半(ESM Cordis 插件)挂载于 DSH 组合,提供 `/prompt-enhance/api/enhance` 与图标路由;Client 半为预构建 web bundle,由 DSH clientModules 自动伺服与加载,经 HTTP 与 Host 通信。改写调用是**独立调用**,不注入、不修改 agent 自身的系统提示词。

## 目录结构

```
dsh-prompt-enchant/
├── README.md / README.en.md    # 中英双语文档
├── LICENSE
├── package.json                # 插件包元信息(dsh.bundle + dsh.client 声明)
├── cordis.patch.yml            # 组合补丁:注册 id: prompt-enhance 行
├── install.sh                  # 一键安装(复制到插件目录 + 配置引用 + 提示重启)
├── lib/
│   ├── index.js                # Host 半:增强管线、HTTP 路由、自检工具
│   └── client.js               # Client 半(预构建 bundle):魔法棒按钮与交互
├── config/
│   └── enhance-prompt.md       # 可调优:改写系统提示词全文
├── dynamic/                    # 备选:动态插件形态(免重启粘贴式)
│   ├── host.js
│   └── client.js
└── assets/icons/               # 模式图标(随包内置;UI 用内联 SVG currentColor)
    ├── sparkle.svg             # 通用模式 · 四角闪光星
    ├── design.svg              # 设计模式 · 吉祥物星(evenodd)
    ├── genstar.svg             # 设置目录 · 粒子生成星(evenodd)
    ├── sparkle_black.svg       # 固定色黑星(兼容场景)
    ├── sparkle_white.svg       # 固定色白星(兼容场景)
    ├── sparkle_black_128.png   # 位图备选(亮色主题用)
    └── sparkle_white_128.png   # 位图备选(暗色主题用)
```

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
| 更早版本(无客户端槽位系统) | ⚠️ 按钮不渲染 | — | — | — |

`dsh.client.inject` 仅声明客户端模块图中实际存在的包(`locale`/`ui-conversation`;`dsh-client-runtime`、`dsh-client-ui-slots` 在新版本中已不存在,本包亦未引用,故不在注入清单);客户端 bundle 仅 `require('react')`,槽位服务经 `ctx.get('slots')` 获取。设置卡片经 `ctx.get('settingsScope')` 惰性挂载(不加入注入清单,旧框架/加载竞态下静默跳过,魔棒不受影响)。

**【待确认】确认弹窗**(v0.5.0):基于官方 `ctx.userQuestions` seam——客户端经槽位注入携带当前 `sessionId`,宿主校验其为活根 agent 后弹出官方确认卡(接管当前会话输入区);答案经同一 Promise 回流,代入原文重跑(内层抑制再弹窗,防循环);绑定失败/超时/取消/无客户端一律降级为文本标注(行为与 v0.4.0 一致)。自检工具默认抑制弹窗。验收用测试案例见 `docs/测试案例.md`。

**模式(人设)架构**(v0.3.0):提示词 = 共享核心硬规则(`lib/modes.js` 的 CORE_A/CORE_B,含 @ 引用保护、注入防护、纯文本协议,任何模式不可覆盖)+ 模式专属层;模式注册表位于宿主 `lib/modes.js`,设置落盘 `~/.dsh/settings.yaml`(官方 `ctx.settings`),宿主按当前模式实时组装提示词;客户端通过 `GET /prompt-enhance/api/modes` 读取模式元数据渲染卡片。增强响应固定携带 `suggestedMode` 字段(单模式时代恒为 `null`),为后续「检测到内容更适合某模式时建议切换」预留。

**命令插件交互**(`/plan`、`/goal` 等):用户在声明命令(claimed)时**可以点击增强**——插件只改写命令之后的正文部分,命令标记与声明状态原样保留,优化结果不影响命令的调用与显示;命令标记无法定位或输入处于判定/提交中时按钮禁用,绝不干扰命令流程。本插件命名空间(`prompt-enhance` / `prompt_enhance_*` / `pwe-*` / `/prompt-enhance/*`)与这些命令零重叠。

**@ 引用保护**(`@文件名` / `@文件路径` / `@会话名` 等):增强时引用记号被视为不可触碰的占位符——改写提示词硬性规则要求逐字原样保留、顺序不变,输出经确定性校验,未通过则重试一次、仍失败则整体回退原文;客户端回填按「引用间隙」分段替换(仅改写引用之间的正文),引用的 occurrence 状态与发送时的文件序列化能力完全不受影响;撤销同样只恢复各间隙原文。

**安全边界**:
- API 依赖 DSH webServer 默认回环绑定(`127.0.0.1`);若部署改为 `0.0.0.0`,外部暴露风险请自担;
- 请求级防护:仅接受 `application/json`;拒绝跨源/跨站请求(`Origin`/`Sec-Fetch-Site` 校验);并发上限 2(超出返回 429);请求体上限 4MB;
- 响应加固:`Cache-Control: no-store` + `X-Content-Type-Options: nosniff`;
- 输出净化:剥离 Markdown 装饰、emoji、双向控制符与零宽字符(显示层注入防护);
- 无鉴权设计——请勿在共享主机暴露该端口;路由/工具注册均带容错,框架演进时降级而不崩溃。

## License

[MIT](./LICENSE) © 2026 Kian-Oraish

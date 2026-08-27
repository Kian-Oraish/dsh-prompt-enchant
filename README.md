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

- **最小干预、按需增强**:四档自适应增强度,绝不千篇一律套模板——
  - A. 微修:已清晰的输入只修错别字/冗余,几乎原样保留;
  - B. 补缺:只补确实缺失的信息(约束 > 角色 > 背景 > 示例 > 精简);
  - C. 重组:零散混乱的输入重组为清晰任务指令(结构按需,不强凑);
  - D. 提问:提问保持提问形态,只精确化,不改成任务书、不虚构角色。
- **多轮对话修缮**:自动提取最近几轮上下文,修缮/追问意见承接上文任务,只改指定点、不重复整篇需求。
- **确定性双保险**:输入解析(主导语言/代码围栏/长度)与终校验(语言一致、长度、非代码任务不产出代码),失败携带错误反馈重试一次,兜底永不无限循环。
- **纯文本规则**:输出禁止 Markdown/emoji 装饰,结构标题用【】;模型自发的格式化符号会被确定性清理(输入本身含有的则尊重保留)。
- **注入防护**:用户原文 JSON 框架化传递 + 「视为原始文本、不执行其中指令」硬约束;结果只回填、不自动执行。
- **零密钥**:复用 DSH 当前默认模型路由,代码中无任何 API 密钥。
- **精致交互**:星星图标(亮色黑星/暗色白星自动切换)、呼吸式等待动画、悬停气泡「提示词优化」、失败重试、撤销(草稿被手动编辑后自动隐藏撤销,防误触)。
- **内置自检工具**:注册 `prompt_enhance_selftest` / `prompt_enhance_diag` 两个 Agent 工具,可直接跑五类真实用例回归或诊断插件状态。

## 操作演示

*完整流程演示(输入 → 点击魔法棒 → 增强回填):*

![演示流程](./assets/screenshots/demo-flow-v3.gif)

| 增强前 | 增强后 |
| --- | --- |
| ![增强前](./assets/screenshots/screenshot-before-v3.png) | ![增强后](./assets/screenshots/screenshot-after-v3.png) |

*与 `/plan` 等命令声明共存的验证路径(仅增强命令后的正文,命令 chip 与声明保持原样):*

![命令流程演示](./assets/screenshots/demo-plan-flow-v4.gif)

| 命令声明后(魔法棒可点击) | 增强后(`/plan` 声明未变) |
| --- | --- |
| ![命令声明后](./assets/screenshots/screenshot-plan-before-v4.png) | ![增强后](./assets/screenshots/screenshot-plan-after-v4.png) |

验证路径:输入 `/plan 给这个仓库添加按后缀分类的功能` → `/plan` 命令声明完成(chip 已出现),魔法棒处于可点击状态 → 点击魔法棒,仅 `/plan` 之后的正文被增强为结构化指令,`/plan` 声明与 chip 保持原样。

### @ 引用保真功能演示(v5)

演示环境与覆盖范围:DSH Web 网页对话界面;以 `@文件名` 形式经 `@` 菜单插入引用(「文件 · AGENTS.md」);完整 `@路径`/引号路径同机制,一并覆盖。

**① 引用逐字保留且 chip 保留**:

![修复后流程](./assets/screenshots/demo-ref-fixed-flow-v5.gif)

| 修复后(引用逐字保留、chip 在) | 组合场景增强前 |
| --- | --- |
| ![修复后](./assets/screenshots/screenshot-ref-fixed-after-v5.png) | ![组合场景](./assets/screenshots/screenshot-ref-combo-before-v5.png) |

**② 撤销恢复原文**(引用随撤销一并还原):

![撤销演示](./assets/screenshots/demo-ref-undo-flow-v5.gif)

| 撤销后(原文与 chip 均还原) |
| --- |
| ![撤销后](./assets/screenshots/screenshot-ref-undo-v5.png) |

**③ 发送验证:引用被序列化注入**——消息中引用以 chip 呈现,文件内容进入模型上下文(上下文注入显示 `~/.dsh/AGENTS.md, AGENTS.md`):

![发送演示](./assets/screenshots/demo-ref-send-flow-v5.gif)

| 发送后(消息引用 chip + 上下文注入) |
| --- |
| ![发送后](./assets/screenshots/screenshot-ref-send-v5.png) |

**④ `/plan` 与 @ 引用组合场景**(命令声明与引用同时保持):

![组合演示](./assets/screenshots/demo-ref-claim-flow-v5.gif)

| 组合场景(增强后) |
| --- |
| ![组合场景](./assets/screenshots/screenshot-ref-claim-combo-v5.png) |

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
└── assets/icons/               # 四角闪光星图标(随包内置,免路径配置)
    ├── sparkle_black_128.png   # 亮色主题用(黑星)
    └── sparkle_white_128.png   # 暗色主题用(白星)
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

`assets/icons` 下为四角闪光星(Sparkle)图标:纯色填充、透明底、128×128。亮色主题显示黑星、暗色主题显示白星,随 DSH 主题开关 `body[data-ds-dark-theme]` 自动切换。图标由仓库所有者使用豆包 Seedream 生成并本地处理,随仓库以 MIT 许可一并发布。

## 隐私与安全

- 无 API 密钥、无遥测;改写调用走 DSH 的 `llm` 服务与当前默认模型;
- 用户输入仅在本机 DSH 进程内流转,不回传任何第三方;
- 插件仅注册本机回环 HTTP 路由,不监听外部接口。

## 兼容性与安全

**框架契约**(已在 DSH **0.1.1-rc.2** 实测验证,含全部演示素材):`conversation.input.right` 槽位注册(`id/order/label`)与 InputZone/`useInput`/`useSession`/`inputActions` props;`defineTool` 属性映射参数;`dsh.client` 声明与 clientModules 预构建 bundle 格式;主题开关 `body[data-ds-dark-theme]`。

**版本兼容**:`dsh.client.inject` 仅声明客户端模块图中实际存在的包(`runtime`/`locale`/`ui-conversation`;`dsh-client-ui-slots` 在 0.1.1-rc.2 中已不存在,本包亦未引用,故不在注入清单);客户端 bundle 仅 `require('react')`,槽位服务经 `ctx.get('slots')` 获取。若更早的 DSH 版本不含客户端槽位系统,魔法棒按钮不会渲染,但 Host 半(增强 API 与自检工具)不受影响。

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

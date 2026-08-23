# dsh-prompt-enhance · 增强提示词魔法棒

**🌐 Language | 语言:[English](./README.en.md) · 中文**

在 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai) Web 对话界面中,为输入框添加一个**四角闪光星魔法棒按钮**:点击后把用户口语化、零散、可能含错别字的输入,经**独立 LLM 调用**增强为更精准、更易被 AI 理解和执行的表达,回填输入框供人工确认后发送。

> 本功能为原创实现的通用「提示词增强」能力,不涉及任何第三方产品商标或图标。

## 🚀 快速安装(磁盘常驻版,重启自动加载)

1. 克隆仓库到本地:
   ```bash
   git clone https://github.com/Kian-Oraish/dsh-prompt-enhance.git
   cd dsh-prompt-enhance
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
dsh-prompt-enhance/
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

## License

[MIT](./LICENSE) © 2026 Kian-Oraish

// ============================================================================
// dsh-prompt-enhance · Host 半(磁盘常驻版,ESM Cordis 插件)
// ----------------------------------------------------------------------------
// 通过组合行(- insert: - id: prompt-enhance, name: 'dsh-prompt-enhance')挂载,
// 提供:
//   POST /prompt-enhance/api/enhance        增强管线 { text, history?, sessionId? } → { ok, enhanced, warning?, suggestedMode }
//   GET  /prompt-enhance/api/modes          只读模式元数据 { ok, modes, current }
//   GET  /prompt-enhance/api/token          进程级令牌(经框架栅栏下发,客户端仅存内存)
// 并注册 Agent 工具 prompt_enhance_selftest / prompt_enhance_diag。
// v0.7.0:删除两条图标路由 —— 客户端早已改用内联 SVG,从不请求它们,
// 而它们是当时唯一绕过 authorizeRoute 的路由(收敛攻击面)。
//
// v0.3.0:模式(人设)底座——通过官方 ctx.settings 注册命名空间
// 「prompt-enhance」({ mode }),落盘 <harness home>/settings.yaml,
// DSH 设置后台的「插件」页由客户端半渲染设置卡片。提示词 = 共享核心
// 硬规则 + 模式专属层(见 lib/modes.js)。当前仅「通用」模式,行为与
// v0.2.3 逐字一致(单测快照保证)。旧框架无 settings 服务时恒为通用。
// ============================================================================
import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes, timingSafeEqual, randomUUID as nodeRandomUUID } from 'node:crypto'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { deadline } from '@deepseek-ai/dsh-timeout'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { extractRefTokens, refTokensPreserved } from './ref-guard.js'
import { buildSystemPrompt, hasMode, defaultMode, publicModes, MODE_IDS, MODES } from './modes.js'
import { stripSuggestTags, tidyAfterStrip, resolveSuggestion } from './suggest.js'
import { parseConfirms, applyAnswers, buildQuestions } from './confirm.js'

export const name = 'dsh-prompt-enhance'
// 硬依赖:缺任一即不挂载(由 Cordis 负责等待),不再手写惰性重试兜竞态。
//   llm        增强调用
//   webServer  路由注册
//   tools      自检/诊断工具注册
//   connection 路由鉴权栅栏(ctx.connection.requestRejection)——安全必需,见 authorizeRoute
// 说明:不再声明 timer —— v0.6.0 起超时改由原生定时器 + AbortController 实现,
// 因为 ctx.timeout() 会把定时器挂进 fiber disposables,每个请求泄漏一个引用。
// 可选能力(settings / agents / userQuestions / agentDefaultModel)一律用
// ctx.get() / ctx.inject() 按需取用,缺席时降级,不进本数组(否则整个插件不挂载)。
export const inject = ['llm', 'webServer', 'tools', 'connection']

// 模式建议段:仅「通用」模式且存在其他模式时注入系统提示词尾部;
// 标记协议(剥离/终判)见 lib/suggest.js。
const SUGGEST_SEGMENT = [
  '',
  '【模式建议】若你判断本输入属于图像/视频创作场景(文生图、图生图、交互编辑、文生视频、图生视频、首尾帧),请在增强文本末尾另起一行输出标记 [[MODE:design]];否则不要输出任何标记。',
].join('\n')

// schemastery(设置 schema):框架 ctx.settings.register 的签名是
// `register(ns, schema: z<T>, ...)`,schema 必须是 schemastery schema 对象
// (describe() 会调 schema.toJSON(),resolve() 会调用 schema 本身做解码)。
// v0.6.0:由「按需加载 + 手写降级」改为**静态硬依赖**——手写实现并不满足该
// 契约,与其静默降级出错误行为,不如缺失即失败。该包已声明进 package.json。
import z from '@deepseek-ai/schemastery'

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u

// ==================== 进程级令牌(v0.7.0,纵深防御) ====================
// 每进程随机生成,客户端经 GET /prompt-enhance/api/token(过框架栅栏)取一次、
// 仅存内存,此后每个 API 请求带 X-Prompt-Enhance-Token。
//
// 边界(必须如实理解,不要高估):
//   ✅ 挡得住:浏览器侧攻击面(XSS / 被诱导页面 / 扩展能借 cookie 但读不到本进程内存)、
//             跨 DSH 重启的重放(每进程随机 → 重启即失效)、以及"谁在调用"的可审计性。
//   ❌ 挡不住:以你本人身份运行的本地进程 —— 它能读 ~/.dsh/.credentials.yaml 自取
//             会话 cookie,本来就能直接打这个端点。
// 即:纵深防御的一层,不是特权边界。
const TOKEN_HEADER = 'x-prompt-enhance-token'
const PROCESS_TOKEN = randomBytes(32).toString('hex')

/** 常量时间比对,长度不等直接判否(不泄漏长度之外的信息)。 */
function tokenMatches(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) return false
  const a = Buffer.from(candidate, 'utf8')
  const b = Buffer.from(PROCESS_TOKEN, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

// 单次模型调用上限:45 秒尖峰自动重试一次(用户不可见)
const LLM_TIMEOUT_MS = 45000
// 【待确认】弹窗确认:无应答/无客户端 → 降级为文本标注(绝不卡死)。
// v0.7.0:90s → 45s。等待期间会释放并发名额(见 MAX_MODEL_INFLIGHT 注释),
// 但每多占 1 秒就是 1 秒的资源悬置,45s 已足够人类阅读并作答。
const CONFIRM_TIMEOUT_MS = 45000

// ==================== 成本闸门(v0.7.0) ====================
// 旧版只有一道 inflight(上限 2)且只统计 HTTP 请求,于是「弹窗等确认」长达
// 90 秒也占着名额 —— 两次确认并发就能把第三个真实请求 429 掉。现在拆成两道:
//   MAX_MODEL_INFLIGHT:真正在调模型时才持有(计入模型调用,而非 HTTP 请求)
//   MAX_HTTP_INFLIGHT :请求总数上限,确认等待期间**释放**
const MAX_MODEL_INFLIGHT = 2
const MAX_HTTP_INFLIGHT = 4
// 滑动窗口限流:防单次爆发(一次增强最坏 4 次模型调用)
const RATE_WINDOW_MS = 60000
const RATE_MAX_REQUESTS = 20


export function apply(ctx, config) {
  const opts = {
    diagFile: typeof config?.diagFile === 'string' ? config.diagFile : '',
    maxInputChars: Number.isFinite(config?.maxInputChars) ? config.maxInputChars : 20000,
    maxOutputChars: Number.isFinite(config?.maxOutputChars) ? config.maxOutputChars : 6000,
    historySanitize: config?.historySanitize !== false,
    temperature: Number.isFinite(config?.temperature) ? config.temperature : 0.3,
    // 是否「显式」配置了 temperature:未显式配置时,推理档请求不再盲发
    temperatureExplicit: Number.isFinite(config?.temperature),
    // Agent 可见的调试工具(selftest):默认关闭。一跑就是 12 个真实模型调用,
    // 任何 agent 都能触发,且成本与耗时都很高 —— 故默认只注册诊断工具(diag,零成本)。
    debugTools: config?.debugTools === true,
  }
  const MAX_INPUT_CHARS = opts.maxInputChars
  const MAX_OUTPUT_CHARS = opts.maxOutputChars

  // ==================== 设置:模式(人设)命名空间 ====================
  // 官方 ctx.settings 注册命名空间「prompt-enhance」({ mode }),落盘
  // settings.yaml,DSH 设置后台由客户端半渲染一级栏目。
  //
  // v0.6.0 修正:旧版用 `ctx.on('service', …)` 做「设置服务晚于本插件提供」的
  // 竞态兜底 —— 但 cordis 4.x 根本不存在名为 'service' 的事件(真实名是
  // 'internal/service'),而 ctx.on() 对未知事件名静默容忍,所以那个兜底**从未
  // 生效过**;命名空间实际是靠每次请求时 currentMode() 顺带惰性注册的。
  // 现在改用框架自己的惯用法 ctx.inject(['settings'], cb):
  // 依赖已就绪即刻回调,未就绪则由 Cordis 在服务出现时回调,无需猜时机。
  let modeScope = undefined
  let settingsRegistered = false
  let settingsFailed = false

  function doRegisterSettings(settingsService) {
    if (settingsRegistered || settingsFailed) return
    if (settingsService === undefined || typeof settingsService.register !== 'function') return
    try {
      modeScope = settingsService.register('prompt-enhance', modeSchema(), {
        base: { mode: defaultMode() },
        validate: (value) => {
          if (value === null || typeof value !== 'object' || !hasMode(value.mode)) {
            throw new Error(`未知的增强模式:${value !== null && typeof value === 'object' ? String(value.mode) : String(value)}`)
          }
        },
      })
      settingsRegistered = true
      appendDiag({ stage: 'settings-register', ok: true, detail: '命名空间 prompt-enhance 已注册' })
    } catch (err) {
      settingsFailed = true
      console.error('dsh-prompt-enhance: 注册设置命名空间失败(降级为固定通用模式):', err)
      appendDiag({ stage: 'settings-register', ok: false, detail: String(err && err.message !== undefined ? err.message : err) })
    }
  }

  // ctx.inject 是声明式等待:服务已在则立即回调,否则服务就绪时回调。
  // 不放进 inject 数组是刻意的 —— settings 是可选能力,缺席时插件仍应工作
  // (只是模式恒为「通用」),而 inject 数组缺席会让整个插件不挂载。
  try {
    ctx.inject(['settings'], (settingsCtx) => { doRegisterSettings(settingsCtx.settings) })
  } catch (err) {
    // 极端情况下 ctx.inject 不可用(更老的框架):退回 apply 时尝试一次
    doRegisterSettings(ctx.get('settings'))
  }
  // 当前生效模式:设置值无效或服务缺失时回退「通用」
  // 不再顺带惰性注册(注册已由 ctx.inject 负责),此处纯读。
  function currentMode() {
    if (modeScope === undefined) return defaultMode()
    try {
      const value = modeScope.get()
      const mode = value !== null && typeof value === 'object' ? value.mode : undefined
      return hasMode(mode) ? mode : defaultMode()
    } catch (err) {
      return defaultMode()
    }
  }
  // 模式 schema:纯 schemastery(见文件头 import 的说明)。
  // description 里带上当前可选模式,设置后台的通用表单可直接展示。
  function modeSchema() {
    return z.object({
      mode: z.string().description('增强模式 id,当前可选: ' + publicModes().map((m) => m.id).join(', ')),
    })
  }

  // ==================== 图标 ====================
  // v0.7.0:删除两条 /prompt-enhance/icons/*.png 路由与启动期读盘。
  // 客户端早已改用内联 SVG(currentColor 单文件双主题),全文件零引用 ——
  // 那两条路由是纯死代码,且是当时**唯一绕过 authorizeRoute** 的路径。
  // assets/icons/ 仍随包保留(供后续按需外链,但不再有任何路由消费)。

  // ==================== 路由鉴权(安全必需) ====================
  // 背景:框架自己的路由(/、/api/*)由 SPA fallback 统一走
  // dsh-client-connection 的 browserAuth —— 未带签名 cookie 一律 401。但
  // ctx.webServer.register 注册的路由在 fallback 之前匹配,那道门根本不经过,
  // 因此插件路由默认对「本机任意进程」和「DNS-rebinding 页面」都是敞开的
  // (实测:未带 cookie 的 POST 能驱动真模型调用并烧 token)。
  //
  // 解法:复用框架提供的官方栅栏 ctx.connection.requestRejection(request),
  // 它等价于 isTrustedApiRequest(Host/Origin 信任栅栏)+ browserAuth.isAuthenticated
  // (绑定 Host 的签名 cookie 校验),一次调用同时挡住未鉴权访问与 rebinding。
  // 客户端是已鉴权的同源 SPA,fetch/图片请求自动携带 cookie,正常用户零感知。
  //
  // 失败关闭:connection 服务缺席时拒绝而非放行——安全栅栏缺失不能降级为放行。
  // `skipToken: true` 仅用于令牌分发端点自身 —— 客户端此时还没有令牌,
  // 它仍必须过框架栅栏(Host/Origin 信任 + 浏览器签名 cookie)。
  function authorizeRoute(req, res, options) {
    const connection = ctx.get('connection')
    if (connection === undefined || typeof connection.requestRejection !== 'function') {
      appendDiag({ stage: 'route-authorize', ok: false, detail: 'connection 服务不可用,已拒绝请求(失败关闭)' })
      jsonReply(res, 503, { ok: false, code: 'AUTH_SERVICE_MISSING', error: '鉴权服务不可用,请重启 DSH 后重试' })
      return false
    }
    let rejection
    try {
      rejection = connection.requestRejection(req)
    } catch (err) {
      appendDiag({ stage: 'route-authorize', ok: false, detail: String(err && err.message !== undefined ? err.message : err) })
      jsonReply(res, 403, { ok: false, code: 'REQUEST_REJECTED', error: '请求校验失败' })
      return false
    }
    if (rejection !== undefined) {
      // 与框架 writeUnauthorized 同语义:401=未鉴权,403=Host/Origin 不受信
      res.statusCode = rejection
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(rejection === 401 ? 'dsh web authentication required; reopen the URL printed by dsh web.\n' : 'forbidden\n')
      return false
    }
    // 第二道:进程级令牌(详见文件头 PROCESS_TOKEN 注释的威胁边界)。
    if (options !== null && typeof options === 'object' && options.skipToken === true) return true
    if (!tokenMatches(req.headers[TOKEN_HEADER])) {
      appendDiag({ stage: 'route-authorize', ok: false, detail: '令牌缺失或不匹配' })
      jsonReply(res, 403, { ok: false, code: 'TOKEN_REQUIRED', error: '缺少有效的进程令牌' })
      return false
    }
    return true
  }

  // 路由注册容错:重复路由(同机多形态混装)等异常仅告警,绝不让插件树崩溃。
  // v0.7.0:改用 ctx.effect 包裹注册(框架自身惯例,如 dsh-client-connection),
  // 使注册成为可逆的 fiber effect;失败仍只告警。
  function registerRoute(route) {
    try {
      ctx.effect(() => ctx.webServer.register(route), `prompt-enhance: ${route.path}`)
      return true
    } catch (err) {
      console.error(`dsh-prompt-enhance: 路由注册失败(${route.path}):`, err)
      appendDiag({ stage: 'route-register', ok: false, detail: String(err && err.message !== undefined ? err.message : err) })
      return false
    }
  }

  // ==================== 诊断日志(可选,appendFile;父目录校验) ====================
  function appendDiag(entry) {
    if (opts.diagFile === '') return
    try {
      if (!existsSync(dirname(opts.diagFile))) {
        console.error('dsh-prompt-enhance: 诊断日志目录不存在:', dirname(opts.diagFile))
        return
      }
      appendFileSync(opts.diagFile, JSON.stringify(entry) + '\n')
    } catch (err) {
      console.error('dsh-prompt-enhance: 写诊断日志失败:', err)
    }
  }

  // ==================== 模块①:输入解析(确定性) ====================
  function detectDominantLanguage(text) {
    let cjk = 0
    let latin = 0
    for (const ch of text) {
      const code = ch.codePointAt(0)
      if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3400 && code <= 0x4DBF) || (code >= 0xF900 && code <= 0xFAFF)) cjk++
      else if ((code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A)) latin++
    }
    if (cjk === 0 && latin === 0) return 'other'
    return cjk >= latin ? 'zh' : 'en'
  }
  function parseInput(rawText) {
    const text = rawText.trim()
    if (text.length === 0) throw new Error('输入为空,请先输入内容')
    if (text.length > MAX_INPUT_CHARS) throw new Error(`输入过长(超过 ${MAX_INPUT_CHARS} 字符),请精简后再试`)
    return {
      text,
      language: detectDominantLanguage(text),
      hasCodeBlock: text.includes('```'),
      hasFormatTokens: /[*_#`]/.test(text),
      hasEmoji: EMOJI_RE.test(text),
      isQuestion: /[?？]|[吗呢么]|为什么|如何|怎么|什么是|啥|多少|哪些|请给我|请提供|请给出|请举例|请演示|请模拟|告诉我|给我一个|给出一个|给一个|举个例子|\b(what|why|how|which|when|where|who|explain|describe|analyze|compare)\b/i.test(text),
      charCount: text.length,
      refTokens: extractRefTokens(text),
    }
  }

  // ==================== 模块⑤:终校验(确定性) ====================
  const QUESTION_TOKEN = /[?？]|[吗呢么]|为什么|如何|怎么|什么是|啥|请解释|请说明|请分析|请描述|请比较|请谈谈|请评估|请介绍|请判断|请总结|请给我|请提供|请给出|请举例|请演示|请模拟|告诉我|给我一个|给出一个|给一个|\b(what|why|how|which|explain|describe|analyze|compare)\b/i
  function validateOutput(enhanced, parsed) {
    const languageMatch = parsed.language === 'other' || detectDominantLanguage(enhanced) === parsed.language
    const lengthOk = enhanced.length <= MAX_OUTPUT_CHARS
    const hasCodeBlock = enhanced.includes('```')
    const codeOk = parsed.hasCodeBlock || !hasCodeBlock
    // 提问闸门:输入是提问时,输出必须仍是提问(精确化),不得直接作答
    const questionOk = !parsed.isQuestion || QUESTION_TOKEN.test(enhanced)
    // 引用闸门:引用记号(@...)必须逐字按序保留
    const refOk = refTokensPreserved(parsed.refTokens, enhanced)
    const issues = []
    if (!languageMatch) issues.push('输出语言与输入主导语言不一致,必须与输入语言一致')
    if (!lengthOk) issues.push(`输出过长,请压缩到 ${MAX_OUTPUT_CHARS} 字符以内`)
    if (!codeOk) issues.push('非编程任务不得输出代码块')
    if (!questionOk) issues.push('输入是提问/索取型请求,输出必须仍是该请求的精确化复述,不得直接回答或直接产出所索取的内容')
    if (!refOk) issues.push('引用记号(@开头的占位符)必须逐字原样保留、顺序不变,只允许重写引用记号之间的普通文字')
    return { valid: issues.length === 0, languageMatch, lengthOk, codeOk, questionOk, refOk, issues }
  }

  function tidyListMarkers(text) {
    const lines = text.split('\n')
    const bullet = /^[ \t]*[-*][ \t]+/
    const out = []
    for (let i = 0; i < lines.length; i++) {
      if (!bullet.test(lines[i])) { out.push(lines[i]); continue }
      let j = i
      while (j < lines.length && bullet.test(lines[j])) j++
      const run = j - i
      for (let k = i; k < j; k++) out.push(run >= 2 ? lines[k].replace(bullet, '• ') : lines[k])
      i = j - 1
    }
    return out.join('\n')
  }

  function truncatePreservingFences(text, max) {
    if (text.length <= max) return { text, truncated: false }
    let cut = max
    const lastFence = text.lastIndexOf('```', max)
    if (lastFence !== -1) {
      const openCount = (text.slice(0, lastFence).match(/```/g) || []).length
      if (openCount % 2 === 0) cut = lastFence
    }
    return { text: text.slice(0, cut) + '…', truncated: cut < text.length }
  }

  function stripDecorativeFormatting(text, parsed) {
    let t = text
    // 无条件剥离:双向控制符与零宽字符(显示层伪装/注入防护)
    t = t.replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '')
    if (!(parsed.hasFormatTokens && parsed.hasEmoji)) {
      if (!parsed.hasFormatTokens) {
        t = t.replace(/\*\*/g, '').replace(/__/g, '')
        t = t.replace(/^#{1,6}\s+/gm, '')
        t = tidyListMarkers(t)
      }
      if (!parsed.hasEmoji) t = t.replace(EMOJI_RE, '')
    }
    return { text: t, stripped: t !== text }
  }

  // ==================== 模型路由与 LLM 调用 ====================
  // v0.7.0:优先用框架的 randomUUID()(dsh-util-crypto;其模块注释指出 lint 规则
  // 把 crypto.randomUUID 调用者指向该模块),缺失时退回 node:crypto。
  // 旧实现 Date.now()+Math.random() 非安全漏洞(消息 id 不参与鉴权/命名),
  // 但不符合框架惯例且有碰撞面。
  function makeId() {
    let uuid
    try {
      uuid = randomUUID()
    } catch (err) {
      uuid = undefined
    }
    if (typeof uuid !== 'string' || uuid.length === 0) uuid = nodeRandomUUID()
    return 'prompt-enhance-' + uuid
  }

  async function resolveRoute() {
    const defaultModel = ctx.get('agentDefaultModel')
    if (defaultModel !== undefined) {
      try {
        const sel = defaultModel.currentSelection()
        if (sel && typeof sel.provider === 'string' && sel.provider.length > 0 && typeof sel.model === 'string' && sel.model.length > 0) {
          const route = { provider: sel.provider, model: sel.model }
          if (sel.reasoningEffort !== undefined) route.reasoningEffort = sel.reasoningEffort
          return route
        }
      } catch (err) {
        console.error('dsh-prompt-enhance: 读取默认模型失败:', err)
      }
    }
    try {
      const providers = ctx.llm.listProviders()
      if (providers.length === 0) return undefined
      const models = await ctx.llm.listModels(providers[0].id)
      if (models.length === 0) return undefined
      return { provider: providers[0].id, model: models[0].id }
    } catch (err) {
      console.error('dsh-prompt-enhance: 回退模型路由失败:', err)
      return undefined
    }
  }

  async function callLlm(route, system, messages, purpose, signal) {
    const options = {
      provider: route.provider,
      model: route.model,
      system,
      messages,
      maxTokens: 8000,
    }
    // temperature:框架不做校验、原样透传到 wire,而 thinking 开启的推理模型
    // 常直接拒收 temperature。因此仅在「未指定推理档」时发送默认值;
    // 调用方显式配置了 temperature 则始终尊重(显式意图优先)。
    const hasReasoningEffort = route.reasoningEffort !== undefined
    if (opts.temperatureExplicit || !hasReasoningEffort) options.temperature = opts.temperature
    // 推理档透传 agent 默认模型(实测:low 档无法遵循总公式层结构纪律,输出系统性降智
    // ——v0.5.2 已回归透传;速度问题改由 45s 尖峰自动重试 + 后续层文本减重解决)。
    if (hasReasoningEffort) options.reasoningEffort = route.reasoningEffort
    // 空正文截断重试使用 purpose 'session-title'(deepseek 适配器据此关闭 thinking;
    // 已核实该副作用确实存在,不再是「其他适配器无副作用」的旧说法)
    if (purpose !== undefined) options.purpose = purpose
    // 45 秒尖峰自动重试一次(模型服务端排队波动对用户不可见);两次都超时才抛出。
    // v0.6.0:改用原生定时器 + AbortController,不再用 ctx.timeout() ——
    // ctx.timeout() 每次调用都会往 fiber 的 disposables 里挂一个 effect,
    // 只在插件卸载时清理,等于每个请求泄漏一个定时器引用。
    // v0.7.0:改用框架统一正解 @deepseek-ai/dsh-timeout 的 deadline() —— 它有
    // [Symbol.dispose],超时即真正取消旧流,并把上游 signal(exec.signal /
    // req 关闭)一并合流,取消链完整。
    // 模型调用闸:整个 callLlm(含 45s 尖峰重试)占一个名额。
    // 与 httpInflight 分开 —— 确认弹窗等待期间 HTTP 名额已释放,不会饿死
    // 其他请求;而真正烧 token 的模型调用始终受 MAX_MODEL_INFLIGHT 约束。
    if (!acquireModelSlot()) throw new Error('模型调用并发已达上限,请稍后再试')
    try {
      return await callLlmAttempts()
    } finally {
      releaseModelSlot()
    }

    async function callLlmAttempts() {
    const TIMEOUT_ERROR = '增强超时(45 秒),请重试'
    for (let attempt = 0; attempt < 2; attempt++) {
      let textOut = ''
      let finish = undefined
      const d = deadline(signal, LLM_TIMEOUT_MS, 'PROMPT_ENHANCE_TIMEOUT')
      let timedOut = false
      // 超时信号 → 一个立即结算的 rejection,用来抢占 consume。
      // 刻意不用 ctx.timeout():它会把定时器挂进 fiber 的 disposables,只在
      // 插件卸载时清理 —— 那正是 v0.6.0 修掉的每请求泄漏。
      const expiry = new Promise((_, reject) => {
        const onAbort = () => {
          timedOut = true
          reject(new Error(TIMEOUT_ERROR))
        }
        if (d.signal.aborted) onAbort()
        else d.signal.addEventListener('abort', onAbort, { once: true })
      })
      const consume = (async () => {
        for await (const chunk of ctx.llm.stream(Object.assign({}, options, { signal: d.signal }))) {
          if (chunk.type === 'text-delta') textOut += chunk.text
          if (chunk.type === 'finish') finish = chunk
        }
      })()
      // consume 可能先于 expiry 失败/成功;挂空 catch 防止 expiry 后续被抢占时
      // 产生 unhandled rejection。
      expiry.catch(() => {})
      try {
        await Promise.race([consume, expiry])
      } catch (err) {
        // 上游取消(用户 ESC / 请求 socket 关闭 / exec.signal):**绝不重试**,
        // 立即上抛 —— 重试只会再烧一次模型调用,而用户已经不想要这个结果了。
        if (signal !== undefined && signal.aborted === true) {
          throw new Error('增强已取消')
        }
        // 超时导致的 abort:第一次重试,第二次抛出对用户可读的超时文案
        if (timedOut) {
          if (attempt === 0) continue
          throw new Error(TIMEOUT_ERROR)
        }
        throw err
      } finally {
        d[Symbol.dispose]()
      }
      if (finish === undefined) throw new Error('增强调用未正常结束')
      const reason = finish.reason
      if (reason !== undefined && reason.kind === 'stop') {
        const out = textOut.trim()
        if (out.length === 0) throw new Error('模型未返回增强结果,请重试')
        return { text: out, truncated: false, empty: false }
      }
      if (reason !== undefined && reason.kind === 'max-tokens') {
        const out = textOut.trim()
        return { text: out, truncated: true, empty: out.length === 0 }
      }
      if (reason !== undefined && (reason.kind === 'error' || reason.kind === 'aborted')) {
        const msg = reason.failure !== undefined && typeof reason.failure.message === 'string' && reason.failure.message.length > 0
          ? reason.failure.message
          : '模型调用失败'
        throw new Error(msg)
      }
      throw new Error('增强调用异常结束(' + String(reason !== undefined ? reason.kind : 'unknown') + ')')
    }
    throw new Error(TIMEOUT_ERROR)
    }
  }

  // ==================== 会话历史派生(v0.7.0,取代客户端历史链) ====================
  // 背景:客户端半的 extractHistory 依赖 snapshot.nodes —— 0.1.6 的 SessionSnapshot
  // 与 ConversationSnapshot **都没有** nodes 字段,useTrajectory 不存在,框架 12 个
  // 真实 projection 键没有一个携带消息正文。所以「客户端拿历史」这条路是死的,
  // 且死得**静默**(extractHistory 恒返回 [],每次都是单轮,而 multiround 用例因为
  // 手工注入 history 而依然通过 —— 这正是 48 个测试没抓到的原因)。
  //
  // 正解在 host 侧:插件本来就把 sessionId 发给 host,而 dsh-session 暴露的服务名是
  // 'sessions',其 Session.deriveMessages() 是框架喂给 LLM 的**权威派生历史**
  // (感知 compaction、已缓存、深冻结)。用它比自己从快照拼装更正确,且可离线单测。
  // 服务缺失 / id 不可达 → 返回 [] → 单轮降级(行为与旧版一致,但不再静默:
  // prompt_enhance_diag 会报 sessions: true|false)。
  function deriveHistoryFromSession(sessionId) {
    if (typeof sessionId !== 'string' || sessionId.length === 0) return []
    try {
      const sessions = ctx.get('sessions')
      if (sessions === undefined || typeof sessions.get !== 'function') return []
      const session = sessions.get(sessionId)
      if (session === undefined || session === null || typeof session.deriveMessages !== 'function') return []
      const derived = session.deriveMessages()
      if (!Array.isArray(derived)) return []
      const out = []
      let budget = 6000
      for (let i = derived.length - 1; i >= 0 && out.length < 8 && budget > 0; i--) {
        const msg = derived[i]
        if (msg === null || typeof msg !== 'object') continue
        if (msg.role !== 'user' && msg.role !== 'assistant') continue // 跳过 system
        if (!Array.isArray(msg.content)) continue
        let text = ''
        for (const block of msg.content) {
          // 只取纯文本块:reasoning / image / file / tool-* 一律不进历史素材
          if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
            text += block.text
          }
        }
        const trimmed = text.trim()
        if (trimmed.length === 0) continue
        const piece = trimmed.slice(0, 800)
        out.unshift({ role: msg.role, text: piece })
        budget -= piece.length
      }
      return out
    } catch (err) {
      console.error('dsh-prompt-enhance: 会话历史派生失败(降级为单轮):', err)
      return []
    }
  }

  function sanitizeHistory(history) {
    const clean = []
    if (!Array.isArray(history)) return clean
    let budget = 6000
    for (const item of history) {
      if (clean.length >= 8 || budget <= 0) break
      if (item === null || typeof item !== 'object') continue
      if (typeof item.text !== 'string') continue
      const role = item.role === 'assistant' ? 'assistant' : 'user'
      const raw = item.text.trim()
      if (raw.length === 0) continue
      let t = raw
      if (opts.historySanitize && !raw.includes('```')) {
        t = t.replace(/\*\*/g, '').replace(/__/g, '')
        t = t.replace(/^#{1,6}\s+/gm, '')
      }
      t = t.slice(0, 800)
      clean.push({ role, text: t })
      budget -= t.length
    }
    return clean
  }

  function buildMessages(history, text) {
    const messages = history.map((h) => ({
      id: makeId(),
      role: h.role,
      content: [{ type: 'text', text: h.text }],
      source: { kind: 'plugin', plugin: 'dsh-prompt-enhance' },
    }))
    messages.push({
      id: makeId(),
      role: 'user',
      content: [{ type: 'text', text: JSON.stringify(text) }],
      source: { kind: 'plugin', plugin: 'dsh-prompt-enhance' },
    })
    return messages
  }

  function systemFeedback(text) {
    return { id: makeId(), role: 'user', content: [{ type: 'text', text: '[系统校验反馈,不是待增强的用户输入]' + text }], source: { kind: 'plugin', plugin: 'dsh-prompt-enhance' } }
  }

  async function enhance(rawText, rawHistory, options) {
    if (typeof rawText !== 'string') throw new Error('请求缺少文本内容')
    const o = options !== null && typeof options === 'object' ? options : {}
    const signal = o.signal
    const sessionId = typeof o.sessionId === 'string' && o.sessionId.length > 0 ? o.sessionId : undefined
    const parsed = parseInput(rawText)
    const route = await resolveRoute()
    if (route === undefined) throw new Error('未找到可用的默认模型,请在模型选择器中确认已配置模型')
    // 历史来源优先级:显式传入(selftest 用例、旧客户端)→ 会话派生(推荐路径)
    const history = sanitizeHistory(Array.isArray(rawHistory) ? rawHistory : deriveHistoryFromSession(sessionId))
    const messages = buildMessages(history, parsed.text)
    // 当前模式 → 完整系统提示词(共享核心 + 模式层);注册表非空,必可组装。
    // 通用模式且存在其他模式时,追加建议判定段(单向:通用→设计)。
    const mode = currentMode()
    let system = buildSystemPrompt(mode)
    if (mode === 'generic' && MODE_IDS.length > 1) system = system + SUGGEST_SEGMENT

    // 建议标记剥离:任何一次模型输出先剥离 [[MODE:xxx]] 再进入校验/清理/
    // 重试/引用回退管线;标记文本绝不进入用户可见输出,取最后出现的为建议。
    let suggestion = null
    const strip = (raw) => {
      const s = stripSuggestTags(raw)
      if (s.suggested !== undefined) suggestion = s.suggested
      return tidyAfterStrip(s.text)
    }

    let call = await callLlm(route, system, messages, undefined, signal)
    let output = strip(call.text)
    let warning = undefined

    if (call.truncated) {
      if (call.empty) {
        const retry = await callLlm(route, system, messages.concat([
          systemFeedback('你上次因思考过程过长而未输出正文。请直接给出简洁完整的增强结果,不要任何解释。'),
        ]), 'session-title', signal)
        output = strip(retry.text)
        if (retry.truncated) warning = '模型输出仍被截断'
      } else {
        const retry = await callLlm(route, system, messages.concat([
          { id: makeId(), role: 'assistant', content: [{ type: 'text', text: output }], source: { kind: 'plugin', plugin: 'dsh-prompt-enhance' } },
          systemFeedback('你的输出被长度上限截断。请把增强结果压缩得简洁完整后重新输出,不要任何解释。'),
        ]), undefined, signal)
        output = strip(retry.text)
        if (retry.truncated) warning = '模型输出仍被截断'
      }
    }

    let validation = validateOutput(output, parsed)
    if (!validation.valid) {
      const retry = await callLlm(route, system, messages.concat([
        { id: makeId(), role: 'assistant', content: [{ type: 'text', text: output }], source: { kind: 'plugin', plugin: 'dsh-prompt-enhance' } },
        systemFeedback('你的上次输出未通过校验:' + validation.issues.join(';') + '。请直接输出修正后的完整文本,不要任何解释。'),
      ]), undefined, signal)
      output = strip(retry.text)
      if (retry.truncated) warning = warning === undefined ? '模型输出仍被截断' : warning + ';模型输出仍被截断'
      validation = validateOutput(output, parsed)
    }

    if (!validation.codeOk) {
      output = output.replace(/```[\s\S]*?```/g, '')
      warning = warning === undefined ? '已剔除误输出的代码块' : warning + ';已剔除误输出的代码块'
    }
    const cleaned = stripDecorativeFormatting(output, parsed)
    output = cleaned.text
    if (cleaned.stripped) warning = warning === undefined ? '已清理输出中的格式化符号' : warning + ';已清理输出中的格式化符号'
    if (output.length > MAX_OUTPUT_CHARS) {
      const cut = truncatePreservingFences(output, MAX_OUTPUT_CHARS)
      output = cut.text
      warning = warning === undefined ? '输出超长已截断' : warning + ';输出超长已截断'
    }
    if (!validation.languageMatch) {
      warning = warning === undefined ? '语言一致性校验未完全通过' : warning + ';语言一致性校验未完全通过'
    }
    output = output.trim()
    // 引用保护兜底(在任何清理/截断之后执行):引用记号缺失或被改写 → 回退原文,绝不破坏引用
    if (parsed.refTokens.length > 0 && !refTokensPreserved(parsed.refTokens, output)) {
      output = parsed.text
      warning = warning === undefined
        ? '引用记号(@...)未能原样保留,已回退为原文,请人工确认后重试'
        : warning + ';引用记号(@...)未能原样保留,已回退为原文'
    }
    if (output.length === 0) throw new Error('模型未返回增强结果,请重试')
    const result = { ok: true, enhanced: output }
    if (warning !== undefined) result.warning = warning
    // 模式建议:合法且 ≠ 当前模式才生效;附双语名称供客户端提示条展示
    const suggested = resolveSuggestion(suggestion, hasMode, mode)
    result.suggestedMode = suggested
    if (suggested !== null && MODES[suggested] !== undefined) {
      result.suggestedModeLabel = MODES[suggested].name
    }

    // ==================== 【待确认】弹窗确认阶段 ====================
    // 输出含【待确认】且未抑制时:经官方 ctx.userQuestions.ask 弹确认卡,
    // 答案代入原文后重跑增强(内层抑制再弹窗,防循环)。绑定失败/超时/
    // 取消/无客户端一律降级为首次结果(文本保留【待确认】)。
    // v0.7.0:opts/signal/sessionId 已在函数开头提取;传 history(已 sanitize)
    // 而非 rawHistory,避免确认重跑时再次派生。
    if (o.suppressConfirm !== true && result.ok === true) {
      const confirmed = await confirmEnhance(result.enhanced, history, sessionId, signal)
      if (confirmed !== undefined && confirmed !== null) {
        if (confirmed.degraded === true) {
          // 降级诊断:原因透出到响应(供排查,稳定后可作为诊断字段保留)
          result.confirmSkipped = confirmed.reason
        } else {
          result.enhanced = confirmed.enhanced
          result.confirmed = true
          if (confirmed.warning !== undefined) {
            result.warning = result.warning === undefined ? confirmed.warning : result.warning + ';' + confirmed.warning
          }
        }
      }
    }
    return result
  }

  // ==================== 【待确认】确认弹窗(官方 seam) ====================
  // 解析待确认要素 → 绑定当前会话的活根 agent → ask 提问卡 → 答案代入重跑。
  function resolveAskAgent(sessionId) {
    try {
      const agents = ctx.get('agents')
      if (agents === undefined || typeof agents.get !== 'function' || typeof agents.roots !== 'function') return undefined
      if (typeof sessionId === 'string' && sessionId.length > 0) {
        const candidate = agents.get(sessionId)
        if (candidate === undefined) return undefined
        const roots = agents.roots()
        if (!Array.isArray(roots) || !roots.includes(candidate)) return undefined
        return candidate
      }
      // 未带会话 id:仅当只有一个活根 agent 时使用(多会话场景不作猜测)
      const roots = agents.roots()
      return Array.isArray(roots) && roots.length === 1 ? roots[0] : undefined
    } catch (err) {
      return undefined
    }
  }

  async function confirmEnhance(text, rawHistory, sessionId, signal) {
    const items = parseConfirms(text)
    if (items.length === 0) return { degraded: true, reason: 'no-confirm-items' }
    const agent = resolveAskAgent(sessionId)
    if (agent === undefined) return { degraded: true, reason: 'no-live-root-agent' }
    const userQuestions = ctx.get('userQuestions')
    if (userQuestions === undefined || typeof userQuestions.ask !== 'function') return { degraded: true, reason: 'user-questions-service-missing' }
    // v0.7.0:deadline() 同时合流上游 signal(用户 ESC / socket 关闭 / exec.signal)
    // 与 45 秒确认窗口;dispose 在 finally 里释放,不泄漏 fiber effect。
    const d = deadline(signal, CONFIRM_TIMEOUT_MS, 'PROMPT_ENHANCE_CONFIRM_TIMEOUT')
    try {
      const res = await userQuestions.ask({
        questions: buildQuestions(items),
        agent,
        signal: d.signal,
      })
      const answers = res !== null && typeof res === 'object' && Array.isArray(res.answers) ? res.answers : []
      const filled = applyAnswers(text, items, answers)
      if (filled === text) return { degraded: true, reason: 'all-questions-skipped' } // 全部未作答 → 原样,不重跑
      const second = await enhance(filled, rawHistory, { suppressConfirm: true, sessionId, signal })
      return { enhanced: second.enhanced, warning: second.warning }
    } catch (err) {
      console.error('dsh-prompt-enhance: 确认弹窗未完成,降级为文本标注:', err)
      return { degraded: true, reason: String((err !== null && err !== undefined && err.code !== undefined ? err.code + ': ' : '') + (err !== null && err !== undefined && err.message !== undefined ? err.message : err)).slice(0, 300) }
    } finally {
      d[Symbol.dispose]()
    }
  }

  // ==================== HTTP API(Client→Host,安全加固) ====================
  async function readBody(req, limit) {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > limit) throw new Error('请求体过大')
      chunks.push(chunk)
    }
    return Buffer.concat(chunks).toString('utf8')
  }

  function jsonReply(res, status, payload) {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.end(JSON.stringify(payload))
  }

  // ==================== 成本闸门(v0.7.0) ====================
  // 旧版只有一道 inflight(上限 2)且只统计 HTTP 请求 —— 于是「弹窗等确认」
  // 最长 90 秒也占着名额,两次确认并发就能把第三个真实请求 429 掉。现在拆两道:
  //   httpInflight :请求总数,确认等待期间**释放**
  //   modelInflight:真正在调模型时才持有(在 callLlm 里 acquire/release)
  let httpInflight = 0
  let modelInflight = 0
  let requestTimestamps = []

  function acquireModelSlot() {
    if (modelInflight >= MAX_MODEL_INFLIGHT) return false
    modelInflight++
    return true
  }
  function releaseModelSlot() {
    if (modelInflight > 0) modelInflight--
  }
  function rateLimited() {
    const now = Date.now()
    requestTimestamps = requestTimestamps.filter((t) => now - t < RATE_WINDOW_MS)
    if (requestTimestamps.length >= RATE_MAX_REQUESTS) return true
    requestTimestamps.push(now)
    return false
  }

  // 错误响应**不回显** provider / 内部原文:按稳定 code 白名单输出
  // (框架同类做法:回 code 而非 message)。原始 message 仅进 console/diag。
  //
  // v0.7.0 实施修正(运行期验收抓到的真实缺陷):子串顺序必须**更具体的在前**。
  // 原先「输入为空」排在「输入过长」之前 —— 而 '输入过长(超过 N 字符)' 并不含
  // '输入为空',看似无碍;但 '请求缺少文本内容' 也**不含** '缺文本' 这个连续子串,
  // 于是「POST {} 缺 text」落到了 INTERNAL/500,而不是 MISSING_TEXT/400。
  // 现已逐条与本插件真实 throw 的文案对齐(这些文案是本插件自己的稳定文案,
  // 不是 provider 原文,匹配它们是安全的;匹配不到一律 INTERNAL)。
  function errorPayload(err) {
    const raw = String(err && err.message !== undefined ? err.message : err)
    if (raw.includes('增强已取消')) return { code: 'CANCELLED', error: '增强已取消', status: 499 }
    if (raw.includes('超时')) return { code: 'TIMEOUT', error: '增强超时,请重试', status: 504 }
    if (raw.includes('输入过长')) return { code: 'INPUT_TOO_LONG', error: `输入过长(超过 ${MAX_INPUT_CHARS} 字符),请精简后再试`, status: 400 }
    if (raw.includes('输入为空')) return { code: 'EMPTY_INPUT', error: '输入为空,请先输入内容', status: 400 }
    if (raw.includes('合法 JSON')) return { code: 'BAD_JSON', error: '请求体不是合法 JSON', status: 400 }
    if (raw.includes('请求体过大')) return { code: 'BODY_TOO_LARGE', error: '请求体过大', status: 413 }
    if (raw.includes('缺少文本')) return { code: 'MISSING_TEXT', error: '请求缺少文本内容', status: 400 }
    if (raw.includes('未找到可用的默认模型')) return { code: 'NO_MODEL', error: '未找到可用的默认模型,请在模型选择器中确认已配置模型', status: 503 }
    if (raw.includes('模型调用并发已达上限')) return { code: 'MODEL_BUSY', error: '模型调用并发已达上限,请稍后再试', status: 429 }
    if (raw.includes('模型未返回增强结果')) return { code: 'EMPTY_MODEL_OUTPUT', error: '模型未返回增强结果,请重试', status: 502 }
    if (raw.includes('未正常结束') || raw.includes('异常结束') || raw.includes('模型调用失败')) return { code: 'MODEL_ERROR', error: '模型调用失败,请重试', status: 502 }
    return { code: 'INTERNAL', error: '增强失败,请重试', status: 500 }
  }

  registerRoute({
    kind: 'exact',
    path: '/prompt-enhance/api/enhance',
    handler: async (req, res) => {
      // 鉴权栅栏(必须最先):Host/Origin 信任 + 浏览器签名 cookie + 进程令牌
      if (!authorizeRoute(req, res)) return
      // 仅 POST
      if (req.method !== 'POST') { jsonReply(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: '仅支持 POST' }); return }
      // 仅接受 JSON 内容类型(拦截简单跨站表单型请求,纵深防御)
      const ct = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
      if (ct !== 'application/json') { jsonReply(res, 415, { ok: false, code: 'BAD_CONTENT_TYPE', error: 'Content-Type 必须为 application/json' }); return }
      if (rateLimited()) { jsonReply(res, 429, { ok: false, code: 'RATE_LIMITED', error: `请求过于频繁(每分钟上限 ${RATE_MAX_REQUESTS} 次),请稍后再试` }); return }
      if (httpInflight >= MAX_HTTP_INFLIGHT) { jsonReply(res, 429, { ok: false, code: 'TOO_MANY_INFLIGHT', error: '请求过于频繁,请稍后再试' }); return }
      httpInflight++
      // 浏览器关标签 / 切会话 → 请求 socket 关闭即 abort,不再空占 45/90 秒
      const controller = new AbortController()
      const onClose = () => { try { controller.abort() } catch (err) { /* 已结算 */ } }
      req.on('close', onClose)
      try {
        const body = await readBody(req, 4 * 1024 * 1024)
        let args = {}
        try { args = JSON.parse(body) } catch (err) { throw new Error('请求体不是合法 JSON') }
        const sessionId = typeof args.sessionId === 'string' && args.sessionId.length > 0 ? args.sessionId : undefined
        const result = await enhance(args.text, args.history, { sessionId, signal: controller.signal })
        jsonReply(res, 200, result)
      } catch (err) {
        const payload = errorPayload(err)
        console.error('dsh-prompt-enhance: 增强请求失败:', payload.code, String(err && err.message !== undefined ? err.message : err))
        appendDiag({ stage: 'enhance', ok: false, code: payload.code, detail: String(err && err.message !== undefined ? err.message : err).slice(0, 300) })
        jsonReply(res, payload.status, { ok: false, code: payload.code, error: payload.error })
      } finally {
        req.removeListener('close', onClose)
        httpInflight--
      }
    },
  })

  // ==================== 模式元数据 API(设置卡片数据源,只读) ====================
  registerRoute({
    kind: 'exact',
    path: '/prompt-enhance/api/modes',
    handler: (req, res) => {
      // 鉴权栅栏:模式元数据虽只读,但仍属应用内部数据,与框架 /api/* 同等待遇
      if (!authorizeRoute(req, res)) return
      if (req.method !== 'GET') { jsonReply(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: '仅支持 GET' }); return }
      jsonReply(res, 200, { ok: true, modes: publicModes(), current: currentMode() })
    },
  })

  // ==================== 进程令牌分发(免令牌,但仍过框架栅栏) ====================
  // 客户端挂载时取一次,仅存内存;此后每个 API 请求带 X-Prompt-Enhance-Token。
  // no-store:令牌绝不进浏览器缓存/磁盘。
  registerRoute({
    kind: 'exact',
    path: '/prompt-enhance/api/token',
    handler: (req, res) => {
      if (!authorizeRoute(req, res, { skipToken: true })) return
      if (req.method !== 'GET') { jsonReply(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: '仅支持 GET' }); return }
      jsonReply(res, 200, { ok: true, token: PROCESS_TOKEN })
    },
  })

  // ==================== 自检 / 诊断工具(Agent 可见) ====================
  const SELFTEST_CASES = {
    vague: { label: '模糊需求', text: '帮我写个周报,给老板看的那种,数据要清楚一点,别太长' },
    question: { label: '提问', text: '什么是RAG,它和微调有啥区别' },
    wellformed: { label: '已良好表达', text: '你是资深数据分析师。请用表格总结这份销售数据的趋势,输出三行结论。' },
    code: { label: '含代码提问', text: '这段代码有个bug,帮我看看怎么修:\n```python\ndef add(a, b):\n    retrun a + b\n```' },
    design_image: { label: '设计·文生图', text: '帮我画个图,一个女孩在雨里撑伞,要那种很唯美的感觉' },
    design_image2image: { label: '设计·图生图', text: '把这张图改成赛博朋克风格,其他保持不变' },
    design_inpaint: { label: '设计·交互编辑', text: '把这张海报左上角的字改成新年特惠,其他别动' },
    design_t2v: { label: '设计·文生视频', text: '做一个15秒的香水广告视频,要有高级感' },
    design_i2v: { label: '设计·图生视频', text: '让这张山水画动起来,云慢慢飘就行' },
    design_video: { label: '设计·首尾帧视频', text: '做个5秒的视频,开头是清晨的森林,结尾是晚霞的海边,镜头要慢慢推近' },
    design_question: { label: '设计·提问兜底', text: '赛博朋克是什么风格,适合做什么设计' },
    multiturn: {
      label: '多轮修缮',
      text: '数据那部分太少了,再详细点,语气正式一些',
      history: [
        { role: 'user', text: '帮我写一份市场周报' },
        { role: 'assistant', text: '已生成市场周报初稿:【本周概览】市场整体平稳;【数据部分】销售额略有增长;【下周展望】维持关注。' },
      ],
    },
  }

  // 工具注册容错:未来框架 schema 演进时降级为「无工具」,绝不让插件树崩溃
  function defineToolSafe(options, label) {
    try {
      return defineTool(options)
    } catch (err) {
      console.error(`dsh-prompt-enhance: 工具定义失败(${label}):`, err)
      appendDiag({ stage: 'tool-define', ok: false, detail: `${label}: ${String(err && err.message !== undefined ? err.message : err)}` })
      return undefined
    }
  }
  function registerToolSafe(tool, label) {
    try {
      ctx.tools.register(tool)
    } catch (err) {
      console.error(`dsh-prompt-enhance: 工具注册失败(${label}):`, err)
      appendDiag({ stage: 'tool-register', ok: false, detail: `${label}: ${String(err && err.message !== undefined ? err.message : err)}` })
    }
  }

  // ==================== 自检工具(默认关闭) ====================
  // v0.7.0:selftest 默认不注册。它跑 12 个真实用例、每个都可能触发多次模型流,
  // 而它是**任何 agent 都能调用**的工具 —— 等于把一个烧钱的批处理暴露给模型。
  // 需要时用组合配置打开:  - id: prompt-enhance
  //                          config: { debugTools: true }
  // 它同时声明 timeoutMs 并透传 exec.signal,所以框架的
  // dsh-tool-call-timeout-policy 会真正给它设截止时间,用户 ESC 也能中断。
  const selftestTool = opts.debugTools
    ? defineToolSafe({
    name: 'prompt_enhance_selftest',
    description: '增强提示词插件自检:用真实用例跑完整增强管线,返回输出与校验结果。可指定 case(vague/question/wellformed/code/design_image/design_image2image/design_inpaint/design_t2v/design_i2v/design_video/design_question/multiturn)或直接传 text 跑任意输入。注意:每个用例都会触发真实模型调用。',
    parameters: {
      case: { type: 'string', description: '用例名,缺省跑全部' },
      text: { type: 'string', description: '任意输入文本,优先于 case' },
    },
    // 声明 timeoutMs 即向框架断言「本工具转发 exec.signal」(见 dsh-tools 类型注释),
    // 由 dsh-tool-call-timeout-policy 包装实施。12 例 × 多次调用,给足 10 分钟。
    timeoutMs: 600000,
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    execute: async (args, exec) => {
      const signal = exec !== null && exec !== undefined ? exec.signal : undefined
      const a = args !== null && typeof args === 'object' ? args : {}
      const cancelled = () => signal !== undefined && signal.aborted === true
      if (typeof a.text === 'string' && a.text.length > 0) {
        try {
          const result = await enhance(a.text, undefined, { suppressConfirm: true, signal })
          const item = { mode: 'text', input: a.text, ok: result.ok === true, enhanced: result.enhanced }
          if (result.warning !== undefined) item.warning = result.warning
          item.suggestedMode = result.suggestedMode
          return { cases: [item] }
        } catch (err) {
          return { cases: [{ mode: 'text', input: a.text, ok: false, error: String(err && err.message !== undefined ? err.message : err) }] }
        }
      }
      const results = []
      const names = typeof a.case === 'string' && SELFTEST_CASES[a.case] !== undefined ? [a.case] : Object.keys(SELFTEST_CASES)
      for (const name of names) {
        // 用户中断 / 工具超时:立即停止,不再继续烧后续用例
        if (cancelled()) {
          results.push({ case: name, label: SELFTEST_CASES[name].label, ok: false, error: '已取消(剩余用例未执行)' })
          break
        }
        const c = SELFTEST_CASES[name]
        try {
          const result = await enhance(c.text, c.history, { suppressConfirm: true, signal })
          const item = { case: name, label: c.label, ok: result.ok === true, enhanced: result.enhanced }
          if (result.warning !== undefined) item.warning = result.warning
          item.suggestedMode = result.suggestedMode
          results.push(item)
        } catch (err) {
          results.push({ case: name, label: c.label, ok: false, error: String(err && err.message !== undefined ? err.message : err) })
          if (cancelled()) break
        }
      }
      return { cases: results, cancelled: cancelled() }
    },
  }, 'prompt_enhance_selftest')
    : undefined
  if (selftestTool !== undefined) registerToolSafe(selftestTool, 'prompt_enhance_selftest')

  const diagTool = defineToolSafe({
    name: 'prompt_enhance_diag',
    description: '增强提示词插件内部诊断:检查设置注册、HTTP 路由、成本闸门与会话历史派生状态,返回逐步结果。零模型调用。',
    parameters: {},
    timeoutMs: 15000,
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    execute: async (args, exec) => ({
      version: '0.7.0',
      routes: ['/prompt-enhance/api/enhance', '/prompt-enhance/api/modes', '/prompt-enhance/api/token'],
      security: {
        fence: (() => { try { return typeof ctx.get('connection')?.requestRejection === 'function' } catch (err) { return false } })(),
        token: 'enabled',
      },
      limits: {
        modelInflight: modelInflight,
        maxModelInflight: MAX_MODEL_INFLIGHT,
        httpInflight: httpInflight,
        maxHttpInflight: MAX_HTTP_INFLIGHT,
        rateWindowMs: RATE_WINDOW_MS,
        rateMaxRequests: RATE_MAX_REQUESTS,
      },
      // 多轮上下文是否真的可用(v0.7.0 起由 host 侧 sessions.deriveMessages() 提供)
      sessions: (() => { try { return typeof ctx.get('sessions')?.get === 'function' } catch (err) { return false } })(),
      settings: {
        service: (() => { try { return ctx.get('settings') !== undefined } catch (err) { return false } })(),
        registered: settingsRegistered,
        failed: settingsFailed,
        mode: currentMode(),
        modes: publicModes().map((m) => m.id),
      },
      // 调试工具默认关闭 —— 自检工具需要 debugTools: true 才会注册
      debugTools: opts.debugTools === true,
      selftestRegistered: selftestTool !== undefined,
      diagFile: opts.diagFile === '' ? 'off' : opts.diagFile,
    }),
  }, 'prompt_enhance_diag')
  if (diagTool !== undefined) registerToolSafe(diagTool, 'prompt_enhance_diag')

  appendDiag({ stage: 'host-apply', ok: true, detail: `磁盘常驻版已激活, 模式: ${currentMode()}, settings: ${settingsRegistered ? 'registered' : 'unavailable'}` })
}

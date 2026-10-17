// ============================================================================
// 框架契约哨兵(Contract Sentinel) · dsh-prompt-enhance v0.7.5
// ----------------------------------------------------------------------------
// 为什么需要它:升级暴露的真正问题**不是**「框架改了一个 API」,而是
// 「框架改了,而没有任何东西会告诉你」——
//   · 引用保护闸门依赖的版本嗅探在 0.1.6 静默失效(P0,功能悄悄消失)
//   · 客户端历史链依赖的 snapshot.nodes 早已不存在(P1,静默降级为单轮,
//     而 48 个单测因为手工注入 history 全部通过 —— 这正是没人发现的根因)
//   · dsh.engines.dsh 是个幽灵字段(0.1.5 起就没生效过)
//   · semver 区间把当前运行的框架版本排除在外
// 所以:把「本插件依赖的框架契约」写成**可执行断言**。框架升级后跑一次,
// 它失败即是特征(契约漂移),不是噪音 —— 失败信息直接指向要改哪一处。
//
// 0.2.1-rc.2 起契约载体的迁移(本文件 v0.7.5 的主要改动):
//   · 框架不再随包发布任何 .d.ts。每个包只有 lib/index.js(宿主)/
//     lib/client.js(客户端),lib/types/*.js 变成**运行时模块**(类型声明被擦除,
//     纯类型文件只剩 `export {}`)—— 旧哨兵读 .d.ts 的断言会全部「文件不存在」。
//   · 0.2.1 把类型级契约放进框架自己生成的**机器可读目录**,以字符串字面量
//     保存 TS 声明(运行时真正在用的数据,不是文档):
//       - 宿主侧:dsh-tool-cordis/lib/types/api-catalog.js 的 SERVICE_API /
//         EVENT_API / TYPE_API(cordis_inspect 供模型查询的服务与类型目录,
//         由 scripts/gen-cordis-api.ts 从源码 AST 生成);
//       - 客户端侧:dsh-cordis-client-runner/lib/client.js 内嵌的 client inspect
//         manifest(SERVICE_API / TYPE_API / CLIENT_SLOT_API:客户端服务、类型声明、
//         全部槽位声明)。
//     两者就是 .d.ts 在 0.2.1 的等价载体,断言仍落在声明层(不是弱化成「出现过
//     某个词」)。只有确实没有声明载体的契约(如 ConversationSnapshot)才退到
//     运行时 bundle 的形状或同版本 README 的文字,并在注释里注明原因。
//
// 用法:
//   node tests/contract-sentinel.mjs        # 独立运行
//   npm test                                # 默认包含
//   PE_SKIP_SENTINEL=1 npm test             # 只验插件自身逻辑时跳过
//
// 设计约束:只依赖 node: 内置模块与**读取**已安装框架的文件,不导入框架运行时,
// 因此可以在没有 DSH 进程的情况下运行。
// ============================================================================
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG_DIR = join(HERE, '..')
const pkg = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8'))

/** 每条断言的结果收集;失败不抛错,统一汇报(一次看清全部漂移)。 */
const results = []
function check(id, title, fn) {
  try {
    const detail = fn()
    results.push({ id, title, ok: true, detail: detail === undefined ? '' : String(detail) })
  } catch (err) {
    results.push({ id, title, ok: false, detail: String(err && err.message !== undefined ? err.message : err) })
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

// ---------------------------------------------------------------------------
// 定位已安装的框架
// ---------------------------------------------------------------------------
// 必须校验「这个目录真的装了框架」——workspace 的 node_modules/@deepseek-ai
// 只有 devDependencies(devDeps 仅声明 dsh-tools/schemastery),拿它当框架树
// 会得到一片假失败。按「最接近运行时」的顺序探测,首个合格者胜出。
function frameworkMarkerOk(dir) {
  return existsSync(join(dir, 'dsh-client-connection', 'package.json')) &&
    existsSync(join(dir, 'dsh-host-webserver', 'package.json'))
}

function findFrameworkDir() {
  const candidates = []
  // 1) 全局 npm 根下的 dsh/node_modules/@deepseek-ai(最权威的安装树)
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
    candidates.push(join(globalRoot, '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'))
  } catch (err) { /* 继续 */ }
  // 2) 默认 profile 的 node_modules/@deepseek-ai(插件运行时实际解析处)
  const home = process.env.HOME
  if (typeof home === 'string' && home.length > 0) {
    for (const profile of ['web', 'default']) {
      candidates.push(join(home, '.dsh', 'profiles', profile, 'node_modules', '@deepseek-ai'))
    }
    candidates.push(join(home, '.dsh', 'profiles', 'node_modules', '@deepseek-ai'))
  }
  // 3) 相对本插件解析(workspace 开发时)—— 放最后,因为它可能只有 devDeps
  try {
    const req = createRequire(join(PKG_DIR, 'package.json'))
    const toolsPkg = req.resolve('@deepseek-ai/dsh-tools/package.json')
    candidates.push(dirname(dirname(toolsPkg))) // …/@deepseek-ai
  } catch (err) { /* 继续 */ }

  for (const dir of candidates) {
    if (frameworkMarkerOk(dir)) return dir
  }
  throw new Error(
    '无法定位完整的 DSH 框架安装树(需同时含 dsh-client-connection 与 dsh-host-webserver)。\n' +
    '  已探测:\n' + candidates.map((c) => '    · ' + c).join('\n') + '\n' +
    '  若框架装在非默认位置,用 DSH_FRAMEWORK_DIR 指向 …/node_modules/@deepseek-ai',
  )
}

let FRAMEWORK = null
try {
  const override = process.env.DSH_FRAMEWORK_DIR
  FRAMEWORK = typeof override === 'string' && override.length > 0 ? override : findFrameworkDir()
  if (!frameworkMarkerOk(FRAMEWORK)) {
    throw new Error(`该目录不含完整框架(缺 dsh-client-connection / dsh-host-webserver): ${FRAMEWORK}`)
  }
} catch (err) {
  console.error('\n✗ 契约哨兵无法运行:' + err.message + '\n')
  process.exit(1)
}

/** 读框架包里的文件;不存在则抛(便于直接表达「这个契约的载体没了」)。 */
function readFrameworkFile(relPath) {
  const full = join(FRAMEWORK, relPath)
  assert(existsSync(full), `框架中不存在 ${relPath} —— 包被改名或移除?`)
  return readFileSync(full, 'utf8')
}
/** 读实现源码并把空白归一(断言写在 JS 实现上,不依赖格式化)。 */
function readFlat(relPath) {
  return readFrameworkFile(relPath).replace(/\s+/g, ' ')
}
/** 框架包是否存在。 */
function packageExists(name) {
  return existsSync(join(FRAMEWORK, name, 'package.json'))
}
/** 取框架当前版本(用于断言 engines 区间)。 */
function frameworkVersion() {
  const cliPkg = join(FRAMEWORK, 'dsh', 'package.json')
  if (existsSync(cliPkg)) return JSON.parse(readFileSync(cliPkg, 'utf8')).version
  try {
    return execFileSync('dsh', ['--version'], { encoding: 'utf8' }).trim()
  } catch (err) {
    throw new Error('无法取得框架版本(既无 dsh/package.json,也跑不了 dsh --version)')
  }
}

// ---------------------------------------------------------------------------
// 0.2.1 契约载体读取工具(见文件头「契约载体的迁移」)
// ---------------------------------------------------------------------------

/**
 * 把 JS 字符串字面量的原始转义体还原成文本。
 * 注册表里只需处理 JSON 式转义(\n \t \' \" \\) 与 \xNN / \uNNNN;未知转义原样保留。
 */
function unescapeJsString(text) {
  let out = ''
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch !== '\\') { out += ch; continue }
    const next = text[i + 1]
    if (next === undefined) break
    i += 1
    if (next === 'n') out += '\n'
    else if (next === 'r') out += '\r'
    else if (next === 't') out += '\t'
    else if (next === 'b') out += '\b'
    else if (next === 'f') out += '\f'
    else if (next === 'v') out += '\v'
    else if (next === '0') out += '\0'
    else if (next === 'x') {
      out += String.fromCharCode(Number.parseInt(text.slice(i + 1, i + 3), 16))
      i += 2
    } else if (next === 'u') {
      out += String.fromCharCode(Number.parseInt(text.slice(i + 1, i + 5), 16))
      i += 4
    } else out += next // \\ \' \" 等:字符本身
  }
  return out
}

/** 从 source[start] 的引号开始截取一个字符串字面量的原始转义体(不含引号);找不到闭合引号返回 null。 */
function rawQuotedAt(source, start, quote) {
  if (source[start] !== quote) return null
  let raw = ''
  for (let i = start + 1; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '\\') { raw += ch + (source[i + 1] ?? ''); i += 1; continue }
    if (ch === quote) return raw
    raw += ch
  }
  return null
}

/**
 * 从生成式注册表里取一条类型声明。条目形如:
 *   { name: 'X',\n        declaration: 'export interface X {...}' }
 * quote 是字面量引号:宿主 api-catalog 用单引号,客户端 manifest 用双引号。
 * 找不到返回 null(调用方据此表达「这个类型的载体没了」)。
 */
function findTypeDeclaration(source, name, quote) {
  const marker = `name: ${quote}${name}${quote}`
  let from = 0
  for (;;) {
    const at = source.indexOf(marker, from)
    if (at < 0) return null
    const after = source.indexOf(`declaration: ${quote}`, at + marker.length)
    // name 与 declaration 必须同属一个条目对象(中间只有逗号与空白)。
    if (after >= 0 && /^,\s*$/.test(source.slice(at + marker.length, after))) {
      const raw = rawQuotedAt(source, after + 'declaration: '.length, quote)
      if (raw !== null) return unescapeJsString(raw)
    }
    from = at + marker.length
  }
}

/**
 * 从生成式注册表里取一个「key: 'X'」条目块(截到下一个同级条目为止),
 * 用于在**指定服务/槽位**的方法与字段里断言契约,而不是在全文件里碰运气。
 * 找不到返回 null。
 */
function findKeyBlock(source, key, quote) {
  const marker = `key: ${quote}${key}${quote}`
  const at = source.indexOf(marker)
  if (at < 0) return null
  const rest = source.slice(at + marker.length)
  const boundary = /\n[ \t]*\{[ \t]*\n[ \t]*key:/.exec(rest)
  return boundary === null ? rest : rest.slice(0, boundary.index)
}

/** 宿主 API 目录(0.2.1 的 .d.ts 等价载体;懒读一次,663KB)。 */
let hostCatalogCache = null
function hostApiCatalog() {
  if (hostCatalogCache === null) hostCatalogCache = readFrameworkFile('dsh-tool-cordis/lib/types/api-catalog.js')
  return hostCatalogCache
}
/** 客户端 inspect manifest(0.2.1 客户端契约的 .d.ts 等价载体;懒读一次)。 */
let clientManifestCache = null
function clientInspectManifest() {
  if (clientManifestCache === null) clientManifestCache = readFrameworkFile('dsh-cordis-client-runner/lib/client.js')
  return clientManifestCache
}

// ===========================================================================
// 契约
// ===========================================================================

// --- 1. 安全栅栏:connection.requestRejection -----------------------------
// 这是 v0.6.0 起插件唯一的安全依赖。它若改名/改语义,插件会「失败关闭」
// (503),但那是运行期才发现的 —— 哨兵要在静态阶段就抓住。
// 0.2.1 载体:rpc-host.d.ts / rpc.d.ts 已不存在。声明改读宿主 API 目录的
// connection 服务签名 + ConnectionRequestRejection 类型;实现仍读源码。
check('1', 'connection.requestRejection 仍在(路由安全栅栏的唯一依赖)', () => {
  const catalog = hostApiCatalog()
  const service = findKeyBlock(catalog, 'connection', "'")
  assert(service !== null, '宿主 API 目录里找不到 connection 服务 —— 服务改名或被移除?')
  assert(service.includes("signature: 'requestRejection(request: ConnectionTrustRequest): ConnectionRequestRejection'"),
    'dsh-client-connection 的服务签名里找不到 requestRejection(request: ConnectionTrustRequest)(0.2.1: api-catalog.js SERVICE_API.connection)')
  const rejection = findTypeDeclaration(catalog, 'ConnectionRequestRejection', "'")
  assert(rejection !== null, '找不到 ConnectionRequestRejection 类型声明(0.2.1: api-catalog.js TYPE_API)')
  assert(/401/.test(rejection) && /403/.test(rejection), `拒绝状态码不再是 401/403: ${rejection}`)
  const impl = readFrameworkFile('dsh-client-connection/lib/index.js')
  assert(/requestRejection\s*\(/.test(impl), '实现里找不到 requestRejection 方法')
  assert(/rejection:\s*403/.test(impl) && /rejection:\s*401/.test(impl), '实现里 401/403 两条拒绝分支不见了')
  return '签名与 401/403 语义齐备(声明:api-catalog;实现:lib/index.js)'
})

// --- 2. 宿主服务与工具契约全部就位 ----------------------------------------
// 0.2.1 载体:宿主 API 目录的 SERVICE_API(服务方法签名)+ TYPE_API(类型声明),
// 辅以各包 lib/index.js 的实现断言。旧版读 lib/types/*.d.ts 的路径已全部失效。
check('2', '宿主契约载具齐全(webServer/settings/tools/defineTool/llm/timeout/crypto)', () => {
  const required = [
    'dsh-host-webserver', 'dsh-settings', 'dsh-tools', 'dsh-llm',
    'dsh-timeout', 'dsh-util-crypto', 'dsh-session', 'dsh-client-connection',
    // 0.2.1:宿主契约目录的载体包(cordis_inspect 的机器可读 API/类型目录)
    'dsh-tool-cordis',
  ]
  const missing = required.filter((n) => !packageExists(n))
  assert(missing.length === 0, `框架中缺少包: ${missing.join(', ')}`)

  const catalog = hostApiCatalog()

  const webService = findKeyBlock(catalog, 'webServer', "'")
  assert(webService !== null, '宿主 API 目录里找不到 webServer 服务')
  assert(webService.includes("signature: 'register(route: WebRoute): () => void'"),
    'webServer.register(route) 不见了或签名变了(0.2.1: SERVICE_API.webServer)')
  const webImpl = readFlat('dsh-host-webserver/lib/index.js')
  assert(/register\(route\)\s*\{/.test(webImpl), 'webServer 实现里找不到 register(route)')

  // v0.7.2:rc.2 重写了 settings 契约 —— 不再有 register(ns, schema, { base, validate }),
  // 改为「设置表单投影 profile 条目 Config 的 .volatile() 字段;自带页面的插件注册
  // configure({ auto: false }, fiber) 策略」。这里同时锚住两端:服务入口 + volatile API,
  // 并反向断言旧 register(ns, …) 没有回归。
  const settingsService = findKeyBlock(catalog, 'settings', "'")
  assert(settingsService !== null, '宿主 API 目录里找不到 settings 服务')
  assert(settingsService.includes('configure(presentation: { auto?: boolean }, owner: Fiber = this.ctx.fiber): () => void'),
    'settings.configure(presentation, owner) 不见了或签名变了(0.2.1: SERVICE_API.settings)')
  assert(!/signature: 'register\(/.test(settingsService), 'settings.register 又出现在服务签名里 —— 新契约下应改用 volatile Config')
  const settingsImpl = readFlat('dsh-settings/lib/index.js')
  assert(/configure\(presentation,\s*owner = this\.ctx\.fiber\)\s*\{/.test(settingsImpl), 'settings 实现里找不到 configure(presentation, owner)')
  assert(!/\bregister\s*\(/.test(settingsImpl), 'settings 实现里又出现了 register( —— 新契约下应改用 volatile Config')
  const schemastery = readFrameworkFile('schemastery/lib/index.mjs')
  assert(schemastery.includes('prototype.volatile'), 'schemastery 的 .volatile() 不见了(volatile 字段无法声明)')

  // 工具的 timeoutMs 契约挂在 ToolDefinition 上;exec.signal 挂在 ToolExecutionInput 上,
  // 由 ToolExecution → ToolRunContext 继承(0.2.1 的拆分,旧 .d.ts 里是 ToolRunContext 平铺字段)。
  const toolDefinition = findTypeDeclaration(catalog, 'ToolDefinition', "'")
  assert(toolDefinition !== null, '找不到 ToolDefinition 类型声明(0.2.1: TYPE_API)')
  assert(toolDefinition.includes('timeoutMs?: number'), 'ToolDefinition 的 timeoutMs 契约不见了')
  const toolExecutionInput = findTypeDeclaration(catalog, 'ToolExecutionInput', "'")
  assert(toolExecutionInput !== null, '找不到 ToolExecutionInput 类型声明(0.2.1 新增的 signal 载体)')
  assert(toolExecutionInput.includes('readonly signal: AbortSignal'), 'ToolExecutionInput 的 signal 不见了(ToolRunContext 经 ToolExecution 继承它)')
  const toolsService = findKeyBlock(catalog, 'tools', "'")
  assert(toolsService !== null && toolsService.includes("signature: 'register(definition: ToolDefinition): () => void'"),
    'tools.register(definition: ToolDefinition) 不见了(defineTool 的落点)')
  const toolsImpl = readFlat('dsh-tools/lib/types/index.js')
  assert(/timeoutMs must be a positive finite number/.test(toolsImpl), 'dsh-tools 不再校验 timeoutMs(契约失去运行时强制)')
  assert(/const signal = exec\.signal/.test(toolsImpl), 'ToolRunContext.signal 未再透传进工具执行(实现里找不到 exec.signal)')

  // deadline 是超时的统一正解,且必须有 Symbol.dispose(0.2.1 仍随包发实现,无 .d.ts)
  const timeoutImpl = readFrameworkFile('dsh-timeout/lib/index.js')
  assert(/function deadline\(/.test(timeoutImpl), 'dsh-timeout 的 deadline() 不见了')
  assert(timeoutImpl.includes('[Symbol.dispose]'), 'deadline 不再提供 Symbol.dispose')
  const cryptoImpl = readFrameworkFile('dsh-util-crypto/lib/index.js')
  assert(/function randomUUID\(/.test(cryptoImpl), 'dsh-util-crypto 的 randomUUID() 不见了')
  assert(/export \{[^}]*\brandomUUID\b/.test(cryptoImpl), 'dsh-util-crypto 不再导出 randomUUID')

  // 会话历史派生 —— v0.7.0 多轮上下文的唯一来源。
  // 0.2.1:Session 类声明在宿主 API 目录的 TYPE_API;SessionStore 以 `sessions` 服务
  // 的方法签名出现(旧 .d.ts 里的 SessionStore.get(id: SessionId))。
  const sessionDecl = findTypeDeclaration(catalog, 'Session', "'")
  assert(sessionDecl !== null, '找不到 Session 类型声明(0.2.1: TYPE_API)')
  assert(sessionDecl.includes('deriveMessages(): Message[]'), 'Session.deriveMessages() 不见了(多轮上下文会静默退回单轮)')
  const sessionsService = findKeyBlock(catalog, 'sessions', "'")
  assert(sessionsService !== null, '宿主 API 目录里找不到 sessions 服务(SessionStore 的现名)')
  assert(sessionsService.includes("signature: 'get(id: SessionId): Session | undefined'"), 'sessions.get(id: SessionId) 签名变了')
  return `${required.length} 个包 + 关键签名全部在位(声明:api-catalog;实现:各包 lib/)`
})

// --- 3. LLM 词汇表:字段名与取值域 -----------------------------------------
// 0.2.1 载体:宿主 API 目录 TYPE_API 的 GenerateOptions 声明(类型擦除后的
// 真身;dsh-llm/lib/types/types.js 已不含该声明)。
check('3', 'llm GenerateOptions 字段名与 purpose 取值域未变', () => {
  const dts = findTypeDeclaration(hostApiCatalog(), 'GenerateOptions', "'")
  assert(dts !== null, '找不到 GenerateOptions 声明(0.2.1: api-catalog.js TYPE_API)')
  for (const field of ['maxTokens', 'signal', 'purpose', 'reasoningEffort', 'temperature', 'system']) {
    assert(new RegExp(`\\b${field}\\??:`).test(dts), `GenerateOptions 里找不到 ${field}`)
  }
  assert(!dts.includes('maxOutputTokens'), 'GenerateOptions 出现了 maxOutputTokens —— 是否已改名?')
  // purpose 只有两个合法值;多一个即需要重新评估副作用
  const purposeLine = dts.match(/purpose\?:[^;]*;/)
  assert(purposeLine !== null, '找不到 purpose 声明')
  const allowed = ['compaction', 'session-title']
  for (const v of allowed) assert(purposeLine[0].includes(v), `purpose 不再包含 ${v}`)
  const quoted = purposeLine[0].match(/'([a-z-]+)'/g) || []
  assert(quoted.length === allowed.length, `purpose 取值域变了(现在是 ${quoted.join(',')})—— 插件的空正文重试依赖 session-title 的关思维链副作用`)
  return `purpose = ${quoted.join(' | ')}`
})

// --- 4. 反向断言:客户端快照没有 nodes -------------------------------------
// 这是本次 P0/P1 的根因。断言「不存在」是为了让**任何人想再走客户端历史那条路**
// 时立刻被拦住 —— 同时也证明 host 侧派生是唯一可行路径。
//
// 0.2.1 载体迁移:
//   · SessionSnapshot:类型声明没有随包 .d.ts 了,但客户端 inspect manifest 的
//     TYPE_API 里仍以字符串字面量发布完整声明 → 直接对它做反向断言。
//   · ConversationSnapshot:0.2.1 的客户端类型注册表里**没有**它的声明(纯类型文件
//     已被擦除为 export {}),因此改用两个同版本载体:
//     (a) dsh-client-ui-conversation/lib/client.js 里 ConversationSnapshot 的
//         构造器 currentSnapshot() 的返回字面量(形状即事实);
//     (b) 同版本 README 的契约文字(「ConversationSnapshot 只包含…」)。
//   · useTrajectory:旧的 `declare module '@deepseek-ai/dsh-client-ui-slots'`
//     类型增强是类型级语法,0.2.1 已擦除;它在客户端 inspect manifest 里被**物化**
//     为每个 session 槽位的 standardProps 条目 —— 对插件要挂的
//     conversation.input.right 槽位断言即可。
check('4', '【反向断言】会话/对话快照不含 nodes(客户端历史链必须保持删除)', () => {
  const clientManifest = clientInspectManifest()
  const sessionSnap = findTypeDeclaration(clientManifest, 'SessionSnapshot', '"')
  assert(sessionSnap !== null, '找不到 SessionSnapshot 声明(0.2.1: client inspect manifest TYPE_API)')
  assert(!/\bnodes\b/.test(sessionSnap), 'SessionSnapshot 现在有 nodes 了 —— 可重新评估客户端取历史(但请优先用 host 派生)')

  // ConversationSnapshot:声明载体已消失(见上),用构造器形状 + README 契约文字佐证。
  const convClient = readFrameworkFile('dsh-client-ui-conversation/lib/client.js')
  const builder = /currentSnapshot\(\)\s*\{\s*return \{([^}]*)\};/.exec(convClient)
  assert(builder !== null, 'ConversationSnapshot 的构造器 currentSnapshot() 不见了(客户端契约载体变化)')
  assert(!/\bnodes\b/.test(builder[1]), 'ConversationSnapshot 现在有 nodes 了 —— 同上,请优先用 host 派生')
  assert(/\bviews:/.test(builder[1]) && /\bactiveTargets:/.test(builder[1]),
    `ConversationSnapshot 的形状变了(构造器现在返回: ${builder[1].replace(/\s+/g, ' ').trim()})`)
  const convReadme = readFrameworkFile('dsh-client-ui-conversation/README.zh.md')
  const sentence = (convReadme.match(/[^。\n]*ConversationSnapshot[^。\n]*/) || [''])[0]
  assert(sentence.length > 0, 'README.zh.md 里找不到 ConversationSnapshot 的契约描述')
  assert(sentence.includes('active-target') && !sentence.includes('nodes'),
    `README 的 ConversationSnapshot 契约文字变了: ${sentence}`)

  // 备查:useTrajectory **确实存在**(曾被误判为不存在)。断言它仍在,并断言
  // 它仍然是「事件窗口」而不是权威派生历史 —— 后者才是我们选 host 侧的理由。
  const rightSlot = findKeyBlock(clientManifest, 'conversation.input.right', '"')
  assert(rightSlot !== null, '客户端槽位目录里找不到 conversation.input.right')
  assert(rightSlot.includes('"useTrajectory: UseTrajectory"'),
    'useTrajectory 不再出现在 session 槽位的 standardProps 里(旧的 declare module 增强关系断了)')
  const traj = readFrameworkFile('dsh-client-ui-trajectory/lib/client.js')
  assert(traj.includes('eventNodes'), 'TrajectorySnapshot.eventNodes 不见了')
  return 'SessionSnapshot 声明无 nodes;ConversationSnapshot 构造仅 views/activeTargets;useTrajectory 仍在 session 槽位 standardProps → host 侧 deriveMessages 仍是正确选择'
})

// --- 5. 客户端注入面:dsh.client.inject 的包名必须真实存在 -----------------
// check-framework-refs 刻意不查这里(混有 dsh-client-store 这类运行时种子词),
// 但正因如此,dsh-client-runtime → dsh-client-ui-renderer 那种改名会**静默**发生。
// 哨兵只对「形状像 npm 包名」的项做存在性校验。
check('5', 'dsh.client.inject 各项在框架树中可解析(客户端半的挂载前提)', () => {
  const inject = pkg.dsh?.client?.inject
  assert(Array.isArray(inject) && inject.length > 0, 'package.json 里没有 dsh.client.inject')
  const unresolved = []
  for (const name of inject) {
    if (!name.startsWith('@deepseek-ai/')) continue // 非框架包名(种子词等)跳过
    if (!packageExists(name.replace('@deepseek-ai/', ''))) unresolved.push(name)
  }
  assert(unresolved.length === 0, `以下 inject 包在框架中已不存在(改名或移除): ${unresolved.join(', ')}`)
  // 客户端 bundle 出口必须还在
  assert(typeof pkg.exports?.['./client'] === 'object' || typeof pkg.exports?.['./client'] === 'string', 'package.json 缺少 exports["./client"]')
  return `${inject.length} 项全部可解析`
})

// --- 6. 客户端挂载点:slots 服务与两个槽位 --------------------------------
// 0.2.1 载体:slots.d.ts 已不存在。槽位契约改读客户端 inspect manifest 的
// CLIENT_SLOT_API(每个槽位的 kind/scope/standardProps 声明),再用**实际渲染
// 该槽位的包**做交叉验证 —— 声明与运行时两边都锚住。
check('6', '客户端挂载点仍在(slots 服务 + 两个槽位声明)', () => {
  const renderer = readFrameworkFile('dsh-client-ui-renderer/lib/client.js')
  assert(renderer.includes('super(ctx, "slots")'), 'ui-renderer 不再提供 slots 服务')
  const clientManifest = clientInspectManifest()
  const slotsService = findKeyBlock(clientManifest, 'slots', '"')
  assert(slotsService !== null, '客户端服务目录里找不到 slots 服务(0.2.1: client inspect manifest SERVICE_API)')
  assert(slotsService.includes('signature: "declare readonly register: SlotCore[\'register\']"'),
    'slots.register 的签名契约变了(0.2.1: SERVICE_API.slots)')

  // 槽位 conversation.input.right:声明(kind=list/scope=session)+ 实际渲染
  const rightSlot = findKeyBlock(clientManifest, 'conversation.input.right', '"')
  assert(rightSlot !== null, '槽位 conversation.input.right 不见了(魔棒无处挂载)')
  assert(rightSlot.includes('kind: "list"') && rightSlot.includes('scope: "session"'),
    'conversation.input.right 的 kind/scope 变了(应为 list/session)')
  const convClient = readFrameworkFile('dsh-client-ui-conversation/lib/client.js')
  assert(convClient.includes('renderSlot("conversation.input.right"'), 'dsh-client-ui-conversation 不再渲染 conversation.input.right')

  // 槽位 settings.section:声明(kind=list/scope=root)+ 实际渲染
  const sectionSlot = findKeyBlock(clientManifest, 'settings.section', '"')
  assert(sectionSlot !== null, '槽位 settings.section 不见了(设置栏目无处挂载)')
  assert(sectionSlot.includes('kind: "list"') && sectionSlot.includes('scope: "root"'),
    'settings.section 的 kind/scope 变了(应为 list/root)')
  const settingsGeneral = readFrameworkFile('dsh-client-ui-settings-general/lib/client.js')
  assert(settingsGeneral.includes('renderSlot("settings.section"'), 'ui-settings-general 不再渲染 settings.section')

  const settingsClient = readFrameworkFile('dsh-client-ui-settings/lib/client.js')
  // v0.7.2:rc.2 起客户端设置读写入口由 settingsScope 换成 configForms
  // (configForms.get(条目 id) → getSnapshot() / set(field, value) / subscribe())。
  assert(settingsClient.includes('super(ctx, "configForms")'), 'configForms 服务不见了(设置卡片无法读写)')
  assert(!settingsClient.includes('settingsScope'), 'settingsScope 又出现了 —— 新契约下应改用 configForms')
  return 'slots / conversation.input.right / settings.section / configForms 全部在位(声明:client manifest;渲染:各客户端 bundle)'
})

// --- 7. 主题令牌与深色属性 -------------------------------------------------
check('7', '主题令牌(错误色)与 data-ds-dark-theme 仍有效', () => {
  const layout = readFrameworkFile('dsh-client-ui-layout/lib/client.js')
  assert(layout.includes('data-ds-dark-theme'), '深色主题属性 data-ds-dark-theme 不见了(19 处 CSS 会失效)')
  // 错误色令牌:v0.7.2 核实 —— 0.1.7-rc.2 起令牌定义在 **dsh-client-ui-theme**,
  // 且 `--dsw-alias-label-error` 已被移除,只剩 `--dsw-alias-state-error-primary/secondary`。
  // 旧版哨兵只查 ui-layout / ui-settings-plugins,于是把「载体换了」误报成「令牌没了」。
  // 这里按「至少一个可用令牌」断言,并优先认新令牌。
  let tokenFound = false
  for (const p of [
    'dsh-client-ui-theme/lib/client.js',
    'dsh-client-ui-layout/lib/client.js',
    'dsh-client-ui-settings-plugins/lib/client.js',
  ]) {
    try {
      const src = readFrameworkFile(p)
      if (src.includes('--dsw-alias-state-error-primary') || src.includes('--dsw-alias-label-error')) { tokenFound = true; break }
    } catch (err) { /* 换下一个载体 */ }
  }
  assert(tokenFound, '--dsw-alias-state-error-primary 与 --dsw-alias-label-error 在框架里都没有定义了 —— 错误色会只剩硬编码兜底')
  return '深色属性 + 错误色令牌(state-error-primary 在位;label-error 已在 rc.2 移除)'
})

// --- 8. 版本声明与现实一致 -------------------------------------------------
// dsh.engines.dsh 是**声明式**的,但 0.2.1 起它在启动/重组时**真的会被读**:
// dsh-app-boot 的 evaluatePluginCompatibility() 用 semver.satisfies(runtime,
// engines.dsh, { includePrerelease: true }) 判定,不满足的 bundle 整包跳过。
// 没有这条断言,它必然再次与现实脱节(0.1.5–0.2.0 期间就没生效过)。
check('8', '顶层 engines.dsh 区间覆盖当前框架版本', () => {
  const range = pkg.engines?.dsh
  assert(typeof range === 'string' && range.length > 0, 'package.json 顶层 engines.dsh 缺失(注意:不是 dsh.engines.dsh —— 那不在官方 schema 上)')
  assert(pkg.dsh?.engines === undefined, 'dsh.engines 又出现了 —— 该字段不在官方 DshManifest schema 上,应写顶层 engines.dsh')
  const version = frameworkVersion()
  // 用框架自带的 semver 语义实现:借 npm 的 semver(全局 npm 一定带)
  let semver = null
  try {
    const npmSemver = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
    semver = createRequire(join(npmSemver, 'npm', 'package.json'))('semver')
  } catch (err) { semver = null }
  if (semver === null) return `框架 ${version}(未找到 semver,跳过区间求值)`
  // 与 0.2.1 兼容闸同语义:dsh-app-boot 的 satisfies() 传 includePrerelease:true,
  // 否则 `0.2.1-rc.2` 这类 prerelease 运行时会被区间误判(旧版哨兵踩过的同款坑)。
  assert(semver.satisfies(version, range, { includePrerelease: true }),
    `当前框架 ${version} **不满足** engines.dsh="${range}" —— 0.2.1 的插件兼容闸会因此整包跳过本插件`)
  return `框架 ${version} ∈ "${range}"(与 0.2.1 兼容闸同语义:includePrerelease)`
})

// ===========================================================================
// 汇报
// ===========================================================================
const failed = results.filter((r) => !r.ok)
const lines = []
lines.push('')
lines.push('契约哨兵 · 对照已安装框架:' + FRAMEWORK)
lines.push('')
for (const r of results) {
  lines.push(`  ${r.ok ? '✅' : '❌'} [${r.id}] ${r.title}`)
  if (r.detail.length > 0) lines.push(`      ${r.detail}`)
}
lines.push('')
lines.push(`  共 ${results.length} 条,通过 ${results.length - failed.length},失败 ${failed.length}`)
lines.push('')

if (failed.length > 0) {
  lines.push('  框架契约发生了漂移。这不是噪音 —— 逐条对照上方的失败项修改插件,')
  lines.push('  或确认该契约已被新 API 取代后更新本哨兵与 README 的「未采纳官方件」章节。')
  lines.push('')
}

const text = lines.join('\n')

// 作为独立脚本运行时直接输出;被 node --test 引入时通过断言让测试失败。
export function runSentinel() {
  return { results, failed, text }
}

// 直接执行(node tests/contract-sentinel.mjs)
const isDirectRun = process.argv[1] !== undefined && process.argv[1].endsWith('contract-sentinel.mjs')
if (isDirectRun) {
  console.log(text)
  process.exit(failed.length > 0 ? 1 : 0)
}

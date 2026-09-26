// ============================================================================
// 框架契约哨兵(Contract Sentinel) · dsh-prompt-enhance v0.7.0
// ----------------------------------------------------------------------------
// 为什么需要它:本次升级暴露的真正问题**不是**「框架改了一个 API」,而是
// 「框架改了,而没有任何东西会告诉你」——
//   · 引用保护闸门依赖的版本嗅探在 0.1.6 静默失效(P0,功能悄悄消失)
//   · 客户端历史链依赖的 snapshot.nodes 早已不存在(P1,静默降级为单轮,
//     而 48 个单测因为手工注入 history 全部通过 —— 这正是没人发现的根因)
//   · dsh.engines.dsh 是个幽灵字段(0.1.5 起就没生效过)
//   · semver 区间把当前运行的框架版本排除在外
// 所以:把「本插件依赖的框架契约」写成**可执行断言**。框架升级后跑一次,
// 它失败即是特征(契约漂移),不是噪音 —— 失败信息直接指向要改哪一处。
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
/** 读 .d.ts 并把空白归一(断言写在类型源码上,不依赖格式化)。 */
function readTypes(relPath) {
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

// ===========================================================================
// 契约
// ===========================================================================

// --- 1. 安全栅栏:connection.requestRejection -----------------------------
// 这是 v0.6.0 起插件唯一的安全依赖。它若改名/改签名,插件会「失败关闭」
// (503),但那是运行期才发现的 —— 哨兵要在静态阶段就抓住。
check('1', 'connection.requestRejection 仍在(路由安全栅栏的唯一依赖)', () => {
  const dts = readTypes('dsh-client-connection/lib/types/rpc-host.d.ts')
  assert(dts.includes('requestRejection('), 'dsh-client-connection 类型里找不到 requestRejection')
  const trust = readTypes('dsh-client-connection/lib/types/rpc.d.ts')
  assert(/ConnectionRequestRejection/.test(trust), '找不到 ConnectionRequestRejection 类型')
  assert(/401/.test(trust) && /403/.test(trust), '拒绝状态码不再含 401/403')
  const impl = readFrameworkFile('dsh-client-connection/lib/index.js')
  assert(/requestRejection\s*\(/.test(impl), '实现里找不到 requestRejection 方法')
  return '签名与 401/403 语义齐备'
})

// --- 2. 宿主服务与工具契约全部就位 ----------------------------------------
check('2', '宿主契约载具齐全(webServer/settings/tools/defineTool/llm/timeout/crypto)', () => {
  const required = [
    'dsh-host-webserver', 'dsh-settings', 'dsh-tools', 'dsh-llm',
    'dsh-timeout', 'dsh-util-crypto', 'dsh-session', 'dsh-client-connection',
  ]
  const missing = required.filter((n) => !packageExists(n))
  assert(missing.length === 0, `框架中缺少包: ${missing.join(', ')}`)

  const web = readTypes('dsh-host-webserver/lib/types/index.d.ts')
  assert(web.includes('register(route'), 'webServer.register 不见了')

  // v0.7.2:rc.2 重写了 settings 契约 —— 不再有 register(ns, schema, { base, validate }),
  // 改为「设置表单投影 profile 条目 Config 的 .volatile() 字段;自带页面的插件注册
  // configure({ auto: false }, fiber) 策略」。这里同时锚住两端:服务入口 + volatile API。
  const settings = readTypes('dsh-settings/lib/types/index.d.ts')
  assert(settings.includes('configure('), 'settings.configure 不见了(rc.2 的设置策略入口)')
  assert(!/register</.test(settings), 'settings.register 又出现了 —— 新契约下应改用 volatile Config')
  const schemastery = readFrameworkFile('schemastery/lib/index.mjs')
  assert(schemastery.includes('prototype.volatile'), 'schemastery 的 .volatile() 不见了(volatile 字段无法声明)')

  const tools = readTypes('dsh-tools/lib/types/index.d.ts')
  assert(tools.includes('timeoutMs'), 'tools 的 timeoutMs 契约不见了')
  assert(tools.includes('signal'), 'ToolRunContext.signal 不见了')

  // deadline 是超时的统一正解,且必须有 Symbol.dispose
  const timeoutDts = readTypes('dsh-timeout/lib/types/index.d.ts')
  assert(timeoutDts.includes('deadline('), 'dsh-timeout 的 deadline() 不见了')
  assert(timeoutDts.includes('Symbol.dispose'), 'deadline 不再提供 Symbol.dispose')
  const cryptoDts = readTypes('dsh-util-crypto/lib/types/index.d.ts')
  assert(cryptoDts.includes('randomUUID'), 'dsh-util-crypto 的 randomUUID 不见了')

  // 会话历史派生 —— v0.7.0 多轮上下文的唯一来源
  const sessionDts = readTypes('dsh-session/lib/types/index.d.ts')
  assert(sessionDts.includes('deriveMessages()'), 'Session.deriveMessages() 不见了(多轮上下文会静默退回单轮)')
  assert(/get\(id: SessionId\)/.test(sessionDts), 'SessionStore.get(id) 签名变了')
  return `${required.length} 个包 + 关键签名全部在位`
})

// --- 3. LLM 词汇表:字段名与取值域 -----------------------------------------
check('3', 'llm GenerateOptions 字段名与 purpose 取值域未变', () => {
  const dts = readTypes('dsh-llm/lib/types/types.d.ts')
  for (const field of ['maxTokens', 'signal', 'purpose', 'reasoningEffort', 'temperature', 'system']) {
    assert(dts.includes(field), `GenerateOptions 里找不到 ${field}`)
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
check('4', '【反向断言】会话/对话快照不含 nodes(客户端历史链必须保持删除)', () => {
  const sessionSnap = readFrameworkFile('dsh-api-session-controller/lib/types/client/contract/snapshot.d.ts')
  const convSnap = readFrameworkFile('dsh-client-ui-conversation/lib/types/client/contract/snapshot.d.ts')
  const flatSession = sessionSnap.replace(/\s+/g, ' ')
  const flatConv = convSnap.replace(/\s+/g, ' ')
  assert(!/\bnodes\b/.test(flatSession), 'SessionSnapshot 现在有 nodes 了 —— 可重新评估客户端取历史(但请优先用 host 派生)')
  assert(!/\bnodes\b/.test(flatConv), 'ConversationSnapshot 现在有 nodes 了 —— 同上')
  // 备查:useTrajectory **确实存在**(曾被误判为不存在)。断言它仍在,并断言
  // 它仍然是「事件窗口」而不是权威派生历史 —— 后者才是我们选 host 侧的理由。
  const traj = readTypes('dsh-client-ui-trajectory/lib/types/client/trajectory-contract.d.ts')
  assert(traj.includes('UseTrajectory'), 'useTrajectory 不见了(若将来要靠它取历史,哨兵需同步更新)')
  assert(traj.includes('eventNodes'), 'TrajectorySnapshot.eventNodes 不见了')
  // 它是通过 declare module 注入会话槽位标准 props 的(就在同一个文件里),
  // 所以这里断言这层注入关系还在,而不是另找一个「slots 包」。
  assert(/declare module '@deepseek-ai\/dsh-client-ui-slots'/.test(traj), 'useTrajectory 不再向 SessionStandardProps 注入')
  return '两个快照都无 nodes;useTrajectory 存在但只是事件窗口 → host 侧 deriveMessages 仍是正确选择'
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
check('6', '客户端挂载点仍在(slots 服务 + 两个槽位声明)', () => {
  const renderer = readFrameworkFile('dsh-client-ui-renderer/lib/client.js')
  assert(renderer.includes('"slots"'), 'ui-renderer 不再提供 slots 服务')
  const convTypes = readFrameworkFile('dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts')
  assert(convTypes.includes('conversation.input.right'), '槽位 conversation.input.right 不见了(魔棒无处挂载)')
  const settingsGeneral = readFrameworkFile('dsh-client-ui-settings-general/lib/client.js')
  assert(settingsGeneral.includes('settings.section'), '槽位 settings.section 不见了(设置栏目无处挂载)')
  const settingsClient = readFrameworkFile('dsh-client-ui-settings/lib/client.js')
  // v0.7.2:rc.2 起客户端设置读写入口由 settingsScope 换成 configForms
  // (configForms.get(条目 id) → getSnapshot() / set(field, value) / subscribe())。
  assert(settingsClient.includes('configForms'), 'configForms 服务不见了(设置卡片无法读写)')
  assert(!settingsClient.includes('settingsScope'), 'settingsScope 又出现了 —— 新契约下应改用 configForms')
  return 'slots / conversation.input.right / settings.section / configForms 全部在位'
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
// dsh.engines.dsh 是**声明式**的(全树无 reader),所以它唯一的用处就是
// 「被断言」—— 没有这条断言,它必然再次与现实脱节(0.1.5 起就没生效过)。
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
  assert(semver.satisfies(version, range), `当前框架 ${version} **不满足** engines.dsh="${range}" —— 版本声明已与现实脱节`)
  return `框架 ${version} ∈ "${range}"`
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

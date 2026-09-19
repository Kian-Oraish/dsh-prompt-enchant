// ============================================================================
// Host 半契约与安全回归测试(离线,不需要真实 DSH 进程)
// ----------------------------------------------------------------------------
// 这些测试直接加载 lib/index.js 的 apply(),用最小 stub 假装框架服务,断言:
//   1) 路由鉴权栅栏真的存在,且对「无凭据」「rebinding 形态」「栅栏服务缺席」
//      三种情况分别给出 401 / 403 / 503 —— 全部失败关闭,绝不放行;
//   2) 凭据合法时正常放行;
//   3) 声明了 connection 硬依赖(缺它就不该挂载,而不是裸奔)。
// 目的:把「兼容 + 安全」变成可执行断言,而不是靠手工点页面。
// ============================================================================
import { test } from 'node:test'
import assert from 'node:assert/strict'

// ---------------------------------------------------------------------------
// 最小框架替身
// ---------------------------------------------------------------------------

/** 收集注册进来的路由,按 path 索引。 */
function makeWebServer() {
  const routes = new Map()
  return {
    routes,
    register(route) {
      if (routes.has(route.path)) throw new Error(`duplicate route ${route.path}`)
      routes.set(route.path, route)
      return () => routes.delete(route.path)
    },
  }
}

/** 假请求/响应:记录状态码、响应头与响应体。
 *  statusCode 初值 200 与 node:http 一致(未显式设置时即为 200)。
 *  v0.7.0:补 on/removeListener —— 插件在 enhance 路由上用 req.on('close')
 *  做「浏览器关标签即 abort」,替身必须长得像 IncomingMessage。 */
function makeExchange({ method = 'GET', headers = {}, body = '' } = {}) {
  const listeners = new Map()
  const req = {
    method,
    headers,
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(fn)
      return req
    },
    removeListener(event, fn) {
      const arr = listeners.get(event)
      if (arr !== undefined) {
        const i = arr.indexOf(fn)
        if (i >= 0) arr.splice(i, 1)
      }
      return req
    },
    /** 测试辅助:模拟请求 socket 关闭(浏览器关标签) */
    emit(event) {
      for (const fn of listeners.get(event) || []) fn()
    },
    listenerCount(event) { return (listeners.get(event) || []).length },
    async *[Symbol.asyncIterator]() {
      if (body.length > 0) yield Buffer.from(body, 'utf8')
    },
  }
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    bytes: 0,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v },
    end(chunk) {
      if (chunk === undefined) return
      if (Buffer.isBuffer(chunk)) { this.bytes = chunk.length; this.body += `<${chunk.length} bytes>`; return }
      this.body += String(chunk)
    },
  }
  return { req, res }
}

/**
 * 加载插件并用 stub 框架跑 apply()。
 * @param options.connection 传入 null 模拟 connection 服务缺席
 * @param options.requestRejection 覆盖栅栏实现
 * @param options.sessions 传入 sessions 服务替身(多轮历史派生测试用)
 * @param options.llm 覆盖 llm 服务替身(要真正走到构建 messages 的路径时用)
 */
async function loadPlugin({ connection, requestRejection, sessions, llm } = {}) {
  const mod = await import('../lib/index.js')
  const webServer = makeWebServer()
  const registeredTools = []
  const diag = []

  // 忠实复刻 dsh-client-connection 的 isTrustedApiRequest + browserAuth.isAuthenticated:
  // Host 头存在、hostname 为回环(或受信主机)、非 cross-site、Origin 与 Host 同源,
  // 且带签名 cookie。任一不满足即拒绝。
  const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i
  const defaultFence = (request) => {
    const host = request.headers.host
    if (typeof host !== 'string' || host.length === 0) return 403
    if (!LOOPBACK.test(host)) return 403                      // 非回环 Host → 不受信(挡住 rebinding)
    if (request.headers['sec-fetch-site'] === 'cross-site') return 403
    const origin = request.headers.origin
    if (typeof origin === 'string' && origin.length > 0) {
      try { if (new URL(origin).host !== host) return 403 } catch { return 403 }
    }
    const cookie = request.headers.cookie
    return typeof cookie === 'string' && cookie.includes('dsh-auth-') ? undefined : 401
  }

  const connectionService = connection === null
    ? undefined
    : { requestRejection: requestRejection !== undefined ? requestRejection : defaultFence }

  const ctx = {
    get(name) {
      if (name === 'connection') return connectionService
      if (name === 'settings') return undefined
      if (name === 'agents') return undefined
      if (name === 'userQuestions') return undefined
      if (name === 'agentDefaultModel') return undefined
      if (name === 'sessions') return sessions
      return undefined
    },
    on() { return () => {} },
    effect(fn) { return fn() },
    timeout() { return Promise.resolve() },
    webServer,
    tools: { register(tool) { registeredTools.push(tool); return () => {} } },
    llm: llm !== undefined ? llm : {
      listProviders() { return [] },
      async listModels() { return [] },
      // eslint-disable-next-line require-yield
      async *stream() { throw new Error('测试中不应真正调用模型') },
    },
  }

  mod.apply(ctx, { diagFile: '' })
  return { mod, webServer, registeredTools, diag }
}

/**
 * 会「成功返回」的 llm 替身:记录每次 stream 收到的 options,并产出固定文本。
 * 用来断言增强管线实际喂给模型的 messages(即多轮历史是否真的带上了)。
 */
function makeRecordingLlm(reply = '增强后的文本') {
  const calls = []
  return {
    calls,
    listProviders() { return [{ id: 'p1', name: 'P1' }] },
    async listModels() { return [{ id: 'm1', name: 'M1' }] },
    stream(options) {
      calls.push(options)
      const replyText = reply
      return (async function* () {
        yield { type: 'text-delta', text: replyText }
        yield { type: 'finish', reason: { kind: 'stop' } }
      })()
    },
  }
}

/** 用一个最小会话替身打一次 enhance,返回喂给模型的 messages。 */
async function messagesForHistory(derivedMessages, sessionId = 'sess-1') {
  const llm = makeRecordingLlm()
  const sessions = {
    get(id) {
      if (id !== sessionId) return undefined
      return { deriveMessages: () => derivedMessages }
    },
  }
  const { webServer } = await loadPlugin({ sessions, llm })
  const route = webServer.routes.get(ENHANCE_PATH)
  const token = await fetchToken(webServer)
  const { req, res } = makeExchange({
    method: 'POST',
    headers: authedHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify({ text: '数据那部分再详细点', sessionId }),
  })
  await route.handler(req, res)
  assert.equal(res.statusCode, 200, `enhance 应成功: ${res.body}`)
  assert.equal(llm.calls.length, 1, '应恰好调用一次模型')
  return llm.calls[0].messages
}

const MODES_PATH = '/prompt-enhance/api/modes'
const ENHANCE_PATH = '/prompt-enhance/api/enhance'
const TOKEN_PATH = '/prompt-enhance/api/token'

/**
 * v0.7.0:第二道闸门是进程级令牌。测试要拿到它就**必须走真实路径** ——
 * 用框架栅栏允许的凭据打令牌端点,再用返回的令牌打业务端点。
 * 这本身就顺带证明了「令牌分发端点免令牌、但仍需框架栅栏」这一设计。
 */
async function fetchToken(webServer) {
  const route = webServer.routes.get(TOKEN_PATH)
  assert.ok(route !== undefined, `${TOKEN_PATH} 应已注册`)
  const { req, res } = makeExchange({
    headers: { host: '127.0.0.1:3080', cookie: 'dsh-auth-127.0.0.1:3080=valid' },
  })
  await route.handler(req, res)
  assert.equal(res.statusCode, 200, '令牌端点应放行合法凭据')
  const payload = JSON.parse(res.body)
  assert.equal(typeof payload.token, 'string')
  assert.ok(payload.token.length >= 32, '令牌应足够长(32 字节随机 → 64 hex)')
  return payload.token
}

/** 带完整凭据(cookie + 进程令牌)的请求头。 */
function authedHeaders(token, extra = {}) {
  return { host: '127.0.0.1:3080', cookie: 'dsh-auth-127.0.0.1:3080=valid', 'x-prompt-enhance-token': token, ...extra }
}

// ---------------------------------------------------------------------------
// 1. 依赖声明:connection 必须是硬依赖(缺它就不挂载,而不是裸奔)
// ---------------------------------------------------------------------------
test('inject 声明必要硬依赖(鉴权栅栏缺失时不挂载)', async () => {
  const mod = await import('../lib/index.js')
  assert.ok(Array.isArray(mod.inject), 'inject 应为数组')
  for (const name of ['llm', 'webServer', 'tools', 'connection']) {
    assert.ok(mod.inject.includes(name), `inject 应包含 ${name}`)
  }
  assert.ok(!mod.inject.includes('timer'), 'timer 已不再使用,不应声明(宣告未用服务会平白增加不挂载风险)')
})

// ---------------------------------------------------------------------------
// 2. 无凭据 → 401(修复前这里是 200 且会真跑模型)
// ---------------------------------------------------------------------------
test('无 cookie 访问 /api/modes → 401,且不泄漏模式元数据', async () => {
  const { webServer } = await loadPlugin()
  const route = webServer.routes.get(MODES_PATH)
  assert.ok(route !== undefined, '路由应已注册')

  const { req, res } = makeExchange({ headers: { host: '127.0.0.1:3080' } })
  await route.handler(req, res)

  assert.equal(res.statusCode, 401)
  assert.ok(!res.body.includes('generic'), '未鉴权响应不得包含模式数据')
  assert.equal(res.headers['cache-control'], 'no-store')
})

test('无 cookie POST /api/enhance → 401,且不触达模型', async () => {
  const { webServer } = await loadPlugin()
  const route = webServer.routes.get(ENHANCE_PATH)

  const { req, res } = makeExchange({
    method: 'POST',
    headers: { host: '127.0.0.1:3080', 'content-type': 'application/json' },
    body: JSON.stringify({ text: '帮我写个周报' }),
  })
  await route.handler(req, res)

  assert.equal(res.statusCode, 401)
  assert.ok(!res.body.includes('enhanced'), '未鉴权响应不得包含增强结果')
})

// ---------------------------------------------------------------------------
// 3. DNS-rebinding 形态 → 403(Host 与 Origin 同为攻击者域名)
// ---------------------------------------------------------------------------
test('rebinding 形态(Host=evil.example)→ 403', async () => {
  const { webServer } = await loadPlugin()
  const route = webServer.routes.get(MODES_PATH)

  const { req, res } = makeExchange({
    headers: {
      host: 'evil.example',
      origin: 'http://evil.example',
      'sec-fetch-site': 'same-origin',
      cookie: 'dsh-auth-x=whatever',
    },
  })
  await route.handler(req, res)

  assert.equal(res.statusCode, 403, '非回环 Host 必须被拒,即使带 cookie')
})

test('跨站 Sec-Fetch-Site → 403', async () => {
  const { webServer } = await loadPlugin()
  const route = webServer.routes.get(MODES_PATH)

  const { req, res } = makeExchange({
    headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site', cookie: 'dsh-auth-x=whatever' },
  })
  await route.handler(req, res)

  assert.equal(res.statusCode, 403)
})

// ---------------------------------------------------------------------------
// 4. 栅栏服务缺席 → 503(失败关闭,绝不降级为放行)
// ---------------------------------------------------------------------------
test('connection 服务缺席 → 503 失败关闭,不放行', async () => {
  const { webServer } = await loadPlugin({ connection: null })
  const route = webServer.routes.get(MODES_PATH)

  const { req, res } = makeExchange({ headers: { host: '127.0.0.1:3080', cookie: 'dsh-auth-x=whatever' } })
  await route.handler(req, res)

  assert.equal(res.statusCode, 503, '栅栏不可用必须拒绝,不得放行')
  assert.ok(!res.body.includes('generic'))
})

test('requestRejection 抛异常 → 403,不放行', async () => {
  const { webServer } = await loadPlugin({
    requestRejection() { throw new Error('boom') },
  })
  const route = webServer.routes.get(MODES_PATH)

  const { req, res } = makeExchange({ headers: { host: '127.0.0.1:3080' } })
  await route.handler(req, res)

  assert.equal(res.statusCode, 403)
})

// ---------------------------------------------------------------------------
// 5. 合法凭据 → 放行(正常用户零感知)
// ---------------------------------------------------------------------------
test('回环 Host + 有效 cookie + 进程令牌 → 200 放行', async () => {
  const { webServer } = await loadPlugin()
  const route = webServer.routes.get(MODES_PATH)
  const token = await fetchToken(webServer)

  const { req, res } = makeExchange({ headers: authedHeaders(token) })
  await route.handler(req, res)

  assert.equal(res.statusCode, 200)
  const payload = JSON.parse(res.body)
  assert.equal(payload.ok, true)
  assert.ok(Array.isArray(payload.modes) && payload.modes.length >= 1, '应返回模式列表')
})

test('放行后仍强制方法约束(GET 才能读 modes)', async () => {
  const { webServer } = await loadPlugin()
  const route = webServer.routes.get(MODES_PATH)
  const token = await fetchToken(webServer)

  const { req, res } = makeExchange({ method: 'POST', headers: authedHeaders(token) })
  await route.handler(req, res)

  assert.equal(res.statusCode, 405)
})

test('放行后仍强制 Content-Type(enhance 只收 JSON)', async () => {
  const { webServer } = await loadPlugin()
  const route = webServer.routes.get(ENHANCE_PATH)
  const token = await fetchToken(webServer)

  const { req, res } = makeExchange({
    method: 'POST',
    headers: authedHeaders(token, { 'content-type': 'text/plain' }),
    body: 'x',
  })
  await route.handler(req, res)

  assert.equal(res.statusCode, 415)
})

// ---------------------------------------------------------------------------
// 5b. 进程令牌闸门(v0.7.0 新增,纵深防御)
// ---------------------------------------------------------------------------
test('cookie 合法但令牌缺失 → 403(令牌是独立的第二道闸)', async () => {
  const { webServer } = await loadPlugin()
  const route = webServer.routes.get(MODES_PATH)

  const { req, res } = makeExchange({
    headers: { host: '127.0.0.1:3080', cookie: 'dsh-auth-127.0.0.1:3080=valid' },
  })
  await route.handler(req, res)

  assert.equal(res.statusCode, 403)
  assert.equal(JSON.parse(res.body).code, 'TOKEN_REQUIRED')
})

test('令牌错误 → 403(且不回显期望值)', async () => {
  const { webServer } = await loadPlugin()
  const route = webServer.routes.get(MODES_PATH)
  const token = await fetchToken(webServer)
  const wrong = (token[0] === 'a' ? 'b' : 'a') + token.slice(1)

  const { req, res } = makeExchange({ headers: authedHeaders(wrong) })
  await route.handler(req, res)

  assert.equal(res.statusCode, 403)
  assert.equal(JSON.parse(res.body).code, 'TOKEN_REQUIRED')
  assert.ok(!res.body.includes(token), '响应绝不能回显正确令牌')
})

test('令牌长度不同 → 403(常量时间比对不因长度崩)', async () => {
  const { webServer } = await loadPlugin()
  const route = webServer.routes.get(MODES_PATH)

  const { req, res } = makeExchange({ headers: authedHeaders('short') })
  await route.handler(req, res)

  assert.equal(res.statusCode, 403)
})

test('令牌端点自身免令牌,但仍需框架栅栏(无 cookie → 401)', async () => {
  const { webServer } = await loadPlugin()
  const route = webServer.routes.get(TOKEN_PATH)

  const { req, res } = makeExchange({ headers: { host: '127.0.0.1:3080' } })
  await route.handler(req, res)

  assert.equal(res.statusCode, 401, '分发令牌的端点不能裸奔')
})

test('令牌端点不缓存(no-store)', async () => {
  const { webServer } = await loadPlugin()
  const route = webServer.routes.get(TOKEN_PATH)
  const { req, res } = makeExchange({
    headers: { host: '127.0.0.1:3080', cookie: 'dsh-auth-127.0.0.1:3080=valid' },
  })
  await route.handler(req, res)
  assert.equal(res.headers['cache-control'], 'no-store')
})

// ---------------------------------------------------------------------------
// 6. 图标路由已删除(v0.7.0):客户端早已改用内联 SVG,零引用;
//    它们曾是当时唯一绕过 authorizeRoute 的路径 → 直接删掉收敛攻击面
// ---------------------------------------------------------------------------
test('图标路由已不存在(删除死路由 = 消掉绕过鉴权的先例)', async () => {
  const { webServer } = await loadPlugin()
  for (const p of ['/prompt-enhance/icons/black.png', '/prompt-enhance/icons/white.png']) {
    assert.equal(webServer.routes.get(p), undefined, `${p} 不应再注册`)
  }
  // 所有现存路由都必须受鉴权保护(令牌端点免令牌但仍有框架栅栏)
  for (const path of webServer.routes.keys()) {
    assert.ok(path.startsWith('/prompt-enhance/api/'), `不应存在非 api 路由: ${path}`)
  }
})

// ---------------------------------------------------------------------------
// 7. 多轮上下文:host 侧 sessions.deriveMessages()(v0.7.0 的核心修复)
//    旧路径依赖客户端 snapshot.nodes —— 0.1.6 的快照没有 nodes,useTrajectory
//    不存在,12 个 projection 键无一携带消息正文,所以那条路死了且**死得静默**
//    (extractHistory 恒返回 [],而 multiturn 用例因手工注入 history 依然通过 ——
//     这正是 48 个测试没抓到的原因)。这里断言新的权威来源真的生效。
// ---------------------------------------------------------------------------
test('会话历史被真正带进模型 messages(多轮不再静默降级为单轮)', async () => {
  const messages = await messagesForHistory([
    { role: 'user', content: [{ type: 'text', text: '帮我写一份市场周报' }] },
    { role: 'assistant', content: [{ type: 'text', text: '已生成初稿:本周市场平稳。' }] },
  ])
  // 末条恒为本次输入
  assert.equal(messages.length, 3, '两条历史 + 一条本次输入')
  assert.equal(messages[0].role, 'user')
  assert.equal(messages[0].content[0].text, '帮我写一份市场周报')
  assert.equal(messages[1].role, 'assistant')
  assert.equal(messages[1].content[0].text, '已生成初稿:本周市场平稳。')
  assert.equal(messages[2].role, 'user')
  // 本次输入按既有协议做 JSON 包裹(与历史素材区分)
  assert.equal(messages[2].content[0].text, JSON.stringify('数据那部分再详细点'))
})

test('历史派生:跳过 system 与非文本块,并保持时间顺序', async () => {
  const messages = await messagesForHistory([
    { role: 'system', content: [{ type: 'text', text: '系统提示词不应进历史' }] },
    { role: 'user', content: [{ type: 'text', text: '第一问' }] },
    { role: 'assistant', content: [{ type: 'reasoning', text: '内部思考不应进历史' }] },
    { role: 'assistant', content: [{ type: 'text', text: '第一答' }] },
  ])
  const texts = messages.slice(0, -1).map((m) => m.content[0].text)
  assert.deepEqual(texts, ['第一问', '第一答'], 'system 与 reasoning 块都应被排除')
})

test('历史派生:上限 8 条且取最新(旧的先丢)', async () => {
  const many = []
  for (let i = 1; i <= 20; i++) {
    many.push({ role: 'user', content: [{ type: 'text', text: `第${i}条` }] })
  }
  const messages = await messagesForHistory(many)
  const texts = messages.slice(0, -1).map((m) => m.content[0].text)
  assert.equal(texts.length, 8, '最多 8 条')
  assert.equal(texts[texts.length - 1], '第20条', '应保留最新一条')
  assert.equal(texts[0], '第13条', '20 条里保留最后 8 条')
})

test('历史派生:单条超 800 字被截断', async () => {
  const long = 'x'.repeat(5000)
  const messages = await messagesForHistory([{ role: 'user', content: [{ type: 'text', text: long }] }])
  assert.equal(messages[0].content[0].text.length, 800)
})

test('sessions 服务缺席 → 单轮降级,不抛错(非 web profile 仍可用)', async () => {
  const llm = makeRecordingLlm()
  const { webServer } = await loadPlugin({ llm }) // 不传 sessions
  const route = webServer.routes.get(ENHANCE_PATH)
  const token = await fetchToken(webServer)
  const { req, res } = makeExchange({
    method: 'POST',
    headers: authedHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify({ text: '单轮也要能用', sessionId: 'sess-x' }),
  })
  await route.handler(req, res)
  assert.equal(res.statusCode, 200, '缺 sessions 不应导致失败')
  assert.equal(llm.calls[0].messages.length, 1, '只有本次输入,无历史')
})

test('sessionId 不可达 → 单轮降级,不抛错', async () => {
  const llm = makeRecordingLlm()
  const sessions = { get() { return undefined } }
  const { webServer } = await loadPlugin({ sessions, llm })
  const route = webServer.routes.get(ENHANCE_PATH)
  const token = await fetchToken(webServer)
  const { req, res } = makeExchange({
    method: 'POST',
    headers: authedHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify({ text: '未知会话', sessionId: 'nope' }),
  })
  await route.handler(req, res)
  assert.equal(res.statusCode, 200)
  assert.equal(llm.calls[0].messages.length, 1)
})

test('deriveMessages 抛错 → 降级为单轮而不是 500', async () => {
  const llm = makeRecordingLlm()
  const sessions = { get() { return { deriveMessages() { throw new Error('surface 损坏') } } } }
  const { webServer } = await loadPlugin({ sessions, llm })
  const route = webServer.routes.get(ENHANCE_PATH)
  const token = await fetchToken(webServer)
  const { req, res } = makeExchange({
    method: 'POST',
    headers: authedHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify({ text: '派生失败也要能用', sessionId: 's1' }),
  })
  await route.handler(req, res)
  assert.equal(res.statusCode, 200)
  assert.equal(llm.calls[0].messages.length, 1)
})

test('显式 history 优先于会话派生(selftest 用例路径保持可用)', async () => {
  const llm = makeRecordingLlm()
  const sessions = { get() { return { deriveMessages: () => [{ role: 'user', content: [{ type: 'text', text: '不应被采用' }] }] } } }
  const { webServer } = await loadPlugin({ sessions, llm })
  const route = webServer.routes.get(ENHANCE_PATH)
  const token = await fetchToken(webServer)
  const { req, res } = makeExchange({
    method: 'POST',
    headers: authedHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify({ text: '显式历史', sessionId: 's1', history: [{ role: 'assistant', text: '显式来的' }] }),
  })
  await route.handler(req, res)
  assert.equal(res.statusCode, 200)
  assert.equal(llm.calls[0].messages[0].content[0].text, '显式来的')
})

// ---------------------------------------------------------------------------
// 8. 成本闸门与错误码白名单(v0.7.0)
// ---------------------------------------------------------------------------
test('错误响应不回显内部原文(按稳定 code 白名单)', async () => {
  const llm = makeRecordingLlm()
  // 让模型流抛出一个含敏感内部细节的错误
  llm.stream = () => (async function* () { throw new Error('provider 内部细节: key=sk-secret-123') })()
  const { webServer } = await loadPlugin({ llm })
  const route = webServer.routes.get(ENHANCE_PATH)
  const token = await fetchToken(webServer)
  const { req, res } = makeExchange({
    method: 'POST',
    headers: authedHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify({ text: '触发错误' }),
  })
  await route.handler(req, res)
  const payload = JSON.parse(res.body)
  assert.equal(payload.ok, false)
  assert.equal(typeof payload.code, 'string', '应回稳定 code')
  assert.ok(!res.body.includes('sk-secret-123'), '绝不能回显 provider 原文')
  assert.ok(!res.body.includes('provider 内部细节'), '绝不能回显内部 message')
})

test('输入过长 → INPUT_TOO_LONG(白名单映射,非内部文案)', async () => {
  const llm = makeRecordingLlm()
  const { webServer } = await loadPlugin({ llm })
  const route = webServer.routes.get(ENHANCE_PATH)
  const token = await fetchToken(webServer)
  const { req, res } = makeExchange({
    method: 'POST',
    headers: authedHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify({ text: 'x'.repeat(30000) }),
  })
  await route.handler(req, res)
  assert.equal(res.statusCode, 400)
  assert.equal(JSON.parse(res.body).code, 'INPUT_TOO_LONG')
})

test('selftest 工具默认不注册(它一跑就是 12 个真实模型调用)', async () => {
  const { registeredTools } = await loadPlugin()
  const names = registeredTools.map((t) => t.name)
  assert.ok(names.includes('prompt_enhance_diag'), '零成本的 diag 应始终可用')
  assert.ok(!names.includes('prompt_enhance_selftest'), 'selftest 默认必须关闭')
})

test('diag 工具自报 v0.7.0 的关键状态(栅栏/令牌/闸门/sessions)', async () => {
  const { registeredTools } = await loadPlugin()
  const diag = registeredTools.find((t) => t.name === 'prompt_enhance_diag')
  const out = await diag.execute({}, { signal: new AbortController().signal })
  assert.equal(out.version, '0.7.0')
  assert.equal(out.security.token, 'enabled')
  assert.equal(out.security.fence, true)
  assert.equal(out.sessions, false, '本替身未提供 sessions → 应如实报 false')
  assert.equal(out.debugTools, false)
  assert.equal(out.selftestRegistered, false)
  assert.ok(out.routes.includes('/prompt-enhance/api/token'))
  assert.ok(!out.routes.some((r) => r.includes('icons')), '图标路由已删除')
  assert.equal(out.limits.maxModelInflight, 2)
})

test('缺 text 字段 → MISSING_TEXT/400(运行期验收抓到的真实缺陷,固化为回归)', async () => {
  const llm = makeRecordingLlm()
  const { webServer } = await loadPlugin({ llm })
  const route = webServer.routes.get(ENHANCE_PATH)
  const token = await fetchToken(webServer)
  const { req, res } = makeExchange({
    method: 'POST',
    headers: authedHeaders(token, { 'content-type': 'application/json' }),
    body: '{}',
  })
  await route.handler(req, res)
  // 曾经这里回 500/INTERNAL:白名单用了 '缺文本' 这个连续子串去匹配
  // '请求缺少文本内容',而后者并不包含前者 —— 运行期验收抓到,现已修正。
  assert.equal(res.statusCode, 400, `应 400 而非 ${res.statusCode}: ${res.body}`)
  assert.equal(JSON.parse(res.body).code, 'MISSING_TEXT')
})

test('错误码白名单:输入过长优先于输入为空(子串顺序)', async () => {
  const llm = makeRecordingLlm()
  const { webServer } = await loadPlugin({ llm })
  const route = webServer.routes.get(ENHANCE_PATH)
  const token = await fetchToken(webServer)
  const { req, res } = makeExchange({
    method: 'POST',
    headers: authedHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify({ text: 'x'.repeat(30000) }),
  })
  await route.handler(req, res)
  assert.equal(JSON.parse(res.body).code, 'INPUT_TOO_LONG')
})

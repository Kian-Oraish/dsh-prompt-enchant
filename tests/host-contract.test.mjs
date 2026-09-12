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
 *  statusCode 初值 200 与 node:http 一致(未显式设置时即为 200)。 */
function makeExchange({ method = 'GET', headers = {}, body = '' } = {}) {
  const req = {
    method,
    headers,
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
 */
async function loadPlugin({ connection, requestRejection } = {}) {
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
      return undefined
    },
    on() { return () => {} },
    effect(fn) { return fn() },
    timeout() { return Promise.resolve() },
    webServer,
    tools: { register(tool) { registeredTools.push(tool); return () => {} } },
    llm: {
      listProviders() { return [] },
      async listModels() { return [] },
      // eslint-disable-next-line require-yield
      async *stream() { throw new Error('测试中不应真正调用模型') },
    },
  }

  mod.apply(ctx, { diagFile: '' })
  return { mod, webServer, registeredTools, diag }
}

const MODES_PATH = '/prompt-enhance/api/modes'
const ENHANCE_PATH = '/prompt-enhance/api/enhance'

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
test('回环 Host + 有效 cookie → 200 放行', async () => {
  const { webServer } = await loadPlugin()
  const route = webServer.routes.get(MODES_PATH)

  const { req, res } = makeExchange({
    headers: { host: '127.0.0.1:3080', cookie: 'dsh-auth-127.0.0.1:3080=valid' },
  })
  await route.handler(req, res)

  assert.equal(res.statusCode, 200)
  const payload = JSON.parse(res.body)
  assert.equal(payload.ok, true)
  assert.ok(Array.isArray(payload.modes) && payload.modes.length >= 1, '应返回模式列表')
})

test('放行后仍强制方法约束(GET 才能读 modes)', async () => {
  const { webServer } = await loadPlugin()
  const route = webServer.routes.get(MODES_PATH)

  const { req, res } = makeExchange({
    method: 'POST',
    headers: { host: '127.0.0.1:3080', cookie: 'dsh-auth-127.0.0.1:3080=valid' },
  })
  await route.handler(req, res)

  assert.equal(res.statusCode, 405)
})

test('放行后仍强制 Content-Type(enhance 只收 JSON)', async () => {
  const { webServer } = await loadPlugin()
  const route = webServer.routes.get(ENHANCE_PATH)

  const { req, res } = makeExchange({
    method: 'POST',
    headers: { host: '127.0.0.1:3080', cookie: 'dsh-auth-127.0.0.1:3080=valid', 'content-type': 'text/plain' },
    body: 'x',
  })
  await route.handler(req, res)

  assert.equal(res.statusCode, 415)
})

// ---------------------------------------------------------------------------
// 6. 图标路由保持公开可缓存(客户端 <img> 语义,无凭据依赖)
// ---------------------------------------------------------------------------
test('图标路由不需要凭据且带强缓存头', async () => {
  const { webServer } = await loadPlugin()
  for (const p of ['/prompt-enhance/icons/black.png', '/prompt-enhance/icons/white.png']) {
    const route = webServer.routes.get(p)
    assert.ok(route !== undefined, `${p} 应已注册`)
    const { req, res } = makeExchange({ headers: {} })
    await route.handler(req, res)
    assert.equal(res.statusCode, 200, `${p} 应公开可读`)
    assert.equal(res.headers['content-type'], 'image/png')
    assert.equal(res.headers['x-content-type-options'], 'nosniff')
    assert.ok(res.bytes > 0, `${p} 应真的返回图标字节`)
  }
})

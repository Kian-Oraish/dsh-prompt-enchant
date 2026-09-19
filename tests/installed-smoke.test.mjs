// ============================================================================
// 安装态冒烟测试 · 通过 DSH 实际解析到的那条路径加载插件
// ----------------------------------------------------------------------------
// 为什么单独写这一个:host-contract.test.mjs 用相对路径 import '../lib/index.js',
// 那是**源码**;而运行时 DSH 是通过 profile 的符号链接
//   ~/.dsh/profiles/web/node_modules/dsh-prompt-enhance → <本仓库>
// 去解析的。v0.7.0 把安装形态从「实体副本」改成了符号链接,所以「装上去之后
// 还能不能正常解析并挂载」这件事必须单独钉死 —— 否则一旦链接指错/断开,
// 表现是插件静默不工作,而不是报错。
//
// 本测试不需要重启 DSH:它只借用框架**已安装的包**(运行时导入)与插件
// **已安装的路径**,在一个进程内跑 apply()。
// ============================================================================
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, realpathSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'

const PROFILE_LINK = join(homedir(), '.dsh', 'profiles', 'web', 'node_modules', 'dsh-prompt-enhance')
const REPO_DIR = realpathSync(join(import.meta.dirname, '..'))

/** 探测安装态;未安装(如在 CI/纯净检出上跑测试)则跳过而非失败。 */
function installState() {
  if (!existsSync(PROFILE_LINK)) return { installed: false, reason: '未安装(链接不存在)' }
  let target
  try {
    target = readlinkSync(PROFILE_LINK)
  } catch (err) {
    return { installed: false, reason: '存在但不是符号链接(旧式实体副本?)' }
  }
  return { installed: true, target }
}

const state = installState()

test('安装态:符号链接指向本仓库', { skip: state.installed ? false : state.reason }, () => {
  assert.equal(state.target, REPO_DIR, `链接指向 ${state.target},期望 ${REPO_DIR}`)
})

test('安装态:从链接路径能加载插件并以 stub 框架挂载成功', { skip: state.installed ? false : state.reason }, async () => {
  // 关键:import **链接路径**而不是源码相对路径 —— 这正是 DSH 走的那条
  const entry = join(PROFILE_LINK, 'lib', 'index.js')
  const mod = await import(pathToFileURL(entry).href)

  assert.equal(mod.name, 'dsh-prompt-enhance')
  assert.ok(Array.isArray(mod.inject), 'inject 应为数组')
  for (const name of ['llm', 'webServer', 'tools', 'connection']) {
    assert.ok(mod.inject.includes(name), `inject 应包含 ${name}`)
  }

  // --- 最小框架替身(形状对齐 0.1.6-alpha.2 的真实契约) ---
  const routes = new Map()
  const tools = []
  const webServer = {
    register(route) {
      if (routes.has(route.path)) throw new Error(`duplicate route ${route.path}`)
      routes.set(route.path, route)
      return () => routes.delete(route.path)
    },
  }
  const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i
  const ctx = {
    get(name) {
      if (name === 'connection') {
        return {
          requestRejection(request) {
            const host = request.headers.host
            if (typeof host !== 'string' || !LOOPBACK.test(host)) return 403
            return typeof request.headers.cookie === 'string' && request.headers.cookie.includes('dsh-auth-') ? undefined : 401
          },
        }
      }
      return undefined
    },
    on() { return () => {} },
    inject(_names, cb) { try { cb(ctx) } catch (err) { /* 替身无该服务 */ } },
    effect(fn) { return fn() },
    timeout() { return Promise.resolve() },
    webServer,
    tools: { register(tool) { tools.push(tool); return () => {} } },
    llm: { listProviders() { return [] }, async listModels() { return [] }, async *stream() {} },
  }

  // 真正的验证点:apply() 不抛错 = 运行时导入(@deepseek-ai/dsh-timeout 的
  // deadline、dsh-util-crypto 的 randomUUID、dsh-tools 的 defineTool)全部解析成功
  assert.doesNotThrow(() => mod.apply(ctx, { diagFile: '' }), 'apply() 不应抛错')

  // 路由面:v0.7.0 恰好三条,且全部在受保护前缀下
  const paths = [...routes.keys()].sort()
  assert.deepEqual(paths, [
    '/prompt-enhance/api/enhance',
    '/prompt-enhance/api/modes',
    '/prompt-enhance/api/token',
  ], '路由面应为三条(图标路由已删除)')

  // 工具面:diag 恒在(零成本),selftest 默认关闭
  const names = tools.map((t) => t.name).sort()
  assert.deepEqual(names, ['prompt_enhance_diag'], '默认只应注册 diag')

  // 工具契约:两个必填字段都在(output.schema 的对象节点必须显式 additionalProperties)
  const diag = tools[0]
  assert.equal(diag.timeoutMs, 15000, 'diag 应声明 timeoutMs')
  assert.equal(diag.output.schema.type, 'object')
  assert.equal(diag.output.schema.additionalProperties, true, '对象节点必须显式声明 additionalProperties')

  // 端到端:令牌闸门在**安装态**下同样生效
  const tokenRoute = routes.get('/prompt-enhance/api/token')
  const modesRoute = routes.get('/prompt-enhance/api/modes')
  const makeRes = () => ({
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v },
    end(c) { if (c !== undefined) this.body += String(c) },
  })
  const authedReq = (extra = {}) => ({ method: 'GET', headers: { host: '127.0.0.1:3080', cookie: 'dsh-auth-x=y', ...extra } })

  const tokenRes = makeRes()
  await tokenRoute.handler(authedReq(), tokenRes)
  assert.equal(tokenRes.statusCode, 200, '令牌端点应放行合法凭据')
  const token = JSON.parse(tokenRes.body).token
  assert.ok(typeof token === 'string' && token.length === 64, '令牌应为 32 字节 → 64 hex')

  const noTokenRes = makeRes()
  await modesRoute.handler(authedReq(), noTokenRes)
  assert.equal(noTokenRes.statusCode, 403, '无令牌必须被拒(第二道闸)')

  const okRes = makeRes()
  await modesRoute.handler(authedReq({ 'x-prompt-enhance-token': token }), okRes)
  assert.equal(okRes.statusCode, 200, '带正确令牌应放行')
})

test('安装态:每次加载生成不同令牌(每进程随机)', { skip: state.installed ? false : state.reason }, async () => {
  const entry = join(PROFILE_LINK, 'lib', 'index.js')
  const url = pathToFileURL(entry).href
  // 用查询串绕过 ESM 模块缓存,模拟「新进程」再加载一次
  const first = await import(url + '?run=1')
  const second = await import(url + '?run=2')

  const collect = (mod) => {
    const routes = new Map()
    const ctx = {
      get: (n) => (n === 'connection' ? { requestRejection: () => undefined } : undefined),
      on: () => () => {}, inject: () => {}, effect: (f) => f(),
      timeout: () => Promise.resolve(),
      webServer: { register: (r) => { routes.set(r.path, r); return () => {} } },
      tools: { register: () => () => {} },
      llm: { listProviders: () => [], listModels: async () => [], stream: async function* () {} },
    }
    mod.apply(ctx, { diagFile: '' })
    return routes
  }
  const readToken = async (routes) => {
    const res = {
      statusCode: 200, headers: {}, body: '',
      setHeader(k, v) { this.headers[k.toLowerCase()] = v },
      end(c) { if (c !== undefined) this.body += String(c) },
    }
    await routes.get('/prompt-enhance/api/token').handler({ method: 'GET', headers: {} }, res)
    return JSON.parse(res.body).token
  }
  const t1 = await readToken(collect(first))
  const t2 = await readToken(collect(second))
  assert.notEqual(t1, t2, '两次加载应得到不同令牌(每进程随机 → 重启即轮换)')
})

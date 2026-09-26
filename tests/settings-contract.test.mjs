// ============================================================================
// settings 契约回归测试(v0.7.2 新增)
// ----------------------------------------------------------------------------
// 为什么需要它:0.7.1 在 0.1.7-rc.2 上「设置完全不可见」是**静默**的 ——
// 旧守门 `typeof settingsService.register !== 'function'` 直接 return,
// 于是 registered/failed 双双为 false,没有任何日志。这套断言把新契约钉死:
//   1) rc.2 形状:插件 Config 是**反应式引用**({ get() }),模式必须从它读取;
//   2) 必须注册 configure({ auto: false }, fiber) 策略(自带设置栏目);
//   3) 服务只提供 configure、不提供 register 时,绝不能声称自己注册成功;
//   4) 旧框架形状(普通 config 值 + register)**仍然可用**,不因新契约而回归。
// ============================================================================
import { test } from 'node:test'
import assert from 'node:assert/strict'
import z from '@deepseek-ai/schemastery'

/** 本地 schemastery 是否支持 volatile —— 3.18.4 起才有,rc.2 自带的就是 3.18.4。 */
const VOLATILE_SUPPORTED = typeof z.string().volatile === 'function'

/** 最小 webServer 替身(路由注册即记录)。 */
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

/**
 * 挂载插件。
 * @param options.config 传给 apply 的配置(rc.2 形状请传 { mode: { get } })
 * @param options.settings 传给 ctx.get('settings') 的服务替身
 * @param options.withInject 是否提供 ctx.inject(rc.2 的框架有,老桩里没有)
 */
async function mount({ config = {}, settings, withInject = true } = {}) {
  const mod = await import('../lib/index.js')
  const webServer = makeWebServer()
  const tools = []
  const configureCalls = []
  const injected = []

  const service = settings === undefined
    ? { configure(policy, owner) { configureCalls.push({ policy, owner }); return () => {} } }
    : settings

  const ctx = {
    get(name) {
      if (name === 'settings') return service
      if (name === 'connection') return { requestRejection: () => undefined }
      if (name === 'llm') return { listProviders() { return [] }, async listModels() { return [] }, async *stream() { throw new Error('不应调用模型') } }
      return undefined
    },
    on() { return () => {} },
    effect(fn) { return fn() },
    timeout() { return Promise.resolve() },
    webServer,
    tools: { register(tool) { tools.push(tool); return () => {} } },
  }
  if (withInject) {
    ctx.inject = (names, cb) => {
      injected.push(names)
      // 忠实复刻 rc.2:settings 子级上带 settings 服务与 effect
      cb({ settings: service, effect: (fn) => fn() })
      return () => {}
    }
  }

  mod.apply(ctx, config)
  const diag = tools.find((t) => t.name === 'prompt_enhance_diag')
  assert.ok(diag !== undefined, 'prompt_enhance_diag 工具应已注册')
  return { mod, configureCalls, injected, diag, value: await diag.execute({}, {}) }
}

test('rc.2 形状:模式从反应式 Config 引用读取,并注册 configure({auto:false}) 策略', async () => {
  const { value, configureCalls, injected, mod } = await mount({
    config: { mode: { get: () => 'design' } },
  })

  // 1) Config schema 真的声明了 mode;支持 volatile 的框架下还必须是 volatile
  //    (否则设置表单不会投影该字段 —— 这正是 rc.2 上「设置不可见」的另一半原因)
  assert.ok(mod.Config !== undefined, '应导出 Config(schema)')
  const json = typeof mod.Config.toJSON === 'function' ? mod.Config.toJSON() : mod.Config
  // schemastery 的 toJSON 是引用图 { uid, refs };旧版可能直接给对象节点
  const root = json.refs !== undefined && json.uid !== undefined ? json.refs[json.uid] : json
  const decl = root.dict !== undefined ? root.dict.mode : root.mode
  assert.ok(decl !== undefined, 'Config 应声明 mode 字段')
  if (VOLATILE_SUPPORTED) {
    const node = typeof decl === 'number' && json.refs !== undefined ? json.refs[decl] : decl
    assert.equal(node.meta?.volatile, true, '支持 .volatile() 的框架下 mode 必须声明为 volatile')
  }

  // 2) 反应式引用被真正读取:diag 报 design,而不是兜底 generic
  assert.equal(value.settings.configBound, true, 'configBound 应为 true(Config 引用已绑定)')
  assert.equal(value.settings.mode, 'design', '模式应来自 Config 引用')
  assert.equal(value.settings.failed, false, '新契约下不应进入旧的失败分支')

  // 3) configure({auto:false}) 策略已注册,且归属本插件 fiber
  assert.equal(value.settings.policy, true, 'policy 应为 true')
  assert.equal(configureCalls.length, 1, 'configure 应被调用一次')
  assert.deepEqual(configureCalls[0].policy, { auto: false }, '策略必须是 { auto: false }')
  assert.ok(injected.some((n) => n.includes('settings')), '应通过 ctx.inject 等待 settings 服务')
})

test('rc.2 形状:Config 值非法时回退默认模式,且不得误报成功', async () => {
  const { value } = await mount({ config: { mode: { get: () => '不存在的模式' } } })
  assert.equal(value.settings.mode, 'generic', '非法值应回退默认模式')
  assert.equal(value.settings.configBound, true, '绑定状态仍为 true')
  assert.equal(value.settings.registered, false, '新契约下 registered 必须为 false,不得误报')
})

test('旧框架形状:普通 config 值仍被读取(不因新契约回归)', async () => {
  const { value } = await mount({ config: { mode: 'design' } })
  assert.equal(value.settings.mode, 'design', '普通值形态也应读得出模式')
  assert.equal(value.settings.configBound, true, 'mode 键存在即视为绑定')
})

test('只有旧契约(register 存在、无 config 引用)时,走命名空间兜底', async () => {
  const calls = []
  const legacySettings = {
    register(ns, schema, options) {
      calls.push({ ns, schema, options })
      return { get: () => ({ mode: 'design' }) }
    },
  }
  const { value } = await mount({ config: {}, settings: legacySettings })
  assert.equal(calls.length, 1, '旧契约下应调用 settings.register')
  assert.equal(calls[0].ns, 'prompt-enhance', '命名空间名不应变')
  assert.equal(value.settings.registered, true, '旧契约注册成功应如实上报')
  assert.equal(value.settings.mode, 'design', '模式应来自旧命名空间')
})

test('settings 服务缺席:不崩、不误报,模式回退默认', async () => {
  const { value, configureCalls } = await mount({ config: {}, settings: undefined, withInject: false })
  assert.equal(value.settings.mode, 'generic', '服务缺席时模式回退默认')
  assert.equal(value.settings.policy, false, '无服务时不得声称注册了策略')
  assert.equal(value.settings.registered, false, '无服务时不得声称注册了命名空间')
  assert.equal(configureCalls.length, 0, '无 configure 能力时不应调用')
})

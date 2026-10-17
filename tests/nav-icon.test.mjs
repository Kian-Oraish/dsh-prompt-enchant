// ============================================================================
// 设置导航星标回归测试(v0.7.4 新增)
// ----------------------------------------------------------------------------
// 为什么需要它:星标曾被撑成 128px 把整栏顶出可视区(用户截图报障),而这是
// **纯视觉、零日志**的故障 —— 没有任何断言时,它只会在用户眼里的某个时刻炸。
//
// 触发链(已实测复现):
//   编辑 lib/client.js → 客户端 HMR 卸载旧模块 → 卸载钩子移除它注入的 <style>,
//   `.pwe-nav-star` 那条 CSS 随之消失 → 但**已经换进导航的 svg 没人回收** →
//   该 svg 自身没有 width/height,唯一尺寸来源没了 → 按 viewBox 比例撑满容器。
//
// 因此本测试钉死两条不变量:
//   1) 换上去的星标必须自带 width/height(尺寸不依赖任何样式表);
//   2) 旧版本留下的无尺寸星标必须被自动换掉(自愈,不必让用户刷新页面)。
//
// 跑法:node --test tests/nav-icon.test.mjs
// ============================================================================
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const SOURCE = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

// ---------- 极简 DOM 替身:只实现 swapOnce 真正用到的那些面 ----------
class FakeClassList {
  constructor(el) { this.el = el }
  contains(name) { return String(this.el.attrs.class || '').split(/\s+/).includes(name) }
}
class FakeEl {
  constructor(tag) { this.tagName = tag; this.attrs = {}; this.children = []; this.parentNode = null; this.textContent = '' }
  setAttribute(name, value) { this.attrs[name] = String(value) }
  getAttribute(name) { return name in this.attrs ? this.attrs[name] : null }
  get classList() { return new FakeClassList(this) }
  get firstElementChild() { return this.children[0] ?? null }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child }
  replaceWith(next) {
    const parent = this.parentNode
    if (parent === null) return
    const at = parent.children.indexOf(this)
    if (at < 0) return
    parent.children[at] = next
    next.parentNode = parent
  }
  querySelectorAll(selector) {
    if (selector === 'span') return this.children.filter((c) => c.tagName === 'span')
    return []
  }
}

/** 造一个「设置面板」:内含一个页签按钮,按钮首个子元素是指定的图标。 */
function makePanel(icon) {
  const panel = new FakeEl('div')
  const button = new FakeEl('button')
  const label = new FakeEl('span')
  label.textContent = '提示词增强'
  button.appendChild(icon)
  button.appendChild(label)
  panel.navButtons = [button]
  panel.querySelectorAll = (selector) => (selector === 'nav button' ? panel.navButtons : [])
  return { panel, button }
}

/** 在干净沙箱里加载 bundle 并 apply,返回 { button, ctx }。 */
async function mount(icon) {
  const { panel, button } = makePanel(icon)
  let dialogOpen = true

  const document = {
    head: new FakeEl('head'),
    body: new FakeEl('body'),
    createElement: (tag) => new FakeEl(tag),
    createElementNS: (_ns, tag) => new FakeEl(tag),
    querySelector: (selector) => (selector === 'div[role="dialog"]' && dialogOpen ? panel : null),
  }
  const observers = []
  class MutationObserver {
    constructor(callback) { this.callback = callback; observers.push(this) }
    observe() {}
    disconnect() {}
  }

  const slots = { inject() {}, register() { return () => {} } }
  const disposers = []
  const ctx = {
    get: (name) => (name === 'slots' ? slots : undefined),
    effect: (fn) => { const d = fn(); if (typeof d === 'function') disposers.push(d); return () => {} },
  }

  const sandbox = {
    window: { __ModuleLoader__: { load(definition) { sandbox.window.__definition = definition } } },
    document,
    MutationObserver,
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }),
    AbortController, TextDecoder, navigator: { clipboard: { writeText() {} } },
  }
  vm.createContext(sandbox)
  vm.runInContext(SOURCE, sandbox, { filename: 'client.js' })

  const definition = sandbox.window.__definition
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
    useEffect: () => {}, useRef: (v) => ({ current: v }), useMemo: (fn) => fn(),
    useSyncExternalStore: (_sub, get) => get(), useCallback: (fn) => fn(), useId: () => 'id',
  }
  definition.factory((spec) => {
    if (spec === 'react') return React
    return {}
  }).apply(ctx)

  // body 观察器在挂载时会同步跑一次 onBodyMutation → 发现面板 → 120ms 去抖后替换
  await new Promise((resolve) => setTimeout(resolve, 250))
  return { button, close: () => { dialogOpen = false; return new Promise((r) => setTimeout(r, 700)) } }
}

// 收尾一律走 t.after:断言失败时也必须把插件的关闭轮询停掉,否则 setInterval
// 会拖住事件循环,把「失败的测试」变成「永远不结束的测试」(实测踩到过)。
async function withPanel(t, icon) {
  const mounted = await mount(icon)
  t.after(() => mounted.close())
  return mounted
}

const GEAR = () => { const g = new FakeEl('svg'); g.setAttribute('class', 'Dws9Sa_navIcon'); return g }

test('换上的星标自带 16px 尺寸(不依赖样式表)', async (t) => {
  const mounted = await withPanel(t, GEAR())
  const icon = mounted.button.firstElementChild
  assert.equal(icon.getAttribute('class'), 'pwe-nav-star', '框架齿轮应被换成本插件的星标')
  assert.equal(icon.getAttribute('width'), '16', '星标必须自带 width:样式表一消失它就会被撑爆')
  assert.equal(icon.getAttribute('height'), '16', '星标必须自带 height:样式表一消失它就会被撑爆')
})

test('缺尺寸的旧星标会被自动换掉(自愈,无需刷新页面)', async (t) => {
  const stale = new FakeEl('svg')
  stale.setAttribute('class', 'pwe-nav-star') // v0.7.3 及更早:没有 width/height
  const mounted = await withPanel(t, stale)
  const icon = mounted.button.firstElementChild
  assert.notEqual(icon, stale, '无尺寸的旧星标必须被替换,否则它会一直撑在导航里')
  assert.equal(icon.getAttribute('width'), '16')
  assert.equal(icon.getAttribute('height'), '16')
})

test('已修好的星标不被反复替换', async (t) => {
  const healthy = new FakeEl('svg')
  healthy.setAttribute('class', 'pwe-nav-star')
  healthy.setAttribute('width', '16')
  healthy.setAttribute('height', '16')
  const mounted = await withPanel(t, healthy)
  assert.equal(mounted.button.firstElementChild, healthy, '健康的星标应原样保留,避免每次开面板都重建 DOM')
})

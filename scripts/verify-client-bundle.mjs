// ============================================================================
// 客户端 bundle 伺服验收(需 DSH 守护在 3080 运行)
// ----------------------------------------------------------------------------
// 验证:浏览器实际会拿到**新**的 client.js 字节,且服务端内存里的 rev(内容哈希)
// 已随重启刷新 —— 这正是「改了 client.js 必须重启」那条铁律的实证。
//
// 背景:clientModules 以 combo 形式伺服客户端 bundle:
//   /plugins/??dsh-prompt-enhance/client.js&rev=<内容哈希>
// rev 不可变且缓存在内存,所以不重启就继续发旧字节。本探针把
//   · 服务端实际返回的字节 sha256
//   · 磁盘上 lib/client.js 的 sha256
// 对比,并检查返回体里是否含 v0.7.0 才有的标记(token 往返 / 无 newFramework)。
//
// 用法:node scripts/verify-client-bundle.mjs
// 退出码:0 一致;1 不一致(说明服务在发旧字节);2 前置条件不足
// ============================================================================
import { readFileSync } from 'node:fs'
import { createHash, createHmac } from 'node:crypto'
import { request } from 'node:http'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST = '127.0.0.1'
const PORT = 3080
const AUTHORITY = `${HOST}:${PORT}`
const REPO = dirname(dirname(fileURLToPath(import.meta.url)))

const b64 = (b) => Buffer.from(b).toString('base64url')
const sha256 = (b) => createHash('sha256').update(b).digest('hex')

function readSecret() {
  const path = join(homedir(), '.dsh', '.credentials.yaml')
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    console.error(`✗ 读不到 ${path}`)
    process.exit(2)
  }
  const line = text.split('\n').find((l) => l.trim().startsWith('secret:'))
  if (line === undefined) {
    console.error('✗ credentials 里找不到 browser-session secret')
    process.exit(2)
  }
  const decoded = Buffer.from(line.split('secret:')[1].trim().replaceAll('-', '+').replaceAll('_', '/'), 'base64')
  if (decoded.byteLength !== 32) {
    console.error(`✗ secret 解码后应为 32 字节,实为 ${decoded.byteLength}`)
    process.exit(2)
  }
  return decoded
}

const SECRET = readSecret()
const NAME = 'dsh-auth-' + b64(createHash('sha256').update(AUTHORITY).digest())
const now = Date.now()
const payload = b64(Buffer.from(JSON.stringify({ version: 1, authority: AUTHORITY, issuedAt: now, expiresAt: now + 86400000 }), 'utf8'))
const COOKIE = `${NAME}=v1.${payload}.${b64(createHmac('sha256', SECRET).update(payload).digest())}`

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: HOST, port: PORT, path, method: 'GET',
      headers: { Host: AUTHORITY, Cookie: COOKIE, ...headers } }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, buf: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.end()
  })
}

console.log(`\n客户端 bundle 伺服验收 · http://${AUTHORITY}\n`)

const disk = readFileSync(join(REPO, 'lib', 'client.js'))
const diskHash = sha256(disk)
console.log(`磁盘 lib/client.js       sha256 ${diskHash.slice(0, 16)}…  ${disk.length} 字节`)

// bundle URL 里的 rev 是**内容哈希**,不可猜 —— 从索引页的启动注入里读真实 URL
// (这正是浏览器拿到的那一个)。
const index = await get('/')
if (index.status !== 200) {
  console.error(`\n✗ 取索引页失败(HTTP ${index.status});需要鉴权 cookie`)
  process.exit(2)
}
const html = index.buf.toString('utf8')
const all = [...html.matchAll(/["'`](\/plugins\/[^"'`]*)["'`]/g)].map((m) => m[1].replaceAll('&amp;', '&'))
// 本插件可能同时出现在**它的专属 combo**(单一成员)与若干**共享 combo**(几十个包
// 打成一串)里。必须挑成员只有它自己的那一条 —— 否则会把别人包的字节一起哈希,
// 得到「不一致」的假警报(实测踩过:共享 combo 5.6MB,里面还有别的包的
// extractHistory 字样)。
const candidates = all
  .filter((u) => u.includes('dsh-prompt-enhance'))
  .map((u) => {
    const spec = u.split('??')[1] ?? ''
    const ids = decodeURIComponent(spec.split('&')[0]).split(',').filter((s) => s.length > 0)
    return { url: u, ids }
  })
  .filter((c) => c.ids.length === 1 && c.ids[0].startsWith('dsh-prompt-enhance/'))

if (candidates.length === 0) {
  console.error('\n✗ 索引页里找不到 dsh-prompt-enhance 的**专属** bundle URL —— 插件未被组合进客户端?')
  console.error('  (调试:索引页广告 /plugins 共', all.length, '条,含本插件', all.filter((u) => u.includes('dsh-prompt-enhance')).length, '条)')
  process.exit(1)
}
const bundleUrl = candidates[0].url
console.log(`广告的专属 bundle URL: ${bundleUrl}`)

let fail = 0
const entry = await get(bundleUrl)
console.log(`GET 该 URL → HTTP ${entry.status}(${entry.buf.length} 字节)`)
if (entry.status !== 200 || entry.buf.length === 0) {
  console.error('\n✗ 未取到 bundle 字节')
  process.exit(1)
}

const servedHash = sha256(entry.buf)
console.log(`服务端返回字节           sha256 ${servedHash.slice(0, 16)}…`)

// 服务端返回的是**被包装过**的 bundle(loader 会包一层注册壳),所以长度会略大于
// 磁盘文件、整体 sha256 必然不同 —— 不能拿整体哈希判等。改为「磁盘内容是否为
// 服务端字节的子串」这一确定性判据(带一点验证,防包装层恰好含同名前缀)。
const diskInServed = entry.buf.includes(disk)
if (diskInServed) {
  console.log(`\n✅ 磁盘 lib/client.js 逐字节出现在服务端字节中(+${entry.buf.length - disk.length} 字节包装层)`)
  console.log('   → 重启已生效,rev 已刷新为新内容哈希')
} else {
  // 退一步:找出首个差异位置,给出可诊断信息
  let i = 0
  while (i < disk.length && i < entry.buf.length && disk[i] === entry.buf[i]) i++
  console.log(`\n❌ 服务端字节**不含**磁盘内容(首个差异在第 ${i} 字节)`)
  console.log('   → 服务在发旧字节,需要重启守护')
  fail++
}

// v0.7.0 标记:新逻辑必须出现在被伺服的字节里。
// 注意:这些断言只能证明「新版在发」,**不能**用「旧版特征不存在」来判旧 ——
// 因为新源码的注释里会**刻意保留**旧标识符的名字(记录删了什么、为什么删)。
// 实测踩过:早先这里断言「不含 extractHistory」,而新源码注释里恰好有它,
// 于是报了一个假失败。要判旧版只能用**旧版独有**的代码形状(下一条)。
const text = entry.buf.toString('utf8')
const marks = [
  ['进程令牌往返', 'X-Prompt-Enhance-Token'],
  ['令牌分发端点', '/prompt-enhance/api/token'],
  ['引用闸门已修正', 'refGuardBlocked'],
  ['作用域收敛后的观察器', 'stopPanelWatch'],
]
console.log('\nv0.7.0 标记检查(正向:新逻辑必须在):')
for (const [label, needle] of marks) {
  const hit = text.includes(needle)
  console.log(`   ${hit ? '✅' : '❌'} ${label}(${needle})`)
  if (!hit) fail++
}

// 旧版独有的**代码形状**必须消失。注意区分注释与代码:
//   · 新注释里会写 `newFramework = (typeof useSession ...)` 作为历史记录 → 允许
//   · 旧代码里是 `const newFramework = typeof props.useSession !== 'function' && ...`
//     —— 若服务端还发旧版,这个可执行形状一定在。
// 同理旧版有 `sessionHooked` / `convHooked` 两个实变量。
console.log('\n旧版代码形状检查(反向:旧逻辑必须不在):')
const legacy = [
  ['旧版版本嗅探变量声明', 'const newFramework ='],
  ['旧版会话快照取用分支', 'const sessionHooked ='],
  ['旧版组合分支', 'const convHooked ='],
  // 用**真实调用**形状而不是裸标识符:新源码的注释里合法地写着
  // "删除 ctx.on('service', …)",裸标识符会假阳性(实测踩过)。
  ['旧版死兜底调用(真实调用形状)', "ctx.on('service', () =>"],
]
for (const [label, needle] of legacy) {
  const hit = text.includes(needle)
  console.log(`   ${hit ? '❌' : '✅'} ${label}(${needle})${hit ? ' ← 服务端仍在发旧字节!' : ''}`)
  if (hit) fail++
}

console.log(fail === 0 ? '\n结果:全部通过\n' : `\n结果:${fail} 项失败\n`)
process.exit(fail === 0 ? 0 : 1)

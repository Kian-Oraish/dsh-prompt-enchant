// ============================================================================
// 运行期验收探针(需 DSH 守护在 3080 运行)
// ----------------------------------------------------------------------------
// 用框架自己的签名规则铸一个合法会话 cookie,从而在**没有浏览器**的情况下
// 验证完整的两道闸门链路:
//   签名 cookie(Host 绑定)→ 框架栅栏 → 进程令牌 → 业务端点
//
// cookie 方案(镜像 dsh-client-connection/lib/index.js):
//   名  = "dsh-auth-" + base64url(sha256(authority))
//   值  = "v1." + base64url(JSON payload) + "." + base64url(hmac_sha256(secret, body))
//   payload = { version: 1, authority, issuedAt, expiresAt }
//   secret 来自 ~/.dsh/.credentials.yaml 的 client-connection/browser-session 记录
//
// 用法:node scripts/verify-runtime.mjs
// 退出码:0 全部通过;1 有失败;2 前置条件不足(无 secret / 服务未起)
// ============================================================================
import { readFileSync } from 'node:fs'
import { writeSync } from 'node:fs'
import { createHash, createHmac } from 'node:crypto'
import { request } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'

// 无缓冲输出:探针若被外部超时杀掉,已完成的步骤必须仍然可见 ——
// 管道下的 console.log 是块缓冲的,进程被 kill 时日志会一起丢失。
function say(line) { writeSync(2, line + '\n') }

// 单请求上限:超过即判定「服务端未回写响应」而不是无限等待。
const REQUEST_TIMEOUT_MS = 8000
let seq = 0

const HOST = '127.0.0.1'
const PORT = 3080
const AUTHORITY = `${HOST}:${PORT}`

const b64 = (b) => Buffer.from(b).toString('base64url')

function readSecret() {
  const path = join(homedir(), '.dsh', '.credentials.yaml')
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    say(`✗ 读不到 ${path}`)
    process.exit(2)
  }
  const line = text.split('\n').find((l) => l.trim().startsWith('secret:'))
  if (line === undefined) {
    say('✗ credentials 里找不到 browser-session secret')
    process.exit(2)
  }
  const stored = line.split('secret:')[1].trim()
  // 框架 canonicalSecret():把存储值 base64url 解码成原始字节,且必须是 32 字节。
  // 直接把字符串当 HMAC 密钥会得到「签名不匹配 → 401」。
  const decoded = Buffer.from(stored.replaceAll('-', '+').replaceAll('_', '/'), 'base64')
  if (decoded.byteLength !== 32) {
    say(`✗ secret 解码后应为 32 字节,实为 ${decoded.byteLength}`)
    process.exit(2)
  }
  return decoded
}

const SECRET = readSecret()
const COOKIE_NAME = 'dsh-auth-' + b64(createHash('sha256').update(AUTHORITY).digest())

function makeCookie(overrides = {}) {
  const now = Date.now()
  const payload = {
    version: 1,
    authority: AUTHORITY,
    issuedAt: now,
    // 小到天级即可;探针只在本地跑
    expiresAt: now + 24 * 60 * 60 * 1000,
    ...overrides,
  }
  const body = b64(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = b64(createHmac('sha256', SECRET).update(body).digest())
  return `${COOKIE_NAME}=v1.${body}.${sig}`
}

function call(path, { method = 'GET', headers = {}, body, cookie } = {}) {
  const n = ++seq
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const req = request(
      { host: HOST, port: PORT, path, method,
        headers: { Host: AUTHORITY, ...(cookie === null ? {} : { Cookie: cookie ?? makeCookie() }), ...headers } },
      (res) => {
        let data = ''
        res.on('data', (c) => { data += c })
        res.on('end', () => {
          say(`   · #${n} ${method} ${path} → ${res.statusCode} (${Date.now() - started}ms)`)
          resolve({ status: res.statusCode, headers: res.headers, body: data })
        })
      },
    )
    // 有界:插件的「客户端断开即 abort」一旦回归,某些请求会**永不回写响应**。
    // 探针必须让它明确失败并指出是哪一个请求,而不是自己也跟着静默卡死
    // (曾把整个探针卡在无输出状态,last-exit 142,排查成本极高)。
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`请求超时(${REQUEST_TIMEOUT_MS}ms):服务端未回写响应`))
    })
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

let pass = 0
let fail = 0
function expect(label, actual, want) {
  const ok = actual === want
  if (ok) pass++
  else fail++
  say(`   ${ok ? '✅' : '❌'} ${label}: ${actual}${ok ? '' : `  ← 期望 ${want}`}`)
}

say(`\n运行期验收 · http://${AUTHORITY}\n`)

// --- 0. 服务可达 ---
try {
  await call('/prompt-enhance/api/modes')
} catch (err) {
  say(`✗ 服务不可达(${AUTHORITY}):${err.message}`)
  process.exit(2)
}

say('【A】第一道闸:框架栅栏(Host/Origin 信任 + 签名 cookie)')
expect('无 cookie → 401', (await call('/prompt-enhance/api/modes', { cookie: null })).status, 401)
expect('伪造 Host(rebinding 形态) → 403',
  (await call('/prompt-enhance/api/modes', { cookie: null, headers: { Host: 'evil.example', Origin: 'http://evil.example' } })).status, 403)
expect('合法签名 cookie + 令牌 → 200', (await call('/prompt-enhance/api/token')).status, 200)

say('\n【B】第二道闸:进程令牌')
const tokenRes = await call('/prompt-enhance/api/token')
const token = JSON.parse(tokenRes.body).token
expect('令牌长度 64(32 字节 hex)', token.length, 64)
expect('令牌端点 Cache-Control: no-store', tokenRes.headers['cache-control'], 'no-store')
expect('cookie 合法但缺令牌 → 403', (await call('/prompt-enhance/api/modes')).status, 403)
const missing = await call('/prompt-enhance/api/modes')
expect('缺令牌的 code = TOKEN_REQUIRED', JSON.parse(missing.body).code, 'TOKEN_REQUIRED')
expect('错误令牌 → 403', (await call('/prompt-enhance/api/modes', { headers: { 'X-Prompt-Enhance-Token': 'deadbeef'.repeat(8) } })).status, 403)
expect('令牌长度不等 → 403(常量时间比对不崩)', (await call('/prompt-enhance/api/modes', { headers: { 'X-Prompt-Enhance-Token': 'x' } })).status, 403)
const leak = await call('/prompt-enhance/api/modes', { headers: { 'X-Prompt-Enhance-Token': 'wrong' } })
expect('错误响应不回显正确令牌', leak.body.includes(token) ? 'leaked' : 'clean', 'clean')

say('\n【C】业务端点(带完整凭据)')
const modes = await call('/prompt-enhance/api/modes', { headers: { 'X-Prompt-Enhance-Token': token } })
expect('GET /api/modes → 200', modes.status, 200)
const modesJson = JSON.parse(modes.body)
expect('modes 含 generic', modesJson.modes.some((m) => m.id === 'generic') ? 'yes' : 'no', 'yes')
expect('POST /api/modes → 405', (await call('/prompt-enhance/api/modes', { method: 'POST', headers: { 'X-Prompt-Enhance-Token': token } })).status, 405)

say('\n【D】错误码白名单(不回显内部原文)')
const badCt = await call('/prompt-enhance/api/enhance', {
  method: 'POST', headers: { 'X-Prompt-Enhance-Token': token, 'Content-Type': 'text/plain' }, body: 'x',
})
expect('非 JSON Content-Type → 415', badCt.status, 415)
const empty = await call('/prompt-enhance/api/enhance', {
  method: 'POST', headers: { 'X-Prompt-Enhance-Token': token, 'Content-Type': 'application/json' }, body: '{}',
})
expect('缺文本 → 400', empty.status, 400)
expect('code = MISSING_TEXT', JSON.parse(empty.body).code, 'MISSING_TEXT')
expect('不回显内部原文/栈', /at .*\(|\bstack\b|Error:/i.test(empty.body) ? 'leaked' : 'clean', 'clean')

say('\n【E】已删除的死路由')
expect('GET /icons/black.png → 404', (await call('/prompt-enhance/icons/black.png', { cookie: null })).status, 404)

say(`\n结果:${pass} 通过 / ${fail} 失败\n`)
process.exit(fail === 0 ? 0 : 1)

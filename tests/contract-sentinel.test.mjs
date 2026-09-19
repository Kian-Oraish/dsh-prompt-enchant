// ============================================================================
// 契约哨兵的测试入口 —— 让 npm test 默认包含它。
//   npm test                  → 跑哨兵(框架漂移会红)
//   PE_SKIP_SENTINEL=1 npm test → 只验插件自身逻辑,跳过哨兵
// 失败时把完整报告打进断言消息,一次看清是哪条契约动了。
// ============================================================================
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runSentinel } from './contract-sentinel.mjs'

const SKIP = process.env.PE_SKIP_SENTINEL === '1'

test('框架契约哨兵:本插件依赖的每一条框架契约都还在', { skip: SKIP ? 'PE_SKIP_SENTINEL=1' : false }, () => {
  const { failed, text, results } = runSentinel()
  assert.ok(results.length >= 8, `哨兵应至少有 8 条断言,实际 ${results.length}`)
  assert.equal(failed.length, 0, `框架契约漂移 ${failed.length} 条:\n${text}`)
})

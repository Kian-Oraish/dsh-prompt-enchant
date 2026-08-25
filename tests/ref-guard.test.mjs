// ============================================================================
// 引用记号保护:确定性纯函数单测(node tests/ref-guard.test.mjs,零依赖)
// ============================================================================
import assert from 'node:assert'
import { extractRefTokens, refTokensPreserved, locateRefTokens, splitGaps } from '../lib/ref-guard.js'

let passed = 0
function t(name, fn) {
  try {
    fn()
    passed++
    console.log('ok - ' + name)
  } catch (err) {
    console.error('FAIL - ' + name)
    console.error(err && err.message ? err.message : err)
    process.exitCode = 1
  }
}

// ---------- extractRefTokens ----------
t('提取单个文件引用', () => {
  assert.deepStrictEqual(extractRefTokens('参考 @AGENTS.md 的规范'), ['@AGENTS.md'])
})
t('提取多个引用(文件+路径+会话)', () => {
  const text = '结合 @AGENTS.md 与 @docs/指南.md 以及 @会话甲 来写'
  assert.deepStrictEqual(extractRefTokens(text), ['@AGENTS.md', '@docs/指南.md', '@会话甲'])
})
t('引号/括号后紧跟引用也可识别', () => {
  assert.deepStrictEqual(extractRefTokens('请读(@README.md)与「@规范.txt」'), ['@README.md', '@规范.txt'])
})
t('引用后随中文标点即止', () => {
  assert.deepStrictEqual(extractRefTokens('打开 @a.md,再看@b.md。'), ['@a.md', '@b.md'])
})
t('邮箱形态不误判(x@y)', () => {
  assert.deepStrictEqual(extractRefTokens('联系 a@b.com 查看'), [])
})
t('无引用返回空数组', () => {
  assert.deepStrictEqual(extractRefTokens('普通文本没有引用'), [])
})

// ---------- refTokensPreserved ----------
t('逐字按序保留即通过', () => {
  assert.strictEqual(refTokensPreserved(['@AGENTS.md'], '请依照 @AGENTS.md 中的规范执行'), true)
})
t('丢失 @ 前缀不通过', () => {
  assert.strictEqual(refTokensPreserved(['@AGENTS.md'], '请依照 AGENTS.md 中的规范执行'), false)
})
t('引用被改写不通过', () => {
  assert.strictEqual(refTokensPreserved(['@AGENTS.md'], '请依照 @AGENTS.txt 中的规范执行'), false)
})
t('顺序颠倒不通过', () => {
  assert.strictEqual(refTokensPreserved(['@a.md', '@b.md'], '看 @b.md 与 @a.md'), false)
})
t('同名重复引用按序计数', () => {
  assert.strictEqual(refTokensPreserved(['@a.md', '@a.md'], '先 @a.md 后 @a.md'), true)
  assert.strictEqual(refTokensPreserved(['@a.md', '@a.md'], '仅 @a.md 一次'), false)
})
t('无引用恒通过', () => {
  assert.strictEqual(refTokensPreserved([], '任意输出'), true)
})

// ---------- locateRefTokens / splitGaps ----------
t('定位引用区间', () => {
  assert.deepStrictEqual(locateRefTokens(['@AGENTS.md'], '前文 @AGENTS.md 后文'), [[3, 13]])
})
t('定位缺失返回 null', () => {
  assert.strictEqual(locateRefTokens(['@AGENTS.md'], '没有引用'), null)
})
t('间隙切分:单引用三段对齐', () => {
  const original = '参考 @AGENTS.md 的规范写功能'
  const enhanced = '请依照 @AGENTS.md 中的规范实现该功能'
  const gaps = splitGaps(['@AGENTS.md'], original, enhanced)
  assert.ok(gaps !== null)
  assert.strictEqual(gaps.length, 2)
  assert.strictEqual(gaps[0].oText, '参考 ')
  assert.strictEqual(gaps[0].eText, '请依照 ')
  assert.strictEqual(gaps[1].oText, ' 的规范写功能')
  assert.strictEqual(gaps[1].eText, ' 中的规范实现该功能')
})
t('间隙切分:增强文缺失引用返回 null', () => {
  assert.strictEqual(splitGaps(['@AGENTS.md'], '看 @AGENTS.md', '看 AGENTS.md'), null)
})
t('间隙切分:双引用五段', () => {
  const tokens = ['@a.md', '@b.md']
  const original = '读 @a.md 和 @b.md 后动手'
  const enhanced = '请读 @a.md 与 @b.md 之后动手'
  const gaps = splitGaps(tokens, original, enhanced)
  assert.ok(gaps !== null)
  assert.strictEqual(gaps.length, 3)
  assert.strictEqual(gaps[0].eText, '请读 ')
  assert.strictEqual(gaps[1].eText, ' 与 ')
  assert.strictEqual(gaps[2].eText, ' 之后动手')
})

// ---------- 客户端右→左间隙回填模拟(与 lib/client.js applyGapEdits 同构) ----------
function simulateApplyGapEdits(draft, cmdPrefixLen, textPart, refs, enhanced) {
  const spans = locateRefTokens(refs.map((r) => r.text), enhanced)
  assert.ok(spans !== null)
  const n = refs.length
  let draftNow = draft
  for (let i = n; i >= 0; i--) {
    const gsTp = i === 0 ? 0 : refs[i - 1].tpEnd
    const geTp = i === n ? textPart.length : refs[i].tpStart
    const es = i === 0 ? 0 : spans[i - 1][1]
    const ee = i === n ? enhanced.length : spans[i][0]
    const gapText = enhanced.slice(es, ee)
    const gs = cmdPrefixLen + gsTp
    const ge = cmdPrefixLen + geTp
    if (draftNow.slice(gs, ge) === gapText) continue
    draftNow = draftNow.slice(0, gs) + gapText + draftNow.slice(ge)
  }
  return draftNow
}
t('间隙回填:引用位置与文本不变,周围正文被替换', () => {
  const cmdPrefix = '/plan '
  const draft = cmdPrefix + '参考 @AGENTS.md 的规范写功能'
  const textPart = draft.slice(cmdPrefix.length)
  const refs = [{ text: '@AGENTS.md', tpStart: 3, tpEnd: 13 }]
  const enhanced = '请依照 @AGENTS.md 中的规范实现该功能'
  const out = simulateApplyGapEdits(draft, cmdPrefix.length, textPart, refs, enhanced)
  assert.strictEqual(out, cmdPrefix + enhanced)
  // 引用记号在最终草稿中的位置 = 前缀长度 + 增强文中的位置(前段长度差由编译器 reconcile 自动重基)
  assert.strictEqual(out.indexOf('@AGENTS.md'), cmdPrefix.length + enhanced.indexOf('@AGENTS.md'))
})
t('间隙回填:双引用中间文本精确替换', () => {
  const cmdPrefix = '/plan '
  const draft = cmdPrefix + '读 @a.md 和 @b.md 后动手'
  const textPart = draft.slice(cmdPrefix.length)
  const refs = [
    { text: '@a.md', tpStart: 2, tpEnd: 7 },
    { text: '@b.md', tpStart: 10, tpEnd: 15 },
  ]
  const enhanced = '请读 @a.md 与 @b.md 之后动手'
  const out = simulateApplyGapEdits(draft, cmdPrefix.length, textPart, refs, enhanced)
  assert.strictEqual(out, cmdPrefix + enhanced)
})
t('间隙回填:撤销恢复原文(同坐标逆向替换)', () => {
  const cmdPrefix = '/plan '
  const enhancedFull = cmdPrefix + '请依照 @AGENTS.md 中的规范实现该功能'
  const textPart = enhancedFull.slice(cmdPrefix.length)
  const refTexts = ['@AGENTS.md']
  const origGapTexts = ['参考 ', ' 的规范写功能']
  const spans = locateRefTokens(refTexts, textPart)
  assert.ok(spans !== null)
  let draftNow = enhancedFull
  const n = refTexts.length
  for (let i = n; i >= 0; i--) {
    const gsTp = i === 0 ? 0 : spans[i - 1][1]
    const geTp = i === n ? textPart.length : spans[i][0]
    const gs = cmdPrefix.length + gsTp
    const ge = cmdPrefix.length + geTp
    const gapText = origGapTexts[i]
    if (draftNow.slice(gs, ge) === gapText) continue
    draftNow = draftNow.slice(0, gs) + gapText + draftNow.slice(ge)
  }
  assert.strictEqual(draftNow, cmdPrefix + '参考 @AGENTS.md 的规范写功能')
})
t('间隙回填:空引用段跳过不破坏草稿', () => {
  const cmdPrefix = ''
  const draft = '@a.md@b.md 动手'
  const textPart = draft
  const refs = [
    { text: '@a.md', tpStart: 0, tpEnd: 5 },
    { text: '@b.md', tpStart: 5, tpEnd: 10 },
  ]
  const enhanced = '@a.md@b.md 立即动手'
  const out = simulateApplyGapEdits(draft, 0, textPart, refs, enhanced)
  assert.strictEqual(out, enhanced)
})

console.log(`\n${passed} passed`)
if (process.exitCode !== 1) process.exitCode = 0

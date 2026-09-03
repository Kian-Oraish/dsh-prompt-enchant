import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stripSuggestTags, tidyAfterStrip, resolveSuggestion, SUGGEST_TAG_RE } from '../lib/suggest.js'
import { hasMode } from '../lib/modes.js'

test('尾部标记:剥离并捕获建议', () => {
  const out = stripSuggestTags('【画面】雨夜撑伞的女孩\n[[MODE:design]]')
  assert.equal(out.suggested, 'design')
  assert.equal(out.text.includes('[[MODE'), false)
  assert.equal(out.text.trim().endsWith('女孩'), true)
})

test('标记在文本中部:同样剥离,不泄漏进正文', () => {
  const out = stripSuggestTags('前半 [[MODE:design]] 后半')
  assert.equal(out.suggested, 'design')
  assert.equal(out.text, '前半  后半')
  assert.equal(tidyAfterStrip(out.text), '前半 后半')
})

test('多个标记:取最后一个,全部剥离', () => {
  const out = stripSuggestTags('a [[MODE:generic]] b [[MODE:design]]')
  assert.equal(out.suggested, 'design')
  assert.equal(out.text.includes('[['), false)
})

test('无标记:原文不变,无建议', () => {
  const out = stripSuggestTags('普通增强文本,无任何标记')
  assert.equal(out.suggested, undefined)
  assert.equal(out.text, '普通增强文本,无任何标记')
})

test('非法 id(大写/空/含下划线)不匹配,不剥离', () => {
  const out = stripSuggestTags('[[MODE:Design]] [[MODE:]] [[MODE:a_b]] 结尾')
  assert.equal(out.suggested, undefined)
  assert.equal(out.text, '[[MODE:Design]] [[MODE:]] [[MODE:a_b]] 结尾')
})

test('tidy:代码围栏内空格保留', () => {
  const src = '说明文字  有双空格\n```\ndef  f(x):\n  return x\n```\n尾行'
  const cleaned = tidyAfterStrip(src)
  assert.equal(cleaned.includes('说明文字  有'), false)
  assert.equal(cleaned.includes('说明文字 有'), true)
  assert.equal(cleaned.includes('def  f(x)'), true)
  assert.equal(cleaned.includes('return x'), true)
})

test('终判:合法且不同才生效;同模式/未知/非法一律 null', () => {
  assert.equal(resolveSuggestion('design', hasMode, 'generic'), 'design')
  assert.equal(resolveSuggestion('generic', hasMode, 'generic'), null)
  assert.equal(resolveSuggestion('nope', hasMode, 'generic'), null)
  assert.equal(resolveSuggestion(undefined, hasMode, 'generic'), null)
  assert.equal(resolveSuggestion(42, hasMode, 'generic'), null)
  assert.equal(resolveSuggestion('design', hasMode, 'design'), null)
})

test('标记正则只认小写连字符 id', () => {
  // 全局正则 .test() 有 lastIndex 状态,每次用新实例
  const tag = (text) => new RegExp(SUGGEST_TAG_RE.source, 'g').test(text)
  assert.equal(tag('[[MODE:design]]'), true)
  assert.equal(tag('[[MODE:ai-video]]'), true)
  assert.equal(tag('[[MODE:Design]]'), false)
  assert.equal(tag('[[mode:design]]'), false)
})

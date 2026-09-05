import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseConfirms, pickAnswerText, applyAnswers, buildQuestions } from '../lib/confirm.js'

test('带要素名与候选:解析出要素与候选列表', () => {
  const items = parseConfirms('风格采用【待确认:色调(冷调/暖调)】,构图【待确认:视角(仰视/平视/俯视)】')
  assert.equal(items.length, 2)
  assert.equal(items[0].element, '色调')
  assert.deepEqual(items[0].candidates, ['冷调', '暖调'])
  assert.equal(items[1].element, '视角')
  assert.deepEqual(items[1].candidates, ['仰视', '平视', '俯视'])
  assert.equal(items[0].index < items[1].index, true)
})

test('只带要素名:无候选', () => {
  const items = parseConfirms('画质【待确认:细节程度】')
  assert.equal(items.length, 1)
  assert.equal(items[0].element, '细节程度')
  assert.deepEqual(items[0].candidates, [])
})

test('裸标记:要素名回退为前文片段', () => {
  const items = parseConfirms('整体色调清透(【待确认】)')
  assert.equal(items.length, 1)
  assert.ok(items[0].element.length > 0)
  assert.deepEqual(items[0].candidates, [])
})

test('无待确认:返回空数组', () => {
  assert.deepEqual(parseConfirms('这是一段完整的提示词'), [])
  assert.deepEqual(parseConfirms(''), [])
  assert.deepEqual(parseConfirms(undefined), [])
})

test('候选分隔符兼容 / 与 、', () => {
  const items = parseConfirms('【待确认:风格(摄影/插画、3D)】')
  assert.deepEqual(items[0].candidates, ['摄影', '插画', '3D'])
})

test('pickAnswerText:自定义优先,其次首个选中项,空回答 undefined', () => {
  assert.equal(pickAnswerText({ selected: ['夜景'], custom: '星空' }), '星空')
  assert.equal(pickAnswerText({ selected: ['夜景'] }), '夜景')
  assert.equal(pickAnswerText({ selected: [] }), undefined)
  assert.equal(pickAnswerText(undefined), undefined)
})

test('applyAnswers:按序代入,未答项保留原占位', () => {
  const text = '色调【待确认:色调(冷调/暖调)】,视角【待确认:视角(仰视/平视)】'
  const items = parseConfirms(text)
  const filled = applyAnswers(text, items, [
    { id: 'pwe-q-0', selected: ['暖调'] },
    { id: 'pwe-q-1', selected: [], custom: '鸟瞰' },
  ])
  assert.equal(filled, '色调暖调,视角鸟瞰')
})

test('applyAnswers:跳过项与缺失回答保留原文', () => {
  const text = 'A【待确认:x(1/2)】B【待确认:y(3/4)】'
  const items = parseConfirms(text)
  const filled = applyAnswers(text, items, [{ id: 'pwe-q-0', selected: ['2'] }])
  assert.equal(filled, 'A2B【待确认:y(3/4)】')
})

test('applyAnswers:多要素从后往前替换,索引不漂移', () => {
  const text = '【待确认:a(甲/乙)】和【待确认:b(丙/丁)】结尾'
  const items = parseConfirms(text)
  const filled = applyAnswers(text, items, [
    { id: 'pwe-q-0', selected: ['甲'] },
    { id: 'pwe-q-1', selected: ['丁'] },
  ])
  assert.equal(filled, '甲和丁结尾')
})

test('buildQuestions:契约形状与 ask_user_question 一致', () => {
  const items = parseConfirms('【待确认:色调(冷调/暖调)】')
  const qs = buildQuestions(items)
  assert.equal(qs.length, 1)
  assert.equal(qs[0].id, 'pwe-q-0')
  assert.equal(qs[0].header, '完善提示词')
  assert.ok(qs[0].question.includes('色调'))
  assert.deepEqual(qs[0].options, [{ label: '冷调' }, { label: '暖调' }])
  // 无候选 → 无 options 字段
  const qs2 = buildQuestions(parseConfirms('【待确认:要素】'))
  assert.equal('options' in qs2[0], false)
})

test('变体兼容:无方括号 + 全角冒号与括号', () => {
  const items = parseConfirms('构图待确认：构图（中远景/广角/低角度仰拍）。\n画质待确认：画质（超清/8K）')
  assert.equal(items.length, 2)
  assert.equal(items[0].element, '构图')
  assert.deepEqual(items[0].candidates, ['中远景', '广角', '低角度仰拍'])
  assert.equal(items[1].element, '画质')
  assert.deepEqual(items[1].candidates, ['超清', '8K'])
})

test('变体兼容:无方括号仅候选(半角括号)', () => {
  const items = parseConfirms('色调待确认(冷调/暖调)')
  assert.equal(items.length, 1)
  assert.deepEqual(items[0].candidates, ['冷调', '暖调'])
  assert.ok(items[0].element.length > 0)
})

test('applyAnswers 对变体形态同样按序代入', () => {
  const text = '构图待确认：构图（中远景/广角）。'
  const items = parseConfirms(text)
  const filled = applyAnswers(text, items, [{ id: 'pwe-q-0', selected: ['广角'] }])
  assert.equal(filled, '构图广角。')
})

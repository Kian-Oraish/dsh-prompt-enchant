// ============================================================================
// dsh-prompt-enhance · 设计层 v0.5.1 关键词锁定(总公式结构防误删)
// ----------------------------------------------------------------------------
// 锁定「总公式/六子模式/两部词典/四锚点/待确认规范格式协议」关键词;
// 并反向锁定:多资产正交层(【多资产复合】/资产清单)属 0.5.2,本版不得提前引入。
// 层文本升级(0.5.2 合入多资产)时,本文件的负向断言必须同步更新。
// ============================================================================
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSystemPrompt } from '../lib/modes.js'

// 从完整设计提示词中截取模式层(CORE_A 与 CORE_B 之间)
const DESIGN = buildSystemPrompt('design')
assert.ok(DESIGN !== undefined, '设计模式提示词必须可组装')
const LAYER_START = DESIGN.indexOf('【场景识别】')
const LAYER_END = DESIGN.indexOf('【硬性规则】')
assert.ok(LAYER_START > 0 && LAYER_END > LAYER_START, '模式层锚点缺失')
const LAYER = DESIGN.slice(LAYER_START, LAYER_END).trim()

test('总公式五步与六子模式关键词锁定', () => {
  assert.ok(LAYER.includes('判型→定锚→译话→补槽→成型'), '总公式五步')
  for (const kw of ['文生图', '图生图', '交互编辑', '文生视频', '图生视频', '首尾帧']) {
    assert.ok(LAYER.includes(kw), `子模式关键词缺失: ${kw}`)
  }
})

test('两部内置词典关键词锁定', () => {
  assert.ok(LAYER.includes('高级感→'), '白话翻译词典锚点')
  assert.ok(LAYER.includes('电商主图1:1'), '渠道画幅词典锚点')
})

test('四个锚点小节标题保持', () => {
  for (const anchor of ['【场景识别】', '【图像创作(文生图/图生图/交互编辑)】', '【视频创作(文生视频/图生视频/首尾帧)】', '【输出格式】']) {
    assert.ok(LAYER.includes(anchor), `锚点缺失: ${anchor}`)
  }
})

test('待确认规范格式协议与候选字符集约束锁定', () => {
  assert.ok(LAYER.includes('【待确认:要素名(候选A/候选B)】'), '规范格式')
  assert.ok(LAYER.includes('候选之间用「/」分隔'), '候选分隔符')
  assert.ok(LAYER.includes('候选内部不得使用顿号、逗号、斜杠或括号'), '字符集约束')
  assert.ok(LAYER.includes('给不出候选时写作【待确认:要素名】'), '裸标降级')
})

test('分镜/首尾帧结构钩子存在(0.5.2 多资产依赖)', () => {
  assert.ok(LAYER.includes('分镜时间轴'), '分镜时间轴')
  assert.ok(LAYER.includes('【首帧】【过渡】【尾帧】'), '首尾帧骨架')
})

test('多资产正交层尚未引入(属 0.5.2,负向锁定)', () => {
  assert.equal(LAYER.includes('【多资产复合】'), false, '多资产条文不得提前合入')
  assert.equal(LAYER.includes('资产清单'), false, '资产清单不得提前合入')
})

test('与 config/enhance-prompt.md 两源逐字一致(设计层全文)', async () => {
  const { readFile } = await import('node:fs/promises')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const here = path.dirname(fileURLToPath(import.meta.url))
  const doc = await readFile(path.join(here, '..', 'config', 'enhance-prompt.md'), 'utf8')
  const m = doc.match(/^# 模式层:设计\(design\)[\s\S]*?\n\n---/m)
  assert.ok(m, 'config 中找不到设计层小节')
  const section = m[0].replace(/^# 模式层:设计\(design\)[^\n]*\n/m, '').replace(/^> [^\n]*(\n> [^\n]*)*\n/m, '').replace(/\n\n---$/, '').trim()
  assert.equal(section, LAYER, '两源设计层文本不一致,请同步 config/enhance-prompt.md')
})

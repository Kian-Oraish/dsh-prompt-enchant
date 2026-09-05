// ============================================================================
// dsh-prompt-enhance · 【待确认】要素解析与答案代入(纯函数,宿主与测试共用)
// ----------------------------------------------------------------------------
// 形态约定(模式层文案要求模型用规范形态;解析器兼容模型常见变体):
//   规范:【待确认:要素名(候选A/候选B)】
//   变体:待确认:要素名(候选A/候选B)  /  待确认(候选A/候选B)  (半/全角标点均可)
// ============================================================================

// 三种形态:①带方括号(规范) ②无方括号带要素 ③无方括号仅候选
const CONFIRM_RE = /【待确认(?:[:：]([^()（）【】]*))?(?:[（(]([^()（）【】]*)[）)])?】|待确认[:：]\s*([^()（）【】]*)(?:[（(]([^()（）【】]*)[）)])?|待确认\s*[（(]([^()（）【】]*)[）)]/g

// 解析文本中全部待确认要素;返回按出现顺序排列的条目
// item: { n, index, raw, element, candidates[] }
export function parseConfirms(text) {
  if (typeof text !== 'string') return []
  const items = []
  CONFIRM_RE.lastIndex = 0
  let m
  while ((m = CONFIRM_RE.exec(text)) !== null) {
    const name = (m[1] !== undefined ? m[1] : (m[3] !== undefined ? m[3] : '')).trim()
    const candRaw = m[2] !== undefined ? m[2] : (m[4] !== undefined ? m[4] : (m[5] !== undefined ? m[5] : ''))
    const candidates = candRaw.split(/[\/、,，]/).map((s) => s.trim()).filter((s) => s.length > 0)
    // 要素名缺失时,取标记前最多 10 字符、去掉尾部标点括号作为回退描述
    let element = name
    if (element === '') {
      const before = text.slice(Math.max(0, m.index - 12), m.index)
      element = before.replace(/[\s(（,，。;；:：、-]+$/g, '').trim()
      if (element === '') element = '该要素'
    }
    items.push({
      n: items.length,
      index: m.index,
      raw: m[0],
      element,
      candidates,
    })
  }
  return items
}

// 从一条回答中取最终填入文本:自定义优先,其次第一个选中项;空/未答返回 undefined
export function pickAnswerText(answer) {
  if (answer === null || answer === undefined) return undefined
  if (typeof answer.custom === 'string' && answer.custom.trim().length > 0) return answer.custom.trim()
  if (Array.isArray(answer.selected) && answer.selected.length > 0 && answer.selected[0].length > 0) return answer.selected[0]
  return undefined
}

// 按序把答案代入文本对应占位(从后往前替换保索引);未作答/跳过项保留原占位
// answers: [{ id, selected, custom }],id 与出题时的 'pwe-q-<n>' 对应
export function applyAnswers(text, items, answers) {
  const byId = new Map()
  if (Array.isArray(answers)) {
    for (const a of answers) {
      if (a !== null && typeof a === 'object' && typeof a.id === 'string') byId.set(a.id, a)
    }
  }
  let out = text
  const sorted = [...items].sort((a, b) => b.index - a.index)
  for (const it of sorted) {
    const chosen = pickAnswerText(byId.get('pwe-q-' + it.n))
    if (chosen === undefined) continue
    out = out.slice(0, it.index) + chosen + out.slice(it.index + it.raw.length)
  }
  return out
}

// 构造提问卡的问题数组(与 ctx.userQuestions.ask 契约一致)
export function buildQuestions(items) {
  return items.map((it) => {
    const q = {
      id: 'pwe-q-' + it.n,
      question: `请补充「${it.element}」`,
      header: '完善提示词',
    }
    if (it.candidates.length > 0) q.options = it.candidates.map((c) => ({ label: c }))
    return q
  })
}

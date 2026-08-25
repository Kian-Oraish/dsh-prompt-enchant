// ============================================================================
// dsh-prompt-enhance · 引用记号保护(确定性纯函数,Host 与测试共用,零依赖)
// ----------------------------------------------------------------------------
// 引用记号 = 以 @ 开头的占位符(@文件名 / @文件路径 / @会话名)。
// 增强管线必须把它们当作不可触碰的占位符:逐字保留、顺序不变。
// 本模块只做字符串层面的事实计算,不含任何业务调用。
// ============================================================================

/** 引用记号扫描:@ 后随非空白 token;@ 前不得是 ASCII 单词字符/点(排除邮箱 x@y 形态)。 */
export const REF_TOKEN_RE = /(?<![A-Za-z0-9_.])@[^\s@()[\]{}「」『』"'“”,;:;,、。!?！？]+/g

/** 从文本中按出现顺序提取引用记号(含 @ 前缀)。 */
export function extractRefTokens(text) {
  if (typeof text !== 'string') return []
  const tokens = []
  REF_TOKEN_RE.lastIndex = 0
  let m
  while ((m = REF_TOKEN_RE.exec(text)) !== null) {
    const raw = m[0]
    const at = raw.indexOf('@')
    if (at >= 0) tokens.push(raw.slice(at))
  }
  return tokens
}

/** 校验 output 是否按序、逐字包含全部 tokens。 */
export function refTokensPreserved(tokens, output) {
  if (!Array.isArray(tokens) || tokens.length === 0) return true
  if (typeof output !== 'string') return false
  let from = 0
  for (const t of tokens) {
    const i = output.indexOf(t, from)
    if (i === -1) return false
    from = i + t.length
  }
  return true
}

/** 在 output 中按序定位每个 token,返回 [start, end) 数组;任一缺失返回 null。 */
export function locateRefTokens(tokens, output) {
  if (!Array.isArray(tokens)) return null
  if (typeof output !== 'string') return null
  const spans = []
  let from = 0
  for (const t of tokens) {
    const i = output.indexOf(t, from)
    if (i === -1) return null
    spans.push([i, i + t.length])
    from = i + t.length
  }
  return spans
}

/**
 * 把「原文 → 增强文」按引用记号切分为间隙(gap)序列。
 * n 个引用产生 n+1 个间隙:gap[i] 是引用 i 之前的正文段,gap[n] 是最后一个引用之后的正文段。
 * 返回 null 表示增强文未按序保留全部引用(调用方应放弃改写)。
 * 每段携带原文坐标/文本(oStart,oEnd,oText)与增强文坐标/文本(eStart,eEnd,eText)。
 */
export function splitGaps(tokens, original, enhanced) {
  if (!Array.isArray(tokens) || typeof original !== 'string' || typeof enhanced !== 'string') return null
  const oSpans = locateRefTokens(tokens, original)
  if (oSpans === null) return null
  const eSpans = locateRefTokens(tokens, enhanced)
  if (eSpans === null) return null
  const n = tokens.length
  const gaps = []
  for (let i = 0; i <= n; i++) {
    const oStart = i === 0 ? 0 : oSpans[i - 1][1]
    const oEnd = i === n ? original.length : oSpans[i][0]
    const eStart = i === 0 ? 0 : eSpans[i - 1][1]
    const eEnd = i === n ? enhanced.length : eSpans[i][0]
    gaps.push({
      oStart,
      oEnd,
      oText: original.slice(oStart, oEnd),
      eStart,
      eEnd,
      eText: enhanced.slice(eStart, eEnd),
    })
  }
  return gaps
}

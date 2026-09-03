// ============================================================================
// dsh-prompt-enhance · 模式建议标记协议(纯函数,宿主与单元测试共用)
// ----------------------------------------------------------------------------
// 模型在增强文本中可附带建议标记 [[MODE:<id>]](建议段要求放在末尾另起
// 一行)。无论标记出现在什么位置,所有合法标记一律从文本中剥离,标记
// 文本本身永不进入用户可见输出;取最后一次出现的标记作为建议。
// ============================================================================

export const SUGGEST_TAG_RE = /\[\[MODE:([a-z][a-z0-9-]*)\]\]/g

// 剥离文本中全部建议标记 → { text, suggested }
// suggested = 最后一个被剥离的模式 id;未出现任何标记时为 undefined
export function stripSuggestTags(text) {
  if (typeof text !== 'string') return { text: '', suggested: undefined }
  let suggested = undefined
  const clean = text.replace(SUGGEST_TAG_RE, (match, id) => {
    suggested = id
    return ''
  })
  return { text: clean, suggested }
}

// 剥离后的保守清理:行尾空白、多余空行、行内双空格折叠(代码围栏内
// 空格是有效内容,原样保留);最后整体 trim。
export function tidyAfterStrip(text) {
  if (typeof text !== 'string') return ''
  let t = text.replace(/[ \t]+$/gm, '')
  t = t.replace(/\n{3,}/g, '\n\n')
  const lines = t.split('\n')
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) inFence = !inFence
    if (!inFence) lines[i] = lines[i].replace(/ {2,}/g, ' ')
  }
  return lines.join('\n').trim()
}

// 终判:建议 id 必须合法(注册表内)且不同于当前模式,否则视为无建议
export function resolveSuggestion(suggested, hasMode, currentModeId) {
  if (typeof suggested !== 'string' || !hasMode(suggested)) return null
  if (suggested === currentModeId) return null
  return suggested
}

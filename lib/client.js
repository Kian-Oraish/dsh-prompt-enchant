// ============================================================================
// dsh-prompt-enhance · Client 半(磁盘常驻版,预构建 web bundle)
// ----------------------------------------------------------------------------
// 由 DSH clientModules 通过 /plugins/prompt-enhance/client.js 伺服。
// 通过组合行挂载后,输入框工具行出现星星魔法棒按钮:
//   - 图标:直接加载 Host 路由 /prompt-enhance/icons/{black|white}.png(失败回退 ✨)
//   - 增强:fetch POST /prompt-enhance/api/enhance
//   - 亮色黑星/暗色白星、呼吸等待动画、悬停提示、失败重试、撤销防误触
// v0.3.0 新增:设置后台一级栏目(新框架「设置」左侧导航)——通过槽位
// settings.section(order 19,与「提示词库」同款)+ settingsScope 服务挂载,
// 单选模式列表、即选即存;旧框架/服务缺失时静默跳过,魔棒不受影响。
// ============================================================================
window.__ModuleLoader__.load({
  id: 'dsh-prompt-enhance',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    const CSS = [
      '.pwe-wrap { display: inline-flex; align-items: center; gap: 4px; height: 100%; position: relative; }',
      '.pwe-btn {',
      '  display: inline-flex; align-items: center; justify-content: center;',
      '  width: 28px; height: 28px; padding: 0; border-radius: 8px;',
      '  border: none; background: transparent; cursor: pointer;',
      '  transition: background .15s ease, opacity .15s ease;',
      '}',
      '.pwe-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.15)); }',
      '.pwe-btn:active:not(:disabled) { background: var(--dsw-alias-interactive-bg-active, rgba(128,128,128,.22)); }',
      '.pwe-btn:disabled { opacity: .38; cursor: not-allowed; }',
      // 四角闪光星:内联 SVG(currentColor),颜色随按钮文字色,单文件双主题
      '.pwe-btn { color: var(--dsw-alias-label-primary, #1f2328); }',
      'body[data-ds-dark-theme] .pwe-btn { color: #f2f4f7; }',
      '.pwe-icon { width: 16px; height: 16px; display: block; }',
      // 忙碌动画:呼吸(缩放)+ 快速闪烁 + 按钮光晕,三重组合明确传达「工作中」
      '.pwe-btn.pwe-busy .pwe-icon,',
      '.pwe-btn.pwe-busy .pwe-emoji {',
      '  animation: pwe-breathe 1.2s ease-in-out infinite, pwe-flicker 1.2s ease-in-out infinite;',
      '}',
      '.pwe-btn.pwe-busy { animation: pwe-glow 1.2s ease-in-out infinite; }',
      '.pwe-btn.pwe-error { background: var(--dsw-alias-interactive-bg-hover-danger, rgba(229,72,77,.18)) !important; }',
      '.pwe-emoji { font-size: 15px; line-height: 1; }',
      '.pwe-btn[data-tooltip] { position: relative; }',
      '.pwe-btn[data-tooltip]::after {',
      '  content: attr(data-tooltip);',
      '  position: absolute;',
      '  bottom: calc(100% + 8px);',
      '  left: 50%;',
      '  transform: translateX(-50%) translateY(3px);',
      '  background: var(--dsw-alias-tooltip-bg, rgba(30, 32, 37, .96));',
      '  color: #ffffff;',
      '  font-size: 12px;',
      '  line-height: 1.2;',
      '  padding: 5px 9px;',
      '  border-radius: 6px;',
      '  white-space: nowrap;',
      '  opacity: 0;',
      '  pointer-events: none;',
      '  transition: opacity .15s ease, transform .15s ease;',
      '  z-index: 60;',
      '}',
      'body[data-ds-dark-theme] .pwe-btn[data-tooltip]::after { color: #f2f4f7; }',
      '.pwe-btn[data-tooltip]:hover::after,',
      '.pwe-btn[data-tooltip]:focus-visible::after {',
      '  opacity: 1;',
      '  transform: translateX(-50%) translateY(0);',
      '}',
      '.pwe-undo {',
      '  width: auto; padding: 0 8px; height: 28px; font-size: 13px;',
      '  color: var(--dsw-alias-brand-primary, #5b8def);',
      '  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12));',
      '}',
      '.pwe-undo:hover { color: var(--dsw-alias-label-primary, #e8eaed); }',
      '@keyframes pwe-breathe {',
      '  0%, 100% { transform: scale(1); }',
      '  50% { transform: scale(1.4); }',
      '}',
      '@keyframes pwe-flicker {',
      '  0%, 100% { opacity: 1; }',
      '  25%, 75% { opacity: .65; }',
      '  50% { opacity: .9; }',
      '}',
      '@keyframes pwe-glow {',
      '  0%, 100% { box-shadow: 0 0 0 0 rgba(65, 118, 230, 0); }',
      '  50% { box-shadow: 0 0 12px 3px var(--dsw-alias-brand-primary, rgba(65, 118, 230, .55)); }',
      '}',
      // ===== 设置后台 · 增强模式面板(现代视觉语言:留白/圆角/描边层次/动效节奏,绑定 DSH 主题) =====
      'body { --pwe-accent: #0071e3; --pwe-accent-soft: rgba(0, 113, 227, .14); }',
      'body[data-ds-dark-theme] { --pwe-accent: #0a84ff; --pwe-accent-soft: rgba(10, 132, 255, .24); }',
      '.pwe-panel { display: flex; flex-direction: column; gap: 14px; }',
      '.pwe-panel-head { display: flex; flex-direction: column; gap: 4px; }',
      '.pwe-panel-title { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: -0.2px; color: var(--dsw-alias-label-primary, #1d1d1f); }',
      '.pwe-panel-sub { margin: 0; font-size: 13px; color: var(--dsw-alias-label-tertiary, #6e6e73); }',
      '.pwe-modes { display: flex; flex-direction: column; gap: 10px; }',
      '.pwe-mode-row { position: relative; display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: 16px; border: 1.5px solid rgba(120, 120, 128, .22); background: var(--dsw-alias-bg-layer-2, #ffffff); cursor: pointer; transition: border-color .22s cubic-bezier(.25, .1, .25, 1), background .22s cubic-bezier(.25, .1, .25, 1), transform .15s cubic-bezier(.25, .1, .25, 1); }',
      'body[data-ds-dark-theme] .pwe-mode-row { background: #1e1f22; border-color: rgba(255, 255, 255, .10); }',
      '.pwe-mode-row:hover { background: #f7f8fa; }',
      'body[data-ds-dark-theme] .pwe-mode-row:hover { background: #242529; }',
      '.pwe-mode-row.pwe-mode-current { border-color: var(--pwe-accent, #0071e3); background: var(--pwe-accent-soft, rgba(0, 113, 227, .06)); }',
      'body[data-ds-dark-theme] .pwe-mode-row.pwe-mode-current { border-color: var(--pwe-accent, #0a84ff); background: #23272e; }',
      '.pwe-mode-row.pwe-mode-disabled { opacity: .55; cursor: not-allowed; }',
      '.pwe-mode-row:active:not(.pwe-mode-disabled) { transform: scale(.985); }',
      // 真实 radio 视觉隐藏(保留键盘可达);focus 环
      '.pwe-mode-radio { position: absolute; opacity: 0; width: 1px; height: 1px; }',
      '.pwe-mode-row:has(.pwe-mode-radio:focus-visible) { outline: 3px solid var(--pwe-accent-soft, rgba(0, 113, 227, .25)); outline-offset: 2px; }',
      // 自定义单选圆点:空心 → 实心主色内点 scale 浮现
      '.pwe-mode-dot { flex-shrink: 0; width: 20px; height: 20px; margin-top: 1px; border-radius: 50%; border: 1.5px solid rgba(120, 120, 128, .35); display: flex; align-items: center; justify-content: center; transition: border-color .2s cubic-bezier(.25, .1, .25, 1); }',
      'body[data-ds-dark-theme] .pwe-mode-dot { border-color: rgba(255, 255, 255, .3); }',
      '.pwe-mode-dot::after { content: ""; width: 10px; height: 10px; border-radius: 50%; background: var(--pwe-accent, #0071e3); transform: scale(0); transition: transform .22s cubic-bezier(.25, .1, .25, 1); }',
      '.pwe-mode-row.pwe-mode-current .pwe-mode-dot { border-color: var(--pwe-accent, #0071e3); }',
      '.pwe-mode-row.pwe-mode-current .pwe-mode-dot::after { transform: scale(1); }',
      // 模式图标
      '.pwe-mode-icon { flex-shrink: 0; width: 16px; height: 16px; margin-top: 3px; display: block; }',
      // 主区:名称 + 单行省略描述(tooltip 完整)
      '.pwe-mode-main { flex: 1; min-width: 0; }',
      '.pwe-mode-name { font-size: 15px; font-weight: 590; letter-spacing: -0.1px; color: var(--dsw-alias-label-primary, #1d1d1f); }',
      '.pwe-mode-desc { display: block; margin-top: 4px; font-size: 13px; line-height: 1.5; color: var(--dsw-alias-label-tertiary, #6e6e73); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      // 场景标签胶囊
      '.pwe-mode-tags { flex-shrink: 0; display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }',
      '.pwe-mode-tag { font-size: 11px; font-weight: 480; color: var(--dsw-alias-label-tertiary, #6e6e73); background: rgba(120, 120, 128, .12); padding: 3px 10px; border-radius: 980px; white-space: nowrap; }',
      'body[data-ds-dark-theme] .pwe-mode-tag { background: rgba(120, 120, 128, .24); }',
      // 右侧对勾:主色圆徽浮现
      '.pwe-mode-check { flex-shrink: 0; margin-top: 1px; width: 20px; height: 20px; border-radius: 50%; background: var(--pwe-accent, #0071e3); color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 12px; line-height: 1; opacity: 0; transform: scale(.5); transition: opacity .2s cubic-bezier(.25, .1, .25, 1), transform .22s cubic-bezier(.25, .1, .25, 1); }',
      '.pwe-mode-row.pwe-mode-current .pwe-mode-check { opacity: 1; transform: scale(1); }',
      // 底部状态栏:「当前生效:XX ✓」+ 变更闪动
      '.pwe-statusbar { display: flex; align-items: center; gap: 6px; padding: 12px 2px 0; border-top: .5px solid rgba(120, 120, 128, .2); font-size: 13px; color: var(--dsw-alias-label-tertiary, #6e6e73); }',
      '.pwe-statusbar b { color: var(--dsw-alias-label-primary, #1d1d1f); font-weight: 590; }',
      '.pwe-statusbar b.pwe-status-flash { animation: pwe-status-flash .4s cubic-bezier(.25, .1, .25, 1); }',
      '@keyframes pwe-status-flash { 0% { color: var(--pwe-accent, #0071e3); } 100% { color: var(--dsw-alias-label-primary, #1d1d1f); } }',
      '.pwe-status-ok { color: var(--pwe-accent, #0071e3); font-weight: 600; }',
      '.pwe-statusbar b.pwe-status-error { color: var(--dsw-alias-label-error, #e5484d); }',
      '.pwe-panel-note { margin: 0; font-size: 12px; color: var(--dsw-alias-label-tertiary, #8b909a); }',
      '@media (prefers-reduced-motion: reduce) { .pwe-mode-row, .pwe-mode-dot, .pwe-mode-dot::after, .pwe-mode-check, .pwe-statusbar b { transition: none !important; animation: none !important; } }',
      // 设置导航栏目图标(替换框架默认齿轮的星星)
      '.pwe-nav-star { width: 16px; height: 16px; display: block; flex: none; }',
      // ===== 模式建议提示条(锚定在魔棒按钮正上方,明暗双主题) =====
      '.pwe-suggest { position: absolute; right: 0; bottom: calc(100% + 8px); z-index: 90; display: flex; align-items: center; gap: 8px; width: max-content; max-width: min(440px, calc(100vw - 32px)); padding: 8px 12px; border-radius: 10px; background: #ffffff; border: 1px solid rgba(31, 35, 40, .14); color: #1f2328; font-size: 12.5px; line-height: 1.45; box-shadow: 0 8px 24px rgba(0, 0, 0, .16); }',
      'body[data-ds-dark-theme] .pwe-suggest { background: #2b2f36; border-color: rgba(255, 255, 255, .14); color: #f2f4f7; box-shadow: 0 8px 24px rgba(0, 0, 0, .45); }',
      '.pwe-suggest-text { flex: 1; min-width: 0; }',
      '.pwe-suggest-btn { flex: none; cursor: pointer; border: none; border-radius: 6px; padding: 4px 10px; font-size: 12px; line-height: 1.5; font-family: inherit; }',
      '.pwe-suggest-switch { background: var(--pwe-accent, #0071e3); color: #ffffff; }',
      '.pwe-suggest-switch:disabled { opacity: .6; cursor: default; }',
      '.pwe-suggest-ignore { background: transparent; color: #6b7280; }',
      '.pwe-suggest-ignore:hover { color: #1f2328; }',
      'body[data-ds-dark-theme] .pwe-suggest-ignore { color: #9aa3ae; }',
      'body[data-ds-dark-theme] .pwe-suggest-ignore:hover { color: #f2f4f7; }',
      '.pwe-suggest-icon { flex: none; display: block; }',
    ].join('\n')

    // 从会话快照提取最近几轮 user/assistant 文本(只取叶子标量,构造自有 JSON)
    function extractHistory(snapshot) {
      const history = []
      if (snapshot === null || snapshot === undefined || !Array.isArray(snapshot.nodes)) return history
      const nodes = snapshot.nodes
      let budget = 6000
      for (let i = nodes.length - 1; i >= 0 && history.length < 8 && budget > 0; i--) {
        const node = nodes[i]
        if (node === null || node === undefined) continue
        let text = ''
        if (node.kind === 'user' || node.kind === 'steering') {
          if (Array.isArray(node.content)) {
            for (const b of node.content) {
              if (b !== null && b !== undefined && b.type === 'text' && typeof b.text === 'string') text += b.text
            }
          }
        } else if (node.kind === 'assistant') {
          if (Array.isArray(node.blocks)) {
            for (const b of node.blocks) {
              if (b !== null && b !== undefined && b.kind === 'text' && typeof b.text === 'string') text += b.text
            }
          }
        } else {
          continue
        }
        const trimmed = text.trim()
        if (trimmed.length === 0) continue
        const piece = trimmed.slice(0, 800)
        history.unshift({ role: node.kind === 'assistant' ? 'assistant' : 'user', text: piece })
        budget -= piece.length
      }
      return history
    }

    async function enhanceRpc(text, history, sessionId) {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
      const timeoutId = setTimeout(() => { if (controller !== undefined) controller.abort() }, 150000)
      try {
        const body = { text, history }
        if (typeof sessionId === 'string' && sessionId.length > 0) body.sessionId = sessionId
        const res = await fetch('/prompt-enhance/api/enhance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller !== undefined ? controller.signal : undefined,
        })
        if (!res.ok) {
          let detail = ''
          try { detail = await res.text() } catch (err) { /* 忽略 */ }
          throw new Error('增强服务返回 ' + res.status + (detail.length > 0 ? ':' + detail.slice(0, 120) : ''))
        }
        return await res.json()
      } finally {
        clearTimeout(timeoutId)
      }
    }

    // ==================== 引用记号保护(客户端) ====================
    // 引用(@文件名/@路径/@会话名)在草稿中以 occurrence 形式挂载;整稿替换会
    // 破坏 occurrence 表(状态丢失 + 发送时无法序列化)。因此:
    //   1. 增强结果必须按序、逐字包含全部引用记号(与 Host 校验一致,双保险);
    //   2. 回填按「间隙」分段替换:只替换引用记号之间的正文段,引用及其状态不动。

    // 按序定位 token([start, end) 数组);任一缺失返回 null
    function locateTokens(tokens, text) {
      if (!Array.isArray(tokens) || typeof text !== 'string') return null
      const spans = []
      let from = 0
      for (const t of tokens) {
        const i = text.indexOf(t, from)
        if (i === -1) return null
        spans.push([i, i + t.length])
        from = i + t.length
      }
      return spans
    }

    // 从草稿与 occurrence 表提取引用记号(相对 textPart 的坐标),失败返回 null
    function buildRefs(draft, textPart, cmdPrefixLen, occurrences) {
      if (!Array.isArray(occurrences) || occurrences.length === 0) return { refs: [], ok: true }
      const refs = []
      for (const o of occurrences) {
        if (o === null || typeof o !== 'object') return { refs: null, ok: false }
        if (typeof o.offset !== 'number' || typeof o.length !== 'number' || o.length <= 0) return { refs: null, ok: false }
        const tpStart = o.offset - cmdPrefixLen
        const tpEnd = tpStart + o.length
        if (tpStart < 0 || tpEnd > textPart.length) return { refs: null, ok: false }
        refs.push({ text: textPart.slice(tpStart, tpEnd), tpStart, tpEnd })
      }
      refs.sort((a, b) => a.tpStart - b.tpStart)
      return { refs, ok: true }
    }

    // 右→左逐间隙替换(左段坐标不受右段长度变化影响);跳过内容未变的间隙
    function applyGapEdits(actions, draftNow, cmdPrefixLen, textPartLen, refs, enhanced) {
      const spans = locateTokens(refs.map((r) => r.text), enhanced)
      if (spans === null) return false
      const n = refs.length
      for (let i = n; i >= 0; i--) {
        const gsTp = i === 0 ? 0 : refs[i - 1].tpEnd
        const geTp = i === n ? textPartLen : refs[i].tpStart
        const es = i === 0 ? 0 : spans[i - 1][1]
        const ee = i === n ? enhanced.length : spans[i][0]
        const gapText = enhanced.slice(es, ee)
        const gs = cmdPrefixLen + gsTp
        const ge = cmdPrefixLen + geTp
        if (draftNow.slice(gs, ge) === gapText) continue
        draftNow = draftNow.slice(0, gs) + gapText + draftNow.slice(ge)
        actions.setDraft(draftNow)
      }
      return true
    }

    // 撤销:以当前(增强后)坐标为基准,把各间隙恢复为原文
    function applyUndoGaps(actions, draftNow, cmdPrefixLen, textPartNow, refTexts, origGapTexts) {
      const spans = locateTokens(refTexts, textPartNow)
      if (spans === null) return false
      const n = refTexts.length
      for (let i = n; i >= 0; i--) {
        const gsTp = i === 0 ? 0 : spans[i - 1][1]
        const geTp = i === n ? textPartNow.length : spans[i][0]
        const gs = cmdPrefixLen + gsTp
        const ge = cmdPrefixLen + geTp
        const gapText = origGapTexts[i]
        if (draftNow.slice(gs, ge) === gapText) continue
        draftNow = draftNow.slice(0, gs) + gapText + draftNow.slice(ge)
        actions.setDraft(draftNow)
      }
      return true
    }

    // 四角闪光星 · 内联 SVG(currentColor):随按钮文字色自动适配明暗主题(assets/icons/sparkle.svg)
    const SPARKLE_PATH = "M883.2,512.0 L861.2,524.2 L821.1,533.6 L790.0,541.2 L767.2,547.9 L749.1,553.8 L734.1,559.2 L721.4,564.2 L710.7,569.0 L700.9,573.4 L692.3,577.6 L684.5,581.7 L677.4,585.7 L671.3,589.7 L665.5,593.6 L659.7,597.2 L654.5,601.1 L649.6,604.8 L644.9,608.6 L640.5,612.4 L636.0,616.1 L631.7,619.8 L627.6,623.7 L623.8,627.8 L620.0,631.9 L616.0,635.9 L612.2,640.2 L608.5,644.8 L604.8,649.6 L600.9,654.3 L597.1,659.4 L593.6,665.4 L589.8,671.5 L585.9,678.0 L581.9,684.9 L577.6,692.3 L573.3,700.5 L568.9,710.4 L564.1,721.0 L559.1,733.7 L553.7,748.7 L547.8,766.7 L541.2,789.6 L533.6,821.0 L524.2,861.6 L512.0,883.2 L499.8,861.2 L490.4,821.1 L482.8,790.0 L476.1,767.2 L470.2,749.1 L464.8,734.1 L459.8,721.4 L455.0,710.7 L450.6,700.9 L446.4,692.3 L442.3,684.5 L438.3,677.4 L434.3,671.3 L430.4,665.5 L426.7,659.8 L422.9,654.5 L419.2,649.6 L415.4,644.9 L411.6,640.5 L407.9,636.0 L404.2,631.7 L400.3,627.6 L396.2,623.8 L392.1,620.0 L388.1,616.0 L383.8,612.2 L379.2,608.5 L374.4,604.8 L369.7,600.9 L364.4,597.2 L358.6,593.6 L352.5,589.8 L346.0,585.9 L339.1,581.9 L331.7,577.6 L323.5,573.3 L313.6,568.9 L303.0,564.1 L290.3,559.1 L275.3,553.7 L257.3,547.8 L234.4,541.2 L203.0,533.6 L162.4,524.2 L140.8,512.0 L162.8,499.8 L202.9,490.4 L234.0,482.8 L256.8,476.1 L274.9,470.2 L289.9,464.8 L302.6,459.8 L313.3,455.0 L323.1,450.6 L331.7,446.4 L339.5,442.3 L346.6,438.3 L352.7,434.3 L358.5,430.4 L364.3,426.8 L369.5,422.9 L374.4,419.2 L379.1,415.4 L383.5,411.6 L388.0,407.9 L392.3,404.2 L396.4,400.3 L400.2,396.2 L404.0,392.1 L408.0,388.1 L411.8,383.8 L415.5,379.2 L419.2,374.4 L423.1,369.7 L426.9,364.6 L430.4,358.6 L434.2,352.5 L438.1,346.0 L442.1,339.1 L446.4,331.7 L450.7,323.5 L455.1,313.6 L459.9,303.0 L464.9,290.3 L470.3,275.3 L476.2,257.3 L482.8,234.4 L490.4,203.0 L499.8,162.4 L512.0,140.8 L524.2,162.8 L533.6,202.9 L541.2,234.0 L547.9,256.8 L553.8,274.9 L559.2,289.9 L564.2,302.6 L569.0,313.3 L573.4,323.1 L577.6,331.7 L581.7,339.5 L585.7,346.6 L589.7,352.7 L593.6,358.5 L597.2,364.3 L601.1,369.5 L604.8,374.4 L608.6,379.1 L612.4,383.5 L616.1,388.0 L619.8,392.3 L623.7,396.4 L627.8,400.2 L631.9,404.0 L635.9,408.0 L640.2,411.8 L644.8,415.5 L649.6,419.2 L654.3,423.1 L659.4,426.9 L665.4,430.4 L671.5,434.2 L678.0,438.1 L684.9,442.1 L692.3,446.4 L700.5,450.7 L710.4,455.1 L721.0,459.9 L733.7,464.9 L748.7,470.3 L766.7,476.2 L789.6,482.8 L821.0,490.4 L861.6,499.8 Z"
    // 星含画笔(设计模式图标,S2,来自 starbrush.svg,v6 指南):
    // currentColor + fill-rule="evenodd"(右上凹弧负空间画笔,4 个子路径:外形 + 3 道缝隙,必须保留)
    // 吉祥物星(设计模式图标,T8,来自 design.svg,v7 指南):
    // currentColor + fill-rule="evenodd"(表情孔/画笔/色板负空间,必须保留)
    const DESIGN_PATH = "M506 117L521 117L538 130L555 162L584 231L605 271L636 317L669 352L711 385L761 413L886 460L904 473L911 488L909 503L896 519L869 534L790 567L736 596L683 635L658 659L642 679L658 696L667 701L678 685L712 656L740 642L770 634L787 632L821 634L856 647L875 662L883 672L890 687L893 708L889 730L881 748L866 768L851 780L856 789L856 798L848 816L839 825L819 836L789 839L768 831L760 821L728 821L701 814L675 799L660 782L653 762L633 750L609 728L585 776L542 886L533 898L520 905L503 903L487 886L439 768L419 729L394 692L363 729L331 760L298 785L270 800L275 831L275 849L268 857L262 856L257 851L239 809L226 809L209 802L200 792L194 778L195 750L200 741L216 728L208 698L213 688L204 686L194 677L187 660L187 637L193 606L199 606L209 613L225 629L235 646L237 668L234 677L227 685L237 687L250 724L261 723L269 726L281 718L326 677L345 655L351 644L319 616L273 586L225 562L135 523L120 510L114 496L117 479L132 464L164 450L237 425L281 405L325 378L363 346L391 315L412 285L442 231L485 135L495 123L506 117Z M401 444L385 450L378 457L371 473L371 487L376 500L386 511L395 515L408 516L419 512L431 501L436 490L437 474L432 460L424 451L413 445L401 444Z M619 444L606 448L596 457L589 474L589 486L594 500L603 510L613 515L627 516L639 511L649 501L654 489L655 475L651 462L641 450L631 445L619 444Z M445 533L438 538L437 547L452 565L475 578L504 585L530 584L554 577L574 565L589 548L587 536L577 533L571 537L567 545L547 558L525 564L502 564L473 555L457 542L455 536L445 533Z M766 660L750 666L740 681L742 692L748 698L759 702L770 702L784 697L796 683L795 672L788 664L778 660L766 660Z M699 734L688 740L684 747L684 755L689 763L702 766L709 764L717 757L720 745L714 736L699 734Z M842 682L835 684L829 690L827 701L835 711L849 713L860 707L863 694L857 685L842 682Z M749 762L736 769L733 782L740 791L755 793L764 788L768 774L761 764L749 762Z M817 731L805 739L804 752L814 760L829 760L838 752L838 740L830 732L817 731Z"
    // 粒子生成星(设置目录图标,T7,来自 genstar.svg,v7 指南):
    // currentColor + fill-rule="evenodd"(粒子点阵负空间,必须保留)
    const GENSTAR_PATH = "M662 219L675 290L689 338L713 389L739 425L767 452L811 480L868 502L908 511L849 528L804 548L763 575L733 605L706 645L690 681L674 737L663 805L646 721L626 665L621 655L616 658L607 658L602 653L602 644L611 636L599 619L591 630L585 632L577 629L573 624L574 611L580 606L587 606L586 602L575 596L570 587L563 598L559 600L548 598L543 592L542 585L545 578L552 572L540 562L532 569L518 567L513 559L515 548L512 546L510 555L504 563L500 565L487 563L482 557L480 548L483 541L490 535L478 528L473 527L471 530L462 531L452 526L446 518L441 525L430 528L422 524L417 514L420 504L428 498L437 498L446 507L450 501L461 495L476 498L489 491L481 482L481 473L489 463L500 462L506 465L511 473L510 481L514 480L513 468L520 459L532 458L540 465L552 455L543 447L543 437L549 430L560 429L567 434L570 440L580 428L586 425L573 416L573 405L578 399L587 397L596 403L598 409L610 392L602 385L603 374L608 370L617 370L620 373L623 367L633 344L648 295L662 219Z M460 463L471 464L479 474L477 486L467 493L456 491L449 480L452 469L460 463Z M459 533L473 535L479 544L477 555L466 563L456 561L449 551L451 540L459 533Z M431 463L439 465L446 474L443 487L435 492L424 490L418 482L420 470L431 463Z M429 533L441 536L445 543L445 552L442 557L432 562L424 560L418 552L419 540L429 533Z M522 572L533 573L539 581L539 590L531 599L520 599L513 592L513 580L522 572Z M522 429L531 429L539 437L539 448L529 456L519 454L513 447L513 438L522 429Z M492 430L503 432L509 442L506 452L499 457L487 455L482 448L483 437L492 430Z M460 570L471 571L477 578L478 585L475 592L467 597L458 596L451 587L453 575L460 570Z M494 570L502 572L508 580L507 591L498 598L486 595L482 589L484 576L494 570Z M396 499L406 500L413 510L412 519L403 526L396 526L387 518L387 508L396 499Z M461 431L471 433L477 440L475 452L468 457L460 457L452 449L452 439L461 431Z M399 533L407 535L413 546L411 553L403 559L394 558L387 549L390 538L399 533Z M396 467L406 468L413 478L411 487L404 492L396 492L388 484L388 475L396 467Z M551 605L561 606L567 614L565 625L558 630L547 628L542 620L544 610L551 605Z M427 570L440 572L444 580L442 589L433 595L423 592L419 585L420 576L427 570Z M428 432L439 434L444 441L442 451L434 457L425 455L420 449L420 440L428 432Z M551 399L559 399L567 407L567 415L559 423L551 423L543 416L543 407L551 399Z M366 500L376 503L380 510L377 521L369 525L360 522L356 515L358 506L366 500Z M522 606L531 607L537 615L535 625L528 630L522 630L514 623L514 614L522 606Z M491 605L498 605L506 612L505 623L496 629L488 627L483 620L485 610L491 605Z M368 468L376 471L380 478L378 487L372 492L361 490L357 484L359 473L368 468Z M364 534L373 534L379 540L380 548L372 557L361 555L357 549L357 542L364 534Z M461 604L471 606L475 612L473 623L467 627L457 626L453 621L453 611L461 604Z M521 400L532 402L536 408L534 418L527 423L519 422L513 414L514 406L521 400Z M490 401L499 401L505 407L506 415L499 423L490 423L483 416L483 409L490 401Z M334 501L344 503L348 510L347 518L340 524L334 524L326 517L326 509L334 501Z M460 401L469 402L474 408L473 419L465 424L458 423L452 414L454 406L460 401Z M397 566L405 567L411 574L411 581L404 588L396 588L389 581L391 570L397 566Z M396 438L407 440L411 447L409 455L403 460L396 460L389 453L389 445L396 438Z M430 605L439 607L443 614L441 623L434 627L426 626L421 619L423 609L430 605Z M581 369L590 371L594 378L592 386L585 391L575 388L572 382L574 374L581 369Z M430 402L438 404L442 409L441 419L434 424L427 423L422 418L422 409L430 402Z M581 638L586 638L593 644L592 654L585 659L580 659L573 653L574 643L581 638Z M367 566L373 567L378 573L378 581L371 587L363 586L358 578L361 569L367 566Z M364 440L372 440L378 446L378 453L373 459L366 460L359 455L358 447L364 440Z M304 503L311 503L317 510L317 516L312 522L303 522L297 516L299 506L304 503Z M334 536L344 538L347 543L347 549L342 555L335 556L328 551L327 543L334 536Z M334 470L341 470L347 476L347 483L341 489L334 489L328 484L328 476L334 470Z M397 409L405 410L409 414L409 423L404 428L396 428L391 424L390 416L397 409Z M396 599L404 599L408 602L410 610L407 616L397 618L392 615L390 607L396 599Z M550 370L557 370L562 374L563 382L557 389L550 389L544 384L544 376L550 370Z M551 639L559 641L562 645L562 652L556 658L547 657L543 650L545 643L551 639Z M461 638L467 639L472 646L471 653L466 657L457 656L453 649L454 643L461 638Z M491 639L498 640L502 645L502 653L496 658L490 658L484 652L485 643L491 639Z M520 371L526 371L532 376L532 385L526 390L517 388L514 383L514 378L520 371Z M364 600L372 600L376 603L377 613L374 617L361 616L359 605L364 600Z M304 536L311 537L316 543L314 552L309 555L300 553L297 547L298 541L304 536Z M520 640L526 640L532 646L531 655L524 659L517 657L514 653L514 646L520 640Z M274 503L279 504L284 511L283 518L278 522L272 522L266 517L267 507L274 503Z M491 371L499 373L502 377L502 384L494 390L487 388L484 383L485 376L491 371Z M303 471L312 472L316 478L314 486L309 489L302 488L298 483L298 476L303 471Z M368 408L377 414L375 424L369 427L362 425L359 420L361 411L368 408Z M459 371L465 371L471 377L471 383L465 389L459 389L454 385L454 376L459 371Z M335 441L343 442L347 448L345 456L340 459L333 458L329 453L329 447L335 441Z M335 567L342 568L346 573L346 579L340 585L333 584L329 579L329 573L335 567Z M273 537L283 540L284 549L279 554L273 554L267 548L269 539L273 537Z M302 571L309 571L314 576L314 582L308 588L301 587L297 582L297 576L302 571Z M272 472L279 472L284 479L282 486L278 489L272 489L267 484L267 477L272 472Z M428 375L435 375L440 381L439 388L434 392L427 391L423 386L423 381L428 375Z M398 379L406 381L409 387L408 392L403 396L397 396L392 391L392 384L398 379Z M303 437L308 437L313 441L313 450L308 454L299 452L297 448L298 441L303 437Z M239 505L246 505L251 511L246 521L239 521L234 515L239 505Z M333 406L340 407L344 412L343 419L337 423L328 418L328 411L333 406Z M334 600L339 601L344 609L338 617L333 617L327 612L328 604L334 600Z M428 643L434 643L439 648L438 656L433 659L428 659L423 654L423 648L428 643Z M398 630L404 631L408 636L408 641L403 646L397 646L392 642L392 635L398 630Z M581 340L590 344L590 352L586 356L579 356L575 352L575 345L581 340Z M366 376L373 377L376 381L376 386L372 391L364 391L361 388L361 380L366 376Z M580 673L585 673L590 678L590 683L585 688L579 688L575 683L575 678L580 673Z M239 472L248 475L249 482L246 486L236 485L234 478L239 472Z M239 539L244 539L249 544L248 551L243 554L236 552L234 547L239 539Z M366 636L374 638L376 642L375 647L369 651L364 650L361 646L361 640L366 636Z M489 675L497 676L499 679L497 687L491 689L486 686L485 679L489 675Z M269 569L275 571L277 575L273 583L266 583L263 579L264 572L269 569Z M271 412L277 412L281 416L281 421L277 425L268 422L267 417L271 412Z M273 600L278 601L281 605L281 610L276 614L268 611L268 604L273 600Z M489 342L495 342L499 346L499 351L495 355L489 355L486 352L486 345L489 342Z M266 442L271 442L275 446L272 455L265 455L262 451L262 446L266 442Z M520 341L528 345L528 351L523 355L518 354L515 349L516 344L520 341Z M459 676L467 680L467 685L463 689L457 689L454 686L454 680L459 676Z M519 675L525 675L528 678L528 684L524 688L516 685L515 680L519 675Z M207 507L214 507L217 510L217 516L214 519L207 519L204 516L207 507Z M550 675L557 679L557 685L552 689L545 685L545 679L550 675Z M457 339L466 341L465 350L457 351L454 348L457 339Z M550 341L557 345L557 350L553 354L545 351L545 345L550 341Z M301 632L307 632L310 636L309 641L305 644L299 643L297 639L301 632Z M333 348L338 348L342 352L340 359L333 360L330 357L330 351L333 348Z M302 381L307 382L310 386L307 393L298 391L298 384L302 381Z M241 638L248 643L244 650L236 648L236 641L241 638Z M399 348L406 352L403 360L397 360L394 357L395 350L399 348Z M333 663L341 665L340 673L330 672L330 666L333 663Z M213 574L220 578L220 583L216 586L210 585L208 581L213 574Z M399 667L406 671L403 679L397 679L394 675L394 671L399 667Z M238 376L247 378L248 382L245 386L236 385L238 376Z M154 507L162 511L159 518L153 518L150 514L154 507Z M211 441L219 443L218 451L213 452L209 449L211 441Z M611 678L619 681L616 689L609 687L608 682L611 678Z M613 339L619 342L616 350L609 347L609 342L613 339Z M429 340L436 343L433 350L426 347L429 340Z M181 476L188 478L187 485L179 484L178 479L181 476Z M180 538L187 539L186 547L182 548L178 545L180 538Z M115 508L122 511L118 518L112 515L112 510L115 508Z M491 309L497 311L497 317L494 319L488 316L491 309Z M490 711L497 714L494 721L488 719L490 711Z M156 442L163 444L161 451L154 449L156 442Z M547 309L554 310L555 314L552 318L546 317L547 309Z M548 713L554 714L554 721L546 720L548 713Z M159 574L163 576L162 583L156 583L154 580L159 574Z M428 697L435 701L431 706L425 703L428 697Z"
    // 模式 → 图标(设计模式用星含画笔;其余一律四角闪光星)
    const MODE_ICONS = {
      generic: { d: SPARKLE_PATH, fillRule: undefined },
      design: { d: DESIGN_PATH, fillRule: 'evenodd' },
    }
    function modeIconDef(modeId) {
      return MODE_ICONS[modeId] !== undefined ? MODE_ICONS[modeId] : MODE_ICONS.generic
    }
    function StarIcon(props) {
      const def = props !== undefined && props !== null && typeof props.def === 'object' && props.def !== null ? props.def : MODE_ICONS.generic
      const pathProps = { d: def.d, fill: 'currentColor' }
      if (def.fillRule !== undefined) pathProps.fillRule = def.fillRule
      return React.createElement('svg', {
        viewBox: '0 0 1024 1024',
        width: props !== undefined && props !== null && typeof props.size === 'number' ? props.size : 16,
        height: props !== undefined && props !== null && typeof props.size === 'number' ? props.size : 16,
        className: props !== undefined && props !== null && typeof props.className === 'string' ? props.className : 'pwe-icon',
        'aria-hidden': 'true',
      }, React.createElement('path', pathProps))
    }

    // ==================== 模式建议共享店(魔棒按钮 ⇄ 建议提示条) ====================
    // suggestion = 建议的模式 id;modeLabel = 双语名称;draftKey = 增强后草稿
    // (用户一编辑草稿即不匹配 → 提示条自动消失);baseText/cmdPrefix 供自动
    // 重跑;dismissedKey = 被忽略的草稿(同草稿不再提示);undo = 重跑成功后
    // 通知魔棒更新撤销链的事件。
    let suggestSnap = { suggestion: null, modeLabel: null, draftKey: '', baseText: '', cmdPrefix: '', dismissedKey: '', undo: null, currentMode: 'generic' }
    const suggestListeners = new Set()
    const suggestStore = {
      getSnapshot: () => suggestSnap,
      subscribe: (cb) => { suggestListeners.add(cb); return () => { suggestListeners.delete(cb) } },
      publish: (patch) => {
        let changed = false
        for (const key of Object.keys(patch)) {
          if (patch[key] !== suggestSnap[key]) { changed = true; break }
        }
        if (!changed) return
        suggestSnap = Object.assign({}, suggestSnap, patch)
        for (const cb of [...suggestListeners]) { try { cb() } catch (err) { /* 渲染侧异常不扩散 */ } }
      },
    }

    function EnhanceButton(props) {
      const hooked = typeof props.useInput === 'function' ? props.useInput((s) => s) : undefined
      const inputState = hooked !== undefined && hooked !== null && typeof hooked === 'object'
        ? hooked
        : (props.input !== undefined && props.input !== null ? props.input : null)
      // 框架版本兼容:0.1.2-alpha.2 起标准 props 移除 useSession(改为 useConversation,
      // 其快照仅含 views/activeTargets,不含消息历史)。优先旧版 useSession;
      // 若新版 useConversation 快照未来含 nodes 亦兼容;都没有则历史为空(单轮增强)。
      const sessionHooked = typeof props.useSession === 'function' ? props.useSession((s) => s) : undefined
      const convHooked = typeof props.useConversation === 'function' ? props.useConversation((s) => s) : undefined
      const session = sessionHooked !== undefined && sessionHooked !== null && typeof sessionHooked === 'object'
        ? sessionHooked
        : (convHooked !== undefined && convHooked !== null && Array.isArray(convHooked.nodes) ? convHooked
          : (props.session !== undefined && props.session !== null ? props.session : null))
      const newFramework = typeof props.useSession !== 'function' && typeof props.useConversation === 'function'

      const draft = inputState !== null && inputState !== undefined && typeof inputState.draft === 'string' ? inputState.draft : ''
      const phase = inputState !== null && inputState !== undefined && typeof inputState.phase === 'string' ? inputState.phase : 'plain'
      const claim = inputState !== null && inputState !== undefined && inputState.claim !== undefined && inputState.claim !== null && typeof inputState.claim.token === 'string'
        ? inputState.claim
        : null
      const actions = props.inputActions

      // 命令声明态(/plan、/goal 等):claim.token 是「完整性受监控的草稿前缀」
      // (含斜杠与尾随空格,如 '/goal '),破坏 startsWith 即释放声明。
      // 只增强前缀之后的正文;回填时保留完整前缀,声明与命令显示原样保留。
      const claimed = phase === 'claimed' && claim !== null
      let cmdPrefix = ''
      let cmdBroken = false
      if (claimed) {
        if (draft.startsWith(claim.token)) cmdPrefix = claim.token
        else cmdBroken = true
      }
      const textPart = claimed && !cmdBroken ? draft.slice(cmdPrefix.length) : draft

      // 引用记号(@文件/@路径/@会话名):从 occurrence 表提取,与草稿正文对齐
      const occurrences = inputState !== null && inputState !== undefined && Array.isArray(inputState.occurrences)
        ? inputState.occurrences
        : []
      const refsBuild = buildRefs(draft, textPart, cmdPrefix.length, occurrences)
      const refs = refsBuild.ok ? refsBuild.refs : null

      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [original, setOriginal] = React.useState(null)
      const [lastEnhanced, setLastEnhanced] = React.useState(null)
      const [showUndo, setShowUndo] = React.useState(false)
      const [undoPlan, setUndoPlan] = React.useState(null)

      // 撤销按钮常驻:不再自动消失,直到草稿被编辑或消息发送(草稿清空)为止。
      // 发送/清空草稿后清理状态;编辑导致的隐藏由 undoActive 的 draft 比对守卫完成。
      React.useEffect(() => {
        if (draft === '') {
          setOriginal(null)
          setLastEnhanced(null)
          setShowUndo(false)
          setUndoPlan(null)
        }
      }, [draft])

      // 建议提示条「切换」自动重跑成功后,同步本按钮的撤销链(撤销恢复原始输入)
      const undoSeqRef = React.useRef(null)
      React.useEffect(() => suggestStore.subscribe(() => {
        const snap = suggestStore.getSnapshot()
        if (snap.undo !== null && snap.undo !== undefined && snap.undo.seq !== undoSeqRef.current) {
          undoSeqRef.current = snap.undo.seq
          setOriginal(snap.undo.original)
          setLastEnhanced(snap.undo.enhanced)
          setUndoPlan(null)
          setShowUndo(true)
        }
      }), [])

      // 新框架(0.1.2-alpha.2+)引用保护:其输入机为 Lexical 编辑器,setDraft(纯文本)
      // 会把引用 chip 重建为样式化文本(TextRef),不再进 occurrence 表 → 发送时不再注入
      // 文件内容;且公开 API 无引用重插动词。为保护引用完整性,含 occurrence 引用时禁用增强。
      const refGuardBlocked = newFramework && refs !== null && refs.length > 0

      // 空闲态与命令声明态均可增强;判定/提交中禁用;命令标记无法定位时禁用(保护命令)
      const disabled = busy || draft.trim().length === 0
        || (phase !== 'plain' && phase !== 'claimed')
        || cmdBroken
        || refGuardBlocked
        || (claimed && textPart.trim().length === 0)

      const sessionId = typeof props.pweSessionId === 'string' && props.pweSessionId.length > 0
        ? props.pweSessionId
        : (typeof props.sessionId === 'string' ? props.sessionId : undefined)

      const handleClick = async () => {
        if (disabled) return
        setBusy(true)
        setError('')
        // 新一次增强:收起旧建议提示条
        suggestStore.publish({ suggestion: null })
        try {
          const history = extractHistory(session)
          const result = await enhanceRpc(textPart, history, sessionId)
          if (result !== null && result !== undefined && result.ok === true && typeof result.enhanced === 'string' && result.enhanced.trim().length > 0) {
            const enhanced = result.enhanced
            if (enhanced === textPart) {
              // Host 引用保护兜底回退原文:本次不改写草稿
              setError('增强结果未能保留 @ 引用,本次未改写草稿(请重试)')
              return
            }
            if (refs !== null && refs.length > 0) {
              // 客户端二次校验:增强文必须按序逐字包含全部引用记号
              if (locateTokens(refs.map((r) => r.text), enhanced) === null) {
                setError('增强结果未能保留 @ 引用,已取消改写(请重试)')
                return
              }
            }
            setOriginal(textPart)
            setLastEnhanced(enhanced)
            setShowUndo(true)
            if (actions !== undefined && typeof actions.setDraft === 'function') {
              if (refs !== null && refs.length > 0) {
                // 间隙分段回填:引用记号及其状态(occurrence)原样保留
                const n = refs.length
                const origGapTexts = []
                for (let i = 0; i <= n; i++) {
                  const gsTp = i === 0 ? 0 : refs[i - 1].tpEnd
                  const geTp = i === n ? textPart.length : refs[i].tpStart
                  origGapTexts.push(textPart.slice(gsTp, geTp))
                }
                setUndoPlan({ refTexts: refs.map((r) => r.text), origGapTexts })
                applyGapEdits(actions, draft, cmdPrefix.length, textPart.length, refs, enhanced)
                // 间隙回填草稿无法用单一 draftKey 描述,含引用草稿不出建议提示条
              } else {
                actions.setDraft(cmdPrefix + enhanced)
                // 模式建议:宿主判定合法且 ≠ 当前模式才返回;draftKey 用增强后草稿
                // (用户一编辑即不匹配 → 提示条自动消失;被忽略过的草稿不再提示)
                if (typeof result.suggestedMode === 'string' && result.suggestedMode.length > 0) {
                  const nextDraft = cmdPrefix + enhanced
                  const prev = suggestStore.getSnapshot()
                  suggestStore.publish({
                    suggestion: result.suggestedMode,
                    modeLabel: result.suggestedModeLabel !== undefined && result.suggestedModeLabel !== null
                      ? result.suggestedModeLabel
                      : { zh: result.suggestedMode, en: result.suggestedMode },
                    draftKey: nextDraft,
                    baseText: textPart,
                    cmdPrefix,
                    dismissedKey: prev.dismissedKey === nextDraft ? nextDraft : '',
                  })
                }
              }
            }
          } else {
            const msg = result !== null && result !== undefined && typeof result.error === 'string' && result.error.length > 0
              ? result.error
              : '增强失败,请重试'
            throw new Error(msg)
          }
        } catch (err) {
          const isAbort = err !== null && err !== undefined && (err.name === 'AbortError' || String(err).includes('aborted'))
          setError(isAbort ? '增强超时,请重试' : (err instanceof Error ? err.message : String(err)))
        } finally {
          setBusy(false)
        }
      }

      const handleUndo = () => {
        // 判定/提交期间不写草稿;空闲态与命令声明态允许撤销(命令前缀原样保留)
        if (phase !== 'plain' && phase !== 'claimed') return
        if (original !== null && actions !== undefined && typeof actions.setDraft === 'function') {
          if (undoPlan !== null && Array.isArray(undoPlan.refTexts) && undoPlan.refTexts.length > 0) {
            // 间隙回填撤销:引用记号不动,各间隙恢复原文
            applyUndoGaps(actions, draft, cmdPrefix.length, textPart, undoPlan.refTexts, undoPlan.origGapTexts)
          } else {
            actions.setDraft(cmdPrefix + original)
          }
        }
        setOriginal(null)
        setLastEnhanced(null)
        setShowUndo(false)
        setUndoPlan(null)
      }

      // 撤销常驻(直到编辑/发送);空闲态与命令声明态均可撤销,正文比对防误触
      const undoActive = (phase === 'plain' || phase === 'claimed') && showUndo && original !== null && lastEnhanced !== null && textPart === lastEnhanced
      const undoBtn = undoActive
        ? React.createElement('button', {
            type: 'button',
            className: 'pwe-btn pwe-undo',
            title: '撤销增强,恢复原文',
            'aria-label': '撤销增强,恢复原文',
            onClick: handleUndo,
          }, '↩ 撤销')
        : null

      // 当前模式(设置卡片经共享店发布):魔棒图标随模式切换(设计模式=星含画笔)
      const suggestSnapNow = React.useSyncExternalStore(suggestStore.subscribe, suggestStore.getSnapshot)
      const currentModeId = typeof suggestSnapNow.currentMode === 'string' ? suggestSnapNow.currentMode : 'generic'
      const wandIconDef = modeIconDef(currentModeId)
      const wandAria = currentModeId === 'design' ? '增强提示词(设计模式)' : '增强提示词'

      const wandProps = {
        type: 'button',
        className: 'pwe-btn' + (busy ? ' pwe-busy' : '') + (error.length > 0 ? ' pwe-error' : ''),
        'aria-label': wandAria,
        disabled,
        onClick: handleClick,
      }
      if (busy || error.length > 0) {
        wandProps.title = busy ? '正在增强提示词…' : error + '(点击重试)'
      } else if (cmdBroken) {
        wandProps.title = '当前命令形态暂不支持增强(保护命令调用)'
      } else if (refGuardBlocked) {
        wandProps.title = '当前 DSH 版本下含 @ 引用的草稿暂不支持增强(保护引用注入)'
      } else if (claimed) {
        wandProps['data-tooltip'] = '提示词优化(仅优化命令后的正文,命令保持不变)'
      } else if (currentModeId === 'design') {
        wandProps['data-tooltip'] = '提示词优化(设计模式)'
      } else {
        wandProps['data-tooltip'] = '提示词优化'
      }

      const wandBtn = React.createElement('button', wandProps, React.createElement(StarIcon, { def: wandIconDef }))

      // ==================== 模式建议提示条(锚定魔棒按钮正上方) ====================
      const barVisible = suggestSnapNow.suggestion !== null && suggestSnapNow.suggestion !== ''
        && draft === suggestSnapNow.draftKey
        && draft !== suggestSnapNow.dismissedKey
        && draft.trim().length > 0
      // 按下[切换]:建议条立即关闭,魔棒进入正常优化呼吸动效承载重跑
      const onSugSwitch = async () => {
        if (typeof props.switchMode !== 'function') { setError('切换失败,请重试'); return }
        suggestStore.publish({ suggestion: null, dismissedKey: suggestSnapNow.draftKey })
        setBusy(true)
        setError('')
        try {
          const enhanced = await props.switchMode(suggestSnapNow.suggestion, suggestSnapNow.baseText, sessionId)
          if (enhanced === null) { setError('切换失败,请重试'); return }
          if (actions !== undefined && typeof actions.setDraft === 'function') {
            actions.setDraft(suggestSnapNow.cmdPrefix + enhanced)
          }
          suggestStore.publish({
            undo: { original: suggestSnapNow.baseText, enhanced, cmdPrefix: suggestSnapNow.cmdPrefix, seq: Date.now() },
          })
        } finally {
          setBusy(false)
        }
      }
      const onSugIgnore = () => {
        suggestStore.publish({ suggestion: null, dismissedKey: suggestSnapNow.draftKey })
      }
      const suggestBar = barVisible
        ? React.createElement('div', { className: 'pwe-suggest' },
            React.createElement(StarIcon, { def: modeIconDef(suggestSnapNow.suggestion), size: 16, className: 'pwe-suggest-icon' }),
            React.createElement('span', { className: 'pwe-suggest-text' },
              `检测到当前内容更适合「${pickLocale(suggestSnapNow.modeLabel)}」模式,是否切换?`),
            React.createElement('button', {
              type: 'button',
              className: 'pwe-suggest-btn pwe-suggest-switch',
              onClick: onSugSwitch,
            }, '切换'),
            React.createElement('button', {
              type: 'button',
              className: 'pwe-suggest-btn pwe-suggest-ignore',
              onClick: onSugIgnore,
            }, '忽略'),
          )
        : null

      return React.createElement('span', { className: 'pwe-wrap' }, undoBtn, wandBtn, suggestBar)
    }

    // ==================== 设置后台一级栏目(新框架「设置」左侧导航) ====================
    const SETTINGS_NS = 'prompt-enhance'

    // 模式元数据是 { zh, en } 双语对象;按页面语言取字段,缺省中文
    function pickLocale(obj) {
      if (typeof obj === 'string') return obj
      if (obj !== null && typeof obj === 'object') {
        const lang = typeof document !== 'undefined' && document.documentElement !== null && typeof document.documentElement.lang === 'string' && /^en/i.test(document.documentElement.lang)
          ? 'en'
          : 'zh'
        if (typeof obj[lang] === 'string') return obj[lang]
        if (typeof obj.zh === 'string') return obj.zh
        if (typeof obj.en === 'string') return obj.en
      }
      return ''
    }

    // 惰性挂载:settingsScope 由框架 dsh-client-ui-settings 提供,仅新框架存在;
    // 旧框架或加载顺序竞态下重试若干次后放弃,魔棒按钮完全不受影响。
    // 入口为设置后台左侧一级栏目槽位 settings.section(与「提示词库」同款,
    // 官方插件设置示例槽位);页面单选模式、即选即存,写入宿主设置命名空间
    // 「prompt-enhance」(落盘 settings.yaml)。
    function mountSettingsCard(ctx, slots) {
      const settingsScope = ctx.get('settingsScope')
      if (settingsScope === undefined || typeof settingsScope.bind !== 'function') return false
      let mounted = false
      let disposed = false
      let scope = undefined
      let unsubScope = undefined
      let snapshot = { status: 'loading', options: [], current: null, writable: true, saving: false, error: '' }
      const listeners = new Set()

      const tryMount = () => {
        if (mounted || disposed) return
        try {
          const bound = settingsScope.bind({ namespace: SETTINGS_NS })
          if (bound === undefined || typeof bound.getSnapshot !== 'function' || typeof bound.set !== 'function') return
          scope = bound
        } catch (err) {
          return
        }
        // 快照店(槽位 hooks 源,渲染器转成 props.usePweCard(selector))
        const publish = (patch) => {
          let changed = false
          for (const key of Object.keys(patch)) {
            if (patch[key] !== snapshot[key]) { changed = true; break }
          }
          if (!changed) return
          snapshot = Object.assign({}, snapshot, patch)
          for (const cb of [...listeners]) { try { cb() } catch (err) { /* 渲染侧异常不扩散 */ } }
        }
        const store = {
          getSnapshot: () => snapshot,
          subscribe: (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
        }
        const refresh = () => {
          const s = scope.getSnapshot()
          const value = s !== undefined && s !== null && s.value !== null && typeof s.value === 'object' ? s.value : null
          const modeNow = value !== null && typeof value.mode === 'string' ? value.mode : 'generic'
          publish({
            status: s !== undefined && s !== null && s.status === 'ready'
              ? 'ready'
              : (s !== undefined && s !== null && s.status === 'unavailable' ? 'unavailable' : snapshot.status),
            current: modeNow,
            writable: !(s !== undefined && s !== null && s.writable === false),
          })
          // 当前模式同步进共享店:魔棒图标/提示条据此切换(设计模式=星含画笔)
          suggestStore.publish({ currentMode: modeNow })
        }
        try { unsubScope = scope.subscribe(refresh) } catch (err) { /* 订阅失败不阻塞 */ }
        refresh()
        // 模式元数据:宿主只读接口;失败静默(列表为空时卡片显示占位)
        if (typeof fetch === 'function' && typeof AbortController === 'function') {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 8000)
          fetch('/prompt-enhance/api/modes', { headers: { Accept: 'application/json' }, signal: controller.signal })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + String(r.status)))))
            .then((data) => {
              clearTimeout(timer)
              publish({ options: data !== null && typeof data === 'object' && Array.isArray(data.modes) ? data.modes : [] })
            })
            .catch(() => {
              clearTimeout(timer)
              publish({ error: '模式列表加载失败' })
            })
        }
        // 即选即存(设计决策 A):点击单选即写入设置,无保存按钮
        const selectMode = (id) => {
          if (typeof id !== 'string' || scope === undefined) return
          publish({ saving: true, error: '' })
          Promise.resolve(scope.set('mode', id)).then(
            () => publish({ saving: false }),
            () => publish({ saving: false, error: '保存失败,请重试' }),
          )
        }
        function PweSettingsSection() {
          const state = React.useSyncExternalStore(store.subscribe, store.getSnapshot)
          const head = React.createElement('div', { className: 'pwe-panel-head' },
            React.createElement('p', { className: 'pwe-panel-title' }, '提示词附魔棒 · 增强模式'),
            React.createElement('p', { className: 'pwe-panel-sub' }, '选择增强使用的人设模式,点击即生效'),
          )
          if (state.status === 'loading' || (state.status === 'ready' && state.options.length === 0 && state.error === '')) {
            return React.createElement('div', { className: 'pwe-panel' }, head,
              React.createElement('p', { className: 'pwe-panel-note' }, state.status === 'unavailable' ? '设置服务暂不可用' : '加载中…'))
          }
          const rows = state.options.map((option) => {
            const isCurrent = state.current === option.id
            const disabled = state.saving === true || state.writable === false
            const tags = Array.isArray(option.tags) ? option.tags : []
            return React.createElement('label', {
              key: option.id,
              className: 'pwe-mode-row' + (isCurrent ? ' pwe-mode-current' : '') + (disabled ? ' pwe-mode-disabled' : ''),
            },
              React.createElement('input', {
                type: 'radio',
                name: 'pwe-mode',
                className: 'pwe-mode-radio',
                checked: isCurrent,
                disabled,
                onChange: () => selectMode(option.id),
              }),
              React.createElement('span', { className: 'pwe-mode-dot' }),
              React.createElement(StarIcon, { def: modeIconDef(option.id), size: 16, className: 'pwe-mode-icon' }),
              React.createElement('span', { className: 'pwe-mode-main' },
                React.createElement('span', { className: 'pwe-mode-name' }, pickLocale(option.name)),
                React.createElement('span', { className: 'pwe-mode-desc', title: pickLocale(option.description) }, pickLocale(option.description)),
              ),
              React.createElement('span', { className: 'pwe-mode-tags' },
                tags.map((t) => React.createElement('span', { key: pickLocale(t), className: 'pwe-mode-tag' }, pickLocale(t)))),
              React.createElement('span', { className: 'pwe-mode-check', 'aria-hidden': 'true' }, '✓'),
            )
          })
          // 底部状态栏:当前生效(第二层回显)+ 变更闪动;保存中/失败在此显示
          const cur = state.options.find((o) => o.id === state.current)
          const curName = cur !== undefined ? pickLocale(cur.name) : (state.current !== null && state.current !== undefined ? state.current : '')
          const statusbar = React.createElement('div', { className: 'pwe-statusbar' },
            state.saving === true
              ? React.createElement('b', { key: 'saving' }, '正在保存…')
              : state.error !== ''
                ? React.createElement('b', { key: 'err', className: 'pwe-status-error' }, state.error)
                : React.createElement(React.Fragment, { key: 'ok' },
                    React.createElement('span', {}, '当前生效:'),
                    React.createElement('b', { key: state.current !== null && state.current !== undefined ? state.current : 'none', className: 'pwe-status-flash' }, curName),
                    React.createElement('span', { className: 'pwe-status-ok', 'aria-hidden': 'true' }, '✓'),
                  ),
          )
          return React.createElement('div', { className: 'pwe-panel' }, head,
            React.createElement('div', { className: 'pwe-modes', role: 'radiogroup' }, rows), statusbar)
        }
        try {
          // 设置后台左侧一级栏目(与「提示词库」同款 settings.section 槽位,
          // order 19 紧随提示词库的 18;官方文档即以此槽位作为插件设置入口示例)
          slots.inject('settings.section', () => slots.register(
            { name: 'settings.section', id: 'prompt-enhance', order: 19, label: '提示词附魔棒' },
            () => React.createElement(PweSettingsSection),
          ))
          mounted = true
        } catch (err) {
          mounted = false
        }
      }

      tryMount()
      if (!mounted) {
        // 加载顺序竞态(设置区插件尚未声明槽位/服务)下重试;服务事件再补一次
        const schedule = typeof ctx.setTimeout === 'function'
          ? (fn, ms) => ctx.setTimeout(fn, ms)
          : (fn, ms) => setTimeout(fn, ms)
        ;[300, 1000, 2500, 5000].forEach((delay) => {
          try { schedule(() => { if (!mounted && !disposed) tryMount() }, delay) } catch (err) { /* ignore */ }
        })
        try {
          ctx.on('service', () => { if (!mounted && !disposed) tryMount() })
        } catch (err) { /* ignore */ }
      }
      ctx.effect(() => () => {
        disposed = true
        if (typeof unsubScope === 'function') { try { unsubScope() } catch (err) { /* ignore */ } }
      })
      return true
    }

    // ==================== 设置导航图标(替换框架默认齿轮) ====================
    // 框架 navIcon(id) 硬编码栏目图标,第三方栏目一律默认齿轮、无槽位可改;
    // 此处以 MutationObserver 在设置对话框渲染后,把本插件栏目的齿轮 svg
    // 替换为粒子生成星(T7,genstar,设置目录语义,currentColor 随主题)。
    // 仅新框架设置区存在时才有 DOM 可匹配,旧框架零副作用;异常静默降级(纯装饰)。
    function mountSettingsNavIcon(ctx) {
      if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return false
      const SETTINGS_LABEL = '提示词附魔棒'
      let timer = undefined
      let observer = undefined
      function buildNavSvg() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('viewBox', '0 0 1024 1024')
        svg.setAttribute('class', 'pwe-nav-star')
        svg.setAttribute('aria-hidden', 'true')
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        path.setAttribute('d', GENSTAR_PATH)
        path.setAttribute('fill-rule', 'evenodd')
        path.setAttribute('fill', 'currentColor')
        svg.appendChild(path)
        return svg
      }
      function swapOnce() {
        // 设置对话框未打开时不扫描(零成本);打开后把本插件栏目行的齿轮换成粒子生成星
        if (document.querySelector('div[role="dialog"]') === null) return
        const buttons = document.querySelectorAll('div[role="dialog"] nav button')
        for (const btn of buttons) {
          const spans = btn.querySelectorAll('span')
          let labelHit = false
          for (const sp of spans) {
            if (sp.textContent === SETTINGS_LABEL) { labelHit = true; break }
          }
          if (!labelHit) continue
          const first = btn.firstElementChild
          if (first !== null && typeof first.classList === 'object' && first.classList.contains('pwe-nav-star')) continue
          if (first !== null && typeof first.tagName === 'string' && first.tagName.toLowerCase() === 'svg') {
            first.replaceWith(buildNavSvg())
          }
        }
      }
      const schedule = () => {
        if (timer !== undefined) return
        timer = setTimeout(() => {
          timer = undefined
          try { swapOnce() } catch (err) { /* 纯装饰,异常忽略 */ }
        }, 120)
      }
      try {
        observer = new MutationObserver(schedule)
        observer.observe(document.body, { childList: true, subtree: true })
        schedule()
      } catch (err) {
        return false
      }
      ctx.effect(() => () => {
        if (timer !== undefined) clearTimeout(timer)
        if (observer !== undefined) { try { observer.disconnect() } catch (err) { /* ignore */ } }
      })
      return true
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      // 样式注入(随插件卸载清理)
      const styleEl = document.createElement('style')
      styleEl.textContent = CSS
      document.head.appendChild(styleEl)
      ctx.effect(() => () => { if (styleEl.parentNode !== null) styleEl.parentNode.removeChild(styleEl) })

      // ==================== 模式建议:切换动作(魔棒提示条调用) ====================
      // [切换] = 持久化切换模式 + 自动用新模式对原始输入重跑并回填。
      const switchMode = async (modeId, baseText, sessionId) => {
        try {
          const settingsScope = ctx.get('settingsScope')
          if (settingsScope !== undefined && typeof settingsScope.bind === 'function') {
            const scope = settingsScope.bind({ namespace: SETTINGS_NS })
            if (scope !== undefined && typeof scope.set === 'function') {
              await Promise.resolve(scope.set('mode', modeId))
            }
          }
        } catch (err) { /* 持久化失败不阻断重跑 */ }
        try {
          const result = await enhanceRpc(baseText, [], typeof sessionId === 'string' ? sessionId : undefined)
          if (result !== null && result !== undefined && result.ok === true && typeof result.enhanced === 'string' && result.enhanced.trim().length > 0) {
            return result.enhanced
          }
        } catch (err) { /* 重跑失败 → 提示条内报错 */ }
        return null
      }

      slots.inject('conversation.input.right', () => slots.register(
        { name: 'conversation.input.right', id: 'prompt-enhance', order: 0, label: '增强提示词', inject: (sessionId) => ({ pweSessionId: sessionId }) },
        (props) => React.createElement(EnhanceButton, Object.assign({}, props, { switchMode })),
      ))

      // 设置后台一级栏目(新框架);任何失败路径均不影响魔棒按钮
      try {
        mountSettingsCard(ctx, slots)
      } catch (err) {
        console.error('dsh-prompt-enhance: 设置栏目挂载失败(不影响增强功能):', err)
      }
      // 设置导航星星图标(纯装饰,失败静默)
      try {
        mountSettingsNavIcon(ctx)
      } catch (err) {
        console.error('dsh-prompt-enhance: 导航图标替换失败(纯装饰):', err)
      }
    }

    exports.apply = apply
    return module.exports
  },
})

// ============================================================================
// dsh-prompt-enhance · Client 半(磁盘常驻版,预构建 web bundle)
// ----------------------------------------------------------------------------
// 由 DSH clientModules 通过 /plugins/prompt-enhance/client.js 伺服。
// 通过组合行挂载后,输入框工具行出现星星魔法棒按钮:
//   - 图标:直接加载 Host 路由 /prompt-enhance/icons/{black|white}.png(失败回退 ✨)
//   - 增强:fetch POST /prompt-enhance/api/enhance
//   - 亮色黑星/暗色白星、呼吸等待动画、悬停提示、失败重试、撤销防误触
// v0.3.0 新增:设置后台卡片(新框架「设置 → 插件」页)——通过槽位
// settings.plugin.item(key=prompt-enhance)+ settingsScope 服务挂载,
// 单选模式列表、即选即存;旧框架/服务缺失时静默跳过,魔棒不受影响。
// ============================================================================
window.__ModuleLoader__.load({
  id: 'dsh-prompt-enhance',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    const CSS = [
      '.pwe-wrap { display: inline-flex; align-items: center; gap: 4px; height: 100%; }',
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
      // ===== 设置后台卡片(新框架「设置 → 插件」页,宿主命名空间 prompt-enhance) =====
      '.pwe-card { padding: 14px 16px; border: .5px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25)); border-radius: 10px; background: var(--dsw-alias-bg-module-platform, transparent); }',
      '.pwe-card-title { margin: 0 0 2px; font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary, #1f2328); }',
      '.pwe-card-sub { margin: 0 0 10px; font-size: 12px; color: var(--dsw-alias-label-tertiary, #8b909a); }',
      '.pwe-modes { display: grid; gap: 6px; }',
      '.pwe-mode-row { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; padding: 8px 10px; border: .5px solid var(--dsw-alias-border-l4, rgba(128,128,128,.2)); border-radius: 8px; cursor: pointer; }',
      '.pwe-mode-row:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }',
      '.pwe-mode-row.pwe-mode-current { border-color: var(--dsw-alias-brand-primary, #5b8def); }',
      '.pwe-mode-row.pwe-mode-disabled { opacity: .55; cursor: not-allowed; }',
      '.pwe-mode-radio { margin: 0; accent-color: var(--dsw-alias-brand-primary, #5b8def); }',
      '.pwe-mode-name { display: block; font-size: 13px; font-weight: 500; color: var(--dsw-alias-label-primary, #1f2328); }',
      '.pwe-mode-desc { display: block; margin-top: 2px; font-size: 12px; color: var(--dsw-alias-label-tertiary, #8b909a); }',
      '.pwe-mode-check { font-size: 14px; color: var(--dsw-alias-brand-primary, #5b8def); }',
      '.pwe-card-note { margin: 8px 0 0; font-size: 12px; color: var(--dsw-alias-label-tertiary, #8b909a); }',
      '.pwe-card-error { margin: 8px 0 0; font-size: 12px; color: var(--dsw-alias-label-error, #e5484d); }',
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

    async function enhanceRpc(text, history) {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
      const timeoutId = setTimeout(() => { if (controller !== undefined) controller.abort() }, 150000)
      try {
        const res = await fetch('/prompt-enhance/api/enhance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, history }),
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
    function StarIcon() {
      return React.createElement('svg', {
        viewBox: '0 0 1024 1024',
        width: 16,
        height: 16,
        className: 'pwe-icon',
        'aria-hidden': 'true',
      }, React.createElement('path', { d: SPARKLE_PATH, fill: 'currentColor' }))
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

      const handleClick = async () => {
        if (disabled) return
        setBusy(true)
        setError('')
        try {
          const history = extractHistory(session)
          const result = await enhanceRpc(textPart, history)
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
              } else {
                actions.setDraft(cmdPrefix + enhanced)
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

      const wandProps = {
        type: 'button',
        className: 'pwe-btn' + (busy ? ' pwe-busy' : '') + (error.length > 0 ? ' pwe-error' : ''),
        'aria-label': '增强提示词',
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
      } else {
        wandProps['data-tooltip'] = '提示词优化'
      }

      const wandBtn = React.createElement('button', wandProps, React.createElement(StarIcon))

      return React.createElement('span', { className: 'pwe-wrap' }, undoBtn, wandBtn)
    }

    // ==================== 设置后台卡片(新框架「设置 → 插件」页) ====================
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
    // 卡片 key = 宿主设置命名空间「prompt-enhance」,只有宿主已伺服该命名
    // 空间时设置后台才会调度渲染本卡片(宿主旧代码时卡片自然不出现)。
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
          publish({
            status: s !== undefined && s !== null && s.status === 'ready'
              ? 'ready'
              : (s !== undefined && s !== null && s.status === 'unavailable' ? 'unavailable' : snapshot.status),
            current: value !== null && typeof value.mode === 'string' ? value.mode : null,
            writable: !(s !== undefined && s !== null && s.writable === false),
          })
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
        function SettingsCard(props) {
          const state = typeof props.usePweCard === 'function' ? props.usePweCard((s) => s) : store.getSnapshot()
          const head = React.createElement('p', { className: 'pwe-card-title' }, '提示词附魔棒 · 增强模式')
          const sub = React.createElement('p', { className: 'pwe-card-sub' }, '选择提示词增强使用的人设模式,点击即生效')
          if (state.status === 'loading' || (state.status === 'ready' && state.options.length === 0 && state.error === '')) {
            return React.createElement('div', { className: 'pwe-card' }, head, sub,
              React.createElement('p', { className: 'pwe-card-note' }, state.status === 'unavailable' ? '设置服务暂不可用' : '加载中…'))
          }
          const rows = state.options.map((option) => {
            const isCurrent = state.current === option.id
            const disabled = state.saving === true || state.writable === false
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
              React.createElement('span', {},
                React.createElement('span', { className: 'pwe-mode-name' }, pickLocale(option.name)),
                React.createElement('span', { className: 'pwe-mode-desc' }, pickLocale(option.description)),
              ),
              isCurrent ? React.createElement('span', { className: 'pwe-mode-check' }, '✓') : null,
            )
          })
          const note = state.saving === true
            ? React.createElement('p', { className: 'pwe-card-note' }, '正在保存…')
            : (state.error !== '' ? React.createElement('p', { className: 'pwe-card-error' }, state.error) : null)
          return React.createElement('div', { className: 'pwe-card' }, head, sub,
            React.createElement('div', { className: 'pwe-modes' }, rows), note)
        }
        try {
          slots.inject('settings.plugin.item', () => slots.register(
            { name: 'settings.plugin.item', key: SETTINGS_NS, inject: () => ({ hooks: { pweCard: store }, pweSelect: selectMode }) },
            SettingsCard,
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

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      // 样式注入(随插件卸载清理)
      const styleEl = document.createElement('style')
      styleEl.textContent = CSS
      document.head.appendChild(styleEl)
      ctx.effect(() => () => { if (styleEl.parentNode !== null) styleEl.parentNode.removeChild(styleEl) })

      slots.inject('conversation.input.right', () => slots.register(
        { name: 'conversation.input.right', id: 'prompt-enhance', order: 0, label: '增强提示词' },
        (props) => React.createElement(EnhanceButton, props),
      ))

      // 设置后台卡片(新框架);任何失败路径均不影响魔棒按钮
      try {
        mountSettingsCard(ctx, slots)
      } catch (err) {
        console.error('dsh-prompt-enhance: 设置卡片挂载失败(不影响增强功能):', err)
      }
    }

    exports.apply = apply
    return module.exports
  },
})

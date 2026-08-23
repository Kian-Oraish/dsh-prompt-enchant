// ============================================================================
// dsh-prompt-enhance · Client 半(磁盘常驻版,预构建 web bundle)
// ----------------------------------------------------------------------------
// 由 DSH clientModules 通过 /plugins/prompt-enhance/client.js 伺服。
// 通过组合行挂载后,输入框工具行出现星星魔法棒按钮:
//   - 图标:直接加载 Host 路由 /prompt-enhance/icons/{black|white}.png(失败回退 ✨)
//   - 增强:fetch POST /prompt-enhance/api/enhance
//   - 亮色黑星/暗色白星、呼吸等待动画、悬停提示、失败重试、撤销防误触
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
      '.pwe-icon { width: 16px; height: 16px; display: block; }',
      '.pwe-icon img { width: 16px; height: 16px; display: block; }',
      '.pwe-icon-light { display: block; }',
      '.pwe-icon-dark { display: none; }',
      'body[data-ds-dark-theme] .pwe-icon-light { display: none; }',
      'body[data-ds-dark-theme] .pwe-icon-dark { display: block; }',
      '.pwe-btn.pwe-busy .pwe-icon,',
      '.pwe-btn.pwe-busy .pwe-emoji { animation: pwe-breathe 1.4s ease-in-out infinite; }',
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
      '  0%, 100% { transform: scale(1); opacity: 1; }',
      '  50% { transform: scale(1.28); opacity: .68; }',
      '}',
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
        return await res.json()
      } finally {
        clearTimeout(timeoutId)
      }
    }

    function StarIcon() {
      const [failed, setFailed] = React.useState(false)
      if (failed) return React.createElement('span', { className: 'pwe-emoji', 'aria-hidden': 'true' }, '✨')
      const onError = () => setFailed(true)
      return React.createElement('span', { className: 'pwe-icon', 'aria-hidden': 'true' },
        React.createElement('img', { className: 'pwe-icon-light', src: '/prompt-enhance/icons/black.png', alt: '', onError }),
        React.createElement('img', { className: 'pwe-icon-dark', src: '/prompt-enhance/icons/white.png', alt: '', onError }),
      )
    }

    function EnhanceButton(props) {
      const hooked = typeof props.useInput === 'function' ? props.useInput((s) => s) : undefined
      const inputState = hooked !== undefined && hooked !== null && typeof hooked === 'object'
        ? hooked
        : (props.input !== undefined && props.input !== null ? props.input : null)
      const sessionHooked = typeof props.useSession === 'function' ? props.useSession((s) => s) : undefined
      const session = sessionHooked !== undefined && sessionHooked !== null && typeof sessionHooked === 'object'
        ? sessionHooked
        : (props.session !== undefined && props.session !== null ? props.session : null)

      const draft = inputState !== null && inputState !== undefined && typeof inputState.draft === 'string' ? inputState.draft : ''
      const phase = inputState !== null && inputState !== undefined && typeof inputState.phase === 'string' ? inputState.phase : 'plain'
      const actions = props.inputActions

      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [original, setOriginal] = React.useState(null)
      const [lastEnhanced, setLastEnhanced] = React.useState(null)
      const [showUndo, setShowUndo] = React.useState(false)

      React.useEffect(() => {
        if (!showUndo) return
        const id = window.setTimeout(() => setShowUndo(false), 8000)
        return () => window.clearTimeout(id)
      }, [showUndo])

      const disabled = busy || draft.trim().length === 0 || phase !== 'plain'

      const handleClick = async () => {
        if (disabled) return
        setBusy(true)
        setError('')
        try {
          const history = extractHistory(session)
          const result = await enhanceRpc(draft, history)
          if (result !== null && result !== undefined && result.ok === true && typeof result.enhanced === 'string' && result.enhanced.trim().length > 0) {
            setOriginal(draft)
            setLastEnhanced(result.enhanced)
            setShowUndo(true)
            if (actions !== undefined && typeof actions.setDraft === 'function') actions.setDraft(result.enhanced)
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
        if (original !== null && actions !== undefined && typeof actions.setDraft === 'function') {
          actions.setDraft(original)
        }
        setOriginal(null)
        setLastEnhanced(null)
        setShowUndo(false)
      }

      // 撤销防误触:用户手动编辑过草稿(当前草稿 ≠ 增强结果)时隐藏撤销
      const undoActive = showUndo && original !== null && lastEnhanced !== null && draft === lastEnhanced
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
      } else {
        wandProps['data-tooltip'] = '提示词优化'
      }

      const wandBtn = React.createElement('button', wandProps, React.createElement(StarIcon))

      return React.createElement('span', { className: 'pwe-wrap' }, undoBtn, wandBtn)
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
    }

    exports.apply = apply
    return module.exports
  },
})

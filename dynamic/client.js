// ============================================================================
// 增强提示词魔法棒 · Client 半(DSH 动态插件形态)
// ----------------------------------------------------------------------------
// 使用方法:在 DSH Web GUI 的动态插件(Cordis Plugin)面板中,
//           把本文件「return { ... }」整体作为 code.client 粘贴。
//
// 功能:输入框工具行魔法棒按钮(conversation.input.right 槽位)
//       - 星星图标:经 RPC 拉取 PNG data URI(单飞缓存,亮色黑星/暗色白星)
//       - 呼吸式等待动画、悬停气泡「提示词优化」、失败重试
//       - 增强成功回填草稿 + 撤销(草稿被手动编辑后自动隐藏)
//       - 多轮上下文:从会话快照提取最近几轮 user/assistant 文本随请求提交
// ============================================================================

return {
  async apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    const timer = ctx.get('timer')

    let iconReported = false
    const report = (payload) => {
      const owned = { stage: payload.stage, ok: payload.ok }
      if (typeof payload.detail === 'string') owned.detail = payload.detail.slice(0, 300)
      if (typeof payload.value === 'number') owned.value = payload.value
      host.call('report', owned).catch(() => {})
    }

    // 图标单飞缓存:页面生命周期内只拉取一次,后续挂载立即命中
    let iconsShared = null
    let iconsPromise = null
    const loadIcons = () => {
      if (iconsShared !== null) return Promise.resolve(iconsShared)
      if (iconsPromise !== null) return iconsPromise
      iconsPromise = (async () => {
        const [black, white] = await Promise.all([
          host.call('get-icon', { kind: 'black' }),
          host.call('get-icon', { kind: 'white' }),
        ])
        if (!(black !== null && black !== undefined && black.ok === true && typeof black.dataUri === 'string'
          && white !== null && white !== undefined && white.ok === true && typeof white.dataUri === 'string')) {
          throw new Error('图标加载失败')
        }
        iconsShared = { light: black.dataUri, dark: white.dataUri }
        return iconsShared
      })()
      iconsPromise.catch(() => { iconsPromise = null })
      return iconsPromise
    }

    // apply 自检:填充缓存并回报诊断(StarIcon 挂载时直接命中)
    ;(async () => {
      try {
        const icons = await loadIcons()
        iconReported = true
        report({ stage: 'icon-apply', ok: true, detail: '黑/白 data URI 就绪(缓存)', value: icons.light.length + icons.dark.length })
      } catch (err) {
        iconReported = true
        report({ stage: 'icon-apply', ok: false, detail: String(err) })
      }
    })()

    styles.insert([
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
      // 亮色主题显示黑星,暗色主题显示白星(跟随 DSH 主题的 body[data-ds-dark-theme] 开关)
      '.pwe-icon-light { display: block; }',
      '.pwe-icon-dark { display: none; }',
      'body[data-ds-dark-theme] .pwe-icon-light { display: none; }',
      'body[data-ds-dark-theme] .pwe-icon-dark { display: block; }',
      // 忙碌动画:呼吸(缩放)+ 快速闪烁 + 按钮光晕,三重组合明确传达「工作中」
      '.pwe-btn.pwe-busy .pwe-icon,',
      '.pwe-btn.pwe-busy .pwe-emoji {',
      '  animation: pwe-breathe 1.2s ease-in-out infinite, pwe-flicker 1.2s ease-in-out infinite;',
      '}',
      '.pwe-btn.pwe-busy { animation: pwe-glow 1.2s ease-in-out infinite; }',
      '.pwe-btn.pwe-error { background: var(--dsw-alias-interactive-bg-hover-danger, rgba(229,72,77,.18)) !important; }',
      '.pwe-emoji { font-size: 15px; line-height: 1; }',
      // 悬停提示:data-tooltip 气泡,按钮上方居中,淡入过渡,不遮挡点击
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
    ].join('\n'))

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

    function StarIcon() {
      const [state, setState] = React.useState({ status: 'loading' })
      React.useEffect(() => {
        let cancelled = false
        ;(async () => {
          try {
            const icons = await loadIcons()
            if (cancelled) return
            setState({ status: 'ok', light: icons.light, dark: icons.dark })
            if (!iconReported) { iconReported = true; report({ stage: 'icon', ok: true, detail: '组件加载图标成功', value: icons.light.length + icons.dark.length }) }
          } catch (err) {
            if (!cancelled) setState({ status: 'fail' })
            if (!iconReported) { iconReported = true; report({ stage: 'icon', ok: false, detail: String(err) }) }
          }
        })()
        return () => { cancelled = true }
      }, [])

      if (state.status !== 'ok') {
        return React.createElement('span', { className: 'pwe-emoji', 'aria-hidden': 'true' }, '✨')
      }
      return React.createElement('span', { className: 'pwe-icon', 'aria-hidden': 'true' },
        React.createElement('img', { className: 'pwe-icon-light', src: state.light, alt: '' }),
        React.createElement('img', { className: 'pwe-icon-dark', src: state.dark, alt: '' }),
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
      const claim = inputState !== null && inputState !== undefined && inputState.claim !== undefined && inputState.claim !== null && typeof inputState.claim.token === 'string'
        ? inputState.claim
        : null
      const actions = props.inputActions

      // 命令声明态(/plan、/goal 等):提取行首命令前缀,只增强命令之后的正文,
      // 命令标记与声明状态原样保留——增强结果不影响命令的调用与显示。
      const CMD_RE = /^(\/[A-Za-z0-9_-]+)[ \t]*/
      const claimed = phase === 'claimed' && claim !== null
      let cmdPrefix = ''
      let cmdBroken = false
      if (claimed) {
        const m = CMD_RE.exec(draft)
        if (m !== null && m[1] === '/' + claim.token) cmdPrefix = m[0]
        else cmdBroken = true
      }
      const textPart = claimed && !cmdBroken ? draft.slice(cmdPrefix.length) : draft

      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [original, setOriginal] = React.useState(null)
      const [lastEnhanced, setLastEnhanced] = React.useState(null)
      const [showUndo, setShowUndo] = React.useState(false)

      // 撤销按钮常驻:不再自动消失,直到草稿被编辑或消息发送(草稿清空)为止。
      // 发送/清空草稿后清理状态;编辑导致的隐藏由 undoActive 的 draft 比对守卫完成。
      React.useEffect(() => {
        if (draft === '') {
          setOriginal(null)
          setLastEnhanced(null)
          setShowUndo(false)
        }
      }, [draft])

      // 空闲态与命令声明态均可增强;判定/提交中禁用;命令标记无法定位时禁用(保护命令)
      const disabled = busy || draft.trim().length === 0
        || (phase !== 'plain' && phase !== 'claimed')
        || cmdBroken
        || (claimed && textPart.trim().length === 0)

      const handleClick = async () => {
        if (disabled) return
        setBusy(true)
        setError('')
        try {
          const history = extractHistory(session)
          const call = host.call('enhance', { text: textPart, history })
          // 超时对齐 Host 最坏耗时(单次 45s × 重试链最多 3 次)
          const result = timer !== undefined
            ? await Promise.race([
                call,
                timer.timeout(150000).then(() => { throw new Error('增强超时,请重试') }),
              ])
            : await call
          if (result !== null && result !== undefined && result.ok === true && typeof result.enhanced === 'string' && result.enhanced.trim().length > 0) {
            setOriginal(textPart)
            setLastEnhanced(result.enhanced)
            setShowUndo(true)
            if (actions !== undefined && typeof actions.setDraft === 'function') actions.setDraft(cmdPrefix + result.enhanced)
          } else {
            const msg = result !== null && result !== undefined && typeof result.error === 'string' && result.error.length > 0
              ? result.error
              : '增强失败,请重试'
            throw new Error(msg)
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          setBusy(false)
        }
      }

      const handleUndo = () => {
        // 判定/提交期间不写草稿;空闲态与命令声明态允许撤销(命令前缀原样保留)
        if (phase !== 'plain' && phase !== 'claimed') return
        if (original !== null && actions !== undefined && typeof actions.setDraft === 'function') {
          actions.setDraft(cmdPrefix + original)
        }
        setOriginal(null)
        setLastEnhanced(null)
        setShowUndo(false)
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
      } else if (claimed) {
        wandProps['data-tooltip'] = '提示词优化(仅优化命令后的正文,命令保持不变)'
      } else {
        wandProps['data-tooltip'] = '提示词优化'
      }

      const wandBtn = React.createElement('button', wandProps, React.createElement(StarIcon))

      return React.createElement('span', { className: 'pwe-wrap' }, undoBtn, wandBtn)
    }

    slots.inject('conversation.input.right', () => slots.register(
      { name: 'conversation.input.right', id: 'prompt-enhance', order: 0, label: '增强提示词' },
      (props) => React.createElement(EnhanceButton, props),
    ))
  },
}

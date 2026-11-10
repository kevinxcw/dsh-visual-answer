window.__ModuleLoader__.load({
  id: 'dsh-visual-answer',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'visual-answer'
    /** Directory, relative to the session working directory, holding the documents. */
    const DIRECTORY = '.dsh/visual'
    /** Host command that flips the mode. */
    const COMMAND = 'visual'
    /** Host projection key that carries the switch state. */
    const PROJECTION = 'visualMode'

    const zh = {
      'toggle.label': '可视化',
      'toggle.on': '可视化模式已开启：回答会写成可交互的 HTML 文档',
      'toggle.off': '可视化模式已关闭：恢复普通文字回答',
      'toggle.error': '切换失败',
      'view.title': '可视化',
      'view.hint': '模型生成的 HTML 文档保存在',
      'view.empty.title': '还没有可视化文档',
      'view.empty.body': '打开输入框下方的「可视化」开关，再问一个适合图解的问题。文档会写入',
      'view.loading': '正在读取…',
      'view.error': '读取失败',
      'view.retry': '重试',
      'view.refresh': '刷新',
      'view.open': '打开',
      'view.count': '个文档',
      'view.path': '路径',
    }

    const en = {
      'toggle.label': 'Visual',
      'toggle.on': 'Visual answer mode is on: answers become interactive HTML documents',
      'toggle.off': 'Visual answer mode is off: answers return to prose',
      'toggle.error': 'Could not switch',
      'view.title': 'Visual',
      'view.hint': 'HTML documents produced in this session live in',
      'view.empty.title': 'No visual documents yet',
      'view.empty.body': 'Turn on the Visual switch under the composer, then ask a question that benefits from a picture. Documents are written to',
      'view.loading': 'Loading…',
      'view.error': 'Could not read the directory',
      'view.retry': 'Retry',
      'view.refresh': 'Refresh',
      'view.open': 'Open',
      'view.count': 'documents',
      'view.path': 'Path',
    }

    const CSS = [
      '.va-toggle{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 9px;border-radius:8px;',
      'border:.5px solid var(--dsw-alias-border-l2,#e3e5e8);background:transparent;',
      'color:var(--dsw-alias-label-secondary,#5b616b);font:inherit;font-size:12px;line-height:1;cursor:pointer;',
      'transition:background-color .12s,border-color .12s,color .12s;white-space:nowrap}',
      '.va-toggle:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));',
      'color:var(--dsw-alias-label-primary,#1b1c1f)}',
      '.va-toggle:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-focus-ring-color,#2f6fed)}',
      '.va-toggle[data-enabled=true]{color:var(--dsw-alias-state-business-primary,#2f6fed);',
      'border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#2f6fed) 45%,transparent);',
      'background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#2f6fed) 10%,transparent)}',
      '.va-toggle[data-busy=true]{opacity:.55;cursor:progress}',
      '.va-toggle-dot{flex:none;width:6px;height:6px;border-radius:999px;border:1px solid currentColor;opacity:.5}',
      '.va-toggle[data-enabled=true] .va-toggle-dot{background:currentColor;border-color:currentColor;opacity:1}',
      '.va-toggle[data-failed=true]{color:var(--dsw-alias-state-error-primary,#c0392b);',
      'border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#c0392b) 50%,transparent)}',
      '.va-toggle svg{display:block;flex:none}',
      '.va-view{height:100%;overflow-y:auto;padding:28px 24px 48px;',
      'color:var(--dsw-alias-label-primary,#1b1c1f)}',
      '.va-view-inner{max-width:840px;margin:0 auto;display:flex;flex-direction:column;gap:16px}',
      '.va-view-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}',
      '.va-view-title{margin:0;font-size:16px;font-weight:600;line-height:24px}',
      '.va-view-sub{margin:4px 0 0;font-size:12px;line-height:18px;',
      'color:var(--dsw-alias-label-tertiary,#8a8f98);font-family:var(--ds-font-family-code,ui-monospace,monospace)}',
      '.va-view-action{flex:none;height:26px;padding:0 10px;border-radius:8px;font:inherit;font-size:12px;',
      'border:.5px solid var(--dsw-alias-border-l2,#e3e5e8);background:transparent;cursor:pointer;',
      'color:var(--dsw-alias-label-secondary,#5b616b)}',
      '.va-view-action:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));',
      'color:var(--dsw-alias-label-primary,#1b1c1f)}',
      '.va-view-action:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-focus-ring-color,#2f6fed)}',
      '.va-view-state{display:inline-flex;align-items:center;gap:5px;margin-left:8px;padding:0 8px;',
      'border-radius:999px;font-size:11px;line-height:18px;vertical-align:2px;',
      'color:var(--dsw-alias-label-tertiary,#8a8f98);border:.5px solid var(--dsw-alias-border-l2,#e3e5e8)}',
      '.va-view-state[data-on=true]{color:var(--dsw-alias-state-business-primary,#2f6fed);',
      'border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#2f6fed) 45%,transparent);',
      'background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#2f6fed) 8%,transparent)}',
      '.va-empty{padding:36px 20px;border:.5px dashed var(--dsw-alias-border-l2,#e3e5e8);border-radius:12px;',
      'text-align:center;color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:13px;line-height:22px}',
      '.va-empty-title{display:block;margin-bottom:6px;font-size:14px;font-weight:500;',
      'color:var(--dsw-alias-label-secondary,#5b616b)}',
      '.va-empty code{font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:12px}',
      '.va-files{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}',
      '.va-file{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border-radius:10px;',
      'border:.5px solid var(--dsw-alias-border-l1,#eceef1);background:var(--dsw-alias-bg-layer-1,#fff);',
      'color:inherit;font:inherit;text-align:left;cursor:pointer;transition:background-color .12s,border-color .12s}',
      '.va-file:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04));',
      'border-color:var(--dsw-alias-border-l2,#e3e5e8)}',
      '.va-file:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-focus-ring-color,#2f6fed)}',
      '.va-file-icon{display:grid;place-items:center;flex:none;width:30px;height:30px;border-radius:8px;',
      'background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#2f6fed) 10%,transparent);',
      'color:var(--dsw-alias-state-business-primary,#2f6fed)}',
      '.va-file-main{display:flex;flex-direction:column;min-width:0;flex:1;gap:2px}',
      '.va-file-name{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:500;line-height:18px;',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.va-file-sub{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#8a8f98);',
      'font-family:var(--ds-font-family-code,ui-monospace,monospace);white-space:nowrap;overflow:hidden;',
      'text-overflow:ellipsis}',
      '.va-file-open{flex:none;font-size:12px;color:var(--dsw-alias-state-business-primary,#2f6fed);',
      'opacity:0;transition:opacity .12s}',
      '.va-file:hover .va-file-open,.va-file:focus-visible .va-file-open{opacity:1}',
      '.va-note{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a8f98)}',
      '.va-error{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary,#c0392b)}',
    ].join('')

    /** Sparkline-in-a-frame mark used by the switch, the tab rows, and the empty state. */
    function Icon(props) {
      const size = props && typeof props.size === 'number' ? props.size : 14
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          'aria-hidden': true,
          fill: 'none',
        },
        h('rect', {
          x: 1.5,
          y: 2.5,
          width: 13,
          height: 11,
          rx: 2.5,
          stroke: 'currentColor',
          strokeWidth: 1.2,
          opacity: 0.75,
        }),
        h('path', {
          d: 'M4 10.2 6.3 7.4 8.4 9.1 11.9 5.2',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
        h('circle', { cx: 11.9, cy: 5.2, r: 1.15, fill: 'currentColor' }),
      )
    }

    /** Renders nothing and keeps the hooks order stable when a slot omits `useProjection`. */
    function noProjection() {
      return undefined
    }

    function formatSize(bytes) {
      if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return ''
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    /** `dsh-resource://file/session/<id>/<relative path>` opens the file in the right Sidebar. */
    function fileAddress(sessionId, path) {
      const segments = path
        .replace(/\\/gu, '/')
        .replace(/^(?:\.\/)+/u, '')
        .split('/')
        .filter((segment) => segment !== '')
        .map((segment) => encodeURIComponent(segment))
      return `dsh-resource://file/session/${encodeURIComponent(sessionId)}/${segments.join('/')}`
    }

    /** Install the plugin stylesheet; the Cordis effect removes it on unload. */
    function installStyles() {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-visual-answer'
      tag.textContent = CSS
      document.head.appendChild(tag)
      return () => tag.remove()
    }

    function apply(ctx) {
      const t = ctx.locale.bind(NS)

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'visual-answer: dictionaries')
      ctx.effect(() => installStyles(), 'visual-answer: styles')

      /**
       * Composer switch. The Host projection is the only source of truth, so the
       * control matches the prompt after reload, restart, fork, and replay.
       */
      function VisualToggle(props) {
        const translate = props.t
        const sessionId = props.sessionId
        const useProjection =
          typeof props.useProjection === 'function' ? props.useProjection : noProjection
        const projection = useProjection(PROJECTION)
        const [fallback, setFallback] = React.useState(false)
        const [busy, setBusy] = React.useState(false)
        const [error, setError] = React.useState('')

        const known = projection !== undefined && projection !== null
        const enabled = known ? projection.enabled === true : fallback

        const toggle = React.useCallback(async () => {
          if (busy) return
          setBusy(true)
          setError('')
          try {
            const line = `/${COMMAND} ${enabled ? 'off' : 'on'}`
            const result = await ctx.remote.commands.execute(sessionId, line, [])
            if (result === undefined || result.ok !== true) {
              const detail =
                result && result.error ? result.error.message || result.error.code || '' : ''
              setError(detail === '' ? translate('toggle.error') : `${translate('toggle.error')}: ${detail}`)
              return
            }
            if (!known) setFallback(!enabled)
          } catch (cause) {
            const detail = cause && cause.message ? cause.message : String(cause)
            setError(`${translate('toggle.error')}: ${detail}`)
          } finally {
            setBusy(false)
          }
        }, [busy, enabled, known, sessionId, translate])

        const failed = error !== ''
        const title = failed ? error : translate(enabled ? 'toggle.on' : 'toggle.off')
        return h(
          'button',
          {
            type: 'button',
            className: 'va-toggle',
            'data-enabled': enabled ? 'true' : 'false',
            'data-busy': busy ? 'true' : undefined,
            'data-failed': failed ? 'true' : undefined,
            'aria-pressed': enabled,
            title,
            disabled: busy,
            onClick: toggle,
          },
          h(Icon, null),
          h('span', null, translate('toggle.label')),
          h('span', { className: 'va-toggle-dot', 'aria-hidden': true }),
          failed ? h('span', null, translate('toggle.failed')) : null,
        )
      }

      /**
       * Session tab listing the documents this session produced. It lists the
       * directory through the authenticated workspace file Remote and opens a
       * row as the Sidebar's own HTML preview.
       */
      function VisualAnswersView(props) {
        const translate = props.t
        const sessionId = props.sessionId
        const useProjection =
          typeof props.useProjection === 'function' ? props.useProjection : noProjection
        const mode = useProjection(PROJECTION)
        const modeKnown = mode !== undefined && mode !== null
        const modeOn = modeKnown && mode.enabled === true
        const [state, setState] = React.useState({ status: 'loading', entries: [], error: '' })
        const [nonce, setNonce] = React.useState(0)

        React.useEffect(() => {
          const controller = new AbortController()
          let alive = true
          setState((previous) => ({ ...previous, status: 'loading' }))
          Promise.resolve()
            .then(() => ctx.remote.workspaceFiles.list(sessionId, DIRECTORY, controller.signal))
            .then((result) => {
              if (!alive) return
              if (result !== undefined && result.ok === true) {
                const entries = (result.value.entries || [])
                  .filter(
                    (entry) =>
                      entry !== null &&
                      typeof entry === 'object' &&
                      entry.type === 'file' &&
                      /\.html?$/iu.test(String(entry.name)),
                  )
                  .sort((left, right) =>
                    left.name < right.name ? 1 : left.name > right.name ? -1 : 0,
                  )
                setState({ status: entries.length === 0 ? 'empty' : 'ready', entries, error: '' })
                return
              }
              const detail =
                result !== undefined && result.error
                  ? result.error.message || result.error.code || ''
                  : ''
              setState({ status: 'empty', entries: [], error: detail })
            })
            .catch((cause) => {
              if (!alive) return
              if (cause && cause.name === 'AbortError') return
              setState({
                status: 'error',
                entries: [],
                error: cause && cause.message ? cause.message : String(cause),
              })
            })
          return () => {
            alive = false
            controller.abort()
          }
        }, [sessionId, nonce])

        const open = React.useCallback(
          (name) => {
            try {
              ctx.sidebarRight.openResource(fileAddress(sessionId, `${DIRECTORY}/${name}`))
            } catch (cause) {
              setState((previous) => ({
                ...previous,
                error: cause && cause.message ? cause.message : String(cause),
              }))
            }
          },
          [sessionId],
        )

        const rows = state.entries.map((entry) =>
          h(
            'li',
            { key: entry.name },
            h(
              'button',
              {
                type: 'button',
                className: 'va-file',
                title: `${DIRECTORY}/${entry.name}`,
                onClick: () => open(entry.name),
              },
              h('span', { className: 'va-file-icon' }, h(Icon, { size: 16 })),
              h(
                'span',
                { className: 'va-file-main' },
                h('span', { className: 'va-file-name' }, entry.name),
                h(
                  'span',
                  { className: 'va-file-sub' },
                  [formatSize(entry.size), `${DIRECTORY}/${entry.name}`].filter(Boolean).join(' · '),
                ),
              ),
              h('span', { className: 'va-file-open' }, translate('view.open')),
            ),
          ),
        )

        const body =
          state.status === 'loading'
            ? h('p', { className: 'va-note' }, translate('view.loading'))
            : state.entries.length > 0
              ? h('ul', { className: 'va-files' }, rows)
              : h(
                  'div',
                  { className: 'va-empty' },
                  h('span', { className: 'va-empty-title' }, translate('view.empty.title')),
                  h(
                    'span',
                    null,
                    translate('view.empty.body'),
                    ' ',
                    h('code', null, DIRECTORY),
                  ),
                )

        return h(
          'div',
          { className: 'va-view' },
          h(
            'div',
            { className: 'va-view-inner' },
            h(
              'header',
              { className: 'va-view-head' },
              h(
                'div',
                null,
                h(
                  'h2',
                  { className: 'va-view-title' },
                  translate('view.title'),
                  modeKnown
                    ? h(
                        'span',
                        { className: 'va-view-state', 'data-on': modeOn ? 'true' : 'false' },
                        translate(modeOn ? 'view.modeOn' : 'view.modeOff'),
                      )
                    : null,
                ),
                h(
                  'p',
                  { className: 'va-view-sub' },
                  `${translate('view.hint')} ${DIRECTORY}`,
                ),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'va-view-action',
                  onClick: () => setNonce((value) => value + 1),
                },
                translate('view.refresh'),
              ),
            ),
            body,
            state.status === 'error'
              ? h('p', { className: 'va-error' }, `${translate('view.error')}: ${state.error}`)
              : state.error !== ''
                ? h('p', { className: 'va-note' }, state.error)
                : null,
          ),
        )
      }

      ctx.slots.inject('conversation.input.left', () =>
        ctx.slots.register(
          {
            name: 'conversation.input.left',
            id: 'dsh-visual-answer-toggle',
            order: 30,
            locale: NS,
          },
          VisualToggle,
        ),
      )

      ctx.slots.inject('conversation.view', () =>
        ctx.slots.register(
          {
            name: 'conversation.view',
            id: 'visual-answers',
            order: 20,
            label: () => t('view.title'),
            locale: NS,
          },
          VisualAnswersView,
        ),
      )
    }

    return {
      name: 'dsh-visual-answer-client',
      inject: ['slots', 'locale', 'remote', 'remote.commands', 'remote.workspaceFiles', 'sidebarRight'],
      apply,
    }
  },
})

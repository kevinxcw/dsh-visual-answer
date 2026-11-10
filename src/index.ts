import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Stable Loader identity. */
export const name = 'dsh-visual-answer'

/** Services the plugin needs before it activates. */
export const inject = ['commands', 'systemPrompt', 'sessionProjections']

/** Command that flips the mode for one session. */
const COMMAND = 'visual'

/**
 * Directory, relative to the session working directory, where the model writes
 * the pages. Fixed on purpose: the Client tab lists exactly this path, so a
 * configurable directory would desynchronize the two halves.
 */
const DIRECTORY = '.dsh/visual'

/** Projection key shared by the Host fold and the Client `useProjection` read. */
const PROJECTION = 'visualMode' as const

/** Plugin configuration; every field is editable from `cordis.patch.yml`. */
export interface Config {
  /** Order of the injected prompt section in the assembled system prompt. */
  sectionOrder: number
}

export const Config: z<Config> = z.object({
  sectionOrder: z.number().default(11800),
})

/** Folded per-session state of the visual-answer switch. */
interface VisualState {
  enabled: boolean
  running: { commandId: string; wanted: boolean } | null
}

/** What the Web Client reads; two frozen constants keep the reference stable. */
interface VisualView {
  enabled: boolean
}

declare module '@deepseek-ai/dsh-session-projection' {
  interface SessionProjectionMap {
    visualMode: VisualView
  }
}

const VIEW_ON: VisualView = { enabled: true }
const VIEW_OFF: VisualView = { enabled: false }

/**
 * The switch lives in the session log: `/visual on|off` is a recorded command,
 * so the mode survives reload, restart, fork and replay without extra storage.
 */
const visualModeProjection = {
  key: PROJECTION,
  stateVersion: 1,
  stateSchema: zod.object({
    enabled: zod.boolean(),
    running: zod
      .object({ commandId: zod.string(), wanted: zod.boolean() })
      .strict()
      .nullable(),
  }).strict(),
  init: (): VisualState => ({ enabled: false, running: null }),
  apply: (state: VisualState, event: { type: string; data: unknown }): VisualState => {
    if (event.type === 'command/run') {
      const data = event.data as { commandId: string; name: string; args?: string }
      if (data.name !== COMMAND) return state
      const argument = (data.args ?? '').trim().toLowerCase()
      const wanted = argument === 'on' ? true : argument === 'off' ? false : !state.enabled
      return { ...state, running: { commandId: data.commandId, wanted } }
    }
    if (event.type === 'command/done') {
      const data = event.data as { commandId: string; kind: string }
      if (state.running === null || data.commandId !== state.running.commandId) return state
      return {
        enabled: data.kind === 'success' ? state.running.wanted : state.enabled,
        running: null,
      }
    }
    return state
  },
  wire: {
    viewSchema: zod.object({ enabled: zod.boolean() }).strict(),
    view: (state: VisualState): VisualView => (state.enabled ? VIEW_ON : VIEW_OFF),
  },
}

/**
 * The skill text the model receives while the switch is on. It names the exact
 * output path so the Client tab can list the result, and it makes a missing file
 * an explicit failure instead of a silent prose answer.
 */
function skillText(): string {
  return `## Visual answers

Visual answer mode is ON for this session. The answer is a page, not a paragraph.

1. Write exactly one self-contained HTML file with the \`write\` tool to \`${DIRECTORY}/<YYYYMMDD-HHmmss>-<slug>.html\`, relative to the session working directory; create the directory first when it is missing. Keep the timestamp sortable and the slug two to four lowercase ASCII words.
2. The file IS the answer. Emit one complete document: \`<!doctype html>\`, \`<html lang="...">\`, \`<meta charset="utf-8">\`, \`<meta name="viewport" content="width=device-width, initial-scale=1">\`, then inline CSS, inline SVG or canvas, and inline \`<script>\`. No CDN, no remote fonts, images or stylesheets: it must render offline and by itself.
3. Make it interactive where that helps understanding: tabs, toggles, hover detail, step-through timelines, animated charts, counters. It must still read correctly with a pointer and a keyboard.
4. Write the visible copy in the user's language. Assume a light card surface and add a \`@media (prefers-color-scheme: dark)\` block so it also reads in a dark browser.
5. After the file exists, reply with at most two short sentences and one relative Markdown link, for example \`[打开可视化](${DIRECTORY}/20261110-1802-pipeline-flow.html)\`. Never paste the HTML into the reply, never wrap it in a code fence, and never describe the file without writing it.
6. If the file cannot be written, say exactly what failed. An answer that leaves no file is incomplete.

Keep the document under roughly 80 KB; reuse CSS classes instead of repeating inline styles.`
}

/**
 * Register the switch, its session projection, and the conditional skill prompt.
 * @param ctx - Host context carrying commands, system prompt, and projections.
 * @param config - validated plugin configuration.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const handle = await ctx.sessionProjections.register(visualModeProjection)

  ctx.commands.register({
    name: COMMAND,
    description: 'Turn visual answers on or off for this session',
    input: { hint: '[on|off]' },
    handler: ({ agent, rawInput }) => {
      const argument = rawInput.trim().toLowerCase()
      if (argument !== '' && argument !== 'on' && argument !== 'off') {
        return { kind: 'error', text: '用法：/visual on|off，留空则切换。' }
      }
      const current = handle.stateOf(agent.session)?.enabled === true
      const next = argument === '' ? !current : argument === 'on'
      return {
        kind: 'success',
        text: next
          ? `可视化回答已开启：模型会把答案写成 ${DIRECTORY}/ 下的可交互 HTML 文档。`
          : '可视化回答已关闭：恢复普通文字回答。',
      }
    },
  })

  ctx.systemPrompt.section({
    name: 'visual-answer:skill',
    order: config.sectionOrder,
    text: (context) => {
      const agent = context.agent
      if (agent === undefined) return ''
      return handle.stateOf(agent.session)?.enabled === true ? skillText() : ''
    },
  })
}

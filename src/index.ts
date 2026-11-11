import { randomUUID } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-system-prompt'
import {
  gateAction,
  isHtmlName,
  pickProduced,
  validateHtml,
  type Verdict,
  type VisualEntry,
} from './gate.js'

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

/** How far before a turn start an mtime may sit and still belong to that turn. */
const MTIME_SLACK_MS = 1_500

/** Plugin configuration; every field is editable from `cordis.patch.yml`. */
export interface Config {
  /**
   * Order of the block inside the dynamic runtime-context snapshot. It only
   * decides placement next to other context contributions, not authority.
   */
  contextOrder: number
}

export const Config: z<Config> = z.object({
  contextOrder: z.number().default(300),
})

/** Folded per-session state of the visual-answer switch. */
interface VisualState {
  enabled: boolean
  /** True once this session ever switched the mode on, so turning it off can say so. */
  ever: boolean
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
  stateVersion: 2,
  stateSchema: zod.object({
    enabled: zod.boolean(),
    ever: zod.boolean().default(false),
    running: zod
      .object({ commandId: zod.string(), wanted: zod.boolean() })
      .strict()
      .nullable(),
  }).strict(),
  init: (): VisualState => ({ enabled: false, ever: false, running: null }),
  apply: (state: VisualState, event: { type: string; data: unknown }): VisualState => {
    if (event.type === 'command/run') {
      const data = event.data as { commandId: string; name: string; args?: string }
      if (data.name !== COMMAND) return state
      const argument = (data.args ?? '').trim().toLowerCase()
      // An unknown argument must not flip the switch; the handler rejects it.
      const wanted =
        argument === 'on' ? true : argument === 'off' ? false : argument === '' ? !state.enabled : null
      if (wanted === null) return state
      return { ...state, running: { commandId: data.commandId, wanted } }
    }
    if (event.type === 'command/done') {
      const data = event.data as { commandId: string; kind: string }
      if (state.running === null || data.commandId !== state.running.commandId) return state
      const enabled = data.kind === 'success' ? state.running.wanted : state.enabled
      return {
        enabled,
        ever: state.ever || enabled,
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

/** The structural slice of a live Agent this plugin touches. */
interface LiveAgent {
  readonly session: LiveSession
  /** Queue one message for the next step of the running turn without waking it. */
  inject(message: unknown): void
}

/** The structural slice of a Session this plugin touches. */
interface LiveSession {
  readonly id: string
  readonly header?: { readonly cwd?: string }
}

/**
 * One turn's evidence, kept in memory only.
 *
 * `visual` and `ever` are snapshots taken when the turn opened: the prompt for a
 * turn is assembled once, so flipping the switch mid-turn must not change that
 * turn's contract. The change applies from the next turn instead.
 */
interface TurnTrace {
  visual: boolean
  ever: boolean
  startedAt: number
  text: string
  retried: boolean
  outcome: 'pending' | 'passed' | 'retried' | 'miss'
  file?: string
}

/**
 * The block the model receives while visual answers are on: the output contract
 * plus the state line, framed in the tag the model can search for.
 *
 * It lives in the dynamic runtime context rather than in the system prompt, for
 * two reasons. Positioning: the switch is a per-session operational mode like
 * the file policy or the approval policy, both of which the harness reports as
 * runtime context. Caching: the routes this plugin targets update the system
 * prompt leading-only, so a section would rewrite the first message and
 * invalidate the whole prompt cache on every toggle; a context snapshot is a
 * user-role message appended at the tail, which leaves the prefix intact.
 */
function onText(): string {
  return `<visual-answer mode="on">
## Visual answers: on

Visual answer mode is ON for this session. Every turn in this conversation is expected to leave one page.

1. Write exactly one self-contained HTML file with the \`write\` tool to \`${DIRECTORY}/<YYYYMMDD-HHmmss>-<slug>.html\`, relative to the session working directory; create the directory first when it is missing. Keep the timestamp sortable and the slug two to four lowercase ASCII words.
2. The file IS the answer. Emit one complete document: \`<!doctype html>\`, \`<html lang="...">\`, \`<meta charset="utf-8">\`, \`<meta name="viewport" content="width=device-width, initial-scale=1">\`, then inline CSS, inline SVG or canvas, and inline \`<script>\`. No CDN, no remote fonts, images or stylesheets: it must render offline and by itself.
3. Make it interactive where that helps understanding: tabs, toggles, hover detail, step-through timelines, animated charts, counters. It must still read correctly with a pointer and a keyboard.
4. Write the visible copy in the user's language. Assume a light card surface and add a \`@media (prefers-color-scheme: dark)\` block so it also reads in a dark browser.
5. After the file exists, reply with at most two short sentences and one relative Markdown link, for example \`[打开可视化](${DIRECTORY}/20261110-1802-pipeline-flow.html)\`. Never paste the HTML into the reply, never wrap it in a code fence, and never describe the file without writing it.
6. Operational turns (running a command, committing, editing files) still get a page: a short receipt with what ran, the key output, and any link. Do not answer those turns in prose alone either.
7. When a turn ends without a valid page, the Host adds exactly one corrective step. If that step still leaves no page, the turn closes with nothing produced: there is no fallback, and the user will simply see whatever you replied. Write the page in the turn itself.

Keep the document under roughly 80 KB; reuse CSS classes instead of repeating inline styles.
</visual-answer>`
}

/**
 * The note a session keeps after the switch was turned off. Without it the only
 * trace of the mode is the transcript: earlier pages, links and tool calls that
 * make the model continue the page format although the instruction is gone. The
 * wording also disowns a conversation summary that was written while the mode
 * was still on, and tells the model what to record the next time it summarizes.
 */
function offText(): string {
  return `<visual-answer mode="off">
## Visual answers: off

Visual answer mode was switched OFF in this session. This line is the current state and it replaces every earlier statement about visual mode: conversation summaries, earlier pages and their links included.

- Answer in ordinary prose. Do not write HTML documents to \`${DIRECTORY}/\`, do not open with \`<!doctype html>\`, and do not continue the format because an earlier turn used it.
- Earlier pages in this conversation are history, not a format to continue: do not link them, quote them, or produce a sibling page unless the user asks for one.
- A conversation summary that still describes one page per turn is describing the time before the switch; it does not apply now.
- When you summarize this conversation later, record that visual answers are off, and leave the page contract out of the summary.
- If the user explicitly asks for a page, write it once and say that the visual mode is off.
</visual-answer>`
}

/** Resolve the session working directory without hard-depending on the service. */
function resolveDirectory(ctx: Context, session: LiveSession): string | undefined {
  try {
    const service = (ctx as unknown as { get(name: string): unknown }).get('workingDirectory') as
      | { get(target: LiveSession): string }
      | undefined
    const resolved = service?.get(session)
    if (typeof resolved === 'string' && resolved !== '') return resolved
  } catch {
    // Fall through to the header value: a missing service must not break the gate.
  }
  const cwd = session.header?.cwd
  return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
}

/** List the visual directory, treating every failure as "nothing there yet". */
async function listVisual(directory: string): Promise<VisualEntry[]> {
  try {
    const dirents = await readdir(directory, { withFileTypes: true })
    const entries: VisualEntry[] = []
    for (const dirent of dirents) {
      if (!dirent.isFile()) continue
      const info = await stat(join(directory, dirent.name))
      entries.push({ name: dirent.name, size: info.size, mtimeMs: info.mtimeMs })
    }
    return entries
  } catch {
    return []
  }
}

/** Read and validate the newest page produced during the current turn. */
async function inspectProduced(
  directory: string,
  sinceMs: number,
): Promise<{ entry: VisualEntry; verdict: Verdict } | undefined> {
  const entries = await listVisual(directory)
  const entry = pickProduced(entries, sinceMs)
  if (entry === undefined) return undefined
  try {
    return { entry, verdict: validateHtml(await readFile(join(directory, entry.name), 'utf8')) }
  } catch {
    return { entry, verdict: { ok: false, reason: 'the file could not be read' } }
  }
}

/** Format a byte count for the status command and the tab. */
function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Build the corrective message injected at the end of a turn that produced no
 * usable page. It is a user-role message with its own source kind, so it is
 * durable, visible in the transcript, and never mistaken for the user speaking.
 */
function gateMessage(entry: VisualEntry | undefined, verdict: Verdict | undefined): unknown {
  const detail =
    entry === undefined
      ? `本轮没有在 ${DIRECTORY}/ 下写入任何 HTML 文件。`
      : `${DIRECTORY}/${entry.name} 没有通过校验：${verdict?.reason ?? 'unknown reason'}。`
  const text = `可视化门禁（visual gate）：本轮即将结束时还没有可用的页面。${detail}

请立刻用 write 工具把文件写到 ${DIRECTORY}/<YYYYMMDD-HHmmss>-<slug>.html，然后再结束本轮：
- 内容问答：写成完整的、自包含的可交互页面。
- 操作型请求（执行命令、提交代码、改文件）：写一张极简的「操作回执页」，包含做了什么、关键输出和相关链接，二十行以内即可。
不要只回复文字：这是本轮唯一一次补写机会，再没有页面，本轮就以「未产出」收尾。`
  return Object.freeze({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'visual-gate' },
  })
}

/**
 * Register the switch, its session projection, the tagged runtime-context
 * block, and the turn-end gate.
 * @param ctx - Host context carrying commands, prompt contexts, and projections.
 * @param config - validated plugin configuration.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const handle = await ctx.sessionProjections.register(visualModeProjection)

  /** In-memory turn evidence; the session log stays the source of truth for the switch. */
  const traces = new Map<string, TurnTrace>()

  /** Read the folded switch state from the structural Session view. */
  const isEnabled = (session: LiveSession): boolean =>
    handle.stateOf(session as never)?.enabled === true

  /**
   * The mode this session runs under right now. The open turn's snapshot wins
   * over the live fold, so a switch mid-turn never contradicts the running
   * turn's contract; the runtime-context block reads this, not the live fold.
   */
  const modeOf = (session: LiveSession): { visual: boolean; ever: boolean } => {
    const trace = traces.get(session.id)
    if (trace !== undefined) return { visual: trace.visual, ever: trace.ever }
    const state = handle.stateOf(session as never)
    return { visual: state?.enabled === true, ever: state?.ever === true }
  }

  /** Open a fresh trace, freezing the switch state this turn runs under. */
  const openTrace = (session: LiveSession): TurnTrace => {
    const state = handle.stateOf(session as never)
    const created: TurnTrace = {
      visual: state?.enabled === true,
      ever: state?.ever === true,
      startedAt: Date.now(),
      text: '',
      retried: false,
      outcome: 'pending',
    }
    traces.set(session.id, created)
    return created
  }

  const traceOf = (session: LiveSession): TurnTrace => traces.get(session.id) ?? openTrace(session)

  const listen = <K extends 'session/event' | 'agent/turn-stopping'>(
    event: K,
    listener: K extends 'session/event'
      ? (session: LiveSession, event: { type: string; time?: number; data?: unknown }) => void
      : (payload: { agent: LiveAgent; turn: number; signal: AbortSignal }) => Promise<void>,
  ): void => {
    const register = (ctx as unknown as { on(name: string, fn: unknown): unknown }).on.bind(ctx)
    register(event, listener)
  }

  // Evidence for the gate: when the turn started, what it answered, whether it
  // already got its one corrective step.
  listen('session/event', (session, event) => {
    if (event.type === 'turn/start') {
      openTrace(session)
      return
    }
    if (event.type === 'assistant/message') {
      const data = event.data as { message?: { content?: Array<{ type: string; text?: string }> } }
      const blocks = data.message?.content ?? []
      const text = blocks
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text ?? '')
        .join('\n')
        .trim()
      if (text !== '') traceOf(session).text = text
      return
    }
  })

  const gate = async ({ agent, signal }: { agent: LiveAgent; signal: AbortSignal }): Promise<void> => {
    if (signal.aborted) return
    const trace = traceOf(agent.session)
    // The turn's contract was fixed when it opened; a mid-turn switch waits.
    if (!trace.visual) return
    const cwd = resolveDirectory(ctx, agent.session)
    if (cwd === undefined) return
    const directory = join(cwd, DIRECTORY)
    const produced = await inspectProduced(directory, trace.startedAt - MTIME_SLACK_MS)
    const action = gateAction(produced !== undefined && produced.verdict.ok, trace.retried)
    if (action === 'pass' && produced !== undefined) {
      trace.outcome = 'passed'
      trace.file = produced.entry.name
      return
    }
    if (signal.aborted) return
    if (action === 'retry') {
      trace.retried = true
      trace.outcome = 'retried'
      agent.inject(gateMessage(produced?.entry, produced?.verdict))
      return
    }
    // One correction was offered and refused: the turn closes with no page.
    trace.outcome = 'miss'
  }

  // The gate itself: the turn is about to close with no further input pending.
  // A throwing listener would fail the whole turn, so every path stays guarded.
  listen('agent/turn-stopping', async ({ agent, signal }) => {
    try {
      await gate({ agent, signal })
    } catch (error) {
      ctx.logger?.warn?.(`dsh-visual-answer: gate skipped: ${String(error)}`)
    }
  })

  ctx.commands.register({
    name: COMMAND,
    description: 'Turn visual answers on or off for this session, or report the gate state',
    input: { hint: '[on|off|status]' },
    handler: async ({ agent, rawInput }) => {
      const argument = rawInput.trim().toLowerCase()
      if (argument !== '' && argument !== 'on' && argument !== 'off' && argument !== 'status') {
        return { kind: 'error', text: '用法：/visual on|off|status，留空则切换。' }
      }
      if (argument === 'status') {
        const enabled = isEnabled(agent.session)
        const cwd = resolveDirectory(ctx, agent.session)
        if (cwd === undefined) {
          return { kind: 'error', text: '无法解析当前会话的工作目录。' }
        }
        const directory = join(cwd, DIRECTORY)
        const entries = await listVisual(directory)
        const pages = entries.filter((entry) => isHtmlName(entry.name))
        const latest = pages.reduce<VisualEntry | undefined>(
          (best, entry) => (best === undefined || entry.mtimeMs > best.mtimeMs ? entry : best),
          undefined,
        )
        let verdict: Verdict | undefined
        if (latest !== undefined) {
          try {
            verdict = validateHtml(await readFile(join(directory, latest.name), 'utf8'))
          } catch {
            verdict = { ok: false, reason: '读取失败' }
          }
        }
        const trace = traces.get(agent.session.id)
        const outcomes: Record<TurnTrace['outcome'], string> = {
          pending: '本轮尚未判定',
          passed: '通过：本轮由模型写出了页面',
          retried: '已强制补写一轮',
          miss: '未产出：补写一轮后仍然没有页面，本轮作罢',
        }
        const lines = [
          `模式：${enabled ? '开启' : '关闭'}`,
          `目录：${directory}`,
          `文档：${pages.length} 个`,
          latest === undefined
            ? '最新：暂无'
            : `最新：${latest.name} · ${formatSize(latest.size)} · ${
                verdict?.ok === true ? '校验通过' : `校验失败（${verdict?.reason ?? 'unknown'}）`
              }`,
          `最近一轮：${trace === undefined ? '未知' : trace.visual ? '可视化轮' : '普通轮'}（该轮开始时的快照）`,
          `上一次门禁：${trace === undefined ? '本次启动后还没有结束的轮次' : outcomes[trace.outcome]}`,
        ]
        return { kind: 'success', text: lines.join('\n') }
      }
      const current = isEnabled(agent.session)
      const next = argument === '' ? !current : argument === 'on'
      return {
        kind: 'success',
        text: next
          ? `可视化回答已开启，从下一轮起生效：模型会把答案写成 ${DIRECTORY}/ 下的可交互 HTML 文档；缺少文档的轮次会被门禁拦下。`
          : `可视化回答已关闭，从下一轮起生效：恢复普通文字回答。`,
      }
    },
  })

  // The only prompt contribution: a durable user-role snapshot, appended at the
  // tail of the current step's messages. It is emitted when the text changes
  // (or when compaction shadowed the previous snapshot), and the snapshot intro
  // already says it supersedes earlier runtime-context snapshots. The system
  // prompt is deliberately left untouched: it is the cached prefix, and every
  // toggle that rewrote it would invalidate the whole conversation.
  ctx.systemPrompt.context({
    name: 'visual-answer:mode',
    order: config.contextOrder,
    interpolate: false,
    text: (context) => {
      const agent = context.agent
      if (agent === undefined) return ''
      const mode = modeOf(agent.session)
      if (mode.visual) return onText()
      // A session that used the mode still carries the format in its transcript.
      return mode.ever ? offText() : ''
    },
  })
}

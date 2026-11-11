/**
 * Integration test for the Host wiring: a stub Cordis context drives the real
 * `apply()` of the built package, folds the real session projection, and calls
 * the real turn-stopping listener. It proves the gate retries once, gives up
 * without writing anything itself, and that a mid-turn switch waits for the
 * next turn.
 */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../lib/index.js'

const VALID_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>p</title></head>
<body><p>page</p></body></html>
`

/** Build the stub context the Host half needs, plus the handles to drive it. */
async function harness() {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-visual-gate-'))
  const listeners = new Map()
  const projections = []
  const commands = []
  const contexts = []
  let state = { enabled: false, ever: false, running: null }

  const ctx = {
    sessionProjections: {
      register: async (definition) => {
        projections.push(definition)
        return { stateOf: () => state }
      },
    },
    commands: { register: (definition) => (commands.push(definition), () => {}) },
    systemPrompt: {
      // The plugin must never contribute a system-prompt section: on a
      // leading-only route that rewrites the first message and drops the whole
      // prompt cache on every toggle.
      section: () => {
        throw new Error('the plugin must not register a system-prompt section')
      },
      context: (definition) => (contexts.push(definition), () => {}),
    },
    on(name, listener) {
      const bucket = listeners.get(name) ?? []
      bucket.push(listener)
      listeners.set(name, bucket)
      return () => {}
    },
    get: () => ({ get: () => cwd }),
  }

  await apply(ctx, { contextOrder: 300 })
  const projection = projections[0]
  state = projection.init()

  const fold = (type, data) => {
    state = projection.apply(state, { type, data })
  }
  const emit = async (name, ...args) => {
    for (const listener of listeners.get(name) ?? []) await listener(...args)
  }
  const switchOn = () => {
    fold('command/run', { commandId: 'on', name: 'visual', args: ' on' })
    fold('command/done', { commandId: 'on', kind: 'success' })
  }
  const switchOff = () => {
    fold('command/run', { commandId: 'off', name: 'visual', args: ' off' })
    fold('command/done', { commandId: 'off', kind: 'success' })
  }

  return {
    cwd,
    fold,
    emit,
    commands,
    contexts,
    stateOf: () => state,
    switchOn,
    switchOff,
  }
}

test('the gate retries once, then closes the turn without writing a page', async () => {
  const { cwd, emit, switchOn } = await harness()
  switchOn()

  const session = { id: 'session-test', header: { cwd } }
  const injected = []
  const agent = { session, inject: (message) => injected.push(message) }
  const signal = new AbortController().signal

  await emit('session/event', session, { type: 'turn/start', data: { turn: 1 }, time: Date.now() })
  await emit('session/event', session, {
    type: 'assistant/message',
    data: { turn: 1, message: { content: [{ type: 'text', text: '已提交一版 git。' }] } },
  })

  await emit('agent/turn-stopping', { agent, turn: 1, signal })
  assert.equal(injected.length, 1)
  const text = injected[0].content[0].text
  assert.match(text, /visual gate/u)
  assert.match(text, /\.dsh\/visual/u)

  // Second pass offers no further correction and writes nothing at all.
  await emit('agent/turn-stopping', { agent, turn: 1, signal })
  assert.equal(injected.length, 1)
  assert.deepEqual(await readdir(join(cwd, '.dsh/visual')).catch(() => []), [])
  await rm(cwd, { recursive: true, force: true })
})

test('a real page from the turn passes without any retry', async () => {
  const { cwd, emit, switchOn } = await harness()
  switchOn()

  const session = { id: 'session-ok', header: { cwd } }
  const injected = []
  const agent = { session, inject: (message) => injected.push(message) }
  const signal = new AbortController().signal

  await emit('session/event', session, { type: 'turn/start', data: { turn: 1 }, time: Date.now() })
  await mkdir(join(cwd, '.dsh/visual'), { recursive: true })
  await writeFile(join(cwd, '.dsh/visual/20261110-2000-flow.html'), VALID_PAGE, 'utf8')
  await emit('session/event', session, {
    type: 'assistant/message',
    data: { turn: 1, message: { content: [{ type: 'text', text: '页面已生成。' }] } },
  })

  await emit('agent/turn-stopping', { agent, turn: 1, signal })
  assert.equal(injected.length, 0)
  assert.equal((await readdir(join(cwd, '.dsh/visual'))).length, 1)
  await rm(cwd, { recursive: true, force: true })
})

test('the gate stays quiet while the mode is off', async () => {
  const { cwd, emit } = await harness()
  const session = { id: 'session-off', header: { cwd } }
  const injected = []
  const agent = { session, inject: (message) => injected.push(message) }

  await emit('session/event', session, { type: 'turn/start', data: { turn: 1 }, time: Date.now() })
  await emit('agent/turn-stopping', { agent, turn: 1, signal: new AbortController().signal })
  assert.equal(injected.length, 0)
  assert.deepEqual(await readdir(join(cwd, '.dsh/visual')).catch(() => []), [])
  await rm(cwd, { recursive: true, force: true })
})

test('a switch mid-turn applies to the next turn, not the running one', async () => {
  const { cwd, emit, fold, switchOn, switchOff, contexts } = await harness()
  const context = contexts[0]
  const session = { id: 'session-mid-turn', header: { cwd } }
  const agent = { session, inject: () => {} }
  const signal = new AbortController().signal
  const text = () => context.text({ agent: { session } })

  switchOn()
  await emit('session/event', session, { type: 'turn/start', data: { turn: 1 }, time: Date.now() })
  assert.match(text(), /Visual answer mode is ON/u)

  // The user turns the mode off while turn 1 is still running.
  switchOff()
  assert.equal(text(), text())
  assert.match(text(), /Visual answer mode is ON/u, 'the running turn keeps its contract')

  const injected = []
  agent.inject = (message) => injected.push(message)
  await emit('agent/turn-stopping', { agent, turn: 1, signal })
  assert.equal(injected.length, 1, 'the running turn is still gated')

  // Turn 2 opens with the new state: the off notice, and no gate.
  await emit('session/event', session, { type: 'turn/start', data: { turn: 2 }, time: Date.now() })
  assert.match(text(), /Visual answers: off/u)
  await emit('agent/turn-stopping', { agent, turn: 2, signal })
  assert.equal(injected.length, 1)
  assert.ok(fold !== undefined)
  await rm(cwd, { recursive: true, force: true })
})

test('/visual rejects unknown arguments without flipping the switch', async () => {
  const { commands, stateOf, fold, switchOn } = await harness()
  switchOn()

  fold('command/run', { commandId: 'c2', name: 'visual', args: ' bogus' })
  fold('command/done', { commandId: 'c2', kind: 'error' })
  assert.equal(stateOf().enabled, true)

  const result = await commands[0].handler({
    agent: { session: { id: 's', header: { cwd: tmpdir() } } },
    rawInput: 'bogus',
  })
  assert.equal(result.kind, 'error')
})

test('/visual status reports the mode, the directory, and the newest page', async () => {
  const { cwd, commands, switchOn } = await harness()
  switchOn()
  await mkdir(join(cwd, '.dsh/visual'), { recursive: true })
  await writeFile(join(cwd, '.dsh/visual/broken.html'), '<html><body>cut', 'utf8')
  // Written last so it is the newest entry the status command inspects.
  await writeFile(join(cwd, '.dsh/visual/20261110-2000-flow.html'), VALID_PAGE, 'utf8')

  const result = await commands[0].handler({
    agent: { session: { id: 's', header: { cwd } } },
    rawInput: 'status',
  })
  assert.equal(result.kind, 'success')
  assert.match(result.text, /模式：开启/u)
  assert.match(result.text, /文档：2 个/u)
  assert.match(result.text, /20261110-2000-flow\.html/u)
  assert.match(result.text, /校验通过/u)
  await rm(cwd, { recursive: true, force: true })
})

test('the switch state also reaches the model as a runtime-context snapshot', async () => {
  const { cwd, emit, contexts, switchOn, switchOff } = await harness()
  const context = contexts[0]
  const session = { id: 'session-context', header: { cwd } }
  const text = () => context.text({ agent: { session } })

  assert.equal(text(), '', 'a session that never enabled the mode adds nothing')

  switchOn()
  await emit('session/event', session, { type: 'turn/start', data: { turn: 1 }, time: Date.now() })
  const on = text()
  assert.match(on, /^<visual-answer mode="on">/u)
  assert.match(on, /<\/visual-answer>$/u)
  assert.match(on, /Write exactly one self-contained HTML file/u, 'the on block carries the contract')

  // Turn-scoped like the state always was: the running turn keeps its contract.
  switchOff()
  assert.equal(text(), on)

  await emit('session/event', session, { type: 'turn/start', data: { turn: 2 }, time: Date.now() })
  const off = text()
  assert.match(off, /^<visual-answer mode="off">/u)
  assert.match(off, /<\/visual-answer>$/u)
  assert.match(off, /Visual answers: off/u)
  assert.match(off, /replaces every earlier statement about visual mode/u)
  assert.match(off, /summary/u)
  await rm(cwd, { recursive: true, force: true })
})

test('an agentless assembly contributes no state line', async () => {
  const { cwd, contexts, switchOn } = await harness()
  switchOn()
  assert.equal(contexts[0].text({}), '')
  await rm(cwd, { recursive: true, force: true })
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  gateAction,
  isHtmlName,
  pickProduced,
  validateHtml,
} from '../lib/gate.js'

const document_ = (body) => `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>t</title></head>
<body>${body}</body>
</html>
`

test('isHtmlName accepts pages and rejects other entries', () => {
  assert.equal(isHtmlName('20261110-1802-flow.html'), true)
  assert.equal(isHtmlName('20261110-1802-flow.htm'), true)
  assert.equal(isHtmlName('20261110-1802-FLOW.HTML'), true)
  assert.equal(isHtmlName('notes.md'), false)
  assert.equal(isHtmlName('.hidden.html'), false)
  assert.equal(isHtmlName('flow.html.bak'), false)
})

test('validateHtml rejects empty, fragmentary, and truncated files', () => {
  assert.deepEqual(validateHtml(document_('<p>hi</p>')), { ok: true, reason: '' })
  assert.equal(validateHtml('   ').ok, false)
  assert.equal(validateHtml('<p>only a fragment</p>').ok, false)
  assert.equal(validateHtml('<html><head></head><p>no body</p></html>').ok, false)
  assert.equal(validateHtml('<html><body><p>cut').ok, false)
})

test('pickProduced keeps only pages written during the turn and takes the newest', () => {
  const entries = [
    { name: 'old.html', size: 10, mtimeMs: 1_000 },
    { name: 'fresh.html', size: 20, mtimeMs: 5_000 },
    { name: 'newest.html', size: 30, mtimeMs: 9_000 },
    { name: 'notes.md', size: 40, mtimeMs: 9_500 },
  ]
  assert.equal(pickProduced(entries, 4_000)?.name, 'newest.html')
  assert.equal(pickProduced(entries, 9_500), undefined)
  assert.equal(pickProduced([], 0), undefined)
  assert.equal(pickProduced(entries, Number.NaN), undefined)
})

test('gateAction encodes pass, one retry, then giving up', () => {
  assert.equal(gateAction(true, false), 'pass')
  assert.equal(gateAction(true, true), 'pass')
  assert.equal(gateAction(false, false), 'retry')
  assert.equal(gateAction(false, true), 'miss')
})

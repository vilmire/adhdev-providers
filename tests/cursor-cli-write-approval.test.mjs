import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Regression (2026-11-07): cursor-agent's file-write permission prompt
// ("Write to this file?") was not in the approval question alternation, so the
// session read as idle and no approval notice reached the coordinator.

const root = path.resolve(import.meta.dirname, '../cli/cursor-cli')
const spec = JSON.parse(fs.readFileSync(path.join(root, 'specs/1.0.json'), 'utf8'))
const provider = JSON.parse(fs.readFileSync(path.join(root, 'provider.v1.json'), 'utf8'))

const WRITE_PROMPT = [
  ' Write to this file?',
  ' in /Users/dev/.adhdev-preview/evidence-backup/task-abc/2026-11-08-review-round2.md',
  '',
  '  → Proceed (y)',
  '    Reject & propose changes (esc or n or p)',
  '    Add Write(/Users/dev/...) to allowlist? (tab)',
  '    Run Everything (shift+tab)',
  '',
  '                                                ctrl+r to review changed files',
].join('\n')

const IDLE_SCREEN = [
  ' → Plan, search, build anything',
  '',
  '  Auto · 7.7%',
  '  /Users/dev/Work/adhdev',
].join('\n')

function approvalTransition() {
  const t = spec.transitions.find((x) => x.to === 'approval' && x.label === '→approval')
  assert.ok(t, '→approval transition exists')
  const cond = t.when.all.find((c) => c.section === 'status_tail' && typeof c.matches === 'string')
  assert.ok(cond, 'approval transition has a status_tail matcher')
  return new RegExp(cond.matches, cond.flags)
}

test('spec: file-write prompt enters the approval state', () => {
  assert.ok(approvalTransition().test(WRITE_PROMPT))
})

test('spec: idle footer is not mistaken for approval', () => {
  assert.equal(approvalTransition().test(IDLE_SCREEN), false)
})

test('spec: every approval matcher (enter/leave) carries the same question alternation', () => {
  const sources = JSON.stringify(spec).match(/Run this command\|[^"]*?permission\)/g) || []
  assert.ok(sources.length >= 4, `expected >=4 occurrences, got ${sources.length}`)
  for (const s of sources) assert.ok(s.includes('Write to this file'), s)
})

test('provider.v1 modal: question matches and buttons parse, incl. Run Everything as a button', () => {
  const modal = provider.tui?.modal ?? provider.screen?.modal ?? findModal(provider)
  const q = new RegExp(modal.questionPattern, modal.questionFlags)
  assert.ok(q.test(WRITE_PROMPT))
  const btn = new RegExp(modal.buttonPattern, modal.buttonFlags)
  const labels = WRITE_PROMPT.split('\n')
    .map((line) => line.match(btn))
    .filter(Boolean)
    .map((m) => (m[1] ?? m[2]).trim())
  assert.deepEqual(labels, [
    'Proceed',
    'Reject & propose changes',
    'Add Write(/Users/dev/...) to allowlist?',
    'Run Everything',
  ])
})

function findModal(obj) {
  if (obj && typeof obj === 'object') {
    if (obj.$schema === 'adhdev:tui/modal@1') return obj
    for (const v of Object.values(obj)) {
      const r = findModal(v)
      if (r) return r
    }
  }
  return null
}

import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const cursorScriptsDir = path.resolve(import.meta.dirname, '../cli/cursor-cli/scripts/1.0')
const detectStatus = require(path.join(cursorScriptsDir, 'detect_status.js'))
const parseOutput = require(path.join(cursorScriptsDir, 'parse_output.js'))

const generatingScreen = `
  Cursor Agent
  v2026.04.17-787b533
  hint: /auto-run to skip all approvals

  → Plan, search, build anything

  Composer 2 Fast
  /private/tmp/adhdev-cursor-cli-verify

  Reply with exactly: INTERACTIVE_OK

 ⠆⠆ Composing  3 tokens

  → Add a follow-up                                                                                     ctrl+c to stop

  Composer 2 Fast
  /private/tmp/adhdev-cursor-cli-verify
  INTERACTIVE_OK
`

const idleScreen = `
  Cursor Agent
  v2026.04.17-787b533
  hint: /auto-run to skip all approvals

  Composer 2 Fast
  /private/tmp/adhdev-cursor-cli-verify
  Reply with exactly: INTERACTIVE_OK
  INTERACTIVE_OK

  → Add a follow-up

  Composer 2 Fast
  /private/tmp/adhdev-cursor-cli-verify
  Composer 2 Fast · 3.7%
  /private/tmp/adhdev-cursor-cli-verify
`

const workspaceTrustScreen = `
 ╭──────────────────────────────────────────────────────────────────────────╮
 │                                                                        │
 │ ⚠ Workspace Trust Required                                             │
 │                                                                        │
 │ Cursor Agent can execute code and access files in this directory.      │
 │                                                                        │
 │ Do you trust the contents of this directory?                           │
 │                                                                        │
 │ /private/tmp/adhdev-cursor-cli-approval-check                          │
 │                                                                        │
 │ ▶ [a] Trust this workspace                                             │
 │   [q] Quit                                                             │
 │                                                                        │
 ╰──────────────────────────────────────────────────────────────────────────╯

 Cursor Agent
 v2026.04.17-787b533
 hint: /auto-run to skip all approvals
`

const runApprovalScreen = `
 Cursor Agent
 v2026.04.17-787b533
 hint: /auto-run to skip all approvals

 Create tmp/adhdev_cli_verify.py that prints exactly these three lines:
 CWD=<current working directory>
 SQUARES=1,4,9,16,25
 JSON={"squares":[1,4,9,16,25]}
 Then run python3 tmp/adhdev_cli_verify.py and reply with the exact output only.

 스크립트를 작성한 뒤 실행합니다.

 ┌────────────────────────────────────────────────────────────────────────────┐
 │ $ cd /private/tmp/adhdev-cursor-cli-approval-check && python3             │
 │ tmp/adhdev_cli_verify.py in .                                             │
 └────────────────────────────────────────────────────────────────────────────┘

 Run this command?
 Not in allowlist: cd /private/tmp/adhdev-cursor-cli-approval-check, python3
 tmp/adhdev_cli_verify.py
 → Run (once) (y)
   Add Shell(cd), Shell(python3) to allowlist? (tab)
   Auto-run everything (shift+tab)
   Skip (esc or n)

 ctrl+r to review changed files
`

const postTrustScreen = `
 ╭──────────────────────────────────────────────────────────────────────────╮
 │                                                                        │
 │ ⚠ Workspace Trust Required                                             │
 │                                                                        │
 │ Cursor Agent can execute code and access files in this directory.      │
 │                                                                        │
 │ Do you trust the contents of this directory?                           │
 │                                                                        │
 │ /private/tmp/adhdev-cursor-cli-approval-fix-live2                      │
 │                                                                        │
 │ [a] Trust this workspace                                               │
 │ [q] Quit                                                               │
 │                                                                        │
 │ ⏳ Trusting workspace...                                                │
 │                                                                        │
 ╰──────────────────────────────────────────────────────────────────────────╯

 Cursor Agent
 v2026.04.17-787b533
 hint: /auto-run to skip all approvals

 → Plan, search, build anything

 Composer 2 Fast
 /private/tmp/adhdev-cursor-cli-approval-fix-live2
`

test('cursor detect_status treats composing screens as generating', () => {
  assert.equal(detectStatus({ tail: generatingScreen }), 'generating')
})

test('cursor parse_output extracts the latest user/assistant turn from the interactive TUI', () => {
  const parsed = parseOutput({
    screenText: idleScreen,
    buffer: idleScreen,
    recentBuffer: idleScreen,
    messages: [],
  })

  assert.equal(parsed.status, 'idle')
  assert.deepEqual(
    parsed.messages.map((message) => ({ role: message.role, content: message.content })),
    [
      { role: 'user', content: 'Reply with exactly: INTERACTIVE_OK' },
      { role: 'assistant', content: 'INTERACTIVE_OK' },
    ],
  )
})

test('cursor detect_status treats workspace trust prompts as waiting_approval', () => {
  assert.equal(detectStatus({ tail: workspaceTrustScreen, screenText: workspaceTrustScreen }), 'waiting_approval')
})

test('cursor parse_output surfaces workspace trust as an approval modal', () => {
  const parsed = parseOutput({
    screenText: workspaceTrustScreen,
    buffer: workspaceTrustScreen,
    recentBuffer: workspaceTrustScreen,
    messages: [],
  })

  assert.equal(parsed.status, 'waiting_approval')
  assert.deepEqual(parsed.activeModal, {
    message: 'Trust this workspace to let Cursor Agent access and execute files here.',
    buttons: ['Trust this workspace', 'Quit'],
  })
})

test('cursor detect_status treats run approval prompts as waiting_approval', () => {
  assert.equal(detectStatus({ tail: runApprovalScreen, screenText: runApprovalScreen }), 'waiting_approval')
})

test('cursor parse_output surfaces run approval buttons from the interactive TUI', () => {
  const parsed = parseOutput({
    screenText: runApprovalScreen,
    buffer: runApprovalScreen,
    recentBuffer: runApprovalScreen,
    messages: [],
  })

  assert.equal(parsed.status, 'waiting_approval')
  assert.deepEqual(parsed.activeModal, {
    message: 'Run this command? Not in allowlist: cd /private/tmp/adhdev-cursor-cli-approval-check, python3 tmp/adhdev_cli_verify.py',
    buttons: ['Run (once)', 'Add to allowlist', 'Auto-run everything', 'Skip'],
  })
})

test('cursor ignores stale trust chrome once the main interactive prompt is visible', () => {
  const parsed = parseOutput({
    screenText: postTrustScreen,
    buffer: postTrustScreen,
    recentBuffer: postTrustScreen,
    messages: [],
  })

  assert.equal(detectStatus({ tail: postTrustScreen, screenText: postTrustScreen }), 'idle')
  assert.equal(parsed.status, 'idle')
  assert.equal(parsed.activeModal, null)
})

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

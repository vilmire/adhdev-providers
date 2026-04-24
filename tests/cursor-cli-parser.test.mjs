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

const staleComposingScreen = `
 Cursor Agent
 v2026.04.17-787b533
 hint: /auto-run to skip all approvals

 Create tmp/adhdev_cli_verify.py that prints exactly these three lines:
 CWD=<current working directory>
 SQUARES=1,4,9,16,25
 JSON={"squares":[1,4,9,16,25]}
 Then run python3 tmp/adhdev_cli_verify.py and reply with the exact output only.

 CWD=/private/tmp/adhdev-cursor-cli-approval-fix-live5
 SQUARES=1,4,9,16,25
 JSON={"squares":[1,4,9,16,25]}

 → Add a follow-up

 Composer 2 Fast · 4.5% · 1 file edited
 ctrl+r to review edits
 /private/tmp/adhdev-cursor-cli-approval-fix-live5
`

const staleComposingTail = `
 JSON={"squares":[1,4,9,16,25]}

 → Add a follow-up

 Composer 2 Fast · 4.3% · 1 file edited
 ctrl+r to review edits
 /private/tmp/adhdev-cursor-cli-approval-fix-live5

 ⠣⠄ Composing 448 tokens
 ctrl+r to review edits
 /private/tmp/adhdev-cursor-cli-approval-fix-live5
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

test('cursor detect_status prefers the visible idle prompt over stale composing tail', () => {
  assert.equal(
    detectStatus({ tail: staleComposingTail, screenText: staleComposingScreen, buffer: staleComposingScreen }),
    'idle',
  )
})

const liveCompletionScreen = `
Cursor Agent
v2026.04.17-787b533
hint: /auto-run to skip all approvals

Please do all of the following in this workspace:
1. Create tmp/adhdev_cli_verify.py that prints exactly these three lines:
CWD=<current working directory>
SQUARES=1,4,9,16,25
JSON={"squares":[1,4,9,16,25]}
2. Run python3 tmp/adhdev_cli_verify.py.
3. Respond with:
- a one-sentence summary
- a markdown table for the numbers and squares
- a fenced python code block containing the script
- a fenced text block containing the exact command output
If you need permission to write the file or run the command, request it.

요청하신 대로 tmp/adhdev_cli_verify.py를 생성(정리)하고 python3
tmp/adhdev_cli_verify.py 실행까지 완료했으며, 출력은 지정하신 3줄 형식과
정확히 일치합니다.

┌────────┬────────┐
│ Number │ Square │
├────────┼────────┤
│ 1 │ 1 │
│ 2 │ 4 │
│ 3 │ 9 │
│ 4 │ 16 │
│ 5 │ 25 │
└────────┴────────┘

import json
import os
def main() -> None:
squares = [n * n for n in range(1, 6)]
print(f"CWD={os.getcwd()}")
print(f"SQUARES={','.join(str(n) for n in squares)}")
print(f"JSON={json.dumps({'squares': squares}, separators=(',', ':'))}")
if __name__ == "__main__":
main()

$ python3 "tmp/adhdev_cli_verify.py" 1.1s in current dir
CWD=/private/tmp/adhdev-cli-verify-cursor-cli
SQUARES=1,4,9,16,25
JSON={"squares":[1,4,9,16,25]}

→ Add a follow-up
Auto · 6.6% · 1 file edited
ctrl+r to review edits
/private/tmp/adhdev-cli-verify-cursor-cli · main
`

const followupCompletionScreen = `
Cursor Agent
v2026.04.17-787b533
hint: /auto-run to skip all approvals

Please do all of the following in this workspace:
1. Create tmp/adhdev_cli_verify.py that prints exactly these three lines:
CWD=<current working directory>
SQUARES=1,4,9,16,25
JSON={"squares":[1,4,9,16,25]}
2. Run python3 tmp/adhdev_cli_verify.py.
3. Respond with:
- a one-sentence summary
- a markdown table for the numbers and squares
- a fenced python code block containing the script
- a fenced text block containing the exact command output
If you need permission to write the file or run the command, request it.

요청하신 대로 tmp/adhdev_cli_verify.py를 생성(정리)하고 python3
tmp/adhdev_cli_verify.py 실행까지 완료했으며, 출력은 지정하신 3줄 형식과
정확히 일치합니다.

→ Add a follow-up
Auto · 6.6% · 1 file edited
ctrl+r to review edits
/private/tmp/adhdev-cli-verify-cursor-cli · main

In one short paragraph, summarize what you just executed. You must
mention tmp/adhdev_cli_verify.py and the square sequence 1,4,9,16,25.

tmp/adhdev_cli_verify.py 파일을 정리해 저장한 뒤 python3
tmp/adhdev_cli_verify.py를 실행했고, 현재 작업 디렉터리와 함께 제곱수
시퀀스 1,4,9,16,25 및 동일 값을 담은 JSON 한 줄을 포함해 총 3줄이 정확히
출력되는 것을 확인했습니다.

→ Add a follow-up
Auto · 6.6% · 1 file edited
ctrl+r to review edits
/private/tmp/adhdev-cli-verify-cursor-cli · main
`

test('cursor parse_output ignores shell-command/footer noise and rehydrates table/code/output from a completed live turn', () => {
  const parsed = parseOutput({
    screenText: liveCompletionScreen,
    buffer: liveCompletionScreen,
    recentBuffer: liveCompletionScreen,
    messages: [
      {
        role: 'user',
        content: 'Please do all of the following in this workspace:\n1. Create tmp/adhdev_cli_verify.py that prints exactly these three lines:\nCWD=<current working directory>\nSQUARES=1,4,9,16,25\nJSON={"squares":[1,4,9,16,25]}\n2. Run python3 tmp/adhdev_cli_verify.py.\n3. Respond with a summary, a markdown table, a fenced python block, and a fenced text block.',
      },
    ],
  })

  const messages = parsed.messages.map((message) => ({ role: message.role, content: message.content }))
  assert.equal(parsed.status, 'idle')
  assert.deepEqual(messages.map((message) => message.role), ['user', 'assistant'])
  assert.doesNotMatch(messages[0].content, /^\$ python3/m)
  assert.match(messages[1].content, /\| Number \| Square \|/)
  assert.match(messages[1].content, /```python[\s\S]*def main\(\) -> None:[\s\S]*```/)
  assert.match(messages[1].content, /```text[\s\S]*SQUARES=1,4,9,16,25[\s\S]*```/)
  assert.doesNotMatch(messages[1].content, /Auto · 6\.6%|ctrl\+r to review edits/)
})

test('cursor parse_output appends a follow-up assistant reply without injecting synthetic user/footer messages', () => {
  const parsed = parseOutput({
    screenText: followupCompletionScreen,
    buffer: followupCompletionScreen,
    recentBuffer: followupCompletionScreen,
    messages: [
      { role: 'user', content: 'Please do all of the following in this workspace: ...' },
      { role: 'assistant', content: 'Created and ran tmp/adhdev_cli_verify.py, which prints the required values exactly.' },
      { role: 'user', content: 'In one short paragraph, summarize what you just executed. You must mention tmp/adhdev_cli_verify.py and the square sequence 1,4,9,16,25.' },
    ],
  })

  const messages = parsed.messages.map((message) => ({ role: message.role, content: message.content }))
  assert.equal(parsed.status, 'idle')
  assert.deepEqual(messages.map((message) => message.role), ['user', 'assistant', 'user', 'assistant'])
  assert.doesNotMatch(messages[3].content, /Auto · 6\.6%|ctrl\+r to review edits/)
  assert.match(messages[3].content, /tmp\/adhdev_cli_verify\.py/)
  assert.match(messages[3].content, /1,4,9,16,25/)
})

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const detectStatus = require('../cli/codex-cli/scripts/1.0/detect_status.js');
const codexScripts = require('../cli/codex-cli/scripts/1.0/scripts.js');
const parseApproval = require('../cli/codex-cli/scripts/1.0/parse_approval.js');
const parseOutput = require('../cli/codex-cli/scripts/1.0/parse_output.js');

const partialWorkingScreen = `
╭──────────────────────────────────────────────────────────╮
│ >_ OpenAI Codex (v0.124.0)                              │
│                                                          │
│ model: gpt-5.4 low /model to change                     │
│ directory: …/adhdev-cli-verify-codex-cli-fresh2.Qei0iJ  │
│ permissions: YOLO mode                                  │
╰──────────────────────────────────────────────────────────╯

Tip: GPT-5.5 is now available in Codex. It's our strongest agentic coding
model yet, built to reason through large codebases, check assumptions with
tools, and keep going until the work is done.

Learn more: https://openai.com/index/introducing-gpt-5-5/

› Please do all of the following in this workspace:
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
gpt-5.4 low · /private/tmp/adhdev-cli-verify-codex-cli-fresh2.Qei0iJ

• W

• Creating tmp/adhdev_cli_verify.py with the exact required output, then I’ll
run it and return the script plus the captured output in the requested format.

• Explored
 └ List adhdev-cli-verify-codex-cli-fresh2.Qei0iJ

• Ran pwd && ls -la && mkdir -p tmp
 └ /tmp/adhdev-cli-verify-codex-cli-fresh2.Qei0iJ
 total 8
 … +3 lines (ctrl + t to view transcript)
 -rw-r--r-- 1 vilmire wheel 37 Apr 24 16:04 README.md
 drwxr-xr-x 2 vilmire wheel 64 Apr 24 16:04 tmp

• The workspace resolves through /tmp at runtime, so I’m checking what python3
reports for os.getcwd() before I write the script to keep the first line
exact.

• Ran python3 - <<'PY'
 │ import os
 │ print(os.getcwd())
 │ … +1 lines
 └ /private/tmp/adhdev-cli-verify-codex-cli-fresh2.Qei0iJ
`;

const partialWorkingTail = `
ng •  Working • orking •rking  •king  •ing  ng  g   4

 • Creating tmp/adhdev_cli_verify.py with the exact required output, then I’ll
 run it and return the script plus the captured output in the requested format.

 • Explored
 └ List adhdev-cli-verify-codex-cli-fresh2.Qei0iJ

 • Ran pwd && ls -la && mkdir -p tmp
 └ /tmp/adhdev-cli-verify-codex-cli-fresh2.Qei0iJ
 total 8
 … +3 lines (ctrl + t to view transcript)
 -rw-r--r-- 1 vilmire wheel 37 Apr 24 16:04 README.md
 drwxr-xr-x 2 vilmire wheel 64 Apr 24 16:04 tmp
`;

const startupPromptScreen = `
╭──────────────────────────────────────────────────────────╮
│ >_ OpenAI Codex (v0.124.0)                              │
│                                                          │
│ model: gpt-5.4 low /model to change                     │
│ directory: …/adhdev-cli-verify-codex-cli-live2.93maYp   │
│ permissions: YOLO mode                                  │
╰──────────────────────────────────────────────────────────╯

Tip: GPT-5.5 is now available in Codex. It's our strongest agentic coding
model yet, built to reason through large codebases, check assumptions with
tools, and keep going until the work is done.

Learn more: https://openai.com/index/introducing-gpt-5-5/

› Summarize recent commits

gpt-5.4 low · /private/tmp/adhdev-cli-verify-codex-cli-live2.93maYp
`;

const startupPromptTail = `
model yet, built to reason through large codebases, check assumptions with

tools, and keep going until the work is done.

Learn more: https://openai.com/index/introducing-gpt-5-5/ Bootin Booting Booting  •Booting M Booting MC ooting MCP •oting MCP  ting MCP s •ing MCP se ng MCP ser  •g MCP serv MCP serve MCP server •CP server: P server: 1 • server: c server: co erver: cod •rver: code ver: codex ›Summarize recent commits gpt-5.4 low · /private/tmp/adhdev-cli-verify-codex-cli-live2.93maYp
`;

const completedTurnScreen = `
╭──────────────────────────────────────────────────────────╮
│ >_ OpenAI Codex (v0.124.0)                              │
│                                                          │
│ model: gpt-5.4 low /model to change                     │
│ directory: …p/adhdev-cli-verify-codex-cli-live4.z8lXLl  │
│ permissions: YOLO mode                                  │
╰──────────────────────────────────────────────────────────╯

Tip: New Use /fast to enable our fastest inference with increased plan usage.

› Please do all of the following in this workspace:
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
•

• I’m creating tmp/adhdev_cli_verify.py with the exact required output, then

• Ran pwd

• Ran ls -d tmp || mkdir -p tmp
•

•

• I have the workspace path and tmp/ exists. Next I’m writing the script and
•

• Added tmp/adhdev_cli_verify.py (+8 -0)
 1 +import json
 2 +import os
 3 +
 4 +
 5 +squares = [n * n for n in range(1, 6)]
 6 +print(f"CWD={os.getcwd()}")
 7 +print(f"SQUARES={','.join(str(n) for n in squares)}")
•

• Working

• The script is in place. I’m running it now from the workspace root so the CWD=
•

• Ran python3 tmp/adhdev_cli_verify.py
 └ CWD=/private/tmp/adhdev-cli-verify-codex-cli-live4.z8lXLl
 SQUARES=1,4,9,16,25
• Working

›

gpt-5.4 low · /private/tmp/adhdev-cli-verify-codex-cli-live4.z8lXLl
`;

const completedTurnTail = `
| 2 | 4 |

| 3 | 9 |

| 4 | 16 |

| 5 | 25 |

import json

import os

squares = [n * n for n in range(1, 6)]

print(f"CWD={os.getcwd()}")

print(f"SQUARES={','.join(str(n) for n in squares)}")

print(f"JSON={json.dumps({'squares': squares}, separators=(',', ':'))}")

CWD=/private/tmp/adhdev-cli-verify-codex-cli-live4.z8lXLl

SQUARES=1,4,9,16,25

JSON={"squares":[1,4,9,16,25]} gpt-5.4 low · /private/tmp/adhdev-cli-verify-codex-cli-live4.z8lXLl
`;

const followupTurnScreen = `
╭──────────────────────────────────────────────────────────╮
│ >_ OpenAI Codex (v0.124.0)                              │
│                                                          │
│ model: gpt-5.4 low /model to change                     │
│ directory: …p/adhdev-cli-verify-codex-cli-live6.eDuB6C  │
│ permissions: YOLO mode                                  │
╰──────────────────────────────────────────────────────────╯

Tip: New Use /fast to enable our fastest inference with increased plan usage.

› Please do all of the following in this workspace:
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
•

• Creating tmp/adhdev_cli_verify.py, then I’ll run it and capture the exact

• Explored
 └ List ls

• Ran pwd
•

─

• I confirmed the workspace path and that tmp/ exists. Next step is writing the
 script so its output is derived from the runtime working directory, then
•

• Added tmp/adhdev_cli_verify.py (+13 -0)
 1 +import json
 2 +import os
 3 +
 4 +
 5 +def main() -> None:
 6 + squares = [n * n for n in range(1, 6)]
 7 + print(f"CWD={os.getcwd()}")
 8 + print(f"SQUARES={','.join(str(n) for n in squares)}")
 9 + print(f"JSON={json.dumps({'squares': squares}, separators=(',', ':')
 )}")
 10 +
 11 +
 12 +if __name__ == "__main__":
•

─

• The file is in place. I’m running python3 tmp/adhdev_cli_verify.py in the

• Ran python3 tmp/adhdev_cli_verify.py
 └ CWD=/private/tmp/adhdev-cli-verify-codex-cli-live6.eDuB6C
 SQUARES=1,4,9,16,25
•

› tab to queue message 96% context left

gpt-5.4 low · /private/tmp/adhdev-cli-verify-codex-cli-live6.eDuB6C
gpt-5.4 low · /private/tmp/adhdev-cli-verify-codex-cli-live6.eDuB6C

› In one short paragraph, summarize what you just executed. You must mention
tmp/adhdev_cli_verify.py and the square sequence 1,4,9,16,25.
•

• I created tmp/adhdev_cli_verify.py in the workspace and executed it with
 python3, producing the current working directory plus the square sequence
gpt-5.4 low · /private/tmp/adhdev-cli-verify-codex-cli-live6.eDuB6C
`;

const followupTurnTail = `
quence 1,4,9,16,25.

 •Working( • esc to interrupt)›tab to queue message96% context left • ng  g            1 W  Wo  • Wor  •Work   •Worki  Workin • Working  •Working  Working •  Working  • orking • rking  •king 

 • I created tmp/adhdev_cli_verify.py in the workspace and executed it with

 python3, producing the current working directory plus the square sequence

 1,4,9,16,25 in both comma-separated and JSON forms. ing2 • ng  › gpt-5.4 low · /private/tmp/adhdev-cli-verify-codex-cli-live6.eDuB6C
`;

test('codex detect_status stays generating when historical user prompts remain visible above a truncated working indicator', () => {
  assert.equal(
    detectStatus({ screenText: partialWorkingScreen, tail: partialWorkingTail }),
    'generating',
  );
});

test('codex detect_status does not use generic Ready/shortcuts text as idle', () => {
  const screenText = [
    'Ready (press ? for shortcuts)',
    '? for shortcuts',
  ].join('\n');

  assert.equal(detectStatus({ screenText, tail: screenText }), null);
});

test('codex detect_status treats startup booting fragments plus a default starter prompt as idle, not generating', () => {
  assert.equal(
    detectStatus({ screenText: startupPromptScreen, tail: startupPromptTail }),
    'idle',
  );
});

test('codex detect_status treats post-trust starter prompt as idle startup screen', () => {
  const screenText = [
    '╭──────────────────────────────────────────────────────────╮',
    '│ >_ OpenAI Codex (v0.133.0)                              │',
    '╰──────────────────────────────────────────────────────────╯',
    '',
    'Tip: Join the OpenAI community Discord: http://discord.gg/openai',
    '',
    '› Summarize recent commits',
    '',
    'gpt-5.5 medium · /private/tmp/adhdev-codex-live-verify-reset-2',
  ].join('\n');

  assert.equal(detectStatus({ screenText, tail: screenText }), 'idle');
});

test('codex detect_status treats the skills starter prompt help text as idle startup screen', () => {
  const screenText = [
    '╭──────────────────────────────────────────────────────────╮',
    '│ >_ OpenAI Codex (v0.133.0)                              │',
    '╰──────────────────────────────────────────────────────────╯',
    '',
    'To get started, describe a task or try one of these commands:',
    '',
    '› Use /skills to list available skills',
    '',
    'gpt-5.5 medium · /workspaces/adhdev',
  ].join('\n');

  assert.equal(detectStatus({ screenText, tail: screenText, rawBuffer: screenText }), 'idle');
});

test('codex detect_status lets current startup starter prompt beat stale MCP raw output', () => {
  const screenText = [
    '╭──────────────────────────────────────────────────────────╮',
    '│ >_ OpenAI Codex (v0.133.0)                              │',
    '╰──────────────────────────────────────────────────────────╯',
    '',
    '› Find and fix a bug in @filename',
    '',
    'gpt-5.5 medium · /private/tmp/adhdev-codex-live-verify-reset-3',
  ].join('\n');
  const rawBuffer = [
    '◦ Starting MCP servers (1/2): codex_apps (4s • esc to interrupt)',
    screenText,
  ].join('\n');

  assert.equal(detectStatus({ screenText, tail: screenText, rawBuffer }), 'idle');
});

test('codex detect_status stays generating while MCP servers are still starting on the startup screen', () => {
  const screenText = [
    'OpenAI Codex',
    '',
    '◦ Starting MCP servers (1/2): codex_apps (3s • esc to interrupt)',
    '',
    '› Find and fix a bug in @filename',
    '',
    'gpt-5.5 medium · /private/tmp/adhdev-codex-live-verify',
  ].join('\n');

  assert.equal(
    detectStatus({ screenText, tail: screenText }),
    'generating',
  );
});

test('codex detect_status returns idle once the bare prompt is back at the bottom even if older working lines remain on screen', () => {
  assert.equal(
    detectStatus({ screenText: completedTurnScreen, tail: completedTurnTail }),
    'idle',
  );
});

test('codex provider detectStatus waits for 2s of unchanged idle text before leaving generating', () => {
  const state = codexScripts.createState();
  state.lastProviderStatus = 'generating';
  const input = {
    screenText: completedTurnScreen,
    tail: completedTurnTail,
    rawBuffer: completedTurnScreen,
    isWaitingForResponse: true,
    now: 10_000,
  };

  assert.equal(codexScripts.detectStatus(state, input), 'generating');
  assert.equal(codexScripts.detectStatus(state, { ...input, now: 11_999 }), 'generating');
  assert.equal(codexScripts.detectStatus(state, { ...input, now: 12_000 }), 'idle');
  assert.equal(codexScripts.detectStatus(state, { ...input, now: 12_100 }), 'idle');
});

test('codex provider detectStatus resets the idle settle timer when visible text changes', () => {
  const state = codexScripts.createState();
  state.lastProviderStatus = 'generating';
  const input = {
    screenText: completedTurnScreen,
    tail: completedTurnTail,
    rawBuffer: completedTurnScreen,
    isWaitingForResponse: true,
    now: 20_000,
  };

  assert.equal(codexScripts.detectStatus(state, input), 'generating');
  assert.equal(codexScripts.detectStatus(state, {
    ...input,
    screenText: `${completedTurnScreen}\nredraw tick`,
    rawBuffer: `${completedTurnScreen}\nredraw tick`,
    now: 22_100,
  }), 'generating');
  assert.equal(codexScripts.detectStatus(state, {
    ...input,
    screenText: `${completedTurnScreen}\nredraw tick`,
    rawBuffer: `${completedTurnScreen}\nredraw tick`,
    now: 24_100,
  }), 'idle');
});

test('codex provider parseSession returns idle immediately when a final assistant and prompt are visible', () => {
  const state = codexScripts.createState();
  state.lastProviderStatus = 'generating';
  const input = {
    screenText: completedTurnScreen,
    buffer: completedTurnScreen,
    recentBuffer: completedTurnTail,
    tail: completedTurnTail,
    rawBuffer: completedTurnScreen,
    messages: [],
    isWaitingForResponse: true,
    now: 30_000,
  };

  const first = codexScripts.parseSession(state, input);
  assert.equal(first.status, 'idle');
  assert.ok(first.messages.some(message => message.role === 'assistant'));
  assert.notEqual(first.messages.at(-1)?.bubbleState, 'streaming');
});

test('codex provider parseSession returns idle for starter prompt without workspace native history bleed-through', () => {
  const originalHome = process.env.HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'adhdev-codex-startup-home-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'adhdev-codex-startup-work-'));
  process.env.HOME = home;
  try {
    const sessionId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const sessionDir = path.join(home, '.codex', 'sessions', '2026', '05', '26');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, `rollout-${sessionId}.jsonl`), [
      JSON.stringify({ type: 'session_meta', timestamp: '2026-05-26T00:00:00.000Z', payload: { id: sessionId, cwd: workspace } }),
      JSON.stringify({ type: 'response_item', timestamp: '2026-05-26T00:00:01.000Z', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'stale assistant from another terminal' }] } }),
    ].join('\n') + '\n', 'utf-8');

    const screenText = [
      '╭────────────────────────────────────────────────╮',
      '│ >_ OpenAI Codex (v0.133.0)                     │',
      '│ model:       gpt-5.5 medium   /model to change │',
      `│ directory:   ${workspace} │`,
      '╰────────────────────────────────────────────────╯',
      '',
      'Tip: New Use /fast to enable our fastest inference with increased plan usage.',
      '',
      '› Improve documentation in @filename',
      '',
      `gpt-5.5 medium · ${workspace}`,
    ].join('\n');
    const state = codexScripts.createState();
    state.lastProviderStatus = 'generating';

    const result = codexScripts.parseSession(state, {
      workspace,
      workingDir: workspace,
      screenText,
      buffer: screenText,
      recentBuffer: screenText,
      rawBuffer: screenText,
      isWaitingForResponse: false,
      messages: [],
    });

    assert.equal(result.status, 'idle');
    assert.equal(result.messages.length, 0);
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('codex detect_status returns idle when a follow-up reply ends and the idle footer reappears after stale working fragments', () => {
  assert.equal(
    detectStatus({ screenText: followupTurnScreen, tail: followupTurnTail }),
    'idle',
  );
});

test('codex parseSession surfaces the dispatched user prompt while a fresh turn is generating before assistant output', () => {
  const promptText = 'Diagnose why mesh_read_chat returned zero messages for this Codex task.';
  const screenText = [
    '╭──────────────────────────────────────────────────────────╮',
    '│ >_ OpenAI Codex (v0.133.0)                              │',
    '╰──────────────────────────────────────────────────────────╯',
    '',
    '◦ Working (1s • esc to interrupt)',
    '',
    'gpt-5.5 medium · /private/tmp/adhdev-codex-live-verify',
  ].join('\n');
  const state = codexScripts.createState();

  const result = codexScripts.parseSession(state, {
    workspace: '/private/tmp/adhdev-codex-live-verify',
    workingDir: '/private/tmp/adhdev-codex-live-verify',
    screenText,
    buffer: screenText,
    recentBuffer: screenText,
    rawBuffer: screenText,
    isWaitingForResponse: true,
    promptText,
    messages: [],
  });

  assert.equal(result.status, 'generating');
  assert.deepEqual(result.messages.map(message => [message.role, message.content]), [
    ['user', promptText],
  ]);
});

test('codex detect_status stays generating for active progress glyph without an idle prompt', () => {
  const activeScreen = [
    '› Please verify raw CLI transcript fidelity in this workspace.',
    '',
    '• I’ll create the exact script in tmp/adhdev_cli_verify.py, then run the',
    '◦',
  ].join('\n');

  assert.equal(
    detectStatus({ screenText: activeScreen, tail: activeScreen }),
    'generating',
  );
});

test('codex parse_output keeps status generating for a partial working turn instead of declaring idle early', () => {
  const result = parseOutput({
    screenText: partialWorkingScreen,
    buffer: partialWorkingScreen,
    recentBuffer: partialWorkingTail,
    messages: [
      {
        role: 'user',
        content: 'Please do all of the following in this workspace:\n1. Create tmp/adhdev_cli_verify.py that prints exactly these three lines:\nCWD=<current working directory>\nSQUARES=1,4,9,16,25\nJSON={"squares":[1,4,9,16,25]}\n2. Run python3 tmp/adhdev_cli_verify.py.\n3. Respond with a summary, a markdown table, a fenced python block, and a fenced text block.',
      },
    ],
  });

  assert.equal(result.status, 'generating');
  assert.equal(result.messages.at(-1)?.role, 'assistant');
  assert.ok(result.messages.some(message => /Creating tmp\/adhdev_cli_verify\.py/.test(message.content || '')));
});

test('codex parse_output keeps submitted user prompt alongside assistant output when parser state has no prior messages', () => {
  const result = parseOutput({
    screenText: completedTurnScreen,
    buffer: completedTurnScreen,
    recentBuffer: completedTurnTail,
    messages: [],
  });

  assert.equal(result.status, 'idle');
  assert.equal(result.messages[0]?.role, 'user');
  assert.match(result.messages[0]?.content || '', /Please do all of the following/);
  assert.ok(result.messages.some(message => message.role === 'assistant' && /tmp\/adhdev_cli_verify\.py/.test(message.content || '')));
});

test('codex parse_output preserves rendered script/output sections literally instead of synthesizing fences', () => {
  const renderedAssistant = `
Created and ran tmp/adhdev_cli_verify.py, which prints the required values exactly.

| Number | Square |
|---|---:|
| 1 | 1 |
| 2 | 4 |
| 3 | 9 |
| 4 | 16 |
| 5 | 25 |

import json
import os

def main() -> None:
    squares = [n * n for n in range(1, 6)]
    print(f"CWD={os.getcwd()}")
    print("SQUARES=" + ",".join(str(n) for n in squares))
    print("JSON=" + json.dumps({"squares": squares}, separators=(",", ":")))

if __name__ == "__main__":
    main()

CWD=/private/tmp/adhdev-cli-verify-codex-cli-live8.3kneYV
SQUARES=1,4,9,16,25
JSON={"squares":[1,4,9,16,25]}
`;

  const assistant = parseOutput.rehydrateRenderedSections(renderedAssistant);
  assert.equal(assistant, renderedAssistant.trim());
  assert.doesNotMatch(assistant, /```(?:python|text)/);
});

test('codex parse_approval does not synthesize fallback buttons when labels cannot be read', () => {
  const modal = parseApproval({
    screenText: [
      'Allow Codex to run this command?',
      'Press Enter to confirm',
    ].join('\n'),
  });

  assert.equal(modal, null);
});

test('codex detects squashed startup trust approval from PTY text', () => {
  const screenText = '>You are in /private/tmp/adhdev-codex-start-smokeDoyoutrustthecontentsofthisdirectory?Workingwithuntrustedcontentscomeswithhigherriskofpromptinjection.Trustingthedirectoryallowsproject-localconfig,hooks,andexecpoliciestoload.› 1. Yes, continue2.No,quitPress enter to continue';

  assert.equal(detectStatus({ screenText, tail: screenText, rawBuffer: screenText }), 'waiting_approval');
  assert.deepEqual(parseApproval({ screenText, tail: screenText, rawBuffer: screenText }), {
    message: 'Do you trust the contents of this directory?',
    buttons: ['Yes, continue', 'No, quit'],
  });
});

test('codex parse_output keeps full prior transcript when conversation exceeds 50 messages', () => {
  const priorMessages = Array.from({ length: 60 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `codex-turn-${index + 1}`,
  }));

  const result = parseOutput({
    screenText: [
      '›',
      'gpt-5.4 low · /tmp/codex-quality',
    ].join('\n'),
    buffer: '',
    messages: priorMessages,
  });

  assert.equal(result.messages.length, 60);
  assert.deepEqual(result.messages.slice(0, 2).map(m => m.content), ['codex-turn-1', 'codex-turn-2']);
  assert.deepEqual(result.messages.slice(-2).map(m => m.content), ['codex-turn-59', 'codex-turn-60']);
});

test('codex parse_output surfaces approval as a visible system bubble', () => {
  const screenText = [
    'Allow Codex to run this command?',
    '1. Approve and run now',
    '2. Always approve this session',
    '3. Deny',
    'Press Enter to confirm',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [
      { role: 'user', content: 'Run rm -rf /tmp/nope' },
    ],
  });

  assert.equal(result.status, 'waiting_approval');
  assert.equal(result.activeModal?.buttons.length, 3);
  assert.equal(result.messages.at(-1)?.kind, 'system');
  assert.match(result.messages.at(-1)?.content || '', /Approval requested/);
  assert.match(result.messages.at(-1)?.content || '', /\[Approve and run now\]/);
});

test('codex parse_output preserves visible tool activity as typed bubbles instead of folding it into prose', () => {
  const screenText = [
    '› Run pwd, read package.json, then summarize briefly.',
    '• Ran pwd',
    ' └ /tmp/codex-quality',
    '',
    '• Read package.json',
    ' └ { "name": "demo" }',
    '',
    '• I checked the working directory and package metadata.',
    '',
    '›',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [
      { role: 'user', content: 'Run pwd, read package.json, then summarize briefly.' },
    ],
  });

  assert.deepEqual(
    result.messages.map(m => ({ role: m.role, kind: m.kind, senderName: m.senderName, content: m.content })),
    [
      { role: 'user', kind: 'standard', senderName: undefined, content: 'Run pwd, read package.json, then summarize briefly.' },
      { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: 'Ran pwd\n└ /tmp/codex-quality' },
      { role: 'assistant', kind: 'tool', senderName: 'Tool', content: 'Read package.json\n└ { "name": "demo" }' },
      { role: 'assistant', kind: 'standard', senderName: undefined, content: 'I checked the working directory and package metadata.' },
    ],
  );
});

test('codex parse_output appends visible orphan assistant tail from the live screen', () => {
  const prompt = '메시상태확인하고 팔로업할거없는지 확인';
  const buffer = [
    '› ' + prompt,
    '',
    '• 메시 상태와 최근 작업 이력을 먼저 확인해서, 완료/실패/대기 중인 후속 조치가 있',
    '  는지 보겠습니다.',
    '',
    '• Called',
    '  └ adhdev-',
    '        mesh.mesh_git_status({"node_id":"node_5094c5e5ebcf4d11bd5f5c2856fab763"}',
    '        )',
    '',
    '• 확인했습니다. 활성 큐 작업은 없습니다. pending/assigned/generating/approval 모',
    '',
    '─',
    '',
    '  gpt-5.5 medium · ~/Work/adhdev',
  ].join('\n');
  const screenText = [
    buffer,
    '',
    '›',
    '',
    '',
    '  가장 우선순위 높은 후속은 node_d727... ELK layout 브랜치 refine, 그 다음',
    '                                                              79',
    '',
    '─ gpt-5.5 medium · ~/Work/adhdev',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer,
    recentBuffer: buffer,
    messages: [
      { role: 'user', content: prompt },
    ],
  });

  const assistant = result.messages.filter(message => message.role === 'assistant' && (message.kind || 'standard') === 'standard').at(-1);
  assert.match(assistant?.content || '', /확인했습니다\. 활성 큐 작업은 없습니다/);
  assert.match(assistant?.content || '', /가장 우선순위 높은 후속은 node_d727/);
  assert.doesNotMatch(assistant?.content || '', /\b79\b/);
});

test('codex parse_output drops spinner fragments and model footer from completed turns', () => {
  const prompt = 'Confirm the previous raw verification in one short paragraph. You must mention tmp/adhdev_cli_verify.py, UNICODE_SENTINEL=⟦ADHDEV-CLI-VERIFY⟧, and the square sequence 1,4,9,16,25 without changing the glyphs.';
  const previous = [
    { role: 'user', content: 'Initial raw verification task.' },
    { role: 'assistant', content: 'Ran python3 tmp/adhdev_cli_verify.py\n└ CWD=/tmp/adhdev-cli-verify-codex-cli\nSQUARES=1,4,9,16,25', kind: 'terminal', senderName: 'Terminal' },
    { role: 'user', content: prompt },
  ];
  const screenText = [
    '› ' + prompt,
    'gpt-5.4 high · /private/tmp/adhdev-cli-verify-codex-cli',
    '',
    '•',
    '',
    '• I confirmed that tmp/adhdev_cli_verify.py was created and executed',
    ' successfully, and its raw output included UNICODE_SENTINEL=⟦ADHDEV-CLI-VERIFY⟧',
    ' gpt-5.4 high · /private/tmp/adhdev-cli-verify-codex-cli',
  ].join('\n');
  const recentBuffer = [
    '•Working( • esc to interrupt)›tab to queue message96% context left • ng g 1 W Wo • Wor •Work Worki • Workin • Working',
    '',
    '• I confirmed that tmp/adhdev_cli_verify.py was created and executed',
    '',
    'successfully, and its raw output included UNICODE_SENTINEL=⟦ADHDEV-CLI-VERIFY⟧',
    '',
    'and the square sequence 1,4,9,16,25 exactly as specified. › gpt-5.4 high · /private/tmp/adhdev-cli-verify-codex-cli',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    recentBuffer,
    messages: previous,
  });
  const contents = result.messages.map(m => m.content);
  const last = result.messages.at(-1);

  assert.equal(result.status, 'idle');
  assert.equal(last.role, 'assistant');
  assert.match(last.content, /tmp\/adhdev_cli_verify\.py/);
  assert.match(last.content, /UNICODE_SENTINEL=⟦ADHDEV-CLI-VERIFY⟧/);
  assert.match(last.content, /1,4,9,16,25/);
  assert.doesNotMatch(last.content, /gpt-5\.4 high/);
  assert.doesNotMatch(last.content, /tab to queue message/);
  assert.ok(!contents.includes('ing'));
  assert.ok(!contents.includes('3'));
  assert.ok(!contents.includes('6'));
});

test('codex detect_status trusts the active idle prompt over stale recentBuffer working fragments', () => {
  const screenText = [
    '• Ran python3 game_369.py --self-test',
    '  └ self-test passed',
    '    ADHDEV_369_DONE_CODEX_CLI',
    '',
    '────────────────────────────────────────────────────────────────────────────────',
    '',
    '• 생성 파일: game_369.py',
    '',
    '  실행 명령:',
    '  - python3 game_369.py',
    '  - python3 game_369.py --self-test',
    '',
    '  python3 game_369.py --self-test를 직접 실행해 확인했고, 실제 출력 마지막 줄은',
    '  아래와 같습니다.',
    '  - ADHDEV_369_DONE_CODEX_CLI',
    '',
    '›',
    '',
    'gpt-5.4 high · /private/tmp/adhdev-cli-quality-workspaces/codex-cli',
  ].join('\n');
  const staleRecentBuffer = [
    'Ran python3 game_369.py --self-test',
    '└ self-test passed',
    'ADHDEV_369_DONE_CODEX_CLI',
    '──────────────────────────────────────────────────────────────────────────────── Working • orking • rking •king ing • ng g',
  ].join('\n');

  assert.equal(detectStatus({ screenText, tail: staleRecentBuffer }), 'idle');
});

test('codex detect_status trusts the active ANSI idle prompt over stale recentBuffer working fragments', () => {
  const screenText = [
    '\x1b[32;1;22m•\x1b[0m \x1b[1mRan\x1b[0m \x1b[38;2;137;180;250mpython3\x1b[38;2;205;214;244m game_369.py\x1b[38;2;147;153;178m --\x1b[38;2;235;160;172mself-test',
    '\x1b[39;2m  └ self-test passed',
    '\x1b[0m    \x1b[2mADHDEV_369_DONE_CODEX_CLI',
    '',
    '────────────────────────────────────────────────────────────────────────────────',
    '',
    '• \x1b[0m생성 파일: \x1b[36mgame_369.py',
    '',
    '\x1b[39;1m›',
    '',
    '\x1b[22;2m  gpt-5.4 high · /private/tmp/adhdev-cli-quality-workspaces/codex-cli\x1b[0m\x1b[30;3H',
  ].join('\n');
  const staleRecentBuffer = '──────────────────────────────────────────────────────────────────────────────── Working • orking • rking •king ing • ng g';

  assert.equal(detectStatus({ screenText, tail: staleRecentBuffer }), 'idle');
});

test('codex detect_status trusts active idle footer over overprinted working residue', () => {
  const screenText = [
    '› Confirm the previous raw verification in one short paragraph.',
    '•   rk',
    '',
    '• Confirmed: tmp/adhdev_cli_verify.py was created and executed successfully,',
    '  preserving UNICODE_SENTINEL=⟦ADHDEV-CLI-VERIFY⟧ and 1,4,9,16,25.',
    '› gpt-5.5 medium · /private/tmp/adhdev-codex-live-verify-reset-4',
  ].join('\n');
  const staleRecentBuffer = [
    '• Working (0s • esc to interrupt)',
    'W    ng',
    'Wo    g',
    '• W',
  ].join('\n');

  assert.equal(detectStatus({ screenText, tail: staleRecentBuffer }), 'idle');
});

test('codex parse_output clears streaming and drops spinner residue when idle prompt is visible after completion', () => {
  const prompt = '3,6,9 게임을 만들고 self-test marker를 출력하세요.';
  const screenText = [
    '› ' + prompt,
    '• 작업 디렉터리는 비어 있습니다. 이제 game_369.py를 생성해서 게임 로직과 --self-test를 한 파일에 넣겠습니다. • esc to interupt) W Wo',
    '• Ran python3 game_369.py --self-test',
    '  └ self-test passed',
    '    ADHDEV_369_DONE_CODEX_CLI',
    '',
    '──────────────────────────────────────────────────────────────────────────────── Working • orking • rking •king ing • ng g',
    '',
    '• 생성 파일: game_369.py',
    '  실행 명령:',
    '  - python3 game_369.py',
    '  - python3 game_369.py --self-test',
    '  python3 game_369.py --self-test를 직접 실행해 확인했고, 실제 출력 마지막 줄은',
    '  아래와 같습니다.',
    '  - ADHDEV_369_DONE_CODEX_CLI',
    '',
    '›',
    'gpt-5.4 high · /private/tmp/adhdev-cli-quality-workspaces/codex-cli',
  ].join('\n');
  const recentBuffer = [
    '• Working( • esc to interrupt)›tab to queue message96% context left • ng g 1 W Wo • Wor •Work Worki • Workin • Working',
    '• 생성 파일: game_369.py',
    '  - ADHDEV_369_DONE_CODEX_CLI › gpt-5.4 high · /private/tmp/adhdev-cli-quality-workspaces/codex-cli',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    recentBuffer,
    messages: [{ role: 'user', content: prompt }],
  });
  const combined = result.messages.map(message => message.content).join('\n');
  const last = result.messages.at(-1);

  assert.equal(result.status, 'idle');
  assert.equal(last?.role, 'assistant');
  assert.equal(last?.meta?.streaming, undefined);
  assert.match(last?.content || '', /ADHDEV_369_DONE_CODEX_CLI/);
  assert.doesNotMatch(combined, /esc to interupt|esc to interrupt/i);
  assert.doesNotMatch(combined, /Working • orking|•Work Worki|rking •king|ing • ng g/i);
});

test('codex parse_output strips inline working residue attached to completed messages', () => {
  const screenText = [
    '› Verify raw output.',
    '• The file is in place. Running the exact command now and preserving the output literally for the final transcript. •Work Worki • Workin • Working •Working 3 •Working Working • orking • rking •king ing • ng g · 1 background terminal running · /ps to vie…',
    '• The file contents already match the requested source exactly, so I’m leaving it unchanged and running the exact command now. g 6',
    '',
    '• Ran python3 tmp/adhdev_cli_verify.py',
    ' └ LONG_SEQUENCE=BEGIN 01 02 03 04 05 06 07 08 09 10 END 4 W Wo • Wor •Work Worki • Workin • Working •Working 5 Working',
    ' └ LONG_SEQUENCE=BEGIN 01 02 03 04 05 06 07 08 09 10 END W Wo',
    ' └ ──────────────────────────────────────────────────────────────── W Wo',
    '',
    '• RAW VERIFY RESULT ›tab to queue message96% context left',
    'COMMAND',
    'python3 tmp/adhdev_cli_verify.py',
    'OUTPUT',
    'LONG_SEQUENCE=BEGIN 01 02 03 04 05 06 07 08 09 10 END',
    'The file was created and executed successfully. 5',
    'The previous raw verification succeeded exactly as specified. Working',
    '›',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [{ role: 'user', content: 'Verify raw output.' }],
  });
  const joined = result.messages.map(m => m.content).join('\n\n');

  assert.match(joined, /The file is in place\. Running the exact command now/);
  assert.match(joined, /LONG_SEQUENCE=BEGIN 01 02 03 04 05 06 07 08 09 10 END/);
  assert.doesNotMatch(joined, /•Work|Worki|Working Working|tab to queue message|background terminal running|\. g 6|END W Wo|successfully\. 5|specified\. Working|────────────────/);
});

test('codex parse_output strips live no-counter tool/status residue and partial fragments', () => {
  const screenText = [
    '› Create game_369.py.',
    '• Ran pwd',
    ' └ /tmp/adhdev-quality-codex-cli •Explored └ Listrg--files•Working(',
    '',
    '• Added game_369.py (+23 -0)',
    ' 1 +import sys',
    ' 2 +if __name__ == "__main__":',
    ' 3 +    main() Worki',
    '',
    '• The script is in place. Running the exact command now. •7',
    '›',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [{ role: 'user', content: 'Create game_369.py.' }],
  });
  const joined = result.messages.map(m => m.content).join('\n\n');

  assert.match(joined, /\/tmp\/adhdev-quality-codex-cli/);
  assert.match(joined, /main\(\)/);
  assert.match(joined, /The script is in place\. Running the exact command now\./);
  assert.doesNotMatch(joined, /•Explored|Listrg--files|Working\(|Worki\b|\s•7\b/);
});

test('codex parse_output strips live self-test spinner residue from marker terminal and final bubbles', () => {
  const prompt = 'Create game_369.py and print ADHDEV_369_DONE_CODEX_CLI.';
  const screenText = [
    '› ' + prompt,
    '• Ran python3 game_369.py --self-test',
    ' └ ADHDEV_369_DONE_CODEX_CLI •king ing • ng g',
    '',
    '────────────────────────────────────────────────────────────────────────────────',
    '',
    '• ADHDEV_369_DONE_CODEX_CLI 9',
    '',
    '›',
    '',
    'gpt-5.4 high · /private/tmp/adhdev-quality-codex-cli',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [{ role: 'user', content: prompt }],
  });
  const joined = result.messages.map(m => m.content).join('\n\n');
  const terminal = result.messages.find(m => m.kind === 'terminal');
  const standard = [...result.messages].reverse().find(m => m.kind === 'standard' && m.role === 'assistant');

  assert.equal(result.status, 'idle');
  assert.equal(terminal?.content, 'Ran python3 game_369.py --self-test\n└ ADHDEV_369_DONE_CODEX_CLI');
  assert.equal(standard?.content, 'ADHDEV_369_DONE_CODEX_CLI');
  assert.doesNotMatch(joined, /•king|\bing\b\s*•\s*ng|\bng\b\s+g|CODEX_CLI 9/);
});

test('codex parse_output strips overprinted tool/status residue appended to terminal output lines', () => {
  const screenText = [
    '› 3,6,9 게임을 만들고 self-test marker를 출력하세요.',
    '• Ran pwd',
    ' └ /tmp/adhdev-cli-quality-live-verify/codex-cli 96 •Explored └ Listrg--files•Working(',
    '',
    '• Explored',
    ' └ List rg --files',
    '',
    '• 생성 파일명: game_369.py',
    '실행한 명령: python3 game_369.py --self-test',
    'self-test 마지막 marker 줄: ADHDEV_369_DONE_CODEX_CLI',
    '›',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [{ role: 'user', content: '3,6,9 게임을 만들고 self-test marker를 출력하세요.' }],
  });
  const joined = result.messages.map(m => m.content).join('\n\n');

  assert.match(joined, /\/tmp\/adhdev-cli-quality-live-verify\/codex-cli/);
  assert.doesNotMatch(joined, /96\s+•Explored|Listrg--files|Working\(/i);
});

test('codex parser and status preserve cursor-forward spaces while removing OSC/private CSI noise', () => {
  const prompt = 'Say hello';
  const screenText = [
    `› ${prompt}`,
    `> hello\x1b[2Cworld\x1b[?25h\x1b]0;codex-title\x07 done`,
    '›',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [{ role: 'user', content: prompt }],
  });
  const assistant = [...result.messages].reverse().find(m => m.role === 'assistant' && m.kind === 'standard');

  assert.equal(detectStatus({ screenText }), 'idle');
  assert.equal(assistant?.content, 'hello world done');
});

test('codex parse_output prefers workspace-matched native JSONL over folded TUI transcript', () => {
  const originalHome = process.env.HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'adhdev-codex-native-home-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'adhdev-codex-native-work-'));
  process.env.HOME = home;
  try {
    const sessionId = '11111111-2222-4333-8444-555555555555';
    const sessionDir = path.join(home, '.codex', 'sessions', '2026', '05', '25');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, `rollout-${sessionId}.jsonl`), [
      JSON.stringify({ type: 'session_meta', timestamp: '2026-05-25T00:00:00.000Z', payload: { id: sessionId, cwd: workspace } }),
      JSON.stringify({ type: 'response_item', timestamp: '2026-05-25T00:00:01.000Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'make snake' }] } }),
      JSON.stringify({ type: 'response_item', timestamp: '2026-05-25T00:00:02.000Z', payload: { type: 'function_call_output', output: 'LINE_1\nLINE_2\nADHDEV_SNAKE_DONE_CODEX_CLI' } }),
      JSON.stringify({ type: 'response_item', timestamp: '2026-05-25T00:00:03.000Z', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Created snake_game.py and verified ADHDEV_SNAKE_DONE_CODEX_CLI.' }] } }),
    ].join('\n') + '\n', 'utf-8');

    const screenText = [
      '› make snake',
      '• Ran python3 snake_game.py --self-test',
      ' └ LINE_1',
      '   … +2 lines (ctrl + t to view transcript)',
      '• Created snake_game.py.',
      '›',
    ].join('\n');

    const result = parseOutput({
      workspace,
      workingDir: workspace,
      historySessionId: sessionId,
      screenText,
      buffer: screenText,
      messages: [{ role: 'user', content: 'make snake' }],
    });
    const joined = result.messages.map(m => m.content).join('\n\n');

    assert.equal(result.providerSessionId, sessionId);
    assert.equal(result.transcriptAuthority, 'provider');
    assert.equal(result.coverage, 'full');
    assert.match(joined, /ADHDEV_SNAKE_DONE_CODEX_CLI/);
    assert.doesNotMatch(joined, /… \+2 lines/);
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('codex parse_output keeps native JSONL authoritative while generating', () => {
  const originalHome = process.env.HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'adhdev-codex-native-generating-home-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'adhdev-codex-native-generating-workspace-'));
  const sessionId = '12345678-1234-4234-9234-123456789abc';
  try {
    process.env.HOME = home;
    const transcriptDir = path.join(home, '.codex', 'sessions', '2026', '05', '27');
    fs.mkdirSync(transcriptDir, { recursive: true });
    fs.writeFileSync(path.join(transcriptDir, `rollout-${sessionId}.jsonl`), [
      JSON.stringify({ type: 'session_meta', timestamp: '2026-05-27T00:00:00.000Z', payload: { id: sessionId, cwd: workspace } }),
      JSON.stringify({ type: 'response_item', timestamp: '2026-05-27T00:00:01.000Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'current prompt' }] } }),
      JSON.stringify({ type: 'response_item', timestamp: '2026-05-27T00:00:02.000Z', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'native assistant answer' }] } }),
      '',
    ].join('\n'));

    const screenText = [
      '› current prompt',
      '',
      '• native assistant answer',
      '',
      '• pty-only partial line that should not replace native',
      '',
      '• Working (4s • esc to interrupt)',
    ].join('\n');
    const rawBuffer = [
      `Session: ${sessionId}`,
      screenText,
    ].join('\n');

    const result = parseOutput({
      historySessionId: sessionId,
      sessionId,
      workspace,
      workingDir: workspace,
      rawBuffer,
      screenText,
      buffer: screenText,
      recentBuffer: screenText,
      messages: [{ role: 'user', content: 'current prompt' }],
    });
    const joined = result.messages.map(m => m.content).join('\n\n');

    assert.equal(result.status, 'generating');
    assert.equal(result.transcriptAuthority, 'provider');
    assert.equal(result.coverage, 'full');
    assert.equal(result.providerSessionId, sessionId);
    assert.match(joined, /native assistant answer/);
    assert.doesNotMatch(joined, /pty-only partial line/);
  } finally {
    process.env.HOME = originalHome;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('codex parse_output does not hydrate native JSONL by workspace alone without a concrete session id', () => {
  const originalHome = process.env.HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'adhdev-codex-native-home-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'adhdev-codex-native-work-'));
  process.env.HOME = home;
  try {
    const sessionId = '22222222-3333-4444-8555-666666666666';
    const sessionDir = path.join(home, '.codex', 'sessions', '2026', '05', '25');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, `rollout-${sessionId}.jsonl`), [
      JSON.stringify({ type: 'session_meta', timestamp: '2026-05-25T00:00:00.000Z', payload: { id: sessionId, cwd: workspace } }),
      JSON.stringify({ type: 'response_item', timestamp: '2026-05-25T00:00:01.000Z', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'assistant from another codex session' }] } }),
    ].join('\n') + '\n', 'utf-8');

    const screenText = [
      '› current prompt',
      '> assistant from current TUI',
      '›',
    ].join('\n');

    const result = parseOutput({
      workspace,
      workingDir: workspace,
      screenText,
      buffer: screenText,
      messages: [{ role: 'user', content: 'current prompt' }],
    });
    const joined = result.messages.map(m => m.content).join('\n\n');

    assert.equal(result.providerSessionId, undefined);
    assert.equal(result.transcriptAuthority, undefined);
    assert.match(joined, /assistant from current TUI/);
    assert.doesNotMatch(joined, /assistant from another codex session/);
  } finally {
    process.env.HOME = originalHome;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('codex detects rate-limit model switch dialog from raw buffer as approval', () => {
  const screenText = [
    '› Please verify raw CLI transcript fidelity',
    '',
    '◦',
    '',
    "■ You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro),",
    'visit https://chatgpt.com/codex/settings/usage to purchase more credits or try',
    'again at May 26th, 2026 1:46 AM.',
    '',
    '  Approaching rate limits',
  ].join('\n');
  const rawBuffer = [
    'Approaching rate limits',
    'Switch to gpt-5.4-mini for lower credit usage?',
    '› 1. Switch to gpt-5.4-mini                 Small, fast, and cost-efficient',
    '                                            model for simpler coding tasks.',
    '2. Keep current model',
    '3. Keep current model (never show again)    Hide future rate limit reminders',
    'Press enter to confirm or esc to go back',
  ].join('\n');

  const approval = parseApproval({ screenText, rawBuffer });
  const parsed = parseOutput({ screenText, rawBuffer, buffer: screenText, messages: [{ role: 'user', content: 'Please verify raw CLI transcript fidelity' }] });

  assert.equal(detectStatus({ screenText, rawBuffer }), 'waiting_approval');
  assert.deepEqual(approval?.buttons.slice(0, 3), [
    'Switch to gpt-5.4-mini Small, fast, and cost-efficient model for simpler coding tasks.',
    'Keep current model',
    'Keep current model (never show again) Hide future rate limit reminders',
  ]);
  assert.equal(parsed.status, 'waiting_approval');
  assert.equal(parsed.activeModal?.buttons.length, 3);
});

// ─── Regression: non-gpt-* model idle detection ──────────────────────────────

test('detect_status: idle footer with o3 model is recognized as idle', () => {
  const screenText = [
    '╭──────────────────────────────────────────────────────────╮',
    '│ >_ OpenAI Codex (v0.140.0)                              │',
    '╰──────────────────────────────────────────────────────────╯',
    '',
    '› Summarize recent commits',
    '',
    'o3 · /private/tmp/adhdev-codex-test',
  ].join('\n');

  assert.equal(
    detectStatus({ screenText, tail: screenText }),
    'idle',
    'o3 model footer should be recognized as idle',
  );
});

test('detect_status: idle footer with o4-mini model is recognized as idle', () => {
  const screenText = [
    '╭──────────────────────────────────────────────────────────╮',
    '│ >_ OpenAI Codex (v0.140.0)                              │',
    '╰──────────────────────────────────────────────────────────╯',
    '',
    '› Summarize recent commits',
    '',
    'o4-mini · /private/tmp/adhdev-codex-test',
  ].join('\n');

  assert.equal(
    detectStatus({ screenText, tail: screenText }),
    'idle',
    'o4-mini model footer should be recognized as idle',
  );
});

test('detect_status: idle footer with codex-mini-latest model is recognized as idle', () => {
  const screenText = [
    '╭──────────────────────────────────────────────────────────╮',
    '│ >_ OpenAI Codex (v0.140.0)                              │',
    '╰──────────────────────────────────────────────────────────╯',
    '',
    '› Summarize recent commits',
    '',
    'codex-mini-latest · /private/tmp/adhdev-codex-test',
  ].join('\n');

  assert.equal(
    detectStatus({ screenText, tail: screenText }),
    'idle',
    'codex-mini-latest footer should be recognized as idle',
  );
});

test('detect_status: o3 model footer after working output correctly resolves to idle', () => {
  const screenText = [
    '• Working on something',
    '',
    '• Done with the task now',
    '',
    '›',
    '',
    'o3 · /private/tmp/adhdev-codex-test',
  ].join('\n');
  const tail = [
    'Working(5s',
    '• Done with the task now',
    '›',
    'o3 · /private/tmp/adhdev-codex-test',
  ].join('\n');

  assert.equal(
    detectStatus({ screenText, tail }),
    'idle',
    'idle footer with o3 should win over stale working fragment',
  );
});

test('detect_status: o4-mini model with reasoning level in footer is idle', () => {
  const screenText = [
    '› What is 2+2?',
    '',
    '• 4',
    '',
    '›',
    '',
    'o4-mini medium · /private/tmp/adhdev-codex-test',
  ].join('\n');

  assert.equal(
    detectStatus({ screenText, tail: screenText }),
    'idle',
    'o4-mini with reasoning level in footer should be idle',
  );
});

test('detect_status: generating is still correctly detected for o3 while Esc to interrupt is present', () => {
  const screenText = [
    '• Working (12s • esc to interrupt)',
    '',
    '• Processing your request...',
    '',
    'o3 · /private/tmp/adhdev-codex-test',
  ].join('\n');

  assert.equal(
    detectStatus({ screenText, tail: screenText }),
    'generating',
    'Esc to interrupt beats idle footer even with o3 model',
  );
});

// ─── Regression: model/reasoning picker action scripts ───────────────────────
// Codex CLI uses interactive terminal pickers (/model, /reasoning) rather than
// deterministic programmatic set commands. Controls are action buttons, not selects.

test('open_model_picker: returns pty_write /model command with toast effect', () => {
  const openModelPicker = require('../cli/codex-cli/scripts/1.0/open_model_picker.js');
  const result = openModelPicker();
  assert.equal(result.ok, true);
  assert.equal(result.command.type, 'pty_write');
  assert.equal(result.command.text, '/model');
  assert.equal(result.command.enterCount, 2);
  assert.ok(Array.isArray(result.effects));
  assert.ok(result.effects.some(e => e.type === 'toast'));
});

test('open_reasoning_picker: returns pty_write /reasoning command with toast effect', () => {
  const openReasoningPicker = require('../cli/codex-cli/scripts/1.0/open_reasoning_picker.js');
  const result = openReasoningPicker();
  assert.equal(result.ok, true);
  assert.equal(result.command.type, 'pty_write');
  assert.equal(result.command.text, '/reasoning');
  assert.equal(result.command.enterCount, 2);
  assert.ok(Array.isArray(result.effects));
  assert.ok(result.effects.some(e => e.type === 'toast'));
});

test('provider.json: model_picker and reasoning_picker are action controls with invokeScript', () => {
  const provider = require('../cli/codex-cli/provider.json');
  const modelPicker = provider.controls.find(c => c.id === 'model_picker');
  const reasoningPicker = provider.controls.find(c => c.id === 'reasoning_picker');

  assert.ok(modelPicker, 'model_picker control should exist');
  assert.equal(modelPicker.type, 'action');
  assert.equal(modelPicker.invokeScript, 'openModelPicker');
  assert.equal(modelPicker.readFrom, 'model', 'model_picker should readFrom model for inline display');

  assert.ok(reasoningPicker, 'reasoning_picker control should exist');
  assert.equal(reasoningPicker.type, 'action');
  assert.equal(reasoningPicker.invokeScript, 'openReasoningPicker');
  assert.equal(reasoningPicker.readFrom, 'reasoning', 'reasoning_picker should readFrom reasoning for inline display');
});

test('provider.json: no dead display controls for model or reasoning', () => {
  const provider = require('../cli/codex-cli/provider.json');
  const deadDisplays = provider.controls.filter(
    c => c.type === 'display' && (c.id === 'model' || c.id === 'reasoning'),
  );
  assert.equal(deadDisplays.length, 0, 'display-only model/reasoning controls should not exist — they are not clickable');
});

test('detect_status: Codex stays generating when tool activity appears after a stale idle prompt', () => {
  const rawBuffer = [
    '› gpt-5.1 codex · /model',
    '',
    '>',
    '',
    'functions.write_stdin({"session_id":123,"chars":"","yield_time_ms":30000})',
    'Waiting for command output',
  ].join('\n');

  assert.equal(
    detectStatus({
      screenText: '>\n',
      tail: rawBuffer,
      rawBuffer,
      isWaitingForResponse: true,
    }),
    'generating',
  );
});

test('detect_status: Codex returns idle when prompt-ready evidence is newer than tool activity', () => {
  const rawBuffer = [
    'functions.write_stdin({"session_id":123,"chars":"","yield_time_ms":30000})',
    'Tool output received',
    '',
    '>',
    '› gpt-5.1 codex · /model',
  ].join('\n');

  assert.equal(
    detectStatus({
      screenText: '>\n› gpt-5.1 codex · /model',
      tail: rawBuffer,
      rawBuffer,
      isWaitingForResponse: true,
    }),
    'idle',
  );
});

test('parse_output: rejects Codex native history by workspace before visible session id is known', () => {
  const previousHome = process.env.HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'adhdev-codex-native-home-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'adhdev-codex-native-workspace-'));
  const sessionId = '11111111-2222-4333-8444-555555555555';
  const sessionDir = path.join(home, '.codex', 'sessions', '2026', '05', '28');
  const sessionPath = path.join(sessionDir, `rollout-2026-05-28T00-00-00-${sessionId}.jsonl`);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(sessionPath, [
    JSON.stringify({
      timestamp: '2026-05-28T00:00:00.000Z',
      type: 'session_meta',
      payload: { id: sessionId, cwd: workspace },
    }),
    JSON.stringify({
      timestamp: '2026-05-28T00:00:01.000Z',
      type: 'response_item',
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Preserve this output' }] },
    }),
    JSON.stringify({
      timestamp: '2026-05-28T00:00:02.000Z',
      type: 'response_item',
      payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'RAW VERIFY RESULT\nUNICODE_SENTINEL=⟦ADHDEV-CLI-VERIFY⟧\nPIPE_ROW=left|middle|right' }] },
    }),
  ].join('\n') + '\n', 'utf8');

  try {
    process.env.HOME = home;
    const parsed = parseOutput({
      workspace,
      screenText: [
        '› Preserve this output',
        '',
        '• truncated PTY-only text',
        '',
        '›',
        '',
        `gpt-5.4 low · ${workspace}`,
      ].join('\n'),
      buffer: '',
      recentBuffer: '',
      promptText: 'Preserve this output',
      messages: [],
    });

    assert.equal(parsed.providerSessionId, undefined);
    assert.equal(parsed.transcriptAuthority, undefined);
    assert.equal(parsed.coverage, undefined);
    assert.ok(!parsed.messages.some(message => message.role === 'assistant' && message.content.includes('UNICODE_SENTINEL=⟦ADHDEV-CLI-VERIFY⟧')));
    assert.ok(parsed.messages.some(message => message.content.includes('truncated PTY-only text')));
    assert.equal(parsed.transcriptProvenance.identityStatus, 'transcript_unmapped');
    assert.equal(parsed.transcriptProvenance.unsafeIdentity.reason, 'codex_native_history_requires_provider_session_id');
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('parse_output: uses Codex native history only with matching provider session and workspace', () => {
  const previousHome = process.env.HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'adhdev-codex-native-home-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'adhdev-codex-native-workspace-'));
  const sessionId = '11111111-2222-4333-8444-555555555555';
  const sessionDir = path.join(home, '.codex', 'sessions', '2026', '05', '28');
  const sessionPath = path.join(sessionDir, `rollout-2026-05-28T00-00-00-${sessionId}.jsonl`);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(sessionPath, [
    JSON.stringify({
      timestamp: '2026-05-28T00:00:00.000Z',
      type: 'session_meta',
      payload: { id: sessionId, cwd: workspace },
    }),
    JSON.stringify({
      timestamp: '2026-05-28T00:00:01.000Z',
      type: 'response_item',
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Preserve this output' }] },
    }),
    JSON.stringify({
      timestamp: '2026-05-28T00:00:02.000Z',
      type: 'response_item',
      payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'RAW VERIFY RESULT\nUNICODE_SENTINEL=ADHDEV-CLI-VERIFY' }] },
    }),
  ].join('\n') + '\n', 'utf8');

  try {
    process.env.HOME = home;
    const parsed = parseOutput({
      providerSessionId: sessionId,
      workspace,
      workingDir: workspace,
      screenText: [
        '› Preserve this output',
        '',
        '• truncated PTY-only text',
        '',
        '›',
        '',
        `gpt-5.4 low · ${workspace}`,
      ].join('\n'),
      buffer: '',
      recentBuffer: '',
      promptText: 'Preserve this output',
      messages: [],
    });

    assert.equal(parsed.providerSessionId, sessionId);
    assert.equal(parsed.transcriptAuthority, 'provider');
    assert.equal(parsed.coverage, 'full');
    assert.equal(parsed.transcriptProvenance.selected, 'native-history');
    assert.ok(parsed.messages.some(message => message.role === 'assistant' && message.content.includes('UNICODE_SENTINEL=ADHDEV-CLI-VERIFY')));
    assert.ok(!parsed.messages.some(message => message.content.includes('truncated PTY-only text')));
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

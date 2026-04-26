const test = require('node:test');
const assert = require('node:assert/strict');
const detectStatus = require('../cli/codex-cli/scripts/1.0/detect_status.js');
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

test('codex detect_status treats startup booting fragments plus a default starter prompt as idle, not generating', () => {
  assert.equal(
    detectStatus({ screenText: startupPromptScreen, tail: startupPromptTail }),
    'idle',
  );
});

test('codex detect_status returns idle once the bare prompt is back at the bottom even if older working lines remain on screen', () => {
  assert.equal(
    detectStatus({ screenText: completedTurnScreen, tail: completedTurnTail }),
    'idle',
  );
});

test('codex detect_status returns idle when a follow-up reply ends and the idle footer reappears after stale working fragments', () => {
  assert.equal(
    detectStatus({ screenText: followupTurnScreen, tail: followupTurnTail }),
    'idle',
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

test('codex rehydrates fenced python/text blocks from a rendered script section', () => {
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
  assert.match(assistant, /```python[\s\S]*def main\(\) -> None:[\s\S]*```/);
  assert.match(assistant, /```text[\s\S]*SQUARES=1,4,9,16,25[\s\S]*```/);
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

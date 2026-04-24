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
  assert.match(result.messages.at(-1)?.content || '', /Creating tmp\/adhdev_cli_verify\.py/);
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

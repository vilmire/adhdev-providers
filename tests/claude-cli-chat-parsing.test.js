const test = require('node:test');
const assert = require('node:assert/strict');

const parseOutput = require('../cli/claude-cli/scripts/1.0/parse_output.js');
const detectStatus = require('../cli/claude-cli/scripts/1.0/detect_status.js');
const { buildScreenSnapshot } = require('../cli/claude-cli/scripts/1.0/screen_helpers.js');

function toMessages(result) {
  return result.messages.map((message) => ({
    role: message.role,
    kind: message.kind,
    senderName: message.senderName,
    content: message.content,
    meta: message.meta,
  }));
}



test('claude-cli treats a separator-bounded > row as the live input prompt region', () => {
  const screenText = [
    '⏺ Earlier assistant answer.',
    '──────────────────────────────────────────────────────────────────────────────',
    '> currently typed user input',
    '──────────────────────────────────────────────────────────────────────────────',
  ].join('\n');

  const screen = buildScreenSnapshot(screenText);
  assert.equal(screen.promptLine?.trimmed, '> currently typed user input');
  assert.equal(detectStatus({ screenText, screen }), 'idle');
});

test('claude-cli treats interrupt copy inside the live input prompt as generating', () => {
  const screenText = [
    '⏺ Earlier assistant answer.',
    '──────────────────────────────────────────────────────────────────────────────',
    '> type a message + Enter to interrupt, Ctrl+C to cancel',
    '──────────────────────────────────────────────────────────────────────────────',
  ].join('\n');

  const screen = buildScreenSnapshot(screenText);
  assert.equal(screen.promptLine?.trimmed, '> type a message + Enter to interrupt, Ctrl+C to cancel');
  assert.equal(detectStatus({ screenText, screen }), 'generating');
  assert.equal(parseOutput({ screenText, buffer: screenText, messages: [] }).status, 'generating');
});

test('claude-cli does not treat interrupt copy outside the live input prompt as generating', () => {
  const screenText = [
    '⏺ Literal text: type a message + Enter to interrupt, Ctrl+C to cancel',
    '❯',
  ].join('\n');

  const screen = buildScreenSnapshot(screenText);
  assert.equal(screen.promptLine?.trimmed, '❯');
  assert.equal(detectStatus({ screenText, screen }), 'idle');
});

test('claude-cli does not treat separator-bounded assistant blockquotes away from the live input footer as prompt-ready', () => {
  const screenText = [
    '⏺ Here is a quoted section:',
    '──────────────────────────────────────────────────────────────────────────────',
    '> quoted assistant content, not a prompt box',
    '──────────────────────────────────────────────────────────────────────────────',
    '⏺ continuing the same assistant reply',
  ].join('\n');

  const screen = buildScreenSnapshot(screenText);
  assert.equal(screen.promptLineIndex, -1);
  assert.equal(detectStatus({ screenText, screen }), 'generating');
});

test('claude-cli does not treat an unbounded > content line as the input prompt region', () => {
  const screenText = [
    '⏺ Earlier assistant answer.',
    '> quoted assistant content, not a prompt box',
  ].join('\n');

  const screen = buildScreenSnapshot(screenText);
  assert.equal(screen.promptLineIndex, -1);
});

test('claude-cli parse_output drops Claude completion footer from final assistant bubble', () => {
  const prompt = '3,6,9 게임을 만들고 self-test marker를 출력하세요.';
  const screenText = [
    '❯ ' + prompt,
    '',
    '⏺ 생성 파일: game_369.py',
    '실행 명령: python3 game_369.py --self-test',
    'self-test 실제 출력 마지막 줄: ADHDEV_369_DONE_CLAUDE_CLI',
    '',
    'Brewed for 16s',
    '',
    '❯',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    promptText: prompt,
    messages: [{ role: 'user', content: prompt }],
  });
  const assistant = result.messages.find((message) => message.role === 'assistant' && (message.kind || 'standard') === 'standard');

  assert.ok(assistant);
  assert.match(assistant.content, /ADHDEV_369_DONE_CLAUDE_CLI/);
  assert.doesNotMatch(assistant.content, /Brewed for \d+s/i);
});

test('claude-cli parse_output drops Churned completion footer variants from final assistant bubble', () => {
  const prompt = '3,6,9 게임을 만들고 self-test marker를 출력하세요.';
  const screenText = [
    '❯ ' + prompt,
    '',
    '⏺ - 생성 파일: game_369.py',
    '- 실행 명령: python3 game_369.py --self-test',
    '- 마지막 marker: ADHDEV_369_DONE_CLAUDE_CLI',
    'Churned for 14s',
    '❯ 1',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    promptText: prompt,
    messages: [{ role: 'user', content: prompt }],
  });
  const assistant = result.messages.find((message) => message.role === 'assistant' && (message.kind || 'standard') === 'standard');

  assert.ok(assistant);
  assert.match(assistant.content, /ADHDEV_369_DONE_CLAUDE_CLI/);
  assert.doesNotMatch(assistant.content, /Churned for \d+s/i);
  assert.doesNotMatch(assistant.content, /^❯/m);
});

test('claude-cli parse_output keeps full prior transcript instead of slicing to the last 50 messages', () => {
  const priorMessages = Array.from({ length: 60 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `turn-${index + 1}`,
  }));

  const result = parseOutput({
    screenText: [
      '❯ turn-61',
      '⏺ turn-62',
      '❯',
      '➜ remote_vs git:(main) ✗                                   ● high · /effort',
    ].join('\n'),
    buffer: [
      '❯ turn-61',
      '⏺ turn-62',
      '❯',
    ].join('\n'),
    messages: priorMessages,
  });

  assert.equal(result.messages.length, 62);
  assert.deepEqual(toMessages(result).slice(0, 4).map(({ role, content }) => ({ role, content })), [
    { role: 'user', content: 'turn-1' },
    { role: 'assistant', content: 'turn-2' },
    { role: 'user', content: 'turn-3' },
    { role: 'assistant', content: 'turn-4' },
  ]);
  assert.deepEqual(toMessages(result).slice(-4).map(({ role, content }) => ({ role, content })), [
    { role: 'user', content: 'turn-59' },
    { role: 'assistant', content: 'turn-60' },
    { role: 'user', content: 'turn-61' },
    { role: 'assistant', content: 'turn-62' },
  ]);
});

test('claude-cli preserves raw verify output without wrapping uppercase marker lines as python', () => {
  const screenText = [
    '❯ raw verify prompt',
    '',
    '⏺ RAW VERIFY RESULT',
    'Command run:',
    'python3 tmp/adhdev_cli_verify.py',
    'Exact output:',
    'CWD=/tmp/adhdev-cli-verify-claude-raw',
    'SQUARES=1,4,9,16,25',
    'JSON={"squares":[1,4,9,16,25],"ok":true}',
    'UNICODE_SENTINEL=⟦ADHDEV-CLI-VERIFY⟧',
    'GLYPHS=⏺ ⎿ ✢ ◆ ◇ ↳ ✓ ⚠ ❌ 🜁 𓂀 한글',
    'PIPE_ROW=left|middle|right',
    'LONG_SEQUENCE=BEGIN 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19',
    '20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 END',
    '',
    'The file tmp/adhdev_cli_verify.py was created and executed successfully.',
    '❯',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [{ role: 'user', content: 'raw verify prompt' }],
    promptText: 'raw verify prompt',
  });
  const assistant = result.messages.find((message) => message.role === 'assistant' && (message.kind || 'standard') === 'standard');

  assert.ok(assistant, 'assistant message should be present');
  assert.equal(assistant.content.includes('```python'), false);
  assert.equal(assistant.content.includes('```'), false);
  assert.match(assistant.content.replace(/\s+/g, ' '), /LONG_SEQUENCE=BEGIN 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 END/);
});


test('claude-cli parse_output keeps a multiline numbered user prompt as one user turn instead of emitting stray numeric prompt fragments', () => {
  const prompt = [
    'Please do all of the following in this workspace:',
    '1. Create tmp/adhdev_cli_verify.py that prints exactly these three lines:',
    ' CWD=<current working directory>',
    ' SQUARES=1,4,9,16,25',
    ' JSON={"squares":[1,4,9,16,25]}',
    '2. Run python3 tmp/adhdev_cli_verify.py.',
    '3. Respond with a short summary.',
  ].join('\n');

  const result = parseOutput({
    screenText: [
      '❯ Please do all of the following in this workspace:',
      '1. Create tmp/adhdev_cli_verify.py that prints exactly these three lines:',
      ' CWD=<current working directory>',
      ' SQUARES=1,4,9,16,25',
      ' JSON={"squares":[1,4,9,16,25]}',
      '2. Run python3 tmp/adhdev_cli_verify.py.',
      '3. Respond with a short summary.',
      '',
      '⏺ I created the file and ran it.',
      '',
      '❯',
    ].join('\n'),
    buffer: [
      '❯ Please do all of the following in this workspace:',
      '1. Create tmp/adhdev_cli_verify.py that prints exactly these three lines:',
      ' CWD=<current working directory>',
      ' SQUARES=1,4,9,16,25',
      ' JSON={"squares":[1,4,9,16,25]}',
      '2. Run python3 tmp/adhdev_cli_verify.py.',
      '3. Respond with a short summary.',
      '',
      '⏺ I created the file and ran it.',
      '',
      '❯',
    ].join('\n'),
    messages: [],
  });

  assert.deepEqual(
    toMessages(result).map(({ role, content }) => ({ role, content })),
    [
      { role: 'user', content: prompt },
      { role: 'assistant', content: 'I created the file and ran it.' },
    ],
  );
});

test('claude-cli parse_output ignores a bare numeric approval-selection echo prompt while assistant output is still continuing', () => {
  const prompt = [
    'Please do all of the following in this workspace:',
    '1. Create tmp/adhdev_cli_verify.py that prints exactly these three lines:',
    ' CWD=<current working directory>',
    ' SQUARES=1,4,9,16,25',
    ' JSON={"squares":[1,4,9,16,25]}',
    '2. Run python3 tmp/adhdev_cli_verify.py.',
    '3. Respond with:',
    ' - a one-sentence summary',
    ' - a markdown table for the numbers and squares',
  ].join('\n');

  const result = parseOutput({
    screenText: [
      '❯ Please do all of the following in this workspace:',
      '1. Create tmp/adhdev_cli_verify.py that prints exactly these three lines:',
      ' CWD=<current working directory>',
      ' SQUARES=1,4,9,16,25',
      ' JSON={"squares":[1,4,9,16,25]}',
      '2. Run python3 tmp/adhdev_cli_verify.py.',
      '3. Respond with:',
      ' - a one-sentence summary',
      ' - a markdown table for the numbers and squares',
      '',
      '⏺ Bash(python3 tmp/adhdev_cli_verify.py)',
      ' ⎿  CWD=/private/tmp/adhdev-cli-verify-claude-cli',
      ' SQUARES=1,4,9,16,25',
      ' JSON={"squares":[1,4,9,16,25]}',
      '',
      '⏺ The script runs correctly, printing the working directory, squares of 1–5, and',
      ' a JSON object.',
      '',
      ' ┌────────┬────────┐',
      ' │ Number │ Square │',
      ' ├────────┼────────┤',
      ' │ 1 │ 1 │',
      ' ├────────┼────────┤',
      ' │ 2 │ 4 │',
      ' ├────────┼────────┤',
      ' │ 3 │ 9 │',
      ' └────────┴────────┘',
      '',
      '❯ 1',
      '➜ adhdev-cli-verify-claude-cli gi… Update available! Run: brew upgrade cla…',
      '⏵⏵ accept edits on (shift+tab to',
    ].join('\n'),
    buffer: '',
    promptText: prompt,
    messages: [{ role: 'user', content: prompt }],
  });

  const assistant = result.messages.find((message) => message.role === 'assistant' && (message.kind || 'standard') === 'standard');
  assert.ok(assistant);
  assert.match(assistant.content, /\| Number \| Square \|/);
  assert.equal(result.messages.filter((message) => message.role === 'user').length, 1);
});

test('claude-cli parse_output strips a leading numeric approval-selection residue from the next visible prompt', () => {
  const previousPrompt = 'Please do all of the following in this workspace:\n1. Create tmp/adhdev_cli_verify.py';
  const followupPrompt = 'In one short paragraph, summarize what you just executed. You must mention tmp/adhdev_cli_verify.py and the square sequence 1,4,9,16,25.';

  const result = parseOutput({
    screenText: [
      '⏺ Prior answer',
      '',
      '❯ 1In one short paragraph, summarize what you just executed. You must mention',
      'tmp/adhdev_cli_verify.py and the square sequence 1,4,9,16,25.',
      '',
      '⏺ I ran tmp/adhdev_cli_verify.py and verified the square sequence 1,4,9,16,25.',
      '',
      '❯',
    ].join('\n'),
    buffer: '',
    promptText: followupPrompt,
    messages: [
      { role: 'user', content: previousPrompt },
      { role: 'assistant', content: 'Prior answer' },
    ],
  });

  const userMessages = result.messages.filter((message) => message.role === 'user').map((message) => message.content);
  assert.deepEqual(userMessages, [previousPrompt, followupPrompt]);
});

test('claude-cli parse_output preserves markdown table, fenced python block, and exact output block from the visible assistant reply', () => {
  const prompt = [
    'Please do all of the following in this workspace:',
    '1. Create tmp/adhdev_cli_verify.py that prints exactly these three lines:',
    '   CWD=<current working directory>',
    '   SQUARES=1,4,9,16,25',
    '   JSON={"squares":[1,4,9,16,25]}',
    '2. Run python3 tmp/adhdev_cli_verify.py.',
    '3. Respond with:',
    '   - a one-sentence summary',
    '   - a markdown table for the numbers and squares',
    '   - a fenced python code block containing the script',
    '   - a fenced text block containing the exact command output',
  ].join('\n');

  const result = parseOutput({
    screenText: [
      '❯ Please do all of the following in this workspace:',
      '1. Create tmp/adhdev_cli_verify.py that prints exactly these three lines:',
      ' CWD=<current working directory>',
      ' SQUARES=1,4,9,16,25',
      ' JSON={"squares":[1,4,9,16,25]}',
      '2. Run python3 tmp/adhdev_cli_verify.py.',
      '3. Respond with:',
      ' - a one-sentence summary',
      ' - a markdown table for the numbers and squares',
      ' - a fenced python code block containing the script',
      ' - a fenced text block containing the exact command output',
      '',
      '⏺ Bash(python3 tmp/adhdev_cli_verify.py)',
      ' ⎿  CWD=/private/tmp/adhdev-cli-verify-claude-cli',
      ' SQUARES=1,4,9,16,25',
      ' JSON={"squares":[1,4,9,16,25]}',
      '',
      '⏺ The script prints the current working directory, a comma-separated list of',
      ' squares, and a JSON representation of those squares.',
      '',
      ' ┌────────┬────────┐',
      ' │ Number │ Square │',
      ' ├────────┼────────┤',
      ' │ 1 │ 1 │',
      ' ├────────┼────────┤',
      ' │ 2 │ 4 │',
      ' ├────────┼────────┤',
      ' │ 3 │ 9 │',
      ' ├────────┼────────┤',
      ' │ 4 │ 16 │',
      ' ├────────┼────────┤',
      ' │ 5 │ 25 │',
      ' └────────┴────────┘',
      '',
      ' import os',
      ' import json',
      '',
      ' cwd = os.getcwd()',
      ' numbers = [1, 2, 3, 4, 5]',
      ' squares = [n * n for n in numbers]',
      '',
      ' print(f"CWD={cwd}")',
      ' print(f"SQUARES={",".join(str(s) for s in squares)}")',
      ' print(f"JSON={json.dumps({"squares": squares}, separators=(",", ":"))}")',
      '',
      ' CWD=/private/tmp/adhdev-cli-verify-claude-cli',
      ' SQUARES=1,4,9,16,25',
      ' JSON={"squares":[1,4,9,16,25]}',
      '',
      '❯',
    ].join('\n'),
    buffer: '',
    messages: [{ role: 'user', content: prompt }],
  });

  const assistant = result.messages.find((message) => message.role === 'assistant' && (message.kind || 'standard') === 'standard');
  assert.ok(assistant);
  assert.match(assistant.content, /\| Number \| Square \|/);
  assert.match(assistant.content, /```python/);
  assert.match(assistant.content, /SQUARES=1,4,9,16,25/);
  assert.match(assistant.content, /JSON=\{"squares":\[1,4,9,16,25\]\}/);
});

test('claude-cli parse_output surfaces visible tool activity and assistant progress bubbles during generation', () => {
  const screenText = [
    '❯ Use bash to print pwd and then explain the result.',
    '⏺ I am checking the working directory first.',
    '⏺ Bash(pwd)',
    '  ⎿ /Users/vilmire/Work/remote_vs',
    '⏺ I have the path. Summarizing now.',
    '⏺ Read(package.json)',
    '  ⎿ Read 1 file',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [],
  });

  assert.equal(result.status, 'generating');
  assert.deepEqual(toMessages(result).map(({ role, kind, senderName, content }) => ({ role, kind, senderName, content })), [
    {
      role: 'user',
      kind: 'standard',
      senderName: undefined,
      content: 'Use bash to print pwd and then explain the result.',
    },
    {
      role: 'assistant',
      kind: 'standard',
      senderName: undefined,
      content: 'I am checking the working directory first.',
    },
    {
      role: 'assistant',
      kind: 'terminal',
      senderName: 'Terminal',
      content: '$ pwd',
    },
    {
      role: 'assistant',
      kind: 'standard',
      senderName: undefined,
      content: 'I have the path. Summarizing now.',
    },
    {
      role: 'assistant',
      kind: 'tool',
      senderName: 'Tool',
      content: 'Read(package.json)',
    },
  ]);
  assert.equal(result.messages.at(-1)?.meta?.streaming, true);
});

test('claude-cli detect_status stays generating when only tool activity is visible and no idle prompt has returned', () => {
  const status = detectStatus({
    screenText: [
      '⏺ Bash(pwd)',
      '  ⎿ /Users/vilmire/Work/remote_vs',
      '⏺ Read(package.json)',
      '  ⎿ Read 1 file',
    ].join('\n'),
    tail: '⏺ Read(package.json)\n  ⎿ Read 1 file',
  });

  assert.equal(status, 'generating');
});

test('claude-cli detect_status treats compacting/token metric lines as generating even with a trailing prompt footer', () => {
  const status = detectStatus({
    screenText: [
      '✢ Compacting conversation… (9m 15s · ↑ 32.7k tokens · thought for 1s)',
      '  ⎿ Tip: Running multiple Claude sessions? Use /color and /rename to tell them apart at a glance',
      '',
      '────────────────────────────────────────────────────────────────────────────────',
      '❯ ',
      '────────────────────────────────────────────────────────────────────────────────',
      '  ⏵⏵ accept edits on (shift+tab to cycle) · esc to interrupt',
    ].join('\n'),
    tail: '✢ Compacting conversation… (9m 15s · ↑ 32.7k tokens · thought for 1s)\n❯\n  ⏵⏵ accept edits on (shift+tab to cycle) · esc to interrupt',
  });

  assert.equal(status, 'generating');
});

test('claude-cli detect_status returns idle when a completed assistant reply is the last meaningful line before the idle prompt', () => {
  const status = detectStatus({
    screenText: [
      '❯ Reply with exactly T2:T1 and nothing else.',
      '',
      '⏺ T2:T1',
      '',
      '❯ Create a file named seven_turn_note.txt with exactly three lines A, B, C and',
      ' then reply with exactly T3 and nothing else.',
      '',
      '⏺ Write(seven_turn_note.txt)',
      ' ⎿  Wrote 3 lines to seven_turn_note.txt',
      ' 1 A',
      ' 2 B',
      ' 3 C',
      '',
      '⏺ T3',
      '',
      '────────────────────────────────────────────────────────────────────────────────',
      '❯ ',
      '────────────────────────────────────────────────────────────────────────────────',
      ' ⏵⏵ accept edits on (shift+tab to cycle)',
    ].join('\n'),
    tail: '⏺ T3\n❯',
  });

  assert.equal(status, 'idle');
});

test('claude-cli parse_output keeps generating and surfaces live tool lines from a real runtime snapshot with a trailing prompt', () => {
  const screenText = [
    '           Claude Code v2.1.114',
    '▗ ▗   ▖ ▖  Opus 4.7 with xhigh effort · Claude Pro',
    '           ~/.openclaw/workspace/projects/adhdev',
    '  ▘▘ ▝▝    Welcome to Opus 4.7 xhigh! · /effort to tune speed vs. intellige…',
    '',
    '❯ Run pwd, read package.json, narrate briefly.                                  ',
    '   ',
    '⏺ I\'ll run pwd and read package.json in parallel.                               ',
    '                                                                              ',
    '⏺ Bash(pwd)                                                                     ',
    '  ⎿  Running…',
    '                                                                                ',
    '⏺ Reading 1 file… (ctrl+o to expand)                        ',
    '                                                                                ',
    '· Considering…                                              ',
    '',
    '────────────────────────────────────────────────────────────────────────────────',
    '❯ ',
    '────────────────────────────────────────────────────────────────────────────────',
    '  ⏵⏵ accept edits on (shift+tab to cycle) · esc to interrupt',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [{ role: 'user', content: 'Run pwd, read package.json, narrate briefly.' }],
  });

  assert.equal(result.status, 'generating');
  assert.deepEqual(toMessages(result).map(({ role, kind, senderName, content }) => ({ role, kind, senderName, content })), [
    {
      role: 'user',
      kind: 'standard',
      senderName: undefined,
      content: 'Run pwd, read package.json, narrate briefly.',
    },
    {
      role: 'assistant',
      kind: 'standard',
      senderName: undefined,
      content: "I'll run pwd and read package.json in parallel.",
    },
    {
      role: 'assistant',
      kind: 'terminal',
      senderName: 'Terminal',
      content: '$ pwd',
    },
    {
      role: 'assistant',
      kind: 'tool',
      senderName: 'Tool',
      content: 'Reading 1 file… (ctrl+o to expand)',
    },
    {
      role: 'assistant',
      kind: 'standard',
      senderName: undefined,
      content: '· Considering…',
    },
  ]);
});

test('claude-cli parse_output treats literal generating spinner text as status chrome, not assistant content', () => {
  const prompt = 'Do something briefly.';
  for (const spinnerText of ['· Generating…', '⏺ Generating…', '· Noodling…', '⏺ Pollinating…']) {
    const screenText = [
      `❯ ${prompt}`,
      spinnerText,
      '',
      '────────────────────────────────────────────────────────────────────────────────',
      '❯ ',
      '────────────────────────────────────────────────────────────────────────────────',
      '  ⏵⏵ accept edits on (shift+tab to cycle) · esc to interrupt',
    ].join('\n');

    const result = parseOutput({
      screenText,
      buffer: screenText,
      messages: [{ role: 'user', content: prompt }],
    });

    assert.equal(result.status, 'generating', `${spinnerText} should keep status generating`);
    assert.deepEqual(
      toMessages(result).map(({ role, kind, senderName, content }) => ({ role, kind, senderName, content })),
      [
        {
          role: 'user',
          kind: 'standard',
          senderName: undefined,
          content: prompt,
        },
      ],
      `${spinnerText} should not be emitted as an assistant message`,
    );
  }
});

test('claude-cli parse_output preserves real assistant prose that starts with a spinner verb but is not status chrome', () => {
  const prompt = 'Say one sentence about code generation.';
  const screenText = [
    `❯ ${prompt}`,
    '⏺ Generating code is easier when requirements are clear.',
    '❯',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [{ role: 'user', content: prompt }],
  });

  assert.equal(result.status, 'idle');
  assert.equal(result.messages.at(-1)?.content, 'Generating code is easier when requirements are clear.');
});

test('claude-cli parse_output suppresses repeated thinking metric bubbles while preserving tool activity', () => {
  const prompt = 'Inspect the oss diff and summarize what changed.';
  const screenText = [
    `❯ ${prompt}`,
    '⏺ Fiddle-faddling… (16s · ↑ 864 tokens)',
    '⏺ Brewing… (23s · ↑ 1.6k tokens)',
    '⏺ Bash(cd /Users/moltbot/.openclaw/workspace/projects/adhdev && git -C oss diff)',
    '⏺ Brewing… (28s · ↓ 1.7k tokens)',
    '⏺ Brewing… (1m 19s · ↓ 2.5k tokens · thought for 46s)',
    '❯',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [{ role: 'user', content: prompt }],
  });

  assert.equal(result.status, 'generating');
  assert.deepEqual(
    toMessages(result).map(({ role, kind, senderName, content }) => ({ role, kind, senderName, content })),
    [
      {
        role: 'user',
        kind: 'standard',
        senderName: undefined,
        content: prompt,
      },
      {
        role: 'assistant',
        kind: 'terminal',
        senderName: 'Terminal',
        content: '$ cd /Users/moltbot/.openclaw/workspace/projects/adhdev && git -C oss diff',
      },
    ],
  );
});

test('claude-cli parse_output splits visible assistant prose at each ⏺ boundary instead of merging adjacent assistant bubbles', () => {
  const prompt = 'Summarize what you are doing in short steps.';
  const screenText = [
    `❯ ${prompt}`,
    '⏺ First I will inspect the repo.',
    '⏺ Then I will read package.json.',
    '⏺ Bash(pwd)',
    '  ⎿ /Users/moltbot/.openclaw/workspace/projects/adhdev',
    '⏺ Finally I will summarize the findings.',
    '❯',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [{ role: 'user', content: prompt }],
  });

  assert.equal(result.status, 'idle');
  assert.deepEqual(
    toMessages(result).map(({ role, kind, senderName, content }) => ({ role, kind, senderName, content })),
    [
      {
        role: 'user',
        kind: 'standard',
        senderName: undefined,
        content: prompt,
      },
      {
        role: 'assistant',
        kind: 'standard',
        senderName: undefined,
        content: 'First I will inspect the repo.',
      },
      {
        role: 'assistant',
        kind: 'standard',
        senderName: undefined,
        content: 'Then I will read package.json.',
      },
      {
        role: 'assistant',
        kind: 'terminal',
        senderName: 'Terminal',
        content: '$ pwd',
      },
      {
        role: 'assistant',
        kind: 'standard',
        senderName: undefined,
        content: 'Finally I will summarize the findings.',
      },
    ],
  );
});

test('claude-cli parse_output ignores lowercase token-metric spinner lines near the input and detect_status still treats them as generating', () => {
  const prompt = 'Tell me when you are done.';
  const screenText = [
    `❯ ${prompt}`,
    '⏺ First I am checking the current state.',
    '⏺ compacting conversation… (12s · ↑ 3.2k tokens)',
    '────────────────────────────────────────────────────────────────────────────────',
    '❯ ',
    '────────────────────────────────────────────────────────────────────────────────',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [{ role: 'user', content: prompt }],
  });

  assert.equal(detectStatus({ screenText, tail: screenText }), 'generating');
  assert.equal(result.status, 'generating');
  assert.deepEqual(
    toMessages(result).map(({ role, kind, senderName, content }) => ({ role, kind, senderName, content })),
    [
      {
        role: 'user',
        kind: 'standard',
        senderName: undefined,
        content: prompt,
      },
      {
        role: 'assistant',
        kind: 'standard',
        senderName: undefined,
        content: 'First I am checking the current state.',
      },
    ],
  );
});

test('claude-cli parse_output prefers the clean visible T3 reply over polluted transcript residue after a completed tool turn', () => {
  const screenText = [
    '❯ Reply with exactly T2:T1 and nothing else.',
    '',
    '⏺ T2:T1',
    '',
    '❯ Create a file named seven_turn_note.txt with exactly three lines A, B, C and',
    ' then reply with exactly T3 and nothing else.',
    '',
    '⏺ Write(seven_turn_note.txt)',
    ' ⎿  Wrote 3 lines to seven_turn_note.txt',
    ' 1 A',
    ' 2 B',
    ' 3 C',
    '',
    '⏺ T3',
    '',
    '────────────────────────────────────────────────────────────────────────────────',
    '❯ ',
    '────────────────────────────────────────────────────────────────────────────────',
    ' ⏵⏵ accept edits on (shift+tab to cycle)',
  ].join('\n');

  const transcript = [
    '❯ Reply with exactly T2:T1 and nothing else.',
    '',
    '⏺ T2:T1',
    '',
    '❯ Create a file named seven_turn_note.txt with exactly three lines A, B, C and',
    ' then reply with exactly T3 and nothing else.',
    '',
    '⏺ Write(seven_turn_note.txt)',
    ' ⎿  Wrote 3 lines to seven_turn_note.txt',
    ' 1 A',
    ' 2 B',
    ' 3 C',
    '',
    '✽ Meandering… ( · ↓ 28 tokens)',
    ' ⎿  Tip: Use /memory to view and manage Claude memory',
    '',
    'Meandering… 3 ↑ 41',
    '✻ 53',
    '66',
    '✶ M 78',
    'e 85',
    '✳ a 91',
    'M n 6',
    '✢ e d 100 tokens)',
    'a e 4',
    '· n r 7',
    'r g 8',
    'i … 9',
    '✢ n 10',
    '… 1',
    '✳ 2',
    '3',
    '✶',
    '4 4',
    '✻ 5',
    '6',
    '✽',
    '7',
    '↓ 8',
    '9',
    '⏺ T3',
    '',
    '❯ ',
    ' ⏵⏵ accept edits on (shift+tab to cycle)',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: transcript,
    recentBuffer: transcript.slice(-500),
    rawBuffer: transcript,
    messages: [
      { role: 'user', content: 'Reply with exactly T1 and nothing else.' },
      { role: 'assistant', content: 'T1' },
      { role: 'user', content: 'Reply with exactly T2:T1 and nothing else.' },
      { role: 'assistant', content: 'T2:T1' },
      { role: 'user', content: 'Create a file named seven_turn_note.txt with exactly three lines A, B, C and then reply with exactly T3 and nothing else.' },
    ],
  });

  assert.equal(result.status, 'idle');
  assert.equal(result.messages.at(-1)?.content, 'T3');
});

test('claude-cli parse_output prefers the clean visible T3 reply over wrapped tip fragments from transcript tail', () => {
  const screenText = [
    '❯ Reply with exactly T2:T1 and nothing else.',
    '',
    '⏺ T2:T1',
    '',
    '❯ Create a file named seven_turn_note.txt with exactly three lines A, B, C and',
    ' then reply with exactly T3 and nothing else.',
    '',
    '⏺ Write(seven_turn_note.txt)',
    ' ⎿  Wrote 3 lines to seven_turn_note.txt',
    ' 1 A',
    ' 2 B',
    ' 3 C',
    '',
    '⏺ T3',
    '',
    '────────────────────────────────────────────────────────────────────────────────',
    '❯ ',
    '────────────────────────────────────────────────────────────────────────────────',
    ' ⏵⏵ accept edits on (shift+tab to cycle)',
  ].join('\n');

  const transcript = [
    '❯ Reply with exactly T2:T1 and nothing else.',
    '',
    '⏺ T2:T1',
    '',
    '❯ Create a file named seven_turn_note.txt with exactly three lines A, B, C and',
    ' then reply with exactly T3 and nothing else.',
    '',
    '⏺ Write(seven_turn_note.txt)',
    ' ⎿  Wrote 3 lines to seven_turn_note.txt',
    ' 1 A',
    ' 2 B',
    ' 3 C',
    '✶ Infusing… ( · ↓ 24 tokens)',
    ' ⎿  Tip: Use /config to change your default permission mode (including Plan',
    ' Mode)',
    '',
    '⏺ T3',
    '',
    '❯ ',
    ' ⏵⏵ accept edits on (shift+tab to cycle)',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: transcript,
    recentBuffer: transcript.slice(-500),
    rawBuffer: transcript,
    messages: [
      { role: 'user', content: 'Reply with exactly T1 and nothing else.' },
      { role: 'assistant', content: 'T1' },
      { role: 'user', content: 'Reply with exactly T2:T1 and nothing else.' },
      { role: 'assistant', content: 'T2:T1' },
      { role: 'user', content: 'Create a file named seven_turn_note.txt with exactly three lines A, B, C and then reply with exactly T3 and nothing else.' },
    ],
  });

  assert.equal(result.status, 'idle');
  assert.equal(result.messages.at(-1)?.content, 'T3');
});

test('claude-cli parse_output removes prompt-tail and spinner noise from long transcript replies', () => {
  const prompt = 'Reply with BEGIN, then the numbers 1 through 40 with one number per line, then END.';
  const transcript = [
    '❯ Reply with BEGIN, then the numbers 1 through 40 with one number per line,',
    'then END.',
    '✻ Transmuting…',
    'i …',
    'T n',
    'r s',
    'a m',
    '⏺ BEGIN',
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
    '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
    '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
    '31', '32', '33', '34', '35', '36', '37', '38', '39', '40',
    'END',
    '✶ Metamorphosing…',
    '❯',
    '⏵⏵ accept edits on (shift+tab to cycle)',
  ].join('\n');

  const result = parseOutput({
    screenText: transcript,
    buffer: transcript,
    messages: [{ role: 'user', content: prompt }],
  });

  const assistant = result.messages.find((message) => message.role === 'assistant');
  assert.ok(assistant);
  assert.equal(assistant.content, [
    'BEGIN',
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
    '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
    '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
    '31', '32', '33', '34', '35', '36', '37', '38', '39', '40',
    'END',
  ].join('\n'));
});

test('claude-cli parse_output strips chopped spinner prefixes before short exact answers', () => {
  const transcript = [
    '❯ Reply with exactly FINAL-ONE and nothing else.',
    'El',
    'FINAL-ONE',
    '❯',
    '⏵⏵ accept edits on (shift+tab to cycle)',
  ].join('\n');

  const result = parseOutput({
    screenText: transcript,
    buffer: transcript,
    messages: [{ role: 'user', content: 'Reply with exactly FINAL-ONE and nothing else.' }],
  });

  const assistant = result.messages.find((message) => message.role === 'assistant');
  assert.ok(assistant);
  assert.equal(assistant.content, 'FINAL-ONE');
});

test('claude-cli parse_output strips separator and spinner residue around exact answers', () => {
  const transcript = [
    '❯ Reply with exactly CLEAN-SEQ-ONE and nothing else.',
    'Effecting…',
    '────────────────────────────────────────────────────────────────────────────────',
    '────────────────────────────────────────────────────────────────────────────────',
    'E e',
    'f c',
    'fe ti',
    '· c n',
    't g',
    'i …',
    'g…',
    'Ef ec',
    'f c',
    'CLEAN-SEQ-ONE',
    'Effecting…',
    '❯',
    '⏵⏵ accept edits on (shift+tab to cycle)',
  ].join('\n');

  const result = parseOutput({
    screenText: transcript,
    buffer: transcript,
    messages: [{ role: 'user', content: 'Reply with exactly CLEAN-SEQ-ONE and nothing else.' }],
  });

  const assistant = result.messages.find((message) => message.role === 'assistant');
  assert.ok(assistant);
  assert.equal(assistant.content, 'CLEAN-SEQ-ONE');
});

test('claude-cli parse_output strips token-count spinner residue around short exact answers', () => {
  const transcript = [
    '❯ Reply with exactly T1 and nothing else.',
    'emp ( · ↓ 1 tokens)',
    'T1',
    'Contemplating… ( · ↓ 1 tokens)',
    '❯',
    '⏵⏵ accept edits on (shift+tab to cycle)',
  ].join('\n');

  const result = parseOutput({
    screenText: transcript,
    buffer: transcript,
    messages: [{ role: 'user', content: 'Reply with exactly T1 and nothing else.' }],
  });

  const assistant = result.messages.find((message) => message.role === 'assistant');
  assert.ok(assistant);
  assert.equal(assistant.content, 'T1');
});

test('claude-cli parse_output surfaces an approval bubble from a real dangerous-command prompt', () => {
  const screenText = [
    '────────────────────────────────────────────────────────────────────────────────',
    ' Bash command                                                                   ',
    '                                                                                ',
    '   rm -rf /tmp/adhdev-danger-test                                               ',
    '   Delete test directory                                                        ',
    '                                                                                ',
    ' Do you want to proceed?',
    ' ❯ 1. Yes',
    '   2. Yes, and always allow access to adhdev-danger-test/ from this project',
    '   3. No',
    '',
    ' Esc to cancel · Tab to amend · ctrl+e to explain',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [{ role: 'user', content: 'Delete /tmp/adhdev-danger-test with rm -rf and then say done.' }],
  });

  assert.equal(result.status, 'waiting_approval');
  assert.deepEqual(result.activeModal, {
    message: 'rm -rf /tmp/adhdev-danger-test Delete test directory Do you want to proceed?',
    buttons: [
      'Yes',
      'Yes, and always allow access to adhdev-danger-test/ from this project',
      'No',
    ],
  });
  assert.deepEqual(toMessages(result).map(({ role, kind, senderName, content }) => ({ role, kind, senderName, content })), [
    {
      role: 'user',
      kind: 'standard',
      senderName: undefined,
      content: 'Delete /tmp/adhdev-danger-test with rm -rf and then say done.',
    },
    {
      role: 'assistant',
      kind: 'system',
      senderName: 'System',
      content: 'Approval requested\nrm -rf /tmp/adhdev-danger-test Delete test directory Do you want to proceed?\n[Yes] [Yes, and always allow access to adhdev-danger-test/ from this project] [No]',
    },
  ]);
});

test('claude-cli parse_output surfaces the startup trust prompt as an approval bubble', () => {
  const screenText = [
    'Quick safety check',
    'Is this a project you trust?',
    "Claude Code'll be able to read, edit, and execute files here.",
    'Security guide',
    '❯ 1. Yes, I trust this folder',
    '2. No, exit',
    'Enter to confirm · Esc to cancel',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [],
  });

  assert.equal(result.status, 'waiting_approval');
  assert.deepEqual(result.activeModal, {
    message: "Claude Code'll be able to read, edit, and execute files here.",
    buttons: [
      'Yes, I trust this folder',
      'No, exit',
    ],
  });
  assert.deepEqual(toMessages(result).map(({ role, kind, senderName, content }) => ({ role, kind, senderName, content })), [
    {
      role: 'assistant',
      kind: 'system',
      senderName: 'System',
      content: "Approval requested\nClaude Code'll be able to read, edit, and execute files here.\n[Yes, I trust this folder] [No, exit]",
    },
  ]);
});

test('claude-cli parse_output ignores the startup welcome dashboard after trust approval so a new user turn does not immediately commit stale splash text', () => {
  const startupScreen = [
    '╭─── Claude Code v2.1.116 ─────────────────────────────────────────────────────╮',
    '│ │ Tips for getting │',
    '│ Welcome back 알리! │ started │',
    '│ │ Ask Claude to create a… │',
    '│ ▗ ▗ ▖ ▖ │ ─────────────────────── │',
    '│ │ Recent activity │',
    '│ ▘▘ ▝▝ │ No recent activity │',
    '│ Opus 4.7 with xhigh effort · Claude Pro · │ │',
    "│ wqalistar@gmail.com's Organization │ │",
    '│ /private/tmp/adhdev-claude-trace │ │',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '',
    '❯ Reply with exactly T1 and nothing else.',
    '',
    '────────────────────────────────────────────────────────────────────────────────',
    '⏵⏵ accept edits on (shift+tab to cycle) ◉ xhigh · /effort',
  ].join('\n');

  const result = parseOutput({
    screenText: startupScreen,
    buffer: startupScreen,
    messages: [{ role: 'user', content: 'Reply with exactly T1 and nothing else.' }],
  });

  assert.equal(result.status, 'idle');
  assert.deepEqual(toMessages(result).map(({ role, kind, senderName, content }) => ({ role, kind, senderName, content })), [
    {
      role: 'user',
      kind: 'standard',
      senderName: undefined,
      content: 'Reply with exactly T1 and nothing else.',
    },
  ]);
});

test('claude-cli parse_output prefers transcript-derived assistant text when the visible screen only shows the tail of a long reply', () => {
  const longReply = ['BEGIN', ...Array.from({ length: 40 }, (_, index) => String(index + 1)), 'END'].join('\n');
  const fullTranscript = [
    '❯ Reply with BEGIN, then the numbers 1 through 40 with one number per line, then END.',
    '⏺ BEGIN',
    ...Array.from({ length: 40 }, (_, index) => String(index + 1)),
    'END',
    '❯',
  ].join('\n');
  const visibleTail = [
    '35',
    '36',
    '37',
    '38',
    '39',
    '40',
    'END',
    '❯',
    '────────────────────────────────────────────────────────────────────────────────',
    '  ⏵⏵ accept edits on (shift+tab to cycle)',
  ].join('\n');

  const result = parseOutput({
    screenText: visibleTail,
    buffer: fullTranscript,
    messages: [{ role: 'user', content: 'Reply with BEGIN, then the numbers 1 through 40 with one number per line, then END.' }],
  });

  assert.equal(result.status, 'idle');
  assert.deepEqual(toMessages(result).map(({ role, kind, senderName, content }) => ({ role, kind, senderName, content })), [
    {
      role: 'user',
      kind: 'standard',
      senderName: undefined,
      content: 'Reply with BEGIN, then the numbers 1 through 40 with one number per line, then END.',
    },
    {
      role: 'assistant',
      kind: 'standard',
      senderName: undefined,
      content: longReply,
    },
  ]);
});

test('claude-cli parse_output normalizes simple box tables and wraps trailing python code in fences', () => {
  const screenText = [
    '❯ Please do all of the following in this workspace:',
    '⏺ Script ran successfully and produced the expected three lines.',
    '| Number | Square |',
    '┌────────┬────────┐',
    '│ Number │ Square │',
    '├────────┼────────┤',
    '│ 1 │ 1 │',
    '├────────┼────────┤',
    '│ 2 │ 4 │',
    '├────────┼────────┤',
    '│ 3 │ 9 │',
    '├────────┼────────┤',
    '│ 4 │ 16 │',
    '├────────┼────────┤',
    '│ 5 │ 25 │',
    '└────────┴────────┘',
    'import json',
    'import os',
    'nums = [1, 2, 3, 4, 5]',
    'squares = [n * n for n in nums]',
    'print(f"CWD={os.getcwd()}")',
    'print("SQUARES=" + ",".join(str(s) for s in squares))',
    'print("JSON=" + json.dumps({"squares": squares}, separators=(",", ":")))',
    '❯',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [{ role: 'user', content: 'Please do all of the following in this workspace:' }],
  });

  const assistant = toMessages(result).find((message) => message.role === 'assistant' && message.kind === 'standard');
  assert.ok(assistant);
  assert.match(assistant.content, /\| Number \| Square \|\n\| --- \| --- \|\n\| 1 \| 1 \|\n\| 2 \| 4 \|/);
  assert.match(assistant.content, /```python\nimport json\nimport os\nnums = \[1, 2, 3, 4, 5\]/);
});

test('claude-cli parse_output drops wrapped command-output suffix fragments without dropping the final answer', () => {
  const screenText = [
    'rowUp|ArrowDown|ArrowLeft|ArrowRight\'',
    '/tmp/adhdev-live-snake-claude/src/snake.js && echo "arrow keys:',
    '… +64 lines (ctrl+o to expand)',
    '⏺ Now validating the files exist and have content:',
    '⏺ Bash(for f in /tmp/adhdev-live-snake-claude/index.html',
    '/tmp/adhdev-live-snake-claude/src/snake.js',
    '/tmp/adhdev-live-snake-claude/README.md; do',
    'echo "=== $f ($(wc -l < "$f") lines) ==="',
    'done)',
    '⎿  === /tmp/adhdev-live-snake-claude/index.html (72 lines) ===',
    '72',
    's) ===',
    '⏺ All files created and validated.',
    'SNAKE_GAME_DONE',
    'FILES=index.html,src/snake.js,README.md',
    'GLYPHS=⏺ ⎿ ⚠ ❌ 𓂀 한글',
    '',
    '❯',
    '────────────────────────────────────────────────────────────────────────────────',
    '⏵⏵ accept edits on (shift+tab to cycle)',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [{ role: 'user', content: 'Create a tiny browser Snake game.' }],
  });

  const messages = toMessages(result);
  const text = messages.map((message) => message.content).join('\n');
  assert.match(text, /SNAKE_GAME_DONE/);
  assert.match(text, /FILES=index\.html,src\/snake\.js,README\.md/);
  assert.match(text, /GLYPHS=⏺ ⎿ ⚠ ❌ 𓂀 한글/);
  assert.doesNotMatch(text, /\ns\) ===\n/);
});

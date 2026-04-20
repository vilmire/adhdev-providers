const test = require('node:test');
const assert = require('node:assert/strict');

const parseOutput = require('../cli/claude-cli/scripts/1.0/parse_output.js');
const detectStatus = require('../cli/claude-cli/scripts/1.0/detect_status.js');

function toMessages(result) {
  return result.messages.map((message) => ({
    role: message.role,
    kind: message.kind,
    senderName: message.senderName,
    content: message.content,
    meta: message.meta,
  }));
}

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

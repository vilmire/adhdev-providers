const test = require('node:test');
const assert = require('node:assert/strict');

const provider = require('../cli/antigravity-cli/provider.json');
const detectStatus = require('../cli/antigravity-cli/scripts/1.0/detect_status.js');
const parseApproval = require('../cli/antigravity-cli/scripts/1.0/parse_approval.js');
const parseOutput = require('../cli/antigravity-cli/scripts/1.0/parse_output.js');
const parseSession = require('../cli/antigravity-cli/scripts/1.0/parse_session.js');

test('antigravity-cli provider manifest uses agy with echo-then-enter submission', () => {
  assert.equal(provider.type, 'antigravity-cli');
  assert.equal(provider.binary, 'agy');
  assert.equal(provider.versionCommand, 'agy --version');
  assert.equal(provider.spawn.command, 'bash');
  assert.ok(provider.spawn.args[1].includes('agy'), 'spawn args should invoke agy');
  assert.equal(provider.submitStrategy, 'wait_for_echo');
  assert.equal(provider.sendKey, '\r');
  assert.equal(provider.requirePromptEchoBeforeSubmit, true);
  assert.deepEqual(provider.resume?.resumeArgs, ['--continue']);
});

test('antigravity-cli detects workspace trust prompt as approval', () => {
  const screenText = [
    '/tmp/adhdev-agy-probe',
    'Do you trust the files in this folder?',
    '1. Yes',
    '2. No',
    '',
    '? for shortcuts',
    '>',
  ].join('\n');

  assert.equal(detectStatus({ screenText }), 'waiting_approval');
  assert.deepEqual(parseApproval({ screenText }), {
    message: 'Do you trust the files in this folder?',
    buttons: ['Yes', 'No'],
  });
});

test('antigravity-cli detects project trust prompt with non-numbered options as approval', () => {
  const screenText = [
    'Accessing workspace:',
    '/tmp/adhdev-agy-verify-manual',
    '',
    'Do you trust the contents of this project?',
    '',
    'Antigravity CLI requires permission to read, edit, and execute files here.',
    '',
    '> Yes, I trust this folder',
    '  No, exit',
    '',
    '↑/↓ Navigate · enter Confirm',
  ].join('\n');

  assert.equal(detectStatus({ screenText }), 'waiting_approval');
  assert.deepEqual(parseApproval({ screenText }), {
    message: 'Do you trust the contents of this project?',
    buttons: ['Yes, I trust this folder', 'No, exit'],
  });
});

test('antigravity-cli detects command approval prompt as approval', () => {
  const screenText = [
    'agy wants to run:',
    'git diff --cached',
    '',
    'Do you want to proceed?',
    '1. Yes',
    "2. Yes, don't ask again for this command",
    '3. No, and tell agy what to do differently',
    '',
    '? for shortcuts',
    '>',
  ].join('\n');

  assert.equal(detectStatus({ screenText }), 'waiting_approval');
  assert.deepEqual(parseApproval({ screenText }), {
    message: 'Do you want to proceed? git diff --cached',
    buttons: ['Yes', "Yes, don't ask again for this command", 'No, and tell agy what to do differently'],
  });
});

test('antigravity-cli detects file access approval prompt as approval', () => {
  const screenText = [
    'File access',
    'Write: /tmp/adhdev-agy-verify/tmp/adhdev_cli_verify.py',
    'Reason: outside workspace',
    '',
    'Allow access to this file?',
    '> 1. Yes, allow access',
    '2. Yes, and always allow non-workspace access',
    '3. No, deny access',
    '',
    '↑/↓ Navigate',
    'esc to cancel',
  ].join('\n');

  assert.equal(detectStatus({ screenText }), 'waiting_approval');
  assert.deepEqual(parseApproval({ screenText }), {
    message: 'File access Write: /tmp/adhdev-agy-verify/tmp/adhdev_cli_verify.py Reason: outside workspace Allow access to this file?',
    buttons: ['Yes, allow access', 'Yes, and always allow non-workspace access', 'No, deny access'],
  });
});

test('antigravity-cli falls back from blank screenText to recentBuffer for approvals', () => {
  const recentBuffer = [
    '● Create(/tmp/adhdev-agy-verify-repro/tmp/adhdev_cli_verify.py) (ctrl+o to',
    'expand)',
    '',
    'File access',
    '────────────────────────────────────────────────────────────────────────────────',
    '',
    '  Write: /tmp/adhdev-agy-verify-repro/tmp/adhdev_cli_verify.py',
    '  Reason: outside workspace',
    '',
    'Allow access to this file?',
    '> 1. Yes, allow access',
    '  2. Yes, and always allow non-workspace access',
    '  3. No, deny access',
    '',
    '  ↑/↓ Navigate',
    'esc to cancel',
  ].join('\n');
  const buffer = [
    'Tasks:',
    '1. Create tmp/adhdev_cli_verify.py with exactly this Python source:',
    '2. Run exactly: python3 tmp/adhdev_cli_verify.py',
    '3. Reply with a RAW VERIFY RESULT section',
    '',
    recentBuffer,
  ].join('\n');

  const parsed = parseOutput({ screenText: '\n\n', recentBuffer, buffer, promptText: 'create file', messages: [] });
  assert.equal(parsed.status, 'waiting_approval');
  assert.deepEqual(parsed.activeModal, {
    message: 'File access Write: /tmp/adhdev-agy-verify-repro/tmp/adhdev_cli_verify.py Reason: outside workspace Allow access to this file?',
    buttons: ['Yes, allow access', 'Yes, and always allow non-workspace access', 'No, deny access'],
  });
});

test('antigravity-cli detects generating screen', () => {
  const screenText = ['Thinking for 1s', '', 'esc to cancel'].join('\n');
  assert.equal(detectStatus({ screenText }), 'generating');
});

test('antigravity-cli trusts settled recent idle prompt over stale screen cancel chrome', () => {
  const screenText = [
    'Output:',
    '  SQUARES=1,4,9,16,25',
    '⡿ Loading...',
    '└ Tip: Use /tasks to see background tasks',
    '────────────────────────────────────────────────────────────────────────────────',
    'esc to cancel                                              Gemini 3.1 Pro (High)',
    '? for shortcuts',
  ].join('\n');
  const recentBuffer = [
    'Output:',
    '  SQUARES=1,4,9,16,25',
    '',
    'The file tmp/adhdev_cli_verify.py was created successfully.',
    '',
    '────────────────────────────────────────────────────────────────────────────────',
    '>',
    '────────────────────────────────────────────────────────────────────────────────',
    '? for shortcuts                                            Gemini 3.1 Pro (High)',
  ].join('\n');

  assert.equal(detectStatus({ screenText, recentBuffer, isWaitingForResponse: true }), 'idle');
});

test('antigravity-cli parses a completed visible turn from the current screen', () => {
  const promptText = 'Repeat exactly: ADHDEV_AGY_INTERACTIVE_SESSION';
  const screenText = [
    promptText,
    'ADHDEV_AGY_INTERACTIVE_SESSION',
    '',
    '? for shortcuts',
    '>',
  ].join('\n');

  const result = parseOutput({ screenText, promptText, messages: [] });
  const session = parseSession({ screenText, promptText, messages: [] });
  const expectedMessages = [
    { role: 'user', content: promptText },
    { role: 'assistant', content: 'ADHDEV_AGY_INTERACTIVE_SESSION' },
  ];

  assert.equal(result.status, 'idle');
  assert.deepEqual(result.messages, expectedMessages);
  assert.deepEqual(
    session.messages.map(({ role, content }) => ({ role, content })),
    expectedMessages,
  );
  assert.equal(typeof session.messages[0].providerUnitKey, 'string');
  assert.equal(typeof session.messages[0].bubbleId, 'string');
  assert.equal(typeof session.messages[0]._turnKey, 'string');
  assert.equal(session.messages[0].bubbleState, 'final');
});

test('antigravity-cli does not invent assistant transcript from startup chrome', () => {
  const screenText = [
    '▄▀▀▄        Antigravity CLI 1.0.0',
    '▀▀▀▀▀▀       wqalistar@gmail.com (Google AI Ultra)',
    '▀▀▀▀▀▀▀▀      Claude Sonnet 4.6 (Thinking)',
    '   ▄▀▀    ▀▀▄     /private/tmp',
    '  ▄▀▀      ▀▀▄',
    '',
    '────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────',
    '>',
    '────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────',
    '? for shortcuts',
  ].join('\n');

  const result = parseOutput({ screenText, messages: [] });
  assert.equal(result.status, 'idle');
  assert.deepEqual(result.messages, []);
});

test('antigravity-cli preserves prior transcript when current screen only shows shell chrome', () => {
  const priorMessages = [
    { role: 'user', content: 'previous question' },
    { role: 'assistant', content: 'previous answer' },
  ];
  const screenText = [
    'Claude Sonnet 4.6 (Thinking)',
    '/private/tmp/adhdev-agy-manual',
    '',
    '? for shortcuts',
    '>',
  ].join('\n');

  const result = parseOutput({ screenText, messages: priorMessages });
  assert.deepEqual(result.messages, priorMessages);
});

test('antigravity-cli deduplicates TUI redraw: keeps last (longest) assistant content per user turn', () => {
  // Simulates the TUI scrollback pattern: same user prompt appears twice,
  // second render has more complete assistant content.
  // The ● marker ends the user block; everything after is assistant content.
  const screenText = [
    '> Hello, world',
    '● Bash(echo hi)',
    'Partial answer.',
    '',
    '> Hello, world',
    '● Bash(echo hi)',
    'Full answer with more content.',
    '',
    '>',
    '? for shortcuts',
  ].join('\n');

  const result = parseOutput({ screenText, messages: [] });
  const assistantMessages = result.messages.filter((m) => m.role === 'assistant');
  assert.equal(assistantMessages.length, 1);
  assert.match(assistantMessages[0].content, /Full answer with more content/);
  assert.equal(result.messages.filter((m) => m.role === 'user').length, 1);
});

test('antigravity-cli multi-turn deduplication: keeps each unique user turn once with latest assistant', () => {
  const screenText = [
    '> First question',
    '● Bash(cmd1)',
    'First answer.',
    '',
    '> Second question',
    '● Bash(cmd2)',
    'Partial second answer.',
    '',
    '> First question',
    '● Bash(cmd1)',
    'First answer.',
    '',
    '> Second question',
    '● Bash(cmd2)',
    'Complete second answer.',
    '',
    '>',
  ].join('\n');

  const result = parseOutput({ screenText, messages: [] });
  const users = result.messages.filter((m) => m.role === 'user');
  const assistants = result.messages.filter((m) => m.role === 'assistant');
  assert.equal(users.length, 2);
  assert.equal(assistants.length, 2);
  assert.equal(users[0].content, 'First question');
  assert.equal(users[1].content, 'Second question');
  assert.match(assistants[1].content, /Complete second answer/);
});

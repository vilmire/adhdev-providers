const test = require('node:test');
const assert = require('node:assert/strict');
const parseOutput = require('../cli/hermes-cli/scripts/1.0/parse_output.js');
const detectStatus = require('../cli/hermes-cli/scripts/1.0/detect_status.js');
const { buildScreenSnapshot } = require('../cli/hermes-cli/scripts/1.0/screen_helpers.js');

function toMessages(result) {
  return result.messages.map((message) => ({ role: message.role, content: message.content }));
}

function toDetailedMessages(result) {
  return result.messages.map((message) => ({
    role: message.role,
    kind: message.kind,
    senderName: message.senderName,
    content: message.content,
  }));
}



test('hermes-cli treats a separator-bounded > row as the live input prompt region', () => {
  const screenText = [
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    'Earlier assistant answer.',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '──────────────────────────────────────────────────────────────────────────────',
    '> currently typed user input',
    '──────────────────────────────────────────────────────────────────────────────',
  ].join('\n');

  const screen = buildScreenSnapshot(screenText);
  assert.equal(screen.promptLine?.trimmed, '> currently typed user input');
  assert.equal(detectStatus({ screenText, screen }), 'idle');
});

test('hermes-cli treats interrupt copy inside the live input prompt as generating', () => {
  const screenText = [
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    'Earlier assistant answer.',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '──────────────────────────────────────────────────────────────────────────────',
    '> type a message + Enter to interrupt, Ctrl+C to cancel',
    '──────────────────────────────────────────────────────────────────────────────',
  ].join('\n');

  const screen = buildScreenSnapshot(screenText);
  assert.equal(screen.promptLine?.trimmed, '> type a message + Enter to interrupt, Ctrl+C to cancel');
  assert.equal(detectStatus({ screenText, screen }), 'generating');
  assert.equal(parseOutput({ screenText, buffer: screenText, messages: [] }).status, 'generating');
});

test('hermes-cli does not treat interrupt copy outside the live input prompt as generating', () => {
  const screenText = [
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    'Literal text: type a message + Enter to interrupt, Ctrl+C to cancel',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '❯',
  ].join('\n');

  const screen = buildScreenSnapshot(screenText);
  assert.equal(screen.promptLine?.trimmed, '❯');
  assert.equal(detectStatus({ screenText, screen }), 'idle');
});

test('hermes-cli does not treat assistant box blockquotes bounded by rules as a live input prompt', () => {
  const screenText = [
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    'Here is a quoted section:',
    '──────────────────────────────────────────────────────────────────────────────',
    '> quoted assistant content, not user input',
    '──────────────────────────────────────────────────────────────────────────────',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
  ].join('\n');

  const screen = buildScreenSnapshot(screenText);
  assert.equal(screen.promptLineIndex, -1);
  assert.equal(detectStatus({ screenText, screen }), 'generating');

  const result = parseOutput({ screenText, buffer: screenText, messages: [] });
  assert.deepEqual(toMessages(result), [
    {
      role: 'assistant',
      content: 'Here is a quoted section:\n> quoted assistant content, not user input',
    },
  ]);
});

test('hermes-cli parseOutput recognizes separator-bounded > rows as user prompt lines', () => {
  const screenText = [
    '──────────────────────────────────────────────────────────────────────────────',
    '> Find the answer from this prompt',
    '──────────────────────────────────────────────────────────────────────────────',
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    'assistant reply',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '❯',
  ].join('\n');

  const result = parseOutput({ screenText, buffer: screenText, messages: [] });
  assert.deepEqual(toMessages(result), [
    { role: 'user', content: 'Find the answer from this prompt' },
    { role: 'assistant', content: 'assistant reply' },
  ]);
});

test('hermes-cli parseOutput preserves prior transcript messages when the current turn buffer only contains the new turn', () => {
  const screenText = [
    '● Please do all of the following in this workspace: (+11 lines)',
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    'I created and ran tmp/adhdev_cli_verify.py with the requested table output.',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '● In one short paragraph, summarize what you just executed.',
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    'I created and executed tmp/adhdev_cli_verify.py and printed 1,4,9,16,25.',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '❯',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: [
      '● In one short paragraph, summarize what you just executed.',
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      'I created and executed tmp/adhdev_cli_verify.py and printed 1,4,9,16,25.',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    messages: [
      { role: 'user', content: 'Please do all of the following in this workspace: (+11 lines)' },
      { role: 'assistant', content: 'I created and ran tmp/adhdev_cli_verify.py with the requested table output.' },
      { role: 'user', content: 'In one short paragraph, summarize what you just executed.' },
    ],
  });

  assert.equal(result.status, 'idle');
  assert.deepEqual(
    toMessages(result),
    [
      { role: 'user', content: 'Please do all of the following in this workspace: (+11 lines)' },
      { role: 'assistant', content: 'I created and ran tmp/adhdev_cli_verify.py with the requested table output.' },
      { role: 'user', content: 'In one short paragraph, summarize what you just executed.' },
      { role: 'assistant', content: 'I created and executed tmp/adhdev_cli_verify.py and printed 1,4,9,16,25.' },
    ],
  );
});

test('hermes-cli parseOutput keeps full prior transcript when the conversation already exceeds 50 messages', () => {
  const priorMessages = Array.from({ length: 60 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `turn-${index + 1}`,
  }));

  const result = parseOutput({
    screenText: [
      '● turn-61',
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      'turn-62',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    buffer: [
      '● turn-61',
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      'turn-62',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    messages: priorMessages,
  });

  assert.equal(result.messages.length, 62);
  assert.deepEqual(toMessages(result).slice(0, 4), [
    { role: 'user', content: 'turn-1' },
    { role: 'assistant', content: 'turn-2' },
    { role: 'user', content: 'turn-3' },
    { role: 'assistant', content: 'turn-4' },
  ]);
  assert.deepEqual(toMessages(result).slice(-4), [
    { role: 'user', content: 'turn-59' },
    { role: 'assistant', content: 'turn-60' },
    { role: 'user', content: 'turn-61' },
    { role: 'assistant', content: 'turn-62' },
  ]);
});

test('hermes-cli parseOutput prefers a full raw transcript over stale input.messages when buffer already contains the conversation', () => {
  const transcript = [
    '● correct-user-1',
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    'correct-assistant-1',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '● correct-user-2',
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    'correct-assistant-2',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '❯',
  ].join('\n');

  const result = parseOutput({
    screenText: [
      '● correct-user-2',
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      'correct-assistant-2',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    buffer: transcript,
    messages: [
      { role: 'user', content: 'stale-user-1' },
      { role: 'assistant', content: 'stale-assistant-1' },
    ],
  });

  assert.deepEqual(
    toMessages(result),
    [
      { role: 'user', content: 'correct-user-1' },
      { role: 'assistant', content: 'correct-assistant-1' },
      { role: 'user', content: 'correct-user-2' },
      { role: 'assistant', content: 'correct-assistant-2' },
    ],
  );
});

test('hermes-cli parseOutput drops stale input.messages when the raw transcript announces a new session', () => {
  const result = parseOutput({
    screenText: [
      'New session started!',
      '❯',
    ].join('\n'),
    buffer: [
      'New session started!',
      '❯',
    ].join('\n'),
    messages: [
      { role: 'user', content: 'old-user' },
      { role: 'assistant', content: 'old-assistant' },
    ],
  });

  assert.equal(result.sessionEvent, 'new_session');
  assert.equal(result.historyMessageCount, 0);
  assert.deepEqual(toMessages(result), []);
});

test('hermes-cli parseOutput trims stale input.messages to the raw remaining-history count after undo', () => {
  const result = parseOutput({
    screenText: [
      'Undid 2 message(s).',
      '4 message(s) remaining in history.',
      '❯',
    ].join('\n'),
    buffer: [
      'Undid 2 message(s).',
      '4 message(s) remaining in history.',
      '❯',
    ].join('\n'),
    messages: [
      { role: 'user', content: 'turn-1' },
      { role: 'assistant', content: 'turn-2' },
      { role: 'user', content: 'turn-3' },
      { role: 'assistant', content: 'turn-4' },
      { role: 'user', content: 'turn-5' },
      { role: 'assistant', content: 'turn-6' },
    ],
  });

  assert.equal(result.sessionEvent, 'undo');
  assert.equal(result.historyMessageCount, 4);
  assert.deepEqual(toMessages(result), [
    { role: 'user', content: 'turn-1' },
    { role: 'assistant', content: 'turn-2' },
    { role: 'user', content: 'turn-3' },
    { role: 'assistant', content: 'turn-4' },
  ]);
});

test('hermes-cli parseOutput does not duplicate prior turns when the visible transcript already contains them', () => {
  const userMessage = '지금 채팅 터미널 전환 버튼 동작도 엄청 느려졌고 제대로 ⚠️ Dangerous Command 얼라우도 안되고 제너레이팅중에 유저인풋을 강제로 막는거같은데 이건 불필요한 행동임.';
  const screenText = [
    '● 음 일단 지금 스탠드얼론에서 채팅버블이 정상으로 보이지는 않아. 그냥 엉망진창으로 보이는데',
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    '맞아, 재현됐고 고쳤다.',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    `● ${userMessage}`,
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    '맞아. 방금 지적한 내용 기준으로 보면 내가 직전에 증상을 잘못 분류했어.',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '❯',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [
      { role: 'user', content: '음 일단 지금 스탠드얼론에서 채팅버블이 정상으로 보이지는 않아. 그냥 엉망진창으로 보이는데' },
      { role: 'assistant', content: '맞아, 재현됐고 고쳤다.' },
      { role: 'user', content: userMessage },
    ],
  });

  assert.deepEqual(
    toMessages(result),
    [
      { role: 'user', content: '음 일단 지금 스탠드얼론에서 채팅버블이 정상으로 보이지는 않아. 그냥 엉망진창으로 보이는데' },
      { role: 'assistant', content: '맞아, 재현됐고 고쳤다.' },
      { role: 'user', content: userMessage },
      { role: 'assistant', content: '맞아. 방금 지적한 내용 기준으로 보면 내가 직전에 증상을 잘못 분류했어.' },
    ],
  );
});

test('hermes-cli parseOutput keeps the fuller prior user turn when the visible transcript only has a truncated duplicate', () => {
  const fullUserMessage = '지금 채팅 터미널 전환 버튼 동작도 엄청 느려졌고 제대로 ⚠️ Dangerous Command 얼라우도 안되고 제너레이팅중에 유저인풋을 강제로 막는거같은데 이건 불필요한 행동임. 그리고 내가 말하는 이상하다는건 ui ux의 문제가 아니라 파싱이 비정상적으로 동작해서 나와야할 채팅버블이 아에 안보였다는 소리임.';
  const truncatedVisibleUserMessage = '지금 채팅 터미널 전환 버튼 동작도 엄청 느려졌고 제대로 ⚠️ Dangerous Command';
  const result = parseOutput({
    screenText: [
      `● ${truncatedVisibleUserMessage}`,
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      '맞아. 방금 지적한 내용 기준으로 보면 내가 직전에 증상을 잘못 분류했어.',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    buffer: [
      `● ${truncatedVisibleUserMessage}`,
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      '맞아. 방금 지적한 내용 기준으로 보면 내가 직전에 증상을 잘못 분류했어.',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    messages: [
      { role: 'user', content: fullUserMessage },
    ],
  });

  assert.deepEqual(
    toMessages(result),
    [
      { role: 'user', content: fullUserMessage },
      { role: 'assistant', content: '맞아. 방금 지적한 내용 기준으로 보면 내가 직전에 증상을 잘못 분류했어.' },
    ],
  );
});

test('hermes-cli parseOutput rejoins soft-wrapped assistant prose so follow-up summaries preserve exact command names and sequences', () => {
  const result = parseOutput({
    screenText: [
      '● In one short paragraph, summarize what you just executed. You must mention tmp/adhdev_cli_verify.py and the square sequence 1,4,9,16,25.',
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      'I created tmp/adhdev_cli_verify.py in the workspace and executed it with pyt',
      'hon3, verifying that it printed the current working directory along with the squ',
      'are sequence 1,4,9,16,25 and the matching JSON representation.',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    buffer: [
      '● In one short paragraph, summarize what you just executed. You must mention tmp/adhdev_cli_verify.py and the square sequence 1,4,9,16,25.',
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      'I created tmp/adhdev_cli_verify.py in the workspace and executed it with pyt',
      'hon3, verifying that it printed the current working directory along with the squ',
      'are sequence 1,4,9,16,25 and the matching JSON representation.',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    messages: [
      { role: 'user', content: 'In one short paragraph, summarize what you just executed. You must mention tmp/adhdev_cli_verify.py and the square sequence 1,4,9,16,25.' },
    ],
  });

  assert.deepEqual(
    toMessages(result),
    [
      { role: 'user', content: 'In one short paragraph, summarize what you just executed. You must mention tmp/adhdev_cli_verify.py and the square sequence 1,4,9,16,25.' },
      { role: 'assistant', content: 'I created tmp/adhdev_cli_verify.py in the workspace and executed it with python3, verifying that it printed the current working directory along with the square sequence 1,4,9,16,25 and the matching JSON representation.' },
    ],
  );
});

test('hermes-cli parseOutput rejoins wrapped numeric/tool fragments without inserting spaces inside tokens', () => {
  const result = parseOutput({
    screenText: [
      '● In one short paragraph, summarize what you just executed.',
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      'I created tmp/adhdev_cli_verify.py in the workspace, then ran it with python',
      '3; the script printed the current working directory, the square sequence 1,4,9,1',
      '6,25, and the matching JSON representation.',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    buffer: [
      '● In one short paragraph, summarize what you just executed.',
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      'I created tmp/adhdev_cli_verify.py in the workspace, then ran it with python',
      '3; the script printed the current working directory, the square sequence 1,4,9,1',
      '6,25, and the matching JSON representation.',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    messages: [
      { role: 'user', content: 'In one short paragraph, summarize what you just executed.' },
    ],
  });

  assert.deepEqual(
    toMessages(result),
    [
      { role: 'user', content: 'In one short paragraph, summarize what you just executed.' },
      { role: 'assistant', content: 'I created tmp/adhdev_cli_verify.py in the workspace, then ran it with python3; the script printed the current working directory, the square sequence 1,4,9,16,25, and the matching JSON representation.' },
    ],
  );
});

test('hermes-cli parseOutput trims wrap-induced spaces before punctuation in assistant prose', () => {
  const result = parseOutput({
    screenText: [
      '● In one short paragraph, summarize what you just executed.',
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      'I created tmp/adhdev_cli_verify.py in this workspace and ran it with python3',
      '; the script printed the current working directory, the square sequence 1,4,9,16',
      ',25, and the matching JSON representation.',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    buffer: [
      '● In one short paragraph, summarize what you just executed.',
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      'I created tmp/adhdev_cli_verify.py in this workspace and ran it with python3',
      '; the script printed the current working directory, the square sequence 1,4,9,16',
      ',25, and the matching JSON representation.',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    messages: [
      { role: 'user', content: 'In one short paragraph, summarize what you just executed.' },
    ],
  });

  assert.deepEqual(
    toMessages(result),
    [
      { role: 'user', content: 'In one short paragraph, summarize what you just executed.' },
      { role: 'assistant', content: 'I created tmp/adhdev_cli_verify.py in this workspace and ran it with python3; the script printed the current working directory, the square sequence 1,4,9,16,25, and the matching JSON representation.' },
    ],
  );
});

test('hermes-cli parseOutput merges a soft-wrapped visible user turn instead of duplicating the sent prompt', () => {
  const fullUserMessage = '현재 터미널모드와 터미널모드가 아닐때 높이가 다르고 터미널모드는 항상 인풋창이 켜져있는데 이부분 채팅모드와 동일하게 사용해야함.';
  const result = parseOutput({
    screenText: [
      '● 현재 터미널모드와 터미널모드가 아닐때 높이가 다르고 터미널모드는 항상 인풋창이',
      '켜져있는데 이부분 채팅모드와 동일하게 사용해야함.',
      '❯',
    ].join('\n'),
    buffer: [
      '● 현재 터미널모드와 터미널모드가 아닐때 높이가 다르고 터미널모드는 항상 인풋창이',
      '켜져있는데 이부분 채팅모드와 동일하게 사용해야함.',
      '❯',
    ].join('\n'),
    messages: [
      { role: 'user', content: fullUserMessage },
    ],
  });

  assert.deepEqual(
    toMessages(result),
    [
      { role: 'user', content: fullUserMessage },
    ],
  );
});

test('hermes-cli parseOutput upgrades a repeated assistant prefix instead of appending duplicate assistant bubbles', () => {
  const first = 'ㅇㅋ 기억해둘게.';
  const second = 'ㅇㅋ 기억해둘게. 앞으로 네가 “풀받아”, “업데이트해” 같은 식으로 말하면';
  const third = 'ㅇㅋ 기억해둘게. 앞으로 네가 “풀받아”, “업데이트해” 같은 식으로 말하면 기본적으로 현재 작업 repo';

  const result = parseOutput({
    screenText: [
      '● user prompt',
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      third,
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    buffer: [
      '● user prompt',
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      third,
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    messages: [
      { role: 'user', content: 'user prompt' },
      { role: 'assistant', content: first },
      { role: 'assistant', content: second },
    ],
  });

  assert.deepEqual(
    toMessages(result),
    [
      { role: 'user', content: 'user prompt' },
      { role: 'assistant', content: third },
    ],
  );
});

test('hermes-cli parseOutput treats wrapped and reflowed assistant prose as the same message and keeps the more complete version', () => {
  const wrapped = [
    'I created and executed tmp/adhdev_cli_verify.py, a small Python script that',
    'printed the current working directory, the square sequence 1,4,9,16,25, and a co',
    'mpact JSON representation of those same square values.',
  ].join('\n');
  const reflowed = 'I created and executed tmp/adhdev_cli_verify.py, a small Python script that printed the current working directory, the square sequence 1,4,9,16,25, and a compact JSON representation of those same square values.';

  const result = parseOutput({
    screenText: [
      '● follow-up prompt',
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      'I created and executed tmp/adhdev_cli_verify.py, a small Python script that',
      'printed the current working directory, the square sequence 1,4,9,16,25, and a co',
      'mpact JSON representation of those same square values.',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    buffer: [
      '● follow-up prompt',
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      'I created and executed tmp/adhdev_cli_verify.py, a small Python script that',
      'printed the current working directory, the square sequence 1,4,9,16,25, and a co',
      'mpact JSON representation of those same square values.',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    messages: [
      { role: 'user', content: 'follow-up prompt' },
      { role: 'assistant', content: wrapped },
    ],
  });

  assert.deepEqual(toMessages(result), [
    { role: 'user', content: 'follow-up prompt' },
    { role: 'assistant', content: reflowed },
  ]);
});

test('hermes-cli parseOutput surfaces dangerous-command approval as a visible system bubble', () => {
  const screenText = [
    '╭────────────────────────────────────────────────────────────╮',
    '│ ⚠️  Dangerous Command                                      │',
    '│                                                            │',
    '│ node -e "try{const                                         │',
    '│ m=require(\'/Users/moltbot/.openclaw/workspace/proje...     │',
    '│                                                            │',
    '│ ❯ Allow once                                               │',
    '│   Allow for this session                                   │',
    '│   Add to permanent allowlist                               │',
    '│   Deny                                                     │',
    '│   Show full command                                        │',
    '│                                                            │',
    '│ script execution via -e/-c flag                            │',
    '╰────────────────────────────────────────────────────────────╯',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    isWaitingForResponse: true,
  });

  assert.equal(result.status, 'waiting_approval');
  assert.deepEqual(result.activeModal?.buttons, [
    'Allow once',
    'Allow for this session',
    'Add to permanent allowlist',
    'Deny',
  ]);
  assert.equal(result.messages.at(-1)?.kind, 'system');
  assert.match(result.messages.at(-1)?.content || '', /Approval requested/);
  assert.match(result.messages.at(-1)?.content || '', /Allow once/);
});

test('hermes-cli parseOutput lets approval parsing override a stale generating status when dangerous command buttons are visible', () => {
  const screenText = [
    '────────────────────────────────────────',
    '╭────────────────────────────────────────────────────────────╮',
    '│ ⚠️ Dangerous Command │',
    '│ │',
    '│ node -e "try{const │',
    '│ m=require(\'/Users/moltbot/.openclaw/workspace/proje... │',
    '│ │',
    '│ ❯ Allow once │',
    '│ Allow for this session │',
    '│ Add to permanent allowlist │',
    '│ Deny │',
    '│ Show full command │',
    '│ │',
    '│ script execution via -e/-c flag │',
    '╰────────────────────────────────────────────────────────────╯',
    '',
    ' 💻 node -e "try{const m=require(\'/Users/moltbot/.openclaw/workspace/projects/adhdev/package.json\'); console.log(Object.keys(m).length)}catch(e){console.error(e); process.exit(1)}" (50.3s)',
    ' ↑/↓ to select, Enter to confirm ()',
    ' ⚕ gpt-5.4 │ 17.3K/1.1M │ [░░░░░░░░░░] 2% │',
    '────────────────────────────────────────────────────────────────────────────────',
    '⚠ ❯',
    '────────────────────────────────────────────────────────────────────────────────',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    isWaitingForResponse: true,
  });

  assert.equal(result.status, 'waiting_approval');
  assert.ok(result.activeModal);
  assert.equal(result.messages.at(-1)?.kind, 'system');
  assert.match(result.messages.at(-1)?.content || '', /Dangerous Command/);
});

test('hermes-cli parseOutput ignores stale dangerous-command approval scrollback once the current screen is back at the idle prompt', () => {
  const oldApproval = [
    '╭────────────────────────────────────────────────────────────╮',
    '│ ⚠️ Dangerous Command                                      │',
    '│                                                            │',
    '│ node -e "dangerous"                                       │',
    '│                                                            │',
    '│ ❯ Allow once                                               │',
    '│   Allow for this session                                   │',
    '│   Add to permanent allowlist                               │',
    '│   Deny                                                     │',
    '│   Show full command                                        │',
    '│                                                            │',
    '│ script execution via -e/-c flag                            │',
    '╰────────────────────────────────────────────────────────────╯',
  ];
  const screenText = [
    ...oldApproval,
    ...Array.from({ length: 24 }, (_, index) => `history line ${index + 1}`),
    'Welcome to Hermes Agent! Type your message or /help for commands.',
    '❯',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    isWaitingForResponse: false,
  });

  assert.equal(result.status, 'idle');
  assert.equal(result.activeModal, null);
  assert.ok(!result.messages.some((message) => /Approval requested|Dangerous Command/.test(message.content || '')));
});

test('hermes-cli parseOutput surfaces live tool activity and progress bubbles during a turn', () => {
  const screenText = [
    '● Use the terminal tool to run pwd and then echo TOOLCHECK123. As you work, show progress.',
    'Initializing agent...',
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    'Progress: running pwd first, then echoing the token.',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    ' ┊ 📚 skill hermes-agent 0.0s',
    ' ┊ 💻 $ pwd 0.5s',
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    'Progress: pwd finished. Now echoing the check token.',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    ' ┊ 💻 $ echo TOOLCHECK123 0.3s',
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    'Done.',
    '',
    'pwd output:',
    '/Users/vilmire/Work/remote_vs',
    '',
    'echo output:',
    'TOOLCHECK123',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '❯',
  ].join('\n');

  const expectedMessages = [
    {
      role: 'user',
      kind: 'standard',
      senderName: undefined,
      content: 'Use the terminal tool to run pwd and then echo TOOLCHECK123. As you work, show progress.',
    },
    {
      role: 'assistant',
      kind: 'standard',
      senderName: undefined,
      content: 'Progress: running pwd first, then echoing the token.',
    },
    {
      role: 'assistant',
      kind: 'tool',
      senderName: 'Tool',
      content: 'skill hermes-agent',
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
      content: 'Progress: pwd finished. Now echoing the check token.',
    },
    {
      role: 'assistant',
      kind: 'terminal',
      senderName: 'Terminal',
      content: '$ echo TOOLCHECK123',
    },
    {
      role: 'assistant',
      kind: 'standard',
      senderName: undefined,
      content: 'Done.\npwd output:\n/Users/vilmire/Work/remote_vs\necho output:\nTOOLCHECK123',
    },
  ];

  const fullResult = parseOutput({
    screenText,
    buffer: screenText,
    messages: [
      { role: 'user', content: 'Use the terminal tool to run pwd and then echo TOOLCHECK123. As you work, show progress.' },
    ],
    isWaitingForResponse: true,
  });

  assert.deepEqual(toDetailedMessages(fullResult), expectedMessages);

  const staleBufferResult = parseOutput({
    screenText,
    buffer: [
      '● Use the terminal tool to run pwd and then echo TOOLCHECK123. As you work, show progress.',
      'Initializing agent...',
      '❯',
    ].join('\n'),
    messages: [
      { role: 'user', content: 'Use the terminal tool to run pwd and then echo TOOLCHECK123. As you work, show progress.' },
    ],
    isWaitingForResponse: true,
  });

  assert.deepEqual(toDetailedMessages(staleBufferResult), expectedMessages);
});

test('hermes-cli parseOutput rejoins wrapped activity rows before classifying tool bubbles', () => {
  const screenText = [
    '● Check repo status.',
    "  ┊ 💻 $         git -C /Users/moltbot/.openclaw/workspace/projects/adhdev-provi",
    "ders fetch --all --prune --quiet && git -C /Users/moltbot/.openclaw/workspace/pr",
    "ojects/adhdev-providers status --short --branch  0.7s",
    "  ┊ 💻 $         git fetch --all --prune --quiet && printf 'top '; git rev-list ",
    "--left-right --count origin/main...HEAD  1.5s",
    "  ┊ 📖 read      /Users/moltbot/.openclaw/workspace/projects/adhdev/packages/dae",
    "mon-cloud/src/cli/cdp-utils.ts  1.0s",
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    'Done.',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '❯',
  ].join('\n');

  const result = parseOutput({ screenText, buffer: screenText, messages: [] });

  assert.deepEqual(toDetailedMessages(result), [
    {
      role: 'user',
      kind: 'standard',
      senderName: undefined,
      content: 'Check repo status.',
    },
    {
      role: 'assistant',
      kind: 'terminal',
      senderName: 'Terminal',
      content: '$ git -C /Users/moltbot/.openclaw/workspace/projects/adhdev-providers fetch --all --prune --quiet && git -C /Users/moltbot/.openclaw/workspace/projects/adhdev-providers status --short --branch',
    },
    {
      role: 'assistant',
      kind: 'terminal',
      senderName: 'Terminal',
      content: "$ git fetch --all --prune --quiet && printf 'top '; git rev-list --left-right --count origin/main...HEAD",
    },
    {
      role: 'assistant',
      kind: 'tool',
      senderName: 'Tool',
      content: 'read /Users/moltbot/.openclaw/workspace/projects/adhdev/packages/daemon-cloud/src/cli/cdp-utils.ts',
    },
    {
      role: 'assistant',
      kind: 'standard',
      senderName: undefined,
      content: 'Done.',
    },
  ]);
});

test('hermes-cli parseOutput ignores startup update warnings so the live user turn is not duplicated', () => {
  const prompt = 'Run pwd, then reply with the working directory. Use tools if needed and keep it short.';
  const screenText = [
    '╭───────────── Hermes Agent v0.8.0 (2026.4.8) · upstream 764536b6 ─────────────╮',
    '│                                    ⚠ 450 commits behind — run hermes',
    '│                                    update to update                          │',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    'Welcome to Hermes Agent! Type your message or /help for commands.',
    `● ${prompt}`,
    'Initializing agent...',
    '❯',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [
      { role: 'user', content: prompt },
    ],
    isWaitingForResponse: true,
  });

  assert.deepEqual(
    toDetailedMessages(result),
    [
      {
        role: 'user',
        kind: 'standard',
        senderName: undefined,
        content: prompt,
      },
    ],
  );
});

test('hermes-cli parseOutput keeps status generating while a partial assistant box is visible', () => {
  const prompt = 'Summarize the workspace status in one sentence.';
  const screenText = [
    'Welcome to Hermes Agent! Type your message or /help for commands.',
    `● ${prompt}`,
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    'The workspace looks healthy so far.',
    'Still checking a couple more files...',
    '❯',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [
      { role: 'user', content: prompt },
    ],
    isWaitingForResponse: true,
  });

  assert.equal(result.status, 'generating');
  assert.deepEqual(toDetailedMessages(result), [
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
      content: 'The workspace looks healthy so far.\nStill checking a couple more files...',
    },
  ]);
});

test('hermes-cli parseOutput keeps status generating when a stale startup prompt is visible during an in-flight turn', () => {
  const prompt = 'Run the long tool workflow and tell me when it finishes.';
  const screenText = [
    'Welcome to Hermes Agent! Type your message or /help for commands.',
    '❯',
  ].join('\n');
  const tail = [
    `● ${prompt}`,
    '┊ 📋 plan 2 task(s) 0.0s',
    '⚕ ❯ type a message + Enter to interrupt, Ctrl+C to cancel',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    tail,
    recentBuffer: tail,
    messages: [
      { role: 'user', content: prompt },
    ],
  });

  assert.equal(result.status, 'generating');
  assert.deepEqual(toDetailedMessages(result), [
    {
      role: 'user',
      kind: 'standard',
      senderName: undefined,
      content: prompt,
    },
  ]);
});

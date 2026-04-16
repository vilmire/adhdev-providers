const test = require('node:test');
const assert = require('node:assert/strict');
const parseOutput = require('../cli/hermes-cli/scripts/1.0/parse_output.js');

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

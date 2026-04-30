const test = require('node:test');
const assert = require('node:assert/strict');
const parseOutput = require('../cli/hermes-cli/scripts/1.0/parse_output.js');
const detectStatus = require('../cli/hermes-cli/scripts/1.0/detect_status.js');
const { buildScreenSnapshot } = require('../cli/hermes-cli/scripts/1.0/screen_helpers.js');
const { toCandidates, candidatesToLegacyMessages } = require('../cli/hermes-cli/scripts/1.0/source_classifier.js');

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

function toIdentityMessages(result) {
  return result.messages.map((message) => ({
    role: message.role,
    kind: message.kind,
    content: message.content,
    id: message.id,
    bubbleId: message.bubbleId,
    providerUnitKey: message.providerUnitKey,
    bubbleState: message.bubbleState,
    turnKey: message._turnKey,
  }));
}


test('hermes-cli source classifier labels committed, buffer, and screen candidates before legacy merge', () => {
  const committed = toCandidates('committed', [
    { role: 'user', content: 'already committed prompt' },
    { role: 'assistant', content: 'already committed final' },
  ]);
  assert.deepEqual(committed.map((candidate) => ({
    source: candidate.source,
    confidence: candidate.confidence,
    provenance: candidate.provenance,
    turnBoundary: candidate.turnBoundary,
  })), [
    { source: 'committed', confidence: 'canonical', provenance: 'history', turnBoundary: 'before-current-user' },
    { source: 'committed', confidence: 'canonical', provenance: 'history', turnBoundary: 'before-current-user' },
  ]);

  const screen = toCandidates('screen', [
    { role: 'assistant', content: 'prior final visible in scrollback' },
    { role: 'user', content: 'current follow up prompt' },
    { role: 'assistant', content: 'current visible answer' },
  ]);
  assert.deepEqual(screen.map((candidate) => ({
    source: candidate.source,
    confidence: candidate.confidence,
    provenance: candidate.provenance,
    turnBoundary: candidate.turnBoundary,
  })), [
    { source: 'screen', confidence: 'artifact', provenance: 'viewport', turnBoundary: 'before-current-user' },
    { source: 'screen', confidence: 'candidate', provenance: 'current-turn', turnBoundary: 'current-user' },
    { source: 'screen', confidence: 'candidate', provenance: 'current-turn', turnBoundary: 'after-current-user' },
  ]);

  assert.deepEqual(candidatesToLegacyMessages(screen), [
    { role: 'assistant', kind: 'standard', senderName: undefined, content: 'prior final visible in scrollback' },
    { role: 'user', kind: 'standard', senderName: undefined, content: 'current follow up prompt' },
    { role: 'assistant', kind: 'standard', senderName: undefined, content: 'current visible answer' },
  ]);
});


test('hermes-cli parseOutput assigns provider-owned stable identities to canonical bubbles', () => {
  const prompt = '리드챗탓하지 않게 provider가 canonical transcript를 소유해';
  const partial = 'provider script 쪽에서 canonical transcript identity를 잡겠습니다.';
  const final = 'provider script 쪽에서 canonical transcript identity를 잡겠습니다. partial과 final은 같은 assistant bubble로 갱신되어야 합니다.';

  const result = parseOutput({
    screenText: '❯',
    buffer: '',
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: '$ adhdev runtime list --json --limit 50' },
      { role: 'assistant', content: partial },
      { role: 'assistant', content: final },
    ],
  });

  const messages = toIdentityMessages(result);
  assert.equal(messages.length, 3);
  assert.equal(messages[0].role, 'user');
  assert.equal(messages[1].kind, 'terminal');
  assert.equal(messages[2].content, final);

  for (const message of messages) {
    assert.match(message.id, /^hermes_/);
    assert.equal(message.bubbleId, message.id);
    assert.match(message.providerUnitKey, /^hermes-cli:/);
    assert.match(message.turnKey, /^turn_/);
  }

  assert.equal(messages[0].turnKey, messages[1].turnKey);
  assert.equal(messages[1].turnKey, messages[2].turnKey);
  assert.notEqual(messages[1].providerUnitKey, messages[2].providerUnitKey);
});

test('hermes-cli parseOutput marks the active assistant bubble as streaming with the same provider identity', () => {
  const prompt = '지금 이 답변도 여러개로 보이면 안됨';
  const partial = 'provider가 active assistant bubble identity를 고정합니다';
  const result = parseOutput({
    screenText: 'type a message + Enter to interrupt, Ctrl+C to cancel',
    buffer: '',
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: partial },
    ],
    isWaitingForResponse: true,
  });

  const assistant = result.messages.find((message) => message.role === 'assistant');
  assert.ok(assistant);
  assert.match(assistant.id, /^hermes_/);
  assert.equal(assistant.bubbleId, assistant.id);
  assert.match(assistant.providerUnitKey, /^hermes-cli:/);
  assert.equal(assistant.bubbleState, 'streaming');
  assert.equal(assistant.meta?.streaming, true);
});

test('hermes-cli parseOutput keeps generating tool and terminal activity visible in chat', () => {
  const result = parseOutput({
    screenText: 'type a message + Enter to interrupt, Ctrl+C to cancel',
    buffer: '',
    messages: [
      { role: 'user', content: '생성 중에 툴 사용도 바로 보여줘' },
      { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: '$ git status --short' },
      { role: 'assistant', kind: 'tool', senderName: 'Tool', content: 'read_file package.json' },
      { role: 'assistant', content: '현재 확인 중입니다.' },
    ],
    isWaitingForResponse: true,
  });

  assert.deepEqual(toDetailedMessages(result), [
    { role: 'user', kind: 'standard', senderName: undefined, content: '생성 중에 툴 사용도 바로 보여줘' },
    { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: '$ git status --short' },
    { role: 'assistant', kind: 'tool', senderName: 'Tool', content: 'read_file package.json' },
    { role: 'assistant', kind: 'standard', senderName: undefined, content: '현재 확인 중입니다.' },
  ]);

  const streamingAssistant = result.messages[result.messages.length - 1];
  assert.equal(streamingAssistant.bubbleState, 'streaming');
  assert.equal(streamingAssistant.meta?.streaming, true);
});

test('hermes-cli parseOutput handles long tool-heavy histories without re-normalizing quadratically', () => {
  const priorMessages = Array.from({ length: 2600 }, (_, index) => ({
    role: 'assistant',
    kind: 'tool',
    senderName: 'Tool',
    content: `tool output line `.repeat(40) + `(cached) reasoning... ${index}`,
  }));
  const screenText = [
    '🔧 tool output line '.repeat(40) + '(cached) reasoning... 2600',
    '❯',
  ].join('\n');

  const started = process.hrtime.bigint();
  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: priorMessages,
  });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  assert.equal(result.messages.length, 2600);
  assert.ok(
    elapsedMs < 750,
    `expected long-history parse to stay under 750ms, took ${elapsedMs.toFixed(1)}ms`,
  );
});


test('hermes-cli parseOutput does not drop a distinct final assistant answer after a long interim bubble', () => {
  const interim = 'Need also maybe adhdev-release? no. Need check status/diff. Also need if skill patch changed? '.repeat(2).trim();
  const final = [
    '커밋까지 완료했습니다.',
    '',
    '생성된 커밋:',
    '- OSS submodule: 6b24cd5 fix(daemon-core): keep chat tail hot on committed output',
    '- Top/cloud repo: c3e752a9 fix(cloud): update oss chat tail hot metadata',
  ].join('\n');

  const result = parseOutput({
    screenText: '❯',
    buffer: '',
    messages: [
      { role: 'user', content: '커밋까지 진행해둬' },
      { role: 'assistant', content: interim },
      { role: 'assistant', content: final },
      { role: 'assistant', content: final },
    ],
  });

  assert.deepEqual(toMessages(result), [
    { role: 'user', content: '커밋까지 진행해둬' },
    { role: 'assistant', content: interim },
    { role: 'assistant', content: final },
  ]);
});

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

test('hermes-cli parseOutput merges terminal-elided copies of a long submitted prompt into the full committed user bubble', () => {
  const fullPrompt = [
    '이 세션은 ADHDev self-hosted isolated quality test입니다. 현재 작업 디렉터리 안에 Python 콘솔 3,6,9 게임을 실제로 만들어 주세요.',
    '필수 요구:',
    '1. 파일명은 정확히 game_369.py 하나를 만듭니다.',
    '2. 실행: python3 game_369.py 로 플레이 가능해야 합니다. 1부터 차례로 입력하면 3/6/9가 들어간 숫자는 digit 개수만큼 짝을 입력해야 하는 게임입니다.',
    '3. --self-test 옵션을 구현하고, python3 game_369.py --self-test 실행 시 마지막 줄에 정확히 ADHDEV_369_DONE_HERMES_CLI 를 출력하게 하세요.',
    '4. 직접 python3 game_369.py --self-test 를 실행해서 결과를 확인하세요.',
    '5. 최종 답변은 한국어로 짧게: 생성 파일, 실행 명령, self-test 실제 출력 마지막 줄(ADHDEV_369_DONE_HERMES_CLI)을 포함하세요.',
    '6. 파일을 못 만들었거나 실행을 못 했으면 성공처럼 말하지 말고 실패 사유를 그대로 말하세요.',
  ].join('\n');
  const terminalElidedPrompt = '이 세션은 ADHDev self-hosted isolated quality test입니다. 현재 작업 디렉터리 안에 Python 콘솔 3,6,9 게임을 실제로 만들어 주세요. 필수 요구: ... (+4 more lines) 5. 최종 답변은 한국어로 짧게: 생성 파일, 실행 명령, self-test 실제 출력 마지막 줄(ADHDEV_369_DONE_HERMES_CLI)을 포함하세요. 6. 파일을 못 만들었거나 실행을 못 했으면 성공처럼 말하지 말고 실패 사유를 그대로 말하세요.';

  const result = parseOutput({
    screenText: [
      `● ${terminalElidedPrompt}`,
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      '생성 파일: game_369.py',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    buffer: '',
    messages: [{ role: 'user', content: fullPrompt }],
  });

  const users = toMessages(result).filter((message) => message.role === 'user');
  assert.deepEqual(users, [{ role: 'user', content: fullPrompt }]);
});

test('hermes-cli parseOutput collapses replayed final answers with tiny terminal residue', () => {
  const cleanFinal = [
    '점검 완료.',
    '결론:',
    '- Claude Code CLI: 정상',
    '- Codex CLI: 정상, 단 codex 자체가 시작 시 아래 warning을 계속 냄',
    '- WARNING: failed to clean up stale arg0 temp dirs: Permission denied (os error 13)',
    '- 실행 자체는 성공했고 ADHDev detect도 버전 파싱 정상',
    '확인한 것:',
    '1. 글로벌 ADHDev daemon 상태',
    '- adhdev 버전: 0.9.44',
    '- 실행 daemon PID: 33883',
    '요약하면 지금 기준으로는:',
    '- 설치/detect OK',
    '- provider root/loaded-latest OK',
    '- 직접 CLI runnable OK',
    '- parser regression OK',
    'Codex warning은 별도 청소/권한 이슈로 보이는데, 현재 기능 실패로 이어지진 않았어.',
  ].join('\n');
  const residueFinal = cleanFinal.replace(
    'Codex warning은 별도 청소/권한 이슈로 보이는데',
    '7 3\nCodex warning은 별도 청소/권한 이슈로 보이는데',
  );

  const result = parseOutput({
    screenText: '❯',
    buffer: '',
    messages: [
      { role: 'user', content: '좋아 지금 클로드코드 cli, 코덱스 cli 한번 더 점검해' },
      { role: 'assistant', content: cleanFinal },
      { role: 'assistant', content: residueFinal },
    ],
  });

  const standardAssistants = result.messages.filter((message) => message.role === 'assistant' && (message.kind || 'standard') === 'standard');
  assert.equal(standardAssistants.length, 1);
  assert.equal(standardAssistants[0].content, cleanFinal);
});

test('hermes-cli parseOutput collapses final answer redraws with repeated duration fragments', () => {
  const partialFinal = [
    '맞습니다. 재현했고 원인도 잡았습니다.',
    '현재 세션에서 실제 상태:',
    '1. 터미널 snapshot:',
    '- 번호 1~7 리스트가 전부 보임',
    '- Crunched for 20s는 Claude CLI footer/chrome',
    '2. Claude native history jsonl:',
    '- 마지막 assistant 메시지가 정상',
    '3. ADHDev read_chat:',
    '- Crunched for footer가 메시지 본문에 섞임',
    '원인: Claude CLI provider parser에서 isApprovalLine()이 너무 넓었습니다.',
    '이걸 전부 status/approval noise로 제거해서, Claude 답변의 numbered markdown list가 사라진 겁니다.',
    '그리고 Crunched for footer/status chrome variant도 본문에 섞였습니다.',
    '현재 실행 중인 global daemon binary는 방금 수정한 daemon-core self-heal 코드를 아직 포함하지 않습니다.',
    '새 Claude 응답부터는 provider parser 수정이 적용되어 numbered list drop은 막힐 가능성이 높습니다.',
    '현재 손상 bubble까지 자동 복구하려면 daemon-core 변경이 포함된 빌드/재시작/릴리즈가 필요합니다.',
    'Provider parser tests는 통과했고 daemon-core targeted test도 통과했습니다.',
    '하지만 live daemon verification은 아직 기존 binary와 committed tail 때문에 같은 결과를 반환할 수 있습니다.',
    '이 보고는 dashboard/read_chat 표시와 terminal/native history를 분리해서 설명하기 위한 긴 최종 답변입니다.',
    '참고로 root repo에 이미 있던 변경:',
    '/Users/moltbot/.openclaw/workspace/projects/adhdev/.claude/settings.local.json',
    '/Users/moltbot/.openclaw/workspace/projects/adhdev/docs/ARCHITECTURE.md',
  ].join('\n');
  const completeFinal = partialFinal
    .replace('Crunched for 20s는', 'Crunched for 2m 20s는')
    .replace('Crunched for footer가', 'Crunched for 2m 20s footer가')
    .replace('Crunched for footer/status', 'Crunched for 2m 20s footer/status');

  const result = parseOutput({
    screenText: '❯',
    buffer: '',
    messages: [
      { role: 'user', content: '현재 클로드 cli 세션에서 마지막 메세지 터미널과 너무 다르게 나왔음' },
      { role: 'assistant', content: partialFinal },
      { role: 'assistant', content: completeFinal },
    ],
  });

  const standardAssistants = result.messages.filter((message) => message.role === 'assistant' && (message.kind || 'standard') === 'standard');
  assert.equal(standardAssistants.length, 1);
  assert.equal(standardAssistants[0].content, completeFinal);
});

test('hermes-cli parseOutput collapses a replayed final answer with residue after activity rows', () => {
  const cleanFinal = [
    '실제로 standalone isolate로 Claude CLI 점검 끝냈어.',
    '검증 환경:',
    '- standalone isolated runtime:',
    '- ADHDEV_SESSION_HOST_NAME=adhdev-standalone-verify-$$',
    '- port 3867',
    '- dev API 19280',
    '- command: node oss/packages/daemon-standalone/dist/index.js --port 3867 --no-open --dev',
    '- workspace:',
    '- /tmp/adhdev-claude-standalone-7turn',
    '- Claude CLI:',
    '- 2.1.122 (Claude Code)',
    '- global/default daemon은 안 죽였고 안 교체함.',
    '- 기존에 열려 있던 3857은 그대로 놔둠.',
    '실행한 검증:',
    '1. daemon-core, daemon-standalone rebuild',
    '2. isolated standalone launch/readiness 확인',
    '3. verifier + 7-turn side-effect 검증',
    '다음에 이어서 한다면 바로 할 작업은 이거야:',
    '- adhdev-providers/cli/claude-cli 쪽 parser regression test 추가',
    '- Crunched for Ns, Sautéed for Ns 제거',
    '- wrapped command artifact python3 | tmp/file.py) 제거/복원',
    '- provider script에서 고치고, daemon-core는 얇게 유지.',
  ].join('\n');
  const replayedWithResidue = cleanFinal
    .replace('--no-open --dev', '-\n-no-open --dev')
    .replace('- provider script에서 고치고', '5 9\n- provider script에서 고치고');

  const result = parseOutput({
    screenText: '❯',
    buffer: '',
    messages: [
      { role: 'user', content: '실제로 스탠드얼론 아이솔레이트로 클로드 cli 점검해봐' },
      { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: '$ git status --short --branch' },
      { role: 'assistant', content: cleanFinal },
      { role: 'assistant', kind: 'tool', senderName: 'Tool', content: 'grep launch_cli|send_chat|read_chat' },
      { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: '$ git status --short --branch && git log -1 --oneline' },
      { role: 'assistant', content: replayedWithResidue },
    ],
  });

  assert.deepEqual(toDetailedMessages(result), [
    { role: 'user', kind: 'standard', senderName: undefined, content: '실제로 스탠드얼론 아이솔레이트로 클로드 cli 점검해봐' },
    { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: '$ git status --short --branch' },
    { role: 'assistant', kind: 'standard', senderName: undefined, content: cleanFinal },
    { role: 'assistant', kind: 'tool', senderName: 'Tool', content: 'grep launch_cli|send_chat|read_chat' },
    { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: '$ git status --short --branch && git log -1 --oneline' },
  ]);
});

test('hermes-cli parseOutput drops a prior final answer replayed after a follow-up user prompt', () => {
  const final = [
    '점검 완료.',
    '결론:',
    '- Claude Code CLI: 정상',
    '- Codex CLI: 정상, 단 codex 자체가 시작 시 아래 warning을 계속 냄',
    '- WARNING: failed to clean up stale arg0 temp dirs: Permission denied (os error 13)',
    '- 실행 자체는 성공했고 ADHDev detect도 버전 파싱 정상',
    '확인한 것:',
    '1. 글로벌 ADHDev daemon 상태',
    '- adhdev 버전: 0.9.44',
    '- 실행 daemon PID: 33883',
    '요약하면 지금 기준으로는:',
    '- 설치/detect OK',
    '- provider root/loaded-latest OK',
    '- 직접 CLI runnable OK',
    '- parser regression OK',
    'Codex warning은 별도 청소/권한 이슈로 보이는데, 현재 기능 실패로 이어지진 않았어.',
  ].join('\n');
  const followUp = '지금 이 대화 최종 메세지 두개로 보이는데';

  const result = parseOutput({
    screenText: [
      `● ${followUp}`,
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      final,
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      `● ${followUp}`,
      '┊ 🔧 skill adhdev-hermes-cli-duplicate-bubble-triage',
      '❯',
    ].join('\n'),
    buffer: [
      `● ${followUp}`,
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      final,
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      `● ${followUp}`,
      '┊ 🔧 skill adhdev-hermes-cli-duplicate-bubble-triage',
      '❯',
    ].join('\n'),
    messages: [
      { role: 'user', content: '좋아 지금 클로드코드 cli, 코덱스 cli 한번 더 점검해' },
      { role: 'assistant', content: final },
    ],
  });

  assert.deepEqual(toDetailedMessages(result), [
    { role: 'user', kind: 'standard', senderName: undefined, content: '좋아 지금 클로드코드 cli, 코덱스 cli 한번 더 점검해' },
    { role: 'assistant', kind: 'standard', senderName: undefined, content: final },
    { role: 'user', kind: 'standard', senderName: undefined, content: followUp },
    { role: 'assistant', kind: 'tool', senderName: 'Tool', content: 'skill adhdev-hermes-cli-duplicate-bubble-triage' },
  ]);
});

test('hermes-cli parseOutput drops transient footer/status lines and collapses duplicate final bubbles', () => {
  const noisyFinal = [
    '생성 파일명: game_369.py',
    '실행한 명령: python3 game_369.py --self-test',
    '.1K/ │ [█ ░░] 7% │ │ ⏱',
    'self-test 마지막 marker 줄: ADHDEV_369_DONE_HERMES_CLI',
  ].join('\n');
  const cleanFinal = [
    '생성 파일명: game_369.py',
    '실행한 명령: python3 game_369.py --self-test',
    'self-test 마지막 marker 줄: ADHDEV_369_DONE_HERMES_CLI',
  ].join('\n');

  const result = parseOutput({
    screenText: '❯',
    buffer: '',
    messages: [
      { role: 'user', content: '3,6,9 게임을 만들고 self-test marker를 출력하세요.' },
      { role: 'assistant', content: noisyFinal },
      { role: 'assistant', content: cleanFinal },
    ],
  });

  const standardAssistants = result.messages.filter((message) => message.role === 'assistant' && (message.kind || 'standard') === 'standard');
  assert.equal(standardAssistants.length, 1);
  assert.equal(standardAssistants[0].content, cleanFinal);
});

test('hermes-cli parseOutput does not surface the current live input prompt as a submitted user bubble', () => {
  const screenText = [
    '● earlier prompt',
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    'Earlier assistant answer.',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '──────────────────────────────────────────────────────────────────────────────',
    '> currently typed user input',
    '──────────────────────────────────────────────────────────────────────────────',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [
      { role: 'user', content: 'earlier prompt' },
      { role: 'assistant', content: 'Earlier assistant answer.' },
    ],
  });

  assert.deepEqual(toMessages(result), [
    { role: 'user', content: 'earlier prompt' },
    { role: 'assistant', content: 'Earlier assistant answer.' },
  ]);
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

test('hermes-cli parseOutput collapses committed and viewport variants of the same multiline starting prompt', () => {
  const firstLine = '현재 여러 기기에서 동시접속 시 문제될만한 사항이 있는지 점검필요.';
  const secondLine = '스탠드얼론이나 p2p 모든경로 확인필요';
  const fullPrompt = `${firstLine} ${secondLine}`;
  const assistantBox = [
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    '확인하겠습니다.',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '❯',
  ].join('\n');
  const screenText = [
    '──────────────────────────────────────────────────────────────────────────────',
    `> ${fullPrompt}`,
    '──────────────────────────────────────────────────────────────────────────────',
    assistantBox,
  ].join('\n');
  const buffer = [
    `● ${firstLine}`,
    assistantBox,
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer,
    messages: [{ role: 'user', content: fullPrompt }],
  });

  assert.deepEqual(toMessages(result), [
    { role: 'user', content: fullPrompt },
    { role: 'assistant', content: '확인하겠습니다.' },
  ]);
});

test('hermes-cli parseOutput scopes raw replay after the last committed user prompt', () => {
  const priorAnswer = 'Earlier structural parser plan answer that should stay committed once.';
  const currentPrompt = '좋아 이어서 진행해';
  const screenText = [
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    priorAnswer,
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '──────────────────────────────────────────────────────────────────────────────',
    `> ${currentPrompt}`,
    '──────────────────────────────────────────────────────────────────────────────',
    '┊ 🔧 terminal test command',
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    'Current phase two work is running.',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [
      { role: 'user', content: '이전 요청' },
      { role: 'assistant', content: priorAnswer },
      { role: 'user', content: currentPrompt },
    ],
    isWaitingForResponse: true,
  });

  assert.deepEqual(toMessages(result), [
    { role: 'user', content: '이전 요청' },
    { role: 'assistant', content: priorAnswer },
    { role: 'user', content: currentPrompt },
    { role: 'assistant', content: 'terminal test command' },
    { role: 'assistant', content: 'Current phase two work is running.' },
  ]);
});

test('hermes-cli parseOutput drops a prior final replay after current-turn tool activity', () => {
  const priorAnswer = 'Earlier structural parser plan answer that should not become the current final answer.';
  const currentPrompt = '좋아 이어서 진행해';
  const screenText = [
    '──────────────────────────────────────────────────────────────────────────────',
    `> ${currentPrompt}`,
    '──────────────────────────────────────────────────────────────────────────────',
    '┊ 🔧 terminal test command',
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    priorAnswer,
    '╰──────────────────────────────────────────────────────────────────────────────╯',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [
      { role: 'user', content: '이전 요청' },
      { role: 'assistant', content: priorAnswer },
      { role: 'user', content: currentPrompt },
    ],
    isWaitingForResponse: true,
  });

  assert.deepEqual(toMessages(result), [
    { role: 'user', content: '이전 요청' },
    { role: 'assistant', content: priorAnswer },
    { role: 'user', content: currentPrompt },
    { role: 'assistant', content: 'terminal test command' },
  ]);
});

test('hermes-cli parseOutput ignores non-monotonic raw history before the current committed prompt', () => {
  const firstAnswer = 'First committed assistant answer that should not be appended again from raw history.';
  const secondAnswer = 'Second committed assistant answer that should remain canonical once.';
  const currentPrompt = '좋아 이어서 진행해';
  const buffer = [
    '● 중간 요청',
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    secondAnswer,
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    firstAnswer,
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '──────────────────────────────────────────────────────────────────────────────',
    `> ${currentPrompt}`,
    '──────────────────────────────────────────────────────────────────────────────',
    '┊ 🔧 current validation command',
  ].join('\n');

  const result = parseOutput({
    screenText: buffer,
    buffer,
    messages: [
      { role: 'user', content: '처음 요청' },
      { role: 'assistant', content: firstAnswer },
      { role: 'user', content: '중간 요청' },
      { role: 'assistant', content: secondAnswer },
      { role: 'user', content: currentPrompt },
    ],
    isWaitingForResponse: true,
  });

  assert.deepEqual(toMessages(result), [
    { role: 'user', content: '처음 요청' },
    { role: 'assistant', content: firstAnswer },
    { role: 'user', content: '중간 요청' },
    { role: 'assistant', content: secondAnswer },
    { role: 'user', content: currentPrompt },
    { role: 'assistant', content: 'current validation command' },
  ]);
});

test('hermes-cli parseOutput drops a line-wrapped final replay after current-turn tools', () => {
  const cleanFinal = [
    '진행 상황 요약.',
    '1. Phase2 verify는 통과했어.',
    '- tracked provider tests 통과',
    '- diff whitespace 통과',
    '현재 결론: source first current-turn scoped merge로 이동했고 live 검증을 이어가면 된다.',
  ].join('\n');
  const wrappedFinal = [
    '진행 상황 요약.',
    '1. Phase2 verify는 통과했어.',
    '- tracked provider tests 통과',
    '- diff whitespace 통과',
    '현재 결론: source first current-turn scoped merge로 이동했고 live 검증을 이어가면 된',
    '다.',
  ].join('\n');
  const result = parseOutput({
    screenText: '',
    buffer: '',
    messages: [
      { role: 'user', content: '좋아 이어서 진행해' },
      { role: 'assistant', content: cleanFinal },
      { role: 'assistant', kind: 'terminal', content: 'adhdev provider reload' },
      { role: 'assistant', kind: 'tool', content: 'skill systematic-debugging' },
      { role: 'assistant', content: wrappedFinal },
    ],
    isWaitingForResponse: true,
  });

  assert.deepEqual(toMessages(result), [
    { role: 'user', content: '좋아 이어서 진행해' },
    { role: 'assistant', content: cleanFinal },
    { role: 'assistant', content: 'adhdev provider reload' },
    { role: 'assistant', content: 'skill systematic-debugging' },
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

test('hermes-cli parseOutput does not keep a timed-out dangerous-command dialog as actionable approval', () => {
  const screenText = [
    '╭────────────────────────────────────────────────────────────╮',
    '│ ⚠️ Dangerous Command                                      │',
    '│                                                            │',
    '│ curl -fsS http://127.0.0.1:19280/api/cli/debug/claude-cli │',
    '│ | python3 - ...                                           │',
    '│                                                            │',
    '│ ⏱ Timeout — denying command                               │',
    '│ ACTION REQUIRED                                           │',
    '│ ❯ Allow once                                               │',
    '│   Allow for this session                                   │',
    '│   Copy                                                     │',
    '╰────────────────────────────────────────────────────────────╯',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    isWaitingForResponse: true,
  });

  assert.notEqual(result.status, 'waiting_approval');
  assert.equal(result.activeModal, null);
  assert.ok(!result.messages.some((message) => /Approval requested|ACTION REQUIRED|Allow once/.test(message.content || '')));
  assert.notEqual(detectStatus({ screenText, buffer: screenText }), 'waiting_approval');
});

test('hermes-cli parseOutput keeps redrawn in-flight skill activity text visible during generation', () => {
  const screenText = [
    '● Validate the global daemon with the known skill.',
    ' ┊ 📚 skill global-daemon-validation•skill global-daemon-validationskill global-daemon-validation•@skill global-daemon-validation',
    '❯',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    isWaitingForResponse: true,
  });

  assert.deepEqual(toDetailedMessages(result), [
    {
      role: 'user',
      kind: 'standard',
      senderName: undefined,
      content: 'Validate the global daemon with the known skill.',
    },
    {
      role: 'assistant',
      kind: 'tool',
      senderName: 'Tool',
      content: 'skill global-daemon-validation',
    },
  ]);
});

test('hermes-cli parseOutput keeps redrawn skill activity text visible when the first prefix is lost', () => {
  const screenText = [
    '● Validate the live transcript plumbing with the known skill.',
    ' ┊ 📚 provider-live-transcript-plumbingskill provider-live-transcript-plumbing.skill provider-live-transcript-plumbingskill provider-live-transcript-plumbing• skill provider-live-transcript-plumbingskill provider-live-transcript-plumbing• skill provider-live-transcript-plumbing• skill provider-live-transcript-plumbing',
    '❯',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    isWaitingForResponse: true,
  });

  assert.deepEqual(toDetailedMessages(result), [
    {
      role: 'user',
      kind: 'standard',
      senderName: undefined,
      content: 'Validate the live transcript plumbing with the known skill.',
    },
    {
      role: 'assistant',
      kind: 'tool',
      senderName: 'Tool',
      content: 'skill provider-live-transcript-plumbing',
    },
  ]);
});

test('hermes-cli parseOutput keeps skill activity text visible even when durable words are present during streaming', () => {
  const screenText = [
    '● Validate the global daemon with the known skill.',
    ' ┊ 📚 skill global-daemon-validation completed skill global-daemon-validation',
    '❯',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    isWaitingForResponse: true,
  });

  assert.deepEqual(toDetailedMessages(result), [
    {
      role: 'user',
      kind: 'standard',
      senderName: undefined,
      content: 'Validate the global daemon with the known skill.',
    },
    {
      role: 'assistant',
      kind: 'tool',
      senderName: 'Tool',
      content: 'skill global-daemon-validation completed skill global-daemon-validation',
    },
  ]);
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

test('hermes-cli parseOutput keeps long consecutive activity bursts visible during streaming', () => {
  const result = parseOutput({
    screenText: 'type a message + Enter to interrupt, Ctrl+C to cancel',
    buffer: '',
    messages: [
      { role: 'user', content: '진행해' },
      { role: 'assistant', kind: 'tool', senderName: 'Tool', content: 'skill test-driven-development' },
      { role: 'assistant', kind: 'tool', senderName: 'Tool', content: 'skill systematic-debugging' },
      { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: '$ git status --short --branch' },
      { role: 'assistant', kind: 'tool', senderName: 'Tool', content: 'read /tmp/adhdev_inspect_hermes_dups.js' },
      { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: '$ node /tmp/adhdev_inspect_hermes_activity.js' },
      { role: 'assistant', content: '중간 점검: activity row는 보존하되 긴 연속 burst는 한 bubble로 줄입니다.' },
    ],
    isWaitingForResponse: true,
  });

  assert.deepEqual(toDetailedMessages(result), [
    {
      role: 'user',
      kind: 'standard',
      senderName: undefined,
      content: '진행해',
    },
    {
      role: 'assistant',
      kind: 'tool',
      senderName: 'Tool',
      content: 'skill test-driven-development',
    },
    {
      role: 'assistant',
      kind: 'tool',
      senderName: 'Tool',
      content: 'skill systematic-debugging',
    },
    {
      role: 'assistant',
      kind: 'terminal',
      senderName: 'Terminal',
      content: '$ git status --short --branch',
    },
    {
      role: 'assistant',
      kind: 'tool',
      senderName: 'Tool',
      content: 'read /tmp/adhdev_inspect_hermes_dups.js',
    },
    {
      role: 'assistant',
      kind: 'terminal',
      senderName: 'Terminal',
      content: '$ node /tmp/adhdev_inspect_hermes_activity.js',
    },
    {
      role: 'assistant',
      kind: 'standard',
      senderName: undefined,
      content: '중간 점검: activity row는 보존하되 긴 연속 burst는 한 bubble로 줄입니다.',
    },
  ]);
});

test('hermes-cli parseOutput does not absorb a bare final answer into the previous short terminal activity row', () => {
  const prompt = 'Summarize the just-completed work.';
  const finalAnswer = [
    '작업 반영 완료했습니다.',
    '',
    '변경 요약:',
    '- Dockview 탭을 드래그하면 floating panel로 전환됩니다.',
    '',
    '검증 완료:',
    '- npm run test -w oss/packages/web-core',
  ].join('\n');
  const screenText = [
    `● ${prompt}`,
    ' ┊ 💻 npm run test -w oss/packages/web-core',
    '작업 반영 완료했습니다.',
    '변경 요약:',
    '- Dockview 탭을 드래그하면 floating panel로 전환됩니다.',
    '검증 완료:',
    '- npm run test -w oss/packages/web-core',
    '❯',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: finalAnswer },
    ],
  });

  assert.deepEqual(toDetailedMessages(result), [
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
      content: 'npm run test -w oss/packages/web-core',
    },
    {
      role: 'assistant',
      kind: 'standard',
      senderName: undefined,
      content: finalAnswer,
    },
  ]);
});

test('hermes-cli parseOutput keeps screen activity rows before the committed final answer', () => {
  const prompt = '현재 작업 검증하고 요약해줘';
  const finalAnswer = '검증 끝. 테스트와 diff 확인까지 완료했습니다.';
  const screenText = [
    `● ${prompt}`,
    ' ┊ 📖 read /tmp/example.ts',
    ' ┊ 💻 npm test -- --runInBand',
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    '검증 끝. 테스트와 diff 확인까지 완료했습니다.',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '❯',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: finalAnswer },
    ],
  });

  assert.deepEqual(toDetailedMessages(result), [
    { role: 'user', kind: 'standard', senderName: undefined, content: prompt },
    { role: 'assistant', kind: 'tool', senderName: 'Tool', content: 'read /tmp/example.ts' },
    { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: 'npm test -- --runInBand' },
    { role: 'assistant', kind: 'standard', senderName: undefined, content: finalAnswer },
  ]);
});

test('hermes-cli parseOutput ignores orphan activity-only viewport rows without a turn anchor', () => {
  const screenText = [
    ' ┊ 🔎 grep browser_console|Activity \\(|activity rows|activity row',
    ' ┊ 💻 node /tmp/adhdev_parse_hermes_snapshot.js',
    ' ┊ 📝 write /tmp/adhdev_parse_hermes_snapshot.js',
    ' ⚕ gpt-5.5 │ 71.7K/272K │ [███░░░░░░░] 26% │ 30m │ ⏱ 4m 12s',
    '────────────────────────────────────────────────────────────────────────────────',
    '⚕ ❯ type a message + Enter to interrupt, Ctrl+C to cancel',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    isWaitingForResponse: true,
  });

  assert.deepEqual(toDetailedMessages(result), []);
});

test('hermes-cli parseOutput trims already-retained final-answer text from a polluted terminal activity bubble', () => {
  const prompt = 'Summarize the just-completed work.';
  const finalAnswer = [
    '작업 반영 완료했습니다.',
    '',
    '변경 요약:',
    '- Dockview 탭을 드래그하면 floating panel로 전환됩니다.',
    '',
    '검증 완료:',
    '- npm run test -w oss/packages/web-core',
  ].join('\n');
  const pollutedTerminal = 'npm run test -w oss/packages/web-core작업 반영 완료했습니다.변경 요약:- Dockview 탭을 드래그하면 floating panel로 전환됩니다.검증 완료:- npm run test -w oss/packages/web-core';

  const result = parseOutput({
    screenText: '❯',
    buffer: '',
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: finalAnswer },
      { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: pollutedTerminal },
    ],
  });

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
      content: finalAnswer,
    },
    {
      role: 'assistant',
      kind: 'terminal',
      senderName: 'Terminal',
      content: 'npm run test -w oss/packages/web-core',
    },
  ]);
});

test('hermes-cli parseOutput strips repeated read activity labels from a retained standard answer replay', () => {
  const prompt = '품질 점검 결과 정리해줘';
  const finalAnswer = [
    '점검 결과 요약:',
    '1. Parser regression 테스트',
    '- 실행:',
    '- node --test tests/codex-cli-parser.test.js tests/codex-controls.test.js tests/claude-cli-chat-parsing.test.js tests/claude-cli-controls.test.js',
    '- 결과:',
    '- 65개 전부 통과',
    '- fail 0',
    '',
    '추가로 Codex live artifact에서 보였던 잔여 noise 케이스를 regression으로 보강했고, 관련 parser cleanup도 패치했습니다.',
  ].join('\n');
  const readLabel = [
    '📖 /Users/moltbot/.openclaw/workspace/projects/adhdev-providers/tests/codex-c',
    'l',
    'i-parser.test.js',
  ].join('\n');
  const pollutedAnswer = [
    readLabel,
    '점검 결과 요약:',
    readLabel,
    readLabel,
    '1. Parser regression 테스트',
    readLabel,
    '- 실행:',
    readLabel,
    '- node --test tests/codex-cli-parser.test.js tests/codex-controls.test.js tests/claude-cli-chat-parsing.test.js tests/claude-cli-controls.test.js',
    readLabel,
    '- 결과:',
    readLabel,
    '- 65개 전부 통과',
    readLabel,
    '- fail 0',
    readLabel,
    '',
    readLabel,
    '추가로 Codex live artifact에서 보였던 잔여 noise 케이스를 regression으로 보강했고, 관련 parser cleanup도 패치했습니다.',
  ].join('\n');

  const result = parseOutput({
    screenText: '❯',
    buffer: '',
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: finalAnswer },
      { role: 'assistant', content: pollutedAnswer },
    ],
  });

  const messages = toDetailedMessages(result);
  assert.deepEqual(messages, [
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
      content: finalAnswer,
    },
  ]);
  assert.equal(JSON.stringify(messages).includes('📖 /Users/moltbot'), false);
});

test('hermes-cli parseOutput collapses browser_console label leaks back into one assistant bubble', () => {
  const prompt = '검증 결과 알려줘';
  const assistant = [
    '현재 standalone HMR에서 실제 브라우저 검증까지 진행한 상태입니다.',
    '',
    '진행한 것:',
    '- dashboard 접근 확인',
    '- runtime snapshot 확인',
  ].join('\n');
  const screenText = [
    `● ${prompt}`,
    ' ┊ 🖥️ browser_console현재 standalone HMR에서 실제 브라우저 검증까지 진행한 상태입니다.',
    ' ┊ 🖥️ browser_console',
    ' ┊ 🖥️ browser_console진행한 것:',
    ' ┊ 🖥️ browser_console- dashboard 접근 확인',
    ' ┊ 🖥️ browser_console- runtime snapshot 확인',
    '❯',
  ].join('\n');

  const result = parseOutput({ screenText, buffer: screenText, messages: [] });

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
      content: assistant,
    },
  ]);
});

test('hermes-cli parseOutput keeps assistant-box content after literal activity-like examples', () => {
  const prompt = '검증 결과 알려줘';
  const assistant = [
    '완료 보고.',
    '원인:',
    '- 최종 assistant prose가 이런 형태로 들어온 경우:',
    '┊ 🖥️ browser_console현재 standalone HMR에서 ...',
    '┊ 🖥️ browser_console- dashboard 접근 확인',
    'parser가 이것을 진짜 browser_console tool activity로 오인했습니다.',
    '수정:',
    '- 채팅 버블이 여기까지 끝까지 보여야 합니다.',
  ].join('\n');
  const screenText = [
    `● ${prompt}`,
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    '완료 보고.',
    '',
    '원인:',
    '- 최종 assistant prose가 이런 형태로 들어온 경우:',
    '',
    '  ┊ 🖥️ browser_console현재 standalone HMR에서 ...',
    '  ┊ 🖥️ browser_console- dashboard 접근 확인',
    '',
    '  parser가 이것을 진짜 browser_console tool activity로 오인했습니다.',
    '',
    '수정:',
    '- 채팅 버블이 여기까지 끝까지 보여야 합니다.',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '❯',
  ].join('\n');

  const result = parseOutput({ screenText, buffer: screenText, messages: [] });

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
      content: assistant,
    },
  ]);
  assert.match(result.messages.at(-1).content, /채팅 버블이 여기까지 끝까지 보여야 합니다/);
});

test('hermes-cli parseOutput preserves real browser_console activity rows with delimiters', () => {
  const screenText = [
    '● Check browser state.',
    ' ┊ 🖥️ browser_console expression=document.title 0.2s',
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
      content: 'Check browser state.',
    },
    {
      role: 'assistant',
      kind: 'tool',
      senderName: 'Tool',
      content: 'browser_console expression=document.title',
    },
    {
      role: 'assistant',
      kind: 'standard',
      senderName: undefined,
      content: 'Done.',
    },
  ]);
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

test('hermes-cli parseOutput canonicalizes in-flight activity status suffixes before merging history', () => {
  const prompt = 'Find JSONL transcript files.';
  const screenText = [
    `● ${prompt}`,
    '┊ 🔎 find *.jsonl 0.1s(⌐■_■) contemplating...',
    '❯',
  ].join('\n');

  const result = parseOutput({
    screenText,
    buffer: screenText,
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', kind: 'tool', senderName: 'Tool', content: 'find *.jsonl 0.1s' },
      { role: 'assistant', kind: 'tool', senderName: 'Tool', content: 'find *.jsonl 0.1s(⌐■_■) thinking...' },
    ],
    isWaitingForResponse: true,
  });

  assert.deepEqual(toDetailedMessages(result), [
    {
      role: 'user',
      kind: 'standard',
      senderName: undefined,
      content: prompt,
    },
    {
      role: 'assistant',
      kind: 'tool',
      senderName: 'Tool',
      content: 'find *.jsonl',
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

test('hermes-cli parseOutput reconstructs fenced code blocks from plain python/text sections in assistant boxes', () => {
  const prompt = 'Create tmp/adhdev_cli_verify.py, run it, and show the script plus output.';

  const result = parseOutput({
    screenText: [
      `● ${prompt}`,
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      '스크립트를 생성하고 실행했습니다.',
      '| Number | Square |',
      '|---:|---:|',
      '| 1 | 1 |',
      '| 2 | 4 |',
      'python',
      'import json',
      'print(json.dumps({"ok": True}))',
      'text',
      'CWD=/tmp/demo',
      'JSON={"ok":true}',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    buffer: [
      `● ${prompt}`,
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      '스크립트를 생성하고 실행했습니다.',
      '| Number | Square |',
      '|---:|---:|',
      '| 1 | 1 |',
      '| 2 | 4 |',
      'python',
      'import json',
      'print(json.dumps({"ok": True}))',
      'text',
      'CWD=/tmp/demo',
      'JSON={"ok":true}',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
  });

  assert.match(result.messages[1].content, /```python\nimport json\nprint\(json\.dumps\({"ok": True}\)\)\n```/);
  assert.match(result.messages[1].content, /```text\nCWD=\/tmp\/demo\nJSON=\{"ok":true\}\n```/);
});

test('hermes-cli parseOutput ignores transient analyzing suffixes appended to the visible follow-up prompt', () => {
  const fullPrompt = 'In one short paragraph, summarize what you just executed. You must mention tmp/adhdev_cli_verify.py and the square sequence 1,4,9,16,25.';

  const result = parseOutput({
    screenText: [
      '● In one short paragraph, summarize what you just executed. You must mention ٩(๑❛ᴗ❛๑)۶ analyzing...',
      '❯',
    ].join('\n'),
    buffer: [
      '● In one short paragraph, summarize what you just executed. You must mention ٩(๑❛ᴗ❛๑)۶ analyzing...',
      '❯',
    ].join('\n'),
    messages: [
      { role: 'user', content: fullPrompt },
    ],
  });

  assert.deepEqual(toMessages(result), [
    { role: 'user', content: fullPrompt },
  ]);
});

test('hermes-cli parseOutput treats wrapped Hangul assistant prose as the same message and keeps the more complete version', () => {
  const fullPrompt = 'In one short paragraph, summarize what you just executed. You must mention tmp/adhdev_cli_verify.py and the square sequence 1,4,9,16,25.';
  const reflowed = 'tmp/adhdev_cli_verify.py를 생성한 뒤 python3로 실행했고, 현재 작업 디렉터리를 출력하면서 제곱수 시퀀스 1,4,9,16,25와 동일한 값을 JSON 형식으로도 정확히 확인했습니다.';
  const wrapped = 'tmp/adhdev_cli_verify.py를 생성한 뒤 python3로 실행했고, 현재 작업 디렉터리\n를 출력하면서 제곱수 시퀀스 1,4,9,16,25와 동일한 값을 JSON 형식으로도 정확히 확\n인했습니다.';

  const result = parseOutput({
    screenText: [
      `● ${fullPrompt}`,
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      'tmp/adhdev_cli_verify.py를 생성한 뒤 python3로 실행했고, 현재 작업 디렉터리',
      '를 출력하면서 제곱수 시퀀스 1,4,9,16,25와 동일한 값을 JSON 형식으로도 정확히 확',
      '인했습니다.',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    buffer: [
      `● ${fullPrompt}`,
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      'tmp/adhdev_cli_verify.py를 생성한 뒤 python3로 실행했고, 현재 작업 디렉터리',
      '를 출력하면서 제곱수 시퀀스 1,4,9,16,25와 동일한 값을 JSON 형식으로도 정확히 확',
      '인했습니다.',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    messages: [
      { role: 'user', content: fullPrompt },
      { role: 'assistant', content: reflowed },
    ],
  });

  assert.deepEqual(toMessages(result), [
    { role: 'user', content: fullPrompt },
    { role: 'assistant', content: reflowed },
  ]);
});

test('hermes-cli parseOutput collapses a polluted follow-up history into one prior answer and one final answer', () => {
  const initialPrompt = 'Please do all of the following in this workspace: 1. Create tmp/adhdev_cli_verify.py that prints exactly these three lines: ... (+8 more lines) - a fenced text block containing the exact command output If you need permission to write the file or run the command, request it.';
  const followupPrompt = 'In one short paragraph, summarize what you just executed. You must mention tmp/adhdev_cli_verify.py and the square sequence 1,4,9,16,25.';
  const pollutedFollowupPrompt = 'In one short paragraph, summarize what you just executed. You must mention ٩(๑❛ᴗ❛๑)۶ analyzing...';
  const priorAnswer = '요청하신 대로 /Users/vilmire/Work/remote_vs/tmp/adhdev_cli_verify.py를 생성하고 python3로 실행해 출력까지 확인했습니다.\n| Number | Square |\n|---|---:|\n| 1 | 1 |\n| 2 | 4 |\n| 3 | 9 |\n| 4 | 16 |\n| 5 | 25 |\n```python\nfrom pathlib import Path\nimport json\nsquares = [n * n for n in range(1, 6)]\ncwd = Path.cwd()\nprint(f\"CWD={cwd}\")\nprint(\"SQUARES=\" + \",\".join(str(n) for n in squares))\nprint(\"JSON=\" + json.dumps({\"squares\": squares}, separators=(\",\", \":\")))\n```\n```text\nCWD=/Users/vilmire/Work/remote_vs\nSQUARES=1,4,9,16,25\nJSON={\"squares\":[1,4,9,16,25]}\n```';
  const wrappedPriorAnswer = '요청하신 대로 /Users/vilmire/Work/remote_vs/tmp/adhdev_cli_verify.py를 생성\n하고 python3로 실행해 출력까지 확인했습니다.\n| Number | Square |\n|---|---:|\n| 1 | 1 |\n| 2 | 4 |\n| 3 | 9 |\n| 4 | 16 |\n| 5 | 25 |\n```python\nfrom pathlib import Path\nimport json\nsquares = [n * n for n in range(1, 6)]\ncwd = Path.cwd()\nprint(f\"CWD={cwd}\")\nprint(\"SQUARES=\" + \",\".join(str(n) for n in squares))\nprint(\"JSON=\" + json.dumps({\"squares\": squares}, separators=(\",\", \":\")))\n```\n```text\nCWD=/Users/vilmire/Work/remote_vs\nSQUARES=1,4,9,16,25\nJSON={\"squares\":[1,4,9,16,25]}\n```';
  const finalAnswer = 'tmp/adhdev_cli_verify.py를 생성한 뒤 python3로 실행했고, 현재 작업 디렉터리를 출력하면서 제곱수 시퀀스 1,4,9,16,25와 동일한 값을 JSON 형식으로도 정확히 확인했습니다.';

  const result = parseOutput({
    screenText: [
      `● ${initialPrompt}`,
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      '요청하신 대로 /Users/vilmire/Work/remote_vs/tmp/adhdev_cli_verify.py를 생성',
      '하고 python3로 실행해 출력까지 확인했습니다.',
      '| Number | Square |',
      '|---|---:|',
      '| 1 | 1 |',
      '| 2 | 4 |',
      '| 3 | 9 |',
      '| 4 | 16 |',
      '| 5 | 25 |',
      'python',
      'from pathlib import Path',
      'import json',
      'squares = [n * n for n in range(1, 6)]',
      'cwd = Path.cwd()',
      'print(f"CWD={cwd}")',
      'print("SQUARES=" + ",".join(str(n) for n in squares))',
      'print("JSON=" + json.dumps({"squares": squares}, separators=(",", ":")))',
      'text',
      'CWD=/Users/vilmire/Work/remote_vs',
      'SQUARES=1,4,9,16,25',
      'JSON={"squares":[1,4,9,16,25]}',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      `● ${followupPrompt}`,
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      'tmp/adhdev_cli_verify.py를 생성한 뒤 python3로 실행했고, 현재 작업 디렉터리',
      '를 출력하면서 제곱수 시퀀스 1,4,9,16,25와 동일한 값을 JSON 형식으로도 정확히 확',
      '인했습니다.',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    buffer: [
      `● ${initialPrompt}`,
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      '요청하신 대로 /Users/vilmire/Work/remote_vs/tmp/adhdev_cli_verify.py를 생성',
      '하고 python3로 실행해 출력까지 확인했습니다.',
      '| Number | Square |',
      '|---|---:|',
      '| 1 | 1 |',
      '| 2 | 4 |',
      '| 3 | 9 |',
      '| 4 | 16 |',
      '| 5 | 25 |',
      'python',
      'from pathlib import Path',
      'import json',
      'squares = [n * n for n in range(1, 6)]',
      'cwd = Path.cwd()',
      'print(f"CWD={cwd}")',
      'print("SQUARES=" + ",".join(str(n) for n in squares))',
      'print("JSON=" + json.dumps({"squares": squares}, separators=(",", ":")))',
      'text',
      'CWD=/Users/vilmire/Work/remote_vs',
      'SQUARES=1,4,9,16,25',
      'JSON={"squares":[1,4,9,16,25]}',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      `● ${followupPrompt}`,
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      'tmp/adhdev_cli_verify.py를 생성한 뒤 python3로 실행했고, 현재 작업 디렉터리',
      '를 출력하면서 제곱수 시퀀스 1,4,9,16,25와 동일한 값을 JSON 형식으로도 정확히 확',
      '인했습니다.',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    messages: [
      { role: 'user', content: initialPrompt },
      { role: 'assistant', content: priorAnswer },
      { role: 'assistant', content: wrappedPriorAnswer },
      { role: 'user', content: followupPrompt },
      { role: 'user', content: pollutedFollowupPrompt },
      { role: 'assistant', content: wrappedPriorAnswer },
      { role: 'user', content: followupPrompt },
      { role: 'assistant', content: finalAnswer },
    ],
  });

  assert.deepEqual(toMessages(result), [
    { role: 'user', content: initialPrompt },
    { role: 'assistant', content: priorAnswer },
    { role: 'user', content: followupPrompt },
    { role: 'assistant', content: finalAnswer },
  ]);
});

test('hermes-cli parseOutput collapses repeated full-turn replays of the same user prompt and answer', () => {
  const prompt = '지금 다른 채팅에도 적용되고 있는건지?';
  const command = '$ adhdev runtime list --json --limit 50';
  const readCommandFile = 'read /Users/moltbot/.openclaw/workspace/projects/adhdev/packages/daemon-cloud/src/cli/daemon-commands.ts';
  const finalAnswer = '네. 방금 다른 활성 Hermes 채팅들도 직접 확인했습니다. 현재 global daemon의 active hermes-cli runtime 3개 모두 dirty skill tool bubble이 0개입니다. global daemon이 쓰는 hermes-cli provider parser가 reload된 상태라, 특정 채팅 하나에만 적용되는 게 아니라 hermes-cli provider 전체에 적용됩니다. read_chat 기준으로는 active 채팅 3개 모두 dirty tool bubble이 0개입니다.';
  const wrappedFinalAnswer = finalAnswer.replace('특정 채팅 하나에만', '특정 채 팅 하나에만').replace('dirty tool', 'dirty too l');
  const trailingFinalAnswer = `${finalAnswer} 단, 사용자가 붙여넣은 예시 텍스트는 일반 메시지로 보존됩니다.`;
  const replayedTurn = (answer) => [
    { role: 'user', content: prompt },
    { role: 'assistant', kind: 'tool', senderName: 'Tool', content: readCommandFile },
    { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: command },
    { role: 'assistant', content: answer },
  ];

  const result = parseOutput({
    screenText: [
      `● ${prompt}`,
      `┊ 📖 ${readCommandFile}`,
      `┊ 💻 ${command}`,
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      finalAnswer,
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      `● ${prompt}`,
      `┊ 📖 ${readCommandFile}`,
      `┊ 💻 ${command}`,
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      finalAnswer,
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    buffer: '',
    messages: [
      ...replayedTurn(wrappedFinalAnswer),
      ...replayedTurn(finalAnswer),
      ...replayedTurn(trailingFinalAnswer),
    ],
  });

  assert.deepEqual(toDetailedMessages(result), [
    { role: 'user', kind: 'standard', senderName: undefined, content: prompt },
    { role: 'assistant', kind: 'tool', senderName: 'Tool', content: readCommandFile },
    { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: command },
    { role: 'assistant', kind: 'standard', senderName: undefined, content: wrappedFinalAnswer },
  ]);
});

test('hermes-cli parseOutput preserves distinct turns that only share prompt and answer prefixes', () => {
  const sharedPrefix = '이 작업을 provider-first 방식으로 처리해야 하는지 확인해줘. ';
  const firstPrompt = `${sharedPrefix}첫 번째 실제 요청은 canonical identity 회귀를 검증하는 케이스야.`;
  const secondPrompt = `${sharedPrefix}두 번째 실제 요청은 같은 앞부분을 갖지만 별도 턴으로 보존돼야 해.`;
  const command = '$ adhdev runtime list --json --limit 50';
  const firstAnswer = '검증 결과를 설명합니다. provider-owned identity가 유지되어 partial/final replay는 하나의 logical bubble로 정규화됩니다. 첫 번째 요청에 대한 결론입니다.';
  const secondAnswer = '검증 결과를 설명합니다. provider-owned identity가 유지되어 partial/final replay는 하나의 logical bubble로 정규화됩니다. 두 번째 요청에 대한 별도 결론입니다.';

  const result = parseOutput({
    screenText: '❯',
    buffer: '',
    messages: [
      { role: 'user', content: firstPrompt },
      { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: command },
      { role: 'assistant', content: firstAnswer },
      { role: 'user', content: secondPrompt },
      { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: command },
      { role: 'assistant', content: secondAnswer },
    ],
  });

  assert.deepEqual(toDetailedMessages(result), [
    { role: 'user', kind: 'standard', senderName: undefined, content: firstPrompt },
    { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: command },
    { role: 'assistant', kind: 'standard', senderName: undefined, content: firstAnswer },
    { role: 'user', kind: 'standard', senderName: undefined, content: secondPrompt },
    { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: command },
    { role: 'assistant', kind: 'standard', senderName: undefined, content: secondAnswer },
  ]);
});

test('hermes-cli parseOutput collapses full-turn replay when a retained user prompt is truncated or has transient status copy', () => {
  const prompt = '아니 내가 보기에는 지금 데몬에 이걸 맡기는게 맞는지가 궁금한데? 데몬이 처리해야되는 부분 맞는지? 데몬은 최대한 얇은부분만 담당하고 프로바이더가 전체를 핸들링할 수 있도록 최대한 작업해왔는데 여전히 이런 부분이 남아있는건지?';
  const truncatedPrompt = '아니 내가 보기에는 지금 데몬에 이걸 맡기는게 맞는지가 궁금한데? 데몬이';
  const transientPrompt = `${prompt} Window too small... (¬‿¬) brainstorming...`;
  const command = '$ adhdev runtime list --json --limit 50';
  const finalAnswer = '맞아요. 그 질문이 핵심이고, 제 이전 방향은 너무 빨리 daemon read_chat collapse 쪽으로 기울었습니다. Hermes-specific 의미 dedupe는 provider가 맡고 daemon은 provider가 준 stable identity를 얇게 존중해야 합니다.';
  const replayedTurn = (userContent) => [
    { role: 'user', content: userContent },
    { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: command },
    { role: 'assistant', content: finalAnswer },
  ];

  const result = parseOutput({
    screenText: '❯',
    buffer: '',
    messages: [
      ...replayedTurn(prompt),
      ...replayedTurn(truncatedPrompt),
      ...replayedTurn(transientPrompt),
    ],
  });

  assert.deepEqual(toDetailedMessages(result), [
    { role: 'user', kind: 'standard', senderName: undefined, content: prompt },
    { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: command },
    { role: 'assistant', kind: 'standard', senderName: undefined, content: finalAnswer },
  ]);
});

test('hermes-cli parseOutput collapses repeated in-turn activity rows before the final answer', () => {
  const command = '$ adhdev runtime list --json --limit 50';
  const readCommandFile = 'read /Users/moltbot/.openclaw/workspace/projects/adhdev/packages/daemon-cloud/src/cli/daemon-commands.ts';
  const finalAnswer = '확인 결과 active Hermes 채팅들에도 동일 provider parser가 적용되고 있고, dirty skill tool bubble은 0개입니다.';

  const result = parseOutput({
    screenText: [
      '● 지금 다른 채팅에도 적용되고 있는건지?',
      `┊ 💻 ${command}`,
      `┊ 📖 ${readCommandFile}`,
      `┊ 💻 ${command}`,
      `┊ 📖 ${readCommandFile}`,
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      finalAnswer,
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      `┊ 💻 ${command}`,
      `┊ 📖 ${readCommandFile}`,
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      finalAnswer,
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '❯',
    ].join('\n'),
    buffer: '',
    messages: [
      { role: 'user', content: '지금 다른 채팅에도 적용되고 있는건지?' },
      { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: command },
      { role: 'assistant', kind: 'tool', senderName: 'Tool', content: readCommandFile },
      { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: command },
      { role: 'assistant', kind: 'tool', senderName: 'Tool', content: readCommandFile },
      { role: 'assistant', content: finalAnswer },
    ],
  });

  assert.deepEqual(toDetailedMessages(result), [
    { role: 'user', kind: 'standard', senderName: undefined, content: '지금 다른 채팅에도 적용되고 있는건지?' },
    { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: command },
    { role: 'assistant', kind: 'tool', senderName: 'Tool', content: readCommandFile },
    { role: 'assistant', kind: 'standard', senderName: undefined, content: finalAnswer },
  ]);
});

test('hermes-cli parseOutput does not append replayed activity rows after a stable assistant answer', () => {
  const finalAnswer = [
    'Created the tiny browser Snake game in this workspace:',
    '/tmp/adhdev-live-snake-hermes/index.html',
    '/tmp/adhdev-live-snake-hermes/src/snake.js',
    '/tmp/adhdev-live-snake-hermes/README.md',
    'Validation command:',
    "python3 - <<'PY'",
    'print(\'validation ok\')',
    'PY',
    'Exact output:',
    'validation ok',
    'SNAKE_GAME_DONE',
    'FILES=index.html,src/snake.js,README.md',
    'GLYPHS=⏺ ⎿ ⚠ ❌ 𓂀 한글',
  ].join('\n');
  const validationCommand = "$ python3 - <<'PY'";
  const baseMessages = [
    { role: 'user', content: 'Create a tiny browser Snake game in THIS workspace. ... (+9 more lines)' },
    { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: validationCommand },
    { role: 'assistant', content: finalAnswer },
  ];
  const buffer = [
    '┊ 💻 $ python3 - <<\'PY\'',
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    finalAnswer,
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '┊ 💻 $ python3 - <<\'PY\'',
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    finalAnswer,
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '❯',
  ].join('\n');

  const result = parseOutput({
    screenText: buffer,
    buffer,
    messages: baseMessages,
  });

  assert.deepEqual(toDetailedMessages(result), [
    { role: 'user', kind: 'standard', senderName: undefined, content: 'Create a tiny browser Snake game in THIS workspace. ... (+9 more lines)' },
    { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: validationCommand },
    { role: 'assistant', kind: 'standard', senderName: undefined, content: finalAnswer },
  ]);
});

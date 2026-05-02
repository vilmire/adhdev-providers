const test = require('node:test');
const assert = require('node:assert/strict');
const detectStatus = require('../cli/hermes-cli/scripts/1.0/detect_status.js');
const parseApproval = require('../cli/hermes-cli/scripts/1.0/parse_approval.js');

function buildApprovalScreen() {
  return [
    '● Delete the file /Users/vilmire/adhdev_delete_probe_2.txt and then reply with one short sentence confirming whether the delete succeeded.',
    '╭─ Hermes needs your input ───────────────────────────────────────────────────╮',
    '│ Deleting /Users/vilmire/adhdev_delete_probe_2.txt requires approval.        │',
    '│ Approve the delete?                                                         │',
    '│ ❯ Approve delete                                                            │',
    '│ Do not delete                                                               │',
    '│ Other (type your answer)                                                    │',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '❓ Deleting /Users/vilmire/adhdev_delete_probe_2.txt requires approval. Approve the delete? ( )',
    '↑/↓ to select, Enter to confirm ()',
    '❯',
  ].join('\n');
}

function buildLegacyNumberedApprovalScreen() {
  return [
    '● 다시 python3 -c "print(123)" 명령을 실행해줘.',
    '╭────────────────────────────────────────────────╮',
    '│ ⚠️  Dangerous Command                          │',
    '│                                                │',
    '│ python3 -c "print(123)"                       │',
    '│                                                │',
    '│ ❯ 1. Allow once                               │',
    '│   2. Allow for this session                   │',
    '│   3. Add to permanent allowlist               │',
    '│   4. Deny                                     │',
    '│                                                │',
    '│ script execution via -e/-c flag               │',
    '╰────────────────────────────────────────────────╯',
    '',
    '  💻 python3 -c "print(123)"  (4.1s)',
    '  ↑/↓ to select, Enter to confirm  (56s)',
    '⚠ ❯',
  ].join('\n');
}

function buildTimedOutLegacyApprovalScreen() {
  return [
    '╭────────────────────────────────────────────────╮',
    '│ ⚠️  Dangerous Command                          │',
    '│                                                │',
    '│ curl -fsS http://127.0.0.1:19280/api/cli/debug │',
    '│                                                │',
    '│ ⏱ Timeout — denying command                   │',
    '│ ACTION REQUIRED                               │',
    '│ ❯ Allow once                                  │',
    '│   Allow for this session                      │',
    '│   Copy                                        │',
    '╰────────────────────────────────────────────────╯',
  ].join('\n');
}

function buildClarifyChoiceScreen() {
  return [
    '● 이 깃 긴',
    '╭─ Hermes needs your input ────────────────────────────────────────────────────╮',
    '│ 문장이 끊긴 것 같아요. “이 깃 긴…” 뒤에 어떤 걸 확인/수정하면 될까요? │',
    '│ ❯ 방금 고친 Git 기능을 더 자세히 설명해줘                                │',
    '│ 로컬에서 실제 UI로 Git 기능을 검증해줘                                     │',
    '│ 커밋들을 push해줘                                                         │',
    '│ 남은 미커밋 변경도 확인해줘                                               │',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '↑/↓ to select, Enter to confirm ()',
    '❯',
  ].join('\n');
}

function buildClarifyDebugJsonScreen() {
  return [
    '● 이 깃 긴',
    'functions.clarify {"question":"문장이 끊긴 것 같아요. “이 깃 긴…” 뒤에 어떤 걸 확인/수정하면 될까요?","choices_offered":["방금 고친 Git 기능을 더 자세히 설명해줘","로컬에서 실제 UI로 Git 기능을 검증해줘","커밋들을 push해줘","남은 미커밋 변경도 확인해줘"]}',
    '↑/↓ to select, Enter to confirm ()',
    '❯',
  ].join('\n');
}

function buildAnsweredClarifyDebugJsonScreen() {
  return [
    'functions.clarify {"question":"문장이 끊긴 것 같아요.","choices_offered":["방금 고친 Git 기능을 더 자세히 설명해줘","로컬에서 실제 UI로 Git 기능을 검증해줘"],"user_response":"방금 고친 Git 기능을 더 자세히 설명해줘"}',
    '❯',
  ].join('\n');
}

test('hermes-cli detects modern approval prompt as waiting_approval', () => {
  const screenText = buildApprovalScreen();
  assert.equal(detectStatus({ screenText }), 'waiting_approval');
});

test('hermes-cli parses modern approval prompt buttons', () => {
  const screenText = buildApprovalScreen();
  assert.deepEqual(parseApproval({ screenText }), {
    message: 'Deleting /Users/vilmire/adhdev_delete_probe_2.txt requires approval. Approve the delete?',
    buttons: ['Approve delete', 'Do not delete', 'Other (type your answer)'],
  });
});

test('hermes-cli detects numbered dangerous-command approval prompt as waiting_approval', () => {
  const screenText = buildLegacyNumberedApprovalScreen();
  assert.equal(detectStatus({ screenText }), 'waiting_approval');
});

test('hermes-cli parses numbered dangerous-command approval prompt buttons', () => {
  const screenText = buildLegacyNumberedApprovalScreen();
  assert.deepEqual(parseApproval({ screenText }), {
    message: '⚠️ Dangerous Command python3 -c "print(123)" script execution via -e/-c flag',
    buttons: ['Allow once', 'Allow for this session', 'Add to permanent allowlist', 'Deny'],
  });
});

test('hermes-cli ignores timed-out dangerous-command approval as resolved', () => {
  const screenText = buildTimedOutLegacyApprovalScreen();
  assert.equal(parseApproval({ screenText }), null);
  assert.notEqual(detectStatus({ screenText }), 'waiting_approval');
});

test('hermes-cli parses live clarify choice prompt buttons', () => {
  const screenText = buildClarifyChoiceScreen();
  assert.deepEqual(parseApproval({ screenText }), {
    message: '문장이 끊긴 것 같아요. “이 깃 긴…” 뒤에 어떤 걸 확인/수정하면 될까요?',
    buttons: [
      '방금 고친 Git 기능을 더 자세히 설명해줘',
      '로컬에서 실제 UI로 Git 기능을 검증해줘',
      '커밋들을 push해줘',
      '남은 미커밋 변경도 확인해줘',
    ],
  });
  assert.equal(detectStatus({ screenText }), 'waiting_approval');
});

test('hermes-cli parses clarify choices from debug JSON while waiting for selection', () => {
  const screenText = buildClarifyDebugJsonScreen();
  assert.deepEqual(parseApproval({ screenText }), {
    message: '문장이 끊긴 것 같아요. “이 깃 긴…” 뒤에 어떤 걸 확인/수정하면 될까요?',
    buttons: [
      '방금 고친 Git 기능을 더 자세히 설명해줘',
      '로컬에서 실제 UI로 Git 기능을 검증해줘',
      '커밋들을 push해줘',
      '남은 미커밋 변경도 확인해줘',
    ],
  });
  assert.equal(detectStatus({ screenText }), 'waiting_approval');
});

test('hermes-cli does not keep answered clarify debug output as actionable approval', () => {
  const screenText = buildAnsweredClarifyDebugJsonScreen();
  assert.equal(parseApproval({ screenText }), null);
  assert.notEqual(detectStatus({ screenText }), 'waiting_approval');
});

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

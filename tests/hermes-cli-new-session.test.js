const test = require('node:test');
const assert = require('node:assert/strict');
const newSession = require('../cli/hermes-cli/scripts/1.0/new_session.js');

test('hermes-cli newSession only sends /new so the runtime returns to an interactive prompt before the next user turn', () => {
  const result = newSession();
  assert.equal(result.ok, true);
  assert.deepEqual(result.command, {
    type: 'pty_write',
    text: '/new',
  });
  assert.equal(result.sessionEvent, 'new_session');
  assert.equal(result.historyMessageCount, 0);
});

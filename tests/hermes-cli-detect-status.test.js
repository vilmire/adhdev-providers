const test = require('node:test');
const assert = require('node:assert/strict');
const detectStatus = require('../cli/hermes-cli/scripts/1.0/detect_status.js');

test('hermes-cli stays generating when prompt marker remains visible alongside interrupt text', () => {
  const screenText = [
    '⚕ Hermes Agent v0.8.0',
    '❯',
    'reasoning: thinking hard about the task',
    'Enter to interrupt, Ctrl+C to cancel',
  ].join('\n');

  assert.equal(detectStatus({ screenText }), 'generating');
});

test('hermes-cli reports idle only for a bare prompt without generating markers', () => {
  const screenText = [
    'Type your message or /help for commands.',
    '❯',
  ].join('\n');

  assert.equal(detectStatus({ screenText }), 'idle');
});

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const cliRoot = path.join(repoRoot, 'cli');
const cliProviders = fs.readdirSync(cliRoot)
  .filter(entry => fs.existsSync(path.join(cliRoot, entry, 'scripts/1.0/parse_output.js')))
  .sort();

function scriptPath(type, name) {
  return path.join(cliRoot, type, 'scripts/1.0', name);
}

function sampleInput() {
  return {
    buffer: '',
    rawBuffer: '',
    recentBuffer: '',
    screenText: '',
    partialResponse: '',
    isWaitingForResponse: false,
    messages: [
      { role: 'user', kind: 'standard', content: 'prior prompt' },
      { role: 'assistant', kind: 'standard', content: 'prior answer' },
    ],
  };
}

test('every CLI provider exposes the common parse_session entrypoint', () => {
  for (const type of cliProviders) {
    assert.equal(
      fs.existsSync(scriptPath(type, 'parse_session.js')),
      true,
      `${type} should expose scripts/1.0/parse_session.js`,
    );
  }
});

test('parse_session normalizes parse_output into daemon-core ParsedSession shape', () => {
  for (const type of cliProviders) {
    const parseOutput = require(scriptPath(type, 'parse_output.js'));
    const parseSession = require(scriptPath(type, 'parse_session.js'));
    const input = sampleInput();
    const output = parseOutput(input);
    const session = parseSession(input);

    assert.equal(session.status, output.status || 'idle', `${type} status`);
    assert.deepEqual(session.messages, Array.isArray(output.messages) ? output.messages : [], `${type} messages`);
    assert.deepEqual(session.modal, output.activeModal || output.modal || null, `${type} modal`);
    assert.equal(session.parsedStatus, output.status || null, `${type} parsedStatus`);
  }
});

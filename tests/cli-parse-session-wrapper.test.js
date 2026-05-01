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

function parseSessionSource(type) {
  return fs.readFileSync(scriptPath(type, 'parse_session.js'), 'utf8');
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

test('every compatibility CLI provider declares a default script directory for versionless loader resolution', () => {
  for (const type of cliProviders) {
    const provider = JSON.parse(fs.readFileSync(path.join(cliRoot, type, 'provider.json'), 'utf8'));
    if (Array.isArray(provider.compatibility)) {
      assert.equal(provider.defaultScriptDir, 'scripts/1.0', `${type} should provide defaultScriptDir for resolve(type) without a version`);
    }
  }
});

test('every CLI scripts.js exports the common parseSession runtime hook', () => {
  for (const type of cliProviders) {
    const scripts = require(scriptPath(type, 'scripts.js'));
    assert.equal(typeof scripts.parseSession, 'function', `${type} scripts.js should export parseSession`);
    const direct = require(scriptPath(type, 'parse_session.js'))(sampleInput());
    const viaScripts = scripts.parseSession(sampleInput());
    assert.deepEqual(viaScripts, direct, `${type} scripts.js parseSession should delegate to parse_session.js`);
  }
});

test('every CLI parse_session entrypoint delegates shared wrapper behavior to cli/_shared', () => {
  const sharedPath = path.join(cliRoot, '_shared/parse_session.js');
  assert.equal(fs.existsSync(sharedPath), true, 'cli/_shared/parse_session.js should exist');
  const shared = require(sharedPath);
  assert.equal(typeof shared.wrapParseOutputAsSession, 'function', 'shared wrapper factory');
  assert.equal(typeof shared.normalizeMessageIdentity, 'function', 'shared identity normalizer');

  for (const type of cliProviders) {
    const source = parseSessionSource(type);
    assert.match(source, /_shared\/parse_session\.js/, `${type} parse_session should require the shared wrapper`);
    assert.doesNotMatch(source, /node:crypto|function\s+stableHash|function\s+normalizeMessageIdentity/, `${type} parse_session should not duplicate shared identity code`);
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
    assert.equal(session.messages.length, Array.isArray(output.messages) ? output.messages.length : 0, `${type} message length`);
    assert.deepEqual(session.messages.map(message => message.content), (output.messages || []).map(message => message.content), `${type} message content`);
    assert.deepEqual(session.modal, output.activeModal || output.modal || null, `${type} modal`);
    assert.equal(session.parsedStatus, output.status || null, `${type} parsedStatus`);
  }
});

test('parse_session assigns stable provider-owned bubble identity to every CLI message', () => {
  for (const type of cliProviders) {
    const parseSession = require(scriptPath(type, 'parse_session.js'));
    const first = parseSession(sampleInput());
    const second = parseSession(sampleInput());

    assert.ok(first.messages.length > 0, `${type} should return sample messages`);
    for (let index = 0; index < first.messages.length; index += 1) {
      const message = first.messages[index];
      const again = second.messages[index];
      assert.equal(typeof message.providerUnitKey, 'string', `${type} message ${index} providerUnitKey`);
      assert.equal(typeof message.bubbleId, 'string', `${type} message ${index} bubbleId`);
      assert.equal(typeof message._turnKey, 'string', `${type} message ${index} _turnKey`);
      assert.equal(typeof message.bubbleState, 'string', `${type} message ${index} bubbleState`);
      assert.equal(message.providerUnitKey, again.providerUnitKey, `${type} message ${index} providerUnitKey should be stable`);
      assert.equal(message.bubbleId, again.bubbleId, `${type} message ${index} bubbleId should be stable`);
    }
  }
});

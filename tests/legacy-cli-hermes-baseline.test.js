'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const legacyProviders = [
  'aider-cli',
  'gemini-cli',
  'goose-cli',
  'github-copilot-cli',
  'opencode-cli',
];

function providerRoot(type) {
  return path.join(repoRoot, 'cli', type);
}

function loadProviderJson(type) {
  return JSON.parse(fs.readFileSync(path.join(providerRoot(type), 'provider.json'), 'utf8'));
}

function loadParseOutput(type) {
  return require(path.join(providerRoot(type), 'scripts/1.0/parse_output.js'));
}

function longCommittedHistory(count = 60) {
  return Array.from({ length: count }, (_, index) => ({
    id: `prior_${index}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    kind: 'standard',
    content: `legacy-history-${String(index).padStart(2, '0')}`,
    index,
  }));
}

test('legacy CLI providers explicitly use the Hermes-style submit and settle baseline', () => {
  for (const type of legacyProviders) {
    const provider = loadProviderJson(type);
    assert.equal(provider.submitStrategy, 'wait_for_echo', `${type} submitStrategy`);
    assert.equal(provider.timeouts?.idleFinishConfirm, 5000, `${type} idleFinishConfirm`);
    assert.equal(provider.timeouts?.statusActivityHold, 5000, `${type} statusActivityHold`);
  }
});

test('legacy CLI parsers preserve committed history beyond 50 messages', () => {
  for (const type of legacyProviders) {
    const parseOutput = loadParseOutput(type);
    const priorMessages = longCommittedHistory(60);
    const result = parseOutput({
      buffer: '',
      recentBuffer: '',
      screenText: '',
      rawBuffer: '',
      messages: priorMessages,
    });
    const contents = (result.messages || []).map(message => message.content);
    assert.equal(result.messages.length, 60, `${type} should keep all 60 committed messages`);
    assert.equal(contents[0], 'legacy-history-00', `${type} should keep the oldest committed message`);
    assert.equal(contents[59], 'legacy-history-59', `${type} should keep the newest committed message`);
  }
});

test('legacy CLI parser source does not silently clip parser-owned transcripts to the last 50 messages', () => {
  for (const type of legacyProviders) {
    const source = fs.readFileSync(path.join(providerRoot(type), 'scripts/1.0/parse_output.js'), 'utf8');
    assert.doesNotMatch(source, /slice\(-50\)|messages\.length\s*>\s*50/, `${type} parser has a hidden 50-message clip`);
  }
});

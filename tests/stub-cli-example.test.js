'use strict';

/**
 * stub-cli worked-example tests.
 *
 * Pins the out-of-box DX contract: the shipped scripts/v1 must satisfy the
 * daemon's script-entry contract (scripts.js exporting parseSession) and must
 * deterministically reproduce the fixture's declared expectations — with no
 * hand-supplied files. Fail-closed behavior for malformed input is pinned too.
 *
 * Run: node --test tests/stub-cli-example.test.js   (from adhdev-providers/)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const exampleDir = path.join(repoRoot, 'examples', 'stub-cli');
const scripts = require(path.join(exampleDir, 'scripts', 'v1', 'scripts.js'));
const manifest = JSON.parse(fs.readFileSync(path.join(exampleDir, 'provider.json'), 'utf8'));
const fixturePty = fs.readFileSync(path.join(exampleDir, 'fixtures', 'cold-start.pty'), 'utf8');
const fixtureExpected = JSON.parse(fs.readFileSync(path.join(exampleDir, 'fixtures', 'cold-start.expected.json'), 'utf8'));

function bufferUpTo(sentinel) {
  const idx = fixturePty.indexOf(sentinel);
  assert.notEqual(idx, -1, `sentinel not found in fixture: ${sentinel}`);
  return fixturePty.slice(0, idx + sentinel.length);
}

test('manifest resolves its scriptDir to the shipped scripts/v1 entry', () => {
  // The daemon probes exactly scripts.js inside compatibility[].scriptDir /
  // defaultScriptDir. All declared script dirs must exist and contain it.
  const declared = new Set([manifest.defaultScriptDir, ...manifest.compatibility.map((c) => c.scriptDir)]);
  for (const scriptDir of declared) {
    assert.ok(
      fs.existsSync(path.join(exampleDir, scriptDir, 'scripts.js')),
      `missing scripts.js in declared scriptDir: ${scriptDir}`,
    );
  }
});

test('scripts.js exports a parseSession function (runtime handler contract)', () => {
  assert.equal(typeof scripts.parseSession, 'function');
});

test('parseSession is deterministic: identical input yields identical output', () => {
  const input = { buffer: fixturePty };
  const first = scripts.parseSession(undefined, input);
  const second = scripts.parseSession(undefined, input);
  assert.deepEqual(first, second);
  assert.ok(!JSON.stringify(first).match(/\d{13}/), 'output must not embed millisecond timestamps');
});

test('parseSession reproduces the cold-start fixture anchors', () => {
  const byName = new Map(fixtureExpected.anchors.map((a) => [a.name, a]));

  const splash = scripts.parseSession(undefined, { buffer: bufferUpTo(byName.get('splash visible').untilSentinel) });
  assert.equal(splash.modal, null);
  assert.equal(splash.status, 'starting');
  assert.match(splash.messages[0].content, /Welcome to stub-agent/);

  const prompt = scripts.parseSession(undefined, { buffer: bufferUpTo(byName.get('prompt ready').untilSentinel) });
  assert.equal(prompt.status, 'idle');
  assert.equal(prompt.modal, null);

  const spinner = scripts.parseSession(undefined, { buffer: bufferUpTo(byName.get('spinner showing').untilSentinel) });
  assert.equal(spinner.status, 'generating');
  assert.equal(spinner.modal, null);
  assert.deepEqual(
    spinner.messages.map((m) => m.role),
    ['assistant', 'user'],
  );
  assert.equal(spinner.messages[1].content, 'hello world');

  const modalAnchor = byName.get('approval modal');
  const modalOut = scripts.parseSession(undefined, { buffer: bufferUpTo(modalAnchor.untilSentinel) });
  assert.equal(modalOut.status, 'waiting_approval');
  assert.deepEqual(modalOut.modal, modalAnchor.expect.parseApproval);
  // Contract §5.1: the visible transcript survives waiting_approval (no wipe).
  assert.ok(modalOut.messages.some((m) => m.role === 'user' && m.content === 'hello world'));
});

test('fail-closed: malformed input never throws and never fabricates a modal', () => {
  for (const input of [undefined, {}, { buffer: '' }, { buffer: '@@@@\n\x00\x01' }]) {
    const out = scripts.parseSession(undefined, input);
    assert.ok(out && typeof out === 'object');
    assert.ok(Array.isArray(out.messages));
    assert.equal(out.modal, null);
    assert.equal(typeof out.status, 'string');
  }
});

test('fail-closed: a question with fewer than two buttons is not a modal', () => {
  const buffer = [
    'Approve this action?',
    '',
    '  1. Yes, run it',
    '',
  ].join('\n');
  const out = scripts.parseSession(undefined, { buffer });
  assert.equal(out.modal, null);
  assert.notEqual(out.status, 'waiting_approval');
});

test('numbered lists in assistant prose are not mistaken for a modal', () => {
  const buffer = [
    'stub> explain steps',
    'Here are the steps:',
    '  1. First do this',
    '  2. Then do that',
    '  3. Finally done',
    'stub> ',
  ].join('\n');
  const out = scripts.parseSession(undefined, { buffer });
  assert.equal(out.modal, null);
  assert.equal(out.status, 'idle');
});

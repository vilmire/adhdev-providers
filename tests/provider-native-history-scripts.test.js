'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const hermesScripts = require('../cli/hermes-cli/scripts/1.0/scripts.js');
const claudeScripts = require('../cli/claude-cli/scripts/1.0/scripts.js');
const codexScripts = require('../cli/codex-cli/scripts/1.0/scripts.js');
const nativeHistory = require('../cli/_shared/native_history.js');
const hermesProvider = require('../cli/hermes-cli/provider.json');
const claudeProvider = require('../cli/claude-cli/provider.json');
const codexProvider = require('../cli/codex-cli/provider.json');

function withTempHome(fn) {
  const originalHome = process.env.HOME;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adhdev-provider-native-history-'));
  process.env.HOME = dir;
  try {
    fn(dir);
  } finally {
    process.env.HOME = originalHome;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
}

for (const [name, provider] of [
  ['hermes-cli', hermesProvider],
  ['claude-cli', claudeProvider],
  ['codex-cli', codexProvider],
]) {
  test(`${name} declares provider-owned native history scripts`, () => {
    assert.deepEqual(provider.canonicalHistory.scripts, {
      readSession: 'readNativeHistory',
      listSessions: 'listNativeHistory',
    });
  });
}

test('hermes native history script reads and lists ~/.hermes session JSON', () => withTempHome((home) => {
  const sessionId = '20260420_095128_ae3acd';
  const workspace = '/workspaces/hermes-native';
  const sourcePath = path.join(home, '.hermes', 'sessions', `session_${sessionId}.json`);
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, JSON.stringify({
    session_start: '2026-04-20T09:52:10.000Z',
    workspace,
    messages: [
      { role: 'user', content: 'hermes user', timestamp: '2026-04-20T09:52:11.000Z' },
      { role: 'assistant', content: 'hermes assistant', timestamp: '2026-04-20T09:52:12.000Z' },
      { role: 'tool', content: 'tool output', timestamp: '2026-04-20T09:52:13.000Z' },
    ],
  }), 'utf8');

  const read = hermesScripts.readNativeHistory({ historySessionId: sessionId });
  assert.equal(read.sourcePath, sourcePath);
  assert.deepEqual(read.messages.map((m) => [m.role, m.kind, m.content]), [
    ['system', 'session_start', workspace],
    ['user', 'standard', 'hermes user'],
    ['assistant', 'standard', 'hermes assistant'],
    ['assistant', 'tool', 'tool output'],
  ]);
  assert.equal(read.messages[1].workspace, workspace);

  const listed = hermesScripts.listNativeHistory({});
  assert.equal(listed.sessions[0].historySessionId, sessionId);
  assert.equal(listed.sessions[0].messageCount, 3);
  assert.equal(listed.sessions[0].workspace, workspace);
}));

test('hermes native history script resolves latest matching session by workspace before session id is known', () => withTempHome((home) => {
  const olderSessionId = '20260420_095128_old';
  const newerSessionId = '20260420_095128_new';
  const workspace = '/workspaces/hermes-workspace';
  const otherWorkspace = '/workspaces/hermes-other';
  const sessionsDir = path.join(home, '.hermes', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });

  const olderPath = path.join(sessionsDir, `session_${olderSessionId}.json`);
  const newerPath = path.join(sessionsDir, `session_${newerSessionId}.json`);
  const otherPath = path.join(sessionsDir, 'session_20260420_095128_other.json');
  fs.writeFileSync(olderPath, JSON.stringify({
    session_start: '2026-04-20T09:52:10.000Z',
    project: { root: workspace },
    messages: [{ role: 'assistant', content: 'older assistant', timestamp: '2026-04-20T09:52:12.000Z' }],
  }), 'utf8');
  fs.writeFileSync(newerPath, JSON.stringify({
    session_start: '2026-04-20T09:55:10.000Z',
    cwd: workspace,
    messages: [{ role: 'assistant', content: 'newer assistant', timestamp: '2026-04-20T09:55:12.000Z' }],
  }), 'utf8');
  fs.writeFileSync(otherPath, JSON.stringify({
    session_start: '2026-04-20T09:56:10.000Z',
    workspace: otherWorkspace,
    messages: [{ role: 'assistant', content: 'wrong workspace', timestamp: '2026-04-20T09:56:12.000Z' }],
  }), 'utf8');
  fs.utimesSync(olderPath, new Date('2026-04-20T09:52:20.000Z'), new Date('2026-04-20T09:52:20.000Z'));
  fs.utimesSync(newerPath, new Date('2026-04-20T09:55:20.000Z'), new Date('2026-04-20T09:55:20.000Z'));
  fs.utimesSync(otherPath, new Date('2026-04-20T09:56:20.000Z'), new Date('2026-04-20T09:56:20.000Z'));

  const read = hermesScripts.readNativeHistory({ workspace });
  assert.equal(read.sourcePath, newerPath);
  assert.equal(read.messages.find((m) => m.role === 'assistant')?.content, 'newer assistant');
  assert.equal(read.messages[0].historySessionId, newerSessionId);
}));

test('hermes native history script rejects explicit session reads from the wrong workspace', () => withTempHome((home) => {
  const sessionId = '20260420_095128_wrong_workspace';
  const sourcePath = path.join(home, '.hermes', 'sessions', `session_${sessionId}.json`);
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, JSON.stringify({
    workspace: '/workspaces/other',
    messages: [{ role: 'assistant', content: 'wrong workspace assistant' }],
  }), 'utf8');

  const read = hermesScripts.readNativeHistory({ historySessionId: sessionId, workspace: '/workspaces/requested' });
  assert.equal(read, null);
}));

test('claude native history script reads project JSONL with tool parts', () => withTempHome((home) => {
  const sessionId = '12345678-1234-4234-9234-1234567890ab';
  const workspace = '/workspaces/adhdev';
  const sourcePath = path.join(home, '.claude', 'projects', '-workspaces-adhdev', `${sessionId}.jsonl`);
  writeJsonl(sourcePath, [
    { type: 'user', sessionId, cwd: workspace, timestamp: '2026-04-22T08:34:55.724Z', message: { content: [{ type: 'text', text: 'claude user' }] } },
    { type: 'assistant', sessionId, cwd: workspace, timestamp: '2026-04-22T08:35:00.848Z', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'pwd' } }] } },
    { type: 'user', sessionId, cwd: workspace, timestamp: '2026-04-22T08:35:01.026Z', message: { content: [{ type: 'tool_result', content: [{ type: 'text', text: '/workspaces/adhdev' }] }] } },
  ]);

  const read = claudeScripts.readNativeHistory({ historySessionId: sessionId, workspace });
  assert.equal(read.sourcePath, sourcePath);
  assert.deepEqual(read.messages.map((m) => [m.role, m.kind, m.content]), [
    ['system', 'session_start', workspace],
    ['user', 'standard', 'claude user'],
    ['assistant', 'tool', 'Bash: pwd'],
    ['assistant', 'tool', '/workspaces/adhdev'],
  ]);

  const listed = claudeScripts.listNativeHistory({});
  assert.equal(listed.sessions[0].historySessionId, sessionId);
  assert.equal(listed.sessions[0].workspace, workspace);
}));

test('codex native history script reads rollout JSONL without viewport elision', () => withTempHome((home) => {
  const sessionId = '12345678-1234-4234-9234-1234567890ab';
  const workspace = '/workspaces/adhdev';
  const sourcePath = path.join(home, '.codex', 'sessions', '2026', '04', '29', `rollout-2026-04-29T00-27-22-${sessionId}.jsonl`);
  writeJsonl(sourcePath, [
    { type: 'session_meta', timestamp: '2026-04-29T00:27:22.000Z', payload: { id: sessionId, cwd: workspace } },
    { type: 'response_item', timestamp: '2026-04-29T00:27:23.000Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'codex user' }] } },
    { type: 'response_item', timestamp: '2026-04-29T00:27:24.000Z', payload: { type: 'function_call', name: 'shell', arguments: JSON.stringify({ command: 'printf ok' }) } },
    { type: 'response_item', timestamp: '2026-04-29T00:27:25.000Z', payload: { type: 'function_call_output', output: 'full native output not viewport folded' } },
    { type: 'response_item', timestamp: '2026-04-29T00:27:26.000Z', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'codex assistant' }] } },
  ]);

  const read = codexScripts.readNativeHistory({ historySessionId: sessionId, workspace });
  assert.equal(read.sourcePath, sourcePath);
  assert.deepEqual(read.messages.map((m) => [m.role, m.kind, m.content]), [
    ['system', 'session_start', workspace],
    ['user', 'standard', 'codex user'],
    ['assistant', 'tool', 'shell: printf ok'],
    ['assistant', 'tool', 'full native output not viewport folded'],
    ['assistant', 'standard', 'codex assistant'],
  ]);

  const listed = codexScripts.listNativeHistory({});
  assert.equal(listed.sessions[0].historySessionId, sessionId);
  assert.equal(listed.sessions[0].workspace, workspace);
}));

test('codex native history script rejects explicit session reads from the wrong workspace', () => withTempHome((home) => {
  const sessionId = '12345678-1234-4234-9234-1234567890ad';
  const workspace = '/workspaces/adhdev';
  const otherWorkspace = '/workspaces/other';
  const sourcePath = path.join(home, '.codex', 'sessions', '2026', '04', '29', `rollout-2026-04-29T00-27-22-${sessionId}.jsonl`);
  writeJsonl(sourcePath, [
    { type: 'session_meta', timestamp: '2026-04-29T00:27:22.000Z', payload: { id: sessionId, cwd: otherWorkspace } },
    { type: 'response_item', timestamp: '2026-04-29T00:27:23.000Z', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'wrong workspace assistant' }] } },
  ]);

  const read = codexScripts.readNativeHistory({ historySessionId: sessionId, workspace });
  assert.equal(read, null);
}));

test('codex native history script caches transcript path scans and parsed records between rapid polls', () => withTempHome((home) => {
  nativeHistory.__clearCodexNativeHistoryCaches();
  const sessionId = '12345678-1234-4234-9234-1234567890ac';
  const workspace = '/workspaces/adhdev-cache';
  const sourcePath = path.join(home, '.codex', 'sessions', '2026', '04', '29', `rollout-2026-04-29T00-27-22-${sessionId}.jsonl`);
  writeJsonl(sourcePath, [
    { type: 'session_meta', timestamp: '2026-04-29T00:27:22.000Z', payload: { id: sessionId, cwd: workspace } },
    { type: 'response_item', timestamp: '2026-04-29T00:27:23.000Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'first poll user' }] } },
    { type: 'response_item', timestamp: '2026-04-29T00:27:24.000Z', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'first poll assistant' }] } },
  ]);

  const first = codexScripts.readNativeHistory({ workspace });
  const second = codexScripts.readNativeHistory({ workspace });
  const stats = nativeHistory.__getCodexNativeHistoryCacheStats();

  assert.equal(first.sourcePath, sourcePath);
  assert.equal(second.sourcePath, sourcePath);
  assert.equal(stats.resolveScans, 1);
  assert.equal(stats.transcriptParses, 1);
  assert.ok(stats.resolveHits >= 1);
  assert.ok(stats.transcriptHits >= 1);
}));

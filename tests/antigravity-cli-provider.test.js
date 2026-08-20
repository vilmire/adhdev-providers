const test = require('node:test');
const assert = require('node:assert/strict');

const provider = require('../cli/antigravity-cli/provider.v1.json');

// This file used to also drive cli/antigravity-cli/scripts/1.0/{detect_status,
// parse_approval,parse_output,parse_session,scripts}.js. Those modules were
// deleted as dead code when agy migrated to SpecCliAdapter (d19fc62), after an
// earlier commit (e167871) dropped the v0 provider.json and renamed
// scripts/1.0 -> scripts/v1. Because nothing runs this directory in CI, the
// require() of the removed provider.json kept the whole file from executing
// and the breakage went unnoticed.
//
// The script-driven scenarios (trust prompts, command/file-access approvals,
// high-traffic retry, TUI redraw dedup, transcript parsing) are now owned by
// the FSM spec at cli/antigravity-cli/specs/{1.0,4.0}.json and are covered by
// the daemon-core spec suites, e.g.
// oss/packages/daemon-core/test/providers/spec/driver-antigravity-busy-idle-wedge.test.ts
// and .../cli-adapter-button-index-mismap.test.ts, which read those spec files
// directly. They are intentionally not re-implemented here: this file asserts
// the manifest contract only.

test('antigravity-cli provider manifest uses agy with echo-then-enter submission', () => {
  assert.equal(provider.type, 'antigravity-cli');
  assert.equal(provider.binary, 'agy');
  assert.equal(provider.versionCommand, 'agy --version');
  assert.equal(provider.spawn.command, 'bash');
  assert.ok(provider.spawn.args[1].includes('agy'), 'spawn args should invoke agy');
  assert.match(provider.spawn.args[1], /case "\$_agy_real" in \*\/\.\*/);
  assert.match(provider.spawn.args[1], /ln -sfn/);
  assert.equal(provider.submitStrategy, 'wait_for_echo');
  assert.equal(provider.sendKey, '\r');
  assert.equal(provider.requirePromptEchoBeforeSubmit, true);
  assert.equal(provider.approvalKeys['3'], '0\r');
  assert.ok(!provider.approvalPositiveHints.includes('skip'));
  assert.deepEqual(provider.resume?.resumeArgs, ['--continue']);
});

// v1 renamed the manifest's canonicalHistory block to nativeHistory; the
// watchPath contract itself is unchanged.
test('antigravity-cli provider declares CLI transcript logs as native history source', () => {
  assert.equal(provider.nativeHistory.format, 'antigravity-cli-transcript-jsonl');
  assert.match(provider.nativeHistory.watchPath, /antigravity-cli\/history\.jsonl/);
  assert.match(provider.nativeHistory.watchPath, /antigravity-cli\/brain\/\*\/\.system_generated\/logs\/transcript\*\.jsonl/);
  assert.match(provider.nativeHistory.watchPath, /antigravity-cli\/conversations\/\*\.pb/);
});

// Guards the modelOptions list the launch path offers for agy. Kept in the
// manifest test because SpecCliAdapter does not own model selection.
test('antigravity-cli exposes Gemini 3.7 Flash reasoning variants in modelOptions', () => {
  // modelOptions are the literal on-screen labels agy accepts via
  // modelLaunchArgs ['--model', '{{model}}'], not slugs.
  for (const expected of [
    'Gemini 3.7 Flash (High)',
    'Gemini 3.7 Flash (Medium)',
    'Gemini 3.7 Flash (Low)',
  ]) {
    assert.ok(provider.modelOptions.includes(expected), `modelOptions should include ${expected}`);
  }
});

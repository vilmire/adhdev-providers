import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// cursor-cli is a v1 declarative provider (provider.v1.json only — no legacy
// provider.json / scripts/1.0). Behavioural parsing/detection coverage lives
// in daemon-core (test/providers/sdk/cursor-cli-v1-manifest.test.ts), which
// drives THIS manifest through the TUI builders against live-captured screens.
// This file pins the manifest's launch/contract surface.

const provider = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, '../cli/cursor-cli/provider.v1.json'), 'utf8'),
)

test('cursor-cli launches via `cursor-agent --trust` (non-interactive version command)', () => {
  assert.equal(provider.binary, 'cursor-agent')
  assert.equal(provider.spawn?.command, 'cursor-agent')
  assert.deepEqual(provider.spawn?.args, ['--trust'])
  assert.equal(provider.spawn?.shell, false)
})

test('cursor-cli uses echo-wait submit and settle debounce', () => {
  assert.equal(provider.submitStrategy, 'wait_for_echo')
  assert.deepEqual(provider.timeouts, {
    idleFinishConfirm: 5000,
    statusActivityHold: 5000,
  })
})

test('cursor-cli exposes resume metadata compatible with UUID chat ids', () => {
  assert.equal(provider.resume?.supported, true)
  assert.equal(provider.resume?.sessionIdFormat, 'uuid')
  assert.deepEqual(provider.resume?.resumeSessionArgs, ['--resume', '{{id}}'])
  assert.deepEqual(provider.resume?.resumeArgs, ['--continue'])
  assert.equal(provider.resume?.stopStrategy, 'ctrl_c')
})

test('cursor-cli declares model launch args and non-empty model options', () => {
  assert.deepEqual(provider.modelLaunchArgs, ['--model', '{{model}}'])
  assert.ok(Array.isArray(provider.modelOptions) && provider.modelOptions.length > 0)
  assert.ok(provider.modelOptions.includes('auto'))
})

test('coordinator prompt injection is a daemon-owned rules .mdc — NEVER cli_arg --rules', () => {
  // Regression: cursor-agent has no --rules flag; the old cli_arg declaration
  // made every mesh coordinator launch exit code 1 immediately.
  const injection = provider.meshCoordinator?.systemPromptInjection
  assert.equal(injection?.mode, 'context_file')
  assert.equal(injection?.path, '.cursor/rules/adhdev-mesh-coordinator.mdc')
  assert.equal(injection?.owned, true)
  assert.ok(injection?.wrapper?.includes('alwaysApply: true'))
  assert.ok(injection?.wrapper?.includes('{prompt}'))
  assert.notEqual(injection?.flag, '--rules')
})

test('coordinator launch pre-approves the daemon-written MCP config via --approve-mcps', () => {
  // cursor-agent parks on the "MCP servers need to be approved" modal otherwise
  // (and its 'Applying your selection…' state can wedge the coordinator PTY).
  assert.deepEqual(provider.meshCoordinator?.launchArgs, ['--approve-mcps'])
})

test('coordinator MCP auto-import targets .cursor/mcp.json in claude_mcp_json format', () => {
  const mcp = provider.meshCoordinator?.mcpConfig
  assert.equal(mcp?.mode, 'auto_import')
  assert.equal(mcp?.format, 'claude_mcp_json')
  assert.equal(mcp?.path, '.cursor/mcp.json')
  assert.equal(mcp?.serverName, 'adhdev-mesh')
})

test('settledPrompt matches the current idle footer and rejects spinner/startup frames', () => {
  const settled = provider.tui?.settledPrompt
  const re = new RegExp(settled.regex, settled.flags)
  // v2026.08 idle footer: model label + context percent, then the path line.
  assert.ok(re.test('  Kimi K2.7 Code · 6.8%\n  /private/tmp/ws'))
  // Older builds labelled the mode instead of the model.
  assert.ok(re.test('  Auto · 7.7%\n  ~/Work/adhdev'))
  // Generating: 'Working' replaces the label line — no percent, no match.
  assert.ok(!re.test('   ⠋ Working…\n  /private/tmp/ws'))
  // Startup: model label without the context percent yet — no match.
  assert.ok(!re.test('  Kimi K2.7 Code\n  /private/tmp/ws'))
})

test('transcript chrome excludes the startup placeholder and bare model label', () => {
  const chromes = (provider.tui?.transcriptPty?.chromePatterns ?? []).map((p) => new RegExp(p.regex, p.flags || ''))
  const isChrome = (line) => chromes.some((re) => re.test(line))
  assert.ok(isChrome('  → Plan, search, build anything'))
  assert.ok(isChrome('  Kimi K2.7 Code'))
  assert.ok(isChrome('  → Add a follow-up'))
  assert.ok(isChrome('  /private/tmp/cursor-probe-ws'))
  // Real assistant prose must survive.
  assert.ok(!isChrome('  The answer is 4.'))
})

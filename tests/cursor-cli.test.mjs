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

test('settledPrompt also matches the one-line footer (path after the percent) and the files-edited form', () => {
  const settled = provider.tui?.settledPrompt
  const re = new RegExp(settled.regex, settled.flags)
  assert.ok(re.test('  Composer 2.5 · 18.5% · 2 files edited · /Users/example/Work/project · main'))
  assert.ok(re.test('  Composer 2.5 · 6.5% · 1 file edited          Run Everything\n  /tmp/ws · main'))
  assert.ok(!re.test('  Composer 2.5 · /Users/example/Work/project · main'))
})

test('spinner recognises the Composing/Editing verbs; transcript chrome drops spinner + percent footer lines', () => {
  const spinner = provider.tui.spinner.patterns.map((p) => new RegExp(p.regex, p.flags || ''))
  assert.ok(spinner.some((re) => re.test(' ⠘⠣ Composing')))
  assert.ok(spinner.some((re) => re.test(' ⠠⠜ Editing  52 tokens')))
  assert.ok(!spinner.some((re) => re.test('  The answer mentions ⠿ inline.')))
  const chromes = provider.tui.transcriptPty.chromePatterns.map((p) => new RegExp(p.regex, p.flags || ''))
  const isChrome = (l) => chromes.some((re) => re.test(l))
  assert.ok(isChrome(' ⠘⠣ Composing  5 tokens'))
  assert.ok(isChrome('  Composer 2.5 · 6.4% · 1 file edited                   Run Everything'))
  assert.ok(!isChrome('  Coverage is 40% · see the report.'))
})

test('user-turn background is the composer box colour only (diff/code backgrounds are not user turns)', () => {
  // 256-colour box (wide terminals, 2026.07-10) + truecolor box (80-col live capture); never a wildcard.
  assert.deepEqual(provider.tui.transcriptPty.userBackgroundSgr, ['48;5;233', '48;2;36;36;40'])
})

test('nativeHistory keeps a long recency window so an idle finished session still binds its transcript', () => {
  assert.equal(provider.nativeHistory.source.recent_window_ms, 86_400_000)
})

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');

const pkg = path.join(__dirname, '..', 'driver', 'browser-playwright');
const manifest = JSON.parse(fs.readFileSync(path.join(pkg, 'provider.v1.json'), 'utf8'));
const { TOOLS } = require(path.join(pkg, 'bin', 'tools.js'));
const policy = require(path.join(pkg, 'bin', 'policy.js'));
const FAKE = path.join(__dirname, 'fixtures', 'fake-playwright-mcp.js');

const TIER_TO_RISK = { read: 'read', write: 'write', commit: 'destructive' };

test('manifest actions map 1:1 onto exposed tools with the tier-derived risk', () => {
  assert.equal(manifest.actions.length, TOOLS.length);
  for (const action of manifest.actions) {
    const tool = TOOLS.find((t) => t.name === action.tool);
    assert.ok(tool, `action ${action.id} points at unexposed tool ${action.tool}`);
    assert.equal(action.risk, TIER_TO_RISK[tool.tier], `${action.id} risk`);
    assert.ok(fs.existsSync(path.join(pkg, action.inputSchema)), `${action.id} schema file`);
  }
  assert.equal(new Set(manifest.actions.map((a) => a.id)).size, manifest.actions.length);
});

test('unsafe inner tools are never exposed', () => {
  const inner = new Set(TOOLS.map((t) => t.inner));
  for (const banned of ['browser_run_code_unsafe', 'browser_evaluate', 'browser_file_upload', 'browser_drop', 'browser_close']) {
    assert.ok(!inner.has(banned), banned);
    assert.ok(!manifest.actions.some((a) => a.tool === banned), banned);
  }
  assert.ok(!JSON.stringify(manifest).includes('run_code_unsafe'));
});

test('tier model: the required capabilities exist and commit actions are the only destructive ones', () => {
  const byId = Object.fromEntries(manifest.actions.map((a) => [a.id, a.risk]));
  for (const id of ['snapshot', 'screenshot', 'console', 'network', 'tabs']) assert.equal(byId[id], 'read', id);
  for (const id of ['navigate', 'click', 'type', 'fill_form', 'tab_new', 'tab_select', 'tab_close']) assert.equal(byId[id], 'write', id);
  assert.deepEqual(Object.keys(byId).filter((id) => byId[id] === 'destructive').sort(), ['click_commit', 'dialog_accept', 'press_enter', 'type_commit']);
});

test('every input schema is closed and refuses filename', () => {
  for (const action of manifest.actions) {
    const schema = JSON.parse(fs.readFileSync(path.join(pkg, action.inputSchema), 'utf8'));
    assert.equal(schema.additionalProperties, false, action.id);
    assert.ok(!schema.properties || !('filename' in schema.properties), action.id);
  }
});

test('policy: url rules', () => {
  assert.equal(policy.checkUrl('http://localhost:3000/x'), null);
  assert.equal(policy.checkUrl('https://example.com'), null);
  assert.equal(policy.checkUrl('file:///etc/passwd'), 'scheme_not_allowed');
  assert.equal(policy.checkUrl('javascript:alert(1)'), 'scheme_not_allowed');
  assert.equal(policy.checkUrl('http://169.254.169.254/latest'), 'metadata_host_blocked');
  assert.equal(policy.checkUrl('http://metadata.google.internal/'), 'metadata_host_blocked');
  assert.equal(policy.checkUrl('nonsense'), 'invalid_url');
  const allow = policy.parseAllowedOrigins('http://localhost:3000; https://example.com');
  assert.equal(policy.checkUrl('http://localhost:3000/a', allow), null);
  assert.equal(policy.checkUrl('http://localhost:3001/a', allow), 'origin_not_allowed');
});

test('policy: commit heuristic', () => {
  const snap = '- button "Submit order" [ref=e9]\n- button "Toggle panel" [ref=e10]';
  assert.equal(policy.looksLikeCommit({ target: 'e9' }, snap), true);
  assert.equal(policy.looksLikeCommit({ target: 'e10', element: 'Toggle panel' }, snap), false);
  assert.equal(policy.looksLikeCommit({ target: 'e10', element: 'Delete account' }, snap), true);
});

function startProxy(env = {}) {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'bpw-test-'));
  const child = spawn(process.execPath, [path.join(pkg, 'bin', 'browser-server.js')], {
    env: { ...process.env, ADHDEV_DRIVER_STATE_DIR: state, ADHDEV_BROWSER_INNER_MCP: FAKE, ...env }, stdio: ['pipe', 'pipe', 'inherit'] });
  const pending = new Map();
  let id = 0;
  readline.createInterface({ input: child.stdout }).on('line', (line) => { const m = JSON.parse(line); pending.get(m.id)?.(m); });
  const rpc = (method, params) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: i, method, params })}\n`); });
  const call = async (name, args = {}) => {
    const m = await rpc('tools/call', { name, arguments: args });
    return { isError: !!m.result.isError, text: m.result.content.map((c) => c.text).join('\n') };
  };
  return { rpc, call, stop() { child.kill('SIGTERM'); fs.rmSync(state, { recursive: true, force: true }); } };
}

test('proxy: tool list is the exposed set only', async () => {
  const p = startProxy();
  try {
    await p.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    const names = (await p.rpc('tools/list')).result.tools.map((t) => t.name);
    assert.deepEqual(names.sort(), TOOLS.map((t) => t.name).sort());
    assert.ok(!names.includes('browser_run_code_unsafe'));
    const refused = await p.call('browser_run_code_unsafe', { code: 'x' });
    assert.ok(refused.isError && refused.text.startsWith('tool_not_exposed'));
  } finally { p.stop(); }
});

test('proxy: forced args, commit guard, filename refusal', async () => {
  const p = startProxy();
  try {
    await p.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    await p.call('browser_navigate', { url: 'http://localhost:3000/' });
    await p.call('browser_snapshot');
    assert.match((await p.call('browser_click', { target: 'e9', element: 'Submit order' })).text, /use_commit_action/);
    assert.equal((await p.call('browser_click', { target: 'e10', element: 'Toggle panel' })).isError, false);
    assert.match((await p.call('browser_click_commit', { target: 'e9' })).text, /called browser_click/);
    assert.match((await p.call('browser_press_key', { key: 'Enter' })).text, /use_commit_action/);
    assert.match((await p.call('browser_press_enter')).text, /"key":"Enter"/);
    assert.match((await p.call('browser_type', { target: 'e1', text: 'x', submit: true })).text, /"submit":false/);
    assert.match((await p.call('browser_type_commit', { target: 'e1', text: 'x' })).text, /"submit":true/);
    assert.match((await p.call('browser_tabs_list')).text, /"action":"list"/);
    assert.match((await p.call('browser_take_screenshot', { filename: 'a.png' })).text, /^invalid_arguments/);
  } finally { p.stop(); }
});

test('proxy: redirects to a blocked or off-list address are refused and the page is reset', async () => {
  const redirects = JSON.stringify({ 'http://a.test/r': 'http://169.254.169.254/x', 'http://a.test/o': 'http://b.test/final?token=s3cret' });
  const p = startProxy({ FAKE_REDIRECTS: redirects });
  try {
    await p.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    const blocked = await p.call('browser_navigate', { url: 'http://a.test/r' });
    assert.ok(blocked.isError && blocked.text.startsWith('metadata_host_blocked'));
    assert.match((await p.call('browser_snapshot')).text, /Page URL: about:blank/);
    const cross = await p.call('browser_navigate', { url: 'http://a.test/o' });
    assert.equal(cross.isError, false);
    assert.match(cross.text, /Redirected across origins: http:\/\/a\.test\/o -> http:\/\/b\.test\/final$/m);
    assert.ok(!/Redirected[^\n]*s3cret/.test(cross.text), 'redirect note must not echo the query string');
    assert.equal((await p.call('browser_navigate', { url: 'file:///etc/passwd' })).isError, true);
  } finally { p.stop(); }
  const strict = startProxy({ FAKE_REDIRECTS: redirects, ADHDEV_BROWSER_ALLOWED_ORIGINS: 'http://a.test' });
  try {
    await strict.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    const r = await strict.call('browser_navigate', { url: 'http://a.test/o' });
    assert.ok(r.isError && r.text.startsWith('origin_not_allowed'));
    assert.match((await strict.call('browser_snapshot')).text, /Page URL: about:blank/);
  } finally { strict.stop(); }
});

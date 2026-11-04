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
const INIT = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } };
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
  const priv = { allowPrivate: true };
  assert.equal(policy.checkUrl('http://localhost:3000/x', null, priv), null);
  assert.equal(policy.checkUrl('https://example.com'), null);
  assert.equal(policy.checkUrl('file:///etc/passwd'), 'scheme_not_allowed');
  assert.equal(policy.checkUrl('javascript:alert(1)'), 'scheme_not_allowed');
  assert.equal(policy.checkUrl('nonsense'), 'invalid_url');
  const allow = policy.parseAllowedOrigins('http://localhost:3000; https://example.com');
  assert.equal(policy.checkUrl('http://localhost:3000/a', allow), null, 'an explicitly allowed private origin is an opt-in');
  assert.equal(policy.checkUrl('http://localhost:3001/a', allow), 'origin_not_allowed');
});

test('policy: private and link-local hosts are blocked by default, metadata even with the opt-in', () => {
  const priv = { allowPrivate: true };
  for (const u of ['http://localhost:3000', 'http://app.localhost', 'http://127.0.0.1', 'http://127.1', 'http://[::1]:80', 'http://10.0.0.5',
    'http://172.20.1.1', 'http://192.168.1.2', 'http://[fd12:3456::1]', 'http://[::ffff:7f00:1]', 'http://[::ffff:10.0.0.1]', 'http://0.0.0.0']) {
    assert.equal(policy.checkUrl(u), 'private_host_blocked', u);
    assert.equal(policy.checkUrl(u, null, priv), null, `${u} with opt-in`);
  }
  for (const u of ['http://169.254.169.254/', 'https://169.254.169.254/', 'http://2852039166/', 'http://0xa9.0xfe.0xa9.0xfe/', 'http://0251.0376.0251.0376/',
    'http://[::ffff:a9fe:a9fe]/', 'http://[::ffff:169.254.169.254]/', 'http://[0:0:0:0:0:ffff:a9fe:a9fe]/', 'http://[::a9fe:a9fe]/', 'http://[64:ff9b::a9fe:a9fe]/',
    'http://[fe80::1]/', 'http://[febf::1]/', 'http://[fd00:ec2::254]/', 'http://metadata.google.internal./', 'http://100.100.100.200/', 'http://169.254.1.1:8080/x']) {
    assert.equal(policy.checkUrl(u, null, priv), 'metadata_host_blocked', u);
    assert.equal(policy.checkUrl(u, policy.parseAllowedOrigins(new URL(u).origin)), 'metadata_host_blocked', `${u} even if listed`);
  }
  assert.equal(policy.checkUrl('http://8.8.8.8'), null);
  assert.equal(policy.checkUrl('http://[2606:4700::1111]'), null);
});

test('policy: an allow-list that parses to nothing denies everything', () => {
  const warnings = [];
  const allow = policy.parseAllowedOrigins('not a url; ftp://x', (m) => warnings.push(m));
  assert.deepEqual(allow, []);
  assert.equal(warnings.length, 1);
  assert.equal(policy.checkUrl('https://example.com', allow), 'origin_not_allowed');
  assert.equal(policy.parseAllowedOrigins('  '), null);
  assert.equal(policy.parseAllowedOrigins(undefined), null);
});

test('policy: press_key allow-list is exact', () => {
  for (const k of ['Enter', 'NumpadEnter', 'Return', 'Space', ' ', '\n', '\r', 'Control+Enter', 'Shift+Enter', 'Alt+Enter', 'enter', 'ENTER', 'Enter ', ' Enter', 'Meta+a', 'F5', '']) {
    assert.equal(policy.isSafeKey(k), false, JSON.stringify(k));
  }
  for (const k of ['ArrowDown', 'Tab', 'Escape', 'a', 'Z', '7']) assert.equal(policy.isSafeKey(k), true, k);
  const schema = JSON.parse(fs.readFileSync(path.join(pkg, 'schemas', 'press_key.input.json'), 'utf8'));
  assert.deepEqual([...schema.properties.key.enum].sort(), [...policy.SAFE_KEYS].sort());
});

test('policy: commit decision comes from snapshot state and fails closed', () => {
  const snap = '- generic [ref=e1]:\n  - button "Submit order" [ref=e9]\n  - button "Toggle panel" [ref=e10]\n  - button [ref=e11]\n  - form:\n    - button "Go" [ref=e13]\n  - checkbox "Agree" [ref=e14]\n  - textbox "Name" [ref=e15]';
  const c = (ref, o = { strictWords: true }, fresh = true, s = snap) => policy.commitReason(ref, s, fresh, o);
  assert.equal(c('e9'), 'looks_like_commit');
  assert.equal(c('e10'), null);
  assert.equal(c('e11'), 'looks_like_commit', 'unnamed button');
  assert.equal(c('e13'), 'looks_like_commit', 'button inside a form');
  assert.equal(c('e15'), null);
  assert.equal(c('e14', { strictWords: false }), null, 'checkbox toggles are not commits');
  assert.equal(c('e14'), 'looks_like_commit', 'strict click on an Agree control');
  assert.equal(c('e99'), 'ref_unknown');
  assert.equal(c('e10', undefined, false), 'snapshot_required');
  assert.equal(c('e10', undefined, true, ''), 'snapshot_required');
  assert.equal(c('button[type=submit]'), 'ref_required');
  assert.equal(c(undefined), 'ref_required');
});

function startProxy(env = {}) {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'bpw-test-'));
  const child = spawn(process.execPath, [path.join(pkg, 'bin', 'browser-server.js')], {
    env: { ...process.env, ADHDEV_DRIVER_STATE_DIR: state, ADHDEV_BROWSER_INNER_MCP: FAKE, ADHDEV_BROWSER_ALLOW_PRIVATE: '1', ...env }, stdio: ['pipe', 'pipe', 'inherit'] });
  const pending = new Map();
  let id = 0;
  readline.createInterface({ input: child.stdout }).on('line', (line) => { const m = JSON.parse(line); pending.get(m.id)?.(m); });
  const rpcId = (i, method, params) => new Promise((resolve) => { pending.set(i, resolve); child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: i, method, params })}\n`); });
  const rpc = (method, params) => rpcId(++id, method, params);
  const raw = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const call = async (name, args = {}) => {
    const m = await rpc('tools/call', { name, arguments: args });
    return { isError: !!m.result.isError, text: m.result.content.map((c) => c.text).join('\n') };
  };
  return { rpc, rpcId, raw, call, stop() { child.kill('SIGTERM'); fs.rmSync(state, { recursive: true, force: true }); } };
}

test('proxy: tool list is the exposed set only', async () => {
  const p = startProxy();
  try {
    await p.rpc('initialize', INIT);
    const names = (await p.rpc('tools/list')).result.tools.map((t) => t.name);
    assert.deepEqual(names.sort(), TOOLS.map((t) => t.name).sort());
    assert.ok(!names.includes('browser_run_code_unsafe'));
    const refused = await p.call('browser_run_code_unsafe', { code: 'x' });
    assert.ok(refused.isError && refused.text.startsWith('tool_not_exposed'));
  } finally { p.stop(); }
});

test('proxy: forced args, safe keys, snapshot-driven commit guard, filename refusal', async () => {
  const p = startProxy();
  try {
    await p.rpc('initialize', INIT);
    await p.call('browser_navigate', { url: 'http://localhost:3000/' });
    assert.match((await p.call('browser_click', { target: 'e10' })).text, /^snapshot_required/, 'no snapshot yet');
    await p.call('browser_snapshot');
    assert.match((await p.call('browser_click', { target: 'e9', element: 'harmless' })).text, /^use_commit_action/, 'caller text cannot talk its way past the guard');
    assert.match((await p.call('browser_click', { target: 'e11' })).text, /^use_commit_action/);
    assert.match((await p.call('browser_click', { target: 'e99' })).text, /^ref_unknown/);
    assert.match((await p.call('browser_click', { target: 'button' })).text, /^ref_required/);
    assert.match((await p.call('browser_drag', { startTarget: 'e10', endTarget: 'e9' })).text, /^use_commit_action/);
    assert.equal((await p.call('browser_click', { target: 'e10', element: 'Delete everything' })).isError, false, 'caller-supplied text is ignored');
    assert.match((await p.call('browser_click', { target: 'e10' })).text, /^snapshot_required/, 'a click without a fresh snapshot afterwards is refused');
    await p.call('browser_snapshot');
    assert.match((await p.call('browser_click_commit', { target: 'e9' })).text, /called browser_click/);
    for (const key of ['Enter', 'Return', ' ', 'Space', '\n', 'Control+Enter', 'NumpadEnter']) {
      assert.match((await p.call('browser_press_key', { key })).text, /^use_commit_action/, JSON.stringify(key));
    }
    assert.equal((await p.call('browser_press_key', { key: 'ArrowDown' })).isError, false);
    assert.match((await p.call('browser_press_enter')).text, /"key":"Enter"/);
    assert.match((await p.call('browser_type', { target: 'e1', text: 'x', submit: true })).text, /"submit":false/);
    assert.match((await p.call('browser_type_commit', { target: 'e1', text: 'x' })).text, /"submit":true/);
    assert.match((await p.call('browser_tabs_list')).text, /"action":"list"/);
    assert.match((await p.call('browser_take_screenshot', { filename: 'a.png' })).text, /^invalid_arguments/);
  } finally { p.stop(); }
});

test('proxy: calls without an id and unknown methods are never relayed', async () => {
  const p = startProxy();
  try {
    await p.rpc('initialize', INIT);
    // A tools/call with no id would be executed by the inner server and its reply dropped; it must not reach it.
    p.raw({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'browser_run_code_unsafe', arguments: { code: 'x' } } });
    p.raw({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'browser_navigate', arguments: { url: 'http://example.com/' } } });
    p.raw({ jsonrpc: '2.0', id: null, method: 'tools/call', params: { name: 'browser_navigate', arguments: { url: 'http://example.com/' } } });
    const odd = await p.rpc('resources/read', { uri: 'file:///etc/passwd' });
    assert.equal(odd.error.code, -32601);
    const reserved = await p.rpcId('adh-1', 'tools/call', { name: 'browser_snapshot', arguments: {} });
    assert.equal(reserved.error.code, -32600);
    assert.match((await p.call('browser_snapshot')).text, /Page URL: about:blank/, 'idless navigate never ran');
  } finally { p.stop(); }
});

test('proxy: the current URL comes from the browser, not from page text', async () => {
  const redirects = JSON.stringify({ 'http://a.test/r': 'http://169.254.169.254/x', 'http://a.test/o': 'http://b.test/final?token=s3cret' });
  // Page text lies about where we are; the evaluate-based check still sees the blocked address.
  const spoof = startProxy({ FAKE_REDIRECTS: redirects, FAKE_TEXT_URL: 'http://example.com/innocent' });
  try {
    await spoof.rpc('initialize', INIT);
    const blocked = await spoof.call('browser_navigate', { url: 'http://a.test/r' });
    assert.ok(blocked.isError && blocked.text.startsWith('metadata_host_blocked'), blocked.text);
  } finally { spoof.stop(); }
  const p = startProxy({ FAKE_REDIRECTS: redirects });
  try {
    await p.rpc('initialize', INIT);
    const blocked = await p.call('browser_navigate', { url: 'http://a.test/r' });
    assert.ok(blocked.isError && blocked.text.startsWith('metadata_host_blocked'));
    assert.match((await p.call('browser_snapshot')).text, /Page URL: about:blank/);
    const cross = await p.call('browser_navigate', { url: 'http://a.test/o' });
    assert.equal(cross.isError, false);
    assert.match(cross.text, /Redirected across origins: http:\/\/a\.test\/o -> http:\/\/b\.test\/final$/m);
    assert.ok(!/Redirected[^\n]*s3cret/.test(cross.text), 'redirect note must not echo the query string');
    assert.equal((await p.call('browser_navigate', { url: 'file:///etc/passwd' })).isError, true);
    assert.equal((await p.call('browser_navigate', { url: 'http://[::ffff:a9fe:a9fe]/' })).isError, true);
  } finally { p.stop(); }
  // Unverifiable address on a navigation-capable call: fail closed.
  const blind = startProxy({ FAKE_EVAL_FAIL: '1' });
  try {
    await blind.rpc('initialize', INIT);
    const r = await blind.call('browser_navigate', { url: 'http://a.test/ok' });
    assert.ok(r.isError && r.text.startsWith('url_unverifiable'), r.text);
  } finally { blind.stop(); }
  const strict = startProxy({ FAKE_REDIRECTS: redirects, ADHDEV_BROWSER_ALLOWED_ORIGINS: 'http://a.test' });
  try {
    await strict.rpc('initialize', INIT);
    const r = await strict.call('browser_navigate', { url: 'http://a.test/o' });
    assert.ok(r.isError && r.text.startsWith('origin_not_allowed'));
  } finally { strict.stop(); }
  const none = startProxy({ ADHDEV_BROWSER_ALLOWED_ORIGINS: 'garbage' });
  try {
    await none.rpc('initialize', INIT);
    assert.ok((await none.call('browser_navigate', { url: 'http://a.test/' })).text.startsWith('origin_not_allowed'));
  } finally { none.stop(); }
});

test('proxy: private hosts need the opt-in', async () => {
  const p = startProxy({ ADHDEV_BROWSER_ALLOW_PRIVATE: '' });
  try {
    await p.rpc('initialize', INIT);
    assert.ok((await p.call('browser_navigate', { url: 'http://localhost:3000/' })).text.startsWith('private_host_blocked'));
    assert.equal((await p.call('browser_navigate', { url: 'http://example.com/' })).isError, false);
  } finally { p.stop(); }
});

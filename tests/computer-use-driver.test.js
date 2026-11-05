const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');

const pkg = path.join(__dirname, '..', 'driver', 'computer-use');
const manifest = JSON.parse(fs.readFileSync(path.join(pkg, 'provider.v1.json'), 'utf8'));
const { TOOLS, validate } = require(path.join(pkg, 'bin', 'tools.js'));
const FAKE = path.join(__dirname, 'fixtures', 'computer-use-fake-backend.js');
const INIT = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } };

function startServer(env = {}) {
  const child = spawn(process.execPath, [path.join(pkg, 'bin', 'computer-server.js')], {
    env: { ...process.env, ADHDEV_COMPUTER_BACKEND: FAKE, ...env }, stdio: ['pipe', 'pipe', 'inherit'],
  });
  const waiting = new Map();
  const unsolicited = [];
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const msg = JSON.parse(line);
    const resolve = waiting.get(msg.id);
    if (resolve) { waiting.delete(msg.id); resolve(msg); } else unsolicited.push(msg);
  });
  let seq = 0;
  return {
    child, unsolicited,
    request(method, params) {
      const id = ++seq;
      return new Promise((resolve) => {
        waiting.set(id, resolve);
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });
    },
    raw(line) { child.stdin.write(`${line}\n`); },
    call(name, args) { return this.request('tools/call', { name, arguments: args }); },
    async close() { child.stdin.end(); await new Promise((r) => child.on('exit', r)); },
  };
}

const text = (res) => res.result.content.find((c) => c.type === 'text').text;

test('manifest: grants, grant references, leases and risk tiers', () => {
  assert.deepEqual(manifest.grants.map((g) => [g.id, g.title]), [['screen', 'Screen capture'], ['input', 'Keyboard and mouse'], ['shell', 'Shell commands']]);
  for (const g of manifest.grants) assert.ok(g.description.length > 20, g.id);
  assert.equal(manifest.providerVersion, '1.0.0');
  assert.equal(manifest.publisher, 'ADHDev');
  assert.equal(manifest.compatibility.driverApi, '^1.0.0');
  const grantIds = new Set(manifest.grants.map((g) => g.id));
  const byId = Object.fromEntries(manifest.actions.map((a) => [a.id, a]));
  assert.equal(manifest.actions.length, TOOLS.length);
  assert.equal(byId.status.grant, undefined);
  assert.equal(byId.status.lease, false);
  assert.equal(byId.shell_run.grant, 'shell');
  assert.equal(byId.shell_run.lease, false);
  for (const id of ['screenshot', 'screen_info']) assert.equal(byId[id].grant, 'screen', id);
  for (const id of ['mouse_move', 'click', 'drag', 'scroll', 'type_text', 'press_key']) {
    assert.equal(byId[id].grant, 'input', id);
    assert.notEqual(byId[id].lease, false, id);
    assert.equal(byId[id].risk, 'write', id);
  }
  for (const a of manifest.actions) {
    assert.notEqual(a.risk, 'destructive', a.id);
    if (a.grant) assert.ok(grantIds.has(a.grant), a.id);
    const tool = TOOLS.find((t) => t.name === a.tool);
    assert.ok(tool, a.id);
    assert.equal(tool.grant ?? undefined, a.grant, `${a.id} tool/manifest grant agree`);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(pkg, a.inputSchema), 'utf8')), tool.inputSchema);
  }
  assert.equal(manifest.runtime.requestTimeoutMs, 330000);
  assert.ok(!manifest.runtime.env.includes('ADHDEV_COMPUTER_BACKEND'));
  assert.deepEqual(manifest.resources, [{ key: 'desktop', lease: 'session' }]);
  assert.equal(manifest.declaredAccess.desktopControl, true);
});

test('every input schema is closed', () => {
  for (const tool of TOOLS) assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
});

test('validate: ranges and types from the design', () => {
  const schema = (name) => TOOLS.find((t) => t.name === name).inputSchema;
  const bad = (name, args) => assert.ok(validate(schema(name), args), `${name} ${JSON.stringify(args)} should be rejected`);
  const good = (name, args) => assert.equal(validate(schema(name), args), null, `${name} ${JSON.stringify(args)}`);
  good('click', { x: 0, y: 32767 });
  good('click', { x: 1, y: 2, button: 'middle', count: 3 });
  bad('click', { x: 1, y: 2, count: 0 });
  bad('click', { x: 1, y: 2, count: 4 });
  bad('click', { x: -1, y: 2 });
  bad('click', { x: 1.5, y: 2 });
  bad('click', { x: '1', y: 2 });
  bad('click', { x: 1, y: 2, button: 'back' });
  bad('click', { x: 1, y: 2, extra: true });
  bad('click', { x: 1 });
  good('scroll', { x: 1, y: 1, deltaY: -100, deltaX: 100 });
  bad('scroll', { x: 1, y: 1, deltaY: 101 });
  bad('scroll', { x: 1, y: 1, deltaX: -101 });
  good('type_text', { text: 'a' });
  good('type_text', { text: '😀'.repeat(10000) });
  bad('type_text', { text: '' });
  bad('type_text', { text: 'x'.repeat(10001) });
  good('press_key', { key: 'f12', modifiers: ['cmd', 'shift'] });
  good('press_key', { key: '😀' });
  good('press_key', { key: ';' });
  bad('press_key', { key: 'f13' });
  bad('press_key', { key: 'F1' });
  bad('press_key', { key: 'ab' });
  bad('press_key', { key: ' ' });
  bad('press_key', { key: 'a', modifiers: ['ctrl', 'ctrl'] });
  bad('press_key', { key: 'a', modifiers: ['meta'] });
  good('shell_run', { command: 'ls', timeoutMs: 300000 });
  bad('shell_run', { command: 'ls', timeoutMs: 300001 });
  bad('shell_run', { command: 'ls', timeoutMs: 0 });
  bad('shell_run', { command: '' });
  bad('status', { anything: 1 });
  good('status', {});
  assert.ok(validate(schema('status'), null));
  assert.ok(validate(schema('status'), []));
});

test('server protocol with a fake backend', async () => {
  const logFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cu-test-')), 'calls.jsonl');
  const server = startServer({ FAKE_COMPUTER_LOG: logFile });
  try {
    const init = await server.request('initialize', INIT);
    assert.equal(init.result.protocolVersion, INIT.protocolVersion);
    assert.ok(init.result.capabilities.tools);
    server.raw(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
    assert.deepEqual((await server.request('ping')).result, {});
    const list = await server.request('tools/list');
    assert.deepEqual(list.result.tools.map((t) => t.name), manifest.actions.map((a) => a.tool));
    for (const t of list.result.tools) assert.equal(t.inputSchema.type, 'object');
    const unknown = await server.request('resources/list');
    assert.equal(unknown.error.code, -32601);
    server.raw('{not json');
    server.raw(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: {} }));
    // The parse error answer carries id null and arrives as unsolicited.
    await server.request('ping');
    assert.equal(server.unsolicited.length, 1);
    assert.equal(server.unsolicited[0].error.code, -32700);

    const status = JSON.parse(text(await server.call('status', {})));
    assert.equal(status.platform, 'fake');
    assert.equal(status.shell.available, true);
    assert.equal(status.input.available, false);

    const shot = await server.call('screenshot', {});
    assert.equal(shot.result.isError, undefined);
    const image = shot.result.content.find((c) => c.type === 'image');
    assert.equal(image.mimeType, 'image/png');
    assert.ok(Buffer.from(image.data, 'base64').length > 0);
    assert.deepEqual(JSON.parse(text(shot)), { width: 1, height: 1 });
    assert.deepEqual(JSON.parse(text(await server.call('screen_info', {}))).cursor, { x: 5, y: 6 });

    assert.equal(JSON.parse(text(await server.call('click', { x: 10, y: 20 }))).ok, true);
    await server.call('type_text', { text: '--rm -rf $(x) "q"\n' });
    await server.call('press_key', { key: 'a', modifiers: ['cmd'] });
    await server.call('scroll', { x: 1, y: 1, deltaY: 3 });
    await server.call('drag', { fromX: 1, fromY: 2, toX: 3, toY: 4 });
    await server.call('mouse_move', { x: 999, y: 799 });
    const calls = fs.readFileSync(logFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(calls.map((c) => c.name), ['screenshot', 'click', 'typeText', 'pressKey', 'scroll', 'drag', 'mouseMove']);
    assert.deepEqual(calls[1].args, { x: 10, y: 20, button: 'left', count: 1 });
    assert.equal(calls[2].args.text, '--rm -rf $(x) "q"\n');

    // Rejections: isError with "code: message", backend never called.
    const before = fs.readFileSync(logFile, 'utf8');
    const rejections = [
      ['click', { x: 1, y: 2, extra: 1 }], ['click', { x: 1 }], ['click', { x: 1, y: 2, count: 9 }],
      ['scroll', { x: 1, y: 1, deltaY: 500 }], ['scroll', { x: 1, y: 1 }], ['type_text', { text: '' }],
      ['click', { x: 1000, y: 0 }], ['mouse_move', { x: 0, y: 800 }], ['drag', { fromX: 0, fromY: 0, toX: 5000, toY: 0 }],
      ['nope', {}],
    ];
    for (const [name, args] of rejections) {
      const res = await server.call(name, args);
      assert.equal(res.result.isError, true, `${name} ${JSON.stringify(args)}`);
      assert.match(text(res), /^invalid_arguments: /, name);
    }
    assert.equal(fs.readFileSync(logFile, 'utf8'), before);

    const shell = await server.call('shell_run', { command: 'printf hi' });
    assert.equal(JSON.parse(text(shell)).stdout, 'hi');
  } finally {
    await server.close();
  }
});

test('backend errors surface as code: message', async () => {
  const server = startServer({ FAKE_COMPUTER_FAIL: 'permission_denied' });
  try {
    const res = await server.call('click', { x: 1, y: 2 });
    assert.equal(res.result.isError, true);
    assert.equal(text(res), 'permission_denied: fake click failure');
  } finally {
    await server.close();
  }
});

test('shell stays available when no backend module can be loaded', async () => {
  const server = startServer({ ADHDEV_COMPUTER_BACKEND: path.join(os.tmpdir(), 'cu-does-not-exist.js') });
  try {
    const res = await server.call('click', { x: 1, y: 2 });
    assert.match(text(res), /^backend_unavailable: /);
    assert.equal((await server.call('status', {})).result.isError, undefined);
    if (process.platform !== 'win32') assert.equal(JSON.parse(text(await server.call('shell_run', { command: 'echo ok' }))).stdout, 'ok\n');
  } finally {
    await server.close();
  }
});

test('desktop calls run one at a time, in request order', async () => {
  const logFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cu-test-')), 'calls.jsonl');
  const server = startServer({ FAKE_COMPUTER_LOG: logFile });
  try {
    await Promise.all([1, 2, 3, 4, 5].map((n) => server.call('click', { x: n, y: n })));
    const xs = fs.readFileSync(logFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l).args.x);
    assert.deepEqual(xs, [1, 2, 3, 4, 5]);
  } finally {
    await server.close();
  }
});

test('package has no personal paths and no npm dependencies', () => {
  assert.ok(!fs.existsSync(path.join(pkg, 'package.json')));
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  for (const file of walk(pkg)) {
    const content = fs.readFileSync(file, 'utf8');
    // Built from parts so this check does not itself look like a home path.
    const home = ['Us', 'ers'].join('');
    assert.ok(!new RegExp(`/${home}/[a-z]|C:\\\\${home}\\\\[A-Za-z]`).test(content), file);
    for (const m of content.matchAll(/require\('([^']+)'\)/g)) assert.ok(m[1].startsWith('node:') || m[1].startsWith('.'), `${file}: ${m[1]}`);
  }
});

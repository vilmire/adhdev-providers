const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');

const bin = path.join(__dirname, '..', 'driver', 'computer-use', 'bin');
const darwin = require(path.join(bin, 'backends', 'darwin.js'));
const win32 = require(path.join(bin, 'backends', 'win32.js'));
const linux = require(path.join(bin, 'backends', 'linux.js'));
const common = require(path.join(bin, 'backends', 'common.js'));

const HOSTILE = ['it\'s "quoted"', 'line1\nline2', '$(touch /tmp/pwned)', '`id`', '--', '-rf', '; rm -rf ~', '%PATH% $env:USERNAME', '한글 😀 é', "'; Stop-Process -Id 4 #"];

/** A runner that records invocations and answers from a queue or function. */
function recorder(answer = () => ({ exitCode: 0, signal: null, timedOut: false, stdout: '', stderr: '', truncated: false })) {
  const calls = [];
  const runProcess = async (file, args, options) => { calls.push({ file, args, options }); return answer(file, args, options, calls.length - 1); };
  return { calls, runProcess };
}
const done = (stdout = '', exitCode = 0, stderr = '') => ({ exitCode, signal: null, timedOut: false, stdout, stderr, truncated: false });

function makePng(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x7f)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test('common: key parsing, text splitting, png header', () => {
  assert.deepEqual(common.parseKey('enter'), { name: 'enter' });
  assert.deepEqual(common.parseKey('😀'), { char: '😀' });
  for (const bad of ['', 'ab', 'Enter', ' ', 'f13']) assert.throws(() => common.parseKey(bad), (e) => e.code === 'invalid_arguments', bad);
  assert.throws(() => common.checkModifiers(['meta']), (e) => e.code === 'invalid_arguments');
  assert.throws(() => common.checkModifiers(['ctrl', 'ctrl']), (e) => e.code === 'invalid_arguments');
  assert.deepEqual(common.splitTypedText('a\r\nb\tc'), [{ text: 'a' }, { key: 'enter' }, { text: 'b' }, { key: 'tab' }, { text: 'c' }]);
  const chunks = common.chunkText('😀'.repeat(9), 5);
  assert.ok(chunks.every((c) => c.length <= 5 && !/[\ud800-\udbff]$/.test(c)));
  assert.equal(chunks.join(''), '😀'.repeat(9));
  assert.deepEqual(common.pngSize(makePng(7, 3)), { width: 7, height: 3 });
  assert.equal(common.pngSize(Buffer.from('nope')), null);
});

test('darwin: osascript command keeps source fixed and payload in a single argv entry', () => {
  const commands = HOSTILE.map((text) => darwin.buildOsascriptCommand({ op: 'keys', steps: [{ text }] }));
  for (const [i, c] of commands.entries()) {
    assert.equal(c.file, 'osascript');
    assert.deepEqual(c.args.slice(0, 3), ['-l', 'JavaScript', '-e']);
    assert.equal(c.args[3], darwin.JXA_SOURCE, 'source never varies with input');
    assert.equal(c.args[4], '--');
    assert.equal(c.args.length, 6);
    assert.deepEqual(JSON.parse(c.args[5]).steps[0].text, HOSTILE[i]);
  }
  assert.ok(!darwin.JXA_SOURCE.includes('pwned'));
});

test('darwin: key resolution and typing steps', () => {
  assert.deepEqual(darwin.resolveKey('enter'), { keyCode: 36, modifiers: [] });
  assert.deepEqual(darwin.resolveKey('a', ['cmd']), { keyCode: 0, modifiers: ['cmd'] });
  assert.deepEqual(darwin.resolveKey('A'), { keyCode: 0, modifiers: ['shift'] });
  assert.deepEqual(darwin.resolveKey('f5'), { keyCode: 96, modifiers: [] });
  assert.deepEqual(darwin.resolveKey(';', ['ctrl']), { keyCode: 41, modifiers: ['ctrl'] });
  assert.deepEqual(darwin.resolveKey('é'), { text: 'é', modifiers: [] });
  assert.throws(() => darwin.resolveKey('é', ['cmd']), (e) => e.code === 'invalid_arguments');
  const steps = darwin.typeSteps('$(id)\n"x" --\t😀');
  assert.deepEqual(steps.filter((s) => s.keyCode).map((s) => s.keyCode), [36, 48]);
  assert.equal(steps.filter((s) => s.text).map((s) => s.text).join(''), '$(id)"x" --😀');
  assert.ok(steps.every((s) => !s.text || s.text.length <= 16));
  const long = darwin.typeSteps('x'.repeat(10000));
  assert.equal(long.length, 625);
});

test('darwin: capture and resample commands', () => {
  assert.deepEqual(darwin.buildCaptureCommand('/t/a.png'), { file: 'screencapture', args: ['-x', '-D', '1', '-t', 'png', '/t/a.png'] });
  assert.deepEqual(darwin.buildResampleCommand('/t/a.png', '/t/b.png', 1470, 956), { file: 'sips', args: ['-z', '956', '1470', '/t/a.png', '--out', '/t/b.png'] });
});

test('darwin: status reflects the permission probe', async () => {
  const probe = (info) => recorder(() => done(`${JSON.stringify({ ok: true, info })}\n`));
  let r = probe({ width: 1, height: 1, cursor: { x: 0, y: 0 }, accessibility: true, screenCapture: true });
  let status = await darwin.create({ runProcess: r.runProcess }).status();
  assert.deepEqual([status.platform, status.screen.available, status.input.available], ['darwin', true, true]);
  r = probe({ width: 1, height: 1, cursor: { x: 0, y: 0 }, accessibility: false, screenCapture: false });
  status = await darwin.create({ runProcess: r.runProcess }).status();
  assert.equal(status.screen.available, false);
  assert.match(status.screen.reason, /Screen Recording/);
  assert.match(status.input.hint, /Accessibility/);
  r = recorder(() => done('', 1, 'boom'));
  status = await darwin.create({ runProcess: r.runProcess }).status();
  assert.equal(status.input.available, false);
});

test('darwin: screenshot is refused without Screen Recording and never captures', async () => {
  const r = recorder(() => done(`${JSON.stringify({ ok: true, info: { width: 10, height: 10, cursor: { x: 0, y: 0 }, accessibility: true, screenCapture: false } })}\n`));
  await assert.rejects(darwin.create({ runProcess: r.runProcess }).screenshot(), (e) => e.code === 'permission_denied');
  assert.deepEqual(r.calls.map((c) => c.file), ['osascript']);
});

test('darwin: helper errors keep their code', async () => {
  const r = recorder(() => done(`${JSON.stringify({ ok: false, code: 'permission_denied', message: 'Accessibility permission is not granted' })}\n`));
  await assert.rejects(darwin.create({ runProcess: r.runProcess }).click({ x: 1, y: 2 }), (e) => e.code === 'permission_denied');
  const payload = JSON.parse(r.calls[0].args[5]);
  assert.deepEqual(payload, { op: 'click', x: 1, y: 2, button: 'left', count: 1 });
});

test('darwin live (read-only): JXA constructs events with the right fields without posting', { skip: process.platform !== 'darwin' }, () => {
  const dry = (payload) => {
    const c = darwin.buildOsascriptCommand({ ...payload, dry: true });
    return JSON.parse(execFileSync(c.file, c.args, { encoding: 'utf8' }));
  };
  const info = dry({ op: 'info' }).info;
  assert.ok(info.width > 0 && info.height > 0);
  const click = dry({ op: 'click', x: 10, y: 20, button: 'right', count: 2 });
  assert.deepEqual(click.events.map((e) => [e.type, e.clickState]), [[5, 0], [3, 1], [4, 1], [3, 2], [4, 2]]);
  assert.deepEqual([click.events[1].x, click.events[1].y], [10, 20]);
  const scroll = dry({ op: 'scroll', x: 5, y: 6, deltaX: 3, deltaY: -4 });
  const wheel = scroll.events.at(-1);
  assert.deepEqual([wheel.type, wheel.scrollY, wheel.scrollX], [22, 4, -3]);
  const drag = dry({ op: 'drag', fromX: 1, fromY: 2, toX: 30, toY: 40 });
  assert.deepEqual([drag.events[1].type, drag.events.at(-1).type, drag.events.at(-1).x, drag.events.at(-1).y], [1, 2, 30, 40]);
  const keys = dry({ op: 'keys', steps: [darwin.resolveKey('A', ['cmd']), ...darwin.typeSteps('é\n'), darwin.resolveKey('f5')] });
  assert.equal(keys.events[0].flags, 0x120000); // command + shift
  assert.equal(keys.events[0].keyCode, 0);
  assert.equal(keys.events.at(-1).keyCode, 96);
  assert.equal(keys.events[2].text, 'é');
  assert.equal(dry({ op: 'bogus' }).ok, false);
});

test('darwin live (read-only): unicode string survives the CGEvent round trip', { skip: process.platform !== 'darwin' }, () => {
  // Builds a keyboard event carrying the string and reads it back through NSEvent; nothing is posted.
  const script = String.raw`
    ObjC.import('CoreGraphics'); ObjC.import('AppKit');
    ObjC.bindFunction('CGEventKeyboardSetUnicodeString', ['void', ['void *', 'unsigned long', 'void *']]);
    function run(argv) {
      var data = $.NSString.alloc.initWithUTF8String(argv[0]).dataUsingEncoding(0x94000100);
      var e = $.CGEventCreateKeyboardEvent($(), 0, true);
      $.CGEventKeyboardSetUnicodeString(e, Number(data.length) / 2, data.bytes);
      return ObjC.unwrap($.NSEvent.eventWithCGEvent(e).characters);
    }`;
  for (const sample of ['aé한😀 "q" $(x)', "it's `x`"]) {
    assert.equal(execFileSync('osascript', ['-l', 'JavaScript', '-e', script, '--', sample], { encoding: 'utf8' }).replace(/\n$/, ''), sample);
  }
});

test('darwin live: sips resamples a generated PNG to exact point dimensions', { skip: process.platform !== 'darwin' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-sips-'));
  try {
    const input = path.join(dir, 'in.png');
    fs.writeFileSync(input, makePng(200, 120)); // pretend retina: 2x of 100x60
    const c = darwin.buildResampleCommand(input, path.join(dir, 'out.png'), 100, 60);
    execFileSync(c.file, c.args, { stdio: 'ignore' });
    assert.deepEqual(common.pngSize(fs.readFileSync(path.join(dir, 'out.png'))), { width: 100, height: 60 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('darwin: screenshot pipeline skips resampling when pixels already equal points', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-shot-'));
  try {
    const r = recorder((file, args) => {
      if (file === 'osascript') return done(`${JSON.stringify({ ok: true, info: { width: 40, height: 30, cursor: { x: 0, y: 0 }, accessibility: true, screenCapture: true } })}\n`);
      if (file === 'screencapture') fs.writeFileSync(args.at(-1), makePng(40, 30));
      return done();
    });
    const shot = await darwin.create({ runProcess: r.runProcess, tmpdir: dir }).screenshot();
    assert.deepEqual([shot.width, shot.height], [40, 30]);
    assert.deepEqual(r.calls.map((c) => c.file), ['osascript', 'screencapture']);
    assert.deepEqual(fs.readdirSync(dir), [], 'temp files removed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('win32 (unverified on Windows): command construction keeps script fixed and payload out of it', () => {
  for (const text of HOSTILE) {
    const c = win32.buildPowershellCommand({ op: 'keys', steps: [{ text }] });
    assert.equal(c.file, 'powershell.exe');
    assert.deepEqual(c.args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-EncodedCommand']);
    assert.equal(c.args.length, 4);
    assert.equal(Buffer.from(c.args[3], 'base64').toString('utf16le'), win32.POWERSHELL_SOURCE);
    assert.equal(JSON.parse(Buffer.from(c.input, 'base64').toString('utf8')).steps[0].text, text);
    assert.match(c.input, /^[A-Za-z0-9+/=]+$/);
    assert.ok(!c.args[3].includes(Buffer.from(text).toString('base64')) || text === '--');
  }
  const src = win32.POWERSHELL_SOURCE;
  assert.match(src, /SetProcessDPIAware/);
  assert.match(src, /GetCurrentProcess\(\)\.SessionId/);
  assert.match(src, /SendInput/);
});

test('win32: key resolution and typing steps', () => {
  assert.deepEqual(win32.resolveKey('enter'), { vk: 0x0d, ext: false, modifiers: [] });
  assert.deepEqual(win32.resolveKey('left', ['shift']), { vk: 0x25, ext: true, modifiers: [0x10] });
  assert.deepEqual(win32.resolveKey('c', ['ctrl']), { vk: 0x43, modifiers: [0x11] });
  assert.deepEqual(win32.resolveKey('C'), { vk: 0x43, modifiers: [0x10] });
  assert.deepEqual(win32.resolveKey('r', ['cmd']), { vk: 0x52, modifiers: [0x5b] });
  assert.deepEqual(win32.resolveKey('7'), { vk: 0x37, modifiers: [] });
  assert.deepEqual(win32.resolveKey('f12'), { vk: 0x7b, ext: false, modifiers: [] });
  assert.deepEqual(win32.resolveKey('한'), { text: '한', modifiers: [] });
  assert.throws(() => win32.resolveKey('한', ['ctrl']), (e) => e.code === 'invalid_arguments');
  assert.deepEqual(win32.typeSteps('a\nb'), [{ text: 'a' }, { vk: 0x0d, modifiers: [] }, { text: 'b' }]);
});

test('win32: status detects session 0, operations pass base64 payloads on stdin', async () => {
  let r = recorder(() => done('{"ok":true,"sessionId":0}\n'));
  let status = await win32.create({ runProcess: r.runProcess }).status();
  assert.deepEqual([status.session, status.screen.available, status.input.available], ['session0', false, false]);
  assert.match(status.input.reason, /session 0/);
  r = recorder(() => done('{"ok":true,"sessionId":2}\n'));
  status = await win32.create({ runProcess: r.runProcess }).status();
  assert.deepEqual([status.session, status.screen.available, status.input.available], ['console', true, true]);
  r = recorder(() => done('{"ok":false,"code":"backend_unavailable","message":"running in session 0"}\n'));
  await assert.rejects(win32.create({ runProcess: r.runProcess }).click({ x: 1, y: 2 }), (e) => e.code === 'backend_unavailable');
  assert.equal(r.calls[0].options.input, Buffer.from(JSON.stringify({ op: 'click', x: 1, y: 2, button: 'left', count: 1 })).toString('base64'));
});

test('win32: screenshot reads the file the script wrote', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-win-'));
  try {
    const r = recorder((file, args, options) => {
      const payload = JSON.parse(Buffer.from(options.input, 'base64').toString('utf8'));
      fs.writeFileSync(payload.path, makePng(20, 10));
      return done('{"ok":true,"width":20,"height":10}\n');
    });
    const shot = await win32.create({ runProcess: r.runProcess, tmpdir: dir }).screenshot();
    assert.deepEqual([shot.width, shot.height], [20, 10]);
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('linux (unverified on Linux): xdotool argv for hostile strings, text after --', () => {
  for (const text of HOSTILE) {
    const args = linux.xdo.type({ text });
    assert.deepEqual(args, ['type', '--clearmodifiers', '--delay', '8', '--', text]);
    assert.equal(args.at(-1), text);
    assert.equal(args.at(-2), '--');
  }
  assert.deepEqual(linux.xdo.move({ x: 1, y: 2 }), ['mousemove', '--sync', '1', '2']);
  assert.deepEqual(linux.xdo.click({ x: 1, y: 2, button: 'right', count: 2 }), ['mousemove', '--sync', '1', '2', 'click', '--repeat', '2', '--delay', '60', '3']);
  assert.deepEqual(linux.xdo.scroll({ x: 1, y: 2, deltaY: 3, deltaX: -2 }), ['mousemove', '--sync', '1', '2', 'click', '--repeat', '3', '5', 'click', '--repeat', '2', '6']);
  assert.deepEqual(linux.xdo.scroll({ x: 1, y: 2, deltaY: -1 }).slice(-4), ['click', '--repeat', '1', '4']);
  const drag = linux.xdo.drag({ fromX: 0, fromY: 0, toX: 80, toY: 40, button: 'left' });
  assert.deepEqual(drag.slice(0, 7), ['mousemove', '--sync', '0', '0', 'mousedown', '1', 'sleep']);
  assert.deepEqual(drag.slice(-2), ['mouseup', '1']);
  assert.deepEqual(drag.slice(-5, -2), ['mousemove', '80', '40']);
  assert.deepEqual(linux.keyArgs({ key: 'enter' }), ['key', '--clearmodifiers', '--', 'Return']);
  assert.deepEqual(linux.keyArgs({ key: 'a', modifiers: ['cmd', 'ctrl'] }), ['key', '--clearmodifiers', '--', 'super+ctrl+a']);
  assert.deepEqual(linux.keyArgs({ key: 'A' }), ['key', '--clearmodifiers', '--', 'shift+a']);
  assert.deepEqual(linux.keyArgs({ key: 'pagedown', modifiers: ['alt'] }), ['key', '--clearmodifiers', '--', 'alt+Next']);
  assert.deepEqual(linux.keyArgs({ key: ';' }), ['key', '--clearmodifiers', '--', 'semicolon']);
  assert.deepEqual(linux.keyArgs({ key: 'é' }), ['type', '--clearmodifiers', '--', 'é']);
  assert.throws(() => linux.keyArgs({ key: 'é', modifiers: ['ctrl'] }), (e) => e.code === 'invalid_arguments');
  assert.deepEqual(linux.captureCommand('maim', '/t/s.png'), { file: 'maim', args: ['--format', 'png', '/t/s.png'] });
  assert.deepEqual(linux.captureCommand('import', '/t/s.png'), { file: 'import', args: ['-window', 'root', '/t/s.png'] });
});

test('linux: status per session type and installed tools', async () => {
  const has = (...names) => (p) => names.some((n) => p === path.join('/usr/bin', n));
  const make = (env, tools) => linux.create({ env: { PATH: '/usr/bin', ...env }, exists: has(...tools), runProcess: recorder().runProcess });
  let s = await make({ XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' }, ['xdotool', 'maim']).status();
  assert.deepEqual([s.session, s.screen.available, s.input.available], ['wayland', false, false]);
  s = await make({}, ['xdotool', 'maim']).status();
  assert.deepEqual([s.session, s.screen.available, s.input.available], ['headless', false, false]);
  assert.match(s.screen.reason, /DISPLAY/);
  s = await make({ XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' }, ['xdotool', 'scrot']).status();
  assert.deepEqual([s.session, s.screen.available, s.input.available], ['x11', true, true]);
  s = await make({ DISPLAY: ':0' }, []).status();
  assert.deepEqual([s.screen.available, s.input.available], [false, false]);
  assert.match(s.input.hint, /xdotool/);
  s = await make({ DISPLAY: ':0' }, ['xdotool']).status();
  assert.deepEqual([s.screen.available, s.input.available], [false, true]);
});

test('linux: wayland and headless refuse input and capture without spawning anything', async () => {
  for (const env of [{ XDG_SESSION_TYPE: 'wayland', DISPLAY: ':0' }, {}]) {
    const r = recorder();
    const backend = linux.create({ env: { PATH: '/usr/bin', ...env }, exists: () => true, runProcess: r.runProcess });
    for (const call of [() => backend.click({ x: 1, y: 2 }), () => backend.typeText({ text: 'x' }), () => backend.screenshot(), () => backend.screenInfo()]) {
      await assert.rejects(call(), (e) => e.code === 'backend_unavailable');
    }
    assert.equal(r.calls.length, 0);
  }
});

test('linux: operations spawn xdotool with the built argv and the session environment', async () => {
  const env = { PATH: '/usr/bin', DISPLAY: ':1' };
  const r = recorder((file, args) => (args[0] === 'getdisplaygeometry' ? done('1920 1080\n') : args[0] === 'getmouselocation' ? done('X=10\nY=20\nSCREEN=0\nWINDOW=1\n') : done()));
  const backend = linux.create({ env, exists: () => true, runProcess: r.runProcess });
  await backend.typeText({ text: '$(id) -- "x"' });
  assert.equal(r.calls[0].file, 'xdotool');
  assert.deepEqual(r.calls[0].args, ['type', '--clearmodifiers', '--delay', '8', '--', '$(id) -- "x"']);
  assert.equal(r.calls[0].options.env, env);
  assert.deepEqual(await backend.screenInfo(), { width: 1920, height: 1080, cursor: { x: 10, y: 20 } });
  r.calls.length = 0;
  const failing = linux.create({ env, exists: () => true, runProcess: recorder(() => done('', 1, 'no display')).runProcess });
  await assert.rejects(failing.click({ x: 1, y: 2 }), (e) => e.code === 'command_failed' && /no display/.test(e.message));
});

test('linux: screenshot uses the first available tool and reads its file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-lin-'));
  try {
    const r = recorder((file, args) => { fs.writeFileSync(args.at(-1), makePng(16, 9)); return done(); });
    const backend = linux.create({ env: { PATH: '/usr/bin', DISPLAY: ':0' }, exists: (p) => p === '/usr/bin/scrot', runProcess: r.runProcess, tmpdir: dir });
    const shot = await backend.screenshot();
    assert.deepEqual([shot.width, shot.height], [16, 9]);
    assert.equal(r.calls[0].file, 'scrot');
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

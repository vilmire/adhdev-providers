const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const bin = path.join(__dirname, '..', 'driver', 'computer-use', 'bin');
const { shellRun, buildShellCommand, powershellScript } = require(path.join(bin, 'shell.js'));
const { runProcess } = require(path.join(bin, 'run.js'));

const posix = { skip: process.platform === 'win32' };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('shell command construction', () => {
  assert.deepEqual(buildShellCommand('echo $(id) "x"', { platform: 'linux', env: {}, fileExists: () => true }), { file: '/bin/sh', args: ['-c', 'echo $(id) "x"'] });
  assert.deepEqual(buildShellCommand('ls', { platform: 'darwin', env: { SHELL: '/bin/zsh' }, fileExists: () => true }), { file: '/bin/zsh', args: ['-lc', 'ls'] });
  assert.equal(buildShellCommand('ls', { platform: 'darwin', env: { SHELL: '/bin/zsh' }, fileExists: () => false }).file, '/bin/sh');
  assert.equal(buildShellCommand('ls', { platform: 'darwin', env: { SHELL: 'zsh' }, fileExists: () => true }).file, '/bin/sh', 'relative SHELL ignored');
  for (const command of ['Get-Date; "x"', "echo 'a'`n$(x)", '한글 😀']) {
    const c = buildShellCommand(command, { platform: 'win32' });
    assert.equal(c.file, 'powershell.exe');
    assert.deepEqual(c.args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-EncodedCommand']);
    const script = Buffer.from(c.args[3], 'base64').toString('utf16le');
    assert.equal(script, powershellScript(command));
    assert.ok(!script.includes(command), 'command text only appears base64-encoded');
    const b64 = /FromBase64String\('([^']+)'\)/.exec(script)[1];
    assert.equal(Buffer.from(b64, 'base64').toString('utf8'), command);
  }
});

test('shell: output, exit code, stderr, hostile text is data', posix, async () => {
  let r = await shellRun({ command: 'printf out; printf err >&2; exit 3' });
  assert.deepEqual([r.exitCode, r.stdout, r.stderr, r.timedOut, r.truncated], [3, 'out', 'err', false, false]);
  r = await shellRun({ command: 'printf %s "$(printf \'a b\')"' });
  assert.equal(r.stdout, 'a b');
  r = await shellRun({ command: 'echo "한글 😀 \'q\'"' });
  assert.equal(r.stdout, "한글 😀 'q'\n");
});

test('shell: default cwd is HOME, explicit cwd is honoured', posix, async () => {
  const home = fs.realpathSync(os.homedir());
  assert.equal(fs.realpathSync((await shellRun({ command: 'pwd' })).stdout.trim()), home);
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cu-cwd-')));
  try {
    assert.equal(fs.realpathSync((await shellRun({ command: 'pwd', cwd: dir })).stdout.trim()), dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('shell: missing cwd and file cwd are invalid_arguments, nothing runs', async () => {
  const calls = [];
  const spy = async (...a) => { calls.push(a); return {}; };
  await assert.rejects(shellRun({ command: 'x', cwd: path.join(os.tmpdir(), 'cu-no-such-dir-xyz') }, { runProcess: spy }), (e) => e.code === 'invalid_arguments');
  await assert.rejects(shellRun({ command: 'x', cwd: __filename }, { runProcess: spy }), (e) => e.code === 'invalid_arguments');
  await assert.rejects(shellRun({ command: 'x', timeoutMs: 300001 }, { runProcess: spy }), (e) => e.code === 'invalid_arguments');
  assert.equal(calls.length, 0);
});

test('shell: output is capped per stream and flagged truncated', posix, async () => {
  const r = await shellRun({ command: 'head -c 200000 /dev/zero | tr "\\0" a; head -c 200000 /dev/zero | tr "\\0" b >&2' });
  assert.equal(r.stdout.length, 64 * 1024);
  assert.equal(r.stderr.length, 64 * 1024);
  assert.equal(r.truncated, true);
  assert.equal(r.exitCode, 0);
});

test('shell: timeout kills the whole process tree', posix, async () => {
  const started = Date.now();
  const r = await shellRun({ command: 'sleep 30 & echo $!; sleep 30 & echo $!; wait', timeoutMs: 700 });
  assert.equal(r.timedOut, true);
  assert.ok(Date.now() - started < 10_000);
  const pids = r.stdout.trim().split('\n').map(Number);
  assert.equal(pids.length, 2);
  await sleep(300);
  for (const pid of pids) assert.equal(alive(pid), false, `grandchild ${pid} still running`);
});

test('shell: a background process holding the pipes does not hang the call', posix, async () => {
  const started = Date.now();
  const r = await shellRun({ command: 'sleep 20 >/dev/null 2>&1 & echo started; sleep 20 & echo $!' , timeoutMs: 15_000 }).catch((e) => e);
  // The foreground shell waits for nothing; the call must return once the shell exits plus the pipe grace.
  assert.ok(Date.now() - started < 5_000, 'returned promptly');
  assert.equal(r.exitCode, 0);
  for (const pid of r.stdout.trim().split('\n').slice(1).map(Number)) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
});

test('runProcess: failure to start rejects with command_failed, spawn flags are safe', async () => {
  await assert.rejects(runProcess('definitely-not-a-binary-xyz', []), (e) => e.code === 'command_failed');
  const src = fs.readFileSync(path.join(bin, 'run.js'), 'utf8');
  assert.match(src, /shell: false/);
  assert.match(src, /windowsHide: true/);
});

test('every spawn in the package sets windowsHide and no shell', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  for (const file of walk(bin).filter((f) => f.endsWith('.js'))) {
    const src = fs.readFileSync(file, 'utf8');
    const spawns = (src.match(/\bspawn\(/g) || []).length;
    const hidden = (src.match(/windowsHide: true/g) || []).length;
    assert.ok(hidden >= spawns, `${path.basename(file)}: ${spawns} spawn calls, ${hidden} windowsHide`);
    assert.ok(!/shell: true|execSync|execFile/.test(src), path.basename(file));
    for (const m of src.matchAll(/const \{([^}]*)\} = require\('node:child_process'\)/g)) assert.equal(m[1].trim(), 'spawn', path.basename(file));
  }
});

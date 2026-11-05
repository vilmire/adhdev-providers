'use strict';
// Bounded process execution shared by the shell tool and the OS backends.
// Every spawn: shell:false, windowsHide:true, hard timeout, per-stream output cap,
// and the whole process tree is killed on timeout (POSIX process group, Windows taskkill /T /F).
const { spawn } = require('node:child_process');

class DriverError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DriverError';
    this.code = code;
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 64 * 1024;
// After the direct child exits we wait this long for its pipes to close (a background
// grandchild may keep them open) before returning what was collected.
const PIPE_GRACE_MS = 250;

function killTree(child, platform = process.platform) {
  if (!child || !child.pid) return;
  try {
    if (platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' });
      killer.on('error', () => { try { child.kill('SIGKILL'); } catch { /* gone */ } });
      killer.unref();
    } else {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }
  } catch { /* already gone */ }
}

/**
 * Run `file args...` and resolve with
 * { exitCode, signal, timedOut, stdout, stderr, truncated } (strings, utf8).
 * Rejects with DriverError('command_failed') only when the process cannot be started.
 */
function runProcess(file, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const encoding = options.encoding ?? 'utf8';
  const platform = options.platform ?? process.platform;
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(file, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        shell: false,
        windowsHide: true,
        detached: platform !== 'win32', // own process group so the tree can be killed
        stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      reject(new DriverError('command_failed', `cannot start ${file}: ${error.message}`));
      return;
    }
    const out = { chunks: [], bytes: 0 };
    const err = { chunks: [], bytes: 0 };
    let truncated = false;
    let timedOut = false;
    let settled = false;
    let exit = null;
    let graceTimer = null;
    const collect = (sink) => (chunk) => {
      const room = maxBytes - sink.bytes;
      if (room <= 0) { truncated = true; return; }
      if (chunk.length > room) { sink.chunks.push(chunk.subarray(0, room)); sink.bytes += room; truncated = true; return; }
      sink.chunks.push(chunk);
      sink.bytes += chunk.length;
    };
    child.stdout.on('data', collect(out));
    child.stderr.on('data', collect(err));
    child.stdout.on('error', () => {});
    child.stderr.on('error', () => {});
    if (options.input !== undefined && child.stdin) {
      child.stdin.on('error', () => {});
      child.stdin.end(options.input);
    }
    const timer = setTimeout(() => { timedOut = true; killTree(child, platform); }, timeoutMs);
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(graceTimer);
      for (const stream of [child.stdout, child.stderr]) { try { stream.destroy(); } catch { /* closed */ } }
      resolve({
        exitCode: exit ? exit.code : null,
        signal: exit ? exit.signal : null,
        timedOut,
        stdout: Buffer.concat(out.chunks).toString(encoding),
        stderr: Buffer.concat(err.chunks).toString(encoding),
        truncated,
      });
    };
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(graceTimer);
      reject(new DriverError('command_failed', `cannot start ${file}: ${error.message}`));
    });
    child.on('exit', (code, signal) => {
      exit = { code, signal };
      graceTimer = setTimeout(finish, PIPE_GRACE_MS);
    });
    child.on('close', (code, signal) => { exit ??= { code, signal }; finish(); });
  });
}

module.exports = { DriverError, runProcess, killTree, DEFAULT_MAX_BYTES, DEFAULT_TIMEOUT_MS };

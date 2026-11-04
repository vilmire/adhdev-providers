'use strict';
// MCP stdio proxy in front of @playwright/mcp. It exposes only the tool set in
// ./tools.js, refuses URLs outside policy (before and after navigation, so a
// redirect cannot land somewhere blocked), annotates cross-origin redirects, and
// runs the browser headless with an isolated in-memory profile.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { BY_NAME, exposedToolList } = require('./tools.js');
const { parseAllowedOrigins, checkUrl, extractPageUrl, looksLikeCommit } = require('./policy.js');

const outputDir = process.env.ADHDEV_DRIVER_STATE_DIR
  || path.join(os.tmpdir(), 'adhdev-driver-browser-playwright');
fs.mkdirSync(outputDir, { recursive: true });
// The inner server writes a page-*.yml / console-*.log / screenshot per call; keep a day.
for (const name of fs.readdirSync(outputDir)) {
  if (!/^(page|console)-.*\.(yml|log|png|jpe?g|webp)$/.test(name)) continue;
  try {
    const file = path.join(outputDir, name);
    if (Date.now() - fs.statSync(file).mtimeMs > 86_400_000) fs.unlinkSync(file);
  } catch { /* best effort */ }
}
const allowedOrigins = parseAllowedOrigins(process.env.ADHDEV_BROWSER_ALLOWED_ORIGINS);
const innerBin = process.env.ADHDEV_BROWSER_INNER_MCP; // test hook: path to a node script
const innerArgs = ['--headless', '--isolated', '--block-service-workers', '--output-dir', outputDir,
  '--blocked-origins', 'http://169.254.169.254;http://metadata.google.internal;http://100.100.100.200'];

const child = innerBin
  ? spawn(process.execPath, [innerBin, ...innerArgs], { stdio: ['pipe', 'pipe', 'inherit'], cwd: outputDir })
  : spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['-y', '@playwright/mcp@0.0.83', ...innerArgs],
    { stdio: ['pipe', 'pipe', 'inherit'], cwd: outputDir, windowsHide: true });
child.on('error', (error) => { console.error(error.message); process.exit(1); });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
process.stdin.on('end', () => child.kill('SIGTERM'));

const toClient = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const toInner = (msg) => child.stdin.write(`${JSON.stringify(msg)}\n`);
const failResult = (id, code, text) => toClient({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: `${code}: ${text}` }] } });

const listIds = new Set();
const calls = new Map(); // client request id -> { def, requestedUrl }
const internal = new Map(); // proxy-originated request id -> resolve
let lastSnapshot = '';
let seq = 0;

function innerCall(name, args) {
  const id = `adh-${++seq}`;
  return new Promise((resolve) => {
    internal.set(id, resolve);
    toInner({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
  });
}

function handleClient(msg) {
  if (msg.method === 'tools/list' && msg.id !== undefined) { listIds.add(msg.id); return toInner(msg); }
  if (msg.method !== 'tools/call' || msg.id === undefined) return toInner(msg);
  const name = msg.params && msg.params.name;
  const def = BY_NAME.get(name);
  if (!def) return failResult(msg.id, 'tool_not_exposed', `${String(name).slice(0, 80)} is not available in this driver`);
  const args = { ...((msg.params && msg.params.arguments) || {}) };
  if ('filename' in args) return failResult(msg.id, 'invalid_arguments', 'filename is not accepted; results are returned inline or as artifacts');
  Object.assign(args, def.forced || {});
  if (def.rejectKeys && def.rejectKeys.includes(args.key)) return failResult(msg.id, 'use_commit_action', 'Enter can submit a form; use the press_enter action (owner approval)');
  if (def.commitGuard && looksLikeCommit(args, lastSnapshot)) {
    return failResult(msg.id, 'use_commit_action', 'This click looks like it submits, sends, pays, deletes or signs in; use the click_commit action (owner approval)');
  }
  const requestedUrl = def.urlArg && typeof args[def.urlArg] === 'string' ? args[def.urlArg] : null;
  if (def.urlArg && (requestedUrl || def.name === 'browser_navigate')) {
    const reason = checkUrl(requestedUrl || '', allowedOrigins);
    if (reason) return failResult(msg.id, reason, 'URL is not allowed by the driver network policy');
  }
  calls.set(msg.id, { def, requestedUrl });
  toInner({ ...msg, params: { name: def.inner, arguments: args } });
}

async function handleInner(msg) {
  if (msg.id !== undefined && internal.has(msg.id)) { internal.get(msg.id)(msg); internal.delete(msg.id); return; }
  if (msg.id !== undefined && listIds.delete(msg.id) && msg.result && Array.isArray(msg.result.tools)) {
    return toClient({ ...msg, result: { ...msg.result, tools: exposedToolList(msg.result.tools) } });
  }
  const call = msg.id !== undefined ? calls.get(msg.id) : undefined;
  if (!call || !msg.result || !Array.isArray(msg.result.content)) return toClient(msg);
  calls.delete(msg.id);
  const text = msg.result.content.filter((c) => c && c.type === 'text').map((c) => c.text).join('\n');
  if (call.def.remember && text) lastSnapshot = text;
  const finalUrl = extractPageUrl(text);
  if (finalUrl) {
    const reason = finalUrl.startsWith('chrome-error:') ? 'navigation_failed' : checkUrl(finalUrl, allowedOrigins);
    if (reason) {
      await innerCall('browser_navigate', { url: 'about:blank' });
      lastSnapshot = '';
      return failResult(msg.id, reason, reason === 'navigation_failed'
        ? 'The page is a browser error page (the address could not be reached or was blocked); it was reset to about:blank'
        : `The page ended up at a blocked address (${redact(finalUrl)}) after a redirect or click; it was reset to about:blank`);
    }
    if (call.requestedUrl && sameSite(call.requestedUrl) !== sameSite(finalUrl)) {
      msg.result.content.push({ type: 'text', text: `[adhdev] Redirected across origins: ${redact(call.requestedUrl)} -> ${redact(finalUrl)}` });
    }
  }
  toClient(msg);
}

function sameSite(value) { try { return new URL(value).origin; } catch { return value; } }
// Origin plus path only: query strings and fragments often hold tokens.
function redact(value) { try { const u = new URL(value); return `${u.origin}${u.pathname}`; } catch { return 'unparseable-url'; } }

const parse = (line) => { try { return JSON.parse(line); } catch { return null; } };
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  const msg = parse(line);
  if (msg) handleClient(msg); else child.stdin.write(`${line}\n`);
});
readline.createInterface({ input: child.stdout }).on('line', (line) => {
  if (!line.trim()) return;
  const msg = parse(line);
  if (msg) void handleInner(msg).catch((e) => console.error(e.message)); else process.stdout.write(`${line}\n`);
});

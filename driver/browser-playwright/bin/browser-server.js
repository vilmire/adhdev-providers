'use strict';
// MCP stdio proxy in front of @playwright/mcp. It exposes only the tool set in
// ./tools.js, relays only a fixed set of protocol methods, refuses URLs outside
// policy (before navigation, and after every call from the browser's own idea of
// the current URL, so a redirect or timer cannot land somewhere blocked), decides
// commit-looking clicks from its own snapshot state, and runs headless with an
// isolated in-memory profile.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { BY_NAME, exposedToolList, targetsOf } = require('./tools.js');
const { parseAllowedOrigins, parseAllowPrivate, checkUrl, commitReason, isSafeKey, requestBlockArgs } = require('./policy.js');

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
const allowedOrigins = parseAllowedOrigins(process.env.ADHDEV_BROWSER_ALLOWED_ORIGINS, (m) => console.error(`[browser-playwright] ${m}`));
const urlOptions = { allowPrivate: parseAllowPrivate(process.env.ADHDEV_BROWSER_ALLOW_PRIVATE) };
const innerBin = process.env.ADHDEV_BROWSER_INNER_MCP; // test hook: path to a node script
const block = requestBlockArgs({ allowPrivate: urlOptions.allowPrivate, allowedOrigins });
// An allow-list that parsed to nothing denies every request in the browser too (a never-matching origin).
const innerArgs = ['--headless', '--isolated', '--block-service-workers', '--output-dir', outputDir, '--blocked-origins', block.blocked,
  ...(block.allowed || block.denyAll ? ['--allowed-origins', block.allowed || 'http://adhdev-deny-all.invalid'] : [])];

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
const rpcError = (id, code, message) => toClient({ jsonrpc: '2.0', id, error: { code, message } });

const INTERNAL_PREFIX = 'adh-';
const listIds = new Set();
const calls = new Map(); // client request id -> { def, args, requestedUrl }
const internal = new Map(); // proxy-originated request id -> resolve
const NO_PAGE_READ = new Set(['browser_tabs_list', 'browser_console_messages', 'browser_network_requests', 'browser_network_request']);
let snapshot = '';
let fresh = false;
let seq = 0;

function innerCall(name, args) {
  const id = `${INTERNAL_PREFIX}${++seq}`;
  return new Promise((resolve) => {
    internal.set(id, resolve);
    toInner({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
  });
}

const GUARD_MESSAGES = {
  ref_required: 'Target must be a ref from a browser_snapshot (for example e12); selectors are only allowed in the commit actions',
  snapshot_required: 'Take a fresh browser_snapshot first; the driver decides whether a control commits from its own snapshot',
  ref_unknown: 'That ref is not in the latest snapshot; take a fresh browser_snapshot',
  looks_like_commit: 'This control looks like it submits, sends, pays, deletes or signs in (or cannot be identified); use the matching *_commit action (owner approval)',
};

function handleClient(msg) {
  const hasId = typeof msg.id === 'string' || typeof msg.id === 'number';
  if (typeof msg.id === 'string' && msg.id.startsWith(INTERNAL_PREFIX)) return rpcError(msg.id, -32600, 'reserved request id');
  const method = msg.method;
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') { if (!hasId) toInner(msg); return; }
  if (method === 'initialize' || method === 'ping') { if (hasId) toInner(msg); return; }
  if (method === 'tools/list') { if (!hasId) return; listIds.add(msg.id); return toInner(msg); }
  if (method !== 'tools/call') { if (hasId) rpcError(msg.id, -32601, 'method not available'); return; }
  if (!hasId) return; // a call nobody can wait for is never relayed
  const name = msg.params && msg.params.name;
  const def = BY_NAME.get(name);
  if (!def) return failResult(msg.id, 'tool_not_exposed', `${String(name).slice(0, 80)} is not available in this driver`);
  const rawArgs = msg.params.arguments;
  if (rawArgs !== undefined && (rawArgs === null || typeof rawArgs !== 'object' || Array.isArray(rawArgs))) return failResult(msg.id, 'invalid_arguments', 'arguments must be an object');
  const args = { ...(rawArgs || {}) };
  if ('filename' in args) return failResult(msg.id, 'invalid_arguments', 'filename is not accepted; results are returned inline or as artifacts');
  Object.assign(args, def.forced || {});
  if (def.safeKeysOnly && !isSafeKey(args.key)) return failResult(msg.id, 'use_commit_action', 'Only navigation and plain character keys are allowed; Enter, Space, modifier combinations and other keys can activate controls, use press_enter (owner approval)');
  if (def.noNewlines && typeof args.text === 'string' && /[\r\n\u2028\u2029]/.test(args.text)) return failResult(msg.id, 'use_commit_action', 'Line breaks can submit a form; use type_commit (owner approval) for text containing a newline');
  if (def.guard) {
    for (const target of targetsOf(def, args)) {
      const reason = commitReason(target, snapshot, fresh, { strictWords: def.guard === 'strict' });
      if (reason) return failResult(msg.id, reason === 'looks_like_commit' ? 'use_commit_action' : reason, GUARD_MESSAGES[reason]);
    }
  }
  const requestedUrl = def.urlArg && typeof args[def.urlArg] === 'string' ? args[def.urlArg] : null;
  if (def.urlArg && (requestedUrl || def.name === 'browser_navigate')) {
    const reason = checkUrl(requestedUrl || '', allowedOrigins, urlOptions);
    if (reason) return failResult(msg.id, reason, 'URL is not allowed by the driver network policy');
  }
  calls.set(msg.id, { def, args, requestedUrl });
  toInner({ ...msg, params: { name: def.inner, arguments: args } });
}

/** Snapshot text carried by a tool result: inline yaml, or the page-*.yml file it links to. */
function snapshotFrom(text) {
  const inline = /```yaml\n([\s\S]*?)\n```/.exec(text);
  if (inline) return inline[1];
  const link = /\[Snapshot\]\(\.\/(page-[A-Za-z0-9_.-]+\.yml)\)/.exec(text);
  if (!link) return null;
  try { return fs.readFileSync(path.join(outputDir, link[1]), 'utf8'); } catch { return null; }
}

/** The browser's own current URL (not page text), or null when it cannot be determined. */
async function currentUrl() {
  const reply = await innerCall('browser_evaluate', { function: '() => location.href' });
  const result = reply.result;
  if (!result || result.isError || !Array.isArray(result.content)) return null;
  const text = result.content.filter((c) => c && c.type === 'text').map((c) => c.text).join('\n');
  const match = /### Result\s*\n("(?:[^"\\]|\\.)*")/.exec(text);
  if (!match) return null;
  try { const value = JSON.parse(match[1]); return typeof value === 'string' ? value : null; } catch { return null; }
}

async function reset() {
  await innerCall('browser_navigate', { url: 'about:blank' });
  snapshot = ''; fresh = false;
}

async function handleInner(msg) {
  if (msg.id !== undefined && internal.has(msg.id)) { internal.get(msg.id)(msg); internal.delete(msg.id); return; }
  if (msg.id !== undefined && listIds.delete(msg.id) && msg.result && Array.isArray(msg.result.tools)) {
    return toClient({ ...msg, result: { ...msg.result, tools: exposedToolList(msg.result.tools) } });
  }
  const call = msg.id !== undefined ? calls.get(msg.id) : undefined;
  if (!call || !msg.result || !Array.isArray(msg.result.content)) return toClient(msg);
  calls.delete(msg.id);
  const { def } = call;
  const text = msg.result.content.filter((c) => c && c.type === 'text').map((c) => c.text).join('\n');
  if (msg.result.isError && /Executable doesn't exist|browser .* is not installed|npx playwright install/i.test(text)) {
    msg.result.content.push({ type: 'text', text: '[adhdev] No Playwright browser is installed on this machine. Ask the owner to run: npx playwright install chromium' });
  }
  // No modal detection from response text: page content can say anything. If the browser will not answer
  // (a dialog is open, the page is gone) the address is unverifiable and the call fails closed.
  if (!NO_PAGE_READ.has(def.name)) {
    const finalUrl = await currentUrl();
    if (finalUrl === null) {
      await reset();
      return failResult(msg.id, 'url_unverifiable', 'The current page address could not be verified (if a dialog is open, use dialog_dismiss or dialog_accept); the page was reset to about:blank where possible');
    }
    {
      const reason = finalUrl.startsWith('chrome-error:') ? 'navigation_failed' : checkUrl(finalUrl, allowedOrigins, urlOptions);
      if (reason) {
        await reset();
        return failResult(msg.id, reason, reason === 'navigation_failed'
          ? 'The page is a browser error page (the address could not be reached or was blocked); it was reset to about:blank'
          : `The page ended up at a blocked address (${redact(finalUrl)}) after a redirect, click or timer; it was reset to about:blank`);
      }
      if (call.requestedUrl && sameSite(call.requestedUrl) !== sameSite(finalUrl)) {
        msg.result.content.push({ type: 'text', text: `[adhdev] Redirected across origins: ${redact(call.requestedUrl)} -> ${redact(finalUrl)}` });
      }
    }
  }
  const partial = def.inner === 'browser_snapshot' && call.args.target;
  const got = partial ? null : snapshotFrom(text);
  if (got !== null) { snapshot = got; fresh = true; }
  else if (def.tier !== 'read' || partial) fresh = false;
  toClient(msg);
}

function sameSite(value) { try { return new URL(value).origin; } catch { return value; } }
// Origin plus path only: query strings and fragments often hold tokens.
function redact(value) { try { const u = new URL(value); return `${u.origin}${u.pathname}`; } catch { return 'unparseable-url'; } }

const parse = (line) => { try { return JSON.parse(line); } catch { return null; } };
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  const msg = parse(line);
  if (msg && typeof msg === 'object' && !Array.isArray(msg)) handleClient(msg);
  // Unparseable or batched input is dropped, never relayed raw.
});
readline.createInterface({ input: child.stdout }).on('line', (line) => {
  if (!line.trim()) return;
  const msg = parse(line);
  if (msg) void handleInner(msg).catch((e) => console.error(e.message)); else process.stdout.write(`${line}\n`);
});

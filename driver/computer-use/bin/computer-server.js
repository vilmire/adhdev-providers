#!/usr/bin/env node
'use strict';
// Dependency-free MCP stdio server (newline-delimited JSON-RPC) for the computer-use driver.
const path = require('node:path');
const readline = require('node:readline');
const { toolList, callTool, BY_NAME, SERIAL } = require('./tools.js');

const SERVER_INFO = { name: 'adhdev-computer-use', version: '1.0.0' };
const DEFAULT_PROTOCOL = '2025-06-18';

/** Pick the backend: the ADHDEV_COMPUTER_BACKEND test hook (a module path) or the one for this platform. */
function loadBackend(env = process.env, platform = process.platform) {
  const override = env.ADHDEV_COMPUTER_BACKEND;
  const mod = override
    ? require(path.resolve(override))
    : require(path.join(__dirname, 'backends', { darwin: 'darwin.js', win32: 'win32.js', linux: 'linux.js' }[platform] ?? 'linux.js'));
  return typeof mod.create === 'function' ? mod.create() : mod;
}

function createHandler(ctx) {
  let desktopQueue = Promise.resolve();
  const serialize = (task) => {
    const next = desktopQueue.then(task, task);
    desktopQueue = next.catch(() => {});
    return next;
  };

  /** Returns the JSON-RPC response object, or null when nothing should be sent. */
  return async function handle(msg) {
    if (msg === null || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.method !== 'string') {
      return { jsonrpc: '2.0', id: msg && msg.id !== undefined ? msg.id : null, error: { code: -32600, message: 'invalid request' } };
    }
    const hasId = typeof msg.id === 'string' || typeof msg.id === 'number';
    if (!hasId) return null; // notifications are ignored
    const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
    switch (msg.method) {
      case 'initialize': {
        const requested = msg.params && typeof msg.params.protocolVersion === 'string' ? msg.params.protocolVersion : DEFAULT_PROTOCOL;
        return reply({ protocolVersion: requested, capabilities: { tools: {} }, serverInfo: SERVER_INFO });
      }
      case 'ping':
        return reply({});
      case 'tools/list':
        return reply({ tools: toolList() });
      case 'tools/call': {
        const params = msg.params && typeof msg.params === 'object' ? msg.params : {};
        const tool = BY_NAME.get(params.name);
        const run = () => callTool(params.name, params.arguments, ctx);
        return reply(tool && SERIAL(tool) ? await serialize(run) : await run());
      }
      default:
        return { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method.slice(0, 100)}` } };
    }
  };
}

function main() {
  const ctx = { backend: null };
  let backendError = null;
  try { ctx.backend = loadBackend(); } catch (error) { backendError = error; }
  if (!ctx.backend) {
    // Still serve status and shell; desktop tools report backend_unavailable.
    const { DriverError } = require('./run.js');
    const fail = async () => { throw new DriverError('backend_unavailable', `no backend for this platform: ${backendError.message}`); };
    ctx.backend = {
      status: async () => ({ platform: process.platform, session: 'unknown', screen: { available: false, reason: 'no backend' }, input: { available: false, reason: 'no backend' }, uiTree: { available: false, reason: 'no backend' } }),
      screenshot: fail, screenInfo: fail, uiTree: fail, mouseMove: fail, click: fail, drag: fail, scroll: fail, typeText: fail, pressKey: fail,
    };
  }
  const handle = createHandler(ctx);
  const write = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);
  const pending = new Set();
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
      return;
    }
    const task = handle(msg).then((response) => { if (response) write(response); }, (error) => {
      write({ jsonrpc: '2.0', id: msg && msg.id !== undefined ? msg.id : null, error: { code: -32603, message: String(error && error.message || error).slice(0, 200) } });
    });
    pending.add(task);
    task.finally(() => pending.delete(task));
  });
  // On stdin close the process ends once in-flight calls have written their responses.
  rl.on('close', () => { Promise.allSettled([...pending]); });
}

if (require.main === module) main();

module.exports = { createHandler, loadBackend };

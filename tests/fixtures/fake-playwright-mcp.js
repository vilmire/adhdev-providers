'use strict';
// Minimal stand-in for @playwright/mcp used by the proxy tests. Newline-delimited JSON-RPC.
// Navigation lands on REDIRECTS[url] when present, so redirect handling is testable offline.
const readline = require('node:readline');
const REDIRECTS = JSON.parse(process.env.FAKE_REDIRECTS || '{}');
const names = ['browser_navigate', 'browser_navigate_back', 'browser_snapshot', 'browser_find', 'browser_take_screenshot', 'browser_console_messages',
  'browser_network_requests', 'browser_network_request', 'browser_wait_for', 'browser_tabs', 'browser_click', 'browser_hover', 'browser_drag',
  'browser_type', 'browser_fill_form', 'browser_select_option', 'browser_press_key', 'browser_resize', 'browser_handle_dialog',
  'browser_run_code_unsafe', 'browser_evaluate', 'browser_file_upload'];
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
let url = 'about:blank';
const out = (m) => process.stdout.write(`${JSON.stringify(m)}\n`);
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') return out({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '0' } } });
  if (m.method === 'tools/list') return out({ jsonrpc: '2.0', id: m.id, result: { tools: names.map((name) => ({ name, description: name,
    inputSchema: { type: 'object', properties: { url: { type: 'string' }, action: { type: 'string' }, key: { type: 'string' }, submit: { type: 'boolean' }, accept: { type: 'boolean' }, target: { type: 'string' }, element: { type: 'string' } } } })) } });
  if (m.method !== 'tools/call') return;
  const { name, arguments: args = {} } = m.params;
  if (name === 'browser_navigate' || (name === 'browser_tabs' && args.action === 'new' && args.url)) url = REDIRECTS[args.url] || args.url;
  if (name === 'browser_take_screenshot') {
    return out({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: `### Page\n- Page URL: ${url}` }, { type: 'image', mimeType: 'image/png', data: PNG }] } });
  }
  const text = name === 'browser_snapshot'
    ? `### Page\n- Page URL: ${url}\n### Snapshot\n- button "Submit order" [ref=e9]\n- button "Toggle panel" [ref=e10]`
    : `### Page\n- Page URL: ${url}\ncalled ${name} ${JSON.stringify(args)}`;
  out({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text }] } });
});

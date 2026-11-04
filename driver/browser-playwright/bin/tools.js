'use strict';
// The only tools this driver exposes. Each entry maps an exposed name to an inner
// @playwright/mcp tool, with arguments forced or hidden so one inner tool can sit
// in different approval tiers. Anything not listed (browser_run_code_unsafe,
// browser_evaluate, browser_file_upload, browser_drop, browser_close,
// browser_emulate_media) is unreachable: it is not listed and calls are refused.
//
// tier: read = no side effects on pages; write = reversible page interaction;
// commit = may submit, send, pay or delete, so the manifest marks it destructive
// and the daemon holds every call for owner approve/reject.
const TOOLS = [
  { name: 'browser_navigate', inner: 'browser_navigate', tier: 'write', urlArg: 'url' },
  { name: 'browser_navigate_back', inner: 'browser_navigate_back', tier: 'write' },
  { name: 'browser_snapshot', inner: 'browser_snapshot', tier: 'read', hide: ['filename'], remember: true },
  { name: 'browser_find', inner: 'browser_find', tier: 'read', hide: ['filename'] },
  { name: 'browser_take_screenshot', inner: 'browser_take_screenshot', tier: 'read', hide: ['filename'] },
  { name: 'browser_console_messages', inner: 'browser_console_messages', tier: 'read', hide: ['filename'] },
  { name: 'browser_network_requests', inner: 'browser_network_requests', tier: 'read', hide: ['filename'] },
  { name: 'browser_network_request', inner: 'browser_network_request', tier: 'read', hide: ['filename'] },
  { name: 'browser_wait_for', inner: 'browser_wait_for', tier: 'read' },
  { name: 'browser_tabs_list', inner: 'browser_tabs', tier: 'read', forced: { action: 'list' }, hide: ['action', 'index', 'url'] },
  { name: 'browser_tab_new', inner: 'browser_tabs', tier: 'write', forced: { action: 'new' }, hide: ['action', 'index'], urlArg: 'url' },
  { name: 'browser_tab_select', inner: 'browser_tabs', tier: 'write', forced: { action: 'select' }, hide: ['action', 'url'] },
  { name: 'browser_tab_close', inner: 'browser_tabs', tier: 'write', forced: { action: 'close' }, hide: ['action', 'url'] },
  { name: 'browser_click', inner: 'browser_click', tier: 'write', commitGuard: true },
  { name: 'browser_hover', inner: 'browser_hover', tier: 'write' },
  { name: 'browser_drag', inner: 'browser_drag', tier: 'write' },
  { name: 'browser_type', inner: 'browser_type', tier: 'write', forced: { submit: false }, hide: ['submit'] },
  { name: 'browser_fill_form', inner: 'browser_fill_form', tier: 'write' },
  { name: 'browser_select_option', inner: 'browser_select_option', tier: 'write' },
  { name: 'browser_press_key', inner: 'browser_press_key', tier: 'write', rejectKeys: ['Enter', 'NumpadEnter'] },
  { name: 'browser_resize', inner: 'browser_resize', tier: 'write' },
  { name: 'browser_dialog_dismiss', inner: 'browser_handle_dialog', tier: 'write', forced: { accept: false }, hide: ['accept'] },
  { name: 'browser_click_commit', inner: 'browser_click', tier: 'commit' },
  { name: 'browser_type_commit', inner: 'browser_type', tier: 'commit', forced: { submit: true }, hide: ['submit'] },
  { name: 'browser_press_enter', inner: 'browser_press_key', tier: 'commit', forced: { key: 'Enter' }, hide: ['key'] },
  { name: 'browser_dialog_accept', inner: 'browser_handle_dialog', tier: 'commit', forced: { accept: true }, hide: ['accept'] },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

function exposedToolList(innerTools) {
  const byInner = new Map(innerTools.map((t) => [t.name, t]));
  const out = [];
  for (const def of TOOLS) {
    const inner = byInner.get(def.inner);
    if (!inner) continue;
    const schema = JSON.parse(JSON.stringify(inner.inputSchema || { type: 'object', properties: {} }));
    for (const key of def.hide || []) {
      if (schema.properties) delete schema.properties[key];
      if (Array.isArray(schema.required)) schema.required = schema.required.filter((k) => k !== key);
    }
    if (Array.isArray(schema.required) && schema.required.length === 0) delete schema.required;
    out.push({
      name: def.name,
      description: `[${def.tier}] ${inner.description || def.inner}`,
      inputSchema: schema,
      annotations: { readOnlyHint: def.tier === 'read', destructiveHint: def.tier === 'commit' },
    });
  }
  return out;
}

module.exports = { TOOLS, BY_NAME, exposedToolList };

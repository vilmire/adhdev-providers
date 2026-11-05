'use strict';
// Pure helpers shared by the OS backends: key resolution, text chunking, PNG header, path lookup.
const fs = require('node:fs');
const path = require('node:path');
const { DriverError } = require('../run.js');

const NAMED_KEYS = new Set(['enter', 'tab', 'escape', 'backspace', 'delete', 'space', 'up', 'down', 'left', 'right',
  'home', 'end', 'pageup', 'pagedown', ...Array.from({ length: 12 }, (_, i) => `f${i + 1}`)]);
const MODIFIERS = ['cmd', 'ctrl', 'alt', 'shift'];

/** Classify a key argument: { name } for a named key, { char } for a single character. */
function parseKey(key) {
  if (typeof key !== 'string' || key.length === 0) throw new DriverError('invalid_arguments', 'key is required');
  if (NAMED_KEYS.has(key)) return { name: key };
  const chars = Array.from(key);
  if (chars.length === 1 && !/\s/u.test(key)) return { char: key };
  throw new DriverError('invalid_arguments', `unknown key: ${key}`);
}

function checkModifiers(modifiers) {
  const list = modifiers ?? [];
  if (!Array.isArray(list) || list.some((m) => !MODIFIERS.includes(m)) || new Set(list).size !== list.length) {
    throw new DriverError('invalid_arguments', 'modifiers must be unique values of cmd, ctrl, alt, shift');
  }
  return list;
}

/**
 * Split text into typing items: { text } runs and { key: 'enter' | 'tab' } for line breaks and tabs.
 * "\r\n" counts as one line break. Runs are cut to at most `max` UTF-16 units (surrogate pairs stay whole).
 */
function splitTypedText(text, max = Infinity) {
  const items = [];
  let run = '';
  const flush = () => { for (const part of chunkText(run, max)) items.push({ text: part }); run = ''; };
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (ch === '\r' && chars[i + 1] === '\n') continue;
    if (ch === '\n' || ch === '\r') { flush(); items.push({ key: 'enter' }); continue; }
    if (ch === '\t') { flush(); items.push({ key: 'tab' }); continue; }
    run += ch;
  }
  flush();
  return items;
}

/** Split text into runs of at most `max` UTF-16 units without cutting a surrogate pair. */
function chunkText(text, max) {
  const out = [];
  let current = '';
  for (const ch of text) {
    if (current.length + ch.length > max) { out.push(current); current = ''; }
    current += ch;
  }
  if (current) out.push(current);
  return out;
}

/** Read width and height from a PNG header; null when it is not a PNG. */
function pngSize(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 24) return null;
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** True when `name` is an executable file in one of the PATH entries of `env`. */
function findOnPath(name, env = process.env, platform = process.platform, exists = fs.existsSync) {
  const sep = platform === 'win32' ? ';' : ':';
  for (const dir of String(env.PATH ?? env.Path ?? '').split(sep)) {
    if (dir && exists(path.join(dir, name))) return path.join(dir, name);
  }
  return null;
}

/** Lines of text for the final JSON object a helper script printed. */
function parseLastJson(stdout) {
  const lines = String(stdout).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].startsWith('{')) {
      try { return JSON.parse(lines[i]); } catch { /* keep looking */ }
    }
  }
  return null;
}

// ---- ui_tree result shaping (pure; shared by every backend and the tool) ----
const UI_TEXT_MAX = 200;
const UI_ROLE_MAX = 60;
// The daemon inlines at most 64,000 characters of tool result text; stay clearly below it.
const UI_RESULT_MAX_CHARS = 60_000;
const SECURE_ROLES = new Set(['AXSecureTextField']);

/** Cut to at most `max` code points (never splits a surrogate pair). */
function cutText(value, max = UI_TEXT_MAX) {
  if (typeof value !== 'string') return undefined;
  const chars = Array.from(value);
  return chars.length > max ? chars.slice(0, max).join('') : value;
}

const finite = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * Normalize one raw backend node, or return null when it must be dropped.
 * Raw nodes: { depth, role, subrole?, name?, value?, x?, y?, width?, height?, enabled?, focused?, secure? }.
 * A password field keeps role and geometry but never a value, whatever the backend sent.
 */
function normalizeUiNode(raw) {
  if (raw === null || typeof raw !== 'object' || !Number.isInteger(raw.depth) || raw.depth < 0) return null;
  const role = cutText(typeof raw.role === 'string' && raw.role ? raw.role : 'unknown', UI_ROLE_MAX);
  const secure = raw.secure === true || SECURE_ROLES.has(raw.role) || SECURE_ROLES.has(raw.subrole);
  const name = cutText(raw.name);
  const hasPosition = finite(raw.x) && finite(raw.y) && finite(raw.width) && finite(raw.height);
  if (!hasPosition && !name) return null;
  const node = { depth: raw.depth, role };
  if (name) node.name = name;
  if (!secure) {
    const value = cutText(raw.value);
    if (value) node.value = value;
  }
  if (hasPosition) {
    node.x = Math.round(raw.x);
    node.y = Math.round(raw.y);
    node.width = Math.max(0, Math.round(raw.width));
    node.height = Math.max(0, Math.round(raw.height));
  }
  if (typeof raw.enabled === 'boolean') node.enabled = raw.enabled;
  if (typeof raw.focused === 'boolean') node.focused = raw.focused;
  return node;
}

/**
 * Turn a backend tree ({ app, window, truncated?, nodes }) into the tool result
 * { app, window, truncated, nodeCount, nodes }, enforcing maxDepth, maxNodes and the serialized size cap.
 */
function buildUiTreeResult(raw, { maxDepth = 8, maxNodes = 300 } = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  let truncated = source.truncated === true;
  const result = { app: cutText(String(source.app ?? '')) ?? '', window: cutText(String(source.window ?? '')) ?? '', truncated, nodeCount: 0, nodes: [] };
  let size = JSON.stringify({ ...result, truncated: true, nodeCount: maxNodes }).length;
  for (const entry of Array.isArray(source.nodes) ? source.nodes : []) {
    const node = normalizeUiNode(entry);
    if (!node) continue;
    if (node.depth > maxDepth) { truncated = true; continue; }
    if (result.nodes.length >= maxNodes) { truncated = true; break; }
    const added = JSON.stringify(node).length + 1;
    if (size + added > UI_RESULT_MAX_CHARS) { truncated = true; break; }
    size += added;
    result.nodes.push(node);
  }
  result.truncated = truncated;
  result.nodeCount = result.nodes.length;
  return result;
}

module.exports = { NAMED_KEYS, MODIFIERS, parseKey, checkModifiers, chunkText, splitTypedText, pngSize, findOnPath, parseLastJson, cutText, normalizeUiNode, buildUiTreeResult, UI_TEXT_MAX, UI_RESULT_MAX_CHARS };

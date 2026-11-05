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

module.exports = { NAMED_KEYS, MODIFIERS, parseKey, checkModifiers, chunkText, splitTypedText, pngSize, findOnPath, parseLastJson };

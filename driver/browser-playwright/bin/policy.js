'use strict';
// Pure policy helpers for the browser driver proxy. No I/O, so the rules are
// unit-testable without a browser.
const net = require('node:net');

const LINK_LOCAL_OR_METADATA_NAMES = new Set(['metadata.google.internal', 'metadata', 'instance-data']);
const ACTIVATING_ROLES = new Set(['button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'switch', 'option', 'treeitem']);
const COMMIT_WORDS = /\b(submit|buy|purchase|pay|checkout|check out|place order|order now|confirm|delete|remove|erase|destroy|send|post|publish|sign ?up|sign ?in|log ?in|log ?out|sign ?out|subscribe|unsubscribe|donate|transfer|withdraw|save|apply|accept|agree|approve|reject|finish|upload|import|install|authorize|allow|grant|revoke)\b/i;

/**
 * Keys a worker may press without owner approval. Anything that can activate a
 * focused control (Enter, Return, Space, modifier combos, control characters) is
 * absent on purpose: matching is exact, there is no denylist to bypass.
 */
const SAFE_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Escape', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown',
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''),
]);
const isSafeKey = (key) => typeof key === 'string' && SAFE_KEYS.has(key);

/** Semicolon-separated origins. null = unset (no allow-list); [] = set but unusable, which denies everything. */
function parseAllowedOrigins(value, warn) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const out = [];
  for (const part of value.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    try {
      const url = new URL(trimmed);
      if (url.protocol === 'http:' || url.protocol === 'https:') out.push(url.origin);
    } catch { /* counted below */ }
  }
  if (!out.length && warn) warn('ADHDEV_BROWSER_ALLOWED_ORIGINS is set but contains no valid http(s) origin; every URL will be denied');
  return out;
}

const parseAllowPrivate = (value) => value === '1' || value === 'true';

function expandIPv6(host) {
  let h = host.toLowerCase();
  const zone = h.indexOf('%');
  if (zone >= 0) h = h.slice(0, zone);
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  if (dotted) {
    const p = dotted[1].split('.').map(Number);
    if (p.some((n) => n > 255)) return null;
    h = h.slice(0, -dotted[1].length) + ((p[0] << 8) | p[1]).toString(16) + ':' + ((p[2] << 8) | p[3]).toString(16);
  }
  const halves = h.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...(halves.length === 2 ? Array(missing).fill('0') : []), ...tail].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

function classifyIPv4(a, b, c, d) {
  if (a === 169 && b === 254) return 'metadata';
  if (a === 100 && b === 100 && c === 100 && d === 200) return 'metadata';
  if (a === 0 || a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return 'private';
  return null;
}

/** 'metadata' = link-local or cloud metadata (never reachable); 'private' = loopback/RFC1918/ULA (opt-in); null = public or a name. */
function classifyHost(hostname) {
  let host = hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (LINK_LOCAL_OR_METADATA_NAMES.has(host)) return 'metadata';
  if (host === 'localhost' || host.endsWith('.localhost')) return 'private';
  if (net.isIPv4(host)) return classifyIPv4(...host.split('.').map(Number));
  if (host.includes(':')) {
    const g = expandIPv6(host);
    if (!g) return 'metadata'; // unparseable literal: fail closed
    const zeroTo = (n) => g.slice(0, n).every((x) => x === 0);
    const v4 = (hi, lo) => classifyIPv4(hi >> 8, hi & 255, lo >> 8, lo & 255);
    if (zeroTo(5) && g[5] === 0xffff) return v4(g[6], g[7]); // ::ffff:a.b.c.d
    if (zeroTo(6) && (g[6] || g[7]) && !(g[6] === 0 && g[7] === 1)) return v4(g[6], g[7]); // ::a.b.c.d (compatible)
    if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return v4(g[6], g[7]); // NAT64
    if (g[0] === 0x2002) return v4(g[1], g[2]); // 6to4
    if ((g[0] & 0xffc0) === 0xfe80) return 'metadata'; // fe80::/10
    if (g[0] === 0xfd00 && g[1] === 0x0ec2) return 'metadata'; // AWS IPv6 IMDS
    if (zeroTo(8) || (zeroTo(7) && g[7] === 1)) return 'private';
    if ((g[0] & 0xfe00) === 0xfc00) return 'private'; // fc00::/7
  }
  return null;
}

/** Returns null when the URL may be visited, otherwise a short reason code. about:blank is the reset target. */
function checkUrl(value, allowedOrigins, options = {}) {
  if (value === 'about:blank') return null;
  let url;
  try { url = new URL(value); } catch { return 'invalid_url'; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'scheme_not_allowed';
  const kind = classifyHost(url.hostname);
  if (kind === 'metadata') return 'metadata_host_blocked';
  const listed = !!allowedOrigins && allowedOrigins.includes(url.origin);
  if (allowedOrigins && !listed) return 'origin_not_allowed';
  if (kind === 'private' && !options.allowPrivate && !listed) return 'private_host_blocked';
  return null;
}

/** Parse one `[ref=eN]` line of a Playwright aria snapshot: role, accessible name, and ancestor roles. */
function describeRef(snapshot, ref) {
  const lines = snapshot.split('\n');
  const index = lines.findIndex((l) => l.includes(`[ref=${ref}]`));
  if (index < 0) return null;
  const indentOf = (l) => l.length - l.trimStart().length;
  const parse = (l) => {
    const m = /^\s*-\s+([\w-]+)(?:\s+"((?:[^"\\]|\\.)*)")?/.exec(l);
    return m ? { role: m[1], name: m[2] || '' } : { role: '', name: '' };
  };
  const self = parse(lines[index]);
  const ancestors = [];
  let depth = indentOf(lines[index]);
  for (let i = index - 1; i >= 0 && depth > 0; i--) {
    if (indentOf(lines[i]) < depth && lines[i].trim()) { ancestors.push(parse(lines[i]).role); depth = indentOf(lines[i]); }
  }
  return { ...self, ancestors };
}

const REF = /^(f\d+)?e\d+$/;

/**
 * Decide from server-held snapshot state only (never caller-supplied text) whether
 * activating `ref` may commit something. Returns null (safe), or a reason string.
 * Fails closed: no fresh snapshot, a selector instead of a ref, or an unknown ref all refuse.
 */
function commitReason(ref, snapshot, fresh, { strictWords }) {
  if (typeof ref !== 'string' || !REF.test(ref)) return 'ref_required';
  if (!snapshot || !fresh) return 'snapshot_required';
  const info = describeRef(snapshot, ref);
  if (!info) return 'ref_unknown';
  const activating = ACTIVATING_ROLES.has(info.role);
  if (activating && (!info.name.trim() || info.ancestors.includes('form'))) return 'looks_like_commit';
  if ((activating || strictWords) && COMMIT_WORDS.test(info.name)) return 'looks_like_commit';
  return null;
}

module.exports = { parseAllowedOrigins, parseAllowPrivate, checkUrl, classifyHost, commitReason, describeRef, isSafeKey, SAFE_KEYS };

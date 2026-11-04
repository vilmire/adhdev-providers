'use strict';
// Pure policy helpers for the browser driver proxy. No I/O, so the redirect and
// commit-guard rules are unit-testable without a browser.

const METADATA_HOSTS = new Set(['metadata.google.internal', 'metadata', '100.100.100.200', 'fd00:ec2::254', '[fd00:ec2::254]']);
const COMMIT_WORDS = /\b(submit|buy|purchase|pay|checkout|check out|place order|order now|confirm|delete|remove|erase|destroy|send|post|publish|sign ?up|sign ?in|log ?in|subscribe|donate|transfer|withdraw|unsubscribe|save changes|apply|accept|agree|approve)\b/i;

/** Semicolon-separated origins from ADHDEV_BROWSER_ALLOWED_ORIGINS; null = no allow-list. */
function parseAllowedOrigins(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const out = [];
  for (const part of value.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    try { out.push(new URL(trimmed).origin); } catch { /* ignore malformed entries */ }
  }
  return out.length ? out : null;
}

function isMetadataHost(hostname) {
  const host = hostname.toLowerCase();
  if (METADATA_HOSTS.has(host)) return true;
  return /^169\.254\.\d{1,3}\.\d{1,3}$/.test(host);
}

/** Returns null when the URL may be visited, otherwise a short reason code. about:blank is the reset target. */
function checkUrl(value, allowedOrigins) {
  if (value === 'about:blank') return null;
  let url;
  try { url = new URL(value); } catch { return 'invalid_url'; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'scheme_not_allowed';
  if (isMetadataHost(url.hostname)) return 'metadata_host_blocked';
  if (allowedOrigins && !allowedOrigins.includes(url.origin)) return 'origin_not_allowed';
  return null;
}

function extractPageUrl(text) {
  const match = /Page URL:\s*(\S+)/.exec(text);
  return match ? match[1] : null;
}

/** True when a click looks like it commits something (submit, pay, delete, send, log in...). */
function looksLikeCommit(args, lastSnapshot) {
  const target = typeof args.target === 'string' ? args.target : '';
  const element = typeof args.element === 'string' ? args.element : '';
  let line = '';
  const ref = /^e\d+$/.test(target) ? target : null;
  if (ref && typeof lastSnapshot === 'string') {
    const hit = lastSnapshot.split('\n').find((l) => l.includes(`[ref=${ref}]`));
    if (hit) line = hit;
  }
  if (/\[type=submit\]|type="submit"/i.test(line)) return true;
  return COMMIT_WORDS.test(`${element} ${line} ${ref ? '' : target}`);
}

module.exports = { parseAllowedOrigins, checkUrl, extractPageUrl, looksLikeCommit, isMetadataHost };

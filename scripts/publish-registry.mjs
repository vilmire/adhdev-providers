#!/usr/bin/env node
/**
 * publish-registry.mjs - CI publisher used by .github/workflows/publish-registry.yml.
 *
 * Publishes every provider artifact in cli/ ide/ extension/ to the provider
 * registry on the `preview` channel. `stable` is promotion-only server-side
 * (REGISTRY_STABLE_PUBLISH_FORBIDDEN), so this script never posts to stable.
 *
 * Targets: prod and preview environments are separate registries (own DB and
 * keys). Targets come from ADHDEV_REGISTRY_TARGETS (JSON array of
 * {name, url, tokenEnv}) or, when unset, the two defaults below. A target whose
 * token env var is empty is SKIPPED with a visible warning; if every target is
 * skipped the run fails.
 *
 * Exit code is non-zero when any publish is rejected. Only 201 (published) and
 * 200 (already_published) count as success.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const CHANNEL = 'preview';
const MAX_RETRIES = 2;

export const DEFAULT_TARGETS = [
  { name: 'preview', url: 'https://api-preview.adhf.dev', tokenEnv: 'ADHDEV_PUBLISH_TOKEN_PREVIEW' },
  { name: 'prod', url: 'https://api.adhf.dev', tokenEnv: 'ADHDEV_PUBLISH_TOKEN' },
];

/**
 * The only registry origins a publish token may be sent to, each bound to its own token env.
 * A repo variable can choose among these targets but can never point a token at another host.
 */
export const ALLOWED_TARGETS = new Map([
  ['https://api-preview.adhf.dev', 'ADHDEV_PUBLISH_TOKEN_PREVIEW'],
  ['https://api.adhf.dev', 'ADHDEV_PUBLISH_TOKEN'],
]);

/** Server-supplied text before it reaches logs, workflow commands or the step summary. */
export function sanitizeText(v) {
  return String(v ?? '').replace(/[\r\n]+/g, ' ').replace(/::/g, ': :').replace(/[|`<>]/g, '').slice(0, 300);
}

/** Accepts origin, origin/api/v1 or origin/api/v1/registry; returns the registry mount URL. */
export function normalizeRegistryUrl(raw) {
  const u = new URL(String(raw).trim());
  if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
    throw new Error('registry URL must be https: ' + u.origin);
  }
  const path = u.pathname.replace(/\/+$/, '');
  if (path === '' || path === '/api/v1' || path === '/api/v1/registry') return u.origin + '/api/v1/registry';
  throw new Error('ambiguous registry URL path: ' + path);
}

export function parseTargets(env) {
  const raw = (env.ADHDEV_REGISTRY_TARGETS || '').trim();
  const list = raw ? JSON.parse(raw) : DEFAULT_TARGETS;
  if (!Array.isArray(list) || list.length === 0) throw new Error('ADHDEV_REGISTRY_TARGETS must be a non-empty JSON array');
  return list.map((t) => {
    if (!t || typeof t.url !== 'string' || typeof t.tokenEnv !== 'string') throw new Error('each target needs url and tokenEnv');
    // Only publish-token env names may be dereferenced, never arbitrary env.
    if (!/^ADHDEV_PUBLISH_TOKEN[A-Z0-9_]*$/.test(t.tokenEnv)) throw new Error('tokenEnv must match ADHDEV_PUBLISH_TOKEN*: ' + t.tokenEnv);
    const url = normalizeRegistryUrl(t.url);
    const origin = new URL(url).origin;
    const bound = ALLOWED_TARGETS.get(origin);
    if (!bound) throw new Error('registry origin is not allowed: ' + origin);
    if (bound !== t.tokenEnv) throw new Error('tokenEnv ' + t.tokenEnv + ' is not bound to ' + origin + ' (expected ' + bound + ')');
    return { name: sanitizeText(t.name || origin), url, tokenEnv: t.tokenEnv };
  });
}

export function inferTier(manifest) {
  if (manifest.overrides) return 'extended';
  if (manifest.compatibility?.some((c) => c.scriptDir) && !manifest.tui) return 'extended-legacy';
  if (manifest.tui && !manifest.overrides) return 'declarative-only';
  return 'verified';
}

/** Provider selection: category dirs, skip `_*`, optional single-type filter, v1 manifest first. */
export function listProviders(root, filter = '') {
  const out = [];
  for (const category of ['cli', 'ide', 'extension']) {
    let types;
    try { types = readdirSync(join(root, category)); } catch { continue; }
    for (const type of types) {
      if (type.startsWith('_')) continue;
      if (filter && type !== filter) continue;
      let path = null;
      for (const name of ['provider.v1.json', 'provider.json']) {
        const p = join(root, category, type, name);
        try { statSync(p); path = p; break; } catch { /* next */ }
      }
      if (path) out.push({ category, type, path });
    }
  }
  return out;
}

/** Newest commit that touched the artifact dir; its tree equals HEAD's for that dir. */
function lastTouchingCommit(root, relDir) {
  try {
    const sha = execFileSync('git', ['-C', root, 'log', '-n', '1', '--format=%H', '--', relDir], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : undefined;
  } catch { return undefined; }
}

async function post(fetchImpl, url, token, body) {
  let last;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(body),
      });
      let json = null;
      try { json = await resp.json(); } catch { /* non-JSON body */ }
      last = { status: resp.status, json };
      if ((resp.status === 429 || resp.status >= 500) && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      return last;
    } catch (error) {
      last = { status: 0, json: { error: String(error?.message || error) } };
      if (attempt < MAX_RETRIES) { await new Promise((r) => setTimeout(r, 500 * (attempt + 1))); continue; }
    }
  }
  return last;
}

/** Classify a registry response. Anything but published/already_published is a failure. */
export function classify(res) {
  if (res.status === 201 && res.json?.status !== 'already_published') return { ok: true, outcome: 'published' };
  if (res.status === 200 && res.json?.status === 'already_published') return { ok: true, outcome: 'already_published' };
  const code = res.json?.code ? ' ' + sanitizeText(res.json.code) : '';
  const msg = res.json?.error ? ' ' + sanitizeText(res.json.error) : '';
  return { ok: false, outcome: 'failed', detail: 'HTTP ' + res.status + code + msg };
}

export async function publishAll({ root, filter = '', env = process.env, fetchImpl = fetch, log = console.log, loadLib, validateCli }) {
  const targets = parseTargets(env);
  const providers = listProviders(root, filter);
  const rows = [];
  const warnings = [];
  let attempted = 0;
  if (providers.length === 0) {
    rows.push({ target: '-', provider: filter || '(any)', outcome: 'failed', detail: 'no providers selected' });
    return { rows, warnings, ok: false };
  }
  const { computeProviderTreeDigest, DIGEST_ALGORITHM } = await loadLib();

  for (const target of targets) {
    const token = (env[target.tokenEnv] || '').trim();
    if (!token) {
      const w = 'target "' + target.name + '" skipped: secret ' + target.tokenEnv + ' is not set';
      warnings.push(w);
      log('::warning::' + w);
      continue;
    }
    attempted++;
    for (const p of providers) {
      const manifest = JSON.parse(readFileSync(p.path, 'utf-8'));
      const version = manifest.providerVersion || '0.0.0';
      const relDir = p.category + '/' + p.type;
      let schemaValid = true;
      if (p.category === 'cli' && validateCli) schemaValid = validateCli(manifest);
      const body = {
        type: p.type,
        category: p.category,
        version,
        channel: CHANNEL,
        bundleDigest: computeProviderTreeDigest(relDir),
        digestAlgorithm: DIGEST_ALGORITHM,
        name: manifest.name || p.type,
        displayName: manifest.displayName || manifest.name || p.type,
        tier: inferTier(manifest),
        taintLevel: manifest._taintLevel || 'clean',
        schemaValid,
        manifest,
      };
      const sourceCommit = lastTouchingCommit(root, relDir);
      if (sourceCommit) body.sourceCommit = sourceCommit;

      let res = await post(fetchImpl, target.url + '/providers', token, body);
      // A publish-only key may not backfill sourceCommit on a legacy row (admin only);
      // retry without it so the idempotent check still runs.
      if (res.status === 403 && body.sourceCommit) {
        delete body.sourceCommit;
        res = await post(fetchImpl, target.url + '/providers', token, body);
      }
      const c = classify(res);
      const label = p.type + '@' + version;
      rows.push({ target: target.name, provider: label, outcome: c.outcome, detail: c.detail || '' });
      if (c.ok) log('  [' + target.name + '] ' + label + ' ' + c.outcome);
      else log('::error::[' + target.name + '] ' + label + ' publish rejected: ' + c.detail);
    }
  }
  if (attempted === 0) {
    rows.push({ target: '-', provider: '-', outcome: 'failed', detail: 'every target was skipped (no tokens configured); nothing published' });
  }
  return { rows, warnings, ok: rows.every((r) => r.outcome !== 'failed') };
}

export function renderSummary({ rows, warnings }) {
  const lines = ['## Registry publish (channel: ' + CHANNEL + ')', ''];
  for (const w of warnings) lines.push('- WARNING: ' + sanitizeText(w));
  lines.push('', '| target | provider | result | detail |', '|---|---|---|---|');
  for (const r of rows) lines.push('| ' + [r.target, r.provider, r.outcome, r.detail].map(sanitizeText).join(' | ') + ' |');
  const failed = rows.filter((r) => r.outcome === 'failed').length;
  lines.push('', failed ? 'FAILED: ' + failed + ' publish(es) rejected.' : 'All publishes succeeded or were already published.');
  return lines.join('\n') + '\n';
}

async function main() {
  const root = process.cwd();
  const ajvDir = process.env.AJV_DIR;
  let validateCli;
  if (ajvDir) {
    const req = createRequire(join(ajvDir, 'x.js'));
    const Ajv = req('ajv/dist/2020.js').default;
    const addFormats = req('ajv-formats').default;
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const v = ajv.compile(JSON.parse(readFileSync(join(root, 'schemas/v1/cli/provider.schema.json'), 'utf-8')));
    validateCli = (m) => {
      const ok = v(m);
      if (!ok) console.log('  schema errors:', v.errors?.map((e) => e.message).join(', '));
      return ok;
    };
  }
  const loadLib = () => import(pathToFileURL(resolve(root, 'scripts/lib/provider-channels.mjs')).href);
  const result = await publishAll({ root, filter: process.env.FILTER_TYPE || '', loadLib, validateCli });
  const summary = renderSummary(result);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error('::error::' + (error?.message || error)); process.exit(1); });
}

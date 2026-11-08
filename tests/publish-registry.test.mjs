import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classify, normalizeRegistryUrl, parseTargets, publishAll, CHANNEL } from '../scripts/publish-registry.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'pubreg-'));
  mkdirSync(join(root, 'cli/demo'), { recursive: true });
  writeFileSync(join(root, 'cli/demo/provider.json'), JSON.stringify({ type: 'demo', providerVersion: '1.2.3', tui: {} }));
  return root;
}
const loadLib = async () => ({ computeProviderTreeDigest: () => 'sha256:' + 'a'.repeat(64), DIGEST_ALGORITHM: 'x' });
const resp = (status, json) => async () => ({ status, json: async () => json });
const env = { ADHDEV_PUBLISH_TOKEN_PREVIEW: 't1', ADHDEV_PUBLISH_TOKEN: 't2' };
const quiet = () => {};

test('classify accepts only published and already_published', () => {
  assert.equal(classify({ status: 201, json: { status: 'published' } }).ok, true);
  assert.equal(classify({ status: 200, json: { status: 'already_published' } }).ok, true);
  assert.equal(classify({ status: 422, json: { code: 'REGISTRY_STABLE_PUBLISH_FORBIDDEN' } }).ok, false);
  assert.equal(classify({ status: 409, json: { code: 'REGISTRY_VERSION_CONFLICT' } }).ok, false);
});

test('normalizeRegistryUrl', () => {
  for (const u of ['https://h.dev', 'https://h.dev/api/v1', 'https://h.dev/api/v1/registry/']) {
    assert.equal(normalizeRegistryUrl(u), 'https://h.dev/api/v1/registry');
  }
  assert.throws(() => normalizeRegistryUrl('https://h.dev/x'));
  assert.throws(() => normalizeRegistryUrl('http://h.dev'));
});

test('parseTargets rejects arbitrary tokenEnv', () => {
  assert.throws(() => parseTargets({ ADHDEV_REGISTRY_TARGETS: '[{"url":"https://h.dev","tokenEnv":"PATH"}]' }));
  assert.equal(parseTargets({}).length, 2);
});

test('publishes channel=preview, never stable', async () => {
  const bodies = [];
  const fetchImpl = async (url, init) => { bodies.push(JSON.parse(init.body)); return { status: 201, json: async () => ({ status: 'published' }) }; };
  const r = await publishAll({ root: fixture(), env, fetchImpl, log: quiet, loadLib });
  assert.equal(r.ok, true);
  assert.equal(bodies.length, 2);
  assert.ok(bodies.every((b) => b.channel === CHANNEL && b.channel === 'preview'));
});

test('422 rejection fails the run', async () => {
  const r = await publishAll({ root: fixture(), env, fetchImpl: resp(422, { code: 'REGISTRY_STABLE_PUBLISH_FORBIDDEN', error: 'no' }), log: quiet, loadLib });
  assert.equal(r.ok, false);
  assert.ok(r.rows.some((x) => x.outcome === 'failed'));
});

test('already_published passes', async () => {
  const r = await publishAll({ root: fixture(), env, fetchImpl: resp(200, { status: 'already_published' }), log: quiet, loadLib });
  assert.equal(r.ok, true);
});

test('missing token skips with warning; all skipped fails', async () => {
  const some = await publishAll({ root: fixture(), env: { ADHDEV_PUBLISH_TOKEN_PREVIEW: 't' }, fetchImpl: resp(201, { status: 'published' }), log: quiet, loadLib });
  assert.equal(some.ok, true);
  assert.equal(some.warnings.length, 1);
  const none = await publishAll({ root: fixture(), env: {}, fetchImpl: resp(201, {}), log: quiet, loadLib });
  assert.equal(none.ok, false);
  assert.equal(none.warnings.length, 2);
});

test('a target cannot point a token at an unlisted origin or swap token bindings', async () => {
  const { parseTargets } = await import('../scripts/publish-registry.mjs');
  assert.throws(() => parseTargets({ ADHDEV_REGISTRY_TARGETS: JSON.stringify([{ url: 'https://evil.example', tokenEnv: 'ADHDEV_PUBLISH_TOKEN' }]) }), /not allowed/);
  assert.throws(() => parseTargets({ ADHDEV_REGISTRY_TARGETS: JSON.stringify([{ url: 'https://api.adhf.dev', tokenEnv: 'ADHDEV_PUBLISH_TOKEN_PREVIEW' }]) }), /not bound/);
});

test('server text is sanitized before logs and the step summary', async () => {
  const { classify, renderSummary } = await import('../scripts/publish-registry.mjs');
  const c = classify({ status: 422, json: { code: 'X', error: 'bad\n::error::injected | `x`' } });
  assert.ok(!c.detail.includes('\n') && !c.detail.includes('::error::') && !c.detail.includes('|'));
  const s = renderSummary({ rows: [{ target: 't', provider: 'p', outcome: 'failed', detail: 'a|b\nc' }], warnings: ['w\n::x'] });
  assert.ok(!s.includes('a|b') && !s.includes('w\n::x'));
});

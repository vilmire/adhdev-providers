#!/usr/bin/env node
/**
 * Generate channels/stable.json and channels/preview.json from the provider
 * artifacts tracked in this repo (Stage 1 — schema/data only).
 *
 * Source of truth: each artifact directory's provider.v1.json (preferred) or
 * provider.json legacy fallback (type, providerVersion, category,
 * compatibility) — the same v1-first precedence the daemon runtime and the
 * registry publish workflow use. Registry-only entries
 * without an artifact directory are excluded — they cannot carry a verifiable
 * canonical digest, and the channel schema fails closed rather than admitting
 * unverifiable digests.
 *
 * Stage 1 channel contents: preview holds every verified artifact; stable is
 * the same verified baseline, recorded as promoted from preview with the
 * identical bundleDigest (promotion copies, never rebuilds).
 *
 * Usage: node scripts/generate-channels.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DIGEST_ALGORITHM,
  REPO_ROOT,
  buildChannelEntry,
  indexProviderArtifacts,
} from './lib/provider-channels.mjs';

const publishedAt = new Date().toISOString();

const artifacts = [...indexProviderArtifacts().values()]
  .filter((a) => a.providerVersion && a.category)
  .sort((a, b) => (a.providerType < b.providerType ? -1 : 1));

if (artifacts.length === 0) {
  console.error('No provider artifacts found.');
  process.exit(1);
}

const previewEntries = artifacts.map((artifact) => buildChannelEntry(artifact, { publishedAt }));

// Stable = current known baseline: the same verified entries, promoted from
// preview with the identical digest (never rebuilt).
const stableEntries = previewEntries.map((entry) => ({
  ...entry,
  promotedFrom: {
    channel: 'preview',
    bundleDigest: entry.bundleDigest,
    promotedAt: publishedAt,
  },
}));

const manifest = (channel, providers) => ({
  $schema: 'https://registry.adhf.dev/schemas/v1/channels/channel-manifest.schema.json',
  schemaVersion: 1,
  channel,
  publishedAt,
  providers,
});

const channelsDir = resolve(REPO_ROOT, 'channels');
mkdirSync(channelsDir, { recursive: true });
writeFileSync(resolve(channelsDir, 'preview.json'), JSON.stringify(manifest('preview', previewEntries), null, 2) + '\n');
writeFileSync(resolve(channelsDir, 'stable.json'), JSON.stringify(manifest('stable', stableEntries), null, 2) + '\n');

console.log(`Wrote channels/preview.json and channels/stable.json (${artifacts.length} providers, digestAlgorithm ${DIGEST_ALGORITHM}).`);
console.log('Run `node scripts/validate-channels.mjs` to verify.');

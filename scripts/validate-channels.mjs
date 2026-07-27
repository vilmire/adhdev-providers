#!/usr/bin/env node
/**
 * Provider channel manifest validator (Stage 1 — schema/data only).
 *
 * Validates channel manifests against schemas/v1/channels/channel-manifest.schema.json
 * plus the semantic rules in scripts/lib/provider-channels.mjs (canonical
 * digest recomputation, duplicate/conflict detection, promotion provenance,
 * compatibility range checks, channel-in-path agreement).
 *
 * Exit code 0 on success, 1 on any validation failure.
 *
 * Usage:
 *   node scripts/validate-channels.mjs                      # all channels/*.json
 *   node scripts/validate-channels.mjs channels/stable.json # specific manifest(s)
 */

import { basename, resolve } from 'node:path';
import { CHANNELS, REPO_ROOT, validateChannelManifest } from './lib/provider-channels.mjs';

const requested = process.argv.slice(2);

let targets;
if (requested.length) {
  targets = requested.map((p) => resolve(p));
} else {
  targets = CHANNELS.map((channel) => resolve(REPO_ROOT, 'channels', `${channel}.json`));
}

let failed = 0;
for (const target of targets) {
  let errors;
  try {
    errors = validateChannelManifest(target);
  } catch (error) {
    errors = [`${error.message}`];
  }
  const rel = target.startsWith(REPO_ROOT) ? target.slice(REPO_ROOT.length + 1) : basename(target);
  if (errors.length === 0) {
    console.log(`✓ ${rel}`);
  } else {
    failed += 1;
    console.log(`✗ ${rel}`);
    for (const err of errors) console.log(`  ${err}`);
  }
}

console.log('');
console.log(`Total: ${targets.length} — passed: ${targets.length - failed} — failed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
